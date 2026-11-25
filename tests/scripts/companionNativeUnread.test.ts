import { mkdtempSync, readFileSync, readdirSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkCompanionNativeUnread } from '../../scripts/check-companion-native-unread.mjs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createCodexDesktopUnreadRecovery, codexDesktopFalsyReadAction, codexDesktopReadRevisionsEqual } = require('../../preload/codex/desktop-unread-evidence.cjs')
const { createCodexDesktopOpenObservation } = require('../../preload/codex/desktop-open-observation.cjs')

function recoveryHarness() {
  let time = 1000
  const unread = new Set(['a', 'b'])
  const requests: string[] = []
  const bridge: any = {
    state: 'connected', inventory: new Set(unread), sideShadows: new Map(),
    shadows: new Map([...unread].map(id => [id, { ownerClientId: 'owner', revision: 7, hasUnreadTurn: true, unreadEvidence: 'snapshot' }])),
    liveUnread: new Map(), persistedUnread: new Map(),
    followAny(id: string) { requests.push(id); return true }
  }
  const recovery = createCodexDesktopUnreadRecovery({ now: () => time, knownThread: (id: string) => ({ hasUnreadTurn: unread.has(id) }) })
  const fail = (fingerprint = 'a') => recovery.persistenceFailed(bridge, {
    unreadFailureReason: 'binding-unavailable', unreadSourceFingerprint: fingerprint.repeat(64)
  }, true)
  const receive = (id: string, revision: number, value?: boolean) => {
    const previous = bridge.shadows.get(id)
    if (!recovery.snapshotAllowed(bridge, id, { revision }, previous, 'owner')) return false
    const shadow = { ownerClientId: 'owner', revision, hasUnreadTurn: value, unreadEvidence: 'snapshot' }
    recovery.snapshotAccepted(bridge, id, shadow, previous, 'owner')
    bridge.shadows.set(id, shadow)
    return true
  }
  return { recovery, bridge, unread, requests, fail, receive, advance: () => { time += 6000 } }
}

describe('Codex unread recovery isolation', () => {
  it('refollows several unread tasks without opening or changing their native unread set', () => {
    const h = recoveryHarness()
    h.fail(); h.fail()
    expect(h.requests).toEqual(['a', 'b'])
    h.receive('a', 7, true); h.receive('b', 7, true)
    expect([...h.unread]).toEqual(['a', 'b'])
    expect([...h.bridge.shadows.values()].every((s: any) => s.hasUnreadTurn === true)).toBe(true)
  })
  it('accepts an explicit same-revision read for only its own task', () => {
    const h = recoveryHarness()
    h.fail()
    h.unread.delete('a') // synthetic native open, not caused by followAny
    h.receive('a', 7, false); h.receive('b', 7, true)
    expect(h.bridge.shadows.get('a').hasUnreadTurn).toBe(false)
    expect(h.bridge.shadows.get('b').hasUnreadTurn).toBe(true)
    expect([...h.unread]).toEqual(['b'])
  })
  it('never interprets a missing unread field as read', () => {
    const h = recoveryHarness()
    h.fail(); h.receive('a', 7)
    expect(h.bridge.shadows.get('a').hasUnreadTurn).not.toBe(false)
    expect([...h.unread]).toEqual(['a', 'b'])
  })
  it.each(['settled', 'expired', 'cleared'])('rejects an older snapshot after recovery is %s', mode => {
    const h = recoveryHarness()
    h.fail()
    if (mode === 'settled') h.receive('a', 8, true)
    if (mode === 'expired') h.advance()
    if (mode === 'cleared') h.recovery.clear(h.bridge)
    expect(h.receive('a', 6, false)).toBe(false)
    expect(h.bridge.shadows.get('a').hasUnreadTurn).toBe(true)
  })
  it('keeps a new exact unread event ahead of an in-flight read snapshot', () => {
    const h = recoveryHarness()
    h.fail()
    h.bridge.shadows.get('a').unreadEvidence = 'event'
    h.recovery.notificationAccepted(h.bridge, 'a')
    h.receive('a', 8, false)
    expect(h.bridge.shadows.get('a').hasUnreadTurn).toBe(true)
    expect(h.bridge.liveUnread.get('a').hasUnreadTurn).toBe(true)
  })
  it('does not compare revisions across owners or reject equal revisions', () => {
    const h = recoveryHarness()
    const previous = h.bridge.shadows.get('a')
    expect(h.recovery.snapshotAllowed(h.bridge, 'a', { revision: 1 }, previous, 'new-owner')).toBe(true)
    expect(h.recovery.snapshotAllowed(h.bridge, 'a', { revision: 7 }, previous, 'owner')).toBe(true)
  })
  it('coalesces source edges to one trailing recovery per task', async () => {
    const h = recoveryHarness()
    h.fail(); h.fail('b'); h.fail('c')
    expect(h.requests).toEqual(['a', 'b'])
    h.receive('a', 8, false); h.receive('b', 8, true)
    await Promise.resolve()
    expect(h.requests).toEqual(['a', 'b', 'a', 'b'])
    expect(h.bridge.shadows.get('a').hasUnreadTurn).toBe(true)
  })
})

