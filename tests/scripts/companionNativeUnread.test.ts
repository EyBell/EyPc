import { mkdtempSync, readFileSync, readdirSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkCompanionNativeUnread } from '../../scripts/check-companion-native-unread.mjs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createCodexDesktopUnreadRecovery } = require('../../preload/codex/desktop-unread-evidence.cjs')

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

describe('Native Codex identity-scoped unread gate', () => {
  it('executes native/legacy source selection, identity isolation and live protocol acceptance', () => {
    expect(checkCompanionNativeUnread(resolve('preload'))).toBe(23)
  })
  it('rejects the obsolete live unread protocol policy', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'eypc-native-unread-'))
    try {
      for (const name of readdirSync(resolve('preload'))) {
        if (name !== 'index.js') symlinkSync(resolve('preload', name), join(temporary, name))
      }
      const source = readFileSync(resolve('preload/index.js'), 'utf8')
      writeFileSync(join(temporary, 'preload.js'), source.replace("'thread-read-state-changed': 3", "'thread-read-state-changed': 2"))
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
