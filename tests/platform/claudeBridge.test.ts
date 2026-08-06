import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

const require_ = createRequire(import.meta.url)
const bridgeModule = require_(resolve(process.cwd(), 'preload/claude/index.cjs'))
const events = require_(resolve(process.cwd(), 'preload/claude/events.cjs'))
const scripts = require_(resolve(process.cwd(), 'preload/claude/scripts.cjs'))
const settingsModule = require_(resolve(process.cwd(), 'preload/claude/settings.cjs'))
const environmentModule = require_(resolve(process.cwd(), 'preload/claude/environment.cjs'))

const NOW = 1_785_900_000_000

function makeHome() {
  const root = mkdtempSync(join(tmpdir(), 'eypc-claude-home-'))
  const claudeHome = join(root, '.claude')
  const dataDirectory = join(root, 'data')
  mkdirSync(join(claudeHome, 'projects'), { recursive: true })
  mkdirSync(dataDirectory, { recursive: true })
  return { root, claudeHome, dataDirectory }
}

function writeTranscript(claudeHome: string, slug: string, sessionId: string, entries: Record<string, unknown>[]) {
  const directory = join(claudeHome, 'projects', slug)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, `${sessionId}.jsonl`), entries.map((entry) => `${JSON.stringify(entry)}\n`).join(''))
}

function makeBridge(home: ReturnType<typeof makeHome>, overrides: Record<string, unknown> = {}) {
  return bridgeModule.createClaudeBridge({
    fs,
    path,
    os: { homedir: () => home.root },
    claudeHome: home.claudeHome,
    dataDirectory: home.dataDirectory,
    platform: 'darwin',
    // PATH is injected rather than inherited so discovery cannot pick up a
    // Claude CLI that happens to be installed on the machine running the suite.
    env: { PATH: '' },
    ...overrides
  })
}

describe('event queue', () => {
  it('accepts only known event classes and required identity', () => {
    expect(events.normalizeQueueEntry({ s: 'a', e: 'PreToolUse', t: 5 })).toMatchObject({ sessionId: 'a', event: 'pre-tool', at: 5 })
    expect(events.normalizeQueueEntry({ s: '', e: 'Stop' })).toBeNull()
    expect(events.normalizeQueueEntry({ s: 'a', e: 'MysteryEvent' })).toBeNull()
    expect(events.normalizeQueueEntry(null)).toBeNull()
  })

  it('keeps no payload beyond identity, timing and the owning process', () => {
    // cwd and parent session are deliberately absent: both can also appear
    // inside a tool's own input, so they come from the transcript instead.
    const entry = events.normalizeQueueEntry({ s: 'a', e: 'Stop', t: 1, d: '/private/secret', p: 42, g: 'parent', prompt: 'secret text' })
    expect(Object.keys(entry).sort()).toEqual(['at', 'event', 'pid', 'sessionId'])
    expect(JSON.stringify(entry)).not.toContain('secret')
  })

  it('skips corrupt lines while parsing a batch', () => {
    const parsed = events.parseQueueText('{"s":"a","e":"Stop","t":1}\nnot json\n{"s":"b","e":"Notification","t":2}\n')
    expect(parsed.map((item: { sessionId: string }) => item.sessionId)).toEqual(['a', 'b'])
  })

  it('folds a batch so the newest event per session wins', () => {
    const state = events.foldQueueEntries(events.parseQueueText(
      '{"s":"a","e":"PreToolUse","t":10}\n{"s":"a","e":"Notification","t":20}\n'
    ))
    expect(state.get('a')).toMatchObject({ hookEvent: 'notification', hookEventAt: 20 })
  })

  it('never lets an out-of-order older event overwrite a newer one', () => {
    const state = events.foldQueueEntries(events.parseQueueText(
      '{"s":"a","e":"Stop","t":50}\n{"s":"a","e":"PreToolUse","t":10}\n'
    ))
    expect(state.get('a').hookEvent).toBe('stop')
  })

  it('drains incrementally and recovers from rotation', () => {
    const home = makeHome()
    const queue = events.createEventQueue({ fs, path, directory: home.dataDirectory, maxBytes: 120 })
    queue.ensureQueueFile()
    writeFileSync(queue.queuePath, '{"s":"a","e":"PreToolUse","t":1}\n')
    expect(queue.drain()).toHaveLength(1)
    expect(queue.drain()).toHaveLength(0)
    writeFileSync(queue.queuePath, '{"s":"a","e":"PreToolUse","t":1}\n{"s":"b","e":"Stop","t":2}\n')
    expect(queue.drain()).toHaveLength(1)
    // Oversized queue is truncated, and the reader restarts from zero rather
    // than reading past the end of a shorter file.
    writeFileSync(queue.queuePath, '{"s":"c","e":"Stop","t":3}\n'.repeat(20))
    expect(queue.rotateIfNeeded()).toBe(true)
    writeFileSync(queue.queuePath, '{"s":"d","e":"Stop","t":4}\n')
    expect(queue.drain().map((item: { sessionId: string }) => item.sessionId)).toEqual(['d'])
  })
})