describe('native read disposition', () => {
  const binding = { identityKey: 'a'.repeat(64), executionHostKey: 'local' }
  it('keeps a verified falsy read only for the exact completion', () => {
    expect(codexDesktopFalsyReadAction({
      hasUnreadTurn: false, version: 3, binding, currentCompletion: 't2',
      eventTurn: 't2', currentTurn: 't2', openVerdict: true
    })).toBe('apply')
    expect(codexDesktopFalsyReadAction({
      hasUnreadTurn: true, version: 1, currentCompletion: '', openVerdict: true
    })).toBe('apply')
  })
  it('rereads legacy, unversioned, mismatched and timed-out falsy reads', () => {
    expect(codexDesktopFalsyReadAction({
      hasUnreadTurn: false, version: 1, currentCompletion: 't2', openVerdict: true
    })).toBe('reread')
    expect(codexDesktopFalsyReadAction({
      hasUnreadTurn: false, version: undefined, currentCompletion: 't2', openVerdict: true
    })).toBe('reread')
    expect(codexDesktopFalsyReadAction({
      hasUnreadTurn: false, version: 3, binding, currentCompletion: '', openVerdict: true
    })).toBe('reread')
    expect(codexDesktopFalsyReadAction({
      hasUnreadTurn: false, version: 3, binding, currentCompletion: 't2', openVerdict: true
    })).toBe('reread')
    expect(codexDesktopFalsyReadAction({
      hasUnreadTurn: false, version: 3, binding, currentCompletion: 't2',
      eventTurn: 't1', currentTurn: 't2', openVerdict: true
    })).toBe('reread')
    expect(codexDesktopFalsyReadAction({
      hasUnreadTurn: false, version: 3, binding, currentCompletion: 't2', openVerdict: 'reread'
    })).toBe('reread')
    expect(codexDesktopFalsyReadAction({
      hasUnreadTurn: false, version: 3, binding, currentCompletion: 't2', openVerdict: false
    })).toBe('drop')
  })
  it('compares supported read revisions by opaque equality only', () => {
    expect(codexDesktopReadRevisionsEqual(2, 10)).toBe(false)
    expect(codexDesktopReadRevisionsEqual('rev-a', 'rev-a')).toBe(true)
    expect(codexDesktopReadRevisionsEqual('2', 2)).toBe(false)
    expect(codexDesktopReadRevisionsEqual(undefined, 'rev-a')).toBeNull()
    expect(codexDesktopFalsyReadAction({
      hasUnreadTurn: false, version: 3, binding, currentCompletion: 't2',
      eventRevision: 2, currentRevision: 10, openVerdict: true
    })).toBe('reread')
    expect(codexDesktopFalsyReadAction({
      hasUnreadTurn: false, version: 3, binding, currentCompletion: 't2',
      eventRevision: 'rev-b', currentRevision: 'rev-b'
    })).toBe('apply')
  })
  it('does not confirm a legacy falsy event or a timed-out previous completion', () => {
    let now = 1_000
    const observation = createCodexDesktopOpenObservation({
      record() {}, now: () => now, setTimer: () => 1, clearTimer() {}
    })
    const scope = { current: () => true, acceptsLive: () => true }
    observation.begin({ threadId: 'root', key: 'root', operationId: 'open', route: 'test', readScope: scope })(true)
    expect(observation.nativeRead('root', null)).toBe('reread')
    now += 4_000
    expect(observation.nativeRead('root', binding)).toBe(true)
  })
})

