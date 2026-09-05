import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

const require_ = createRequire(import.meta.url)
const bridgeModule = require_(resolve(process.cwd(), 'preload/claude/index.cjs'))
const codeSessions = require_(resolve(process.cwd(), 'preload/claude/code-sessions.cjs'))
const events = require_(resolve(process.cwd(), 'preload/claude/events.cjs'))
const appState = require_(resolve(process.cwd(), 'preload/claude/app-state.cjs'))
const openerModule = require_(resolve(process.cwd(), 'preload/claude/open.cjs'))

const LOCAL_A = 'local_7badfe6b-950e-488b-a70c-cc6756e96763'
const LOCAL_B = 'local_8badfe6b-950e-488b-a70c-cc6756e96764'
const LOCAL_C = 'local_9badfe6b-950e-488b-a70c-cc6756e96765'
const CLI_A = '1badfe6b-950e-488b-a70c-cc6756e96761'
const CLI_SHARED = '2badfe6b-950e-488b-a70c-cc6756e96762'

function makeHome() {
  const root = mkdtempSync(join(tmpdir(), 'eypc-claude-code-'))
  const claudeHome = join(root, '.claude')
  const dataDirectory = join(root, 'data')
  const appData = join(root, 'Claude')
  const codeDirectory = join(appData, 'claude-code-sessions', 'org', 'user')
  mkdirSync(claudeHome, { recursive: true })
  mkdirSync(dataDirectory, { recursive: true })
  mkdirSync(codeDirectory, { recursive: true })
  return { root, claudeHome, dataDirectory, appData, codeDirectory }
}

function metadata(sessionId: string, cliSessionId: string, patch: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    sessionId,
    cliSessionId,
    title: 'App title',
    cwd: '/work/project',
    originCwd: '/work/project',
    createdAt: now - 10_000,
    lastActivityAt: now - 2_000,
    lastFocusedAt: now - 1_000,
    model: 'claude-opus-5',
    isArchived: false,
    permissionMode: 'bypassPermissions',
    secretPrompt: 'must never leave metadata reader',
    ...patch
  }
}

function writeMetadata(directory: string, row: Record<string, unknown>) {
  writeFileSync(join(directory, `${row.sessionId}.json`), JSON.stringify(row))
}

function makeBridge(home: ReturnType<typeof makeHome>, overrides: Record<string, unknown> = {}) {
  return bridgeModule.createClaudeBridge({
    fs,
    path,
    os: { homedir: () => home.root, tmpdir },
    claudeHome: home.claudeHome,
    claudeAppDataRoot: home.appData,
    dataDirectory: home.dataDirectory,
    platform: 'darwin',
    env: { PATH: '' },
    ...overrides
  })
}

function event(sessionId: string, name: string, at: number, reason = '') {
  return events.normalizeQueueEntry({ s: sessionId, e: name, t: at, r: reason, p: 42 })
}

function chromiumUnreadValue(ids: string[]) {
  return Buffer.concat([
    Buffer.from([1]),
    Buffer.from(JSON.stringify({ state: { unreadIds: ids } }), 'utf8')
  ])
}

function mutableUnreadLeveldown(readIds: () => string[]) {
  return () => {
    let emitted = false
    return {
      open: (_options: unknown, done: (error?: Error | null) => void) => done(null),
      close: (done: () => void) => done(),
      iterator: () => ({
        next: (done: (error?: Error | null, key?: Buffer, value?: Buffer) => void) => {
          if (emitted) { done(null); return }
          emitted = true
          done(null, Buffer.from('_https://claude.ai\u0000\u0001epitaxy-unread-v1'), chromiumUnreadValue(readIds()))
        },
        end: (done: () => void) => done()
      })
    }
  }
}

