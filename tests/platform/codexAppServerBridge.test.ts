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
          }
        }
      }
    }
    if (method === 'account/read') return { requiresOpenaiAuth: false, account: { planType: 'pro', accountId: 'private-account' } }
    if (method === 'config/read') return { config: { model: 'gpt-5.6', model_reasoning_effort: 'high', service_tier: 'priority', secret: 'private-config' } }
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
      return this.page([
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
          { id: '52345678-1234-4234-8234-123456789abc', name: '系统异常', status: { type: 'systemError', activeFlags: ['waitingOnApproval'] }, recencyAt: 2_000_000_060 }
        ].filter((thread) => !this.archivedIds.has(thread.id)), params)
    }
    if (method === 'thread/turns/list') {
      const threadId = typeof params?.threadId === 'string' ? params.threadId : ''
      if (this.emptyTurnIds.has(threadId)) return { data: [] }
      const isFirstBulkThread = threadId === '00000001-1234-4234-8234-123456789abc'
      return {
        data: [{
          status: this.projectBatchMode && isFirstBulkThread ? 'inProgress' : 'completed',
          ...(this.missingTurnStartedAtIds.has(threadId) ? {} : { startedAt: 1_900_000_000 }),
          ...(this.projectBatchMode && isFirstBulkThread ? {} : { completedAt: 2_000_000_071 }),
          items: [{ text: 'private turn body that must not cross the bridge' }]
        }]
      }
    }
    if (method === 'thread/read') {
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
    'projectless-thread-ids': [...new Set([...FIXED_THREAD_IDS, ...BULK_THREAD_IDS])]
  })
}

function loadCodexBridge(
  child: FakeCodexProcess,
  readRegistry: (candidate: string, readIndex: number) => string = () => nativeRegistryText()
) {
  const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
  const spawn = vi.fn(() => child)
  const execFile = vi.fn(noSystemProxyExecFile)
  const registryReads: string[] = []
  const sandbox = {
    window: {} as Record<string, unknown>,
    globalThis: {} as Record<string, unknown>,
    process: {
      platform: 'darwin',
      arch: 'arm64',
      env: { CODEX_HOME: '/tmp/.codex', CODEX_CLI_PATH: '/tmp/codex' },
      cwd: () => '/host/eypc'
    },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    require(name: string) {
      if (name === 'node:buffer') return { Buffer }
      if (name === 'node:child_process') return { execFile, spawn }
      if (name === 'node:crypto') return crypto
      if (name === 'node:fs') return {
        existsSync: (candidate: string) => candidate === '/tmp/codex',
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
        promises: {}
      }
      if (name === 'node:path') return pathModule
      if (name === 'node:os') return { homedir: () => '/tmp' }
      if (name === 'electron') return { ipcRenderer: { on() {} } }
      throw new Error(`unexpected require: ${name}`)
    }
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(`${preload}\nglobalThis.__codexNativeTest = { parseCodexNativeRegistryText, readCodexNativeRegistry, codexThreadNativeProject };`, sandbox, { filename: 'preload.js' })
  return {
    bridge: (sandbox.window as {
      eypcPlatform: {
        codex: {
          readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>>
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
    spawn
  }
}

describe('Codex App Server preload bridge', () => {
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
    expect(result.value.threads[0]).toMatchObject({ name: '完善 Codex 悬浮球', status: 'active', activeFlags: ['waitingOnUserInput', 'waitingOnApproval'], createdAt: 1_800_000_000_000 })
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
    })).resolves.toEqual({ outcome: 'archived' })

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
    expect(child.writes.filter((frame) => frame.method === 'thread/archive')).toHaveLength(1)

    const archiveResult = await bridge.archiveThread(pendingAlias, pendingRequest)
    expect(archiveResult).toEqual({ outcome: 'archived' })
    expect(JSON.stringify(archiveResult)).not.toContain('private archive')
    expect(child.writes.filter((frame) => frame.method === 'thread/read')).toHaveLength(6)
    expect(child.writes.filter((frame) => frame.method === 'thread/read').every((frame) =>
      ['42345678-1234-4234-8234-123456789abc', '52345678-1234-4234-8234-123456789abc'].includes(String(frame.params?.threadId))
      && frame.params?.includeTurns === false
    )).toBe(true)
    expect(child.writes.filter((frame) => frame.method === 'thread/archive')).toEqual([
      expect.objectContaining({ params: { threadId: '52345678-1234-4234-8234-123456789abc' } }),
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
    expect(child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === true).length).toBeGreaterThanOrEqual(2)

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

  it('archives project history in 20-item batches, skips active tasks, and reports dual-verification failures per item', async () => {
    const child = new FakeCodexProcess()
    child.bulkInventoryCount = 25
    child.projectBatchMode = true
    child.archiveNoopIds.add('00000004-1234-4234-8234-123456789abc')
    const { bridge } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const chats = snapshot.value.projects.find((project: Record<string, unknown>) => project.key === 'chats')

    const result = await bridge.archiveProject(chats.actionAlias, { expectedSourceFingerprint: snapshot.value.sourceFingerprint })

    expect(result).toMatchObject({ outcome: 'partial' })
    expect(result.archivedKeys).toHaveLength(23)
    expect(result.skippedActiveKeys).toHaveLength(1)
    expect(result.failed).toEqual([expect.objectContaining({ errorCode: 'archive-not-verified' })])
    expect(child.writes.filter((frame) => frame.method === 'thread/archive')).toHaveLength(24)
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
