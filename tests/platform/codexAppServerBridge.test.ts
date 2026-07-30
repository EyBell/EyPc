import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import * as pathModule from 'node:path'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

interface RpcFrame {
  id?: number
  method: string
  params?: Record<string, unknown>
}

class FakeCodexProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  exitCode: number | null = null
  killed = false
  endCalls = 0
  writes: RpcFrame[] = []
  threadRecencyOffset = 0
  bulkInventoryCount = 0
  transientTurnsFailures = 0
  holdFirstPromptPages = false
  archiveThreadId = '42345678-1234-4234-8234-123456789abc'
  archiveThreadStatus: string | null = 'notLoaded'
  archiveThreadRecency = 2_000_000_070
  archivedIds = new Set<string>()
  inventoryPageSize = 0
  cursorLoop = false
  projectBatchMode = false
  archiveNoopIds = new Set<string>()
  emptyTurnIds = new Set<string>()
  missingTurnStartedAtIds = new Set<string>()
  inProgressTurnIds = new Set<string>()
  failedTurnIds = new Set<string>()
  interruptedTurnIds = new Set<string>()
  createdThreadId = '92345678-1234-4234-8234-123456789abc'
  createdModelOverride = ''
  failTurnStart = false
  failCreateCleanup = false
  includeCreatedThreadInInventory = false
  createdThreadReadMisses = 0

  constructor(
    private readonly failInitialize = false,
    private readonly exitOnEnd = true,
    private readonly failMissingNode = false,
    public unsupportedTurnsList = false
  ) {
    super()
  }

  stdin = {
    write: (line: string) => {
      const frame = JSON.parse(line) as RpcFrame
      this.writes.push(frame)
      if (!Number.isInteger(frame.id)) return true
      if (this.failMissingNode && frame.method === 'initialize') {
        queueMicrotask(() => {
          this.stderr.emit('data', 'env: node: No such file or directory\n')
          this.exitCode = 127
          this.emit('exit', 127)
        })
        return true
      }
      if (this.failInitialize && frame.method === 'initialize') {
        queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify({ id: frame.id, error: { code: -32_000, message: 'initialize failed' } })}\n`))
        return true
      }
      if (this.unsupportedTurnsList && frame.method === 'thread/turns/list') {
        queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify({ id: frame.id, error: { code: -32601, message: 'method not found' } })}\n`))
        return true
      }
      if (this.transientTurnsFailures > 0 && frame.method === 'thread/turns/list') {
        this.transientTurnsFailures -= 1
        queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify({ id: frame.id, error: { code: -32_000, message: 'transient turn read failure' } })}\n`))
        return true
      }
      if (this.holdFirstPromptPages && frame.method === 'thread/turns/list' && frame.params?.limit === 50) return true
      const result = this.responseFor(frame.method, frame.params)
      queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify({ id: frame.id, result })}\n`))
      return true
    },
    end: () => {
      this.endCalls += 1
      if (!this.exitOnEnd || this.exitCode !== null) return
      this.exitCode = 0
      queueMicrotask(() => this.emit('exit', 0))
    }
  }

  private responseFor(method: string, params?: Record<string, unknown>) {
    if (method === 'initialize') return {}
    if (method === 'account/rateLimits/read') {
      return {
        rateLimitsByLimitId: {
          codex: {
            limitId: 'codex',
            planType: 'pro',
            primary: { usedPercent: 20, resetsAt: 2_000_000_000, windowDurationMins: 300 },
            secondary: { usedPercent: 65, resetsAt: 2_000_600_000, windowDurationMins: 10_080 }
          },
          codex_bengalfox: {
            limitId: 'codex_bengalfox',
            limitName: 'GPT-5.3-Codex-Spark',
            primary: { usedPercent: 5, resetsAt: 2_000_700_000, windowDurationMins: 10_080 }
          }
        }
      }
    }
    if (method === 'account/read') return { requiresOpenaiAuth: false, account: { planType: 'pro', accountId: 'private-account' } }
    if (method === 'config/read') return { config: { model: 'gpt-5.6', model_reasoning_effort: 'high', service_tier: 'priority', secret: 'private-config' } }
    if (method === 'model/list') return {
      data: [
        { id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true, inputModalities: ['text'] },
        { id: 'gpt-5.3-codex-spark', displayName: 'GPT-5.3 Codex Spark', inputModalities: ['text'] }
      ]
    }
    if (method === 'thread/start') return {
      model: this.createdModelOverride || params?.model,
      cwd: typeof params?.cwd === 'string' ? params.cwd : '/tmp/chats',
      thread: {
        id: this.createdThreadId
      }
    }
    if (method === 'turn/start') {
      if (this.failTurnStart) throw new Error('turn start failed')
      return { turn: { id: 'turn-created' } }
    }
    if (method === 'thread/list') {
      if (params?.archived === true) {
        return this.page([...this.archivedIds].map((id) => ({ id, name: '已归档', status: { type: 'notLoaded', activeFlags: [] }, recencyAt: 2_000_000_000 })), params)
      }
      if (this.bulkInventoryCount > 0) {
        return this.page(Array.from({ length: this.bulkInventoryCount }, (_, index) => ({
            id: `${(index + 1).toString(16).padStart(8, '0')}-1234-4234-8234-123456789abc`,
            name: `批量任务 ${index + 1}`,
            status: { type: 'notLoaded', activeFlags: [] },
            recencyAt: 2_100_000_000 - index
          })).filter((thread) => !this.archivedIds.has(thread.id)), params)
      }
      const rows = [
          {
            id: '12345678-1234-4234-8234-123456789abc',
            name: '完善 Codex 悬浮球',
            status: { type: 'active', activeFlags: ['waitingOnUserInput', 'waitingOnApproval', 'privateFlag'] },
            createdAt: 1_800_000_000,
            recencyAt: 2_000_000_100,
            preview: 'private prompt',
            cwd: '/private/workspace',
            turns: [{ text: 'private response' }]
          },
          { id: '22345678-1234-4234-8234-123456789abc', name: '运行中', status: { type: 'active', activeFlags: [] }, recencyAt: 2_000_000_090 },
          { id: '32345678-1234-4234-8234-123456789abc', name: '空闲', status: { type: 'idle', activeFlags: ['waitingOnUserInput'] }, recencyAt: 2_000_000_080 },
          { id: '42345678-1234-4234-8234-123456789abc', name: '跨端未知', status: { type: 'notLoaded', activeFlags: ['waitingOnApproval'] }, recencyAt: 2_000_000_070 + this.threadRecencyOffset },
          { id: '52345678-1234-4234-8234-123456789abc', name: '系统异常', status: { type: 'systemError', activeFlags: ['waitingOnApproval'] }, recencyAt: 2_000_000_060 },
          ...(this.includeCreatedThreadInInventory
            ? [{ id: this.createdThreadId, name: '刚创建的待输入任务', status: { type: 'active', activeFlags: [] }, recencyAt: 2_000_000_110 }]
            : [])
        ]
      return this.page(rows.filter((thread) => !this.archivedIds.has(thread.id)), params)
    }
    if (method === 'thread/turns/list') {
      const threadId = typeof params?.threadId === 'string' ? params.threadId : ''
      if (this.emptyTurnIds.has(threadId)) return { data: [] }
      const isFirstBulkThread = threadId === '00000001-1234-4234-8234-123456789abc'
      const inProgress = this.inProgressTurnIds.has(threadId) || (this.projectBatchMode && isFirstBulkThread)
      const failed = this.failedTurnIds.has(threadId)
      const interrupted = this.interruptedTurnIds.has(threadId)
      return {
        data: [{
          status: inProgress ? 'inProgress' : failed ? 'failed' : interrupted ? 'interrupted' : 'completed',
          ...(this.missingTurnStartedAtIds.has(threadId) ? {} : { startedAt: 1_900_000_000 }),
          ...(inProgress || failed || interrupted ? {} : { completedAt: 2_000_000_071 }),
          items: [{ text: 'private turn body that must not cross the bridge' }]
        }]
      }
    }
    if (method === 'thread/read') {
      if (params?.threadId === this.createdThreadId) {
        if (this.createdThreadReadMisses > 0) {
          this.createdThreadReadMisses -= 1
          return { thread: { id: this.archiveThreadId, status: { type: 'notLoaded', activeFlags: [] } } }
        }
        return {
          thread: {
            id: this.createdThreadId,
            name: '刚创建的待输入任务',
            status: { type: 'active', activeFlags: [] },
            recencyAt: 2_000_000_110,
            cwd: '/tmp/chats'
          }
        }
      }
      if (this.projectBatchMode && typeof params?.threadId === 'string') {
        const index = Number.parseInt(params.threadId.slice(0, 8), 16) - 1
        const isBulk = this.bulkInventoryCount > 0
        const fixedRecency = [2_000_000_100, 2_000_000_090, 2_000_000_080, 2_000_000_070 + this.threadRecencyOffset, 2_000_000_060]
        return {
          thread: {
            id: params.threadId,
            name: `批量任务 ${index + 1}`,
            status: { type: index === 0 ? 'active' : 'notLoaded', activeFlags: [] },
            recencyAt: isBulk ? 2_100_000_000 - index : fixedRecency[index]
          }
        }
      }
      return {
        thread: {
          id: this.archiveThreadId,
          name: '跨端未知',
          status: this.archiveThreadStatus ? { type: this.archiveThreadStatus, activeFlags: [] } : {},
          recencyAt: this.archiveThreadRecency,
          preview: 'private archive preview',
          cwd: '/private/archive-workspace',
          turns: [{ text: 'private archive turn' }]
        }
      }
    }
    if (method === 'thread/archive') {
      if (this.failCreateCleanup && params?.threadId === this.createdThreadId) throw new Error('cleanup failed')
      if (typeof params?.threadId === 'string' && !this.archiveNoopIds.has(params.threadId)) this.archivedIds.add(params.threadId)
      return {}
    }
    throw new Error(`unexpected RPC method: ${method}`)
  }

  private page<T>(rows: T[], params?: Record<string, unknown>) {
    const pageSize = this.inventoryPageSize > 0 ? this.inventoryPageSize : Math.max(1, rows.length)
    const cursor = typeof params?.cursor === 'string' ? params.cursor : ''
    const offset = cursor.startsWith('offset:') ? Number.parseInt(cursor.slice(7), 10) || 0 : 0
    const data = rows.slice(offset, offset + pageSize)
    if (offset + pageSize >= rows.length) return { data }
    return { data, nextCursor: this.cursorLoop ? 'loop' : `offset:${offset + pageSize}` }
  }
}

class FakeCodexDesktopSocket extends EventEmitter {
  writable = true
  streamOwnerConnected = true
  activeSnapshotThreadIds = new Set<string>()
  waitingInputSnapshotThreadIds = new Set<string>()
  unreadSnapshotThreadIds = new Set<string>([FIXED_THREAD_IDS[3]])
  writes: Array<Record<string, any>> = []

  open() {
    queueMicrotask(() => this.emit('connect'))
    return this
  }