describe('ordered hook state', () => {
  it('keeps only the strict privacy allowlist', () => {
    const entry = events.normalizeQueueEntry({
      s: CLI_A,
      e: 'PreToolUse',
      t: 5,
      p: 42,
      r: 'ask-user-question',
      prompt: 'secret',
      tool_input: { command: 'private' }
    })
    expect(entry).toEqual({ sessionId: CLI_A, event: 'pre-tool', at: 5, pid: 42, reason: 'ask-user-question' })
    expect(JSON.stringify(entry)).not.toContain('secret')
    expect(events.normalizeQueueEntry({ s: CLI_A, e: 'PreToolUse', r: 'raw-tool-name' })?.reason).toBe('')
    // The CodexHost link is the one additional identity field: a well-formed
    // thread id normalizes to lowercase, anything else is dropped entirely.
    expect(events.normalizeQueueEntry({ s: CLI_A, e: 'PreToolUse', t: 5, h: '209851CA-e41e-4a09-8145-6576959a4bcf' })?.hostThreadId)
      .toBe('209851ca-e41e-4a09-8145-6576959a4bcf')
    expect(events.normalizeQueueEntry({ s: CLI_A, e: 'PreToolUse', t: 5, h: 'not a thread id!' })).not.toHaveProperty('hostThreadId')
  })

  it('keeps only bounded subagent identity and lifecycle fields', () => {
    const entry = events.normalizeQueueEntry({
      s: CLI_A,
      e: 'SubagentStart',
      t: 10,
      p: 42,
      a: 'agent_1',
      g: 'explore',
      transcript: 'private transcript',
      summary: 'private summary',
      body: 'private body'
    })
    expect(entry).toEqual({
      sessionId: CLI_A,
      event: 'subagent-start',
      at: 10,
      pid: 42,
      agentId: 'agent_1',
      agentType: 'explore',
      reason: ''
    })
    expect(JSON.stringify(entry)).not.toMatch(/private|transcript|summary|body/)

    const state = events.foldQueueEntries([
      entry,
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStop', t: 20, p: 42, a: 'agent_1', g: 'explore' })
    ])
    expect(state.get(CLI_A)).toMatchObject({ phase: 'unknown', turnOpen: false })
    expect(state.get(CLI_A).subagents.agent_1).toMatchObject({
      agentId: 'agent_1',
      agentType: 'explore',
      active: false,
      startedAt: 10,
      stoppedAt: 20
    })
  })

  it('resolves running, approval and user-input waits in file order', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'PermissionRequest', 20),
      event(CLI_A, 'PostToolUse', 30),
      event(CLI_A, 'PreToolUse', 40, 'ask-user-question')
    ])
    expect(state.get(CLI_A)).toMatchObject({
      phase: 'waiting-input',
      turnStartedAt: 10,
      waitingApprovalAt: 20,
      lastActivityAt: 30,
      waitingInputAt: 40
    })
  })

  it('keeps a completed turn completed when SessionEnd follows Stop', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'Stop', 20),
      event(CLI_A, 'SessionEnd', 30)
    ])
    expect(state.get(CLI_A)).toMatchObject({ phase: 'completed', lastStopAt: 20, lastSessionEndAt: 30 })
  })

  it('keeps the parent completed when SubagentStop and tool tail events follow Stop', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'Stop', 20),
      event(CLI_A, 'SubagentStop', 30),
      event(CLI_A, 'PostToolUse', 40),
      event(CLI_A, 'SessionEnd', 50)
    ])
    expect(state.get(CLI_A)).toMatchObject({
      phase: 'completed',
      turnStartedAt: 10,
      lastStopAt: 20,
      lastActivityAt: 40,
      lastSessionEndAt: 50,
      turnOpen: false
    })
  })

  it('does not fabricate a parent Turn from subagent-only events', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'SubagentStart', 10),
      event(CLI_A, 'SubagentStop', 20)
    ])
    expect(state.get(CLI_A)).toMatchObject({ phase: 'unknown', turnStartedAt: 0, lastActivityAt: 20, turnOpen: false })
  })

  it('reconciles only the earliest pending active subagent per type-less orphan SubagentStop after Stop', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStart', t: 20, p: 42, a: 'agent_a', g: 'explore' }),
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStart', t: 25, p: 42, a: 'agent_b', g: 'general' }),
      event(CLI_A, 'Stop', 30),
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStop', t: 35, p: 42, a: 'orphan_1' })
    ])
    const hook = state.get(CLI_A)
    expect(hook.phase).toBe('completed')
    expect(hook.subagents.agent_a).toMatchObject({ active: false, stoppedAt: 35, reconciledAt: 35 })
    expect(hook.subagents.agent_b).toMatchObject({ active: true, stoppedAt: 0 })
    expect(hook.subagents.orphan_1).toMatchObject({ active: false, startedAt: 0, stoppedAt: 35 })

    const swept = events.foldQueueEntries([
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStop', t: 40, p: 42, a: 'orphan_2' })
    ], state)
    expect(swept.get(CLI_A).subagents.agent_b).toMatchObject({ active: false, stoppedAt: 40, reconciledAt: 40 })
  })

  it('keeps a typed orphan SubagentStop as a placeholder without sweeping pending actives', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStart', t: 20, p: 42, a: 'agent_a', g: 'explore' }),
      event(CLI_A, 'Stop', 30),
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStop', t: 35, p: 42, a: 'orphan_1', g: 'other' })
    ])
    expect(state.get(CLI_A).subagents.agent_a).toMatchObject({ active: true, stoppedAt: 0 })
    expect(state.get(CLI_A).subagents.orphan_1).toMatchObject({ active: false, stoppedAt: 35 })
  })

  it('does not sweep pending actives while the parent Turn is open', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStart', t: 20, p: 42, a: 'agent_a', g: 'explore' }),
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStop', t: 25, p: 42, a: 'orphan_1' })
    ])
    expect(state.get(CLI_A)).toMatchObject({ phase: 'running', turnOpen: true })
    expect(state.get(CLI_A).subagents.agent_a).toMatchObject({ active: true, stoppedAt: 0 })
    expect(state.get(CLI_A).subagents.orphan_1).toMatchObject({ active: false, stoppedAt: 25 })
  })

  it('revives a reconciled subagent on direct same-id evidence and closes it on its own stop', () => {
    const reconciled = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStart', t: 20, p: 42, a: 'agent_a', g: 'explore' }),
      event(CLI_A, 'Stop', 30),
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStop', t: 35, p: 42, a: 'orphan_1' })
    ])
    expect(reconciled.get(CLI_A).subagents.agent_a).toMatchObject({ active: false, reconciledAt: 35 })

    const revived = events.foldQueueEntries([
      events.normalizeQueueEntry({ s: CLI_A, e: 'PostToolUse', t: 50, p: 42, a: 'agent_a' })
    ], reconciled)
    expect(revived.get(CLI_A).subagents.agent_a).toMatchObject({ active: true, stoppedAt: 0, reconciledAt: 0 })

    const closed = events.foldQueueEntries([
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStop', t: 60, p: 42, a: 'agent_a', g: 'explore' })
    ], revived)
    expect(closed.get(CLI_A).subagents.agent_a).toMatchObject({ active: false, stoppedAt: 60, reconciledAt: 0 })
  })

  it('finalizes reconciled closures at SessionEnd so stray tails cannot revive them', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStart', t: 20, p: 42, a: 'agent_a', g: 'explore' }),
      event(CLI_A, 'Stop', 30),
      events.normalizeQueueEntry({ s: CLI_A, e: 'SubagentStop', t: 35, p: 42, a: 'orphan_1' }),
      event(CLI_A, 'SessionEnd', 40),
      events.normalizeQueueEntry({ s: CLI_A, e: 'PostToolUse', t: 50, p: 42, a: 'agent_a' })
    ])
    expect(state.get(CLI_A).phase).toBe('completed')
    expect(state.get(CLI_A).subagents.agent_a).toMatchObject({ active: false, stoppedAt: 35, reconciledAt: 0 })
  })

  it('lets only a new prompt reopen the parent after Stop', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'Stop', 20),
      event(CLI_A, 'SubagentStart', 30),
      event(CLI_A, 'UserPromptSubmit', 40)
    ])
    expect(state.get(CLI_A)).toMatchObject({ phase: 'running', turnStartedAt: 40, lastActivityAt: 40, turnOpen: true })
  })

  it('uses stopped only when a session ends without a completed turn', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'SessionEnd', 20)
    ])
    expect(state.get(CLI_A).phase).toBe('stopped')
  })

  it('treats SessionEnd without an observed parent Turn as lifecycle-only', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'SessionEnd', 20)
    ])
    expect(state.get(CLI_A)).toMatchObject({
      phase: 'unknown',
      turnStartedAt: 0,
      turnOpen: false,
      lastSessionEndAt: 20
    })
  })

  it('restores running when tools continue after StopFailure', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'PreToolUse', 15),
      event(CLI_A, 'StopFailure', 20),
      event(CLI_A, 'SubagentStop', 25),
      event(CLI_A, 'SessionStart', 26),
      event(CLI_A, 'PostToolUse', 30)
    ])
    expect(state.get(CLI_A)).toMatchObject({
      phase: 'running',
      turnStartedAt: 10,
      lastStopFailureAt: 20,
      lastActivityAt: 30,
      turnOpen: true
    })
  })

  it('restores waiting-approval after StopFailure when a permission request continues', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'StopFailure', 20),
      event(CLI_A, 'PermissionRequest', 30)
    ])
    expect(state.get(CLI_A)).toMatchObject({
      phase: 'waiting-approval',
      turnStartedAt: 10,
      lastStopFailureAt: 20,
      waitingApprovalAt: 30,
      turnOpen: true
    })
  })

  it('keeps a StopFailure-only Turn stopped until later parent activity arrives', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'StopFailure', 20)
    ])
    expect(state.get(CLI_A)).toMatchObject({
      phase: 'stopped',
      turnStartedAt: 10,
      lastStopFailureAt: 20,
      turnOpen: false
    })
  })

  it('does not reopen a successful Stop when StopFailure and tools follow', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'Stop', 20),
      event(CLI_A, 'StopFailure', 25),
      event(CLI_A, 'PostToolUse', 30)
    ])
    expect(state.get(CLI_A)).toMatchObject({
      phase: 'completed',
      lastStopAt: 20,
      lastStopFailureAt: 25,
      turnOpen: false
    })
  })

  it('does not reopen an observed-open SessionEnd when tools follow', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'SessionEnd', 20),
      event(CLI_A, 'PostToolUse', 30)
    ])
    expect(state.get(CLI_A)).toMatchObject({
      phase: 'stopped',
      lastSessionEndAt: 20,
      turnOpen: false
    })
  })

  it('does not invent stopped from a StopFailure without a parent Turn', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'StopFailure', 20)
    ])
    expect(state.get(CLI_A)).toMatchObject({
      phase: 'unknown',
      turnStartedAt: 0,
      lastStopFailureAt: 20,
      turnOpen: false
    })
  })

  it('treats idle notification as a wake-up hint, never a waiting state', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'Notification', 20, 'idle-prompt')
    ])
    expect(state.get(CLI_A).phase).toBe('running')
  })

  it('ignores a genuinely older append but lets equal timestamps follow file order', () => {
    const state = events.foldQueueEntries([
      event(CLI_A, 'Stop', 50),
      event(CLI_A, 'UserPromptSubmit', 10),
      event(CLI_A, 'UserPromptSubmit', 50)
    ])
    expect(state.get(CLI_A)).toMatchObject({ phase: 'running', lastEvent: 'prompt-submit', lastEventAt: 50 })
  })

  it('drains the first semantic append synchronously and collapses duplicate tails without a timer', () => {
    const home = makeHome()
    let directoryChange: ((event: string, filename: string) => void) | null = null
    const controlledFs = new Proxy(fs, {
      get(target, key) {
        if (key === 'watch') return (_directory: string, _options: unknown, listener: (event: string, filename: string) => void) => {
          directoryChange = listener
          return { on: () => undefined, close: () => undefined }
        }
        return Reflect.get(target, key)
      }
    })
    const queue = events.createEventQueue({
      fs: controlledFs,
      path,
      directory: home.dataDirectory,
      watchFile: () => undefined,
      unwatchFile: () => undefined,
      setTimeout: () => { throw new Error('semantic wake must not use setTimeout') }
    })
    queue.ensureQueueFile()
    let notified = 0
    const dispose = queue.watch(() => { notified += 1 })
    appendFileSync(queue.queuePath, `${JSON.stringify({ s: CLI_A, e: 'Stop', t: 10 })}\n`)
    expect(directoryChange).not.toBeNull()
    ;(directoryChange as unknown as (event: string, filename: string) => void)('change', events.QUEUE_FILE_NAME)
    expect(queue.state().get(CLI_A)).toMatchObject({ phase: 'completed', lastStopAt: 10 })
    expect(notified).toBe(1)

    for (let index = 0; index < 1_000; index += 1) {
      appendFileSync(queue.queuePath, `${JSON.stringify({ s: CLI_A, e: 'Stop', t: 10 })}\n`)
      ;(directoryChange as unknown as (event: string, filename: string) => void)('change', events.QUEUE_FILE_NAME)
    }
    expect(notified).toBe(1)
    dispose()
  })

  it('leaves a partial JSONL tail unread until the terminating newline arrives', () => {
    const home = makeHome()
    let directoryChange: ((event: string, filename: string) => void) | null = null
    const controlledFs = new Proxy(fs, {
      get(target, key) {
        if (key === 'watch') return (_directory: string, _options: unknown, listener: (event: string, filename: string) => void) => {
          directoryChange = listener
          return { on: () => undefined, close: () => undefined }
        }
        return Reflect.get(target, key)
      }
    })
    const queue = events.createEventQueue({
      fs: controlledFs,
      path,
      directory: home.dataDirectory,
      watchFile: () => undefined,
      unwatchFile: () => undefined
    })
    queue.ensureQueueFile()
    let notified = 0
    const dispose = queue.watch(() => { notified += 1 })
    appendFileSync(queue.queuePath, JSON.stringify({ s: CLI_A, e: 'UserPromptSubmit', t: 20 }))
    ;(directoryChange as unknown as (event: string, filename: string) => void)('change', events.QUEUE_FILE_NAME)
    expect(notified).toBe(0)
    appendFileSync(queue.queuePath, '\n')
    ;(directoryChange as unknown as (event: string, filename: string) => void)('change', events.QUEUE_FILE_NAME)
    expect(queue.state().get(CLI_A)).toMatchObject({ phase: 'running', turnStartedAt: 20 })
    expect(notified).toBe(1)
    dispose()
  })

  it('recovers a dropped fs.watch notification through the native bounded StatWatcher', () => {
    const home = makeHome()
    let poll: (() => void) | null = null
    const silentFs = new Proxy(fs, {
      get(target, key) {
        if (key === 'watch') return () => ({ on: () => undefined, close: () => undefined })
        return Reflect.get(target, key)
      }
    })
    const queue = events.createEventQueue({
      fs: silentFs,
      path,
      directory: home.dataDirectory,
      watchFile: (_filePath: string, _options: unknown, listener: () => void) => {
        poll = listener
      },
      unwatchFile: () => undefined,
      setInterval: () => { throw new Error('native recovery must not use setInterval') }
    })
    queue.ensureQueueFile()
    let notified = 0
    const dispose = queue.watch(() => { notified += 1 }, { coalesceMs: 0, recoveryPollMs: 100 })
    appendFileSync(queue.queuePath, `${JSON.stringify({ s: CLI_A, e: 'Stop', t: 10 })}\n`)
    expect(poll).not.toBeNull()
    ;(poll as unknown as () => void)()
    expect(notified).toBe(1)
    dispose()
  })
})

