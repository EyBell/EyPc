import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import vm from 'node:vm'

export function checkCompanionDiagnosticPrivacy(source) {
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
  return 2
}