  write(frame: Buffer, callback?: () => void) {
    const length = frame.readUInt32LE(0)
    const message = JSON.parse(frame.subarray(4, length + 4).toString('utf8')) as Record<string, any>
    this.writes.push(message)
    queueMicrotask(() => callback?.())
    if (message.type === 'request' && message.method === 'initialize') {
      this.push({
        type: 'response',
        method: 'initialize',
        requestId: message.requestId,
        resultType: 'success',
        result: { clientId: 'eypc-test-client' }
      })
    }
    if (this.streamOwnerConnected && message.type === 'broadcast' && message.method === 'thread-stream-following-changed' && message.params?.following === true) {
      const threadId = message.params.conversationId as string
      const waitingInput = threadId === FIXED_THREAD_IDS[0] || this.waitingInputSnapshotThreadIds.has(threadId)
      const activeSnapshot = waitingInput || this.activeSnapshotThreadIds.has(threadId)
      this.push({
        type: 'broadcast',
        method: 'thread-stream-state-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 11,
        params: {
          hostId: 'local',
          conversationId: threadId,
          change: {
            type: 'snapshot',
            revision: 1,
            conversationState: {
              threadRuntimeStatus: { type: activeSnapshot ? 'active' : 'idle', activeFlags: [] },
              resumeState: '',
              hasUnreadTurn: this.unreadSnapshotThreadIds.has(threadId),
              requests: waitingInput ? [{ type: 'userInput', method: 'requestUserInput' }] : [],
              conversation: [{ role: 'user', content: 'private desktop snapshot content' }]
            }
          }
        }
      })
    }
    return true
  }

  push(message: Record<string, any>) {
    queueMicrotask(() => {
      if (!this.writable) return
      const body = Buffer.from(JSON.stringify(message), 'utf8')
      const frame = Buffer.allocUnsafe(body.length + 4)
      frame.writeUInt32LE(body.length, 0)
      body.copy(frame, 4)
      this.emit('data', frame)
    })
  }

  destroy() {
    if (!this.writable) return
    this.writable = false
    queueMicrotask(() => this.emit('close'))
  }
}

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void

function noSystemProxyExecFile(
  _command: string,
  _args: string[],
  _options: Record<string, unknown>,
  callback: ExecFileCallback
) {
  queueMicrotask(() => callback(null, '', ''))
}

const FIXED_THREAD_IDS = [1, 2, 3, 4, 5].map((index) => `${index}2345678-1234-4234-8234-123456789abc`)
const BULK_THREAD_IDS = Array.from({ length: 100 }, (_, index) => `${(index + 1).toString(16).padStart(8, '0')}-1234-4234-8234-123456789abc`)

function nativeRegistryText() {
  return JSON.stringify({
    'local-projects': {
      'local-test': { id: 'local-test', name: 'Test Project', rootPaths: ['/tmp/project'], createdAt: 1, updatedAt: 1 }
    },
    'project-order': ['local-test'],
    'pinned-project-ids': ['local-test'],
    'pinned-thread-ids': [FIXED_THREAD_IDS[0]],
    'thread-project-assignments': {},
    'projectless-thread-ids': [...new Set([...FIXED_THREAD_IDS, ...BULK_THREAD_IDS, '92345678-1234-4234-8234-123456789abc'])]
  })
}

function nativeRegistryTextWithUnread(threadIds: string[]) {
  const value = JSON.parse(nativeRegistryText()) as Record<string, unknown>
  value['electron-persisted-atom-state'] = JSON.stringify({
    'unread-thread-ids-by-host-v1': JSON.stringify({ local: threadIds })
  })
  return JSON.stringify(value)
}

function loadCodexBridge(
  child: FakeCodexProcess,
  readRegistry: (candidate: string, readIndex: number) => string = () => nativeRegistryText(),
  desktopSocket: FakeCodexDesktopSocket | null = null,
  useHostDate = false
) {
  const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
  const spawn = vi.fn(() => child)
  const execFile = vi.fn(noSystemProxyExecFile)
  const openExternal = vi.fn(async () => undefined)
  const registryReads: string[] = []
  const nativeStateWatchers: Array<(event: string, filename: string) => void> = []
  const sandbox = {
    window: {} as Record<string, unknown>,
    globalThis: {} as Record<string, unknown>,
    process: {
      platform: 'darwin',
      arch: 'arm64',
      env: { CODEX_HOME: '/tmp/.codex', CODEX_CLI_PATH: '/tmp/codex' },
      cwd: () => '/host/eypc',
      getuid: () => 501
    },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    require(name: string) {
      if (name === 'node:buffer') return { Buffer }
      if (name === 'node:child_process') return { execFile, spawn }
      if (name === 'node:crypto') return crypto
      if (name === 'node:net') return { connect: vi.fn(() => desktopSocket?.open()) }
      if (name === 'node:fs') return {
        existsSync: (candidate: string) => candidate === '/tmp/codex' || Boolean(desktopSocket && candidate === '/tmp/.codex/ipc/ipc.sock'),
        lstatSync: (candidate: string) => {
          if (desktopSocket && candidate === '/tmp/.codex/ipc') return { isDirectory: () => true, uid: 501, mode: 0o700 }
          if (desktopSocket && candidate === '/tmp/.codex/ipc/ipc.sock') return { isSocket: () => true, uid: 501, mode: 0o600 }
          throw new Error('not found')
        },
        readdirSync: () => [],
        readFileSync: (candidate: string) => {
          registryReads.push(candidate)
          return readRegistry(candidate, registryReads.length - 1)
        },
        realpathSync: (candidate: string) => candidate,
        statSync: (candidate: string) => {
          if (candidate === '/tmp/.codex/.codex-global-state.json' || candidate === '/tmp/.codex/.codex-global-state.json.bak') return { isFile: () => true, size: 1024 }
          return { isFile: () => false, size: 1 }
        },
        promises: {},
        watch: (_candidate: string, _options: Record<string, unknown>, listener: (event: string, filename: string) => void) => {
          nativeStateWatchers.push(listener)
          return { close() {}, unref() {}, on() {} }
        }
      }
      if (name === 'node:path') return pathModule
      if (name === 'node:os') return { homedir: () => '/tmp' }
      if (name === 'electron') return { ipcRenderer: { on() {} }, shell: { openExternal } }
      throw new Error(`unexpected require: ${name}`)
    }
  }
  if (useHostDate) Object.assign(sandbox, { Date })
  sandbox.globalThis = sandbox
  vm.runInNewContext(`${preload}\nglobalThis.__codexNativeTest = { parseCodexNativeRegistryText, readCodexNativeRegistry, codexThreadNativeProject };`, sandbox, { filename: 'preload.js' })
  return {
    bridge: (sandbox.window as {
      eypcPlatform: {
        codex: {
          readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>>
          readActivitySnapshot(): Promise<Record<string, any>>
          onActivityChanged(listener: (delta: Record<string, any>) => void): () => void
          createThread(request: Record<string, unknown>): Promise<Record<string, any>>
          archiveThread(actionAlias: string, request: Record<string, unknown>): Promise<Record<string, any>>
          archiveProject(actionAlias: string, request: Record<string, unknown>): Promise<Record<string, any>>
          close(): void
        }
      }
    }).eypcPlatform.codex,
    native: (sandbox as unknown as {
      __codexNativeTest: {
        parseCodexNativeRegistryText(text: string): Record<string, any>
        readCodexNativeRegistry(): Record<string, any>
        codexThreadNativeProject(thread: Record<string, unknown>, registry: Record<string, any>): Record<string, any> | null
      }
    }).__codexNativeTest,
    registryReads,
    spawn,
    openExternal,
    triggerNativeStateChange: () => nativeStateWatchers.forEach((listener) => listener('change', '.codex-global-state.json'))
  }
}