describe('generated scripts', () => {
  it('marks both scripts so uninstall can identify them', () => {
    expect(scripts.hookScript({ queuePath: '/data/q.jsonl' })).toContain(settingsModule.EYPC_MARKER)
    expect(scripts.statuslineScript({ quotaPath: '/data/q.json' })).toContain(settingsModule.EYPC_MARKER)
  })

  it('quotes paths so a space or quote cannot break out of the script', () => {
    const script = scripts.hookScript({ queuePath: "/data/my dir/it's.jsonl" })
    expect(script).toContain(`'/data/my dir/it'\\''s.jsonl'`)
  })

  it('chains to a pre-existing status line only when one was recorded', () => {
    expect(scripts.statuslineScript({ quotaPath: '/q', chainedCommand: '/user/line.sh' })).toContain('/user/line.sh')
    expect(scripts.statuslineScript({ quotaPath: '/q' })).toContain('print nothing')
  })

  it('both scripts exit zero so they can never block Claude Code', () => {
    expect(scripts.hookScript({ queuePath: '/q' }).trimEnd().endsWith('exit 0')).toBe(true)
    expect(scripts.statuslineScript({ quotaPath: '/q' }).trimEnd().endsWith('exit 0')).toBe(true)
  })

  it('parses the quota cache and rejects a foreign shape', () => {
    expect(scripts.parseQuotaCache('{"version":1,"updatedAt":5,"rate_limits":{"five_hour":{"used_percentage":10}}}'))
      .toMatchObject({ updatedAt: 5, rateLimits: { five_hour: { used_percentage: 10 } } })
    expect(scripts.parseQuotaCache('{"version":2,"rate_limits":{}}')).toBeNull()
    expect(scripts.parseQuotaCache('not json')).toBeNull()
    expect(scripts.parseQuotaCache('')).toBeNull()
  })
})

describe('environment probe', () => {
  it('reports not-installed and not-ready for an empty machine', () => {
    const home = makeHome()
    const bridge = makeBridge(home, { os: { homedir: () => join(home.root, 'nowhere') } })
    const snapshot = bridge.inspect()
    expect(snapshot.installed).toBe(false)
    expect(snapshot.hooks).toBe('missing')
  })

  it('discovers a CLI on PATH before falling back to the well-known roots', () => {
    const home = makeHome()
    const binDirectory = join(home.root, 'custom-bin')
    mkdirSync(binDirectory, { recursive: true })
    const binary = join(binDirectory, 'claude')
    writeFileSync(binary, '#!/bin/sh\n', { mode: 0o755 })
    const bridge = makeBridge(home, { env: { PATH: binDirectory } })
    expect(bridge.inspect().installed).toBe(true)
  })

  it('ignores a PATH entry that does not contain the CLI', () => {
    const home = makeHome()
    expect(makeBridge(home, { env: { PATH: join(home.root, 'empty-bin') } }).inspect().installed).toBe(false)
  })

  it('detects a readable claude home', () => {
    const home = makeHome()
    writeTranscript(home.claudeHome, '-w-app', 's1', [{ type: 'user', sessionId: 's1', timestamp: '2026-08-05T03:00:00.000Z' }])
    const snapshot = makeBridge(home).inspect()
    expect(snapshot.homeReady).toBe(true)
    expect(snapshot.authenticated).toBe(true)
  })

  it('never returns a credential value', () => {
    const home = makeHome()
    writeFileSync(join(home.claudeHome, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'sk-secret-value' } }))
    const snapshot = makeBridge(home).inspect()
    expect(snapshot.authenticated).toBe(true)
    expect(JSON.stringify(snapshot)).not.toContain('sk-secret-value')
  })

  it('enumerates transcripts across project slugs', () => {
    const home = makeHome()
    writeTranscript(home.claudeHome, '-w-a', 's1', [{ type: 'user' }])
    writeTranscript(home.claudeHome, '-w-b', 's2', [{ type: 'user' }])
    const probe = environmentModule.createEnvironmentProbe({ fs, path, os: { homedir: () => home.root }, claudeHome: home.claudeHome })
    expect(probe.listTranscripts().map((row: { sessionId: string }) => row.sessionId).sort()).toEqual(['s1', 's2'])
  })
})

