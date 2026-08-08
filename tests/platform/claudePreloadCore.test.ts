import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const settings = require_(resolve(process.cwd(), 'preload/claude/settings.cjs'))

const HOOK_COMMAND = '/data/eypc-claude-companion-hook.sh'
const STATUSLINE_COMMAND = '/data/eypc-claude-companion-statusline.sh'

describe('settings hook installation', () => {
  it('installs one handler for every subscribed event', () => {
    const next = settings.withEypcHooks({}, { command: HOOK_COMMAND })
    for (const event of settings.EYPC_HOOK_EVENTS) {
      expect(next.hooks[event]).toHaveLength(1)
      expect(next.hooks[event][0].hooks[0].command).toBe(HOOK_COMMAND)
    }
    expect(settings.hookInstallState(next, { command: HOOK_COMMAND })).toBe('installed')
  })

  it('is idempotent and preserves user-owned hooks', () => {
    const original = {
      model: 'opus',
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/user/guard.sh' }] }],
        PostCompact: [{ hooks: [{ type: 'command', command: '/user/compact.sh' }] }]
      }
    }
    const once = settings.withEypcHooks(original, { command: HOOK_COMMAND })
    const twice = settings.withEypcHooks(once, { command: HOOK_COMMAND })
    expect(twice).toEqual(once)
    expect(twice.hooks.PreToolUse[0]).toEqual(original.hooks.PreToolUse[0])
    expect(twice.hooks.PostCompact).toEqual(original.hooks.PostCompact)
    expect(original.hooks.PreToolUse).toHaveLength(1)
  })

  it('replaces its stale handler and removes exactly its own handlers', () => {
    const original = {
      model: 'opus',
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/user/guard.sh' }] }] }
    }
    const old = settings.withEypcHooks(original, { command: '/old/eypc-claude-companion-hook.sh' })
    expect(settings.hookInstallState(old, { command: HOOK_COMMAND })).toBe('outdated')
    const next = settings.withEypcHooks(old, { command: HOOK_COMMAND })
    expect(settings.hookInstallState(next, { command: HOOK_COMMAND })).toBe('installed')
    expect(settings.withoutEypcHooks(next)).toEqual(original)
  })

  it('refuses a command that is not an identifiable EyPc hook', () => {
    expect(() => settings.withEypcHooks({}, { command: '/tmp/anonymous.sh' })).toThrow()
    expect(() => settings.withEypcHooks({}, { command: '' })).toThrow()
  })
})

describe('settings status line installation', () => {
  it('installs, chains and restores one user status line', () => {
    const original = { statusLine: { type: 'command', command: '/user/statusline.sh', padding: 0 } }
    const once = settings.withEypcStatusline(original, { command: STATUSLINE_COMMAND })
    const twice = settings.withEypcStatusline(once, { command: STATUSLINE_COMMAND })
    expect(twice).toEqual(once)
    expect(settings.chainedStatusLineCommand(twice)).toBe('/user/statusline.sh')
    expect(settings.withoutEypcStatusline(twice)).toEqual(original)
  })

  it('composes with hooks without changing unrelated settings', () => {
    const original = {
      model: 'opus',
      statusLine: { type: 'command', command: '/user/statusline.sh' },
      hooks: { Stop: [{ hooks: [{ type: 'command', command: '/user/stop.sh' }] }] }
    }
    const installed = settings.withEypcStatusline(
      settings.withEypcHooks(original, { command: HOOK_COMMAND }),
      { command: STATUSLINE_COMMAND }
    )
    expect(settings.withoutEypcStatusline(settings.withoutEypcHooks(installed))).toEqual(original)
  })
})

describe('production module shape', () => {
  it('ships the Code-mode authorities and no transcript inventory module', () => {
    const directory = resolve(process.cwd(), 'preload/claude')
    expect(existsSync(directory)).toBe(true)
    const files = readdirSync(directory).filter((name) => name.endsWith('.cjs')).sort()
    expect(files).toEqual(expect.arrayContaining([
      'app-paths.cjs',
      'app-state.cjs',
      'code-sessions.cjs',
      'events.cjs',
      'index.cjs',
      'open.cjs',
      'plan-usage.cjs',
      'quota.cjs',
      'scripts.cjs',
      'settings.cjs',
      'unread.cjs'
    ]))
    expect(files).not.toContain('transcript.cjs')
    expect(files).not.toContain('desktop.cjs')
  })
})