describe('Native Codex identity-scoped unread gate', () => {
  it('executes native/legacy source selection, identity isolation and live protocol acceptance', () => {
    expect(checkCompanionNativeUnread(resolve('preload'))).toBe(45)
  })
  it('rejects the obsolete live unread protocol policy', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'eypc-native-unread-'))
    try {
      for (const name of readdirSync(resolve('preload'))) {
        if (name !== 'index.js' && name !== 'codex') symlinkSync(resolve('preload', name), join(temporary, name))
      }
      mkdirSync(join(temporary, 'codex'))
      for (const name of readdirSync(resolve('preload/codex'))) {
        if (name !== 'desktop-protocol.cjs') symlinkSync(resolve('preload/codex', name), join(temporary, 'codex', name))
      }
      const source = readFileSync(resolve('preload/codex/desktop-protocol.cjs'), 'utf8')
      const currentVersion = "'thread-read-state-changed': 3"
      expect(source.includes(currentVersion)).toBe(true)
      writeFileSync(join(temporary, 'codex/desktop-protocol.cjs'), source.replace(currentVersion, "'thread-read-state-changed': 2"))
      writeFileSync(join(temporary, 'preload.js'), readFileSync(resolve('preload/index.js'), 'utf8'))
      expect(() => checkCompanionNativeUnread(temporary)).toThrow()
    } finally { rmSync(temporary, { recursive: true, force: true }) }
  })
  it('rejects trusting migration when several identities exist', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'eypc-native-unread-'))
    try {
      mkdirSync(join(temporary, 'codex'))
      symlinkSync(resolve('preload/companion'), join(temporary, 'companion'))
      symlinkSync(resolve('preload/codex/desktop-request-projection.cjs'), join(temporary, 'codex/desktop-request-projection.cjs'))
      const source = readFileSync(resolve('preload/codex/desktop-unread-evidence.cjs'), 'utf8')
      const guard = 'keys.length !== 1'
      expect(source.includes(guard), 'migration identity guard must exist in its production owner').toBe(true)
      writeFileSync(join(temporary, 'codex/desktop-unread-evidence.cjs'), source.replace(guard, 'keys.length < 1'))
      writeFileSync(join(temporary, 'preload.js'), readFileSync(resolve('preload/index.js'), 'utf8'))
      expect(() => checkCompanionNativeUnread(temporary)).toThrow()
    } finally { rmSync(temporary, { recursive: true, force: true }) }
  })
  it.each([
    ['Side pending question after aborted generation', 'const pendingSideTurn = shadow.sideConversation === true', 'const pendingSideTurn = false', 'codex/desktop-shadow.cjs'],
    ['Desktop-only relation proof', '|| codexDesktopSideRelations.get(row.threadId) === parentThreadId', '|| false'],
    ['Side request ownership', 'const taskKey = threadId === parentThreadId ? known.key : `codex-child:${branchRef}`', 'const taskKey = known.key', 'codex/desktop-request-projection.cjs'],
    ['parent completion cache used for Side', 'if (queryThreadId === threadId\n        && !refresh.verifyStaleActive', 'if (!refresh.verifyStaleActive'],
    ['activity-only request replay', 'memberInteractions.push(...evidence.interactions)', 'memberInteractions.push()'],
    ['Side epoch borrowed from parent', '|| (main ? timestampMs(known.lastTurnStartedAt) : 0)', '|| timestampMs(known.lastTurnStartedAt)', 'codex/desktop-activity-resolution.cjs'],
    ['cold idle Side verification', 'const settledSide = shadow.sideConversation === true', 'const settledSide = false', 'codex/desktop-activity-resolution.cjs'],
    ['inactive member exact terminal readiness', 'settledSide || finalAttempt', 'finalAttempt', 'codex/desktop-activity-resolution.cjs']
  ])('rejects losing %s', (name, before, after, file = 'index.js') => {
    const temporary = mkdtempSync(join(tmpdir(), 'eypc-native-side-'))
    try {
      mkdirSync(join(temporary, 'codex'))
      symlinkSync(resolve('preload/companion'), join(temporary, 'companion'))
      for (const name of readdirSync(resolve('preload/codex'))) {
        if (`codex/${name}` !== file) symlinkSync(resolve('preload/codex', name), join(temporary, 'codex', name))
      }
      const source = readFileSync(resolve('preload', file), 'utf8')
      expect(source.includes(before), `${name} mutation target must exist in ${file}`).toBe(true)
      if (file !== 'index.js') writeFileSync(join(temporary, 'preload.js'), readFileSync(resolve('preload/index.js'), 'utf8'))
      writeFileSync(join(temporary, file === 'index.js' ? 'preload.js' : file), source.replace(before, after))
      expect(() => checkCompanionNativeUnread(temporary)).toThrow(name === 'cold idle Side verification'
        ? /cold idle Side requires its own bounded Turn verification/
        : undefined)
    } finally { rmSync(temporary, { recursive: true, force: true }) }
  })

})