describe('registration writes only what it owns', () => {
  it('installs hooks, status line and both scripts', () => {
    const home = makeHome()
    const bridge = makeBridge(home)
    expect(bridge.install().ok).toBe(true)
    const settings = JSON.parse(readFileSync(join(home.claudeHome, 'settings.json'), 'utf8'))
    // The registered entry is a shell-quoted command line, not the bare path:
    // Claude Code hands it to /bin/sh and EyPc's data directory can contain a
    // space. The written scripts still live at the raw paths.
    expect(settings.hooks.Stop[0].hooks[0].command).toBe(bridge.hookCommandLine)
    expect(settings.statusLine.command).toBe(bridge.statuslineCommandLine)
    expect(readFileSync(bridge.hookCommandPath, 'utf8')).toContain(settingsModule.EYPC_MARKER)
    expect(bridge.inspect().hooks).toBe('installed')
  })

  it('preserves unrelated settings and a user status line', () => {
    const home = makeHome()
    writeFileSync(join(home.claudeHome, 'settings.json'), JSON.stringify({
      model: 'opus',
      statusLine: { type: 'command', command: '/user/line.sh' },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/user/guard.sh' }] }] }
    }, null, 2))
    const bridge = makeBridge(home)
    bridge.install()
    const settings = JSON.parse(readFileSync(join(home.claudeHome, 'settings.json'), 'utf8'))
    expect(settings.model).toBe('opus')
    expect(settings.hooks.PreToolUse.some((group: { hooks: { command: string }[] }) =>
      group.hooks[0].command === '/user/guard.sh')).toBe(true)
    expect(readFileSync(bridge.statuslineCommandPath, 'utf8')).toContain('/user/line.sh')
  })

  it('restores the original settings on uninstall', () => {
    const home = makeHome()
    const original = {
      model: 'opus',
      statusLine: { type: 'command', command: '/user/line.sh' },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/user/guard.sh' }] }] }
    }
    writeFileSync(join(home.claudeHome, 'settings.json'), JSON.stringify(original, null, 2))
    const bridge = makeBridge(home)
    bridge.install()
    expect(bridge.uninstall().ok).toBe(true)
    expect(JSON.parse(readFileSync(join(home.claudeHome, 'settings.json'), 'utf8'))).toEqual(original)
  })

  it('is idempotent across repeated installs', () => {
    const home = makeHome()
    const bridge = makeBridge(home)
    bridge.install()
    const first = readFileSync(join(home.claudeHome, 'settings.json'), 'utf8')
    bridge.install()
    expect(readFileSync(join(home.claudeHome, 'settings.json'), 'utf8')).toBe(first)
  })

  it('can skip the status line when the user declines it', () => {
    const home = makeHome()
    const bridge = makeBridge(home)
    bridge.install({ statusline: false })
    const settings = JSON.parse(readFileSync(join(home.claudeHome, 'settings.json'), 'utf8'))
    expect(settings.statusLine).toBeUndefined()
    expect(settings.hooks.Stop).toHaveLength(1)
  })
})