describe('Codex App Server preload bridge', () => {
  it('creates a model-pinned thread through the dedicated bridge and opens only a thread deep link', async () => {
    const child = new FakeCodexProcess()
    const { bridge, openExternal } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: true, includeConfig: true, includeThreads: true })
    const chats = snapshot.value.projects.find((project: Record<string, unknown>) => project.key === 'chats')
    const prompt = '用语音输入的临时提示词'
    const result = await bridge.createThread({
      target: {
        projectKey: 'chats',
        projectAlias: chats.actionAlias,
        projectName: 'Chats',
        projectKind: 'chats',
        projectFingerprint: snapshot.value.sourceFingerprint
      },
      modelId: 'gpt-5.6-sol',
      contextFingerprint: snapshot.value.newThreadContextFingerprint,
      mode: 'send-and-open',
      selectionKind: 'auto',
      prompt
    })

    expect(result).toEqual({ outcome: 'opened', modelId: 'gpt-5.6-sol', retryAllowed: false })
    expect(child.writes.find((frame) => frame.method === 'thread/start')?.params).toMatchObject({
      model: 'gpt-5.6-sol',
      allowProviderModelFallback: false,
      ephemeral: false
    })
    expect(child.writes.find((frame) => frame.method === 'turn/start')?.params).toEqual({
      threadId: child.createdThreadId,
      input: [{ type: 'text', text: prompt }]
    })
    expect(openExternal).toHaveBeenCalledWith(`codex://threads/${child.createdThreadId}`)
    expect(JSON.stringify(result)).not.toContain(prompt)
    expect(openExternal.mock.calls.flat().join(' ')).not.toContain(prompt)
    bridge.close()
  })

  it('returns a fresh safe context when the frozen quota/catalog/project fingerprint is stale', async () => {
    const child = new FakeCodexProcess()
    const { bridge } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: true, includeConfig: true, includeThreads: true })
    const chats = snapshot.value.projects.find((project: Record<string, unknown>) => project.key === 'chats')
    const result = await bridge.createThread({
      target: { projectKey: 'chats', projectAlias: chats.actionAlias, projectName: 'Chats', projectKind: 'chats', projectFingerprint: snapshot.value.sourceFingerprint },
      modelId: 'gpt-5.6-sol',
      contextFingerprint: 'f'.repeat(64),
      mode: 'create-empty',
      selectionKind: 'auto'
    })
    expect(result).toMatchObject({
      outcome: 'stale-selection',
      errorCode: 'selection-stale',
      context: {
        modelCatalog: { status: 'ok', models: expect.arrayContaining([expect.objectContaining({ id: 'gpt-5.6-sol' })]) },
        projectFingerprint: snapshot.value.sourceFingerprint
      }
    })
    expect(JSON.stringify(result.context)).not.toContain('/tmp')
    expect(child.writes.some((frame) => frame.method === 'thread/start')).toBe(false)
    bridge.close()
  })

  it('cleans a zero-turn thread after first-turn failure and stops retry when cleanup cannot be confirmed', async () => {
    const child = new FakeCodexProcess()
    const { bridge } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: true, includeConfig: true, includeThreads: true })
    const chats = snapshot.value.projects.find((project: Record<string, unknown>) => project.key === 'chats')
    const request = {
      target: { projectKey: 'chats', projectAlias: chats.actionAlias, projectName: 'Chats', projectKind: 'chats', projectFingerprint: snapshot.value.sourceFingerprint },
      modelId: 'gpt-5.6-sol',
      contextFingerprint: snapshot.value.newThreadContextFingerprint,
      mode: 'send-and-open',
      selectionKind: 'auto',
      prompt: '保留在编辑器内存中的草稿'
    }
    child.failTurnStart = true
    await expect(bridge.createThread(request)).resolves.toMatchObject({ outcome: 'failed', errorCode: 'turn-start-failed', retryAllowed: true })
    expect(child.writes).toContainEqual(expect.objectContaining({ method: 'thread/archive', params: { threadId: child.createdThreadId } }))

    child.failCreateCleanup = true
    await expect(bridge.createThread(request)).resolves.toMatchObject({ outcome: 'failed', errorCode: 'cleanup-failed', retryAllowed: false })
    bridge.close()
  })

  it('keeps a started turn alive when deep-link opening fails and returns a short-lived reopen alias', async () => {
    const child = new FakeCodexProcess()
    const { bridge, openExternal } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: true, includeConfig: true, includeThreads: true })
    const chats = snapshot.value.projects.find((project: Record<string, unknown>) => project.key === 'chats')
    openExternal.mockRejectedValueOnce(new Error('open failed'))
    const result = await bridge.createThread({
      target: { projectKey: 'chats', projectAlias: chats.actionAlias, projectName: 'Chats', projectKind: 'chats', projectFingerprint: snapshot.value.sourceFingerprint },
      modelId: 'gpt-5.6-sol',
      contextFingerprint: snapshot.value.newThreadContextFingerprint,
      mode: 'send-and-open',
      selectionKind: 'auto',
      prompt: '首轮已经成功启动'
    })
    expect(result).toMatchObject({ outcome: 'reopen-available', errorCode: 'open-failed', reopenAlias: expect.stringMatching(/^ct_/) })
    expect(child.writes.filter((frame) => frame.method === 'thread/archive' && frame.params?.threadId === child.createdThreadId)).toHaveLength(0)
    bridge.close()
  })

  it('uses the desktop bridge watchdog without polling App Server and accepts an exact App Server active event', async () => {
    const child = new FakeCodexProcess()
    const { bridge } = loadCodexBridge(child)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(baseline).toMatchObject({ ok: true, value: { completeness: 'verified' } })
    const writesBeforeActivity = child.writes.length

    const activity = await bridge.readActivitySnapshot()
    expect(activity).toMatchObject({ ok: true, value: { version: 2, inventoryChanged: false, desktopBridgeState: 'not-running' } })
    expect(activity.value.entries).toHaveLength(5)
    expect(child.writes.slice(writesBeforeActivity)).toEqual([])

    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
    child.stdout.emit('data', `${JSON.stringify({ method: 'thread/status/changed', params: { threadId: FIXED_THREAD_IDS[0], status: { type: 'active', activeFlags: [] } } })}\n`)
    expect(deltas.at(-1)).toMatchObject({
      version: 2,
      desktopBridgeState: 'not-running',
      inventoryChanged: false,
      entries: [{ key: baseline.value.threads[0].key, status: 'active', activeFlags: [], statusAuthority: 'app-server-live', unreadAuthority: 'unavailable' }]
    })

    child.stdout.emit('data', `${JSON.stringify({ method: 'turn/completed', params: { threadId: FIXED_THREAD_IDS[0] } })}\n`)
    expect(deltas.at(-1)).toMatchObject({ inventoryChanged: true, inventoryRefreshPriority: 'urgent', entries: [] })
    const statusReadsBeforeEventRefresh = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length
    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: true })
    const statusReadsAfterEventRefresh = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length
    expect(statusReadsAfterEventRefresh - statusReadsBeforeEventRefresh).toBe(2)
    stop()
    bridge.close()
  })

  it('publishes fresh started and completed Turn notifications immediately without latest-Turn rereads', async () => {
    const child = new FakeCodexProcess()
    const { bridge } = loadCodexBridge(child)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))

    child.stdout.emit('data', `${JSON.stringify({ method: 'thread/status/changed', params: { threadId: FIXED_THREAD_IDS[0], status: { type: 'active', activeFlags: [] } } })}\n`)
    const statusReadsBefore = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: FIXED_THREAD_IDS[0],
        turn: {
          id: 'private-turn-id',
          status: 'inProgress',
          startedAt: 2_000_000_200,
          items: [{ text: 'private started body' }]
        }
      }
    })}\n`)
    expect(deltas.at(-1)).toMatchObject({
      inventoryChanged: false,
      entries: [{
        key: baseline.value.threads[0].key,
        lastTurnStatus: 'inProgress',
        lastTurnStartedAt: 2_000_000_200_000,
        lastTurnEvidence: 'turn-started'
      }]
    })
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId: FIXED_THREAD_IDS[0],
        turn: {
          id: 'private-turn-id',
          status: 'completed',
          startedAt: 2_000_000_200,
          completedAt: 2_000_000_201,
          items: [{ text: 'private completion body' }]
        }
      }
    })}\n`)

    expect(deltas.at(-1)).toMatchObject({
      inventoryChanged: false,
      entries: [{
        key: baseline.value.threads[0].key,
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 2_000_000_200_000,
        lastTurnCompletedAt: 2_000_000_201_000,
        lastTurnEvidence: 'turn-completed'
      }]
    })
    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1)).toHaveLength(statusReadsBefore)
    expect(JSON.stringify(deltas)).not.toContain(FIXED_THREAD_IDS[0])
    expect(JSON.stringify(deltas)).not.toContain('private-turn-id')
    expect(JSON.stringify(deltas)).not.toContain('private started body')
    expect(JSON.stringify(deltas)).not.toContain('private completion body')
    stop()
    bridge.close()
  })

  it('accepts an exact completed notification without completedAt and uses startedAt as the revision', async () => {
    const child = new FakeCodexProcess()
    child.inProgressTurnIds.add(FIXED_THREAD_IDS[3])
    const { bridge } = loadCodexBridge(child)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = baseline.value.threads[3]

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId: FIXED_THREAD_IDS[3],
        turn: { status: 'completed', startedAt: 1_900_000_000 }
      }
    })}\n`)

    const entry = (await bridge.readActivitySnapshot()).value.entries.find((item: Record<string, any>) => item.key === task.key)
    expect(entry).toMatchObject({
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 1_900_000_000_000,
      lastTurnEvidence: 'turn-completed'
    })
    expect(entry).not.toHaveProperty('lastTurnCompletedAt')
    bridge.close()
  })

  it('promotes a late native unread write over a stale completion snapshot false', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000_300_000)
    try {
      let nativeUnread = false
      const child = new FakeCodexProcess()
      const desktopSocket = new FakeCodexDesktopSocket()
      desktopSocket.unreadSnapshotThreadIds.delete(FIXED_THREAD_IDS[0])
      const { bridge, triggerNativeStateChange } = loadCodexBridge(
        child,
        () => nativeRegistryTextWithUnread(nativeUnread ? [FIXED_THREAD_IDS[0]] : []),
        desktopSocket,
        true
      )
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await Promise.resolve()
      await Promise.resolve()
      const task = baseline.value.threads[0]
      const deltas: Array<Record<string, any>> = []
      const stop = bridge.onActivityChanged((delta) => deltas.push(delta))

      desktopSocket.push({
        type: 'broadcast',
        method: 'thread-stream-state-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 11,
        params: {
          hostId: 'local',
          conversationId: FIXED_THREAD_IDS[0],
          change: {
            type: 'patches',
            baseRevision: 1,
            revision: 2,
            patches: [{ op: 'replace', path: ['hasUnreadTurn'], value: false }]
          }
        }
      })
      await Promise.resolve()

      child.stdout.emit('data', `${JSON.stringify({
        method: 'turn/completed',
        params: {
          threadId: FIXED_THREAD_IDS[0],
          turn: { status: 'completed', startedAt: 2_000_000_200, completedAt: 2_000_000_201 }
        }
      })}\n`)
      await Promise.resolve()
      expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        lastTurnStatus: 'completed',
        hasUnreadTurn: false
      })

      nativeUnread = true
      triggerNativeStateChange()
      await vi.advanceTimersByTimeAsync(25)

      expect(deltas.at(-1)).toMatchObject({
        entries: [{
          key: task.key,
          readStateOnly: true,
          hasUnreadTurn: true,
          unreadAuthority: 'desktop-persisted'
        }]
      })
      expect(deltas.at(-1)?.entries?.[0]).not.toHaveProperty('status')
      stop()
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies the shared late-unread path to an ordinary active completion', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000_400_000)
    try {
      let nativeUnread = false
      const child = new FakeCodexProcess()
      child.inProgressTurnIds.add(FIXED_THREAD_IDS[1])
      const desktopSocket = new FakeCodexDesktopSocket()
      desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[1])
      desktopSocket.unreadSnapshotThreadIds.delete(FIXED_THREAD_IDS[1])
      const { bridge, triggerNativeStateChange } = loadCodexBridge(
        child,
        () => nativeRegistryTextWithUnread(nativeUnread ? [FIXED_THREAD_IDS[1]] : []),
        desktopSocket,
        true
      )
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await Promise.resolve()
      await Promise.resolve()
      const task = baseline.value.threads[1]
      const deltas: Array<Record<string, any>> = []
      const stop = bridge.onActivityChanged((delta) => deltas.push(delta))

      child.inProgressTurnIds.delete(FIXED_THREAD_IDS[1])
      child.stdout.emit('data', `${JSON.stringify({
        method: 'turn/completed',
        params: {
          threadId: FIXED_THREAD_IDS[1],
          turn: { status: 'completed', startedAt: 2_000_000_300, completedAt: 2_000_000_301 }
        }
      })}\n`)
      await Promise.resolve()
      nativeUnread = true
      triggerNativeStateChange()
      await vi.advanceTimersByTimeAsync(25)

      expect(deltas.at(-1)).toMatchObject({
        entries: [{ key: task.key, readStateOnly: true, hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' }]
      })
      expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        lastTurnStatus: 'completed',
        lastTurnEvidence: 'turn-completed',
        hasUnreadTurn: true
      })
      stop()
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('hydrates an existing native unread over snapshot false and keeps a later exact read event stronger', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.unreadSnapshotThreadIds.delete(FIXED_THREAD_IDS[2])
    const { bridge } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([FIXED_THREAD_IDS[2]]),
      desktopSocket
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[2]

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      lastTurnStatus: 'completed',
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-persisted'
    })

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-read-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 2,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[2], hasUnreadTurn: false }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: false,
      unreadAuthority: 'desktop-live'
    })
    bridge.close()
  })

  it('accepts a resumed interrupted Turn completion whose second-granular timestamp does not exceed the live active observation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000_071_900)
    try {
      const child = new FakeCodexProcess()
      child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
      const desktopSocket = new FakeCodexDesktopSocket()
      desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
      const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket, true)
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await Promise.resolve()
      await Promise.resolve()

      const task = baseline.value.threads[3]
      expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'active',
        statusAuthority: 'desktop-live',
        desktopActiveSince: 2_000_000_071_900,
        lastTurnStatus: 'interrupted',
        lastTurnStartedAt: 1_900_000_000_000
      })

      const statusReadsBefore = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length
      const deltas: Array<Record<string, any>> = []
      const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
      child.interruptedTurnIds.delete(FIXED_THREAD_IDS[3])
      child.stdout.emit('data', `${JSON.stringify({
        method: 'turn/completed',
        params: {
          threadId: FIXED_THREAD_IDS[3],
          turn: {
            id: 'private-fast-turn-id',
            status: 'completed',
            startedAt: 1_900_000_000,
            completedAt: 2_000_000_071,
            items: [{ text: 'private fast completion body' }]
          }
        }
      })}\n`)
      await Promise.resolve()

      expect(deltas.at(-1)).toMatchObject({
        inventoryChanged: false,
        entries: [{
          key: task.key,
          status: 'active',
          statusAuthority: 'desktop-live',
          lastTurnStatus: 'completed',
          lastTurnStartedAt: 1_900_000_000_000,
          lastTurnCompletedAt: 2_000_000_071_000,
          lastTurnEvidence: 'turn-completed'
        }]
      })
      expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1)).toHaveLength(statusReadsBefore)
      expect(JSON.stringify(deltas)).not.toContain(FIXED_THREAD_IDS[3])
      expect(JSON.stringify(deltas)).not.toContain('private-fast-turn-id')
      expect(JSON.stringify(deltas)).not.toContain('private fast completion body')
      desktopSocket.push({
        type: 'broadcast',
        method: 'thread-read-state-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 2,
        params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[3], hasUnreadTurn: true }
      })
      await Promise.resolve()
      expect(deltas.at(-1)).toMatchObject({
        entries: [{ key: task.key, readStateOnly: true, hasUnreadTurn: true, unreadAuthority: 'desktop-live' }]
      })
      stop()
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('promotes an exact same-revision started event after a completed outcome', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[3]
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: FIXED_THREAD_IDS[3],
        turn: { status: 'inProgress', startedAt: 1_900_000_000 }
      }
    })}\n`)
    await Promise.resolve()

    expect(deltas.at(-1)).toMatchObject({
      inventoryChanged: false,
      entries: [{
        key: task.key,
        status: 'active',
        statusAuthority: 'desktop-live',
        lastTurnStatus: 'inProgress',
        lastTurnStartedAt: 1_900_000_000_000
      }]
    })
    stop()
    bridge.close()
  })

  it('marks the nested thread/started identity dirty so a new task rereads only its latest Turn', async () => {
    const child = new FakeCodexProcess()
    const { bridge } = loadCodexBridge(child)
    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: true })
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
    const statusReadsBefore = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length

    child.includeCreatedThreadInInventory = true
    child.stdout.emit('data', `${JSON.stringify({
      method: 'thread/started',
      params: {
        thread: {
          id: child.createdThreadId,
          name: 'private new task',
          cwd: '/private/new-task',
          preview: 'private new-task body'
        }
      }
    })}\n`)
    expect(deltas.at(-1)).toMatchObject({ inventoryChanged: true, inventoryRefreshPriority: 'urgent', entries: [] })
    const refreshed = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(refreshed).toMatchObject({ ok: true, value: { threads: expect.arrayContaining([expect.objectContaining({ name: '刚创建的待输入任务' })]) } })
    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1)).toHaveLength(statusReadsBefore + 1)
    expect(JSON.stringify(deltas)).not.toContain(child.createdThreadId)
    expect(JSON.stringify(deltas)).not.toContain('private new task')
    expect(JSON.stringify(deltas)).not.toContain('/private/new-task')
    expect(JSON.stringify(deltas)).not.toContain('private new-task body')
    stop()
    bridge.close()
  })

  it('retains an unknown Desktop waiting-input shadow and registers it by exact read while thread/list still lags', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
    const statusReadsBefore = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length

    desktopSocket.activeSnapshotThreadIds.add(child.createdThreadId)
    desktopSocket.waitingInputSnapshotThreadIds.add(child.createdThreadId)
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: child.createdThreadId,
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: false,
            requests: [{ type: 'userInput', method: 'requestUserInput' }],
            conversation: [{ role: 'assistant', content: 'private new-task body' }]
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(deltas.at(-1)).toMatchObject({ inventoryChanged: true, inventoryRefreshPriority: 'urgent', entries: [] })

    const refreshed = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const created = refreshed.value.threads.find((thread: Record<string, any>) => thread.name === '刚创建的待输入任务')
    expect(created).toMatchObject({ status: 'active', activeFlags: ['waitingOnUserInput'], statusAuthority: 'desktop-live' })
    const statusReadsAfter = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length
    expect(statusReadsAfter - statusReadsBefore).toBe(1)
    expect(child.writes.filter((frame) => frame.method === 'thread/read' && frame.params?.threadId === child.createdThreadId)).toHaveLength(1)
    expect(deltas.at(-1)).toMatchObject({
      inventoryChanged: false,
      entries: [expect.objectContaining({ key: created.key, status: 'active', activeFlags: ['waitingOnUserInput'], statusAuthority: 'desktop-live' })]
    })
    expect(JSON.stringify(deltas)).not.toContain(child.createdThreadId)
    expect(JSON.stringify(refreshed.value)).not.toContain('private new-task body')
    stop()
    bridge.close()
  })

  it('keeps an unregistered live shadow across one missed exact read until inventory catches up', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    child.createdThreadReadMisses = 1
    desktopSocket.streamOwnerConnected = false
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: child.createdThreadId,
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: false,
            requests: [{ type: 'userInput', method: 'requestUserInput' }],
            conversation: [{ role: 'assistant', content: 'private pending body' }]
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const missed = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(missed.value.threads.some((thread: Record<string, any>) => thread.name === '刚创建的待输入任务')).toBe(false)

    child.includeCreatedThreadInInventory = true
    const recovered = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const created = recovered.value.threads.find((thread: Record<string, any>) => thread.name === '刚创建的待输入任务')
    expect(created).toMatchObject({ status: 'active', activeFlags: ['waitingOnUserInput'], statusAuthority: 'desktop-live' })
    expect(JSON.stringify(recovered.value)).not.toContain('private pending body')
    bridge.close()
  })

  it('projects a completed Plan implementation request as waiting input immediately even when runtime is idle', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads.find((thread: Record<string, any>) => thread.name === '运行中')
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
    const statusReadsBefore = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[1],
        change: {
          type: 'patches',
          baseRevision: 1,
          revision: 2,
          patches: [
            { op: 'replace', path: ['resumeState'], value: 'needs_resume' },
            {
              op: 'add',
              path: ['requests', 0],
              value: {
                type: 'serverRequest',
                method: 'item/plan/requestImplementation',
                planContent: 'private plan body'
              }
            }
          ]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(deltas.at(-1)).toMatchObject({
      inventoryChanged: false,
      entries: [{
        key: task.key,
        status: 'active',
        activeFlags: ['waitingOnUserInput'],
        statusAuthority: 'desktop-live',
        activityEvidence: 'activity-event',
        activityRevision: 2
      }]
    })
    expect(deltas.at(-1)?.entries?.[0]).not.toHaveProperty('lastTurnEvidence')
    const statusReadsAfter = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length
    expect(statusReadsAfter).toBe(statusReadsBefore)
    expect(JSON.stringify(deltas)).not.toContain('private plan body')
    stop()
    bridge.close()
  })

  it('projects private Codex Desktop snapshots into live authority and dispatches archive broadcasts after verification', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const activity = await bridge.readActivitySnapshot()
    expect(activity).toMatchObject({ ok: true, value: { version: 2, desktopBridgeState: 'connected' } })
    expect(activity.value.entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[0].key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      statusAuthority: 'desktop-live',
      activityEvidence: 'initial-snapshot',
      activityRevision: 1,
      desktopActiveSince: expect.any(Number),
      hasUnreadTurn: false,
      unreadAuthority: 'desktop-live'
    })
    expect(activity.value.entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[3].key)).toMatchObject({
      status: 'idle',
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-live'
    })
    expect(JSON.stringify(activity.value)).not.toContain(FIXED_THREAD_IDS[0])
    expect(JSON.stringify(activity.value)).not.toContain('private desktop snapshot content')

    const liveTask = baseline.value.threads[0]
    child.archiveThreadId = FIXED_THREAD_IDS[0]
    child.archiveThreadStatus = 'notLoaded'
    child.archiveThreadRecency = liveTask.updatedAt
    await expect(bridge.archiveThread(liveTask.actionAlias, {
      expectedUpdatedAt: liveTask.updatedAt,
      expectedRevisionAt: liveTask.lastTurnCompletedAt,
      expectedCompletionAt: liveTask.lastTurnCompletedAt,
      expectedLastTurnStartedAt: liveTask.lastTurnStartedAt,
      expectedSourceFingerprint: baseline.value.sourceFingerprint,
      evidence: 'completed'
    })).resolves.toMatchObject({ outcome: 'failed', errorCode: 'active-task' })
    expect(child.writes).not.toContainEqual(expect.objectContaining({ method: 'thread/archive', params: { threadId: FIXED_THREAD_IDS[0] } }))

    const completed = baseline.value.threads[3]
    child.archiveThreadId = FIXED_THREAD_IDS[3]
    child.archiveThreadStatus = 'notLoaded'
    child.archiveThreadRecency = completed.updatedAt
    const archiveResult = await bridge.archiveThread(completed.actionAlias, {
      expectedUpdatedAt: completed.updatedAt,
      expectedRevisionAt: completed.lastTurnCompletedAt,
      expectedCompletionAt: completed.lastTurnCompletedAt,
      expectedLastTurnStartedAt: completed.lastTurnStartedAt,
      expectedSourceFingerprint: baseline.value.sourceFingerprint,
      evidence: 'completed'
    })
    expect(archiveResult).toEqual({ outcome: 'archived', desktopSync: 'dispatched' })
    expect(desktopSocket.writes).toContainEqual(expect.objectContaining({
      type: 'broadcast',
      method: 'thread-archived',
      version: 2,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[3], cwd: '/private/archive-workspace' }
    }))

    desktopSocket.streamOwnerConnected = false
    desktopSocket.push({
      type: 'broadcast',
      method: 'client-status-changed',
      sourceClientId: 'desktop-broker',
      version: 0,
      params: { clientId: 'codex-desktop-owner', status: 'disconnected' }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const disconnectedActivity = await bridge.readActivitySnapshot()
    expect(disconnectedActivity.value.entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[0].key)).toMatchObject({
      statusAuthority: 'connector',
      unreadAuthority: 'unavailable'
    })
    bridge.close()
  })

  it('keeps stopped authority while Codex Desktop switches its followed task', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const task = baseline.value.threads[3]
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'idle',
      statusAuthority: 'desktop-live',
      lastTurnStatus: 'interrupted'
    })

    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
    const writesBeforeSwitch = desktopSocket.writes.length
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-following-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 1,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[3], following: false }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(desktopSocket.writes.slice(writesBeforeSwitch)).toContainEqual(expect.objectContaining({
      type: 'broadcast',
      method: 'thread-stream-following-changed',
      targetClientIds: ['codex-desktop-owner'],
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[3], following: true }
    }))
    const switchedEntries = deltas.flatMap((delta) => delta.entries || [])
      .filter((entry: Record<string, any>) => entry.key === task.key)
    expect(switchedEntries.length).toBeGreaterThan(0)
    expect(switchedEntries.every((entry: Record<string, any>) => entry.status === 'idle' && entry.statusAuthority === 'desktop-live')).toBe(true)
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'idle',
      statusAuthority: 'desktop-live',
      lastTurnStatus: 'interrupted'
    })
    stop()
    bridge.close()
  })

  it('lets a fresh App Server active event outrank a replayed interrupted Desktop idle snapshot', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const task = baseline.value.threads[3]
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'idle',
      statusAuthority: 'desktop-live',
      lastTurnStatus: 'interrupted'
    })

    child.interruptedTurnIds.delete(FIXED_THREAD_IDS[3])
    child.inProgressTurnIds.add(FIXED_THREAD_IDS[3])
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: FIXED_THREAD_IDS[3],
        turn: { status: 'inProgress', startedAt: 1_900_000_000 }
      }
    })}\n`)
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      lastTurnStatus: 'inProgress'
    })

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-following-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 1,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[3], following: false }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress'
    })

    expect((await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).value.threads
      .find((thread: Record<string, any>) => thread.key === task.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress'
    })
    bridge.close()
  })

  it('reconciles a previously interrupted Turn when a task-switch refollow replays the old active snapshot', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const task = baseline.value.threads[3]
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'desktop-live',
      lastTurnStatus: 'interrupted'
    })

    const turnsBeforeSwitch = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.threadId === FIXED_THREAD_IDS[3]).length
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
    child.interruptedTurnIds.delete(FIXED_THREAD_IDS[3])
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-following-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 1,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[3], following: false }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.threadId === FIXED_THREAD_IDS[3]).length).toBeGreaterThan(turnsBeforeSwitch)
    const completedEntries = deltas.flatMap((delta) => delta.entries || [])
      .filter((entry: Record<string, any>) => entry.key === task.key && entry.lastTurnStatus === 'completed')
    expect(completedEntries.at(-1)).toMatchObject({
      status: 'active',
      statusAuthority: 'desktop-live',
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 1_900_000_000_000,
      lastTurnCompletedAt: 2_000_000_071_000,
      lastTurnEvidence: 'targeted-after-exit'
    })
    expect(JSON.stringify(deltas)).not.toContain(FIXED_THREAD_IDS[3])
    stop()
    bridge.close()
  })

  it('ignores private state patches and confirms an active-to-idle task with one targeted latest-Turn read', async () => {
    const child = new FakeCodexProcess()
    child.inProgressTurnIds.add(FIXED_THREAD_IDS[0])
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(baseline.value.threads[0]).toMatchObject({ lastTurnStatus: 'inProgress' })

    const turnsBeforeExit = child.writes.filter((frame) => frame.method === 'thread/turns/list')
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
    child.inProgressTurnIds.delete(FIXED_THREAD_IDS[0])
    const resubscribeWritesBefore = desktopSocket.writes.filter((frame) => frame.method === 'thread-stream-following-changed').length
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[0],
        change: {
          type: 'patches',
          baseRevision: 1,
          revision: 2,
          patches: [
            {
              op: 'replace',
              path: ['turnHistory', 'history', 'entitiesByKey', 'private-turn', 'items', '0', 'content', '0', 'text'],
              value: 'private completion body'
            },
            { op: 'replace', path: ['threadRuntimeStatus', 'type'], value: 'idle' },
            { op: 'replace', path: ['requests'], value: [] },
            { op: 'replace', path: ['hasUnreadTurn'], value: false }
          ]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const turnsAfterExit = child.writes.filter((frame) => frame.method === 'thread/turns/list')
    expect(turnsAfterExit).toHaveLength(turnsBeforeExit.length + 1)
    expect(turnsAfterExit.at(-1)?.params).toEqual({
      threadId: FIXED_THREAD_IDS[0],
      limit: 1,
      sortDirection: 'desc',
      itemsView: 'notLoaded'
    })
    expect(desktopSocket.writes.filter((frame) => frame.method === 'thread-stream-following-changed')).toHaveLength(resubscribeWritesBefore)
    expect(deltas.at(-1)).toMatchObject({
      inventoryChanged: false,
      entries: [{
        key: baseline.value.threads[0].key,
        status: 'idle',
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 1_900_000_000_000,
        lastTurnCompletedAt: 2_000_000_071_000,
        lastTurnEvidence: 'targeted-after-exit'
      }]
    })
    expect(JSON.stringify(deltas)).not.toContain(FIXED_THREAD_IDS[0])
    expect(JSON.stringify(deltas)).not.toContain('private completion body')
    stop()
    bridge.close()
  })

  it('settles an uncorroborated terminal active snapshot after bounded Turn rereads and restores a real new Turn', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_100_000_000_000)
    try {
      const child = new FakeCodexProcess()
      child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
      const desktopSocket = new FakeCodexDesktopSocket()
      desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
      const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket, true)
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await Promise.resolve()
      await Promise.resolve()
      const task = baseline.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')
      const initial = await bridge.readActivitySnapshot()
      expect(initial.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'active',
        statusAuthority: 'desktop-live',
        lastTurnStatus: 'interrupted'
      })

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1_400)

      const settled = await bridge.readActivitySnapshot()
      expect(settled.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'idle',
        statusAuthority: 'desktop-live',
        lastTurnStatus: 'interrupted'
      })
      expect(settled.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).not.toHaveProperty('desktopActiveSince')
      expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.threadId === FIXED_THREAD_IDS[3])).toHaveLength(5)

      child.stdout.emit('data', `${JSON.stringify({
        method: 'turn/started',
        params: {
          threadId: FIXED_THREAD_IDS[3],
          turn: { status: 'inProgress', startedAt: 1_900_000_100 }
        }
      })}\n`)
      await Promise.resolve()

      const resumed = await bridge.readActivitySnapshot()
      expect(resumed.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'active',
        statusAuthority: 'desktop-live',
        lastTurnStatus: 'inProgress',
        lastTurnStartedAt: 1_900_000_100_000,
        desktopActiveSince: 2_100_000_001_400
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.threadId === FIXED_THREAD_IDS[3])).toHaveLength(5)
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a replayed active snapshot current when a targeted read finds same-revision inProgress after completion', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeCodexProcess()
      const desktopSocket = new FakeCodexDesktopSocket()
      desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
      const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket, true)
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await Promise.resolve()
      await Promise.resolve()
      const task = baseline.value.threads[3]

      child.inProgressTurnIds.add(FIXED_THREAD_IDS[3])
      await vi.advanceTimersByTimeAsync(0)

      expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'active',
        statusAuthority: 'desktop-live',
        lastTurnStatus: 'inProgress',
        lastTurnStartedAt: 1_900_000_000_000
      })
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a live desktop unread event authoritative without a stream shadow and drops it when its owner stops following', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.streamOwnerConnected = false
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-read-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 2,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[3], hasUnreadTurn: true }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const readStateEntry = deltas.at(-1)?.entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[3].key)
    expect(readStateEntry).toEqual({
      key: baseline.value.threads[3].key,
      readStateOnly: true,
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-live'
    })
    expect(readStateEntry).not.toHaveProperty('status')

    const refreshed = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const liveActivity = await bridge.readActivitySnapshot()
    expect(refreshed).toMatchObject({ ok: true, value: { completeness: 'verified' } })
    expect(liveActivity.value.entries.find((entry: Record<string, any>) => entry.key === refreshed.value.threads[3].key)).toMatchObject({
      statusAuthority: 'connector',
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-live'
    })

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-following-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 1,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[3], following: false }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const fallbackActivity = await bridge.readActivitySnapshot()
    expect(fallbackActivity.value.entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[3].key)).toMatchObject({
      hasUnreadTurn: false,
      unreadAuthority: 'unavailable'
    })
    stop()
    bridge.close()
  })

  it('keeps an unread-only stream patch from re-emitting an active shadow', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[0],
        change: {
          type: 'patches',
          baseRevision: 1,
          revision: 2,
          patches: [{ op: 'replace', path: ['hasUnreadTurn'], value: true }]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const readStateEntry = deltas.at(-1)?.entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[0].key)
    expect(readStateEntry).toEqual({
      key: baseline.value.threads[0].key,
      readStateOnly: true,
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-live'
    })
    expect(readStateEntry).not.toHaveProperty('status')
    stop()
    bridge.close()
  })

  it('preserves the original desktopActiveSince when an active snapshot replaces an existing active shadow', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const activity1 = await bridge.readActivitySnapshot()
    const entry1 = activity1.value.entries.find((entry: Record<string, any>) => entry.key && entry.desktopActiveSince)
    expect(entry1).toBeTruthy()
    const originalActiveSince = entry1!.desktopActiveSince

    await new Promise((resolve) => setTimeout(resolve, 50))

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[0],
        change: {
          type: 'snapshot',
          revision: 99,
          conversationState: {
            threadRuntimeStatus: { type: 'active', activeFlags: ['waitingOnUserInput'] },
            requests: [],
            hasUnreadTurn: false
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const activity2 = await bridge.readActivitySnapshot()
    const entry2 = activity2.value.entries.find((entry: Record<string, any>) => entry.key === entry1!.key)
    expect(entry2!.desktopActiveSince).toBe(originalActiveSince)
    bridge.close()
  })

  it('uses only allowlisted App Server methods and projects privacy-safe snapshots', async () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const child = new FakeCodexProcess()
    const spawn = vi.fn(() => child)
    const execFile = vi.fn((command: string, _args: string[], _options: Record<string, unknown>, callback: ExecFileCallback) => {
      if (command === '/usr/sbin/scutil') {
        queueMicrotask(() => callback(null, '<dictionary> {\n  ProxyAutoConfigEnable : 1\n  ProxyAutoConfigURLString : http://127.0.0.1:33331/commands/pac\n}\n', ''))
        return
      }
      if (command === '/usr/bin/curl') {
        queueMicrotask(() => callback(null, 'function FindProxyForURL(url, host) {\n  return "PROXY 127.0.0.1:7897; SOCKS5 127.0.0.1:7897; DIRECT;";\n}\n', ''))
        return
      }
      queueMicrotask(() => callback(new Error('unexpected executable'), '', ''))
    })
    const openExternal = vi.fn(async () => undefined)
    const sandbox = {
      window: {} as Record<string, unknown>,
      globalThis: {} as Record<string, unknown>,
      process: { platform: 'darwin', env: { PATH: '/usr/bin:/bin' }, cwd: () => '/host/eypc' },
      setTimeout,
      clearTimeout,
      queueMicrotask,
      require(name: string) {
        if (name === 'node:buffer') return { Buffer }
        if (name === 'node:child_process') return { execFile, spawn }
        if (name === 'node:crypto') return crypto
        if (name === 'node:net') return { connect: vi.fn() }
        if (name === 'node:fs') return {
          existsSync: (candidate: string) => candidate === '/tmp/.nvm/versions/node/v24.14.0/bin/codex' || candidate === '/tmp/.nvm/versions/node/v24.14.0/bin/node',
          readdirSync: (candidate: string) => candidate === '/tmp/.nvm/versions/node' ? [{ name: 'v24.14.0', isDirectory: () => true }] : [],
          readFileSync: (candidate: string) => candidate === '/tmp/.codex/.codex-global-state.json' ? nativeRegistryText() : (() => { throw new Error('not found') })(),
          realpathSync: (candidate: string) => candidate.endsWith('/bin/codex') ? '/tmp/.nvm/versions/node/v24.14.0/lib/node_modules/@openai/codex/bin/codex.js' : candidate,
          statSync: (candidate: string) => ({ isFile: () => false, size: candidate === '/tmp/.codex/.codex-global-state.json' ? Buffer.byteLength(nativeRegistryText()) : 1 }),
          promises: {}
        }
        if (name === 'node:path') return pathModule
        if (name === 'node:os') return { homedir: () => '/tmp' }
        if (name === 'electron') return { ipcRenderer: { on() {} }, shell: { openExternal } }
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(`${preload}\nwindow.__codexTestState = { codexThreadActions };`, sandbox, { filename: 'preload.js' })

    const bridge = (sandbox.window as {
      eypcPlatform: {
        codex: {
           readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>>
           openThread(alias: string): Promise<Record<string, unknown>>
           archiveThread(alias: string, request: Record<string, unknown>): Promise<Record<string, unknown>>
           close(): void
        }
      }
    }).eypcPlatform.codex
    const result = await bridge.readSnapshot({ includeQuota: true, includeConfig: true, includeThreads: true })

    expect(result.ok).toBe(true)
    expect(result.value.quota).toMatchObject({ plan: 'pro', short: { remainingPercent: 80 }, weekly: { remainingPercent: 35 } })
    expect(result.value.config).toEqual({ model: 'gpt-5.6', reasoningEffort: 'high', serviceTier: 'priority' })
    expect(result.value.threads).toHaveLength(5)
    expect(result.value.threads[0]).toMatchObject({ name: '完善 Codex 悬浮球', status: 'active', activeFlags: ['waitingOnUserInput', 'waitingOnApproval'], statusAuthority: 'connector', unreadAuthority: 'unavailable', createdAt: 1_800_000_000_000 })
    expect(result.value.threads[3]).toMatchObject({
      status: 'notLoaded',
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 1_900_000_000_000,
      lastTurnCompletedAt: 2_000_000_071_000
    })
    expect(result.value.taskAuthority).toBe('mixed')
    expect(result.value.threads.map((thread: Record<string, unknown>) => ({ status: thread.status, activeFlags: thread.activeFlags }))).toEqual([
      { status: 'active', activeFlags: ['waitingOnUserInput', 'waitingOnApproval'] },
      { status: 'active', activeFlags: [] },
      { status: 'idle', activeFlags: [] },
      { status: 'notLoaded', activeFlags: [] },
      { status: 'systemError', activeFlags: [] }
    ])
    expect(result.value.threads[0].key).toMatch(/^[a-f0-9]{32}$/)
    expect(result.value.threads[0].actionAlias).toMatch(/^ct_[A-Za-z0-9_-]+$/)

    const serialized = JSON.stringify(result.value)
    expect(serialized).not.toContain('12345678-1234-4234-8234-123456789abc')
    expect(serialized).not.toContain('private prompt')
    expect(serialized).not.toContain('/private/workspace')
    expect(serialized).not.toContain('private response')
    expect(serialized).not.toContain('private turn body')
    expect(serialized).not.toContain('private-account')
    expect(serialized).not.toContain('private-config')
    expect(serialized).not.toContain('127.0.0.1:7897')
    expect(serialized).not.toContain('nextCursor')

    expect(spawn).toHaveBeenCalledWith(
      '/tmp/.nvm/versions/node/v24.14.0/bin/node',
      ['/tmp/.nvm/versions/node/v24.14.0/lib/node_modules/@openai/codex/bin/codex.js', 'app-server', '--listen', 'stdio://'],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: '/tmp',
        env: expect.objectContaining({
          PATH: '/tmp/.nvm/versions/node/v24.14.0/bin:/usr/bin:/bin',
          HTTP_PROXY: 'http://127.0.0.1:7897',
          HTTPS_PROXY: 'http://127.0.0.1:7897',
          http_proxy: 'http://127.0.0.1:7897',
          https_proxy: 'http://127.0.0.1:7897'
        })
      })
    )
    expect(execFile.mock.calls.map((call) => call[0])).toEqual(['/usr/sbin/scutil', '/usr/bin/curl'])
    expect(child.writes.map((frame) => frame.method)).toEqual(expect.arrayContaining([
      'initialize',
      'initialized',
      'account/rateLimits/read',
      'account/read',
      'config/read',
      'thread/list',
      'thread/turns/list'
    ]))
    const turnsCalls = child.writes.filter((frame) => frame.method === 'thread/turns/list')
    expect(turnsCalls).toHaveLength(5)
    expect(turnsCalls.every((frame) => frame.params?.limit === 1 && frame.params?.sortDirection === 'desc' && frame.params?.itemsView === 'notLoaded')).toBe(true)
    const notLoadedCall = turnsCalls.find((frame) => frame.params?.threadId === '42345678-1234-4234-8234-123456789abc')
    expect(notLoadedCall?.params).toMatchObject({
      limit: 1,
      sortDirection: 'desc',
      itemsView: 'notLoaded'
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    const enriched = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(enriched.value.threads[0]).toMatchObject({ lastTurnStartedAt: 1_900_000_000_000, projectKey: 'chats' })
    expect(JSON.stringify(enriched.value)).not.toContain('cursor')
    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 50)).toHaveLength(0)

    const alias = result.value.threads[0].actionAlias as string
    await expect(bridge.openThread(alias)).resolves.toMatchObject({ outcome: 'opened' })
    expect(openExternal).toHaveBeenCalledWith('codex://threads/12345678-1234-4234-8234-123456789abc')

    const unknownAlias = result.value.threads[4].actionAlias as string
    child.archiveThreadId = '52345678-1234-4234-8234-123456789abc'
    child.archiveThreadStatus = 'systemError'
    child.archiveThreadRecency = 2_000_000_060
    await expect(bridge.archiveThread(unknownAlias, {
      expectedUpdatedAt: result.value.threads[4].updatedAt,
      expectedRevisionAt: result.value.threads[4].updatedAt,
      expectedLastTurnStartedAt: result.value.threads[4].lastTurnStartedAt,
      expectedSourceFingerprint: result.value.sourceFingerprint,
      evidence: 'unknown'
    })).resolves.toMatchObject({ outcome: 'failed', errorCode: 'invalid-request' })

    const pendingAlias = result.value.threads[3].actionAlias as string
    const pendingCompletedAt = result.value.threads[3].lastTurnCompletedAt as number
    const pendingUpdatedAt = result.value.threads[3].updatedAt as number
    const pendingRequest = {
      expectedUpdatedAt: pendingUpdatedAt,
      expectedRevisionAt: pendingCompletedAt,
      expectedCompletionAt: pendingCompletedAt,
      expectedLastTurnStartedAt: result.value.threads[3].lastTurnStartedAt,
      expectedSourceFingerprint: result.value.sourceFingerprint,
      evidence: 'completed'
    }
    child.archiveThreadStatus = null
    await expect(bridge.archiveThread(pendingAlias, pendingRequest)).resolves.toMatchObject({ outcome: 'failed', errorCode: 'state-changed' })
    child.archiveThreadStatus = 'notLoaded'
    child.archiveThreadId = '72345678-1234-4234-8234-123456789abc'
    await expect(bridge.archiveThread(pendingAlias, pendingRequest)).resolves.toMatchObject({ outcome: 'failed', errorCode: 'state-changed' })
    child.archiveThreadId = '42345678-1234-4234-8234-123456789abc'
    child.archiveThreadRecency = 0
    await expect(bridge.archiveThread(pendingAlias, pendingRequest)).resolves.toMatchObject({ outcome: 'failed', errorCode: 'state-changed' })
    child.archiveThreadRecency = 2_000_000_070
    child.archiveThreadStatus = 'active'
    await expect(bridge.archiveThread(pendingAlias, pendingRequest)).resolves.toMatchObject({ outcome: 'failed', errorCode: 'active-task' })
    child.archiveThreadStatus = 'notLoaded'
    expect(child.writes.filter((frame) => frame.method === 'thread/archive')).toHaveLength(0)

    const archiveResult = await bridge.archiveThread(pendingAlias, pendingRequest)
    expect(archiveResult).toEqual({ outcome: 'archived', desktopSync: 'not-running' })
    expect(JSON.stringify(archiveResult)).not.toContain('private archive')
    expect(child.writes.filter((frame) => frame.method === 'thread/read')).toHaveLength(5)
    expect(child.writes.filter((frame) => frame.method === 'thread/read').every((frame) =>
      frame.params?.threadId === '42345678-1234-4234-8234-123456789abc'
      && frame.params?.includeTurns === false
    )).toBe(true)
    expect(child.writes.filter((frame) => frame.method === 'thread/archive')).toEqual([
      expect.objectContaining({ params: { threadId: '42345678-1234-4234-8234-123456789abc' } })
    ])

    child.bulkInventoryCount = 100
    const statusCallCount = () => child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length
    const callsBeforeBulk = statusCallCount()
    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: true })
    expect(statusCallCount()).toBe(callsBeforeBulk + 100)
    const advanced = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(advanced).toMatchObject({ ok: true })
    expect(advanced.value.threads[99]).toMatchObject({ status: 'notLoaded', lastTurnStatus: 'completed' })
    const allTurnsCalls = child.writes.filter((frame) => frame.method === 'thread/turns/list')
    expect(statusCallCount()).toBe(callsBeforeBulk + 200)
    expect(allTurnsCalls.every((frame) => frame.params?.itemsView === 'notLoaded' && frame.params?.limit === 1)).toBe(true)

    child.bulkInventoryCount = 0

    child.unsupportedTurnsList = true
    child.threadRecencyOffset = 1
    const callsBeforeUnsupported = statusCallCount()
    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: false, error: { code: 'protocol-error' } })
    const callsAfterUnsupported = statusCallCount()
    expect(callsAfterUnsupported - callsBeforeUnsupported).toBeGreaterThanOrEqual(1)
    expect(callsAfterUnsupported - callsBeforeUnsupported).toBeLessThanOrEqual(10)

    child.threadRecencyOffset = 2
    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: false, error: { code: 'protocol-error' } })
    expect(statusCallCount()).toBeGreaterThan(callsAfterUnsupported)

    expect(bridge).not.toHaveProperty('recoverPendingThreads')
    expect(child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === true).length).toBeGreaterThanOrEqual(1)

    bridge.close()
    expect(child.endCalls).toBe(1)
    expect(child.exitCode).toBe(0)
    expect(preload).not.toContain('wham/usage')
    expect(preload).not.toContain('.codex/auth.json')
    expect(preload.match(/requestCodexRpc\('thread\/read'/g)).toHaveLength(2)
    expect(preload).toContain("requestCodexRpc('thread/read', { threadId: entry.threadId, includeTurns: false })")
    expect(preload).toContain('closeable: false')
  })

  it('parses only the native project registry projection, falls back to .bak, and applies assignment precedence', () => {
    const id = (index: number) => `${index.toString(16).padStart(8, '0')}-1234-4234-8234-123456789abc`
    const registryObject = {
      'local-projects': {
        root: { id: 'root', name: 'Root', rootPaths: ['/tmp/work'] },
        deep: { id: 'deep', name: 'Deep', rootPaths: ['/tmp/work/deep'] }
      },
      'project-order': ['deep', 'root'],
      'pinned-project-ids': ['deep'],
      'pinned-thread-ids': [id(1)],
      'thread-project-assignments': {
        [id(1)]: { projectId: 'root' },
        [id(4)]: { projectId: 'removed-project' }
      },
      'projectless-thread-ids': [id(2), id(4)],
      'private-unrelated-state': { token: 'must-not-affect-fingerprint' }
    }
    const primary = JSON.stringify(registryObject)
    const child = new FakeCodexProcess()
    const { native } = loadCodexBridge(child)
    const registry = native.parseCodexNativeRegistryText(primary)
    const withoutPrivateState = native.parseCodexNativeRegistryText(JSON.stringify({ ...registryObject, 'private-unrelated-state': { token: 'changed' } }))

    expect(registry.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(withoutPrivateState.fingerprint).toBe(registry.fingerprint)
    expect(registry.projects.map((project: Record<string, unknown>) => [project.name, project.nativeOrder, project.nativePinnedOrder])).toEqual([
      ['Root', 1, undefined],
      ['Deep', 0, 0]
    ])
    expect(native.codexThreadNativeProject({ id: id(1), cwd: '/tmp/work/deep/task' }, registry)?.project.name).toBe('Root')
    expect(native.codexThreadNativeProject({ id: id(2), cwd: '/tmp/work/deep/task' }, registry)?.project.kind).toBe('chats')
    expect(native.codexThreadNativeProject({ id: id(3), cwd: '/tmp/work/deep/task' }, registry)?.project.name).toBe('Deep')
    expect(native.codexThreadNativeProject({ id: id(4), cwd: '/tmp/work/deep/task' }, registry)).toBeNull()
    expect(native.codexThreadNativeProject({ id: id(5), cwd: '/tmp/removed/task' }, registry)).toBeNull()

    const fallbackHarness = loadCodexBridge(new FakeCodexProcess(), (candidate) => {
      if (candidate.endsWith('.bak')) return primary
      return '{ invalid primary'
    })
    expect(fallbackHarness.native.readCodexNativeRegistry().fingerprint).toBe(registry.fingerprint)
    expect(fallbackHarness.registryReads).toEqual([
      '/tmp/.codex/.codex-global-state.json',
      '/tmp/.codex/.codex-global-state.json.bak'
    ])
  })

  it('exposes a fail-closed native project removal transaction without an App Server removal RPC', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const removal = preload.slice(preload.indexOf('async function removeCodexProject'), preload.indexOf('async function openCodexThread'))

    expect(preload).toContain('removeProject: removeCodexProject')
    expect(preload).toContain("for (const executable of ['Codex', 'ChatGPT'])")
    expect(preload).toContain('(?:ChatGPT|Codex)\\.exe')
    expect(removal).toContain("return failed('codex-running'")
    expect(removal).toContain("return failed('stale-source'")
    expect(removal).toContain("return failed('unsupported-schema'")
    expect(removal).toContain("return failed('write-failed'")
    expect(removal).toContain("status: 'verified'")
    expect(removal).toContain("delete localProjects[project.id]")
    expect(removal).toContain("source['project-order'] = source['project-order'].filter")
    expect(removal).toContain("source['pinned-project-ids'] = source['pinned-project-ids'].filter")
    expect(removal).toContain("source['selected-project'] = null")
    expect(removal).toContain('codexWriteSyncedTemp(paths.primary')
    expect(removal).toContain('codexWriteSyncedTemp(paths.backup')
    expect(removal).toContain('codexRestoreAtomicFile(paths.primary')
    expect(removal).toContain('codexRestoreAtomicFile(paths.backup')
    expect(removal).not.toContain("requestCodexRpc('project/")
    expect(removal).not.toContain("delete source['thread-project-assignments']")
  })

  it('reads every unarchived page, excludes zero-Turn rows, and fails closed on malformed Turns or cursor loops', async () => {
    const child = new FakeCodexProcess()
    child.bulkInventoryCount = 25
    child.inventoryPageSize = 7
    const { bridge } = loadCodexBridge(child)
    const listCalls = () => child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === false)

    const complete = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(complete).toMatchObject({ ok: true, value: { version: 2, completeness: 'verified', rawSourceCount: 25, eligibleSourceCount: 25, nonConversationCount: 0 } })
    expect(complete.value.threads).toHaveLength(25)
    expect(listCalls()).toHaveLength(4)
    expect(listCalls().map((frame) => frame.params?.cursor || '')).toEqual(['', 'offset:7', 'offset:14', 'offset:21'])

    child.emptyTurnIds.add('00000019-1234-4234-8234-123456789abc')
    const withoutEmptyConversation = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(withoutEmptyConversation).toMatchObject({ ok: true, value: { rawSourceCount: 25, eligibleSourceCount: 25, nonConversationCount: 1 } })
    expect(withoutEmptyConversation.value.threads).toHaveLength(24)

    child.emptyTurnIds.clear()
    child.missingTurnStartedAtIds.add('00000018-1234-4234-8234-123456789abc')
    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: false, error: { code: 'protocol-error' } })

    child.missingTurnStartedAtIds.clear()
    child.cursorLoop = true
    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: false, error: { code: 'protocol-error' } })
    bridge.close()
  })

  it('retries one native project fingerprint change and rejects a second unstable scan', async () => {
    const base = JSON.parse(nativeRegistryText()) as Record<string, any>
    const renamed = JSON.stringify({
      ...base,
      'local-projects': {
        ...base['local-projects'],
        'local-test': { ...base['local-projects']['local-test'], name: 'Renamed Project' }
      }
    })
    const initial = nativeRegistryText()
    const stableSequence = [initial, renamed, renamed, renamed]
    const child = new FakeCodexProcess()
    const stable = loadCodexBridge(child, (_candidate, index) => stableSequence[index] || renamed)
    const result = await stable.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })

    expect(result).toMatchObject({ ok: true, value: { completeness: 'verified' } })
    expect(result.value.projects[0].name).toBe('Renamed Project')
    expect(child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === false)).toHaveLength(2)
    stable.bridge.close()

    const unstableChild = new FakeCodexProcess()
    const unstableSequence = [initial, renamed, initial, renamed]
    const unstable = loadCodexBridge(unstableChild, (_candidate, index) => unstableSequence[index] || unstableSequence[index % unstableSequence.length])
    await expect(unstable.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: false, error: { code: 'protocol-error' } })
    expect(unstableChild.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === false)).toHaveLength(2)
    unstable.bridge.close()
  })

  it('archives only completed project history, skips every non-completed task, and reports verification failures', async () => {
    const child = new FakeCodexProcess()
    child.bulkInventoryCount = 25
    child.projectBatchMode = true
    child.failedTurnIds.add('00000002-1234-4234-8234-123456789abc')
    child.archiveNoopIds.add('00000004-1234-4234-8234-123456789abc')
    const { bridge } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const chats = snapshot.value.projects.find((project: Record<string, unknown>) => project.key === 'chats')

    const result = await bridge.archiveProject(chats.actionAlias, { expectedSourceFingerprint: snapshot.value.sourceFingerprint })

    expect(result).toMatchObject({ outcome: 'partial' })
    expect(result.archivedKeys).toHaveLength(22)
    expect(result.skippedActiveKeys).toHaveLength(2)
    expect(result.failed).toEqual([expect.objectContaining({ errorCode: 'archive-not-verified' })])
    expect(result.desktopSyncedKeys).toEqual([])
    expect(result.desktopSyncFailedKeys).toHaveLength(22)
    expect(child.writes.filter((frame) => frame.method === 'thread/archive')).toHaveLength(23)
    expect(child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === true)).toHaveLength(2)
    expect(JSON.stringify(result)).not.toContain('00000004-1234-4234-8234-123456789abc')
    bridge.close()
  })

  it('detaches a failed initialize session and retries with a fresh App Server process', async () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const children = [new FakeCodexProcess(true, false), new FakeCodexProcess()]
    const spawn = vi.fn((_command: string, _args: string[], _options: Record<string, unknown>) => children.shift() as FakeCodexProcess)
    const execFile = vi.fn(noSystemProxyExecFile)
    const explicitProxy = 'http://127.0.0.1:8118'
    const sandbox = {
      window: {} as Record<string, unknown>,
      globalThis: {} as Record<string, unknown>,
      process: { platform: 'darwin', arch: 'arm64', env: { HTTP_PROXY: explicitProxy, HTTPS_PROXY: explicitProxy, CODEX_CLI_PATH: '/tmp/codex' }, cwd: () => '/host/eypc' },
      setTimeout,
      clearTimeout,
      queueMicrotask,
      require(name: string) {
        if (name === 'node:buffer') return { Buffer }
        if (name === 'node:child_process') return { execFile, spawn }
        if (name === 'node:crypto') return crypto
        if (name === 'node:net') return { connect: vi.fn() }
        if (name === 'node:fs') return {
          existsSync: (candidate: string) => candidate === '/tmp/codex',
          readdirSync: () => [],
          readFileSync: (candidate: string) => candidate === '/tmp/.codex/.codex-global-state.json' ? nativeRegistryText() : (() => { throw new Error('not found') })(),
          realpathSync: (candidate: string) => candidate,
          statSync: (candidate: string) => ({ isFile: () => false, size: candidate === '/tmp/.codex/.codex-global-state.json' ? Buffer.byteLength(nativeRegistryText()) : 1 }),
          promises: {}
        }
        if (name === 'node:path') return pathModule
        if (name === 'node:os') return { homedir: () => '/tmp' }
        if (name === 'electron') return { ipcRenderer: { on() {} } }
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(preload, sandbox, { filename: 'preload.js' })
    const bridge = (sandbox.window as { eypcPlatform: { codex: { readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>>; close(): void } } }).eypcPlatform.codex

    await expect(bridge.readSnapshot({ includeQuota: true, includeConfig: false, includeThreads: false })).resolves.toMatchObject({ ok: false, error: { code: 'protocol-error' } })
    await expect(bridge.readSnapshot({ includeQuota: true, includeConfig: false, includeThreads: false })).resolves.toMatchObject({ ok: true })
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(execFile).not.toHaveBeenCalled()
    expect(spawn.mock.calls[0][2]).toEqual(expect.objectContaining({
      env: expect.objectContaining({ HTTP_PROXY: explicitProxy, HTTPS_PROXY: explicitProxy })
    }))
    bridge.close()
  })

  it('clears raw thread session state and cancels background pagination after an unexpected exit', async () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const first = new FakeCodexProcess(false, false)
    first.holdFirstPromptPages = true
    const second = new FakeCodexProcess()
    const children = [first, second]
    const spawn = vi.fn(() => children.shift() as FakeCodexProcess)
    const execFile = vi.fn(noSystemProxyExecFile)
    const sandbox = {
      window: {} as Record<string, unknown>,
      globalThis: {} as Record<string, unknown>,
      process: { platform: 'darwin', arch: 'arm64', env: { CODEX_CLI_PATH: '/tmp/codex' }, cwd: () => '/host/eypc' },
      setTimeout,
      clearTimeout,
      queueMicrotask,
      require(name: string) {
        if (name === 'node:buffer') return { Buffer }
        if (name === 'node:child_process') return { execFile, spawn }
        if (name === 'node:crypto') return crypto
        if (name === 'node:net') return { connect: vi.fn() }
        if (name === 'node:fs') return {
          existsSync: (candidate: string) => candidate === '/tmp/codex',
          readdirSync: () => [],
          readFileSync: (candidate: string) => candidate === '/tmp/.codex/.codex-global-state.json' ? nativeRegistryText() : (() => { throw new Error('not found') })(),
          realpathSync: (candidate: string) => candidate,
          statSync: (candidate: string) => ({ isFile: () => false, size: candidate === '/tmp/.codex/.codex-global-state.json' ? Buffer.byteLength(nativeRegistryText()) : 1 }),
          promises: {}
        }
        if (name === 'node:path') return pathModule
        if (name === 'node:os') return { homedir: () => '/tmp' }
        if (name === 'electron') return { ipcRenderer: { on() {} } }
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(preload, sandbox, { filename: 'preload.js' })
    const bridge = (sandbox.window as { eypcPlatform: { codex: { readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>>; openThread(alias: string): Promise<Record<string, unknown>>; close(): void } } }).eypcPlatform.codex

    const initial = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(first.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1)).toHaveLength(5)
    expect(first.writes.some((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 50)).toBe(false)
    const staleAlias = initial.value.threads[0].actionAlias as string

    first.exitCode = 1
    first.emit('exit', 1)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(spawn).toHaveBeenCalledTimes(1)
    await expect(bridge.openThread(staleAlias)).resolves.toMatchObject({ outcome: 'failed', errorCode: 'expired-alias' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(spawn).toHaveBeenCalledTimes(1)

    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: true })
    expect(spawn).toHaveBeenCalledTimes(2)
    bridge.close()
  })

  it('maps a missing GUI Node runtime to a bounded startup diagnostic', async () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const child = new FakeCodexProcess(false, false, true)
    const spawn = vi.fn(() => child)
    const execFile = vi.fn(noSystemProxyExecFile)
    const sandbox = {
      window: {} as Record<string, unknown>,
      globalThis: {} as Record<string, unknown>,
      process: { platform: 'darwin', env: { PATH: '/usr/bin:/bin' }, cwd: () => '/host/eypc' },
      setTimeout,
      clearTimeout,
      queueMicrotask,
      require(name: string) {
        if (name === 'node:buffer') return { Buffer }
        if (name === 'node:child_process') return { execFile, spawn }
        if (name === 'node:crypto') return crypto
        if (name === 'node:net') return { connect: vi.fn() }
        if (name === 'node:fs') return { existsSync: () => false, readdirSync: () => [], realpathSync: (candidate: string) => candidate, statSync: () => ({ isFile: () => false }), promises: {} }
        if (name === 'node:path') return pathModule
        if (name === 'node:os') return { homedir: () => '/tmp' }
        if (name === 'electron') return { ipcRenderer: { on() {} } }
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(preload, sandbox, { filename: 'preload.js' })
    const bridge = (sandbox.window as { eypcPlatform: { codex: { readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>> } } }).eypcPlatform.codex

    const result = await bridge.readSnapshot({ includeQuota: true, includeConfig: false, includeThreads: false })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'runtime-unavailable', message: 'Codex CLI 启动失败，请检查本机 Node/Codex 安装' }
    })
    expect(JSON.stringify(result)).not.toContain('No such file or directory')
    expect(JSON.stringify(result)).not.toContain('/usr/bin')
  })

  it('does not spawn an App Server after close cancels pending PAC discovery', async () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    let scutilCallback: ExecFileCallback | null = null
    const execFile = vi.fn((command: string, _args: string[], _options: Record<string, unknown>, callback: ExecFileCallback) => {
      if (command === '/usr/sbin/scutil') scutilCallback = callback
    })
    const spawn = vi.fn()
    const sandbox = {
      window: {} as Record<string, unknown>,
      globalThis: {} as Record<string, unknown>,
      process: { platform: 'darwin', arch: 'arm64', env: { CODEX_CLI_PATH: '/tmp/codex' }, cwd: () => '/host/eypc' },
      setTimeout,
      clearTimeout,
      queueMicrotask,
      require(name: string) {
        if (name === 'node:buffer') return { Buffer }
        if (name === 'node:child_process') return { execFile, spawn }
        if (name === 'node:crypto') return crypto
        if (name === 'node:net') return { connect: vi.fn() }
        if (name === 'node:fs') return { existsSync: (candidate: string) => candidate === '/tmp/codex', readdirSync: () => [], realpathSync: (candidate: string) => candidate, statSync: () => ({ isFile: () => false }), promises: {} }
        if (name === 'node:path') return pathModule
        if (name === 'node:os') return { homedir: () => '/tmp' }
        if (name === 'electron') return { ipcRenderer: { on() {} } }
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(preload, sandbox, { filename: 'preload.js' })
    const bridge = (sandbox.window as { eypcPlatform: { codex: { readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>>; close(): void } } }).eypcPlatform.codex

    const pending = bridge.readSnapshot({ includeQuota: true, includeConfig: false, includeThreads: false })
    bridge.close()
    const completeProbe = scutilCallback as ExecFileCallback | null
    if (!completeProbe) throw new Error('scutil probe did not start')
    completeProbe(null, '<dictionary> {\n  ProxyAutoConfigEnable : 0\n}\n', '')

    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'process-exited' } })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('accepts only a static loopback HTTP PAC shape without evaluating PAC code', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const sandbox = {
      window: {} as Record<string, unknown>,
      globalThis: {} as Record<string, unknown>,
      process: { platform: 'darwin', env: {}, cwd: () => '/host/eypc' },
      setTimeout,
      clearTimeout,
      queueMicrotask,
      require(name: string) {
        if (name === 'node:buffer') return { Buffer }
        if (name === 'node:child_process') return { execFile: noSystemProxyExecFile, spawn() {} }
        if (name === 'node:crypto') return crypto
        if (name === 'node:net') return { connect: vi.fn() }
        if (name === 'node:fs') return { existsSync: () => false, readdirSync: () => [], statSync: () => ({ isFile: () => false }), promises: {} }
        if (name === 'node:path') return pathModule
        if (name === 'node:os') return { homedir: () => '/tmp' }
        if (name === 'electron') return { ipcRenderer: { on() {} } }
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(`${preload}\nglobalThis.__codexProxyTest = { codexLoopbackPacUrl, codexStaticPacProxy, codexHasExplicitProxyEnvironment }`, sandbox, { filename: 'preload.js' })
    const proxyTest = (sandbox as unknown as {
      __codexProxyTest: {
        codexLoopbackPacUrl(value: string): string
        codexStaticPacProxy(value: string): string
        codexHasExplicitProxyEnvironment(value: Record<string, string>): boolean
      }
    }).__codexProxyTest

    expect(proxyTest.codexLoopbackPacUrl('http://127.0.0.1:33331/commands/pac')).toBe('http://127.0.0.1:33331/commands/pac')
    expect(proxyTest.codexLoopbackPacUrl('https://proxy.example.test/config.pac')).toBe('')
    expect(proxyTest.codexStaticPacProxy('function FindProxyForURL(url, host) { return "PROXY 127.0.0.1:7897; DIRECT;"; }')).toBe('http://127.0.0.1:7897')
    expect(proxyTest.codexStaticPacProxy('function FindProxyForURL(url, host) { if (host) return "PROXY 127.0.0.1:7897"; return "DIRECT"; }')).toBe('')
    expect(proxyTest.codexStaticPacProxy('function FindProxyForURL(url, host) { return "SOCKS5 127.0.0.1:7897; DIRECT;"; }')).toBe('')
    expect(proxyTest.codexStaticPacProxy('function FindProxyForURL(url, host) { return "PROXY proxy.example.test:7897; DIRECT;"; }')).toBe('')
    expect(proxyTest.codexHasExplicitProxyEnvironment({ https_proxy: 'http://127.0.0.1:8118' })).toBe(true)
    expect(proxyTest.codexHasExplicitProxyEnvironment({ ALL_PROXY: 'socks5://127.0.0.1:8119' })).toBe(true)
    expect(proxyTest.codexHasExplicitProxyEnvironment({ HTTPS_PROXY: '' })).toBe(false)
  })

  it('detects a Windows npm shim and resolves it through a verified Node and Codex entry', async () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const child = new FakeCodexProcess()
    const spawn = vi.fn(() => child)
    const home = 'C:\\Users\\demo'
    const appData = `${home}\\AppData\\Roaming`
    const shim = `${appData}\\npm\\codex.cmd`
    const jsEntry = `${appData}\\npm\\node_modules\\@openai\\codex\\bin\\codex.js`
    const nodeRuntime = 'C:\\Program Files\\nodejs\\node.exe'
    const configFile = `${home}\\.codex\\config.toml`
    const existing = new Set([shim, jsEntry, nodeRuntime, configFile])
    const execFile = vi.fn((command: string, _args: string[], _options: Record<string, unknown>, callback: ExecFileCallback) => {
      expect(command).toBe('C:\\Windows\\System32\\tasklist.exe')
      queueMicrotask(() => callback(null, '"Codex.exe","4242","Console","1","32,000 K"\r\n', ''))
    })
    const sandbox = {
      window: {} as Record<string, unknown>,
      globalThis: {} as Record<string, unknown>,
      process: {
        platform: 'win32',
        arch: 'x64',
        env: { APPDATA: appData, LOCALAPPDATA: `${home}\\AppData\\Local`, SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', Path: 'C:\\Program Files\\nodejs' },
        cwd: () => 'C:\\EyPc'
      },
      setTimeout,
      clearTimeout,
      queueMicrotask,
      require(name: string) {
        if (name === 'node:buffer') return { Buffer }
        if (name === 'node:child_process') return { execFile, spawn }
        if (name === 'node:crypto') return crypto
        if (name === 'node:net') return { connect: vi.fn() }
        if (name === 'node:fs') return {
          constants: { R_OK: 4 },
          existsSync: (candidate: string) => existing.has(candidate),
          accessSync: (candidate: string) => { if (!existing.has(candidate)) throw new Error('missing') },
          readdirSync: () => [],
          realpathSync: (candidate: string) => candidate,
          statSync: () => ({ isFile: () => false }),
          promises: {}
        }
        if (name === 'node:path') return pathModule
        if (name === 'node:os') return { homedir: () => home }
        if (name === 'electron') return { ipcRenderer: { on() {} } }
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(preload, sandbox, { filename: 'preload.js' })
    const bridge = (sandbox.window as { eypcPlatform: { codex: { inspectEnvironment(): Promise<Record<string, unknown>>; readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>>; close(): void } } }).eypcPlatform.codex

    const environment = await bridge.inspectEnvironment()
    expect(environment).toMatchObject({
      platform: 'windows',
      runtimeState: 'detected',
      runtimeSource: 'npm-global',
      processState: 'running',
      configState: 'detected',
      connectionState: 'not-checked'
    })
    expect(JSON.stringify(environment)).not.toContain(home)
    expect(JSON.stringify(environment)).not.toContain('4242')

    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: true, includeThreads: false })).resolves.toMatchObject({ ok: true })
    expect(spawn).toHaveBeenCalledWith(
      nodeRuntime,
      [jsEntry, 'app-server', '--listen', 'stdio://'],
      expect.objectContaining({ windowsHide: true, cwd: home })
    )
    bridge.close()
  })

  it('detects the default Windows Volta executable without inherited PATH', async () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const home = 'C:\\Users\\demo'
    const localAppData = `${home}\\AppData\\Local`
    const voltaCodex = `${localAppData}\\Volta\\bin\\codex.exe`
    const execFile = vi.fn((_command: string, _args: string[], _options: Record<string, unknown>, callback: ExecFileCallback) => queueMicrotask(() => callback(null, '', '')))
    const sandbox = {
      window: {} as Record<string, unknown>,
      globalThis: {} as Record<string, unknown>,
      process: { platform: 'win32', arch: 'x64', env: { LOCALAPPDATA: localAppData, SystemRoot: 'C:\\Windows', Path: '' }, cwd: () => 'C:\\EyPc' },
      setTimeout,
      clearTimeout,
      queueMicrotask,
      require(name: string) {
        if (name === 'node:buffer') return { Buffer }
        if (name === 'node:child_process') return { execFile, spawn: vi.fn() }
        if (name === 'node:crypto') return crypto
        if (name === 'node:net') return { connect: vi.fn() }
        if (name === 'node:fs') return { existsSync: (candidate: string) => candidate === voltaCodex, readdirSync: () => [], realpathSync: (candidate: string) => candidate, statSync: () => ({ isFile: () => false }), promises: {} }
        if (name === 'node:path') return pathModule
        if (name === 'node:os') return { homedir: () => home }
        if (name === 'electron') return { ipcRenderer: { on() {} } }
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(preload, sandbox, { filename: 'preload.js' })
    const bridge = (sandbox.window as { eypcPlatform: { codex: { inspectEnvironment(): Promise<Record<string, unknown>> } } }).eypcPlatform.codex

    await expect(bridge.inspectEnvironment()).resolves.toMatchObject({
      platform: 'windows',
      runtimeState: 'detected',
      runtimeSource: 'volta',
      processState: 'not-running'
    })
  })

  it('reports an unresolved Windows command shim without spawning a general shell', async () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const spawn = vi.fn()
    const home = 'C:\\Users\\demo'
    const appData = `${home}\\AppData\\Roaming`
    const shim = `${appData}\\npm\\codex.cmd`
    const execFile = vi.fn((_command: string, _args: string[], _options: Record<string, unknown>, callback: ExecFileCallback) => queueMicrotask(() => callback(null, '', '')))
    const sandbox = {
      window: {} as Record<string, unknown>,
      globalThis: {} as Record<string, unknown>,
      process: { platform: 'win32', arch: 'x64', env: { APPDATA: appData, SystemRoot: 'C:\\Windows', Path: '' }, cwd: () => 'C:\\EyPc' },
      setTimeout,
      clearTimeout,
      queueMicrotask,
      require(name: string) {
        if (name === 'node:buffer') return { Buffer }
        if (name === 'node:child_process') return { execFile, spawn }
        if (name === 'node:crypto') return crypto
        if (name === 'node:net') return { connect: vi.fn() }
        if (name === 'node:fs') return { existsSync: (candidate: string) => candidate === shim, readdirSync: () => [], realpathSync: (candidate: string) => candidate, statSync: () => ({ isFile: () => false }), promises: {} }
        if (name === 'node:path') return pathModule
        if (name === 'node:os') return { homedir: () => home }
        if (name === 'electron') return { ipcRenderer: { on() {} } }
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(preload, sandbox, { filename: 'preload.js' })
    const bridge = (sandbox.window as { eypcPlatform: { codex: { inspectEnvironment(): Promise<Record<string, unknown>>; readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>> } } }).eypcPlatform.codex

    await expect(bridge.inspectEnvironment()).resolves.toMatchObject({ platform: 'windows', runtimeState: 'unusable', runtimeSource: 'npm-global', processState: 'not-running', errorCode: 'runtime-unavailable' })
    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: true, includeThreads: false })).resolves.toMatchObject({ ok: false, error: { code: 'runtime-unavailable' } })
    expect(spawn).not.toHaveBeenCalled()
  })
})