describe('Native Codex open experiment', () => {
  it('prepares ten balanced pairs and targets the same verified application once per explicit dispatch', async () => {
    let app = { path: '/Applications/Synthetic Codex.app', pid: 42, foreground: false }
    let clock = 10_000
    let appReads = 0
    const launches: string[][] = []
    const events: Record<string, unknown>[] = []
    const experiment = createCodexDesktopOpenObservation({
      record: (event: Record<string, unknown>) => events.push(event),
      platform: 'darwin', pairedBenchmark: true, now: () => clock,
      readMacApp: async () => { appReads += 1; return app },
      execFile: (file: string, args: string[], _options: unknown, callback: (error: Error | null) => void) => {
        launches.push([file, ...args])
        callback(null)
      }
    })
    const threadId = '12345678-1234-4234-8234-123456789abc'
    const target = `codex://threads/${threadId}`
    const key = 'a'.repeat(32)
    const options = (operationId: string) => ({ operationId, key })
    const arm = (operationId: string, secondArm = false) => {
      expect(experiment.controlBenchmark({ action: 'arm', startRef: 'starting-chat', targetKey: key }))
        .toMatchObject({ armed: true })
      expect(experiment.selectBenchmarkTarget('local-shortcut', 'local')).toBeUndefined()
      expect(experiment.selectBenchmarkTarget('global-shortcut', operationId)).toBe(secondArm ? key : undefined)
    }
    expect(experiment.selectBenchmarkTarget('global-shortcut', 'ordinary')).toBeUndefined()
    await expect(experiment.prepareBenchmarkTrial(threadId, options('ordinary'))).resolves.toBeNull()
    expect(appReads).toBe(0)
    arm('abandoned')
    const abandoned = await experiment.prepareBenchmarkTrial(threadId, options('abandoned'))
    const pairs: string[] = []
    for (let index = 0; index < 20; index += 1) {
      const operationId = `op-${index}`
      arm(operationId, index % 2 === 1)
      await expect(experiment.prepareBenchmarkTrial(threadId, options('ordinary'))).resolves.toBeNull()
      const trial = await experiment.prepareBenchmarkTrial(threadId, options(operationId))
      expect(trial).toMatchObject({ ready: true, app, pair: Math.floor(index / 2) + 1 })
      expect(trial.start()).toBe(true)
      expect(trial.start()).toBe(false)
      pairs.push(trial.arm)
      const observed = experiment.begin({ threadId, key, operationId, pair: trial.pair, arm: trial.arm })
      await trial.open?.(target)
      observed(true)
      clock += trial.arm === 'explicit' ? 70 : 100
      expect(experiment.controlBenchmark({ action: 'observe', operationId, visibility: 'observed', observedAt: clock }))
        .toMatchObject({ attempts: index + 1 })
      if (index === 0) {
        expect(abandoned.start()).toBe(false)
        expect(experiment.controlBenchmark({ action: 'arm', startRef: 'another-chat', targetKey: key }))
          .toMatchObject({ errorCode: 'benchmark-pair-mismatch' })
        const otherThread = '22345678-1234-4234-8234-123456789abc'
        arm('wrong-thread', true)
        await expect(experiment.prepareBenchmarkTrial(otherThread, options('wrong-thread')))
          .resolves.toMatchObject({ ready: false, errorCode: 'benchmark-pair-mismatch' })
        app = { ...app, foreground: true }
        arm('wrong-foreground', true)
        await expect(experiment.prepareBenchmarkTrial(threadId, options('wrong-foreground')))
          .resolves.toMatchObject({ ready: false, errorCode: 'benchmark-pair-mismatch' })
        app = { ...app, foreground: false }
      }
    }
    expect(pairs.join(',')).toBe(Array.from({ length: 5 }, () => 'default,explicit,explicit,default').join(','))
    expect(launches).toEqual(Array.from({ length: 10 }, () => ['/usr/bin/open', '-a', app.path, target]))
    expect(events.filter(event => event.event === 'codex-open-target-visible' && event.outcome === 'observed')).toHaveLength(20)
    expect(events.find(event => event.outcome === 'observed')).toMatchObject({ operationId: 'op-0', durationMs: 100 })
    expect(experiment.controlBenchmark({ action: 'status' })).toMatchObject({
      explicitEligible: true,
      defaultRoute: { count: 10, medianMs: 100, p90Ms: 100 },
      explicitRoute: { count: 10, medianMs: 70, p90Ms: 70 }
    })
    expect(experiment.controlBenchmark({ action: 'arm', startRef: 'starting-chat', targetKey: key }))
      .toMatchObject({ errorCode: 'benchmark-reset-required' })
    expect(createCodexDesktopOpenObservation({ record: () => undefined, platform: 'darwin' }).prepareBenchmarkTrial).toBeNull()
  })

  it('requires a reset after the application process changes and ignores prior trial observations', async () => {
    let pid = 42
    const experiment = createCodexDesktopOpenObservation({
      record: () => undefined, platform: 'darwin', pairedBenchmark: true, execFile: () => undefined,
      readMacApp: async () => ({ path: '/Applications/Synthetic Codex.app', pid, foreground: false })
    })
    const threadId = '12345678-1234-4234-8234-123456789abc'
    const key = 'a'.repeat(32)
    const claim = (operationId: string) => {
      expect(experiment.controlBenchmark({ action: 'arm', startRef: 'start', targetKey: key })).toMatchObject({ armed: true })
      experiment.selectBenchmarkTarget('global-shortcut', operationId)
      return experiment.prepareBenchmarkTrial(threadId, { operationId, key })
    }
    const first = await claim('first')
    expect(first.start()).toBe(true)
    pid += 1
    await expect(claim('replaced')).resolves.toMatchObject({ ready: false, errorCode: 'benchmark-application-unavailable' })
    expect(experiment.controlBenchmark({ action: 'status' })).toMatchObject({ attempts: 1, resetRequired: true, armed: false })
    expect(experiment.controlBenchmark({ action: 'reset' })).toMatchObject({ attempts: 0, trials: [], resetRequired: false })
    expect(experiment.controlBenchmark({ action: 'observe', operationId: 'first', visibility: 'timeout' }))
      .toMatchObject({ errorCode: 'benchmark-observation-unavailable' })
    await expect(claim('new-run')).resolves.toMatchObject({ ready: true, pair: 1, arm: 'default', app: { pid } })
  })

  it('assigns a frame to only its dispatch interval and retains earlier exact evidence after invalidation', async () => {
    let clock = 10_000
    const experiment = createCodexDesktopOpenObservation({
      record: () => undefined, platform: 'darwin', pairedBenchmark: true, execFile: () => undefined, now: () => clock,
      readMacApp: async () => ({ path: '/Applications/Synthetic Codex.app', pid: 42, foreground: false })
    })
    const threadId = '12345678-1234-4234-8234-123456789abc'
    const key = 'a'.repeat(32)
    const start = async (operationId: string) => {
      experiment.controlBenchmark({ action: 'arm', startRef: 'start', targetKey: key })
      experiment.selectBenchmarkTarget('global-shortcut', operationId)
      const trial = await experiment.prepareBenchmarkTrial(threadId, { operationId, key })
      expect(trial.start()).toBe(true)
      experiment.begin({ threadId, key, operationId, pair: trial.pair, arm: trial.arm })(true)
    }
    await start('first')
    clock = 10_100
    await start('second')
    clock = 10_500
    experiment.clear()
    clock = 10_550
    const observe = (operationId: string, observedAt: number) =>
      experiment.controlBenchmark({ action: 'observe', operationId, visibility: 'observed', observedAt })

    expect(observe('first', 10_100)).toMatchObject({ errorCode: 'benchmark-observation-time-invalid' })
    expect(observe('second', 10_500)).toMatchObject({ errorCode: 'benchmark-observation-time-invalid' })
    expect(observe('first', 10_090)).toMatchObject({ trials: expect.arrayContaining([{ operationId: 'first',
      pair: 1, arm: 'default', dispatchAt: 10_000, dispatchOutcome: 'dispatched', visibility: 'observed', visibleMs: 90 }]) })
    expect(observe('second', 10_200)).toMatchObject({ trials: expect.arrayContaining([{ operationId: 'second',
      pair: 1, arm: 'explicit', dispatchAt: 10_100, dispatchOutcome: 'dispatched', visibility: 'observed', visibleMs: 100 }]) })
  })
})