describe('snapshot assembly', () => {
  function seedSession(home: ReturnType<typeof makeHome>, sessionId: string, at: string, extra: Record<string, unknown> = {}) {
    writeTranscript(home.claudeHome, '-w-app', sessionId, [
      { type: 'user', sessionId, cwd: '/w/app', timestamp: at, message: { content: 'hello' } },
      { type: 'assistant', sessionId, timestamp: at, message: { model: 'claude-opus-5', content: [] }, ...extra }
    ])
  }

  it('reports sessions newest first with transcript evidence', () => {
    const home = makeHome()
    seedSession(home, 'old', new Date(NOW - 3_600_000).toISOString())
    seedSession(home, 'new', new Date(NOW - 60_000).toISOString())
    const snapshot = makeBridge(home).readSnapshot({ now: NOW })
    expect(snapshot.sessions.map((item: { sessionId: string }) => item.sessionId)).toEqual(['new', 'old'])
    expect(snapshot.sessions[0]).toMatchObject({ cwd: '/w/app', model: 'claude-opus-5', projectSlug: '-w-app' })
    expect(snapshot.revision).toBe(bridgeModule.CLAUDE_BRIDGE_REVISION)
  })

  it('drops sessions outside the inventory window', () => {
    const home = makeHome()
    seedSession(home, 'ancient', new Date(NOW - 40 * 24 * 3_600_000).toISOString())
    const snapshot = makeBridge(home).readSnapshot({ now: NOW })
    expect(snapshot.sessions).toHaveLength(0)
  })

  it('layers exact hook evidence on top of transcript evidence', () => {
    const home = makeHome()
    seedSession(home, 's1', new Date(NOW - 60_000).toISOString())
    const bridge = makeBridge(home)
    bridge.install()
    writeFileSync(bridge.queuePath, `${JSON.stringify({ s: 's1', e: 'Notification', t: NOW - 1_000, p: 4242 })}\n`)
    const snapshot = bridge.readSnapshot({ now: NOW })
    expect(snapshot.sessions[0]).toMatchObject({ hookEvent: 'notification', pid: 4242 })
    expect(snapshot.sessions[0].updatedAt).toBe(NOW - 1_000)
  })

  it('surfaces the cached quota shape without interpreting it', () => {
    const home = makeHome()
    seedSession(home, 's1', new Date(NOW - 60_000).toISOString())
    const bridge = makeBridge(home)
    writeFileSync(bridge.quotaPath, JSON.stringify({
      version: 1,
      updatedAt: NOW - 5_000,
      rate_limits: { five_hour: { used_percentage: 30, resets_at: 1_738_425_600 } }
    }))
    const snapshot = bridge.readSnapshot({ now: NOW })
    expect(snapshot.quota).toMatchObject({ updatedAt: NOW - 5_000 })
    expect(snapshot.quota.rateLimits.five_hour.used_percentage).toBe(30)
  })

  it('reports a null quota rather than failing when no status line has run', () => {
    const home = makeHome()
    seedSession(home, 's1', new Date(NOW - 60_000).toISOString())
    expect(makeBridge(home).readSnapshot({ now: NOW }).quota).toBeNull()
  })

  it('never carries message content into the snapshot', () => {
    const home = makeHome()
    seedSession(home, 's1', new Date(NOW - 60_000).toISOString())
    const serialized = JSON.stringify(makeBridge(home).readSnapshot({ now: NOW }))
    expect(serialized).not.toContain('hello')
  })

  it('returns an empty inventory instead of throwing when claude home is absent', () => {
    const home = makeHome()
    const bridge = makeBridge(home, { claudeHome: join(home.root, 'missing') })
    expect(bridge.readSnapshot({ now: NOW }).sessions).toEqual([])
  })
})