describe('ordered Claude App log state', () => {
  const line = (time: string, message: string) => appState.parseAppStateLine(`${time} [info] ${message}`)

  it('preserves a successful Turn when the generic session teardown follows it', () => {
    const result = appState.foldAppStateEvents([
      line('2026-08-08 09:59:56', `Sending message to session ${LOCAL_A}`),
      line('2026-08-08 09:59:57', `[Result] Turn succeeded for session ${LOCAL_A}`),
      line('2026-08-08 09:59:58', `Stopping session ${LOCAL_A}`)
    ])
    expect(result.state.get(LOCAL_A)).toMatchObject({
      phase: 'completed',
      lastStopAt: Date.parse('2026-08-08T09:59:57'),
      lastSessionEndAt: Date.parse('2026-08-08T09:59:58')
    })
  })

  it('uses stopped for teardown without completion and for an explicit interruption', () => {
    const generic = appState.foldAppStateEvents([
      line('2026-08-08 09:59:56', `Sending message to session ${LOCAL_A}`),
      line('2026-08-08 09:59:58', `Stopping session ${LOCAL_A}`)
    ])
    expect(generic.state.get(LOCAL_A)?.phase).toBe('stopped')
    const interrupted = appState.foldAppStateEvents([
      line('2026-08-08 09:59:56', `Sending message to session ${LOCAL_A}`),
      line('2026-08-08 09:59:58', `[Result] Turn interrupted for session ${LOCAL_A}`)
    ])
    expect(interrupted.state.get(LOCAL_A)?.phase).toBe('stopped')
  })
})

describe('Claude completion/focus hot unread overlay', () => {
  function fixture() {
    const home = makeHome()
    const logs = join(home.root, 'logs')
    const leveldb = join(home.appData, 'Local Storage', 'leveldb')
    mkdirSync(logs, { recursive: true })
    mkdirSync(leveldb, { recursive: true })
    writeFileSync(join(logs, 'main.log'), `${appStateLine('2026-08-13 10:00:00', `[CCD] LocalSessions.setFocusedSession: sessionId=${LOCAL_A}`)}\n`)
    writeFileSync(join(leveldb, 'CURRENT'), 'MANIFEST-000001\n')
    return { home, logs, leveldb, logPath: join(logs, 'main.log') }
  }

  const appStateLine = (time: string, message: string) => `${time} [info] ${message}`

  it('lets a newer completion/focus edge override delayed persisted unread in both directions', async () => {
    const context = fixture()
    let persistedIds = [LOCAL_A]
    const bridge = makeBridge(context.home, {
      claudeLogDirectory: context.logs,
      claudeAppVersion: '1.28929.0',
      claudeLocalStorageRoot: context.leveldb,
      leveldown: mutableUnreadLeveldown(() => persistedIds)
    })

    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [LOCAL_A] })
    appendFileSync(context.logPath, [
      appStateLine('2026-08-13 10:00:01', `Sending message to session ${LOCAL_A}`),
      appStateLine('2026-08-13 10:00:02', `[Stop hook] Query completed for session ${LOCAL_A}`)
    ].join('\n') + '\n')
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [] })
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [] })

    persistedIds = []
    writeFileSync(join(context.leveldb, 'CURRENT'), 'MANIFEST-000002-with-new-size\n')
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [] })

    appendFileSync(context.logPath, [
      appStateLine('2026-08-13 10:00:03', '[CCD] LocalSessions.setFocusedSession: sessionId=null'),
      appStateLine('2026-08-13 10:00:04', `Sending message to session ${LOCAL_B}`),
      appStateLine('2026-08-13 10:00:05', `[Result] Turn succeeded for session ${LOCAL_B}`)
    ].join('\n') + '\n')
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [LOCAL_B] })

    appendFileSync(context.logPath, `${appStateLine('2026-08-13 10:00:06', `[CCD] LocalSessions.setFocusedSession: sessionId=${LOCAL_B}`)}\n`)
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [] })

    appendFileSync(context.logPath, `${appStateLine('2026-08-13 10:00:07', `Sending message to session ${LOCAL_A}`)}\n`)
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [] })
    appendFileSync(context.logPath, `${appStateLine('2026-08-13 10:00:07', `[Result] Turn succeeded for session ${LOCAL_A}`)}\n`)
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [LOCAL_A] })
    bridge.close()
  })

  it('does not mistake a matching unread value from the previous completion for persisted catch-up', async () => {
    const context = fixture()
    let persistedIds = [LOCAL_A]
    const bridge = makeBridge(context.home, {
      claudeLogDirectory: context.logs,
      claudeAppVersion: '1.28929.0',
      claudeLocalStorageRoot: context.leveldb,
      leveldown: mutableUnreadLeveldown(() => persistedIds)
    })

    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [LOCAL_A] })
    appendFileSync(context.logPath, [
      appStateLine('2026-08-13 10:00:01', '[CCD] LocalSessions.setFocusedSession: sessionId=null'),
      appStateLine('2026-08-13 10:00:02', `Sending message to session ${LOCAL_A}`)
    ].join('\n') + '\n')
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [] })

    appendFileSync(context.logPath, `${appStateLine('2026-08-13 10:00:03', `[Result] Turn succeeded for session ${LOCAL_A}`)}\n`)
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [LOCAL_A] })

    // Claude persists the running clear before it persists the new completion.
    // The old implementation acknowledged the coincidentally matching true
    // above and exposed this intermediate false as a rollback.
    persistedIds = []
    writeFileSync(join(context.leveldb, 'CURRENT'), 'MANIFEST-running-clear-with-new-size\n')
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [LOCAL_A] })

    persistedIds = [LOCAL_A]
    writeFileSync(join(context.leveldb, 'CURRENT'), 'MANIFEST-new-completion-caught-up-with-newer-size\n')
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [LOCAL_A] })

    persistedIds = []
    writeFileSync(join(context.leveldb, 'CURRENT'), 'MANIFEST-native-read-after-catch-up-with-newest-size\n')
    await expect(bridge.readCodeUnread()).resolves.toMatchObject({ ids: [] })
    bridge.close()
  })

  it('wakes unread subscribers from the App log even when no state subscriber is mounted', () => {
    const context = fixture()
    const watchers = new Map<string, () => void>()
    const controlledFs = new Proxy(fs, {
      get(target, key) {
        if (key === 'watch') return (directory: string, _options: unknown, listener: () => void) => {
          watchers.set(directory, listener)
          return { on: () => undefined, close: () => watchers.delete(directory) }
        }
        return Reflect.get(target, key)
      }
    })
    const bridge = makeBridge(context.home, {
      fs: controlledFs,
      claudeLogDirectory: context.logs,
      claudeAppVersion: '1.28929.0',
      claudeLocalStorageRoot: context.leveldb,
      leveldown: mutableUnreadLeveldown(() => []),
      watchFile: () => undefined,
      unwatchFile: () => undefined
    })
    let notified = 0
    const dispose = bridge.watchCodeUnread(() => { notified += 1 })
    expect(watchers.has(context.logs)).toBe(true)

    appendFileSync(context.logPath, [
      appStateLine('2026-08-13 10:00:01', '[CCD] LocalSessions.setFocusedSession: sessionId=null'),
      appStateLine('2026-08-13 10:00:02', `Sending message to session ${LOCAL_B}`),
      appStateLine('2026-08-13 10:00:03', `[Result] Turn succeeded for session ${LOCAL_B}`)
    ].join('\n') + '\n')
    watchers.get(context.logs)?.()
    expect(notified).toBe(1)
    dispose()
    bridge.close()
  })
})

