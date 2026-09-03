import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const settings = require_(resolve(process.cwd(), 'preload/cursor/settings.cjs'))
const scripts = require_(resolve(process.cwd(), 'preload/cursor/scripts.cjs'))
const events = require_(resolve(process.cwd(), 'preload/cursor/events.cjs'))
const bridgeModule = require_(resolve(process.cwd(), 'preload/cursor/index.cjs'))

const HOOK_COMMAND = "'/data/eypc-cursor-companion-hook.sh'"
const SESSION = '86e0370a-21b3-434d-a1a3-0ce83edc5ddd'

describe('cursor hook settings', () => {
  it('installs a flat command handler for every subscribed event and never sets failClosed', () => {
    const next = settings.withEypcHooks({}, { command: HOOK_COMMAND })
    expect(next.version).toBe(1)
    for (const event of settings.EYPC_HOOK_EVENTS) {
      expect(next.hooks[event]).toHaveLength(1)
      expect(next.hooks[event][0].command).toBe(HOOK_COMMAND)
      expect(next.hooks[event][0].failClosed).toBeUndefined()
    }
    expect(settings.hookInstallState(next, { command: HOOK_COMMAND })).toBe('installed')
  })

  it('is idempotent, preserves user handlers, and replaces a stale command', () => {
    const original = {
      version: 1,
      hooks: {
        stop: [{ command: '/user/stop.sh' }]
      }
    }
    const once = settings.withEypcHooks(original, { command: HOOK_COMMAND })
    const twice = settings.withEypcHooks(once, { command: HOOK_COMMAND })
    expect(twice).toEqual(once)
    expect(twice.hooks.stop[0]).toEqual(original.hooks.stop[0])
    const stale = settings.withEypcHooks(original, { command: "'/old/eypc-cursor-companion-hook.sh'" })
    expect(settings.hookInstallState(stale, { command: HOOK_COMMAND })).toBe('outdated')
    expect(settings.withoutEypcHooks(settings.withEypcHooks(stale, { command: HOOK_COMMAND }))).toEqual(original)
  })

  it('coerces invalid loop_limit so Cursor can parse the whole user hooks file', () => {
    const original = {
      version: 1,
      hooks: {
        stop: [{ command: './hooks/apply-session-title.sh', timeout: 8, loop_limit: 0 }]
      }
    }
    const next = settings.withEypcHooks(original, { command: HOOK_COMMAND })
    expect(next.hooks.stop[0].loop_limit).toBe(1)
    expect(next.hooks.stop[0].command).toBe('./hooks/apply-session-title.sh')
    expect(next.hooks.stop[0].timeout).toBe(8)
    expect(settings.withoutEypcHooks(next).hooks.stop[0].loop_limit).toBe(1)
  })

  it('refuses a command without the EyPc marker', () => {
    expect(() => settings.withEypcHooks({}, { command: '/tmp/anonymous.sh' })).toThrow()
    expect(() => settings.withEypcHooks({}, { command: '' })).toThrow()
  })
})

describe('cursor hook script', () => {
  it('fails open and never copies transcript or prompt fields', () => {
    const source = scripts.hookScript({ queuePath: '/tmp/eypc-cursor-events.jsonl' })
    expect(source).toContain(settings.EYPC_MARKER)
    expect(source).toContain('exit 0')
    expect(source).not.toContain('transcript_path')
    expect(source).not.toContain('user_email')
    expect(source).not.toContain('tool_input')
    expect(source).not.toContain('agent_message')
    expect(source).not.toMatch(/\bprompt\b/)
    expect(source).toContain('dd bs=1024 count=32')
    expect(source).not.toContain('INPUT=$(cat')
  })
})