describe('task jump', () => {
  const openModule = require_(resolve(process.cwd(), 'preload/claude/open.cjs'))
  const desktopWindow = (overrides: Record<string, unknown> = {}) => ({
    pid: 900,
    instanceId: 'd1',
    nativeRef: '900:0:5',
    platform: 'darwin',
    appId: 'com.anthropic.claudefordesktop',
    appName: 'Claude',
    title: 'Claude',
    relationship: 'root',
    userVisible: true,
    canActivate: true,
    ...overrides
  })
  const CLI_ID = '7badfe6b-950e-488b-a70c-cc6756e96763'
  const DESKTOP_ID = `local_${CLI_ID}`

  /** Captures the dispatched command without ever reaching a real `open`. */
  function makeDispatchBridge(home: ReturnType<typeof makeHome>, rows: Record<string, unknown>[] | null, overrides: Record<string, unknown> = {}) {
    const dispatched: { command: string; args: string[] }[] = []
    const bridge = makeBridge(home, {
      windows: rows === null ? undefined : { list: async () => rows, activate: async () => ({ outcome: 'activated' }) },
      execFile: (command: string, args: string[], _opts: unknown, callback: (error: Error | null) => void) => {
        dispatched.push({ command, args })
        callback(null)
      },
      ...overrides
    })
    return { bridge, dispatched }
  }

  it('admits the desktop app by application identity, never by window title', () => {
    expect(openModule.isClaudeDesktopWindow(desktopWindow())).toBe(true)
    expect(openModule.isClaudeDesktopWindow({ appId: 'com.apple.Terminal', appName: 'Terminal', title: 'claude — 80x24' })).toBe(false)
    expect(openModule.isClaudeDesktopWindow({ appId: 'com.anthropic.claude.url-handler', appName: 'Claude Code URL Handler' })).toBe(false)
    expect(openModule.isClaudeDesktopWindow({ appId: '', appName: 'Claude' })).toBe(true)
  })

  /**
   * The deep link is the whole contract with the desktop app: a desktop id is
   * `local_` + the uuid the handler wants, a CLI id is that uuid already, and
   * anything the handler's own regex would drop must be rejected here instead
   * of dispatched into a silent no-op.
   */
  it('reduces both session families to the same deep-link uuid', () => {
    expect(openModule.deepLinkSessionUuid(DESKTOP_ID)).toBe(CLI_ID)
    expect(openModule.deepLinkSessionUuid(CLI_ID)).toBe(CLI_ID)
    expect(openModule.deepLinkSessionUuid(CLI_ID.toUpperCase())).toBe(CLI_ID)
    expect(openModule.deepLinkSessionUuid('local_abc')).toBe('')
    expect(openModule.deepLinkSessionUuid('')).toBe('')
    expect(openModule.desktopResumeUrl(CLI_ID)).toBe(`claude://resume?session=${CLI_ID}`)
  })

  it('opens a CLI session through the desktop app rather than a terminal', async () => {
    const home = makeHome()
    const { bridge, dispatched } = makeDispatchBridge(home, [desktopWindow()])
    const result = await bridge.openTask(CLI_ID)
    expect(dispatched).toEqual([{ command: 'open', args: [`claude://resume?session=${CLI_ID}`] }])
    expect(result).toMatchObject({ outcome: 'dispatched', confirmsRead: false })
  })

  it('strips the local_ prefix before addressing a desktop session', async () => {
    const home = makeHome()
    const { bridge, dispatched } = makeDispatchBridge(home, [desktopWindow()])
    const result = await bridge.openTask(DESKTOP_ID)
    expect(dispatched[0].args).toEqual([`claude://resume?session=${CLI_ID}`])
    expect(result.outcome).toBe('dispatched')
  })

  /**
   * A hand-off is never proof that the user saw the session: the OS handler
   * takes the URL and returns, so an expired sign-in looks exactly like a
   * successful navigation. Nothing here may clear `completed-unread`.
   */
  it('never confirms a read', async () => {
    const home = makeHome()
    const { bridge } = makeDispatchBridge(home, [desktopWindow()])
    expect((await bridge.openTask(CLI_ID)).confirmsRead).toBe(false)
  })

  it('refuses ids the resume handler would drop, without dispatching anything', async () => {
    const home = makeHome()
    const { bridge, dispatched } = makeDispatchBridge(home, [desktopWindow()])
    const result = await bridge.openTask('local_abc')
    expect(dispatched).toEqual([])
    expect(result).toMatchObject({ outcome: 'unavailable', confirmsRead: false })
  })

  it('reports a closed desktop app instead of launching one', async () => {
    const home = makeHome()
    const { bridge, dispatched } = makeDispatchBridge(home, [])
    const result = await bridge.openTask(CLI_ID)
    expect(dispatched).toEqual([])
    expect(result.outcome).toBe('unavailable')
    expect(result.message).toContain('桌面端未在运行')
  })

  it('ignores child and non-visible rows when deciding the app is up', async () => {
    const home = makeHome()
    const { bridge, dispatched } = makeDispatchBridge(home, [
      desktopWindow({ instanceId: 'c1', relationship: 'child' }),
      desktopWindow({ instanceId: 'c3', userVisible: false })
    ])
    expect((await bridge.openTask(CLI_ID)).outcome).toBe('unavailable')
    expect(dispatched).toEqual([])
  })

  /**
   * A denied accessibility permission produces the same empty inventory as a
   * closed app — but the deep link needs no accessibility at all, so refusing
   * on that evidence would block a jump that works fine.
   */
  it('still dispatches when the inventory is blocked rather than empty', async () => {
    const home = makeHome()
    const { bridge, dispatched } = makeDispatchBridge(home, null, {
      windows: {
        list: async () => ({
          capability: { platform: 'darwin', supported: true, permission: 'required', canList: false },
          windows: [],
          completeness: 'partial'
        })
      }
    })
    const result = await bridge.openTask(CLI_ID)
    expect(result.outcome).toBe('dispatched')
    expect(dispatched).toHaveLength(1)
  })

  it('dispatches even when no window subsystem is present at all', async () => {
    const home = makeHome()
    const { bridge, dispatched } = makeDispatchBridge(home, null)
    expect((await bridge.openTask(CLI_ID)).outcome).toBe('dispatched')
    expect(dispatched).toHaveLength(1)
  })

  it('reports a rejected dispatch as failed rather than pretending it opened', async () => {
    const home = makeHome()
    const bridge = makeBridge(home, {
      windows: { list: async () => [desktopWindow()] },
      execFile: (_command: string, _args: string[], _opts: unknown, callback: (error: Error | null) => void) => {
        callback(new Error('no handler'))
      }
    })
    expect(await bridge.openTask(CLI_ID)).toMatchObject({ outcome: 'failed', confirmsRead: false })
  })
})

