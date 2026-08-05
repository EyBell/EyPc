import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from 'node:fs'

const require_ = createRequire(import.meta.url)
const transcript = require_(resolve(process.cwd(), 'preload/claude/transcript.cjs'))
const settings = require_(resolve(process.cwd(), 'preload/claude/settings.cjs'))

const HOOK_COMMAND = '/data/eypc-claude-companion-hook.sh'
const STATUSLINE_COMMAND = '/data/eypc-claude-companion-statusline.sh'

function line(value: Record<string, unknown>): string {
  return `${JSON.stringify(value)}\n`
}

describe('transcript tail splitting', () => {
  it('drops the truncated first line of a mid-file tail', () => {
    const text = '{"type":"user","tim\n{"type":"assistant"}\n'
    expect(transcript.completeLines(text, false)).toEqual(['{"type":"assistant"}'])
    expect(transcript.completeLines(text, true)).toEqual(['{"type":"user","tim', '{"type":"assistant"}'])
  })

  it('drops a trailing partial line that is still being written', () => {
    const text = '{"a":1}\n{"b":2}\n{"c":'
    expect(transcript.completeLines(text, true)).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('tolerates an empty buffer', () => {
    expect(transcript.completeLines('', true)).toEqual([])
    expect(transcript.completeLines(null, false)).toEqual([])
  })
})

describe('transcript summarization', () => {
  const base = [
    { type: 'user', sessionId: 's1', cwd: '/w/app', gitBranch: 'main', version: '2.1.220', timestamp: '2026-08-05T03:00:00.000Z', message: { role: 'user', content: 'hi' } },
    { type: 'assistant', sessionId: 's1', timestamp: '2026-08-05T03:00:05.000Z', message: { model: 'claude-opus-5', content: [{ type: 'tool_use' }], usage: { input_tokens: 100, cache_read_input_tokens: 900 } } },
    { type: 'user', sessionId: 's1', timestamp: '2026-08-05T03:00:06.000Z', message: { content: [{ type: 'tool_result' }] } },
    { type: 'assistant', sessionId: 's1', timestamp: '2026-08-05T03:00:09.000Z', message: { model: 'claude-opus-5', content: [{ type: 'text' }], usage: { input_tokens: 120, cache_read_input_tokens: 1200 } } }
  ]

  it('extracts structural evidence only', () => {
    const summary = transcript.summarizeTranscriptEntries(base, { sessionId: 's1' })
    expect(summary).toMatchObject({
      sessionId: 's1',
      cwd: '/w/app',
      gitBranch: 'main',
      model: 'claude-opus-5',
      cliVersion: '2.1.220',
      turns: 1,
      toolCalls: 1,
      pendingToolUse: 0,
      contextTokens: 1320
    })
    expect(summary.lastPromptAt).toBe(Date.parse('2026-08-05T03:00:00.000Z'))
    expect(summary.lastAssistantAt).toBe(Date.parse('2026-08-05T03:00:09.000Z'))
  })

  it('carries no message text into the summary', () => {
    const serialized = JSON.stringify(transcript.summarizeTranscriptEntries(base, {}))
    expect(serialized).not.toContain('hi')
    expect(serialized).not.toContain('tool_use')
  })

  it('counts an unanswered tool call as pending', () => {
    const pending = transcript.summarizeTranscriptEntries([
      base[0],
      { type: 'assistant', timestamp: '2026-08-05T03:00:05.000Z', message: { content: [{ type: 'tool_use' }, { type: 'tool_use' }] } }
    ], {})
    expect(pending.pendingToolUse).toBe(2)
  })

  it('does not count a tool result as a user turn', () => {
    const summary = transcript.summarizeTranscriptEntries(base, {})
    expect(summary.turns).toBe(1)
  })

  it('ignores meta user entries', () => {
    const summary = transcript.summarizeTranscriptEntries([
      { type: 'user', isMeta: true, timestamp: '2026-08-05T03:00:00.000Z', message: { content: 'meta' } }
    ], {})
    expect(summary.turns).toBe(0)
  })

  it('detects sidechain topology', () => {
    const summary = transcript.summarizeTranscriptEntries([
      { type: 'assistant', isSidechain: true, parentSessionId: 'parent-1', timestamp: '2026-08-05T03:00:00.000Z', message: {} }
    ], {})
    expect(summary.isSidechain).toBe(true)
    expect(summary.parentSessionId).toBe('parent-1')
  })

  it('survives corrupt lines inside the tail', () => {
    const text = `${line(base[0])}not json at all\n${line(base[3])}`
    const summary = transcript.summarizeTranscriptText(text, { fromStart: true })
    expect(summary.turns).toBe(1)
    expect(summary.lastAssistantAt).toBeGreaterThan(0)
  })
})

describe('transcript reader against real files', () => {
  it('reads only the configured tail and still summarizes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eypc-claude-'))
    const file = join(dir, 'sess.jsonl')
    const filler = Array.from({ length: 400 }, (_, index) => line({
      type: 'assistant',
      timestamp: new Date(Date.parse('2026-08-05T00:00:00.000Z') + index * 1000).toISOString(),
      message: { model: 'claude-opus-5', content: [], usage: { input_tokens: index } }
    })).join('')
    writeFileSync(file, filler)
    const reader = transcript.createTranscriptReader({ fs, tailBytes: 4096 })
    const summary = reader.summarize(file, 'sess')
    expect(summary).not.toBeNull()
    expect(summary.sessionId).toBe('sess')
    expect(summary.bytes).toBe(statSync(file).size)
    expect(summary.lastAssistantAt).toBe(Date.parse('2026-08-05T00:06:39.000Z'))
  })

  it('returns null instead of throwing for a missing file', () => {
    const reader = transcript.createTranscriptReader({ fs })
    expect(reader.summarize('/definitely/not/here.jsonl', 'x')).toBeNull()
  })

  it('handles an empty transcript', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eypc-claude-'))
    const file = join(dir, 'empty.jsonl')
    writeFileSync(file, '')
    const reader = transcript.createTranscriptReader({ fs })
    const summary = reader.summarize(file, 'empty')
    expect(summary).toMatchObject({ sessionId: 'empty', turns: 0 })
    expect(summary.lastEventAt).toBeGreaterThan(0)
  })
})

