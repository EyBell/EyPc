import { mkdtempSync, readFileSync, readdirSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkCompanionNativeUnread } from '../../scripts/check-companion-native-unread.mjs'

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