describe('hook queue push lane', () => {
  /**
   * The queue is append-only and the poll interval is 15 seconds, so without a
   * watcher a status change can sit unseen for the whole interval while the
   * Codex lane beside it updates in milliseconds.
   */
  const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

  it('notifies when the hook script appends', async () => {
    const home = makeHome()
    const bridge = makeBridge(home)
    bridge.install()
    let hits = 0
    const stop = bridge.watchEvents(() => { hits += 1 }, { coalesceMs: 10 })
    try {
      appendFileSync(bridge.queuePath, `${JSON.stringify({ s: 'push-1', e: 'Stop', t: Date.now(), p: 1 })}\n`)
      await settle()
      expect(hits).toBe(1)
      // The consumer can now see the event without waiting for a poll.
      expect(bridge.readSnapshot({ now: Date.now() })).toBeTruthy()
    } finally {
      stop()
    }
  })

  it('coalesces a burst into one notification', async () => {
    const home = makeHome()
    const bridge = makeBridge(home)
    bridge.install()
    let hits = 0
    const stop = bridge.watchEvents(() => { hits += 1 }, { coalesceMs: 30 })
    try {
      for (const event of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']) {
        appendFileSync(bridge.queuePath, `${JSON.stringify({ s: 'burst', e: event, t: Date.now(), p: 1 })}\n`)
      }
      await settle(120)
      expect(hits).toBe(1)
    } finally {
      stop()
    }
  })

  it('watches before registration, so the first install is seen too', async () => {
    const home = makeHome()
    const bridge = makeBridge(home)
    let hits = 0
    // No install yet: the queue file does not exist. Watching the directory is
    // what makes this case work at all.
    const stop = bridge.watchEvents(() => { hits += 1 }, { coalesceMs: 10 })
    try {
      bridge.install()
      await settle()
      expect(hits).toBeGreaterThan(0)
    } finally {
      stop()
    }
  })

  it('stops on dispose and on close, and never keeps more than one subscription', async () => {
    const home = makeHome()
    const bridge = makeBridge(home)
    bridge.install()
    let first = 0
    let second = 0
    const stopFirst = bridge.watchEvents(() => { first += 1 }, { coalesceMs: 10 })
    // A second subscription replaces the first rather than stacking; two live
    // watchers would fan one event into two reads.
    const stopSecond = bridge.watchEvents(() => { second += 1 }, { coalesceMs: 10 })
    appendFileSync(bridge.queuePath, `${JSON.stringify({ s: 'one', e: 'Stop', t: Date.now(), p: 1 })}\n`)
    await settle()
    expect(first).toBe(0)
    expect(second).toBe(1)

    stopSecond()
    appendFileSync(bridge.queuePath, `${JSON.stringify({ s: 'two', e: 'Stop', t: Date.now(), p: 1 })}\n`)
    await settle()
    expect(second).toBe(1)

    let third = 0
    bridge.watchEvents(() => { third += 1 }, { coalesceMs: 10 })
    bridge.close()
    appendFileSync(bridge.queuePath, `${JSON.stringify({ s: 'three', e: 'Stop', t: Date.now(), p: 1 })}\n`)
    await settle()
    expect(third).toBe(0)
    stopFirst()
  })

  it('degrades to a no-op disposer instead of throwing', () => {
    const home = makeHome()
    const bridge = makeBridge(home, {
      fs: { ...fs, watch: () => { throw new Error('watch unsupported on this filesystem') } }
    })
    expect(() => bridge.watchEvents(() => undefined)()).not.toThrow()
    expect(typeof bridge.watchEvents(null)).toBe('function')
  })
})