describe('settings hook installation', () => {
  it('installs a handler for every subscribed event', () => {
    const next = settings.withEypcHooks({}, { command: HOOK_COMMAND })
    for (const event of settings.EYPC_HOOK_EVENTS) {
      expect(next.hooks[event]).toHaveLength(1)
      expect(next.hooks[event][0].hooks[0].command).toBe(HOOK_COMMAND)
    }
    expect(settings.hookInstallState(next, { command: HOOK_COMMAND })).toBe('installed')
  })

  it('is idempotent', () => {
    const once = settings.withEypcHooks({}, { command: HOOK_COMMAND })
    const twice = settings.withEypcHooks(once, { command: HOOK_COMMAND })
    expect(twice).toEqual(once)
  })

  it('preserves the user own hooks and unrelated settings', () => {
    const original = {
      model: 'opus',
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/user/guard.sh' }] }],
        PostCompact: [{ hooks: [{ type: 'command', command: '/user/compact.sh' }] }]
      }
    }
    const next = settings.withEypcHooks(original, { command: HOOK_COMMAND })
    expect(next.model).toBe('opus')
    expect(next.hooks.PreToolUse[0]).toEqual(original.hooks.PreToolUse[0])
    expect(next.hooks.PostCompact).toEqual(original.hooks.PostCompact)
    expect(next.hooks.PreToolUse).toHaveLength(2)
  })

  it('does not mutate the input object', () => {
    const original = { hooks: { Stop: [{ hooks: [{ type: 'command', command: '/user/stop.sh' }] }] } }
    const snapshot = JSON.stringify(original)
    settings.withEypcHooks(original, { command: HOOK_COMMAND })
    expect(JSON.stringify(original)).toBe(snapshot)
  })

  it('replaces its own stale handler after the command path changes', () => {
    const old = settings.withEypcHooks({}, { command: '/old/eypc-claude-companion-hook.sh' })
    expect(settings.hookInstallState(old, { command: HOOK_COMMAND })).toBe('outdated')
    const next = settings.withEypcHooks(old, { command: HOOK_COMMAND })
    expect(next.hooks.Stop).toHaveLength(1)
    expect(settings.hookInstallState(next, { command: HOOK_COMMAND })).toBe('installed')
  })

  it('reports a partial installation as outdated', () => {
    const next = settings.withEypcHooks({}, { command: HOOK_COMMAND })
    delete next.hooks.Notification
    expect(settings.hookInstallState(next, { command: HOOK_COMMAND })).toBe('outdated')
  })

  it('refuses an unidentifiable command', () => {
    expect(() => settings.withEypcHooks({}, { command: '/tmp/anonymous.sh' })).toThrow()
    expect(() => settings.withEypcHooks({}, { command: '' })).toThrow()
  })

  it('uninstalls exactly what it installed', () => {
    const original = {
      model: 'opus',
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/user/guard.sh' }] }] }
    }
    const installed = settings.withEypcHooks(original, { command: HOOK_COMMAND })
    const removed = settings.withoutEypcHooks(installed)
    expect(removed).toEqual(original)
    expect(settings.hookInstallState(removed, { command: HOOK_COMMAND })).toBe('missing')
  })

  it('drops the hooks key entirely when nothing else remains', () => {
    const removed = settings.withoutEypcHooks(settings.withEypcHooks({ model: 'opus' }, { command: HOOK_COMMAND }))
    expect(removed).toEqual({ model: 'opus' })
  })
})

