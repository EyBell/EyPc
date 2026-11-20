import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import vm from 'node:vm'

export function checkCompanionDiagnosticPrivacy(source, codexDiagnosticsSource) {
  for (const event of ['desktop-resubscribe', 'desktop-replacement-snapshot']) {
    const end = source.indexOf(`event: '${event}'`)
    assert(end >= 0, `${event}: diagnostic remains present`)
    const owner = source.lastIndexOf('recordCompanionDiagnosticEvent({', end)
    const raw = source.lastIndexOf('runtimeDiagnostics.record({', end)
    assert(owner > raw && end - owner < 300, `${event}: use the existing anonymous diagnostic owner`)
  }
  const begin = source.indexOf('function companionDiagnosticTaskRef(')
  const end = source.indexOf('function recordCompanionStateDecision(', begin)
  assert(begin >= 0 && end > begin, 'existing diagnostic owner is available')
  const events = []
  const context = { crypto, COMPANION_DIAGNOSTIC_TASK_SALT: 'synthetic-session-salt',
    codexRecord: value => value && typeof value === 'object' ? value : {},
    runtimeDiagnostics: { record: event => events.push(event) } }
  vm.createContext(context)
  vm.runInContext(source.slice(begin, end), context)
  for (const event of ['desktop-resubscribe', 'desktop-replacement-snapshot']) {
    context.recordCompanionDiagnosticEvent({ provider: 'codex', taskRef: 'synthetic-private-task',
      event, outcome: 'refollowed', details: { shadowRetained: true } })
  }
  assert.match(events[0].taskRef, /^h:[a-f0-9]{16}$/)
  assert.equal(events[0].taskRef, events[1].taskRef, 'both events remain correlatable in this process')
  assert(!JSON.stringify(events).includes('synthetic-private-task'), 'raw identity does not cross the diagnostic boundary')
  assert.equal(events[1].details.shadowRetained, true, 'recovery evidence remains unchanged')

  const module = { exports: {} }
  vm.runInNewContext(codexDiagnosticsSource, { module })
  let now = 1_000
  const syncEvents = []
  const diagnostics = module.exports.createCodexRuntimeDiagnostics({
    runtimeDiagnostics: { record: event => syncEvents.push(event) },
    now: () => now
  })
  const taskRef = events[0].taskRef
  const frame = { outcome: 'snapshot', streamRevision: 12, phase: 'inProgress',
    turnStartedAt: 100, receivedAt: 900, unsafe: 'synthetic-private-task' }
  diagnostics.syncStage('synthetic-private-task', 'stream-received', frame)
  Object.assign(context, {
    codexRuntimeDiagnostics: diagnostics, validCodexThreadId: value => value === 'synthetic-private-task',
    codexThreadKey: value => value, codexTimestampMs: value => Number(value) || 0
  })
  const shadow = { revision: 12, currentCanonicalTurn: { startedAt: 100, status: 'inProgress' } }
  context.recordCodexStreamSync('synthetic-private-task', shadow, 'snapshot', 900)
  context.recordCodexStreamSync('synthetic-private-task', { ...shadow, revision: 13 }, 'patches', 920)
  const completed = { revision: 14, currentCanonicalTurn: { startedAt: 100, status: 'completed' } }
  context.recordCodexStreamSync('synthetic-private-task', completed, 'patches', 940)
  diagnostics.syncStage(taskRef, 'stream-received', { ...frame, turnStartedAt: 200 })
  diagnostics.syncStage(taskRef, 'inventory-admitted', { outcome: 'admitted', turnStartedAt: 200 })
  diagnostics.syncStage(taskRef, 'package-published', { outcome: 'published', phase: 'completed', turnStartedAt: 200, packageRevision: 37 })
  assert.equal(syncEvents.length, 5, 'repeat frames are coalesced without suppressing same-turn completion or the next turn')
  assert.deepEqual(syncEvents.slice(0, 2).map(({ details }) => [details.phase, details.turnStartedAt, details.receivedAt]),
    [['inProgress', 100, 900], ['completed', 100, 940]], 'both phases use current frame data and their own ingress time')
  assert(syncEvents.every(event => event.taskRef === taskRef), 'stages share the same anonymous task reference')
  assert.equal(syncEvents[4].details.packageRevision, 37, 'publish can be matched to the Float package revision')
  assert(!JSON.stringify(syncEvents).includes('synthetic-private-task'), 'sync trace only emits allowlisted fields')
  now += 120_000
  diagnostics.syncStage(taskRef, 'stream-received', frame)
  assert.equal(syncEvents.length, 6, 'the diagnostic window can begin again')
  diagnostics.resetStateEvidence()
  diagnostics.syncStage(taskRef, 'stream-received', frame)
  assert.equal(syncEvents.length, 7, 'connection reset discards prior trace deduplication')
  return 9
}