describe('cursor hook reducer', () => {
  it('keeps only exact topology identity and drops all content fields', () => {
    const entry = events.normalizeQueueEntry({
      s: SESSION,
      e: 'subagentStart',
      t: 1000,
      p: 1,
      m: 'agent',
      g: 'generation_1',
      a: 'subagent_1',
      q: SESSION,
      transcript: 'private transcript',
      summary: 'private summary',
      body: 'private body'
    })
    expect(entry).toEqual({
      sessionId: SESSION,
      event: 'subagent-start',
      at: 1000,
      pid: 1,
      mode: 'agent',
      generationId: 'generation_1',
      subagentId: 'subagent_1',
      parentConversationId: SESSION,
      stopStatus: '',
      reason: ''
    })
    expect(JSON.stringify(entry)).not.toMatch(/private|transcript|summary|body/)

    const started = events.reduceQueueEntry(events.emptyHookState(), entry)
    const stopped = events.reduceQueueEntry(started, events.normalizeQueueEntry({
      s: SESSION,
      e: 'subagentStop',
      t: 2000,
      p: 1,
      m: 'agent',
      g: 'generation_1',
      a: 'subagent_1',
      q: SESSION
    }))
    expect(stopped).toMatchObject({ phase: 'unknown', turnOpen: false })
    expect(stopped.subagents.subagent_1).toMatchObject({
      subagentId: 'subagent_1',
      parentConversationId: SESSION,
      active: false,
      startedAt: 1000,
      stoppedAt: 2000
    })
  })

  it('keeps plan-mode events and still drops ask/edit', () => {
    const plan = events.normalizeQueueEntry({ s: SESSION, e: 'beforeSubmitPrompt', t: 1000, p: 1, m: 'plan' })
    expect(plan).toMatchObject({ sessionId: SESSION, event: 'prompt-submit', mode: 'plan' })
    expect(events.reduceQueueEntry(events.emptyHookState(), plan!)).toMatchObject({ turnOpen: true, phase: 'running' })
    expect(events.normalizeQueueEntry({ s: SESSION, e: 'beforeSubmitPrompt', t: 1000, p: 1, m: 'ask' })).toBeNull()
    expect(events.normalizeQueueEntry({ s: SESSION, e: 'beforeSubmitPrompt', t: 1000, p: 1, m: 'edit' })).toBeNull()
  })

  it('opens a turn on beforeSubmitPrompt and never invents waiting-approval', () => {
    const running = events.reduceQueueEntry(events.emptyHookState(), {
      sessionId: SESSION,
      event: 'prompt-submit',
      at: 1000,
      pid: 1,
      mode: 'agent',
      stopStatus: '',
      reason: ''
    })
    expect(running.turnOpen).toBe(true)
    expect(running.phase).toBe('running')
    const completed = events.reduceQueueEntry(running, {
      sessionId: SESSION,
      event: 'stop',
      at: 2000,
      pid: 1,
      mode: 'agent',
      stopStatus: 'completed',
      reason: ''
    })
    expect(completed.turnOpen).toBe(false)
    expect(completed.phase).toBe('completed')
    const aborted = events.reduceQueueEntry(running, {
      sessionId: SESSION,
      event: 'stop',
      at: 2000,
      pid: 1,
      mode: 'agent',
      stopStatus: 'aborted',
      reason: ''
    })
    expect(aborted.phase).toBe('stopped')
    expect(JSON.stringify(completed)).not.toContain('waiting-approval')
  })

  it('sessionEnd only closes an observed open turn', () => {
    const cold = events.reduceQueueEntry(events.emptyHookState(), {
      sessionId: SESSION,
      event: 'session-end',
      at: 1000,
      pid: 1,
      mode: 'agent',
      stopStatus: '',
      reason: ''
    })
    expect(cold.phase).toBe('unknown')
    const open = events.reduceQueueEntry(events.emptyHookState(), {
      sessionId: SESSION,
      event: 'prompt-submit',
      at: 1000,
      pid: 1,
      mode: 'agent',
      stopStatus: '',
      reason: ''
    })
    const ended = events.reduceQueueEntry(open, {
      sessionId: SESSION,
      event: 'session-end',
      at: 2000,
      pid: 1,
      mode: 'agent',
      stopStatus: '',
      reason: ''
    })
    expect(ended.turnOpen).toBe(false)
    expect(ended.phase).toBe('stopped')
  })
})

describe('cursor hook install in a temp directory', () => {
  it('writes the script and additive hooks file, then uninstalls cleanly', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-cursor-hooks-'))
    const dataDirectory = join(root, 'data')
    const hooksPath = join(root, 'hooks.json')
    writeFileSync(hooksPath, JSON.stringify({ version: 1, hooks: { stop: [{ command: '/user/stop.sh' }] } }, null, 2))
    try {
      const bridge = bridgeModule.createCursorBridge({
        fs: require('node:fs'),
        path: require('node:path'),
        os: { homedir: () => root },
        platform: 'darwin',
        env: {},
        dataDirectory,
        hooksPath,
        stateDbPath: join(root, 'missing.vscdb')
      })
      const installed = bridge.install()
      expect(installed.ok).toBe(true)
      const raw = JSON.parse(readFileSync(hooksPath, 'utf8'))
      expect(raw.hooks.stop[0].command).toBe('/user/stop.sh')
      expect(settings.hookInstallState(raw, { command: scripts.settingsCommandLine(join(dataDirectory, scripts.HOOK_SCRIPT_NAME), 'darwin') })).toBe('installed')
      expect(JSON.stringify(raw)).toContain('eypc-cursor-companion')
      expect(raw.hooks.stop.some((handler: { failClosed?: boolean }) => handler.failClosed === true)).toBe(false)
      const removed = bridge.uninstall()
      expect(removed.ok).toBe(true)
      expect(JSON.parse(readFileSync(hooksPath, 'utf8'))).toEqual({
        version: 1,
        hooks: { stop: [{ command: '/user/stop.sh' }] }
      })
      bridge.close()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