describe('settings status line installation', () => {
  it('installs when no status line exists', () => {
    const next = settings.withEypcStatusline({}, { command: STATUSLINE_COMMAND })
    expect(next.statusLine).toEqual({ type: 'command', command: STATUSLINE_COMMAND })
    expect(settings.statuslineInstallState(next, { command: STATUSLINE_COMMAND })).toBe('installed')
    expect(settings.chainedStatusLineCommand(next)).toBe('')
  })

  it('remembers a user status line so the wrapper can chain to it', () => {
    const original = { statusLine: { type: 'command', command: '/user/statusline.sh', padding: 0 } }
    const next = settings.withEypcStatusline(original, { command: STATUSLINE_COMMAND })
    expect(next.statusLine.command).toBe(STATUSLINE_COMMAND)
    expect(next.statusLine.padding).toBe(0)
    expect(settings.chainedStatusLineCommand(next)).toBe('/user/statusline.sh')
  })

  it('restores the user status line on uninstall', () => {
    const original = { statusLine: { type: 'command', command: '/user/statusline.sh', padding: 0 } }
    const restored = settings.withoutEypcStatusline(settings.withEypcStatusline(original, { command: STATUSLINE_COMMAND }))
    expect(restored).toEqual(original)
  })

  it('removes the status line entirely when there was nothing before', () => {
    const restored = settings.withoutEypcStatusline(settings.withEypcStatusline({ model: 'opus' }, { command: STATUSLINE_COMMAND }))
    expect(restored).toEqual({ model: 'opus' })
  })

  it('does not re-chain its own command when installed twice', () => {
    const once = settings.withEypcStatusline({ statusLine: { type: 'command', command: '/user/statusline.sh' } }, { command: STATUSLINE_COMMAND })
    const twice = settings.withEypcStatusline(once, { command: STATUSLINE_COMMAND })
    expect(settings.chainedStatusLineCommand(twice)).toBe('/user/statusline.sh')
    expect(twice).toEqual(once)
  })

  it('leaves a user status line alone when the companion never installed one', () => {
    const original = { statusLine: { type: 'command', command: '/user/statusline.sh' } }
    expect(settings.withoutEypcStatusline(original)).toEqual(original)
    expect(settings.statuslineInstallState(original, { command: STATUSLINE_COMMAND })).toBe('missing')
  })

  it('detects a stale wrapper path', () => {
    const old = settings.withEypcStatusline({}, { command: '/old/eypc-claude-companion-statusline.sh' })
    expect(settings.statuslineInstallState(old, { command: STATUSLINE_COMMAND })).toBe('outdated')
  })

  it('refuses an unidentifiable status line command', () => {
    expect(() => settings.withEypcStatusline({}, { command: '/tmp/anonymous.sh' })).toThrow()
  })
})

describe('hook and status line install compose without interfering', () => {
  it('round-trips both together', () => {
    const original = {
      model: 'opus',
      statusLine: { type: 'command', command: '/user/statusline.sh' },
      hooks: { Stop: [{ hooks: [{ type: 'command', command: '/user/stop.sh' }] }] }
    }
    const installed = settings.withEypcStatusline(
      settings.withEypcHooks(original, { command: HOOK_COMMAND }),
      { command: STATUSLINE_COMMAND }
    )
    const removed = settings.withoutEypcStatusline(settings.withoutEypcHooks(installed))
    expect(removed).toEqual(original)
  })
})

describe('module shape', () => {
  it('ships every preload module the manifest will mirror', () => {
    const dir = resolve(process.cwd(), 'preload/claude')
    expect(existsSync(dir)).toBe(true)
    const files = readdirSync(dir).filter((name) => name.endsWith('.cjs')).sort()
    expect(files).toContain('transcript.cjs')
    expect(files).toContain('settings.cjs')
  })
})