describe('Code-mode inventory and correlation', () => {
  it('returns every admitted session without a fixed inventory-count cap', () => {
    const home = makeHome()
    for (let index = 0; index < 405; index += 1) {
      const suffix = index.toString(16).padStart(12, '0')
      const sessionId = `local_00000000-0000-4000-8000-${suffix}`
      const cliSessionId = `10000000-0000-4000-8000-${suffix}`
      writeMetadata(home.codeDirectory, metadata(sessionId, cliSessionId))
    }
    const snapshot = makeBridge(home).readCodeSnapshot({ now: Date.now() })
    expect(snapshot.sessions).toHaveLength(405)
    expect(snapshot.truncated).toBe(false)
  })

  it('reads only App Code metadata and emits only the field whitelist', () => {
    const home = makeHome()
    writeMetadata(home.codeDirectory, metadata(LOCAL_A, CLI_A))
    const foreign = join(home.appData, 'local-agent-mode-sessions', 'org', 'user')
    mkdirSync(foreign, { recursive: true })
    writeMetadata(foreign, metadata(LOCAL_B, CLI_SHARED, { title: 'Cowork' }))
    const bridge = makeBridge(home)
    const snapshot = bridge.readCodeSnapshot({ now: Date.now() })
    expect(snapshot.sessions).toHaveLength(1)
    const projectKey = createHash('sha256').update('codex-project\u0000/work/project').digest('hex').slice(0, 32)
    expect(snapshot.sessions[0]).toMatchObject({ sessionId: LOCAL_A, cliSessionId: CLI_A, title: 'App title', projectKey })
    expect(JSON.stringify(snapshot)).not.toContain('secretPrompt')
    expect(JSON.stringify(snapshot)).not.toContain('bypassPermissions')
    expect(bridge.readSnapshot({ now: Date.now() }).sessions).toEqual([])
  })

  it('marks an unreadable inventory unavailable instead of publishing a verified empty set', () => {
    const home = makeHome()
    const snapshot = makeBridge(home, { claudeCodeRoot: join(home.root, 'missing-code-root') })
      .readCodeSnapshot({ now: Date.now() })
    expect(snapshot).toMatchObject({ available: false, sessions: [] })
  })

  it('rejects metadata whose content identity does not match its canonical filename', () => {
    const home = makeHome()
    writeFileSync(join(home.codeDirectory, `${LOCAL_A}.json`), JSON.stringify(metadata(LOCAL_B, CLI_A)))
    const snapshot = makeBridge(home).readCodeSnapshot({ now: Date.now() })
    expect(snapshot.sessions).toEqual([])
  })

  it('maps a unique CLI hook to its one App wrapper', () => {
    const home = makeHome()
    writeMetadata(home.codeDirectory, metadata(LOCAL_A, CLI_A))
    const bridge = makeBridge(home)
    bridge.readCodeSnapshot({ now: Date.now() })
    const turnAt = Date.now()
    appendFileSync(bridge.queuePath, `${JSON.stringify({ s: CLI_A, e: 'UserPromptSubmit', t: turnAt })}\n${JSON.stringify({ s: CLI_A, e: 'PermissionRequest', t: turnAt + 1 })}\n`)
    expect(bridge.readCodeSnapshot({ now: Date.now() }).sessions[0]).toMatchObject({
      statusCorrelation: 'unique-cli',
      phase: 'waiting-approval'
    })
  })

  it('carries the App sidebar star as isStarred and still drops every non-whitelisted field', () => {
    const home = makeHome()
    writeMetadata(home.codeDirectory, metadata(LOCAL_A, CLI_A, { isStarred: true, completedTurns: 1 }))
    const row = makeBridge(home).readCodeSnapshot({ now: Date.now() }).sessions[0]
    expect(row).toMatchObject({ sessionId: LOCAL_A, isStarred: true })
    expect(JSON.stringify(row)).not.toContain('must never leave metadata reader')
    // Absent or non-boolean star reads as unstarred, never as unknown.
    writeMetadata(home.codeDirectory, metadata(LOCAL_A, CLI_A, { completedTurns: 1 }))
    expect(makeBridge(home).readCodeSnapshot({ now: Date.now() }).sessions[0]).toMatchObject({ isStarred: false })
  })

  it('restores a no-Hook historical App row from completedTurns', () => {
    const home = makeHome()
    writeMetadata(home.codeDirectory, metadata(LOCAL_A, CLI_A, { completedTurns: 3 }))
    const row = makeBridge(home).readCodeSnapshot({ now: Date.now() }).sessions[0]
    expect(row).toMatchObject({
      phase: 'completed',
      stateSource: 'metadata-history',
      completedTurns: 3
    })
  })

  it('keeps completed history when a cold Hook queue contains only SessionEnd', () => {
    const session = {
      ...metadata(LOCAL_A, CLI_A),
      completedTurns: 3,
      metadataUpdatedAt: 100,
      lastActivityAt: 100,
      lastFocusedAt: 90
    }
    const hook = events.foldQueueEntries([event(CLI_A, 'SessionEnd', 200)])
    const row = codeSessions.correlateCodeSessions([session], hook, new Map(), {
      compatibility: 'compatible', generation: 1, entries: []
    }).sessions[0]
    expect(row).toMatchObject({ phase: 'completed', stateSource: 'metadata-history' })
  })

  it('keeps a unique live Hook running when completedTurns is stale activity, not a newer Turn', () => {
    const session = {
      ...metadata(LOCAL_A, CLI_A),
      completedTurns: 1,
      metadataUpdatedAt: 200,
      lastActivityAt: 200,
      lastFocusedAt: 190
    }
    const hook = events.foldQueueEntries([event(CLI_A, 'UserPromptSubmit', 150)])
    const row = codeSessions.correlateCodeSessions([session], hook, new Map(), {
      compatibility: 'compatible', generation: 1, entries: []
    }).sessions[0]
    expect(row).toMatchObject({ phase: 'running', stateSource: 'hook', turnStartedAt: 150 })
  })

  it('lets increased completedTurns retire a unique live Hook from an older Turn', () => {
    const session = {
      ...metadata(LOCAL_A, CLI_A),
      completedTurns: 2,
      metadataUpdatedAt: 200,
      lastActivityAt: 200,
      lastFocusedAt: 190
    }
    const previous = new Map([[LOCAL_A, {
      completedTurns: 1,
      completedEvidenceAt: 80,
      lastActivityAt: 80,
      metadataUpdatedAt: 80
    }]])
    const hook = events.foldQueueEntries([event(CLI_A, 'UserPromptSubmit', 50)])
    const row = codeSessions.correlateCodeSessions([session], hook, previous, {
      compatibility: 'compatible', generation: 1, entries: []
    }).sessions[0]
    expect(row).toMatchObject({ phase: 'completed', stateSource: 'metadata-history' })
  })

  it('lets newer completed metadata retire stale live evidence but not a newer live event', () => {
    const session = {
      ...metadata(LOCAL_A, CLI_A),
      completedTurns: 2,
      metadataUpdatedAt: 200,
      lastActivityAt: 200,
      lastFocusedAt: 190
    }
    const appEntry = (lastEventAt: number) => ({
      sessionId: LOCAL_A,
      phase: 'running',
      phaseUpdatedAt: lastEventAt,
      turnStartedAt: lastEventAt,
      hookActivityAt: lastEventAt,
      waitingApprovalAt: 0,
      waitingInputAt: 0,
      lastStopAt: 0,
      lastSessionEndAt: 0,
      lastEventAt,
      source: 'app-log'
    })
    const stale = codeSessions.correlateCodeSessions([session], new Map(), new Map(), {
      compatibility: 'compatible', generation: 1, entries: [appEntry(100)]
    }).sessions[0]
    expect(stale).toMatchObject({ phase: 'completed', stateSource: 'metadata-history' })
    const current = codeSessions.correlateCodeSessions([session], new Map(), new Map(), {
      compatibility: 'compatible', generation: 2, entries: [appEntry(300)]
    }).sessions[0]
    expect(current).toMatchObject({ phase: 'running', stateSource: 'app-log' })
  })

  it('keeps an exact App terminal above same-Turn Hook tail but accepts a strictly newer Hook Turn', () => {
    const session = {
      ...metadata(LOCAL_A, CLI_A),
      completedTurns: 1,
      metadataUpdatedAt: 80,
      lastActivityAt: 80,
      lastFocusedAt: 70
    }
    const appSnapshot = {
      compatibility: 'compatible',
      generation: 7,
      entries: [{
        sessionId: LOCAL_A,
        phase: 'completed',
        phaseUpdatedAt: 200,
        turnStartedAt: 100,
        hookActivityAt: 150,
        waitingApprovalAt: 0,
        waitingInputAt: 0,
        lastStopAt: 200,
        lastSessionEndAt: 0,
        lastEventAt: 200,
        source: 'app-log'
      }]
    }
    const tail = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 100),
      event(CLI_A, 'Stop', 200),
      event(CLI_A, 'SubagentStop', 300)
    ])
    expect(codeSessions.correlateCodeSessions([session], tail, new Map(), appSnapshot).sessions[0])
      .toMatchObject({ phase: 'completed', stateSource: 'app-log', stateGeneration: 7 })

    const nextTurn = events.foldQueueEntries([
      event(CLI_A, 'UserPromptSubmit', 100),
      event(CLI_A, 'Stop', 200),
      event(CLI_A, 'UserPromptSubmit', 300)
    ])
    expect(codeSessions.correlateCodeSessions([session], nextTurn, new Map(), appSnapshot).sessions[0])
      .toMatchObject({ phase: 'running', stateSource: 'hook', turnStartedAt: 300 })
  })

  it('does not treat a title-only metadata mtime as newer completion evidence', () => {
    const base = {
      ...metadata(LOCAL_A, CLI_A),
      title: 'Old title',
      completedTurns: 2,
      metadataUpdatedAt: 200,
      lastActivityAt: 200,
      lastFocusedAt: 190
    }
    const appSnapshot = {
      compatibility: 'compatible',
      generation: 1,
      entries: [{
        sessionId: LOCAL_A,
        phase: 'running',
        phaseUpdatedAt: 300,
        turnStartedAt: 300,
        hookActivityAt: 300,
        waitingApprovalAt: 0,
        waitingInputAt: 0,
        lastStopAt: 0,
        lastSessionEndAt: 0,
        lastEventAt: 300,
        source: 'app-log'
      }]
    }
    const initial = codeSessions.correlateCodeSessions([base], new Map(), new Map(), appSnapshot)
    expect(initial.sessions[0]).toMatchObject({ phase: 'running', stateSource: 'app-log' })
    const titlePatch = codeSessions.correlateCodeSessions([{
      ...base,
      title: 'New title',
      metadataUpdatedAt: 400
    }], new Map(), initial.nextMetadata, appSnapshot)
    expect(titlePatch.sessions[0]).toMatchObject({ title: 'New title', phase: 'running', stateSource: 'app-log' })
    expect(titlePatch.sessions[0]).not.toHaveProperty('completedEvidenceAt')
  })

  it('publishes the named state delta envelope with independent generation and freshness', () => {
    const home = makeHome()
    writeMetadata(home.codeDirectory, metadata(LOCAL_A, CLI_A, { completedTurns: 1 }))
    const delta = makeBridge(home).readCodeStateSnapshot({ now: Date.now() })
    expect(delta).toMatchObject({
      version: 2,
      generation: 1,
      source: 'metadata-history',
      freshness: { readAt: expect.any(Number), newestEvidenceAt: expect.any(Number) }
    })
    expect(['compatible', 'fallback', 'unsupported']).toContain(delta.compatibility)
  })

  it('keeps duplicate wrappers and refuses to fan one CLI state across them', () => {
    const home = makeHome()
    writeMetadata(home.codeDirectory, metadata(LOCAL_A, CLI_SHARED, { title: 'First wrapper', completedTurns: 2 }))
    writeMetadata(home.codeDirectory, metadata(LOCAL_B, CLI_SHARED, { title: 'Second wrapper', completedTurns: 2 }))
    const bridge = makeBridge(home)
    bridge.readCodeSnapshot({ now: Date.now() })
    appendFileSync(bridge.queuePath, `${JSON.stringify({ s: CLI_SHARED, e: 'Stop', t: Date.now() })}\n`)
    const rows = bridge.readCodeSnapshot({ now: Date.now() }).sessions
    expect(rows).toHaveLength(2)
    expect(rows.every((row: { statusCorrelation: string; phase: string }) => row.statusCorrelation === 'ambiguous' && row.phase === 'unknown')).toBe(true)
  })

  it('uses one exact metadata pulse to disambiguate duplicate wrappers', () => {
    const home = makeHome()
    const initial = Date.now() - 5_000
    writeMetadata(home.codeDirectory, metadata(LOCAL_A, CLI_SHARED, { title: 'First', lastActivityAt: initial }))
    writeMetadata(home.codeDirectory, metadata(LOCAL_B, CLI_SHARED, { title: 'Second', lastActivityAt: initial }))
    const bridge = makeBridge(home)
    bridge.readCodeSnapshot({ now: Date.now() })
    const pulseAt = Date.now()
    writeMetadata(home.codeDirectory, metadata(LOCAL_A, CLI_SHARED, { title: 'First', lastActivityAt: pulseAt }))
    appendFileSync(bridge.queuePath, `${JSON.stringify({ s: CLI_SHARED, e: 'Stop', t: pulseAt })}\n`)
    const rows = bridge.readCodeSnapshot({ now: Date.now() }).sessions
    expect(rows.find((row: { sessionId: string }) => row.sessionId === LOCAL_A)).toMatchObject({
      statusCorrelation: 'metadata-pulse',
      phase: 'completed'
    })
    expect(rows.find((row: { sessionId: string }) => row.sessionId === LOCAL_B)).toMatchObject({
      statusCorrelation: 'ambiguous',
      phase: 'unknown'
    })
  })

  it('accepts a direct local hook as the strongest identity proof', () => {
    const rows = [metadata(LOCAL_C, CLI_SHARED)]
    const hook = events.foldQueueEntries([event(LOCAL_C, 'UserPromptSubmit', 10)])
    const correlated = codeSessions.correlateCodeSessions(rows, hook, new Map()).sessions
    expect(correlated[0]).toMatchObject({ statusCorrelation: 'direct-local', phase: 'running' })
  })
})

