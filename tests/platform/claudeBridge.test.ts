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
  function opener(options: { rows?: unknown[]; capability?: unknown; execError?: Error; withWindows?: boolean } = {}) {
    const calls: Array<{ file: string; args: string[] }> = []
    let listCalls = 0
    const dependencies: Record<string, unknown> = {
      platform: 'darwin',
      execFile: (file: string, args: string[], _settings: unknown, done: (error?: Error | null) => void) => {
        calls.push({ file, args })
        done(options.execError || null)
      }
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

  it('does not auto-launch when Claude is closed or running proof is unavailable', async () => {
    const closed = opener({ rows: [] })
    expect((await closed.value.openTask(LOCAL_A)).outcome).toBe('unavailable')
    expect(closed.calls).toEqual([])
    const unknown = opener({ withWindows: false })
    expect((await unknown.value.openTask(LOCAL_A)).outcome).toBe('unavailable')
    expect(unknown.calls).toEqual([])
  })

  it('fails closed when window permission is unavailable', async () => {
    const context = opener({ rows: [], capability: { supported: true, permission: 'required', canList: false } })
    expect((await context.value.openTask(LOCAL_A)).outcome).toBe('unavailable')
    expect(context.calls).toEqual([])
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

describe('version-gated Claude metadata archive', () => {
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
    { name: 'unsupported version', options: { version: '1.26831.0' } },
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
