import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const policy = require_(resolve(process.cwd(), 'preload/timing-policy.cjs')) as {
  WATCHER_RECOVERY_INTERVAL_MS: number
  DEFAULT_COALESCE_MS: number
}

// One policy, one definition. Six separate `1000`s across five files used to
// encode the same "recover a dropped notification" contract, so changing it
// meant finding every copy and a missed one drifted silently.
describe('timing policy has a single owner', () => {
  const groupModules = [
    'preload/claude/code-sessions.cjs',
    'preload/claude/app-state.cjs',
    'preload/claude/unread.cjs',
    'preload/claude/events.cjs',
    'preload/companion/navigation.cjs'
  ]

  it('states the recovery interval and coalesce window exactly once', () => {
    for (const relative of groupModules) {
      const source = readFileSync(resolve(process.cwd(), relative), 'utf8')
      expect(source, relative).toContain("require('../timing-policy.cjs')")
      expect(source, relative).not.toMatch(/RECOVERY_POLL_MS = 1000/)
      expect(source, relative).not.toMatch(/DEFAULT_COALESCE_MS = 0/)
    }
  })

  it('keeps every consumer on the same recovery interval', () => {
    const codeSessions = require_(resolve(process.cwd(), 'preload/claude/code-sessions.cjs')) as Record<string, number>
    const appState = require_(resolve(process.cwd(), 'preload/claude/app-state.cjs')) as Record<string, number>
    const unread = require_(resolve(process.cwd(), 'preload/claude/unread.cjs')) as Record<string, number>
    const events = require_(resolve(process.cwd(), 'preload/claude/events.cjs')) as Record<string, number>
    const navigation = require_(resolve(process.cwd(), 'preload/companion/navigation.cjs')) as Record<string, number>

    expect(codeSessions.CODE_RECOVERY_POLL_MS).toBe(policy.WATCHER_RECOVERY_INTERVAL_MS)
    expect(appState.LOG_RECOVERY_POLL_MS).toBe(policy.WATCHER_RECOVERY_INTERVAL_MS)
    expect(unread.UNREAD_RECOVERY_POLL_MS).toBe(policy.WATCHER_RECOVERY_INTERVAL_MS)
    expect(events.DEFAULT_RECOVERY_POLL_MS).toBe(policy.WATCHER_RECOVERY_INTERVAL_MS)
    expect(events.DEFAULT_COALESCE_MS).toBe(policy.DEFAULT_COALESCE_MS)
    expect(navigation.DEFAULT_COALESCE_MS).toBe(policy.DEFAULT_COALESCE_MS)
  })

  // The main preload entry never performs an unguarded local require — a throw
  // there takes down the whole bridge — so its two literals are held in step
  // here instead of by an import.
  it('holds the entry literals in step with the policy', () => {
    const source = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const literals = [...source.matchAll(/const CODEX_\w*RECOVERY_INTERVAL_MS = ([\d_]+)/g)]
      .map((match) => Number(match[1].replace(/_/g, '')))
    expect(literals).toHaveLength(2)
    for (const literal of literals) expect(literal).toBe(policy.WATCHER_RECOVERY_INTERVAL_MS)
  })
})