describe('quota supplement facade', () => {
  it('forwards an explicitly authorized supplement read to the bounded fallback', async () => {
    const home = makeHome()
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ seven_day_fable: { used_percentage: 46 } })
    }))
    const bridge = makeBridge(home, {
      fetch: fetchImpl,
      readClaudeAppAccessToken: () => 'test-token-never-returned'
    })
    const result = await bridge.readQuotaFallback({
      enabled: true,
      coldStart: false,
      supplement: true,
      now: Date.now(),
      minStaleMs: 60_000
    })
    expect(result?.rateLimits).toEqual({ seven_day_fable: { used_percentage: 46 } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toContain('test-token')
  })
})

describe('exact App-history jump', () => {
  function opener(options: { rows?: unknown[]; capability?: unknown; execError?: Error; withWindows?: boolean; processRunning?: () => Promise<boolean> } = {}) {
    const calls: Array<{ file: string; args: string[] }> = []
    let listCalls = 0
    const dependencies: Record<string, unknown> = {
      platform: 'darwin',
      execFile: (file: string, args: string[], _settings: unknown, done: (error?: Error | null) => void) => {
        calls.push({ file, args })
        done(options.execError || null)
      },
      ...(options.processRunning ? { processRunning: options.processRunning } : {})
    }
    if (options.withWindows !== false) {
      dependencies.windows = {
        list: async () => {
          listCalls += 1
          return ({
          windows: options.rows ?? [{ appId: 'com.anthropic.claude', appName: 'Claude', relationship: 'root', userVisible: true, pid: 0 }],
          capability: options.capability ?? { supported: true, permission: 'granted', canList: true }
        }) }
      }
    }
    return { value: openerModule.createOpener(dependencies), calls, listCalls: () => listCalls }
  }

  it('builds the exact epitaxy URL and keeps the local_ prefix', () => {
    expect(openerModule.desktopEpitaxyUrl(LOCAL_A)).toBe(`claude://claude.ai/epitaxy/${LOCAL_A}`)
  })

  it('dispatches only a canonical App-local id while Claude is positively running', async () => {
    const context = opener()
    const result = await context.value.openTask(LOCAL_A, { platform: 'darwin' })
    expect(result).toMatchObject({ outcome: 'dispatched', confirmsRead: false })
    expect(context.calls).toEqual([{ file: 'open', args: [`claude://claude.ai/epitaxy/${LOCAL_A}`] }])
  })

  it('reuses the positive App presence cache for warm task switches', async () => {
    const context = opener()
    await context.value.openTask(LOCAL_A)
    await context.value.openTask(LOCAL_B)
    expect(context.listCalls()).toBe(1)
    expect(context.calls.map((call) => call.args[0])).toEqual([
      `claude://claude.ai/epitaxy/${LOCAL_A}`,
      `claude://claude.ai/epitaxy/${LOCAL_B}`
    ])
  })

  it('coalesces a synchronous shortcut burst to the latest target', async () => {
    const context = opener()
    const first = context.value.openTask(LOCAL_A)
    const second = context.value.openTask(LOCAL_B)
    expect((await first).outcome).toBe('unavailable')
    expect((await second).outcome).toBe('dispatched')
    expect(context.calls).toEqual([{ file: 'open', args: [`claude://claude.ai/epitaxy/${LOCAL_B}`] }])
  })

  it('accepts a hidden main window as running but excludes helper identities', async () => {
    const hidden = opener({
      rows: [{ appId: 'com.anthropic.claude', appName: 'Claude', relationship: 'root', userVisible: false }]
    })
    expect((await hidden.value.openTask(LOCAL_A)).outcome).toBe('dispatched')
    expect(openerModule.isClaudeDesktopWindow({
      appId: 'com.anthropic.claude.helper',
      appName: 'Claude',
      relationship: 'root'
    })).toBe(false)
  })

  it('rejects a bare CLI id without dispatching', async () => {
    const context = opener()
    expect((await context.value.openTask(CLI_A)).outcome).toBe('unavailable')
    expect(context.calls).toEqual([])
  })

  it('never launches by itself: without a process probe a closed or unproven inventory fails closed', async () => {
    const closed = opener({ rows: [] })
    expect((await closed.value.openTask(LOCAL_A)).outcome).toBe('unavailable')
    expect(closed.calls).toEqual([])
    const unknown = opener({ withWindows: false })
    expect((await unknown.value.openTask(LOCAL_A)).outcome).toBe('unavailable')
    expect(unknown.calls).toEqual([])
  })

  it('fails closed when window permission is unavailable and no process probe is injected', async () => {
    const context = opener({ rows: [], capability: { supported: true, permission: 'required', canList: false } })
    expect((await context.value.openTask(LOCAL_A)).outcome).toBe('unavailable')
    expect(context.calls).toEqual([])
  })

  it('lets an exact-process probe prove presence when the inventory is empty or blocked', async () => {
    const empty = opener({ rows: [], processRunning: async () => true })
    expect((await empty.value.openTask(LOCAL_A)).outcome).toBe('dispatched')
    expect(empty.calls).toEqual([{ file: 'open', args: [`claude://claude.ai/epitaxy/${LOCAL_A}`] }])
    const blocked = opener({
      rows: [],
      capability: { supported: true, permission: 'required', canList: false },
      processRunning: async () => true
    })
    expect((await blocked.value.openTask(LOCAL_A)).outcome).toBe('dispatched')
    const noWindows = opener({ withWindows: false, processRunning: async () => true })
    expect((await noWindows.value.openTask(LOCAL_A)).outcome).toBe('dispatched')
    expect((await noWindows.value.readPresence()).status).toBe('running')
  })

  it('keeps a negative process probe closed and treats a probe failure as unproven', async () => {
    const closed = opener({ rows: [], processRunning: async () => false })
    expect(await closed.value.openTask(LOCAL_A)).toMatchObject({ outcome: 'unavailable', message: 'Claude 桌面端未在运行' })
    expect(closed.calls).toEqual([])
    const broken = opener({ rows: [], processRunning: async () => { throw new Error('pgrep missing') } })
    expect(await broken.value.openTask(LOCAL_A)).toMatchObject({ outcome: 'unavailable', message: 'Claude 桌面端未在运行' })
    const brokenBlocked = opener({
      rows: [],
      capability: { supported: true, permission: 'required', canList: false },
      processRunning: async () => { throw new Error('pgrep missing') }
    })
    expect(await brokenBlocked.value.openTask(LOCAL_A)).toMatchObject({ outcome: 'unavailable', message: '无法确认 Claude 桌面端正在运行' })
  })

  it('fails closed within the cold presence budget when window discovery never returns', async () => {
    vi.useFakeTimers()
    try {
      const value = openerModule.createOpener({
        platform: 'darwin',
        windows: { list: () => new Promise(() => undefined) }
      })
      const pending = value.readPresence()
      await vi.advanceTimersByTimeAsync(openerModule.APP_PRESENCE_PROBE_TIMEOUT_MS)
      expect(await pending).toMatchObject({ status: 'unknown' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports dispatch failure and never claims native read confirmation', async () => {
    const context = opener({ execError: new Error('rejected') })
    expect(await context.value.openTask(LOCAL_A)).toMatchObject({ outcome: 'failed', confirmsRead: false })
  })

  it('contains no legacy import-handler route', () => {
    const source = readFileSync(resolve(process.cwd(), 'preload/claude/open.cjs'), 'utf8')
    expect(source).not.toContain('claude://resume')
  })
})

describe('Claude metadata archive', () => {
  function archiveBridge(options: {
    version?: string
    phase?: 'completed' | 'stopped' | 'running'
    platform?: string
    archived?: boolean
    ambiguous?: boolean
    afterRename?: (filePath: string) => void
    validateWrite?: (value: unknown) => boolean
  } = {}) {
    const home = makeHome()
    const now = Date.parse('2026-08-08T10:00:00')
    const logDirectory = join(home.root, 'logs')
    mkdirSync(logDirectory, { recursive: true })
    const phaseLine = (phase: 'completed' | 'stopped' | 'running', timestamp: string) => phase === 'completed'
      ? `${timestamp} [info] [Result] Turn succeeded for session ${LOCAL_A}`
      : phase === 'stopped'
        ? `${timestamp} [info] Stopping session ${LOCAL_A}`
        : `${timestamp} [info] Sending message to session ${LOCAL_A}`
    writeFileSync(join(logDirectory, 'main.log'), '')
    const row = metadata(LOCAL_A, CLI_A, {
      lastFocusedAt: now - 1_000,
      lastActivityAt: now - 2_000,
      completedTurns: 1,
      isArchived: options.archived === true
    })
    writeMetadata(home.codeDirectory, row)
    if (options.ambiguous) {
      const duplicateDirectory = join(home.appData, 'claude-code-sessions', 'org', 'other-user')
      mkdirSync(duplicateDirectory, { recursive: true })
      writeMetadata(duplicateDirectory, row)
    }
    const execFile = vi.fn()
    const performClaudeArchiveAction = vi.fn()
    const bridge = makeBridge(home, {
      now: () => now,
      claudeAppVersion: options.version ?? '1.26832.0',
      claudeLogDirectory: logDirectory,
      platform: options.platform ?? 'darwin',
      execFile,
      performClaudeArchiveAction,
      afterClaudeArchiveRename: options.afterRename,
      validateClaudeArchiveWrite: options.validateWrite
    })
    bridge.readCodeSnapshot({ now })
    appendFileSync(join(logDirectory, 'main.log'), `${phaseLine(options.phase ?? 'completed', '2026-08-08 09:59:58')}\n`)
    bridge.readCodeSnapshot({ now })
    return {
      bridge,
      home,
      filePath: join(home.codeDirectory, `${LOCAL_A}.json`),
      execFile,
      performClaudeArchiveAction
    }
  }

  it.each(['completed', 'stopped'] as const)('silently archives a %s session in EyPc without claiming native sidebar convergence', async (phase) => {
    const context = archiveBridge({ phase })
    const before = JSON.parse(readFileSync(context.filePath, 'utf8'))
    const levelDb = join(context.home.appData, 'Local Storage', 'leveldb', 'CURRENT')
    mkdirSync(join(context.home.appData, 'Local Storage', 'leveldb'), { recursive: true })
    writeFileSync(levelDb, 'do-not-touch')
    const otherPath = join(context.home.codeDirectory, `${LOCAL_B}.json`)
    writeMetadata(context.home.codeDirectory, metadata(LOCAL_B, CLI_SHARED))
    const otherBefore = readFileSync(otherPath)

    await expect(context.bridge.archiveCodeSession(LOCAL_A)).resolves.toMatchObject({
      outcome: 'archived',
      message: 'EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。'
    })
    const after = JSON.parse(readFileSync(context.filePath, 'utf8'))
    expect(after.isArchived).toBe(true)
    expect({ ...after, isArchived: before.isArchived }).toEqual(before)
    expect(context.bridge.readCodeSnapshot({ now: Date.now() }).sessions.some((row: { sessionId: string }) => row.sessionId === LOCAL_A)).toBe(false)
    expect(context.execFile).not.toHaveBeenCalled()
    expect(context.performClaudeArchiveAction).not.toHaveBeenCalled()
    expect(readFileSync(otherPath)).toEqual(otherBefore)
    expect(readFileSync(levelDb, 'utf8')).toBe('do-not-touch')
    expect(readFileSync(join(context.home.root, 'logs', 'main.log'), 'utf8')).not.toContain('LocalSessions.archive')
    context.bridge.close()
  })

  it('keeps direct stopped-task archive available on the validated Claude App 1.28929.0 schema', async () => {
    const context = archiveBridge({ version: '1.28929.0', phase: 'stopped' })
    const before = JSON.parse(readFileSync(context.filePath, 'utf8'))
    await expect(context.bridge.archiveCodeSession(LOCAL_A)).resolves.toMatchObject({
      outcome: 'archived',
      message: 'EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。'
    })
    const after = JSON.parse(readFileSync(context.filePath, 'utf8'))
    expect(after.isArchived).toBe(true)
    expect({ ...after, isArchived: before.isArchived }).toEqual(before)
    context.bridge.close()
  })

  it('treats an already archived exact file as an idempotent success without writing or opening', async () => {
    const context = archiveBridge({ archived: true })
    const before = readFileSync(context.filePath)
    await expect(context.bridge.archiveCodeSession(LOCAL_A)).resolves.toMatchObject({
      outcome: 'archived',
      alreadyArchived: true,
      message: 'EyPc 已归档并移除。Claude 原生侧栏同步未确认，当前不受支持。'
    })
    expect(readFileSync(context.filePath)).toEqual(before)
    expect(context.execFile).not.toHaveBeenCalled()
    expect(context.performClaudeArchiveAction).not.toHaveBeenCalled()
    context.bridge.close()
  })

  it('refuses to open an already archived exact session before Deep Link dispatch', async () => {
    const context = archiveBridge({ archived: true })
    await expect(context.bridge.openTask(LOCAL_A)).resolves.toMatchObject({
      outcome: 'unavailable',
      errorCode: 'state-changed'
    })
    expect(context.execFile).not.toHaveBeenCalled()
    context.bridge.close()
  })

  it.each([
    { name: 'running phase', options: { phase: 'running' as const } },
    { name: 'unsupported platform', options: { platform: 'linux' } },
    { name: 'ambiguous identity', options: { ambiguous: true } }
  ])('writes nothing for $name', async ({ options }) => {
    const context = archiveBridge(options)
    const before = readFileSync(context.filePath)
    await expect(context.bridge.archiveCodeSession(LOCAL_A)).resolves.toMatchObject({ outcome: 'failed' })
    expect(readFileSync(context.filePath)).toEqual(before)
    expect(context.execFile).not.toHaveBeenCalled()
    expect(context.performClaudeArchiveAction).not.toHaveBeenCalled()
    context.bridge.close()
  })

  it('archives on a non-whitelisted App version through the same structural transaction', async () => {
    const context = archiveBridge({ version: '1.34493.1' })
    await expect(context.bridge.archiveCodeSession(LOCAL_A)).resolves.toMatchObject({ outcome: 'archived' })
    expect(JSON.parse(readFileSync(context.filePath, 'utf8')).isArchived).toBe(true)
    context.bridge.close()
  })

  it('does not overwrite a Claude concurrent write after the atomic rename', async () => {
    const context = archiveBridge({
      afterRename: (filePath) => {
        const current = JSON.parse(readFileSync(filePath, 'utf8'))
        writeFileSync(filePath, JSON.stringify({ ...current, title: 'Claude concurrent title' }))
      }
    })
    await expect(context.bridge.archiveCodeSession(LOCAL_A)).resolves.toMatchObject({ outcome: 'indeterminate' })
    expect(JSON.parse(readFileSync(context.filePath, 'utf8'))).toMatchObject({
      title: 'Claude concurrent title',
      isArchived: true
    })
    context.bridge.close()
  })

  it('rebases onto benign metadata churn before the archive write', () => {
    const home = makeHome()
    const original = metadata(LOCAL_A, CLI_A, { completedTurns: 1, title: 'Before' })
    writeMetadata(home.codeDirectory, original)
    const reader = codeSessions.createCodeSessionReader({
      fs,
      path,
      os: { homedir: () => home.root },
      claudeAppDataRoot: home.appData,
      platform: 'darwin'
    })
    reader.readInventory({ now: Date.now() })
    writeMetadata(home.codeDirectory, { ...original, title: 'Latest title', lastFocusedAt: Date.now() })

    expect(reader.archiveSessionMetadata(LOCAL_A)).toMatchObject({ outcome: 'archived' })
    expect(JSON.parse(readFileSync(join(home.codeDirectory, `${LOCAL_A}.json`), 'utf8'))).toMatchObject({
      title: 'Latest title',
      isArchived: true
    })
    reader.close()
  })

  it('restores the original bytes when semantic verification fails without a concurrent write', async () => {
    const context = archiveBridge({ validateWrite: () => false })
    const before = readFileSync(context.filePath)
    await expect(context.bridge.archiveCodeSession(LOCAL_A)).resolves.toMatchObject({ outcome: 'failed' })
    expect(readFileSync(context.filePath)).toEqual(before)
    context.bridge.close()
  })
})

describe('Claude membership mutation watcher', () => {
  function watcherBridge(readBeforeWatch = true) {
    const home = makeHome()
    writeMetadata(home.codeDirectory, metadata(LOCAL_A, CLI_A, { completedTurns: 1 }))
    let fileListener: ((event: string, filename: string) => void) | null = null
    let recovery: (() => void) | null = null
    let recoveryMs = 0
    let directoryReads = 0
    const watchedFs = new Proxy(fs, {
      get(target, key) {
        if (key === 'watch') return (_directory: string, _options: unknown, listener: (event: string, filename: string) => void) => {
          fileListener = listener
          return { close: () => undefined }
        }
        if (key === 'readdirSync') return (...args: Parameters<typeof fs.readdirSync>) => {
          directoryReads += 1
          return (fs.readdirSync as (...values: Parameters<typeof fs.readdirSync>) => ReturnType<typeof fs.readdirSync>)(...args)
        }
        return Reflect.get(target, key)
      }
    })
    const bridge = makeBridge(home, {
      fs: watchedFs,
      watchFile: (_filePath: string, options: { interval?: number }, listener: () => void) => {
        recovery = listener
        recoveryMs = Number(options?.interval) || 0
      },
      unwatchFile: () => undefined,
      setTimeout: () => { throw new Error('membership wake must not use setTimeout') },
      setInterval: () => { throw new Error('native membership recovery must not use setInterval') }
    })
    if (readBeforeWatch) bridge.readCodeSnapshot({ now: Date.now() })
    return {
      bridge,
      home,
      readInventory: () => bridge.readCodeSnapshot({ now: Date.now() }),
      invokeFile: (filename = `${LOCAL_A}.json`) => fileListener?.('change', filename),
      recover: () => recovery?.(),
      recoveryMs: () => recoveryMs,
      directoryReads: () => directoryReads
    }
  }

  it('publishes an exact remove delta without waiting for a full inventory read', () => {
    const context = watcherBridge()
    const deltas: unknown[] = []
    context.bridge.watchCodeSessions((delta: unknown) => deltas.push(delta))
    writeMetadata(context.home.codeDirectory, metadata(LOCAL_A, CLI_A, { completedTurns: 1, isArchived: true }))
    context.invokeFile()
    expect(deltas).toEqual([expect.objectContaining({
      revision: 'claude-task-mutation-delta-v1',
      generation: 1,
      mutations: [expect.objectContaining({ key: `claude:${LOCAL_A}`, mutation: 'remove' })]
    })])
    context.bridge.close()
  })

  it('retains the verified task when a native callback observes partial metadata JSON', () => {
    const context = watcherBridge()
    const deltas: unknown[] = []
    context.bridge.watchCodeSessions((delta: unknown) => deltas.push(delta))
    writeFileSync(join(context.home.codeDirectory, `${LOCAL_A}.json`), '{"sessionId":')
    context.invokeFile()
    expect(deltas).toEqual([])

    writeMetadata(context.home.codeDirectory, metadata(LOCAL_A, CLI_A, { completedTurns: 1, isArchived: true }))
    context.invokeFile()
    expect(deltas).toEqual([expect.objectContaining({
      mutations: [expect.objectContaining({ key: `claude:${LOCAL_A}`, mutation: 'remove' })]
    })])
    context.bridge.close()
  })

  it('recovers one dropped file callback at the one-second candidate watchdog without rescanning directories', () => {
    const context = watcherBridge()
    const deltas: unknown[] = []
    context.bridge.watchCodeSessions((delta: unknown) => deltas.push(delta))
    const readsBefore = context.directoryReads()
    writeMetadata(context.home.codeDirectory, metadata(LOCAL_A, CLI_A, { completedTurns: 1, isArchived: true }))
    context.recover()
    expect(context.recoveryMs()).toBe(1_000)
    expect(context.directoryReads()).toBe(readsBefore)
    expect(deltas).toEqual([expect.objectContaining({
      mutations: [expect.objectContaining({ key: `claude:${LOCAL_A}`, mutation: 'remove' })]
    })])
    context.bridge.close()
  })

  it('publishes an exact upsert when a canonical metadata file is created in an admitted inventory directory', () => {
    const context = watcherBridge()
    const deltas: unknown[] = []
    context.bridge.watchCodeSessions((delta: unknown) => deltas.push(delta))
    writeMetadata(context.home.codeDirectory, metadata(LOCAL_B, CLI_A, { completedTurns: 1 }))
    context.invokeFile(`${LOCAL_B}.json`)
    expect(deltas).toEqual([expect.objectContaining({
      mutations: [expect.objectContaining({
        key: `claude:${LOCAL_B}`,
        mutation: 'upsert',
        session: expect.objectContaining({ sessionId: LOCAL_B })
      })]
    })])
    expect((deltas[0] as any).mutations[0].session).not.toHaveProperty('phase')
    expect((deltas[0] as any).mutations[0].session).not.toHaveProperty('stateGeneration')
    context.bridge.close()
  })

  it('installs the admitted directory watcher when Host subscribes before the first cold inventory read', () => {
    const context = watcherBridge(false)
    const deltas: unknown[] = []
    context.bridge.watchCodeSessions((delta: unknown) => deltas.push(delta))
    context.readInventory()
    writeMetadata(context.home.codeDirectory, metadata(LOCAL_B, CLI_A, { completedTurns: 1 }))
    context.invokeFile(`${LOCAL_B}.json`)

    expect(deltas).toEqual([expect.objectContaining({
      mutations: [expect.objectContaining({
        key: `claude:${LOCAL_B}`,
        mutation: 'upsert',
        session: expect.objectContaining({ sessionId: LOCAL_B })
      })]
    })])
    context.bridge.close()
  })

  it('fans one membership delta out to both Host and Renderer subscribers', () => {
    const context = watcherBridge()
    const hostDeltas: unknown[] = []
    const rendererDeltas: unknown[] = []
    context.bridge.watchCodeSessions((delta: unknown) => hostDeltas.push(delta))
    context.bridge.watchCodeSessions((delta: unknown) => rendererDeltas.push(delta))
    writeMetadata(context.home.codeDirectory, metadata(LOCAL_A, CLI_A, { completedTurns: 1, isArchived: true }))
    context.invokeFile()

    expect(hostDeltas).toHaveLength(1)
    expect(rendererDeltas).toEqual(hostDeltas)
    context.bridge.close()
  })
})

describe('metadata activity versus a live App append', () => {
  // Real 2026-08-13 reproduction. A pending ExitPlanMode permission request is
  // logged at second granularity while the same open turn keeps advancing
  // `lastActivityAt` in milliseconds. On the first read after a plugin reload
  // there is no retained watermark, so the history watermark is that activity
  // time and outranks the request — the card froze on its previous state and
  // lost its status time. Metadata activity is a proxy for completion, never
  // proof of one, so it must not retire a directly observed live append.
  const WAITING_AT = Date.parse('2026-08-13T14:22:53')
  const coldSession = {
    sessionId: LOCAL_A,
    completedTurns: 2,
    lastActivityAt: WAITING_AT + 7_000,
    metadataUpdatedAt: WAITING_AT + 7_000,
    lastFocusedAt: WAITING_AT + 7_000
  }
  const waitingApp = (evidenceProvenance?: string) => ({
    phase: 'waiting-approval',
    phaseUpdatedAt: WAITING_AT,
    waitingApprovalAt: WAITING_AT,
    turnStartedAt: WAITING_AT - 7_000,
    lastEventAt: 0,
    ...(evidenceProvenance ? { evidenceProvenance } : {})
  })
  const historyAt = () => codeSessions.completedEvidenceAt(coldSession, new Map())

  it('keeps a live-append pending approval authoritative on the first read after reload', () => {
    expect(codeSessions.selectProjectedStateSource(waitingApp('live-append'), null, 'direct-local', historyAt()))
      .toBe('app')
  })

  it('keeps a unique live Hook authoritative on the first read after reload', () => {
    const hook = {
      phase: 'running',
      phaseUpdatedAt: WAITING_AT,
      turnStartedAt: WAITING_AT,
      lastEventAt: WAITING_AT
    }
    expect(codeSessions.selectProjectedStateSource(null, hook, 'unique-cli', historyAt()))
      .toBe('hook')
  })

  it('still retires a live phase that was not observed as a live append', () => {
    expect(codeSessions.selectProjectedStateSource(waitingApp(), null, 'direct-local', historyAt()))
      .toBe('history')
  })

  it('still retires a live-append phase once a genuinely newer turn completed', () => {
    const previous = new Map([[LOCAL_A, { completedTurns: 1, completedEvidenceAt: WAITING_AT - 60_000 }]])
    const confirmed = codeSessions.completedEvidenceAt(coldSession, previous)
    expect(confirmed).toBe(WAITING_AT + 7_000)
    // A confirmed completion still cannot outrank a live append; it closes the
    // branch through the exact terminal event instead.
    expect(codeSessions.selectProjectedStateSource(waitingApp('exact-terminal'), null, 'direct-local', confirmed))
      .toBe('history')
  })

  it('keeps App live-append running over a later Hook stopped without a newer Turn', () => {
    const app = {
      phase: 'running',
      phaseUpdatedAt: 10,
      turnStartedAt: 10,
      lastEventAt: 10,
      evidenceProvenance: 'live-append'
    }
    const hook = {
      phase: 'stopped',
      lastEventAt: 20,
      turnStartedAt: 10,
      lastStopFailureAt: 20
    }
    expect(codeSessions.selectProjectedStateSource(app, hook, 'unique-cli', 0)).toBe('app')
  })

  it('lets Hook win when it proves a strictly newer parent Turn start', () => {
    const app = {
      phase: 'running',
      phaseUpdatedAt: 10,
      turnStartedAt: 10,
      lastEventAt: 10,
      evidenceProvenance: 'live-append'
    }
    const hook = {
      phase: 'running',
      lastEventAt: 40,
      turnStartedAt: 30
    }
    expect(codeSessions.selectProjectedStateSource(app, hook, 'unique-cli', 0)).toBe('hook')
  })

  it('still prefers an exact App failed terminal over same-Turn Hook tails', () => {
    const app = {
      phase: 'stopped',
      phaseUpdatedAt: 20,
      turnStartedAt: 10,
      lastEventAt: 20,
      lastStopAt: 20,
      evidenceProvenance: 'exact-terminal'
    }
    const hook = {
      phase: 'running',
      lastEventAt: 30,
      turnStartedAt: 10
    }
    expect(codeSessions.selectProjectedStateSource(app, hook, 'unique-cli', 0)).toBe('app')
  })
})
