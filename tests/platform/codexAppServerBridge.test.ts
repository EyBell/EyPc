import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import * as pathModule from 'node:path'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const nodeRequire = createRequire(import.meta.url)
const TEST_RUNTIME_IDENTITY = {
  revision: 'runtime-identity-v2',
  artifactState: 'artifact-ready',
  hostAssetId: 'host-test-current',
  rendererAssetId: 'renderer-test-current',
  kernelRevision: 'companion-task-kernel-v7',
  registryRevision: 'companion-provider-registry-v1',
  topologyRevision: 'companion-task-topology-v2',
  taskPackageRevision: 'companion-task-snapshot-v7',
  commandRevision: 'companion-task-command-v1',
  subscribeRevision: 'companion-task-subscribe-v1',
  ackRevision: 'companion-task-ack-v2'
}

function handshakeTestRuntime(platform: Record<string, any>) {
  const handshake = platform.runtimeIdentity.handshake({
    hostAssetId: TEST_RUNTIME_IDENTITY.hostAssetId,
    rendererAssetId: TEST_RUNTIME_IDENTITY.rendererAssetId,
    kernelRevision: TEST_RUNTIME_IDENTITY.kernelRevision,
    registryRevision: TEST_RUNTIME_IDENTITY.registryRevision,
    topologyRevision: TEST_RUNTIME_IDENTITY.topologyRevision,
    taskPackageRevision: TEST_RUNTIME_IDENTITY.taskPackageRevision,
    commandRevision: TEST_RUNTIME_IDENTITY.commandRevision,
    subscribeRevision: TEST_RUNTIME_IDENTITY.subscribeRevision,
    ackRevision: TEST_RUNTIME_IDENTITY.ackRevision
  })
  if (handshake.status !== 'host-loaded') throw new Error('test preload identity handshake failed')
}

interface RpcFrame {
  id?: number
  method: string
  params?: Record<string, unknown>
}

class FakeCodexProcess extends EventEmitter {
  pid = 101
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
  unarchivedListReadCount = 0
  archivedListReadCount = 0
  revertArchiveOnArchivedListRead = 0
  omittedIds = new Set<string>()
  inventoryPageSize = 0
  cursorLoop = false
  projectBatchMode = false
  archiveNoopIds = new Set<string>()
  emptyTurnIds = new Set<string>()
  missingTurnStartedAtIds = new Set<string>()
  missingTurnCompletedAtIds = new Set<string>()
  inProgressTurnIds = new Set<string>()
  turnOverrides = new Map<string, { id: string; status: 'inProgress' | 'completed' | 'interrupted' | 'failed'; startedAt: number; completedAt?: number }>()
  failedTurnIds = new Set<string>()
  interruptedTurnIds = new Set<string>()
  rolloutTexts = new Map<string, string>()
  externalOpenRolloutIds = new Set<string>()
  createdThreadId = '92345678-1234-4234-8234-123456789abc'
  createdModelOverride = ''
  failTurnStart = false
  failCreateCleanup = false
  supportsDefaultCollaborationMode = false
  omitPlanExecutionModel = false
  failThreadResume = false
  invalidExecuteTurnStart = false
  includeCreatedThreadInInventory = false
  statusOverrides = new Map<string, string>()
  forkedFromIds = new Map<string, string>()
  sessionIds = new Map<string, string>()
  createdThreadReadMisses = 0
  holdNextLatestTurnRead = false
  heldLatestTurnReads: RpcFrame[] = []
  goalStates = new Map<string, { status: 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited' | 'complete'; updatedAt: number }>()
  unsupportedGoalGet = false
  transientGoalFailures = 0
  holdNextGoalRead = false
  heldGoalReads: RpcFrame[] = []

  constructor(
    private readonly failInitialize = false,
    private readonly exitOnEnd = true,
    private readonly failMissingNode = false,
    public unsupportedTurnsList = false
  ) {
    super()
  }

  private lineageFor(threadId: string) {
    return {
      ...(this.sessionIds.has(threadId) ? { sessionId: this.sessionIds.get(threadId) } : {}),
      ...(this.forkedFromIds.has(threadId) ? { forkedFromId: this.forkedFromIds.get(threadId) } : {})
    }
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
      if (this.unsupportedGoalGet && frame.method === 'thread/goal/get') {
        queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify({ id: frame.id, error: { code: -32601, message: 'method not found' } })}\n`))
        return true
      }
      if (this.transientGoalFailures > 0 && frame.method === 'thread/goal/get') {
        this.transientGoalFailures -= 1
        queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify({ id: frame.id, error: { code: -32_000, message: 'transient goal read failure' } })}\n`))
        return true
      }
      if (this.transientTurnsFailures > 0 && frame.method === 'thread/turns/list') {
        this.transientTurnsFailures -= 1
        queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify({ id: frame.id, error: { code: -32_000, message: 'transient turn read failure' } })}\n`))
        return true
      }
      if (this.failThreadResume && frame.method === 'thread/resume') {
        queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify({ id: frame.id, error: { code: -32_000, message: 'thread resume failed' } })}\n`))
        return true
      }
      if (this.holdFirstPromptPages && frame.method === 'thread/turns/list' && frame.params?.limit === 50) return true
      if (frame.method === 'thread/turns/list' && frame.params?.limit === 1) {
        if (this.holdNextLatestTurnRead) {
          this.holdNextLatestTurnRead = false
          this.heldLatestTurnReads.push(frame)
          return true
        }
      }
      if (frame.method === 'thread/goal/get' && this.holdNextGoalRead) {
        this.holdNextGoalRead = false
        this.heldGoalReads.push(frame)
        return true
      }
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
    if (method === 'collaborationMode/list') return {
      data: this.supportsDefaultCollaborationMode ? [{ mode: 'default' }] : []
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
      if (params?.collaborationMode && this.invalidExecuteTurnStart) return {}
      return { turn: { id: 'turn-created', status: 'inProgress', startedAt: 2_100_000_000 } }
    }
    if (method === 'thread/resume') {
      return {
        thread: {
          id: params?.threadId,
          ...(this.omitPlanExecutionModel ? {} : {
            model: 'gpt-5.6-sol',
            reasoningEffort: 'high'
          })
        }
      }
    }
    if (method === 'thread/list') {
      if (params?.archived === true) {
        this.archivedListReadCount += 1
        if (this.revertArchiveOnArchivedListRead > 0 && this.archivedListReadCount >= this.revertArchiveOnArchivedListRead) {
          this.archivedIds.delete(this.archiveThreadId)
        }
        return this.page([...this.archivedIds].map((id) => ({ id, name: '已归档', status: { type: 'notLoaded', activeFlags: [] }, recencyAt: 2_000_000_000 })), params)
      }
      this.unarchivedListReadCount += 1
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
          {
            id: '42345678-1234-4234-8234-123456789abc',
            name: '跨端未知',
            status: { type: 'notLoaded', activeFlags: ['waitingOnApproval'] },
            recencyAt: 2_000_000_070 + this.threadRecencyOffset,
            ...(this.rolloutTexts.has(FIXED_THREAD_IDS[3])
              ? { path: `/tmp/.codex/sessions/${FIXED_THREAD_IDS[3]}.jsonl` }
              : {})
          },
          { id: '52345678-1234-4234-8234-123456789abc', name: '系统异常', status: { type: 'systemError', activeFlags: ['waitingOnApproval'] }, recencyAt: 2_000_000_060 },
          ...(this.includeCreatedThreadInInventory
            ? [{ id: this.createdThreadId, name: '刚创建的待输入任务', status: { type: 'active', activeFlags: [] }, recencyAt: 2_000_000_110 }]
            : [])
        ]
      return this.page(rows
        .filter((thread) => !this.archivedIds.has(thread.id) && !this.omittedIds.has(thread.id))
        .map((thread) => ({
          ...thread,
          ...(this.statusOverrides.has(thread.id)
            ? { status: { type: this.statusOverrides.get(thread.id), activeFlags: [] } }
            : {}),
          ...this.lineageFor(thread.id)
        })), params)
    }
    if (method === 'thread/turns/list') {
      const threadId = typeof params?.threadId === 'string' ? params.threadId : ''
      if (this.emptyTurnIds.has(threadId)) return { data: [] }
      const override = this.turnOverrides.get(threadId)
      if (override) {
        return {
          data: [{
            ...override,
            items: [{ text: 'private overridden turn body that must not cross the bridge' }]
          }]
        }
      }
      const isFirstBulkThread = threadId === '00000001-1234-4234-8234-123456789abc'
      const inProgress = this.inProgressTurnIds.has(threadId) || (this.projectBatchMode && isFirstBulkThread)
      const failed = this.failedTurnIds.has(threadId)
      const interrupted = this.interruptedTurnIds.has(threadId)
      return {
        data: [{
          id: `turn-${threadId}`,
          status: inProgress ? 'inProgress' : failed ? 'failed' : interrupted ? 'interrupted' : 'completed',
          ...(this.missingTurnStartedAtIds.has(threadId) ? {} : { startedAt: 1_900_000_000 }),
          ...(inProgress || failed || interrupted || this.missingTurnCompletedAtIds.has(threadId) ? {} : { completedAt: 2_000_000_071 }),
          items: [{ text: 'private turn body that must not cross the bridge' }]
        }]
      }
    }
    if (method === 'thread/goal/get') {
      const threadId = typeof params?.threadId === 'string' ? params.threadId : ''
      const goal = this.goalStates.get(threadId)
      return { goal: goal ? { ...goal, threadId, objective: 'private objective', createdAt: 1_800_000_000, timeUsedSeconds: 17, tokensUsed: 42 } : null }
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
            cwd: '/tmp/chats',
            model: 'gpt-5.6-sol',
            reasoningEffort: 'high',
            ...this.lineageFor(this.createdThreadId)
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
          ...(this.omitPlanExecutionModel ? {} : {
            model: 'gpt-5.6-sol',
            reasoningEffort: 'high'
          }),
          turns: [{ text: 'private archive turn' }],
          ...this.lineageFor(this.archiveThreadId)
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

  releaseHeldLatestTurnReads() {
    for (const frame of this.heldLatestTurnReads.splice(0)) {
      const result = this.responseFor(frame.method, frame.params)
      queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify({ id: frame.id, result })}\n`))
    }
  }

  releaseHeldGoalReads() {
    for (const frame of this.heldGoalReads.splice(0)) {
      const result = this.responseFor(frame.method, frame.params)
      queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify({ id: frame.id, result })}\n`))
    }
  }
}

class FakeCodexDesktopSocket extends EventEmitter {
  writable = true
  failArchiveBroadcast = false
  streamOwnerConnected = true
  activeSnapshotThreadIds = new Set<string>()
  waitingInputSnapshotThreadIds = new Set<string>([FIXED_THREAD_IDS[0]])
  waitingApprovalSnapshotThreadIds = new Set<string>()
  planImplementationSnapshotThreadIds = new Set<string>()
  unreadSnapshotThreadIds = new Set<string>([FIXED_THREAD_IDS[3]])
  sideConversationParents = new Map<string, string>()
  writes: Array<Record<string, any>> = []

  open() {
    this.writable = true
    queueMicrotask(() => this.emit('connect'))
    return this
  }

  write(frame: Buffer, callback?: () => void) {
    const length = frame.readUInt32LE(0)
    const message = JSON.parse(frame.subarray(4, length + 4).toString('utf8')) as Record<string, any>
    this.writes.push(message)
    if (this.failArchiveBroadcast && message.type === 'broadcast' && message.method === 'thread-archived') {
      throw new Error('archive broadcast failed')
    }
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
      const waitingInput = this.waitingInputSnapshotThreadIds.has(threadId)
      const waitingApproval = this.waitingApprovalSnapshotThreadIds.has(threadId)
      const planImplementation = this.planImplementationSnapshotThreadIds.has(threadId)
      const activeSnapshot = waitingInput || waitingApproval || planImplementation || this.activeSnapshotThreadIds.has(threadId)
      const sideParentThreadId = this.sideConversationParents.get(threadId)
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
              ...(sideParentThreadId ? { sideConversation: true, forkedFromId: sideParentThreadId } : {}),
              threadRuntimeStatus: { type: activeSnapshot ? 'active' : 'idle', activeFlags: [] },
              resumeState: '',
              hasUnreadTurn: this.unreadSnapshotThreadIds.has(threadId),
              requests: [
                ...(waitingInput ? [{ type: 'userInput', method: 'requestUserInput' }] : []),
                ...(waitingApproval ? [{ type: 'approval', method: 'requestApproval' }] : []),
                ...(planImplementation ? [{ type: 'plan', method: 'item/plan/requestImplementation' }] : [])
              ],
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
const BULK_THREAD_IDS = Array.from({ length: 240 }, (_, index) => `${(index + 1).toString(16).padStart(8, '0')}-1234-4234-8234-123456789abc`)

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

function v7EvidenceDraft(input: Record<string, any>) {
  const { tasks: taskRows = [], relations = [], ...draft } = input
  const providers = {
    codex: input.providers?.codex === true,
    claude: input.providers?.claude === true,
    cursor: input.providers?.cursor === true
  }
  const sourceGenerations = {
    codex: Number(input.sourceGenerations?.codex) || 0,
    claude: Number(input.sourceGenerations?.claude) || 0,
    cursor: Number(input.sourceGenerations?.cursor) || 0
  }
  const lanes = Object.fromEntries((['codex', 'claude', 'cursor'] as const).map((provider) => [provider, Object.fromEntries(
    ['membership', 'activity', 'interaction', 'unread', 'planArtifact', 'metadata', 'topology'].map((channel) => [
      channel,
      Number(input.sourceLaneGenerations?.[provider]?.[channel])
        || (channel === 'interaction' || channel === 'planArtifact'
          ? Number(input.sourceLaneGenerations?.[provider]?.activity)
          : 0)
        || sourceGenerations[provider]
    ])
  )])) as Record<string, Record<string, number>>
  const evidenceBatches = Object.fromEntries((['codex', 'claude', 'cursor'] as const).map((provider) => [provider, {
    revision: 'companion-provider-evidence-batch-v3',
    provider,
    channels: Object.fromEntries(['membership', 'activity', 'interaction', 'unread', 'planArtifact', 'metadata', 'topology'].map((channel) => [channel, {
      mode: 'delta',
      complete: false,
      generation: lanes[provider][channel],
      removedKeys: []
    }])),
    nodes: taskRows.filter((task: Record<string, any>) => task.provider === provider).map((task: Record<string, any>) => ({
      key: task.key,
      provider,
      family: task.family || `${provider}:${task.key}`,
      role: task.role === 'child' ? 'child' : 'root',
      membership: 'present',
      activity: {
        kind: task.phase === 'running' ? 'turn-running'
          : task.phase === 'waiting-input' || task.phase === 'waiting-approval' ? 'turn-completed'
              : task.phase === 'completed' ? 'turn-completed'
                : task.phase === 'stopped' ? task.error === true ? 'turn-failed' : 'turn-interrupted'
                  : 'unknown',
        causalKey: task.causalKey || '',
        sequence: Number(task.phaseRevision) || Number(task.statusEnteredAt) || lanes[provider].activity || Number(task.revisionAt) || 1,
        exact: task.freshness !== 'verifying',
        observedAt: Number(input.acceptedAt) || Date.now(),
        statusEnteredAt: Number(task.statusEnteredAt) || 0,
        turnStartedAt: Number(task.turnStartedAt) || 0,
        terminalAt: Number(task.terminalAt) || 0
      },
      unread: {
        known: task.unreadKnown !== false && typeof task.unread === 'boolean',
        value: task.unread === true,
        sequence: lanes[provider].unread || Number(task.unreadRevision) || 0
      },
      planArtifact: {
        revision: 'companion-plan-artifact-v1',
        state: task.planReady === true || task.planImplementation === true
          ? 'available'
          : task.planLifecycleState === 'cleared'
            ? task.planClearReason === 'cancel' ? 'cancelled'
              : task.planClearReason === 'archive' || task.planClearReason === 'removal' ? 'removed'
                : task.planClearReason === 'execution-start' ? 'executing' : 'consumed'
            : 'unknown',
        sequence: Number(task.planLifecycleRevision) || 0,
        actionable: task.planReady === true || task.planImplementation === true,
        reason: ['cancel', 'execution-start', 'archive', 'removal'].includes(String(task.planClearReason)) ? task.planClearReason : ''
      },
      metadata: { ...task, partial: false },
      capabilities: Object.entries(task.capabilities || {})
        .filter(([, enabled]) => enabled === true)
        .map(([name]) => name === 'executePlan' ? 'execute-plan' : name),
      standaloneEligible: task.standaloneEligible !== false,
      error: task.error === true
    })),
    interactions: taskRows.filter((task: Record<string, any>) => task.provider === provider
      && (task.phase === 'waiting-input' || task.phase === 'waiting-approval')).map((task: Record<string, any>) => {
      const kind = task.phase === 'waiting-approval'
        ? 'approval'
        : task.planImplementation === true ? 'plan-implementation' : 'user-input'
      const sequence = Number(task.phaseRevision) || Number(task.statusEnteredAt) || Number(task.revisionAt) || 1
      return {
        revision: 'companion-interaction-evidence-v1',
        provider,
        taskKey: task.key,
        branchRef: task.role === 'child' ? 'child' : 'root',
        interactionRef: crypto.createHash('sha256').update(`${provider}\0${task.key}\0${kind}\0${sequence}`).digest('hex').slice(0, 32),
        kind,
        state: 'opened',
        sequence,
        turnEpoch: Number(task.turnStartedAt) || 0,
        requestSetRevision: sequence,
        authority: 'provider-live',
        exact: task.freshness !== 'verifying'
      }
    }),
    interactionSets: taskRows.filter((task: Record<string, any>) => task.provider === provider).map((task: Record<string, any>) => ({
      revision: 'companion-interaction-evidence-v1',
      provider,
      taskKey: task.key,
      requestSetRevision: Number(task.phaseRevision) || Number(task.statusEnteredAt) || Number(task.revisionAt) || 1,
      complete: true
    })),
    relations: relations.filter((relation: Record<string, any>) => relation.provider === provider),
    relationMode: 'delta',
    relationsComplete: false,
    removedRelationChildKeys: [],
    health: providers[provider] ? 'ready' : 'unavailable'
  }]))
  return {
    ...draft,
    schema: 'companion-task-evidence-draft-v7',
    providers,
    sourceGenerations,
    sourceLaneGenerations: lanes,
    providerHealth: input.providerHealth || Object.fromEntries((['codex', 'claude', 'cursor'] as const).map((provider) => [provider, {
      status: providers[provider] ? 'ready' : 'disabled',
      generation: sourceGenerations[provider],
      errorCode: ''
    }])),
    evidenceBatches
  }
}

function seedSingleCodexKernelTask(context: Record<string, any>, snapshot: Record<string, any>, task: Record<string, any>) {
  const kernel = context.platform.companionKernel
  const generation = Number(snapshot.value.activityGeneration) || 1
  const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
  kernel.syncPackage({
    lease: receipt.lease,
draft: v7EvidenceDraft({
      producer: 'renderer',
      sourceTaskStateRevision: 'task-state-v12',
      draftRevision: 1,
      acceptedAt: Date.now(),
      enabled: true,
      providers: { codex: true, claude: false },
      complete: true,
      focusedKey: '',
      sourceGenerations: { codex: generation, claude: 0 },
      sourceLaneGenerations: {
        codex: { membership: generation, activity: generation, unread: generation },
        claude: { membership: 0, activity: 0, unread: 0 }
      },
      tasks: [{
        key: task.key,
        provider: 'codex',
        kind: 'codex-thread',
        phase: 'completed',
        cycleTier: 'none',
        dynamicGroup: 'completed',
        actionAlias: task.actionAlias,
        revisionAt: Math.max(1, Number(task.updatedAt) || Number(task.lastTurnStartedAt) || 1),
        membershipRevision: generation,
        phaseRevision: generation,
        unreadRevision: generation,
        visibilityRevision: generation,
        statusEnteredAt: Math.max(1, Number(task.lastTurnCompletedAt) || Number(task.lastTurnStartedAt) || 1),
        lastQuestionAt: Number(task.lastTurnStartedAt) || 1,
        createdAt: Number(task.createdAt) || 0,
        displayOrder: 0,
        cycleOrder: 0,
        attentionOrder: 0,
        hidden: false,
        unreadKnown: true,
        unread: task.hasUnreadTurn === true,
        planImplementation: false,
        planReady: false,
        planLifecycleRevision: 0,
        paused: false,
        turnMode: 'default',
        idleConfirmed: true,
        localPin: false,
        dynamicEligible: true,
        capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false }
      }]
    })
  })
  return kernel
}

function seedSingleClaudeKernelTask(
  context: Record<string, any>,
  overrides: Record<string, any> = {}
) {
  const kernel = context.platform.companionKernel
  const receipt = kernel.attach({ enabled: true, providers: { codex: false, claude: true } })
  const capabilities = {
    open: true,
    archive: true,
    pause: false,
    resume: false,
    executePlan: false,
    ...(overrides.capabilities || {})
  }
  kernel.syncPackage({
    lease: receipt.lease,
draft: v7EvidenceDraft({
      producer: 'renderer',
      sourceTaskStateRevision: 'task-state-v12',
      draftRevision: 1,
      acceptedAt: 100,
      enabled: true,
      providers: { codex: false, claude: true },
      complete: true,
      focusedKey: '',
      sourceGenerations: { codex: 0, claude: 1 },
      sourceLaneGenerations: {
        codex: { membership: 0, activity: 0, unread: 0 },
        claude: { membership: 1, activity: 1, unread: 1 }
      },
      tasks: [{
        key: 'claude:local-a',
        provider: 'claude',
        kind: 'claude-session',
        phase: 'completed',
        cycleTier: 'none',
        dynamicGroup: 'completed',
        actionAlias: 'local-a',
        revisionAt: 100,
        membershipRevision: 100,
        phaseRevision: 100,
        unreadRevision: 0,
        visibilityRevision: 100,
        statusEnteredAt: 100,
        lastQuestionAt: 90,
        createdAt: 80,
        displayOrder: 0,
        cycleOrder: 0,
        attentionOrder: 0,
        hidden: false,
        unreadKnown: false,
        unread: false,
        planImplementation: false,
        planReady: false,
        planLifecycleRevision: 0,
        paused: false,
        turnMode: 'unknown',
        idleConfirmed: true,
        localPin: false,
        dynamicEligible: true,
        ...overrides,
        capabilities
      }]
    })
  })
  return kernel
}

const CODEXHOST_RUNTIME_PID = 4242
const CODEXHOST_CHILD_PID = 4243
const CODEXHOST_CLI_PATH = '/opt/codexhost/bin/codexhost'
const CODEXHOST_LIST_MARKER = '\u0000codexhost-list'

/**
 * Answers the rendezvous probe `preload/codex/codexhost-discovery.cjs` runs
 * before it can call the delegation CLI: find the Host Runtime process, read
 * one harness child's environment, then list Threads. Returns `null` for any
 * command this harness does not own so the ordinary stub still applies.
 */
function codexhostExecFileReply(command: string, args: string[]): string | null {
  if (command === 'ps' && args[0] === '-axww') {
    return `  ${CODEXHOST_RUNTIME_PID} /opt/node/bin/node /opt/codexhost/host-runtime/dist/main.js app-server\n`
  }
  if (command === 'pgrep' && args[0] === '-P' && args[1] === String(CODEXHOST_RUNTIME_PID)) {
    return `${CODEXHOST_CHILD_PID}\n`
  }
  if (command === 'ps' && args[0] === 'eww' && args[2] === String(CODEXHOST_CHILD_PID)) {
    return `  ${CODEXHOST_CHILD_PID} node CODEXHOST_RUNTIME_ENDPOINT=http://127.0.0.1:8931`
      + ` CODEXHOST_RUNTIME_TOKEN=${'a1b2c3d4'.repeat(4)}`
      + ` CODEXHOST_CLI_PATH=${CODEXHOST_CLI_PATH}\n`
  }
  if (command === CODEXHOST_CLI_PATH && args[0] === 'thread' && args[1] === 'list') {
    return CODEXHOST_LIST_MARKER
  }
  return null
}

function loadCodexBridge(
  child: FakeCodexProcess,
  readRegistry: (candidate: string, readIndex: number) => string = () => nativeRegistryText(),
  desktopSocket: FakeCodexDesktopSocket | null = null,
  useHostDate = false,
  useElectronShell = true,
  claudeBridgeOverride: Record<string, any> | null = null,
  enableFloatHarness = false,
  dbStorageHarness: { values: Map<string, unknown>; failWrites?: boolean; writes?: string[] } | null = null,
  codexhostThreads: Array<Record<string, unknown>> | null = null
) {
  const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
  const spawn = vi.fn(() => child)
  const execFile = vi.fn((command: string, args: string[], options: Record<string, unknown>, callback: ExecFileCallback) => {
    const codexhost = codexhostThreads ? codexhostExecFileReply(command, args) : null
    if (codexhost !== null) {
      queueMicrotask(() => callback(null, codexhost === CODEXHOST_LIST_MARKER
        ? JSON.stringify({ threads: codexhostThreads, nextCursor: null })
        : codexhost, ''))
      return
    }
    if (command === '/usr/bin/pgrep' && args[0] === '-x') {
      // Every desktop app is "running" in this sandbox, so the open-readiness
      // step passes straight through and the opener behaves as before.
      queueMicrotask(() => callback(null, '4242\n', ''))
      return
    }
    if (command !== '/usr/sbin/lsof') {
      noSystemProxyExecFile(command, args, options, callback)
      return
    }
    const output = [...child.externalOpenRolloutIds]
      .map((threadId) => `/tmp/.codex/sessions/${threadId}.jsonl`)
      .filter((candidate) => args.includes(candidate))
      .map((candidate, index) => `p${900 + index}\nccodex\nn${candidate}`)
      .join('\n')
    if (output) queueMicrotask(() => callback(null, `${output}\n`, ''))
    else {
      const error = Object.assign(new Error('no open rollout'), { code: 1 })
      queueMicrotask(() => callback(error, '', ''))
    }
  })
  const openExternal = vi.fn(async () => undefined)
  const shellOpenExternal = vi.fn(() => undefined)
  const registryReads: string[] = []
  const nativeStateWatchers: Array<{
    directory: string
    active: boolean
    listener: (event: string, filename: string) => void
    errorListeners: Array<() => void>
  }> = []
  const nativeFileWatchers = new Map<string, {
    interval: number
    listener: (current?: Record<string, unknown>, previous?: Record<string, unknown>) => void
  }>()
  const pluginEnterListeners: Array<(action: { code?: string } | null) => void> = []
  const pluginOutListeners: Array<(isKill: boolean) => void> = []
  const notifications: string[] = []
  const diagnosticEvents: Array<Record<string, any>> = []
  const electronIpcListeners = new Map<string, Array<(event: unknown, payload: Record<string, unknown>) => void>>()
  const floatSends: Array<{ channel: string; payload: Record<string, any>; sentAt: number }> = []
  let floatAppliedAt = 0
  const ipcRenderer = {
    on(channel: string, listener: (event: unknown, payload: Record<string, unknown>) => void) {
      const listeners = electronIpcListeners.get(channel) || []
      listeners.push(listener)
      electronIpcListeners.set(channel, listeners)
    }
  }
  const emitFloatApplied = (revision: number) => {
    if (!revision) return
    queueMicrotask(() => {
      floatAppliedAt = Date.now()
      for (const listener of electronIpcListeners.get('eypc-float:task-package-ack') || []) {
        listener({}, { stage: 'applied', sentRevision: revision, currentRevision: revision })
      }
    })
  }
  const createFloatWindow = (_entry: string, options: Record<string, any>, ready: () => void) => {
    let destroyed = false
    let bounds = { x: options.x, y: options.y, width: options.width, height: options.height }
    const window = {
      webContents: {
        send(channel: string, payload: Record<string, any>) {
          floatSends.push({ channel, payload, sentAt: Date.now() })
          if (channel === 'eypc-float:task-package') emitFloatApplied(Number(payload?.sentRevision))
          if (channel === 'eypc-float:snapshot') emitFloatApplied(Number(payload?.taskSnapshot?.packageRevision))
        },
        on() {}
      },
      isDestroyed: () => destroyed,
      close: () => { destroyed = true },
      getBounds: () => ({ ...bounds }),
      setBounds: (value: Record<string, number>) => { bounds = { ...bounds, ...value } },
      setAlwaysOnTop() {},
      isAlwaysOnTop: () => true,
      setVisibleOnAllWorkspaces() {},
      isVisibleOnAllWorkspaces: () => true,
      setResizable() {},
      setMovable() {},
      show() {},
      showInactive() {},
      hide() {},
      focus() {},
      on() {},
      loadURL: async () => undefined
    }
    queueMicrotask(ready)
    return window
  }
  const rolloutTextForPath = (candidate: string) => {
    const filename = pathModule.basename(candidate, '.jsonl')
    return child.rolloutTexts.get(filename)
  }
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
    utools: {
      onPluginEnter: (listener: (action: { code?: string } | null) => void) => pluginEnterListeners.push(listener),
      onPluginOut: (listener: (isKill: boolean) => void) => pluginOutListeners.push(listener),
      showNotification: (message: string) => notifications.push(message),
      shellOpenExternal,
      ...(dbStorageHarness
        ? {
            dbStorage: {
              getItem: (key: string) => dbStorageHarness.values.get(key),
              setItem: (key: string, value: unknown) => {
                dbStorageHarness.writes?.push(key)
                if (dbStorageHarness.failWrites) return false
                dbStorageHarness.values.set(key, value)
                return true
              }
            }
          }
        : {}),
      ...(enableFloatHarness
        ? {
            createBrowserWindow: createFloatWindow,
            getAllDisplays: () => [{ id: 'display-1', bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 0, width: 1440, height: 900 } }],
            getCursorScreenPoint: () => ({ x: 720, y: 450 })
          }
        : {})
    },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    require(name: string) {
      if (name === './runtime-identity.cjs') return TEST_RUNTIME_IDENTITY
      if (name === './claude/index.cjs' && claudeBridgeOverride) {
        return { createClaudeBridge: () => claudeBridgeOverride }
      }
      if (name === './companion/task-kernel.cjs') return nodeRequire(resolve(process.cwd(), 'preload/companion/task-kernel.cjs'))
      if (name === './companion/persisted-side-state.cjs') return nodeRequire(resolve(process.cwd(), 'preload/companion/persisted-side-state.cjs'))
      if (String(name).endsWith('/diagnostics.cjs')) return {
        createRuntimeDiagnostics: () => ({
          revision: 'eypc-runtime-diagnostics-v3',
          record: (entry: Record<string, unknown>) => {
            diagnosticEvents.push(entry)
            return entry
          },
          configure: () => null,
          cleanup: () => true,
          clear: () => ({ outcome: 'empty', removedFiles: 0, failedFiles: 0, remainingFiles: 0, remainingBytes: 0 }),
          ensureDirectory: () => true,
          snapshot: () => ({
            revision: 'eypc-runtime-diagnostics-v3',
            status: 'ok',
            updatedAt: 0,
            sessionId: 'codex-bridge-test',
            processId: 1,
            settings: { enabled: true, level: 'debug', userConfigured: false, defaultsRevision: 3 },
            directory: '/tmp/eypc-diagnostics',
            activeFile: '',
            totals: { events: diagnosticEvents.length, filtered: 0, debug: 0, info: 0, error: 0, slow: 0, writeFailures: 0 },
            storage: { fileCount: 0, totalBytes: 0, maxFileBytes: 8_388_608, maxTotalBytes: 67_108_864, retentionDays: 14 },
            recent: diagnosticEvents
          })
        })
      }
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
          const rolloutText = rolloutTextForPath(candidate)
          if (rolloutText !== undefined) return { isFile: () => true, size: Buffer.byteLength(rolloutText), mtimeMs: 1_900_000_000 }
          return { isFile: () => false, size: 1 }
        },
        openSync: (candidate: string) => candidate,
        readSync: (descriptor: string, buffer: Buffer, offset: number, length: number, position: number) => {
          const source = Buffer.from(rolloutTextForPath(descriptor) || '', 'utf8')
          return source.copy(buffer, offset, position, position + length)
        },
        closeSync: () => undefined,
        promises: {},
        watch: (directory: string, _options: Record<string, unknown>, listener: (event: string, filename: string) => void) => {
          const record = { directory, active: true, listener, errorListeners: [] as Array<() => void> }
          nativeStateWatchers.push(record)
          const watcher = {
            close() { record.active = false },
            unref() {},
            on(event: string, errorListener: () => void) {
              if (event === 'error') record.errorListeners.push(errorListener)
              return watcher
            }
          }
          return watcher
        },
        watchFile: (candidate: string, options: { interval?: number }, listener: () => void) => {
          nativeFileWatchers.set(candidate, { interval: Number(options?.interval) || 0, listener })
        },
        unwatchFile: (candidate: string) => { nativeFileWatchers.delete(candidate) }
      }
      if (name === 'node:path') return pathModule
      if (name === 'node:os') return { homedir: () => '/tmp' }
      if (name === 'electron') return { ipcRenderer, ...(useElectronShell ? { shell: { openExternal } } : {}) }
      // The entry loads its own module groups by relative path; this shim stands
      // in for the module system, so it resolves those from `preload/` the way
      // the real one does. Naming each module here would mean every future
      // extraction breaks the run before anyone notices.
      if (name.startsWith('.')) return nodeRequire(resolve(process.cwd(), 'preload', name))
      throw new Error(`unexpected require: ${name}`)
    }
  }
  if (useHostDate) Object.assign(sandbox, { Date })
  sandbox.globalThis = sandbox
  vm.runInNewContext(`${preload}\nglobalThis.__codexNativeTest = { parseCodexNativeRegistryText, readCodexNativeRegistry, codexThreadNativeProject, codexResolveParentActivity, codexInventoryThreadTopology, codexRolloutHasPendingUserInputText, codexRolloutPendingPlanStateText, codexRolloutRuntimeStateText, resetCodexThreadSessionState, markCodexThreadTurnStatusDirty, codexObservationForThread: (thread) => codexBranchObservationV7(companionCodexFallbackBranchV7(thread)), applyCodexActivityToCompanionKernel, applyClaudeStateToCompanionKernel, applyClaudeUnreadToCompanionKernel, applyClaudeInventoryDeltaToCompanionKernel, privateBranchEvidence: (threadId) => codexPrivateBranchEvidence(threadId, codexActivityInventory.get(threadId)), openedReadAcknowledgements: () => [...codexDesktopOpenedReadAcknowledgements.entries()], openCompanionCodexTarget, expireCompanionCodexAlias: (key) => { for (const entry of codexThreadActions.values()) if (entry.key === key) entry.expiresAt = 0 }, companionHostReconciliationPending: () => Boolean(companionHostReconcileInFlight) || companionHostReconcilePendingProviders.size > 0 };`, sandbox, { filename: 'preload.js' })
  const exposedPlatform = (sandbox.window as { eypcPlatform: Record<string, any> }).eypcPlatform
  if (!dbStorageHarness?.failWrites) handshakeTestRuntime(exposedPlatform)
  const internalKernel = vm.runInNewContext('companionTaskKernel', sandbox) as Record<string, any>
  const testPlatform: Record<string, any> = { ...exposedPlatform, companionKernel: internalKernel }

  return {
    bridge: (sandbox.window as {
      eypcPlatform: {
        codex: {
          readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>>
          readActivitySnapshot(options?: { phaseOnly?: boolean }): Promise<Record<string, any>>
          onActivityChanged(listener: (delta: Record<string, any>) => void): () => void
          openThread(actionAlias: string): Promise<Record<string, any>>
          createThread(request: Record<string, unknown>): Promise<Record<string, any>>
          archiveThread(actionAlias: string, request: Record<string, unknown>): Promise<Record<string, any>>
          archiveProject(actionAlias: string, request: Record<string, unknown>): Promise<Record<string, any>>
          close(options?: { preserveDesktop?: boolean }): void
        }
      }
    }).eypcPlatform.codex,
    native: (sandbox as unknown as {
      __codexNativeTest: {
        parseCodexNativeRegistryText(text: string): Record<string, any>
        readCodexNativeRegistry(): Record<string, any>
        codexThreadNativeProject(thread: Record<string, unknown>, registry: Record<string, any>): Record<string, any> | null
        codexResolveParentActivity(own: Record<string, unknown>, children: Record<string, unknown>[], options?: Record<string, unknown>): Record<string, any>
        codexInventoryThreadTopology(rows: Record<string, unknown>[]): {
          relations: Map<string, string>
          depths: Map<string, number>
          isolated: Set<string>
        }
        codexRolloutHasPendingUserInputText(text: string): boolean
        codexRolloutPendingPlanStateText(text: string): { known: boolean; pending: boolean }
        codexRolloutRuntimeStateText(text: string): { known: boolean; phase: string; edge: string; startedAt: number; edgeAt: number }
        resetCodexThreadSessionState(): void
        markCodexThreadTurnStatusDirty(threadId: string): void
        codexObservationForThread(thread: Record<string, unknown>): Record<string, any>
        applyCodexActivityToCompanionKernel(delta: Record<string, unknown>): boolean
        applyClaudeStateToCompanionKernel(): boolean
        applyClaudeUnreadToCompanionKernel(): Promise<boolean>
        applyClaudeInventoryDeltaToCompanionKernel(delta: Record<string, unknown>): boolean
        privateBranchEvidence(threadId: string): Record<string, any> | null
        openedReadAcknowledgements(): Array<[string, Record<string, unknown>]>
        openCompanionCodexTarget(target: Record<string, unknown>): Promise<Record<string, unknown>>
        expireCompanionCodexAlias(key: string): void
        companionHostReconciliationPending(): boolean
      }
    }).__codexNativeTest,
    registryReads,
    spawn,
    openExternal,
    shellOpenExternal,
    notifications,
    diagnosticEvents,
    floatSends,
    floatAppliedAt: () => floatAppliedAt,
    dbStorageHarness,
    // Most bridge tests seed Host-private evidence directly. Keep that test
    // authority separate from the production facade, whose surface is asserted
    // through `publicPlatform`.
    platform: testPlatform,
    publicPlatform: exposedPlatform as Record<string, any>,
    triggerPluginEnter: (action: { code?: string } | null) => pluginEnterListeners.forEach((listener) => listener(action)),
    triggerPluginOut: (isKill: boolean) => pluginOutListeners.forEach((listener) => listener(isKill)),
    triggerNativeStateChange: (event = 'change') => nativeStateWatchers
      .filter((watcher) => watcher.active && watcher.directory === '/tmp/.codex')
      .forEach((watcher) => watcher.listener(event, '.codex-global-state.json')),
    triggerNativeStateRecoveryCheck: () => nativeFileWatchers.get('/tmp/.codex/.codex-global-state.json')
      ?.listener({ mtimeMs: 2 }, { mtimeMs: 1 }),
    triggerNativeStateWatchError: () => {
      const watcher = nativeStateWatchers.find((candidate) => candidate.active && candidate.directory === '/tmp/.codex')
      watcher?.errorListeners.forEach((listener) => listener())
    },
    nativeStateWatcherCount: () => nativeStateWatchers
      .filter((watcher) => watcher.active && watcher.directory === '/tmp/.codex').length,
    nativeStateRecoveryInterval: () => nativeFileWatchers.get('/tmp/.codex/.codex-global-state.json')?.interval || 0,
    triggerRolloutChange: (threadId: string) => nativeStateWatchers
      .filter((watcher) => watcher.active && watcher.directory === '/tmp/.codex/sessions')
      .forEach((watcher) => watcher.listener('change', `${threadId}.jsonl`)),
    triggerRolloutRecoveryCheck: (threadId: string) => nativeFileWatchers.get(`/tmp/.codex/sessions/${threadId}.jsonl`)
      ?.listener({ mtimeMs: 2 }, { mtimeMs: 1 }),
    triggerCodexMembershipChange: (root: 'sessions' | 'archived_sessions' = 'archived_sessions') => nativeStateWatchers
      .filter((watcher) => watcher.active && watcher.directory === `/tmp/.codex/${root}`)
      .forEach((watcher) => watcher.listener('rename', 'private-member.jsonl')),
    triggerCodexMembershipRecoveryCheck: (root: 'sessions' | 'archived_sessions' = 'archived_sessions') => nativeFileWatchers
      .get(`/tmp/.codex/${root}`)?.listener({ mtimeMs: 2 }, { mtimeMs: 1 }),
    triggerCodexMembershipWatchError: (root: 'sessions' | 'archived_sessions' = 'archived_sessions') => {
      const watcher = nativeStateWatchers.find((candidate) => candidate.active && candidate.directory === `/tmp/.codex/${root}`)
      watcher?.errorListeners.forEach((listener) => listener())
    },
    codexMembershipWatcherCount: (root: 'sessions' | 'archived_sessions' = 'archived_sessions') => nativeStateWatchers
      .filter((watcher) => watcher.active && watcher.directory === `/tmp/.codex/${root}`).length,
    codexMembershipRecoveryInterval: (root: 'sessions' | 'archived_sessions' = 'archived_sessions') => nativeFileWatchers
      .get(`/tmp/.codex/${root}`)?.interval || 0
  }
}

describe('Codex App Server preload bridge', () => {
  it('adopts Desktop unread for an external Thread the Host has no record for', async () => {
    // The live shape behind 880e66ab: a Host that reports no unread for the
    // Thread (older Host, or a record predating persisted unread) while the
    // Desktop atom still remembers it as unread. Desktop-true must win.
    const child = new FakeCodexProcess()
    const externalId = 'cccccccc-1234-4234-8234-123456789abc'
    const { bridge } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([externalId]),
      null, false, true, null, false, null,
      [{
        threadId: externalId,
        harnessId: 'grok',
        // Interrupted, so the completed-Turn fallback cannot answer and the
        // Desktop atom is the only remaining evidence.
        status: 'interrupted',
        // hasUnreadTurn deliberately absent: the Host has no record.
        cwd: '/tmp/project',
        title: '260901-完成未读感知'
      }]
    )

    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const external = (snapshot.value.threads as Array<Record<string, any>>)
      .find((entry) => entry.codexhostHarnessId === 'grok')

    expect(external).toMatchObject({ hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' })
    bridge.close()
  })

  it('keeps the CodexHost Harness identity on an external Thread and off native ones', async () => {
    const child = new FakeCodexProcess()
    const externalId = 'aaaaaaaa-1234-4234-8234-123456789abc'
    const { bridge } = loadCodexBridge(child, undefined, null, false, true, null, false, null, [
      {
        threadId: externalId,
        harnessId: 'claude-code',
        status: 'completed',
        hasUnreadTurn: false,
        cwd: '/tmp/project',
        title: '260901-供应商调优'
      },
      // A native Codex row is already in the official inventory; the lane
      // drops it instead of hosting the same task twice.
      {
        threadId: 'bbbbbbbb-1234-4234-8234-123456789abc',
        harnessId: 'codex',
        status: 'completed',
        cwd: '/tmp/project',
        title: '原生会话'
      }
    ])

    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(snapshot).toMatchObject({ ok: true })
    const threads = snapshot.value.threads as Array<Record<string, any>>
    const external = threads.filter((entry) => entry.codexhostHarnessId !== undefined)

    expect(external).toHaveLength(1)
    expect(external[0]).toMatchObject({ codexhostHarnessId: 'claude-code', name: 'cc · 260901-供应商调优' })
    expect(threads.filter((entry) => entry.name === 'cx · 原生会话')).toHaveLength(0)
    bridge.close()
  })

  it('does not official-follow extra-process ids, so Host running stays live without a notLoaded shadow', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const externalId = 'dddddddd-1234-4234-8234-123456789abc'
    const context = loadCodexBridge(
      child,
      () => nativeRegistryText(),
      desktopSocket,
      false, true, null, false, null,
      [{
        threadId: externalId,
        harnessId: 'grok',
        status: 'running',
        cwd: '/tmp/project',
        title: '260901-对话发现'
      }]
    )

    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await vi.waitFor(() => {
      expect(desktopSocket.writes.some((message) => (
        message.method === 'thread-stream-following-changed'
        && message.params?.following === true
        && message.params?.conversationId !== externalId
      ))).toBe(true)
    })

    // Official thread/follow cannot answer these ids. Following them plants a
    // notLoaded idle snapshot that later hides Host running/completed rows.
    expect(desktopSocket.writes.some((message) => (
      message.method === 'thread-stream-following-changed'
      && message.params?.conversationId === externalId
    ))).toBe(false)
    expect((snapshot.value.threads as Array<Record<string, any>>)
      .find((entry) => entry.codexhostHarnessId === 'grok')).toMatchObject({
      status: 'active',
      lastTurnStatus: 'inProgress',
      name: 'gr · 260901-对话发现'
    })
    expect(context.diagnosticEvents).toContainEqual(expect.objectContaining({
      event: 'codexhost-published',
      outcome: 'projected',
      count: 1,
      details: expect.objectContaining({ discovered: 1 })
    }))
    context.bridge.close()
  })

  it('answers an extra-process id with no Goal, so Host running/completed is not outranked by goal-verifying', async () => {
    // The live shape behind af54797a / 5d686475 after the notLoaded shadow was
    // removed: the row reached the Kernel yet sat in `unknown` — never active,
    // never completed-unread, absent from every group. Extra-process ids are
    // (correctly) excluded from thread/goal/get, but a missing Goal cache entry
    // read as unknown/verifying, and that goal-verifying candidate outranks the
    // inventory-authority Host evidence in the Kernel's reducer.
    const child = new FakeCodexProcess()
    const completedId = 'eeeeeeee-1234-4234-8234-123456789abc'
    const runningId = 'ffffffff-1234-4234-8234-123456789abc'
    const context = loadCodexBridge(
      child,
      () => nativeRegistryText(),
      null, false, true, null, false, null,
      [{
        threadId: completedId,
        harnessId: 'grok',
        status: 'completed',
        hasUnreadTurn: true,
        cwd: '/tmp/project',
        title: '260902-完成未读'
      }, {
        threadId: runningId,
        harnessId: 'claude-code',
        status: 'running',
        cwd: '/tmp/project',
        title: '260902-进行中'
      }]
    )
    const { codexBranchObservationV7 } = nodeRequire('../../preload/companion/evidence-adapter-v7.cjs') as {
      codexBranchObservationV7(branch: Record<string, unknown>): { candidates: Array<{ kind: string; authority: string }>; unread: boolean }
    }

    await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })

    // Nothing asks the App Server about ids it cannot answer.
    expect(child.writes.some((frame) => frame.method === 'thread/goal/get'
      && [completedId, runningId].includes(String((frame.params as Record<string, unknown>)?.threadId)))).toBe(false)

    // companionCodexEvidenceV7 stamps `hostExternal` on the branch; mirror it.
    const completedBranch = context.native.privateBranchEvidence(completedId)?.branches?.[0] as Record<string, any>
    expect(completedBranch).toMatchObject({ goalStatus: 'none', goalFreshness: 'fresh' })
    const completed = codexBranchObservationV7({ ...completedBranch, hostExternal: true })
    expect(completed.candidates.map((candidate) => candidate.kind)).toEqual(['turn-completed'])
    expect(completed.candidates.some((candidate) => candidate.authority === 'goal-verifying')).toBe(false)
    expect(completed.unread).toBe(true)

    const runningBranch = context.native.privateBranchEvidence(runningId)?.branches?.[0] as Record<string, any>
    expect(runningBranch).toMatchObject({ goalStatus: 'none', goalFreshness: 'fresh' })
    const running = codexBranchObservationV7({ ...runningBranch, hostExternal: true })
    expect(running.candidates.map((candidate) => candidate.kind)).toEqual(['turn-running'])
    expect(running.candidates.some((candidate) => candidate.authority === 'goal-verifying')).toBe(false)
    context.bridge.close()
  })

  it('treats an EyPc jump into an extra-process completed row as read while the Host still reports unread', async () => {
    // Live shape behind 5d686475 (2026-09-02): the completed-unread shortcut
    // dispatched the deep link, but the next snapshot re-asserted Host
    // unread=true — only a card click looked read, and only because the
    // Desktop happened to issue thread/read first. Both paths open through the
    // same navigation; the snapshot must honor EyPc's own opened-read mark.
    const child = new FakeCodexProcess()
    const externalId = 'abababab-1234-4234-8234-123456789abc'
    const context = loadCodexBridge(
      child,
      () => nativeRegistryText(),
      null, false, true, null, false, null,
      [{
        threadId: externalId,
        harnessId: 'grok',
        status: 'completed',
        hasUnreadTurn: true,
        cwd: '/tmp/project',
        title: '260902-快捷键打开即读'
      }]
    )
    const external = () => context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      .then((snapshot) => (snapshot.value.threads as Array<Record<string, any>>).find((row) => row.codexhostHarnessId === 'grok'))
    const before = await external()
    expect(before).toMatchObject({ hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' })

    await expect(context.native.openCompanionCodexTarget({
      key: before!.key,
      provider: 'codex',
      actionAlias: before!.actionAlias,
      revisionAt: before!.updatedAt,
      phase: 'completed'
    })).resolves.toMatchObject({ outcome: 'dispatched' })
    expect(context.native.openedReadAcknowledgements()).toHaveLength(1)
    // The Host list still says unread (the fixture never flips it); EyPc's
    // read wins in the snapshot as well as in the private branch evidence.
    expect(await external()).toMatchObject({ hasUnreadTurn: false, unreadAuthority: 'desktop-live' })
    expect(context.native.privateBranchEvidence(externalId)?.branches?.[0]).toMatchObject({ hasUnreadTurn: false, unreadKnown: true })
    context.bridge.close()
  })

  it('drops an extra-process row the Desktop archived even while the Host list still carries it', async () => {
    // Live shape behind 6e62d596 (2026-09-02): the Desktop archive removed the
    // Grok row, a scan already in flight republished it from the cached Host
    // roster with a newer membership revision, and the row sat in 待继续 until
    // the next full membership publish. The archive must forget the roster entry.
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const externalId = 'acacacac-1234-4234-8234-123456789abc'
    const context = loadCodexBridge(
      child,
      () => nativeRegistryText(),
      desktopSocket,
      false, true, null, false, null,
      [{
        threadId: externalId,
        harnessId: 'grok',
        status: 'completed',
        hasUnreadTurn: false,
        cwd: '/tmp/project',
        title: '260902-归档后残留'
      }]
    )
    const external = () => context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      .then((snapshot) => (snapshot.value.threads as Array<Record<string, any>>).find((row) => row.codexhostHarnessId === 'grok'))
    expect(await external()).toBeTruthy()
    await vi.waitFor(() => expect(desktopSocket.writes.length).toBeGreaterThan(0))
    const deltas: Array<Record<string, any>> = []
    const stop = context.bridge.onActivityChanged((delta: Record<string, any>) => deltas.push(delta))
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-archived',
      sourceClientId: 'codex-desktop-owner',
      version: 2,
      params: { hostId: 'local', conversationId: externalId }
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    stop()
    expect(deltas.some((delta) => Array.isArray(delta.archivedKeys) && delta.archivedKeys.length === 1)).toBe(true)
    // The roster forgot the id: the next scan, still served from the cached Host
    // page that names the thread, must not publish the row again.
    expect(await external()).toBeUndefined()
    context.bridge.close()
  })

  it('records the non-private Runtime Identity handshake once per semantic identity', () => {
    const context = loadCodexBridge(new FakeCodexProcess())
    const handshakes = () => context.diagnosticEvents.filter((event) => event.event === 'runtime-identity-handshake')

    expect(handshakes()).toEqual([expect.objectContaining({
      scope: 'runtime-identity',
      outcome: 'host-loaded',
      details: expect.objectContaining({
        actualHostAssetId: TEST_RUNTIME_IDENTITY.hostAssetId,
        actualRendererAssetId: TEST_RUNTIME_IDENTITY.rendererAssetId,
        actualKernelRevision: TEST_RUNTIME_IDENTITY.kernelRevision,
        actualTaskPackageRevision: TEST_RUNTIME_IDENTITY.taskPackageRevision,
        artifactState: 'artifact-ready'
      })
    })])
    handshakeTestRuntime(context.platform)
    expect(handshakes()).toHaveLength(1)
    expect(JSON.stringify(handshakes())).not.toMatch(/prompt|objective|threadId|path/i)
    context.bridge.close()
  })

  it('copies V6 Plan pause receipts into the isolated V7 namespace once and preserves rollback data', () => {
    const legacyKey = 'eypc/companion/plan-pause/v1'
    const v7Key = 'eypc/companion/v7/plan-pause'
    const legacy = {
      version: 1,
      receipts: [{ key: 'abcdef0123456789', planLifecycleRevision: 7, paused: true, updatedAt: 123 }]
    }
    const values = new Map<string, unknown>([[legacyKey, legacy]])
    const firstWrites: string[] = []
    const first = loadCodexBridge(new FakeCodexProcess(), undefined, null, false, true, null, false, { values, writes: firstWrites })

    expect(values.get(legacyKey)).toBe(legacy)
    expect(values.get(v7Key)).toEqual({
      version: 7,
      receipts: [{ key: 'abcdef0123456789', planLifecycleRevision: 7, paused: true, updatedAt: 123 }]
    })
    expect(firstWrites.filter((key) => key === v7Key)).toHaveLength(1)
    expect(first.platform.companionKernel).toBeTruthy()
    first.bridge.close()

    const secondWrites: string[] = []
    const second = loadCodexBridge(new FakeCodexProcess(), undefined, null, false, true, null, false, { values, writes: secondWrites })
    expect(secondWrites).not.toContain(v7Key)
    expect(values.get(legacyKey)).toBe(legacy)
    expect(second.platform.companionKernel).toBeTruthy()
    second.bridge.close()
  })

  it('blocks V7 Kernel activation when Plan pause migration cannot be persisted', () => {
    const values = new Map<string, unknown>([[
      'eypc/companion/plan-pause/v1',
      { version: 1, receipts: [{ key: 'abcdef0123456789', planLifecycleRevision: 7, paused: true, updatedAt: 123 }] }
    ]])
    const context = loadCodexBridge(new FakeCodexProcess(), undefined, null, false, true, null, false, { values, failWrites: true })

    expect(context.platform.companionKernel).toBeNull()
    expect(context.diagnosticEvents).toContainEqual(expect.objectContaining({
      scope: 'companion-storage',
      event: 'v7-plan-pause-migration',
      outcome: 'blocked',
      details: { namespace: 'v7', legacyPreserved: true }
    }))
    expect(values.has('eypc/companion/v7/plan-pause')).toBe(false)
    context.bridge.close()
  })

  it('exposes only the V6 command surface and dispatches a first-class Cursor root through it', async () => {
    const context = loadCodexBridge(new FakeCodexProcess())
    handshakeTestRuntime(context.publicPlatform)
    const kernel = context.platform.companionKernel
    const publicKernel = context.publicPlatform.companionKernel
    const cursorRevision = Date.now()
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false, cursor: true }, dynamicTaskWindowHours: 36 })
    const readyPackage = kernel.syncPackage({
      lease: receipt.lease,
draft: v7EvidenceDraft({
        producer: 'host-evidence',
        sourceTaskStateRevision: 'task-state-v12',
        draftRevision: 1,
        acceptedAt: Date.now(),
        enabled: true,
        providers: { codex: true, claude: false, cursor: true },
        complete: true,
        focusedKey: '',
        sourceGenerations: { codex: 1, claude: 0, cursor: 1 },
        sourceLaneGenerations: {
          codex: { membership: 1, activity: 1, interaction: 1, unread: 1, planArtifact: 1, metadata: 1, topology: 1 },
          claude: { membership: 0, activity: 0, interaction: 0, unread: 0, planArtifact: 0, metadata: 0, topology: 0 },
          cursor: { membership: 1, activity: 1, interaction: 1, unread: 1, planArtifact: 1, metadata: 1, topology: 1 }
        },
        providerHealth: {
          codex: { status: 'ready', generation: 1, errorCode: '' },
          claude: { status: 'disabled', generation: 0, errorCode: '' },
          cursor: { status: 'ready', generation: 1, errorCode: '' }
        },
        tasks: [{
          key: 'cursor:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          provider: 'cursor',
          kind: 'cursor-session',
          family: 'cursor:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          role: 'root',
          phase: 'running',
          cycleTier: 'active',
          dynamicGroup: 'active',
          actionAlias: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          revisionAt: cursorRevision,
          membershipRevision: cursorRevision,
          phaseRevision: cursorRevision,
          unreadRevision: cursorRevision,
          visibilityRevision: cursorRevision,
          statusEnteredAt: cursorRevision,
          lastQuestionAt: cursorRevision,
          createdAt: cursorRevision - 100,
          hidden: false,
          unreadKnown: true,
          unread: false,
          planImplementation: false,
          planReady: false,
          planLifecycleRevision: 0,
          paused: false,
          turnMode: 'unknown',
          idleConfirmed: false,
          localPin: false,
          dynamicEligible: true,
          capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false }
        }]
      })
    })
    expect(readyPackage).toMatchObject({ complete: true, views: { cycleKeys: ['cursor:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'] } })
    expect(publicKernel).not.toHaveProperty('publishAuxiliaryCycleTasks')
    expect(publicKernel).not.toHaveProperty('syncPackage')
    expect(publicKernel).not.toHaveProperty('dispatch')
    expect(publicKernel).not.toHaveProperty('getPackage')
    await expect(publicKernel.dispatchCommand({
      revision: 'companion-task-command-v1',
      operationId: 'cursor-production-cycle-1',
      command: 'cycle',
      selector: { direction: 1 },
      source: 'global-shortcut',
      expectedRevision: { snapshot: readyPackage.packageRevision, topology: readyPackage.topologyRevision }
    })).resolves.toMatchObject({
      outcome: 'dispatched',
      provider: 'cursor',
      key: 'cursor:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    })
    context.bridge.close()
  })

  it('treats an exact Claude unread snapshot as known across unread and inventory lanes', async () => {
    const noopWatch = () => () => undefined
    const context = loadCodexBridge(
      new FakeCodexProcess(),
      () => nativeRegistryText(),
      null,
      false,
      true,
      {
        inspect: () => ({ available: true }),
        readCodeStateSnapshot: () => ({
          generation: 3,
          stateGeneration: 3,
          readAt: 350,
          sessions: [{
            sessionId: 'local-b',
            phase: 'completed',
            stateCompatibility: 'compatible',
            stateGeneration: 3,
            phaseUpdatedAt: 300,
            turnStartedAt: 250,
            lastStopAt: 300,
            lastActivityAt: 300,
            metadataUpdatedAt: 300,
            createdAt: 100
          }]
        }),
        readCodeUnread: async () => ({ ids: [], generation: 2, readAt: 200 }),
        watchCodeState: noopWatch,
        watchCodeSessions: noopWatch,
        watchCodeUnread: noopWatch,
        close: () => undefined
      }
    )
    const kernel = seedSingleClaudeKernelTask(context)

    await expect(context.native.applyClaudeUnreadToCompanionKernel()).resolves.toBe(true)
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === 'claude:local-a'))
      .toMatchObject({ phase: 'completed', unreadKnown: true, unread: false })

    expect(context.native.applyClaudeInventoryDeltaToCompanionKernel({
      acceptedAt: 300,
      mutations: [{
        mutation: 'upsert',
        key: 'claude:local-b',
        session: {
          sessionId: 'local-b',
          phase: 'completed',
          stateCompatibility: 'compatible',
          stateGeneration: 300,
          phaseUpdatedAt: 300,
          turnStartedAt: 250,
          lastStopAt: 300,
          lastActivityAt: 300,
          metadataUpdatedAt: 300,
          createdAt: 100
        }
      }]
    })).toBe(true)
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === 'claude:local-b'))
      .toMatchObject({ phase: 'unknown', unreadKnown: true, unread: false })
    expect(context.native.applyClaudeStateToCompanionKernel()).toBe(true)
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === 'claude:local-b'))
      .toMatchObject({ phase: 'completed', unreadKnown: true, unread: false })
    expect(context.diagnosticEvents.filter((event) => event.event === 'claude-unread-v7').at(-1))
      .toMatchObject({ outcome: 'accepted' })
    expect(context.diagnosticEvents.filter((event) => event.event === 'claude-inventory-v7').at(-1))
      .toMatchObject({ outcome: 'accepted' })
    context.bridge.close()
  })

  it('keeps Claude inventory delivery off the activity, interaction and unread waterlines', () => {
    const noopWatch = () => () => undefined
    const context = loadCodexBridge(
      new FakeCodexProcess(),
      () => nativeRegistryText(),
      null,
      false,
      true,
      {
        inspect: () => ({ available: true }),
        readCodeStateSnapshot: () => ({
          generation: 2,
          stateGeneration: 2,
          readAt: 400,
          sessions: [{
            sessionId: 'local-a',
            phase: 'completed',
            stateCompatibility: 'compatible',
            stateGeneration: 2,
            phaseUpdatedAt: 200,
            turnStartedAt: 100,
            lastStopAt: 200,
            lastActivityAt: 180,
            metadataUpdatedAt: 150,
            createdAt: 80
          }]
        }),
        watchCodeState: noopWatch,
        watchCodeSessions: noopWatch,
        watchCodeUnread: noopWatch,
        close: () => undefined
      }
    )
    const kernel = seedSingleClaudeKernelTask(context, {
      phase: 'running',
      dynamicGroup: 'active',
      idleConfirmed: false,
      capabilities: { archive: false }
    })

    const before = { ...kernel.getPackage().sourceLaneGenerations.claude }
    expect(context.native.applyClaudeInventoryDeltaToCompanionKernel({
      generation: 90,
      acceptedAt: 300,
      mutations: [{
        mutation: 'upsert',
        key: 'claude:local-a',
        session: {
          sessionId: 'local-a',
          phase: 'running',
          stateCompatibility: 'compatible',
          stateGeneration: 1,
          phaseUpdatedAt: 150,
          turnStartedAt: 100,
          lastActivityAt: 150,
          metadataUpdatedAt: 300,
          createdAt: 80
        }
      }]
    })).toBe(true)

    const afterInventory = kernel.getPackage()
    expect(afterInventory.sourceLaneGenerations.claude).toMatchObject({
      activity: before.activity,
      interaction: before.interaction,
      unread: before.unread,
      topology: before.topology
    })
    expect(afterInventory.tasks.find((task: Record<string, any>) => task.key === 'claude:local-a'))
      .toMatchObject({ phase: 'running' })

    expect(context.native.applyClaudeStateToCompanionKernel()).toBe(true)
    const afterState = kernel.getPackage()
    expect(afterState.sourceLaneGenerations.claude.activity).toBe(2)
    expect(afterState.tasks.find((task: Record<string, any>) => task.key === 'claude:local-a'))
      .toMatchObject({ phase: 'completed' })
    context.bridge.close()
  })

  it('does not manufacture a Claude read from an inventory mutation without unread authority', () => {
    const noopWatch = () => () => undefined
    const context = loadCodexBridge(
      new FakeCodexProcess(),
      () => nativeRegistryText(),
      null,
      false,
      true,
      {
        inspect: () => ({ available: true }),
        watchCodeState: noopWatch,
        watchCodeSessions: noopWatch,
        watchCodeUnread: noopWatch,
        close: () => undefined
      }
    )
    const kernel = seedSingleClaudeKernelTask(context, {
      unreadKnown: true,
      unread: true
    })

    expect(context.native.applyClaudeInventoryDeltaToCompanionKernel({
      generation: 50,
      acceptedAt: 300,
      mutations: [{
        mutation: 'upsert',
        key: 'claude:local-a',
        session: {
          sessionId: 'local-a',
          phase: 'completed',
          stateCompatibility: 'compatible',
          stateGeneration: 1,
          phaseUpdatedAt: 300,
          turnStartedAt: 90,
          lastStopAt: 300,
          lastActivityAt: 300,
          metadataUpdatedAt: 300,
          createdAt: 80
        }
      }]
    })).toBe(true)

    expect(kernel.getPackage().sourceLaneGenerations.claude.unread).toBe(1)
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === 'claude:local-a'))
      .toMatchObject({ phase: 'completed', unreadKnown: true, unread: true })
    context.bridge.close()
  })

  it('resolves nested same-session forks to one root and leaves missing, mismatched or cyclic forks standalone', () => {
    const context = loadCodexBridge(new FakeCodexProcess())
    const rootId = FIXED_THREAD_IDS[0]
    const childId = 'a2345678-1234-4234-8234-123456789abc'
    const nestedId = 'b2345678-1234-4234-8234-123456789abc'
    const missingId = 'c2345678-1234-4234-8234-123456789abc'
    const mismatchedId = 'd2345678-1234-4234-8234-123456789abc'
    const cycleAId = 'e2345678-1234-4234-8234-123456789abc'
    const cycleBId = 'f2345678-1234-4234-8234-123456789abc'
    const topology = context.native.codexInventoryThreadTopology([
      { id: rootId, sessionId: 'session-root' },
      { id: childId, sessionId: 'session-root', forkedFromId: rootId },
      { id: nestedId, sessionId: 'session-root', forkedFromId: childId },
      { id: missingId, sessionId: 'session-root', forkedFromId: '02345678-1234-4234-8234-123456789abc' },
      { id: mismatchedId, sessionId: 'session-other', forkedFromId: rootId },
      { id: cycleAId, sessionId: 'session-cycle', forkedFromId: cycleBId },
      { id: cycleBId, sessionId: 'session-cycle', forkedFromId: cycleAId }
    ])

    expect(topology.relations.get(childId)).toBe(rootId)
    expect(topology.relations.get(nestedId)).toBe(rootId)
    expect(topology.depths.get(childId)).toBe(1)
    expect(topology.depths.get(nestedId)).toBe(2)
    expect(topology.relations.has(missingId)).toBe(false)
    expect(topology.relations.has(mismatchedId)).toBe(false)
    expect(topology.relations.has(cycleAId)).toBe(false)
    expect(topology.relations.has(cycleBId)).toBe(false)
    expect([...topology.isolated]).toEqual(expect.arrayContaining([
      missingId,
      mismatchedId,
      cycleAId,
      cycleBId
    ]))
    context.bridge.close()
  })

  it('links a forkless subagent row to the root its parentThreadId names', () => {
    const context = loadCodexBridge(new FakeCodexProcess())
    const rootId = FIXED_THREAD_IDS[0]
    const subagentId = 'a3345678-1234-4234-8234-123456789abc'
    const orphanSubagentId = 'b3345678-1234-4234-8234-123456789abc'
    const plainRootId = 'c3345678-1234-4234-8234-123456789abc'
    const topology = context.native.codexInventoryThreadTopology([
      // A root makes no parent claim; its sessionId is its own id.
      { id: rootId, sessionId: rootId },
      // A subagent run: no forkedFromId, parentThreadId names the root and
      // its sessionId stays its own id (the RPC boundary shape).
      { id: subagentId, sessionId: subagentId, parentThreadId: rootId },
      // The same claim with the root absent from the inventory is an orphan.
      { id: orphanSubagentId, sessionId: orphanSubagentId, parentThreadId: '02345678-1234-4234-8234-123456789abc' },
      // A session id naming another thread is not a claim by itself.
      { id: plainRootId, sessionId: rootId }
    ])

    expect(topology.relations.get(subagentId)).toBe(rootId)
    expect(topology.depths.get(subagentId)).toBe(1)
    expect(topology.relations.has(rootId)).toBe(false)
    expect(topology.relations.has(plainRootId)).toBe(false)
    expect(topology.relations.has(orphanSubagentId)).toBe(false)
    expect([...topology.isolated]).toEqual([orphanSubagentId])
    context.bridge.close()
  })

  it('keeps the Claude Node Host and Float package lane live while Main is hidden', async () => {
    const realFs = nodeRequire('node:fs') as typeof import('node:fs')
    const claudeModule = nodeRequire(resolve(process.cwd(), 'preload/claude/index.cjs')) as {
      createClaudeBridge(dependencies: Record<string, unknown>): Record<string, any>
    }
    const root = mkdtempSync(pathModule.join(tmpdir(), 'eypc-hidden-claude-host-'))
    const claudeHome = pathModule.join(root, '.claude')
    const appData = pathModule.join(root, 'Claude')
    const codeRoot = pathModule.join(appData, 'claude-code-sessions')
    const codeDirectory = pathModule.join(codeRoot, 'org', 'user')
    const logDirectory = pathModule.join(root, 'logs')
    const dataDirectory = pathModule.join(root, 'eypc-data')
    const localId = 'local_11111111-1111-4111-8111-111111111111'
    const cliId = '22222222-2222-4222-8222-222222222222'
    mkdirSync(claudeHome, { recursive: true })
    mkdirSync(codeDirectory, { recursive: true })
    mkdirSync(logDirectory, { recursive: true })
    mkdirSync(dataDirectory, { recursive: true })
    writeFileSync(pathModule.join(logDirectory, 'main.log'), '')
    writeFileSync(pathModule.join(codeDirectory, `${localId}.json`), JSON.stringify({
      sessionId: localId,
      cliSessionId: cliId,
      title: 'Hidden Host regression',
      cwd: '/work/project',
      originCwd: '/work/project',
      createdAt: 1_000,
      lastActivityAt: 2_000,
      lastFocusedAt: 2_000,
      model: 'claude-opus-5',
      isArchived: false,
      completedTurns: 1
    }))

    const directoryWatchers = new Map<string, (event: string, filename: string | null) => void>()
    const fileWatchers = new Map<string, { interval: number; listener: () => void }>()
    const controlledFs = new Proxy(realFs, {
      get(target, key) {
        if (key === 'watch') return (directory: string, _options: unknown, listener: (event: string, filename: string | null) => void) => {
          directoryWatchers.set(directory, listener)
          return { on: () => undefined, close: () => undefined }
        }
        if (key === 'watchFile') return (filePath: string, options: { interval?: number }, listener: () => void) => {
          fileWatchers.set(filePath, { interval: Number(options?.interval) || 0, listener })
        }
        if (key === 'unwatchFile') return (filePath: string) => { fileWatchers.delete(filePath) }
        return Reflect.get(target, key)
      }
    })
    const claudeBridge = claudeModule.createClaudeBridge({
      fs: controlledFs,
      path: pathModule,
      os: { homedir: () => root, tmpdir },
      platform: 'darwin',
      process: { platform: 'darwin', env: { PATH: '' } },
      env: { PATH: '' },
      claudeHome,
      claudeAppDataRoot: appData,
      claudeCodeRoot: codeRoot,
      claudeLogDirectory: logDirectory,
      claudeAppVersion: '1.28929.0',
      dataDirectory
    })
    writeFileSync(claudeBridge.queuePath, '')
    const initial = claudeBridge.readCodeSnapshot({ now: Date.now() })
    const context = loadCodexBridge(
      new FakeCodexProcess(),
      () => nativeRegistryText(),
      null,
      true,
      true,
      claudeBridge,
      true
    )
    const kernel = context.platform.companionKernel
    const generation = Math.max(1, Number(initial.generation) || 0)
    const receipt = kernel.attach({ enabled: true, providers: { codex: false, claude: true }, dynamicTaskWindowHours: 36 })
    kernel.syncPackage({
      lease: receipt.lease,
draft: v7EvidenceDraft({
        producer: 'renderer',
        sourceTaskStateRevision: 'task-state-v12',
        draftRevision: 1,
        acceptedAt: Date.now(),
        enabled: true,
        providers: { codex: false, claude: true },
        complete: true,
        focusedKey: '',
        sourceGenerations: { codex: 0, claude: generation },
        sourceLaneGenerations: {
          codex: { membership: 0, activity: 0, unread: 0 },
          claude: { membership: generation, activity: generation, unread: generation }
        },
        tasks: [{
          key: `claude:${localId}`,
          provider: 'claude',
          kind: 'claude-session',
          phase: 'unknown',
          cycleTier: 'none',
          dynamicGroup: 'none',
          actionAlias: localId,
          revisionAt: 2_000,
          membershipRevision: 2_000,
          phaseRevision: 2_000,
          unreadRevision: 2_000,
          visibilityRevision: 2_000,
          statusEnteredAt: 2_000,
          lastQuestionAt: 2_000,
          createdAt: 1_000,
          displayOrder: 0,
          cycleOrder: 0,
          attentionOrder: 0,
          hidden: false,
          unread: false,
          planImplementation: false,
          planReady: false,
          planLifecycleRevision: 0,
          paused: false,
          turnMode: 'unknown',
          idleConfirmed: false,
          localPin: false,
          dynamicEligible: true,
          capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false }
        }]
      })
    })
    context.platform.float.sync({
      visible: true,
      snapshot: {
        version: 2,
        baseRevision: 1,
        style: 'water',
        expandedFields: ['tasks'],
        conversationInboxEnabled: true,
        quota: {},
        conversations: { ongoing: [], stopped: [], hidden: [], completedUnread: [], completed: [] }
      },
      position: { displayId: 'display-1', edge: 'right' }
    })
    await vi.waitFor(() => expect(context.floatAppliedAt()).toBeGreaterThan(0))
    context.triggerPluginOut(false)

    const promptAt = Date.now()
    appendFileSync(claudeBridge.queuePath, `${JSON.stringify({ s: cliId, e: 'UserPromptSubmit', t: promptAt, p: 42 })}\n`)
    directoryWatchers.get(dataDirectory)?.('change', 'eypc-claude-events.jsonl')
    await vi.waitFor(() => expect(kernel.getPackage().tasks[0].phase).toBe('running'))
    await vi.waitFor(() => expect(context.floatAppliedAt()).toBeGreaterThanOrEqual(promptAt))
    expect(context.floatAppliedAt() - promptAt).toBeLessThanOrEqual(250)

    const stopAt = Date.now()
    appendFileSync(claudeBridge.queuePath, `${JSON.stringify({ s: cliId, e: 'Stop', t: stopAt, p: 42 })}\n`)
    const recovery = fileWatchers.get(claudeBridge.queuePath)
    expect(recovery?.interval).toBe(1_000)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, recovery?.interval || 1_000))
    recovery?.listener()
    await vi.waitFor(() => expect(kernel.getPackage().tasks[0].phase).toBe('completed'))
    await vi.waitFor(() => expect(context.floatAppliedAt()).toBeGreaterThanOrEqual(stopAt))
    expect(context.floatAppliedAt() - stopAt).toBeLessThanOrEqual(1_250)

    expect(context.floatSends.some((entry) => entry.channel === 'eypc-float:task-package'
      && entry.payload.taskSnapshot.tasks[0].phase === 'running')).toBe(true)
    expect(context.floatSends.some((entry) => entry.channel === 'eypc-float:task-package'
      && entry.payload.taskSnapshot.tasks[0].phase === 'completed')).toBe(true)
    context.triggerPluginOut(true)
    claudeBridge.close()
  }, 10_000)

  it('never lets parent idle evidence close a still-live Host branch', () => {
    const context = loadCodexBridge(new FakeCodexProcess())
    const staleActive = {
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'interrupted'
    }

    expect(context.native.codexObservationForThread({
      ...staleActive,
      lastTurnEvidence: 'turn-completed',
      idleConfirmed: true
    }).candidates).toContainEqual(expect.objectContaining({ kind: 'turn-running' }))
    expect(context.native.codexObservationForThread({
      ...staleActive,
      lastTurnEvidence: 'inventory'
    }).candidates).toContainEqual(expect.objectContaining({ kind: 'turn-running' }))
    expect(context.native.codexObservationForThread({
      ...staleActive,
      activeFlags: ['waitingOnUserInput'],
      lastTurnEvidence: 'turn-completed'
    })).toMatchObject({ interactionKind: 'user-input' })
    expect(context.native.codexObservationForThread({
      ...staleActive,
      lastTurnStatus: 'failed',
      lastTurnEvidence: 'turn-completed'
    }).candidates).toContainEqual(expect.objectContaining({ kind: 'turn-running' }))
    context.triggerPluginOut(true)
  })

  it('keeps an active Goal running across automatic Turns and publishes completion once the Goal completes', async () => {
    const child = new FakeCodexProcess()
    const threadId = FIXED_THREAD_IDS[3]
    child.goalStates.set(threadId, { status: 'active', updatedAt: 2_000_000_050 })
    const context = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([threadId]),
      null,
      true,
      true,
      null,
      true
    )
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 36 })
    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((task: Record<string, any>) => task.displayName === '跨端未知')).toMatchObject({
      phase: 'running',
      unread: true,
      dynamicGroup: 'active'
    }))
    const task = kernel.getPackage().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')
    expect(kernel.getPackage().views.counts).toMatchObject({ active: 1, unread: 0 })

    context.platform.float.sync({
      visible: true,
      snapshot: {
        version: 2,
        baseRevision: 1,
        style: 'water',
        expandedFields: ['tasks'],
        conversationInboxEnabled: true,
        quota: {},
        conversations: { ongoing: [], stopped: [], hidden: [], completedUnread: [], completed: [] }
      },
      position: { displayId: 'display-1', edge: 'right' }
    })
    await vi.waitFor(() => expect(context.floatAppliedAt()).toBeGreaterThan(0))
    const floatBaseline = context.floatSends.length
    const phases: string[] = []
    const stopPackage = kernel.onPackage((value: Record<string, any>) => {
      const candidate = value.tasks.find((entry: Record<string, any>) => entry.key === task.key)
      if (candidate) phases.push(candidate.phase)
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId,
        turn: { status: 'completed', startedAt: 2_000_000_100, completedAt: 2_000_000_120 }
      }
    })}\n`)
    await vi.waitFor(() => expect(context.native.privateBranchEvidence(threadId)?.branches?.[0]).toMatchObject({
      goalStatus: 'active',
      goalFreshness: 'fresh'
    }))
    expect(kernel.getPackage().tasks.find((entry: Record<string, any>) => entry.key === task.key))
      .toMatchObject({ phase: 'running', unread: true, terminalAt: 0 })
    expect(kernel.getPackage().views.counts).toMatchObject({ active: 1, unread: 0 })
    expect(phases).not.toContain('completed')

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: { threadId, turn: { status: 'inProgress', startedAt: 2_000_000_200 } }
    })}\n`)
    await vi.waitFor(() => expect(context.native.privateBranchEvidence(threadId)?.branches?.[0]).toMatchObject({
      lastTurnStatus: 'inProgress',
      goalStatus: 'active',
      goalFreshness: 'fresh'
    }))
    expect(kernel.getPackage().tasks.find((entry: Record<string, any>) => entry.key === task.key))
      .toMatchObject({ phase: 'running', unread: true, terminalAt: 0 })
    expect(kernel.getPackage().views.counts).toMatchObject({ active: 1, unread: 0 })
    expect(phases).not.toContain('completed')

    const turnFloatPhases = context.floatSends.slice(floatBaseline)
      .filter((entry) => entry.channel === 'eypc-float:task-package')
      .flatMap((entry) => entry.payload.taskSnapshot.tasks)
      .filter((entry: Record<string, any>) => entry.key === task.key)
      .map((entry: Record<string, any>) => entry.phase)
    expect(turnFloatPhases).toContain('running')
    expect(turnFloatPhases).not.toContain('completed')

    // Deliberately omit thread/goal/updated. The terminal candidate must
    // single-flight re-read the now-complete Goal before publishing completion.
    child.goalStates.set(threadId, { status: 'complete', updatedAt: 2_000_000_300 })
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId,
        turn: { status: 'completed', startedAt: 2_000_000_200, completedAt: 2_000_000_220 }
      }
    })}\n`)
    await vi.waitFor(() => expect(context.native.privateBranchEvidence(threadId)?.branches?.[0]).toMatchObject({
      lastTurnStatus: 'completed',
      goalStatus: 'complete',
      goalFreshness: 'fresh'
    }))
    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      phase: 'completed',
      unread: true,
      dynamicGroup: 'unread'
    }))
    expect(kernel.getPackage().views.counts).toMatchObject({ active: 0, unread: 1 })
    await vi.waitFor(() => expect(context.floatSends.some((entry) => entry.channel === 'eypc-float:task-package'
      && entry.payload.taskSnapshot.tasks.some((candidate: Record<string, any>) => candidate.key === task.key
        && candidate.phase === 'completed'
        && candidate.unread === true))).toBe(true))
    expect(phases.filter((phase) => phase === 'completed')).toHaveLength(1)

    const goalNotification = {
      method: 'thread/goal/updated',
      params: {
        threadId,
        goal: {
          status: 'complete',
          updatedAt: 2_000_000_300,
          objective: 'private objective from notification',
          timeUsedSeconds: 91,
          tokensUsed: 101
        }
      }
    }
    child.stdout.emit('data', `${JSON.stringify(goalNotification)}\n`)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0))
    expect(phases.filter((phase) => phase === 'completed')).toHaveLength(1)

    const stableRevision = kernel.getPackage().packageRevision
    const stableFloatCount = context.floatSends.length
    child.stdout.emit('data', `${JSON.stringify(goalNotification)}\n`)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0))
    expect(kernel.getPackage().packageRevision).toBe(stableRevision)
    expect(context.floatSends).toHaveLength(stableFloatCount)

    const beforeOpen = kernel.getPackage()
    await expect(kernel.dispatchCommand({
      revision: 'companion-task-command-v1',
      operationId: 'goal-open-unread-0001',
      command: 'open',
      selector: { key: task.key },
      source: 'test',
      expectedRevision: { snapshot: beforeOpen.packageRevision, topology: beforeOpen.topologyRevision },
      payload: {}
    })).resolves.toMatchObject({
      outcome: 'dispatched',
      confirmsRead: false,
      handoff: { stage: 'dispatched', nativeVisible: false }
    })
    expect(kernel.getPackage()).toMatchObject({
      tasks: expect.arrayContaining([expect.objectContaining({
        key: task.key,
        phase: 'completed',
        unread: true,
        dynamicGroup: 'unread'
      })]),
      views: { counts: { active: 0, unread: 1 } }
    })
    await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(kernel.getPackage().tasks.find((entry: Record<string, any>) => entry.key === task.key))
      .toMatchObject({ phase: 'completed', unread: true })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'thread/goal/updated',
      params: {
        threadId,
        goal: { status: 'active', updatedAt: 2_000_000_050, objective: 'stale private objective' }
      }
    })}\n`)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0))
    expect(kernel.getPackage().tasks.find((entry: Record<string, any>) => entry.key === task.key))
      .toMatchObject({ phase: 'completed', unread: true })

    const publicPayloads = JSON.stringify({
      activity: await context.bridge.readActivitySnapshot(),
      taskPackage: kernel.getPackage(),
      float: context.floatSends
    })
    expect(publicPayloads).not.toContain('goalStatus')
    expect(publicPayloads).not.toContain('private objective')
    expect(publicPayloads).not.toContain('timeUsedSeconds')
    expect(publicPayloads).not.toContain('tokensUsed')
    expect(context.native.privateBranchEvidence(threadId)?.branches?.[0]).toMatchObject({
      goalStatus: 'complete',
      goalFreshness: 'fresh',
      goalUpdatedAt: 2_000_000_300_000
    })
    stopPackage()
    context.triggerPluginOut(true)
  })

  it('maps every non-active Goal state to the existing stopped / pending-continuation group', async () => {
    for (const goalStatus of ['paused', 'blocked', 'usageLimited', 'budgetLimited'] as const) {
      const child = new FakeCodexProcess()
      const threadId = FIXED_THREAD_IDS[3]
      child.goalStates.set(threadId, { status: goalStatus, updatedAt: 2_000_000_050 })
      const context = loadCodexBridge(child)
      const kernel = context.platform.companionKernel
      kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 36 })
      await vi.waitFor(() => expect(kernel.getPackage().tasks
        .find((task: Record<string, any>) => task.displayName === '跨端未知')).toMatchObject({
        phase: 'stopped',
        dynamicGroup: 'stopped'
      }))
      const task = kernel.getPackage().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')
      expect(kernel.getPackage().views.groups.stopped).toContain(task.key)
      expect(context.native.privateBranchEvidence(threadId)?.branches?.[0]).toMatchObject({
        goalStatus,
        goalFreshness: 'fresh'
      })
      expect(JSON.stringify(await context.bridge.readActivitySnapshot())).not.toContain('goalStatus')
      context.triggerPluginOut(true)
    }
  })

  it('returns to the existing completed-Turn projection when a Goal is cleared', async () => {
    const child = new FakeCodexProcess()
    const threadId = FIXED_THREAD_IDS[3]
    child.goalStates.set(threadId, { status: 'active', updatedAt: 2_000_000_050 })
    const context = loadCodexBridge(child)
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 36 })
    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((task: Record<string, any>) => task.displayName === '跨端未知')).toMatchObject({ phase: 'running' }))
    const task = kernel.getPackage().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')

    child.goalStates.delete(threadId)
    child.stdout.emit('data', `${JSON.stringify({
      method: 'thread/goal/cleared',
      params: { threadId }
    })}\n`)
    await vi.waitFor(() => expect(context.native.privateBranchEvidence(threadId)?.branches?.[0]).toMatchObject({
      goalStatus: 'none',
      goalFreshness: 'fresh'
    }))
    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({ phase: 'completed' }))
    expect(JSON.stringify(await context.bridge.readActivitySnapshot())).not.toContain('goalStatus')
    context.triggerPluginOut(true)
  })

  it('preserves the last nonterminal phase as verifying when Goal reads fail transiently', async () => {
    const child = new FakeCodexProcess()
    const threadId = FIXED_THREAD_IDS[1]
    child.inProgressTurnIds.add(threadId)
    child.transientGoalFailures = 20
    const context = loadCodexBridge(child)
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 36 })
    await vi.waitFor(() => expect(context.native.privateBranchEvidence(threadId)?.branches?.[0]).toMatchObject({
      goalStatus: 'unknown',
      goalFreshness: 'verifying'
    }))
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: { threadId, turn: { status: 'inProgress', startedAt: 2_000_000_010 } }
    })}\n`)
    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((task: Record<string, any>) => task.displayName === '运行中')).toMatchObject({ phase: 'running' }))
    const task = kernel.getPackage().tasks.find((value: Record<string, any>) => value.displayName === '运行中')
    const phases: string[] = []
    const stopPackage = kernel.onPackage((value: Record<string, any>) => {
      const candidate = value.tasks.find((entry: Record<string, any>) => entry.key === task.key)
      if (candidate) phases.push(candidate.phase)
    })

    child.inProgressTurnIds.delete(threadId)
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId,
        turn: { status: 'completed', startedAt: 2_000_000_010, completedAt: 2_000_000_020 }
      }
    })}\n`)

    await vi.waitFor(() => expect(context.native.privateBranchEvidence(threadId)?.branches?.[0]).toMatchObject({
      lastTurnStatus: 'completed',
      goalStatus: 'unknown',
      goalFreshness: 'verifying'
    }))
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0))
    expect(kernel.getPackage().tasks.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      phase: 'running',
      freshness: 'verifying',
      terminalAt: 0
    })
    expect(phases).not.toContain('completed')
    expect(child.writes.filter((frame) => frame.method === 'thread/goal/get'
      && frame.params?.threadId === threadId).length).toBeGreaterThanOrEqual(2)

    child.transientGoalFailures = 0
    child.goalStates.set(threadId, { status: 'active', updatedAt: 2_000_000_100 })
    child.stdout.emit('data', `${JSON.stringify({
      method: 'thread/goal/updated',
      params: { threadId, goal: { status: 'active', updatedAt: 2_000_000_100 } }
    })}\n`)
    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      phase: 'running',
      freshness: 'fresh'
    }))
    expect(phases).not.toContain('completed')
    stopPackage()
    context.triggerPluginOut(true)
  })

  it('never publishes completion while the terminal Goal recheck is timing out', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000_000_000)
    try {
      const child = new FakeCodexProcess()
      child.holdNextGoalRead = true
      const context = loadCodexBridge(child, () => nativeRegistryText(), null, true)
      const snapshotPromise = context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await vi.advanceTimersByTimeAsync(0)
      expect(child.heldGoalReads).toHaveLength(1)
      const threadId = String(child.heldGoalReads[0].params?.threadId || '')

      await vi.advanceTimersByTimeAsync(5_000)
      const snapshot = await snapshotPromise
      const taskIndex = FIXED_THREAD_IDS.indexOf(threadId)
      const sourceTask = snapshot.value.threads[taskIndex]
      const kernel = context.platform.companionKernel
      kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 36 })
      await vi.advanceTimersByTimeAsync(0)

      child.holdNextGoalRead = true
      child.stdout.emit('data', `${JSON.stringify({
        method: 'turn/started',
        params: { threadId, turn: { status: 'inProgress', startedAt: 2_000_000_010 } }
      })}\n`)
      await vi.advanceTimersByTimeAsync(0)
      expect(child.heldGoalReads).toHaveLength(2)
      expect(kernel.getPackage().tasks.find((entry: Record<string, any>) => entry.key === sourceTask.key))
        .toMatchObject({ phase: 'running' })
      const phases: string[] = []
      const stopPackage = kernel.onPackage((value: Record<string, any>) => {
        const candidate = value.tasks.find((entry: Record<string, any>) => entry.key === sourceTask.key)
        if (candidate) phases.push(candidate.phase)
      })

      child.stdout.emit('data', `${JSON.stringify({
        method: 'turn/completed',
        params: {
          threadId,
          turn: { status: 'completed', startedAt: 2_000_000_010, completedAt: 2_000_000_020 }
        }
      })}\n`)
      await vi.advanceTimersByTimeAsync(4_999)
      expect(kernel.getPackage().tasks.find((entry: Record<string, any>) => entry.key === sourceTask.key)).toMatchObject({
        phase: 'running',
        freshness: 'verifying',
        terminalAt: 0
      })
      expect(phases).not.toContain('completed')

      await vi.advanceTimersByTimeAsync(1)
      expect(kernel.getPackage().tasks.find((entry: Record<string, any>) => entry.key === sourceTask.key)).toMatchObject({
        phase: 'running',
        freshness: 'verifying',
        terminalAt: 0
      })
      expect(phases).not.toContain('completed')
      stopPackage()
      context.triggerPluginOut(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a late Goal query and lets a strictly newer Turn open a fresh execution epoch', async () => {
    const child = new FakeCodexProcess()
    const threadId = FIXED_THREAD_IDS[3]
    // Goal and Turn timestamps are intentionally equal at provider precision;
    // the later App Server stream sequence must still open a new epoch.
    child.goalStates.set(threadId, { status: 'complete', updatedAt: 2_000_000_100 })
    const context = loadCodexBridge(child)
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 36 })
    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((task: Record<string, any>) => task.displayName === '跨端未知')).toMatchObject({ phase: 'completed' }))
    const task = kernel.getPackage().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')

    child.holdNextGoalRead = true
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: { threadId, turn: { status: 'inProgress', startedAt: 2_000_000_100 } }
    })}\n`)
    await vi.waitFor(() => expect(child.heldGoalReads).toHaveLength(1))
    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({ phase: 'running' }))

    child.stdout.emit('data', `${JSON.stringify({
      method: 'thread/goal/updated',
      params: { threadId, goal: { status: 'active', updatedAt: 2_000_000_200 } }
    })}\n`)
    await vi.waitFor(() => expect(context.native.privateBranchEvidence(threadId)?.branches?.[0]).toMatchObject({
      goalStatus: 'active',
      goalFreshness: 'fresh',
      goalUpdatedAt: 2_000_000_200_000
    }))

    // The held RPC still returns the old completed Goal. Its request baseline
    // must lose to the newer notification sequence and updatedAt.
    child.releaseHeldGoalReads()
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0))
    expect(context.native.privateBranchEvidence(threadId)?.branches?.[0]).toMatchObject({
      goalStatus: 'active',
      goalFreshness: 'fresh',
      goalUpdatedAt: 2_000_000_200_000
    })
    expect(kernel.getPackage().tasks.find((entry: Record<string, any>) => entry.key === task.key))
      .toMatchObject({ phase: 'running', terminalAt: 0 })
    context.triggerPluginOut(true)
  })

  it('falls back to the existing Turn lifecycle only when Goal RPC is explicitly unsupported', async () => {
    const child = new FakeCodexProcess()
    const threadId = FIXED_THREAD_IDS[3]
    child.unsupportedGoalGet = true
    const context = loadCodexBridge(child)
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 36 })
    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((task: Record<string, any>) => task.displayName === '跨端未知')).toMatchObject({ phase: 'completed' }))
    const task = kernel.getPackage().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')
    expect(context.native.privateBranchEvidence(threadId)?.branches?.[0]).toMatchObject({
      goalStatus: 'none',
      goalFreshness: 'fresh'
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: { threadId, turn: { status: 'inProgress', startedAt: 2_000_000_100 } }
    })}\n`)
    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({ phase: 'running' }))
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId,
        turn: { status: 'completed', startedAt: 2_000_000_100, completedAt: 2_000_000_120 }
      }
    })}\n`)
    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({ phase: 'completed' }))
    expect(child.writes.some((frame) => frame.method === 'thread/goal/get')).toBe(true)
    context.triggerPluginOut(true)
  })

  it('keeps the cold latest-Turn read provenance for an interrupted task', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const context = loadCodexBridge(child)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const interrupted = snapshot.value.threads.find((thread: Record<string, unknown>) => thread.lastTurnStatus === 'interrupted')
    expect(interrupted).toMatchObject({
      lastTurnStatus: 'interrupted',
      lastTurnEvidence: 'targeted-after-exit'
    })
    expect(context.native.codexObservationForThread(interrupted).candidates)
      .toContainEqual(expect.objectContaining({ kind: 'turn-interrupted' }))
    context.triggerPluginOut(true)
  })

  it('reconciles a membership-only task event into the process Kernel without a Renderer', async () => {
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(child)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads[0]
    const kernel = context.platform.companionKernel
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
draft: v7EvidenceDraft({
        producer: 'renderer',
        sourceTaskStateRevision: 'task-state-v12',
        draftRevision: 1,
        acceptedAt: Date.now(),
        enabled: true,
        providers: { codex: true, claude: false },
        complete: true,
        focusedKey: '',
        sourceGenerations: { codex: Number(snapshot.value.activityGeneration) || 1, claude: 0 },
        tasks: [{
          key: task.key,
          provider: 'codex',
          kind: 'codex-thread',
          phase: 'running',
          cycleTier: 'active',
          dynamicGroup: 'active',
          actionAlias: task.actionAlias,
          revisionAt: Math.max(1, Number(task.activityRevision) || Number(task.lastTurnStartedAt) || Number(task.updatedAt) || 1),
          statusEnteredAt: Math.max(1, Number(task.lastTurnStartedAt) || Number(task.updatedAt) || 1),
          displayOrder: 0,
          cycleOrder: 0,
          attentionOrder: 0,
          hidden: false,
          unread: false,
          planImplementation: false,
          localPin: false,
          dynamicEligible: true,
          capabilities: { open: true, archive: false }
        }]
      })
    })

    child.includeCreatedThreadInInventory = true
    child.stdout.emit('data', `${JSON.stringify({
      method: 'thread/started',
      params: { thread: { id: child.createdThreadId } }
    })}\n`)

    await vi.waitFor(() => expect(kernel.getPackage().tasks.length).toBeGreaterThan(1))
    expect(kernel.getPackage()).toMatchObject({
      complete: true,
      sourceTaskStateRevision: 'task-state-v12:provider-evidence-v7',
      providers: { codex: true, claude: false }
    })
    context.triggerPluginOut(true)
  })

  it('activates the quick task view straight from a cold global entry without waiting for the Renderer', async () => {
    const context = loadCodexBridge(new FakeCodexProcess(), () => nativeRegistryText(), null, true, true, null, true)
    context.platform.float.sync({
      visible: true,
      snapshot: {
        version: 2,
        baseRevision: 1,
        style: 'water',
        expandedFields: ['tasks'],
        conversationInboxEnabled: true,
        quota: {},
        conversations: { ongoing: [], stopped: [], hidden: [], completedUnread: [], completed: [] }
      },
      position: { displayId: 'display-1', edge: 'right' }
    })
    await vi.waitFor(() => expect(context.floatSends.length).toBeGreaterThan(0))
    const forwarded: Array<{ code?: string } | null> = []
    const stop = context.platform.onEnterPayload((payload: { code?: string } | null) => forwarded.push(payload))

    context.triggerPluginEnter({ code: 'eypc-companion-quick' })

    const activations = context.floatSends.filter((entry) => entry.channel === 'eypc-float:activate')
    expect(activations).toHaveLength(1)
    expect(activations[0].payload).toMatchObject({ command: 'quick' })
    // 宿主自己拥有悬浮子窗口，所以冷启动一次到位，不把同一个意图再重放给 Renderer。
    expect(forwarded).toEqual([])
    expect(context.platform.getEnterPayload()).toBeNull()

    // 其它 code 不得被这条快速通道吞掉。
    context.triggerPluginEnter({ code: 'eypc-main' })
    expect(context.floatSends.filter((entry) => entry.channel === 'eypc-float:activate')).toHaveLength(1)
    expect(forwarded).toEqual([{ code: 'eypc-main' }])
    stop()
    context.triggerPluginOut(true)
  })

  it('removes a Codex task after an external Desktop archive without any archive broadcast', async () => {
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(child)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const archivedTask = snapshot.value.threads[3]
    const kernel = seedSingleCodexKernelTask(context, snapshot, archivedTask)
    context.triggerPluginEnter(null)
    await vi.waitFor(() => expect(context.codexMembershipWatcherCount('archived_sessions')).toBe(1))
    await vi.waitFor(() => expect(context.native.companionHostReconciliationPending()).toBe(false))

    const deltas: Array<Record<string, any>> = []
    const stop = context.bridge.onActivityChanged((delta) => deltas.push(delta))
    const unarchivedReadsBefore = child.unarchivedListReadCount
    const archivedReadsBefore = child.archivedListReadCount
    child.archivedIds.add(FIXED_THREAD_IDS[3])

    context.triggerCodexMembershipChange('archived_sessions')

    await vi.waitFor(() => expect(deltas.some((delta) => Array.isArray(delta.archivedKeys)
      && delta.archivedKeys.includes(archivedTask.key))).toBe(true))
    await vi.waitFor(() => expect(kernel.getLatest().tasks.some((task: Record<string, any>) => task.key === archivedTask.key)).toBe(false))
    expect(child.unarchivedListReadCount).toBeGreaterThan(unarchivedReadsBefore)
    expect(child.archivedListReadCount).toBeGreaterThan(archivedReadsBefore)
    expect(deltas.find((delta) => delta.archivedKeys?.includes(archivedTask.key))).toMatchObject({
      inventoryChanged: true,
      inventoryRefreshPriority: 'urgent',
      archivedKeys: [archivedTask.key]
    })
    expect(JSON.stringify(deltas)).not.toContain(FIXED_THREAD_IDS[3])
    stop()
    context.triggerPluginOut(true)
  })

  it('recovers a dropped Codex archive watcher event within the one-second StatWatcher lane and rebuilds the watcher', async () => {
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(child)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const archivedTask = snapshot.value.threads[3]
    const kernel = seedSingleCodexKernelTask(context, snapshot, archivedTask)
    context.triggerPluginEnter(null)
    await vi.waitFor(() => expect(context.native.companionHostReconciliationPending()).toBe(false))
    expect(context.codexMembershipRecoveryInterval('archived_sessions')).toBe(1_000)

    child.archivedIds.add(FIXED_THREAD_IDS[3])
    const startedAt = Date.now()
    context.triggerCodexMembershipRecoveryCheck('archived_sessions')

    await vi.waitFor(() => expect(kernel.getLatest().tasks.some((task: Record<string, any>) => task.key === archivedTask.key)).toBe(false))
    expect(Date.now() - startedAt).toBeLessThanOrEqual(1_250)

    const readsBeforeRebuild = child.archivedListReadCount
    context.triggerCodexMembershipWatchError('archived_sessions')
    await vi.waitFor(() => expect(context.codexMembershipWatcherCount('archived_sessions')).toBe(1))
    await vi.waitFor(() => expect(child.archivedListReadCount).toBeGreaterThan(readsBeforeRebuild))
    context.triggerPluginOut(true)
  })

  it('never recovers a dirty thread through thread/read after archived inventory already contains it', async () => {
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(child)
    const baseline = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const archivedKey = baseline.value.threads[3].key
    context.native.markCodexThreadTurnStatusDirty(FIXED_THREAD_IDS[3])
    child.archivedIds.add(FIXED_THREAD_IDS[3])
    const exactReadsBefore = child.writes.filter((frame) => frame.method === 'thread/read'
      && frame.params?.threadId === FIXED_THREAD_IDS[3]).length

    const refreshed = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })

    expect(refreshed).toMatchObject({ ok: true })
    expect(refreshed.value.threads.some((thread: Record<string, any>) => thread.key === archivedKey)).toBe(false)
    expect(child.writes.filter((frame) => frame.method === 'thread/read'
      && frame.params?.threadId === FIXED_THREAD_IDS[3])).toHaveLength(exactReadsBefore)
    expect(child.archivedListReadCount).toBeGreaterThan(0)
    context.triggerPluginOut(true)
  })

  it('allows a later external archive after local verify-1 proved the task was still unarchived', async () => {
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(child)
    const baseline = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const completed = baseline.value.threads[3]
    seedSingleCodexKernelTask(context, baseline, completed)
    context.triggerPluginEnter(null)
    await vi.waitFor(() => expect(context.codexMembershipWatcherCount('archived_sessions')).toBe(1))
    await vi.waitFor(() => expect(context.native.companionHostReconciliationPending()).toBe(false))
    child.archiveThreadId = FIXED_THREAD_IDS[3]
    child.archiveThreadStatus = 'notLoaded'
    child.archiveThreadRecency = completed.updatedAt
    child.archiveNoopIds.add(FIXED_THREAD_IDS[3])

    await expect(context.bridge.archiveThread(completed.actionAlias, {
      expectedUpdatedAt: completed.updatedAt,
      expectedRevisionAt: completed.lastTurnCompletedAt,
      expectedCompletionAt: completed.lastTurnCompletedAt,
      expectedLastTurnStartedAt: completed.lastTurnStartedAt,
      expectedSourceFingerprint: baseline.value.sourceFingerprint,
      evidence: 'completed',
      operationId: 'archive-verify-one-0005',
      source: 'archive-button'
    })).resolves.toMatchObject({
      outcome: 'indeterminate',
      errorCode: 'archive-verify-1-failed'
    })
    expect((await context.bridge.readActivitySnapshot()).value.entries.some((entry: Record<string, any>) => entry.key === completed.key)).toBe(true)

    const deltas: Array<Record<string, any>> = []
    const stop = context.bridge.onActivityChanged((delta) => deltas.push(delta))
    child.archiveNoopIds.delete(FIXED_THREAD_IDS[3])
    child.archivedIds.add(FIXED_THREAD_IDS[3])
    context.triggerCodexMembershipChange('archived_sessions')

    await vi.waitFor(() => expect(deltas.some((delta) => delta.archivedKeys?.includes(completed.key))).toBe(true))
    expect((await context.bridge.readActivitySnapshot()).value.entries.some((entry: Record<string, any>) => entry.key === completed.key)).toBe(false)
    stop()
    context.triggerPluginOut(true)
  })

  it('rebuilds one private task alias after lifecycle reset and shares one tasks-only preflight across concurrent opens', async () => {
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(child)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const staleTask = snapshot.value.threads[0]
    const inventoryReadsBefore = child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === false).length

    context.native.resetCodexThreadSessionState()
    const target = {
      key: staleTask.key,
      provider: 'codex',
      actionAlias: staleTask.actionAlias,
      revisionAt: staleTask.updatedAt,
      phase: 'waiting-input'
    }
    const results = await Promise.all([
      context.native.openCompanionCodexTarget(target),
      context.native.openCompanionCodexTarget(target)
    ])

    expect(results).toEqual([
      expect.objectContaining({
        outcome: 'dispatched',
        confirmsRead: false,
        handoff: expect.objectContaining({ stage: 'dispatched' })
      }),
      expect.objectContaining({
        outcome: 'dispatched',
        confirmsRead: false,
        handoff: expect.objectContaining({ stage: 'dispatched' })
      })
    ])
    expect(child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === false))
      .toHaveLength(inventoryReadsBefore + 1)
    expect(context.openExternal).toHaveBeenCalledTimes(2)
    await expect(context.native.openCompanionCodexTarget(target)).resolves.toMatchObject({
      outcome: 'dispatched',
      confirmsRead: false,
      handoff: { stage: 'dispatched' }
    })
    expect(child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === false))
      .toHaveLength(inventoryReadsBefore + 1)
    expect(context.openExternal).toHaveBeenCalledTimes(3)
    expect(context.platform.companionKernel.getLatest().tasks.every((task: Record<string, unknown>) => !('actionAlias' in task))).toBe(true)
    context.triggerPluginOut(true)
  })

  it('renews an expired alias from the exact private inventory mapping without a full scan', async () => {
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(child)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const staleTask = snapshot.value.threads[0]
    const inventoryReadsBefore = child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === false).length
    context.native.expireCompanionCodexAlias(staleTask.key)

    await expect(context.native.openCompanionCodexTarget({
      key: staleTask.key,
      provider: 'codex',
      actionAlias: staleTask.actionAlias,
      revisionAt: staleTask.updatedAt,
      phase: 'waiting-input'
    })).resolves.toMatchObject({ outcome: 'dispatched', confirmsRead: false, handoff: { stage: 'dispatched' } })

    expect(child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === false))
      .toHaveLength(inventoryReadsBefore)
    expect(context.openExternal).toHaveBeenCalledTimes(1)
    context.triggerPluginOut(true)
  })

  it('fails closed when a stale exact key disappears during recovery and never opens another task', async () => {
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(child)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const staleTask = snapshot.value.threads[0]
    child.omittedIds.add(FIXED_THREAD_IDS[0])
    context.native.resetCodexThreadSessionState()

    await expect(context.native.openCompanionCodexTarget({
      key: staleTask.key,
      provider: 'codex',
      actionAlias: staleTask.actionAlias,
      revisionAt: staleTask.updatedAt,
      phase: 'waiting-input'
    })).resolves.toMatchObject({ outcome: 'failed', errorCode: 'target-missing' })

    expect(context.openExternal).not.toHaveBeenCalled()
    expect(context.platform.companionKernel.getLatest().tasks.some((task: Record<string, unknown>) => task.key === staleTask.key)).toBe(false)
    context.triggerPluginOut(true)
  })

  it('keeps same-generation phase and unread lanes independent and still reconciles membership', async () => {
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(child)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads[0]
    const generation = Number(snapshot.value.activityGeneration) || 1
    const kernel = context.platform.companionKernel
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
draft: v7EvidenceDraft({
        producer: 'renderer',
        sourceTaskStateRevision: 'task-state-v12',
        draftRevision: 1,
        acceptedAt: Date.now(),
        enabled: true,
        providers: { codex: true, claude: false },
        complete: true,
        focusedKey: '',
        sourceGenerations: { codex: generation, claude: 0 },
        sourceLaneGenerations: {
          codex: { membership: generation, activity: generation, unread: Math.max(0, generation - 1) },
          claude: { membership: 0, activity: 0, unread: 0 }
        },
        tasks: [{
          key: task.key,
          provider: 'codex',
          kind: 'codex-thread',
          phase: 'running',
          cycleTier: 'active',
          dynamicGroup: 'active',
          actionAlias: task.actionAlias,
          revisionAt: 1,
          statusEnteredAt: 1,
          displayOrder: 0,
          cycleOrder: 0,
          attentionOrder: 0,
          hidden: false,
          unread: false,
          planImplementation: false,
          localPin: false,
          dynamicEligible: true,
          capabilities: { open: true, archive: false }
        }]
      })
    })

    expect(context.native.applyCodexActivityToCompanionKernel({
      generation: generation + 1,
      receivedAt: 2_000_000_000_000,
      inventoryChanged: false,
      entries: [{ key: task.key, status: 'active', lastTurnStatus: 'inProgress' }]
    })).toBe(true)
    expect(kernel.getPackage().sourceLaneGenerations.codex).toMatchObject({
      activity: generation + 1,
      unread: Math.max(0, generation - 1)
    })

    expect(context.native.applyCodexActivityToCompanionKernel({
      generation: generation + 1,
      receivedAt: 2_000_000_000_001,
      inventoryChanged: false,
      entries: [{ key: task.key, readStateOnly: true, hasUnreadTurn: true, unreadAuthority: 'desktop-live' }]
    })).toBe(true)
    expect(kernel.getPackage()).toMatchObject({
      sourceLaneGenerations: { codex: { activity: generation + 1, unread: generation + 1 } },
      tasks: [expect.objectContaining({ key: task.key, unread: true })]
    })

    child.includeCreatedThreadInInventory = true
    expect(context.native.applyCodexActivityToCompanionKernel({
      generation: generation + 1,
      receivedAt: 2_000_000_000_002,
      inventoryChanged: true,
      entries: []
    })).toBe(true)
    await vi.waitFor(() => expect(kernel.getPackage().tasks.length).toBeGreaterThan(1))
    await vi.waitFor(() => expect(context.native.companionHostReconciliationPending()).toBe(false))
    context.triggerPluginOut(true)
  })

  it('does not let a hydration-only active row overwrite corroborated terminal history', async () => {
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(child)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const sourceTask = snapshot.value.threads[0]
    const generation = Number(snapshot.value.activityGeneration) || 1
    const kernel = context.platform.companionKernel
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
draft: v7EvidenceDraft({
        producer: 'renderer',
        sourceTaskStateRevision: 'task-state-v12',
        draftRevision: 1,
        acceptedAt: 1,
        enabled: true,
        providers: { codex: true, claude: false },
        complete: true,
        focusedKey: '',
        sourceGenerations: { codex: generation, claude: 0 },
        sourceLaneGenerations: {
          codex: { membership: generation, activity: generation, unread: generation },
          claude: { membership: 0, activity: 0, unread: 0 }
        },
        tasks: []
      })
    })

    expect(context.native.applyCodexActivityToCompanionKernel({
      generation: generation + 1,
      receivedAt: 2_000_000_000_000,
      inventoryChanged: false,
      entries: [{
        key: sourceTask.key,
        actionAlias: sourceTask.actionAlias,
        status: 'active',
        statusAuthority: 'app-server-live',
        activityEvidence: 'initial-snapshot',
        lastTurnStatus: 'inProgress'
      }]
    })).toBe(true)

    expect(kernel.getPackage()).toMatchObject({
      tasks: [expect.objectContaining({
        key: sourceTask.key,
        phase: 'completed',
        freshness: 'verifying',
        dynamicGroup: 'completed'
      })],
      views: {
        groups: { active: [] },
        counts: { active: 0 }
      }
    })
    context.triggerPluginOut(true)
  })

  it('promotes a cold refollow active snapshot from the same fresh inProgress Turn without repeat publications', async () => {
    const child = new FakeCodexProcess()
    child.inProgressTurnIds.add(FIXED_THREAD_IDS[3])
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
    const context = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const sourceTask = snapshot.value.threads.find((thread: Record<string, unknown>) => thread.name === '跨端未知')
    const generation = Number(snapshot.value.activityGeneration) || 1
    const kernel = context.platform.companionKernel
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })

    kernel.syncPackage({
      lease: receipt.lease,
draft: v7EvidenceDraft({
        producer: 'renderer',
        sourceTaskStateRevision: 'task-state-v12',
        draftRevision: 1,
        acceptedAt: 1,
        enabled: true,
        providers: { codex: true, claude: false },
        complete: true,
        focusedKey: '',
        sourceGenerations: { codex: generation, claude: 0 },
        sourceLaneGenerations: {
          codex: { membership: generation, activity: generation, unread: generation },
          claude: { membership: 0, activity: 0, unread: 0 }
        },
        tasks: [{
          key: sourceTask.key,
          provider: 'codex',
          kind: 'codex-thread',
          phase: 'stopped',
          cycleTier: 'none',
          dynamicGroup: 'stopped',
          actionAlias: sourceTask.actionAlias,
          revisionAt: Number(sourceTask.updatedAt) || 1,
          statusEnteredAt: Number(sourceTask.lastTurnStartedAt) || 1,
          turnStartedAt: Number(sourceTask.lastTurnStartedAt) || 1,
          idleConfirmed: true,
          displayOrder: 0,
          cycleOrder: 0,
          attentionOrder: 0,
          hidden: false,
          unread: false,
          planImplementation: false,
          localPin: false,
          dynamicEligible: true,
          capabilities: { open: true, archive: true }
        }]
      })
    })

    await vi.waitFor(() => expect(kernel.getPackage().tasks
      .find((task: Record<string, unknown>) => task.key === sourceTask.key)).toMatchObject({
      phase: 'running',
      idleConfirmed: false,
      dynamicGroup: 'active',
      capabilities: { open: true, archive: false }
    }))
    expect((await context.bridge.readActivitySnapshot()).value.entries
      .find((entry: Record<string, any>) => entry.key === sourceTask.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'initial-snapshot',
      lastTurnStatus: 'inProgress',
      activeEvidenceSequence: expect.any(Number)
    })
    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list'
      && frame.params?.threadId === FIXED_THREAD_IDS[3]
      && frame.params?.limit === 1).length).toBe(1)

    // Let the first complete inventory replace the single-task stale fixture. That
    // membership expansion is a real semantic change; subsequent identical scans
    // must keep the same task package revision and publish nothing.
    await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await vi.waitFor(() => expect(kernel.getPackage().tasks.length).toBe(snapshot.value.threads.length))
    const stablePackageRevision = kernel.getPackage().packageRevision
    const publications: number[] = []
    const stopPackage = kernel.onPackage((value: Record<string, any>) => publications.push(value.packageRevision))
    const baselinePublicationCount = publications.length
    for (let index = 0; index < 20; index += 1) {
      await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    }
    expect(kernel.getPackage().packageRevision).toBe(stablePackageRevision)
    expect(publications).toHaveLength(baselinePublicationCount)
    stopPackage()
    context.triggerPluginOut(true)
  })

  it('consumes a hot previous/next entry in preload without forwarding a duplicate Renderer payload', async () => {
    const context = loadCodexBridge(new FakeCodexProcess())
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads[0]
    const kernel = context.platform.companionKernel
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    expect(kernel.syncPackage({
      lease: receipt.lease,
draft: v7EvidenceDraft({
        producer: 'renderer',
        sourceTaskStateRevision: 'task-state-v12',
        draftRevision: 1,
        acceptedAt: Date.now(),
        enabled: true,
        providers: { codex: true, claude: false },
        complete: true,
        focusedKey: '',
        sourceGenerations: { codex: Number(snapshot.value.activityGeneration) || 1, claude: 0 },
        tasks: [{
          key: task.key,
          provider: 'codex',
          kind: 'codex-thread',
          phase: 'waiting-input',
          cycleTier: 'attention',
          dynamicGroup: 'input',
          actionAlias: task.actionAlias,
          revisionAt: Math.max(1, Number(task.activityRevision) || Number(task.lastTurnStartedAt) || Number(task.updatedAt) || 1),
          statusEnteredAt: Math.max(1, Number(task.waitingSince) || Number(task.updatedAt) || 1),
          displayOrder: 0,
          cycleOrder: 0,
          attentionOrder: 0,
          hidden: false,
          unread: false,
          planImplementation: false,
          localPin: false,
          dynamicEligible: true,
          capabilities: { open: true, archive: false }
        }]
      })
    })).toMatchObject({
      enabled: true,
      complete: true,
      views: { cycleKeys: [task.key] }
    })
    const forwarded: Array<{ code?: string } | null> = []
    const stop = context.platform.onEnterPayload((payload: { code?: string } | null) => forwarded.push(payload))

    context.triggerPluginEnter({ code: 'eypc-codex-task-next' })

    expect(context.platform.getEnterPayload()).toBeNull()
    expect(forwarded).toEqual([])
    await vi.waitFor(() => expect(kernel.diagnostics().navigation).toMatchObject({ maxConcurrent: 1, dispatched: { codex: 1, claude: 0 } }))
    stop()
    context.triggerPluginOut(true)
  })

  it('recovers only an unresolved persisted request_user_input call from a bounded rollout tail', () => {
    const { bridge, native } = loadCodexBridge(new FakeCodexProcess())
    const call = (callId: string) => JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'request_user_input', call_id: callId } })
    const output = (callId: string) => JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', call_id: callId } })
    const userMessage = JSON.stringify({ type: 'event_msg', payload: { type: 'user_message' } })

    expect(native.codexRolloutHasPendingUserInputText(call('pending'))).toBe(true)
    expect(native.codexRolloutHasPendingUserInputText([call('resolved'), output('resolved')].join('\n'))).toBe(false)
    expect(native.codexRolloutHasPendingUserInputText([call('cancelled'), userMessage].join('\n'))).toBe(false)
    expect(native.codexRolloutHasPendingUserInputText([
      call('aborted'),
      JSON.stringify({ type: 'event_msg', payload: { type: 'turn_aborted' } })
    ].join('\n'))).toBe(false)
    expect(native.codexRolloutHasPendingUserInputText(JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'exec', call_id: 'other' } }))).toBe(false)
    bridge.close()
  })

  it('reduces rollout live append and exact terminal edges without treating cold history as current by itself', () => {
    const { bridge, native } = loadCodexBridge(new FakeCodexProcess())
    const started = JSON.stringify({
      timestamp: '2030-03-17T17:48:20.000Z',
      type: 'event_msg',
      payload: { type: 'task_started' }
    })
    const reasoning = JSON.stringify({
      timestamp: '2030-03-17T17:48:21.000Z',
      type: 'response_item',
      payload: { type: 'reasoning' }
    })
    const complete = JSON.stringify({
      timestamp: '2030-03-17T17:48:22.000Z',
      type: 'event_msg',
      payload: { type: 'task_complete' }
    })
    const aborted = JSON.stringify({
      timestamp: '2030-03-17T17:48:23.000Z',
      type: 'event_msg',
      payload: { type: 'turn_aborted' }
    })

    expect(native.codexRolloutRuntimeStateText([started, reasoning].join('\n'))).toMatchObject({
      known: true,
      phase: 'active',
      edge: 'live-append',
      startedAt: Date.parse('2030-03-17T17:48:20.000Z')
    })
    expect(native.codexRolloutRuntimeStateText([started, reasoning, complete].join('\n'))).toMatchObject({
      phase: 'completed',
      edge: 'task-complete'
    })
    expect(native.codexRolloutRuntimeStateText([started, reasoning, aborted].join('\n'))).toMatchObject({
      phase: 'interrupted',
      edge: 'turn-aborted'
    })
    bridge.close()
  })

  it('recovers an ownerless active task only when its exact rollout is live and externally held', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    child.externalOpenRolloutIds.add(FIXED_THREAD_IDS[3])
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ timestamp: '2030-03-17T17:48:20.000Z', type: 'event_msg', payload: { type: 'task_started' } }),
      JSON.stringify({ timestamp: '2030-03-17T17:48:21.000Z', type: 'response_item', payload: { type: 'reasoning' } })
    ].join('\n'))
    const { bridge } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')

    await vi.waitFor(async () => expect((await bridge.readActivitySnapshot()).value.entries
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'active',
        activeFlags: [],
        statusAuthority: 'app-server-live',
        activityEvidence: 'activity-event',
        lastTurnStatus: 'inProgress'
      }))
    bridge.close()
  })

  it('does not promote a cold completed or aborted rollout even when it contains an unmatched task start', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ timestamp: '2030-03-17T17:48:20.000Z', type: 'event_msg', payload: { type: 'task_started' } }),
      JSON.stringify({ timestamp: '2030-03-17T17:48:21.000Z', type: 'response_item', payload: { type: 'reasoning' } }),
      JSON.stringify({ timestamp: '2030-03-17T17:48:22.000Z', type: 'event_msg', payload: { type: 'turn_aborted' } })
    ].join('\n'))
    const { bridge } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'notLoaded',
      lastTurnStatus: 'interrupted'
    })
    bridge.close()
  })

  it('keeps a completed task terminal when opening it leaves a transient external rollout handle', async () => {
    const child = new FakeCodexProcess()
    child.externalOpenRolloutIds.add(FIXED_THREAD_IDS[3])
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ timestamp: '2030-03-17T17:48:20.000Z', type: 'event_msg', payload: { type: 'task_started' } }),
      JSON.stringify({ timestamp: '2030-03-17T17:48:21.000Z', type: 'response_item', payload: { type: 'reasoning' } }),
      JSON.stringify({ timestamp: '2030-03-17T17:48:22.000Z', type: 'event_msg', payload: { type: 'task_complete' } })
    ].join('\n'))
    const { bridge } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'notLoaded',
      lastTurnStatus: 'completed'
    })
    bridge.close()
  })

  it('opens and closes one rollout live epoch from append, task_complete and turn_aborted edges', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const baseline = JSON.stringify({
      timestamp: '2030-03-17T17:48:19.000Z',
      type: 'event_msg',
      payload: { type: 'turn_aborted' }
    })
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], baseline)
    const context = loadCodexBridge(child)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')
    const started = JSON.stringify({
      timestamp: '2030-03-17T17:48:20.000Z',
      type: 'event_msg',
      payload: { type: 'task_started' }
    })
    const reasoning = JSON.stringify({
      timestamp: '2030-03-17T17:48:21.000Z',
      type: 'response_item',
      payload: { type: 'reasoning' }
    })
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [baseline, started, reasoning].join('\n'))
    context.triggerRolloutChange(FIXED_THREAD_IDS[3])

    await vi.waitFor(async () => expect((await context.bridge.readActivitySnapshot()).value.entries
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'active',
        lastTurnStatus: 'inProgress',
        statusAuthority: 'app-server-live'
      }))

    const complete = JSON.stringify({
      timestamp: '2030-03-17T17:48:22.000Z',
      type: 'event_msg',
      payload: { type: 'task_complete' }
    })
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [baseline, started, reasoning, complete].join('\n'))
    context.triggerRolloutChange(FIXED_THREAD_IDS[3])
    await vi.waitFor(async () => expect((await context.bridge.readActivitySnapshot()).value.entries
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'notLoaded',
        lastTurnStatus: 'completed'
      }))

    const restarted = JSON.stringify({
      timestamp: '2030-03-17T17:48:23.000Z',
      type: 'event_msg',
      payload: { type: 'task_started' }
    })
    const aborted = JSON.stringify({
      timestamp: '2030-03-17T17:48:24.000Z',
      type: 'event_msg',
      payload: { type: 'turn_aborted' }
    })
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [baseline, started, reasoning, complete, restarted, reasoning].join('\n'))
    context.triggerRolloutChange(FIXED_THREAD_IDS[3])
    await vi.waitFor(async () => expect((await context.bridge.readActivitySnapshot()).value.entries
      .find((entry: Record<string, any>) => entry.key === task.key)?.status).toBe('active'))
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [baseline, started, reasoning, complete, restarted, reasoning, aborted].join('\n'))
    context.triggerRolloutChange(FIXED_THREAD_IDS[3])
    await vi.waitFor(async () => expect((await context.bridge.readActivitySnapshot()).value.entries
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'notLoaded',
        lastTurnStatus: 'interrupted'
      }))
    context.bridge.close()
  })

  it('does not let an inventory refresh consume a live rollout append before runtime reduction', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const baseline = JSON.stringify({
      timestamp: '2030-03-17T17:48:19.000Z',
      type: 'event_msg',
      payload: { type: 'turn_aborted' }
    })
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], baseline)
    const { bridge } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')

    const activeRollout = [
      baseline,
      JSON.stringify({
        timestamp: '2030-03-17T17:48:20.000Z',
        type: 'event_msg',
        payload: { type: 'task_started' }
      }),
      JSON.stringify({
        timestamp: '2030-03-17T17:48:21.000Z',
        type: 'response_item',
        payload: { type: 'reasoning' }
      })
    ]
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], activeRollout.join('\n'))

    await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })

    const recovered = (await bridge.readActivitySnapshot()).value.entries
      .find((entry: Record<string, any>) => entry.key === task.key)
    expect(recovered).toMatchObject({
      status: 'active',
      lastTurnStatus: 'inProgress',
      statusAuthority: 'app-server-live'
    })
    expect(recovered.idleConfirmed).not.toBe(true)

    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      ...activeRollout,
      JSON.stringify({
        timestamp: '2030-03-17T17:48:22.000Z',
        type: 'event_msg',
        payload: { type: 'task_complete' }
      })
    ].join('\n'))
    await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect((await bridge.readActivitySnapshot()).value.entries
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'notLoaded',
      lastTurnStatus: 'completed'
    })
    bridge.close()
  })

  it('does not emit semantic activity deltas for 1,000 unchanged rollout observations', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    child.externalOpenRolloutIds.add(FIXED_THREAD_IDS[3])
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ timestamp: '2030-03-17T17:48:20.000Z', type: 'event_msg', payload: { type: 'task_started' } }),
      JSON.stringify({ timestamp: '2030-03-17T17:48:21.000Z', type: 'response_item', payload: { type: 'reasoning' } })
    ].join('\n'))
    const { bridge } = loadCodexBridge(child)
    await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await vi.waitFor(async () => expect((await bridge.readActivitySnapshot()).value.entries
      .some((entry: Record<string, any>) => entry.status === 'active' && entry.statusAuthority === 'app-server-live')).toBe(true))
    const deltas: Record<string, any>[] = []
    const stop = bridge.onActivityChanged((delta: Record<string, any>) => deltas.push(delta))

    await Promise.all(Array.from({ length: 1_000 }, () => bridge.readActivitySnapshot({ phaseOnly: true })))
    expect(deltas).toEqual([])
    stop()
    bridge.close()
  })

  it('retains a completed Plan across supplementary/default and interrupted Turns', () => {
    const { bridge, native } = loadCodexBridge(new FakeCodexProcess())
    const started = (mode: string, timestamp = '') => JSON.stringify({
      ...(timestamp ? { timestamp } : {}),
      type: 'event_msg',
      payload: { type: 'task_started', collaboration_mode_kind: mode }
    })
    const item = (type: string, timestamp = '') => JSON.stringify({
      ...(timestamp ? { timestamp } : {}),
      type: 'event_msg',
      payload: { type: 'item_completed', item: { type, text: 'private body' } }
    })

    expect(native.codexRolloutPendingPlanStateText([started('plan'), item('Plan')].join('\n'))).toMatchObject({
      known: true,
      pending: false,
      planReady: true
    })
    expect(native.codexRolloutPendingPlanStateText([started('plan'), item('Plan'), started('default'), item('AgentMessage')].join('\n'))).toMatchObject({
      known: true,
      pending: false,
      planReady: true,
      planLifecycleState: 'ready',
      turnMode: 'default'
    })
    expect(native.codexRolloutPendingPlanStateText([started('plan'), item('Plan'), started('default'), item('CommandExecution')].join('\n'))).toMatchObject({
      known: true,
      planReady: true,
      planLifecycleState: 'ready'
    })
    expect(native.codexRolloutPendingPlanStateText([
      started('plan'),
      item('Plan'),
      JSON.stringify({ type: 'event_msg', payload: { type: 'turn_aborted' } })
    ].join('\n'))).toMatchObject({
      known: true,
      pending: false,
      planReady: true,
      planLifecycleState: 'ready'
    })
    expect(native.codexRolloutPendingPlanStateText(started('default'))).toMatchObject({
      known: false,
      pending: false,
      planLifecycleState: 'unknown'
    })
    expect(native.codexRolloutPendingPlanStateText(item('AgentMessage'))).toMatchObject({
      known: false,
      pending: false
    })
    expect(native.codexRolloutPendingPlanStateText([
      started('plan', '2030-03-17T17:48:20.000Z'),
      item('Plan', '2030-03-17T17:48:21.000Z'),
      started('default', '2030-03-17T17:49:20.000Z'),
      item('FileChange', '2030-03-17T17:49:21.000Z')
    ].join('\n'))).toMatchObject({
      known: true,
      pending: false,
      planReady: false,
      planLifecycleState: 'cleared',
      planClearReason: 'execution-start',
      planLifecycleRevision: Date.parse('2030-03-17T17:49:21.000Z'),
      turnMode: 'default'
    })
    expect(native.codexRolloutPendingPlanStateText([
      started('plan', '2030-03-17T17:48:20.000Z'),
      item('Plan', '2030-03-17T17:48:21.000Z'),
      started('default', '2030-03-17T17:49:20.000Z'),
      JSON.stringify({ timestamp: '2030-03-17T17:49:20.500Z', type: 'event_msg', payload: { type: 'patch_apply_begin' } })
    ].join('\n'))).toMatchObject({
      planReady: false,
      planLifecycleState: 'cleared',
      planClearReason: 'execution-start',
      planLifecycleRevision: Date.parse('2030-03-17T17:49:20.500Z')
    })
    bridge.close()
  })

  it('projects a completed default Turn with structural file work as consumed instead of reviving its older Plan', async () => {
    const child = new FakeCodexProcess()
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ timestamp: '2030-03-17T17:48:20.000Z', type: 'event_msg', payload: { type: 'task_started', collaboration_mode_kind: 'plan' } }),
      JSON.stringify({ timestamp: '2030-03-17T17:48:21.000Z', type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Plan', text: 'private plan body' } } }),
      JSON.stringify({ timestamp: '2030-03-17T17:49:20.000Z', type: 'event_msg', payload: { type: 'task_started', collaboration_mode_kind: 'default' } }),
      JSON.stringify({ timestamp: '2030-03-17T17:49:21.000Z', type: 'event_msg', payload: { type: 'item_completed', item: { type: 'FileChange', changes: [{ path: '/private/changed' }] } } })
    ].join('\n'))
    const context = loadCodexBridge(child)
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads.find((entry: Record<string, any>) => entry.name === '跨端未知')

    expect(task).toMatchObject({
      planReady: false,
      planLifecycleState: 'cleared',
      planClearReason: 'execution-start',
      turnMode: 'default',
      lastTurnStatus: 'completed'
    })
    expect(JSON.stringify(task)).not.toContain('/private/changed')

    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false, cursor: false } })
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((entry: Record<string, any>) => entry.key === task.key))
      .toMatchObject({ phase: 'completed', planReady: false, planLifecycleState: 'cleared' }))
    context.bridge.close()
  })

  it('closes the matching Plan interaction atomically while retaining its artifact across request removal', async () => {
    const child = new FakeCodexProcess()
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', collaboration_mode_kind: 'plan' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Plan', text: 'private plan body' } } })
    ].join('\n'))
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.waitingInputSnapshotThreadIds.clear()
    desktopSocket.unreadSnapshotThreadIds.delete(FIXED_THREAD_IDS[3])
    const context = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const taskKey = baseline.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知').key
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false, cursor: false } })
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((task: Record<string, any>) => task.key === taskKey))
      .toMatchObject({ phase: 'stopped', planReady: true, planLifecycleState: 'ready' }))

    const planRequest = {
      type: 'plan',
      method: 'item/plan/requestImplementation',
      requestId: 'plan-card-instance'
    }
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[3],
        change: {
          type: 'snapshot',
          revision: 2,
          conversationState: {
            threadRuntimeStatus: { type: 'idle', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: false,
            requests: [planRequest]
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((task: Record<string, any>) => task.key === taskKey))
      .toMatchObject({ phase: 'waiting-input', planReady: true, planImplementation: true }))

    child.stdout.emit('data', `${JSON.stringify({
      method: 'serverRequest/resolved',
      params: { threadId: FIXED_THREAD_IDS[3], requestId: 'plan-card-instance' }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await context.bridge.readActivitySnapshot()).value.entries
      .find((entry: Record<string, any>) => entry.key === taskKey)).toMatchObject({
      planReady: true,
      planLifecycleState: 'ready'
    })
    expect(kernel.getLatest().tasks.find((task: Record<string, any>) => task.key === taskKey))
      .toMatchObject({ phase: 'stopped', planReady: true, planLifecycleState: 'ready', planImplementation: false })

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[3],
        change: {
          type: 'patches',
          baseRevision: 2,
          revision: 3,
          patches: [{ op: 'replace', path: ['requests'], value: [] }]
        }
      }
    })
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((task: Record<string, any>) => task.key === taskKey))
      .toMatchObject({ phase: 'stopped', planReady: true, planLifecycleState: 'ready', planImplementation: false }))

    // A later full Desktop snapshot may replay the already-resolved native
    // request. The stable anonymous instance and persisted Kernel tombstone must
    // keep it closed; only a genuinely new request identity may reopen waiting.
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[3],
        change: {
          type: 'snapshot',
          revision: 4,
          conversationState: {
            threadRuntimeStatus: { type: 'idle', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: false,
            requests: [planRequest]
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(kernel.getLatest().tasks.find((task: Record<string, any>) => task.key === taskKey))
      .toMatchObject({ phase: 'stopped', planReady: true, planImplementation: false })

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[3],
        change: {
          type: 'snapshot',
          revision: 5,
          conversationState: {
            threadRuntimeStatus: { type: 'idle', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: false,
            requests: [{ ...planRequest, requestId: 'plan-card-instance-next' }]
          }
        }
      }
    })
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((task: Record<string, any>) => task.key === taskKey))
      .toMatchObject({ phase: 'waiting-input', planReady: true, planImplementation: true }))
    expect(JSON.stringify(kernel.getLatest())).not.toContain('plan-card-instance')
    context.triggerPluginOut(true)
  })

  it('keeps an exact completed-Plan request open across a bare request-array disappearance', async () => {
    const child = new FakeCodexProcess()
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', collaboration_mode_kind: 'plan' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Plan', text: 'private plan body' } } })
    ].join('\n'))
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.waitingInputSnapshotThreadIds.clear()
    desktopSocket.unreadSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
    const context = loadCodexBridge(child, () => nativeRegistryTextWithUnread([FIXED_THREAD_IDS[3]]), desktopSocket)
    const baseline = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const taskKey = baseline.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知').key
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false, cursor: false } })
    const planRequest = {
      type: 'plan',
      method: 'item/plan/requestImplementation',
      requestId: 'still-visible-plan-card'
    }

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[3],
        change: {
          type: 'snapshot',
          revision: 2,
          conversationState: {
            threadRuntimeStatus: { type: 'idle', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: true,
            requests: [planRequest]
          }
        }
      }
    })
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((task: Record<string, any>) => task.key === taskKey))
      .toMatchObject({ phase: 'waiting-input', unread: true, planImplementation: true, dynamicGroup: 'input' }))

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[3],
        change: {
          type: 'patches',
          baseRevision: 2,
          revision: 3,
          patches: [{ op: 'replace', path: ['requests'], value: [] }]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(kernel.getLatest().tasks.find((task: Record<string, any>) => task.key === taskKey))
      .toMatchObject({ phase: 'waiting-input', unread: true, planImplementation: true, dynamicGroup: 'input' })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'serverRequest/resolved',
      params: { threadId: FIXED_THREAD_IDS[3], requestId: 'still-visible-plan-card' }
    })}\n`)
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((task: Record<string, any>) => task.key === taskKey))
      .toMatchObject({ phase: 'completed', unread: true, planImplementation: false, dynamicGroup: 'unread' }))
    expect(JSON.stringify(kernel.getLatest())).not.toContain('still-visible-plan-card')
    context.triggerPluginOut(true)
  })

  it('keeps a completed unread Plan terminal before any current interaction is observed', async () => {
    const child = new FakeCodexProcess()
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', collaboration_mode_kind: 'plan' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Plan', text: 'private plan body' } } })
    ].join('\n'))
    const { bridge } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([FIXED_THREAD_IDS[3]])
    )

    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(snapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')).toMatchObject({
      status: 'notLoaded',
      activeFlags: [],
      planImplementationOnly: false,
      planReady: true,
      statusAuthority: 'connector',
      hasUnreadTurn: true,
      lastTurnStatus: 'completed'
    })
    expect(JSON.stringify(snapshot)).not.toContain('private plan body')
    bridge.close()
  })

  it('executes a completed Plan only after the second confirmation and preserves model settings', async () => {
    const child = new FakeCodexProcess()
    child.supportsDefaultCollaborationMode = true
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', collaboration_mode_kind: 'plan' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Plan', text: 'private plan body' } } })
    ].join('\n'))
    const context = loadCodexBridge(child)
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    await vi.waitFor(() => {
      const task = kernel.getLatest().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')
      expect(task).toMatchObject({ phase: 'stopped', planReady: true, dynamicGroup: 'stopped', cycleTier: 'plan' })
      expect(task.capabilities.executePlan).toBe(true)
    })
    const task = kernel.getLatest().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')
    const intent = {
      action: 'execute-plan',
      key: task.key,
      planLifecycleRevision: task.planLifecycleRevision,
      source: 'execute-plan-button'
    }

    await expect(kernel.dispatch(intent)).resolves.toMatchObject({ outcome: 'confirmation-required' })
    expect(child.writes.filter((frame) => frame.method === 'thread/resume')).toHaveLength(0)
    expect(child.writes.filter((frame) => frame.method === 'turn/start' && frame.params?.collaborationMode)).toHaveLength(0)

    await expect(kernel.dispatch(intent)).resolves.toMatchObject({ outcome: 'executed' })
    expect(context.openExternal).toHaveBeenCalledWith(`codex://threads/${FIXED_THREAD_IDS[3]}`)
    const resume = child.writes.find((frame) => frame.method === 'thread/resume')
    expect(resume?.params).toEqual({ threadId: FIXED_THREAD_IDS[3], excludeTurns: true })
    const start = child.writes.find((frame) => frame.method === 'turn/start' && frame.params?.collaborationMode)
    expect(start?.params).toEqual({
      threadId: FIXED_THREAD_IDS[3],
      input: [{ type: 'text', text: '请按已完成的 Plan 开始执行。' }],
      collaborationMode: {
        mode: 'default',
        settings: {
          model: 'gpt-5.6-sol',
          reasoning_effort: 'high',
          developer_instructions: null
        }
      }
    })
    expect(child.writes.findIndex((frame) => frame.method === 'thread/resume'))
      .toBeLessThan(child.writes.findIndex((frame) => frame.method === 'turn/start' && frame.params?.collaborationMode))
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((value: Record<string, any>) => value.key === task.key))
      .toMatchObject({ phase: 'running', planReady: false, paused: false }))
    expect(JSON.stringify(kernel.getLatest())).not.toContain('请按已完成的 Plan 开始执行。')
    expect(JSON.stringify(context.diagnosticEvents)).not.toContain('请按已完成的 Plan 开始执行。')
    context.triggerPluginOut(true)
  })

  it('keeps Plan execution available and uses the same-task fixed prompt when native default mode is unavailable', async () => {
    const child = new FakeCodexProcess()
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', collaboration_mode_kind: 'plan' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Plan', text: 'private plan body' } } })
    ].join('\n'))
    const context = loadCodexBridge(child)
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    await vi.waitFor(() => expect(kernel.getLatest().complete).toBe(true))
    const task = kernel.getLatest().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')
    expect(task).toMatchObject({ planReady: true })
    expect(task.capabilities.executePlan).toBe(true)
    const intent = { action: 'execute-plan', key: task.key, planLifecycleRevision: task.planLifecycleRevision }
    await expect(kernel.dispatch(intent)).resolves.toMatchObject({ outcome: 'confirmation-required' })
    await expect(kernel.dispatch(intent)).resolves.toMatchObject({ outcome: 'executed' })
    expect(child.writes.filter((frame) => frame.method === 'thread/resume')).toHaveLength(1)
    expect(child.writes.filter((frame) => frame.method === 'collaborationMode/list')).toHaveLength(1)
    const starts = child.writes.filter((frame) => frame.method === 'turn/start')
    expect(starts).toHaveLength(1)
    expect(starts[0].params).toEqual({
      threadId: FIXED_THREAD_IDS[3],
      input: [{ type: 'text', text: '请按已完成的 Plan 开始执行。' }]
    })
    expect(JSON.stringify(kernel.getLatest())).not.toContain('请按已完成的 Plan 开始执行。')
    expect(JSON.stringify(context.diagnosticEvents)).not.toContain('请按已完成的 Plan 开始执行。')
    context.triggerPluginOut(true)
  })

  it('uses the same-task fixed prompt when default mode exists but the model cannot be confirmed', async () => {
    const child = new FakeCodexProcess()
    child.supportsDefaultCollaborationMode = true
    child.omitPlanExecutionModel = true
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', collaboration_mode_kind: 'plan' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Plan', text: 'private plan body' } } })
    ].join('\n'))
    const context = loadCodexBridge(child)
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')?.capabilities.executePlan).toBe(true))
    const task = kernel.getLatest().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')
    const intent = { action: 'execute-plan', key: task.key, planLifecycleRevision: task.planLifecycleRevision }
    await kernel.dispatch(intent)
    await expect(kernel.dispatch(intent)).resolves.toMatchObject({ outcome: 'executed' })
    expect(child.writes.filter((frame) => frame.method === 'turn/start')).toHaveLength(1)
    expect(child.writes.find((frame) => frame.method === 'turn/start')?.params).toEqual({
      threadId: FIXED_THREAD_IDS[3],
      input: [{ type: 'text', text: '请按已完成的 Plan 开始执行。' }]
    })
    context.triggerPluginOut(true)
  })

  it('renews an expired Plan alias for the exact task key before executing', async () => {
    const child = new FakeCodexProcess()
    child.supportsDefaultCollaborationMode = true
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', collaboration_mode_kind: 'plan' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Plan', text: 'private plan body' } } })
    ].join('\n'))
    const context = loadCodexBridge(child)
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')?.capabilities.executePlan).toBe(true))
    const task = kernel.getLatest().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')
    const intent = { action: 'execute-plan', key: task.key, planLifecycleRevision: task.planLifecycleRevision }
    await expect(kernel.dispatch(intent)).resolves.toMatchObject({ outcome: 'confirmation-required' })
    context.native.expireCompanionCodexAlias(task.key)
    await expect(kernel.dispatch(intent)).resolves.toMatchObject({ outcome: 'executed', key: task.key })
    expect(context.openExternal).toHaveBeenCalledWith(`codex://threads/${FIXED_THREAD_IDS[3]}`)
    expect(child.writes.filter((frame) => frame.method === 'turn/start')).toHaveLength(1)
    context.triggerPluginOut(true)
  })

  it.each([
    ['open', (child: FakeCodexProcess, context: ReturnType<typeof loadCodexBridge>) => context.openExternal.mockRejectedValueOnce(new Error('open failed')), 'open'],
    ['resume', (child: FakeCodexProcess) => { child.failThreadResume = true }, 'resume']
  ])('keeps the Plan ready when the %s execution stage fails', async (_stage, arrange, blockedMethod) => {
    const child = new FakeCodexProcess()
    child.supportsDefaultCollaborationMode = true
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', collaboration_mode_kind: 'plan' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Plan', text: 'private plan body' } } })
    ].join('\n'))
    const context = loadCodexBridge(child)
    arrange(child, context)
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')?.capabilities.executePlan).toBe(true))
    const task = kernel.getLatest().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')
    const intent = { action: 'execute-plan', key: task.key, planLifecycleRevision: task.planLifecycleRevision }
    await kernel.dispatch(intent)
    await expect(kernel.dispatch(intent)).resolves.toMatchObject({ outcome: 'failed' })
    expect(kernel.getLatest().tasks.find((value: Record<string, any>) => value.key === task.key)).toMatchObject({ planReady: true })
    if (blockedMethod === 'open') expect(child.writes.filter((frame) => frame.method === 'thread/resume')).toHaveLength(0)
    if (blockedMethod === 'resume') expect(child.writes.filter((frame) => frame.method === 'turn/start' && frame.params?.collaborationMode)).toHaveLength(0)
    context.triggerPluginOut(true)
  })

  it('returns indeterminate and never resends when turn/start has no confirmable result', async () => {
    const child = new FakeCodexProcess()
    child.supportsDefaultCollaborationMode = true
    child.invalidExecuteTurnStart = true
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], [
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', collaboration_mode_kind: 'plan' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Plan', text: 'private plan body' } } })
    ].join('\n'))
    const context = loadCodexBridge(child)
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    await vi.waitFor(() => expect(kernel.getLatest().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')?.capabilities.executePlan).toBe(true))
    const task = kernel.getLatest().tasks.find((value: Record<string, any>) => value.displayName === '跨端未知')
    const intent = { action: 'execute-plan', key: task.key, planLifecycleRevision: task.planLifecycleRevision }
    await kernel.dispatch(intent)
    await expect(kernel.dispatch(intent)).resolves.toMatchObject({ outcome: 'indeterminate' })
    expect(child.writes.filter((frame) => frame.method === 'turn/start' && frame.params?.collaborationMode)).toHaveLength(1)
    expect(kernel.getLatest().tasks.find((value: Record<string, any>) => value.key === task.key)).toMatchObject({ planReady: true })
    context.triggerPluginOut(true)
  })

  it('publishes an exact completed Plan item as an artifact without fabricating a waiting interaction', async () => {
    const child = new FakeCodexProcess()
    child.inProgressTurnIds.add(FIXED_THREAD_IDS[1])
    const { bridge } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([FIXED_THREAD_IDS[1]])
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = baseline.value.threads.find((thread: Record<string, any>) => thread.name === '运行中')
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))

    child.stdout.emit('data', JSON.stringify({
      method: 'item/completed',
      params: {
        threadId: FIXED_THREAD_IDS[1],
        item: { type: 'Plan', text: 'private plan body' }
      }
    }) + '\n' + JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId: FIXED_THREAD_IDS[1],
        turn: { status: 'completed', startedAt: 1_900_000_000, completedAt: 2_000_000_071 }
      }
    }) + '\n')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(deltas.at(-1)).toMatchObject({
      entries: [{
        key: task.key,
        status: 'notLoaded',
        activeFlags: [],
        planImplementationOnly: false,
        planReady: true,
        lastTurnStatus: 'completed'
      }]
    })
    expect(JSON.stringify(deltas)).not.toContain('private plan body')
    stop()
    bridge.close()
  })

  it('projects an interrupted App Server row as waiting-input when its safe rollout has an unresolved request', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], JSON.stringify({
      type: 'response_item',
      payload: { type: 'function_call', name: 'request_user_input', call_id: 'pending' }
    }))
    const { bridge } = loadCodexBridge(child)

    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })

    expect(snapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      statusAuthority: 'persisted-decision',
      lastTurnStatus: 'interrupted'
    })
    expect(JSON.stringify(snapshot)).not.toContain('pending')
    bridge.close()
  })

  it('keeps an unresolved request above an exact interrupted terminal, then lets a newer Turn resume', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], JSON.stringify({
      type: 'response_item',
      payload: { type: 'function_call', name: 'request_user_input', call_id: 'pending' }
    }))
    const { bridge } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId: FIXED_THREAD_IDS[3],
        turn: { status: 'interrupted', startedAt: 1_900_000_000 }
      }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      lastTurnStatus: 'interrupted',
      lastTurnEvidence: 'turn-completed'
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: FIXED_THREAD_IDS[3],
        turn: { status: 'inProgress', startedAt: 1_900_000_100 }
      }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started'
    })
    bridge.close()
  })

  it('clears persisted input-decision authority on an exact newer Turn lifecycle', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], JSON.stringify({
      type: 'response_item',
      payload: { type: 'function_call', name: 'request_user_input', call_id: 'pending' }
    }))
    const { bridge } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: FIXED_THREAD_IDS[3],
        turn: { status: 'inProgress', startedAt: 1_900_000_100 }
      }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: 1_900_000_100_000
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId: FIXED_THREAD_IDS[3],
        turn: { status: 'completed', startedAt: 1_900_000_100, completedAt: 1_900_000_120 }
      }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'notLoaded',
      activeFlags: [],
      planImplementationOnly: false,
      statusAuthority: 'connector',
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 1_900_000_100_000
    })
    bridge.close()
  })

  it('recovers both rollout waiting edges through the Host stat watcher when the file callback is dropped', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], JSON.stringify({
      type: 'response_item',
      payload: { type: 'function_call', name: 'exec', call_id: 'baseline' }
    }))
    const { bridge, registryReads, triggerRolloutRecoveryCheck } = loadCodexBridge(child)
    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')
    const inventoryReads = child.writes.filter((frame) => frame.method === 'thread/list').length
    const latestTurnReads = child.writes.filter((frame) => frame.method === 'thread/turns/list').length
    const unreadReads = registryReads.length
    const request = JSON.stringify({
      type: 'response_item',
      payload: { type: 'function_call', name: 'request_user_input', call_id: 'pending-edge' }
    })
    const output = JSON.stringify({
      type: 'response_item',
      payload: { type: 'function_call_output', call_id: 'pending-edge', output: 'private answer' }
    })

    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta: Record<string, any>) => deltas.push(delta))

    // Deliberately do not invoke the directory callback. The process-owned
    // StatWatcher is the bounded 1s recovery path and runs without Renderer.
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], request)
    triggerRolloutRecoveryCheck(FIXED_THREAD_IDS[3])
    expect(deltas.at(-1)?.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      statusAuthority: 'persisted-decision'
    })

    child.rolloutTexts.set(FIXED_THREAD_IDS[3], `${request}\n${output}`)
    triggerRolloutRecoveryCheck(FIXED_THREAD_IDS[3])
    expect(deltas.at(-1)?.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      statusAuthority: 'app-server-live'
    })
    expect(child.writes.filter((frame) => frame.method === 'thread/list')).toHaveLength(inventoryReads)
    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list')).toHaveLength(latestTurnReads)
    expect(registryReads).toHaveLength(unreadReads)
    expect(JSON.stringify(deltas)).not.toContain('private answer')
    stop()
    bridge.close()
  })

  it('applies rollout resume before refollow verification even while the current Desktop owner replays its old waiting shadow', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const request = JSON.stringify({
      type: 'response_item',
      payload: { type: 'function_call', name: 'request_user_input', call_id: 'current-owner-pending' }
    })
    const output = JSON.stringify({
      type: 'response_item',
      payload: { type: 'function_call_output', call_id: 'current-owner-pending', output: 'private answer' }
    })
    child.rolloutTexts.set(FIXED_THREAD_IDS[3], request)
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.waitingInputSnapshotThreadIds.clear()
    desktopSocket.waitingInputSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const snapshot = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = snapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      statusAuthority: 'desktop-live'
    })

    child.rolloutTexts.set(FIXED_THREAD_IDS[3], `${request}\n${output}`)
    const resumed = await bridge.readActivitySnapshot({ phaseOnly: true })
    expect(resumed.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: []
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const replayed = await bridge.readActivitySnapshot({ phaseOnly: true })
    expect(replayed.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: []
    })
    expect(JSON.stringify(replayed)).not.toContain('private answer')
    bridge.close()
  })

  it('resolves the complete parent activity priority table through one pure reducer', () => {
    const { bridge, native } = loadCodexBridge(new FakeCodexProcess())
    const cases = [
      {
        name: 'own status fallback',
        own: { status: 'notLoaded', activeFlags: [] },
        children: [],
        options: {},
        expected: { status: 'notLoaded', activeFlags: [], hasActive: false, hasSystemError: false, appServerActive: false, desktopActiveSince: 0 }
      },
      {
        name: 'main active',
        own: { status: 'active', activeFlags: [], desktopActiveSince: 1_900_000_008_000 },
        children: [],
        options: {},
        expected: { status: 'active', activeFlags: [], hasActive: true, appServerActive: false, desktopActiveSince: 1_900_000_008_000 }
      },
      {
        name: 'child input wins system error',
        own: { status: 'idle', activeFlags: [] },
        children: [
          { status: 'systemError', activeFlags: [] },
          { status: 'active', activeFlags: ['waitingOnUserInput'], desktopActiveSince: 1_900_000_010_000 }
        ],
        options: {},
        expected: { status: 'active', activeFlags: ['waitingOnUserInput'], hasInput: true, hasSystemError: true, appServerActive: false, desktopActiveSince: 1_900_000_010_000 }
      },
      {
        name: 'plan-only child keeps the privacy-safe subtype',
        own: { status: 'active', activeFlags: [] },
        children: [{ status: 'active', activeFlags: ['waitingOnUserInput'], planImplementationOnly: true }],
        options: {},
        expected: { status: 'active', activeFlags: ['waitingOnUserInput'], planImplementationOnly: true, hasInput: true, appServerActive: false }
      },
      {
        name: 'ordinary waiting child outranks a simultaneous plan subtype',
        own: { status: 'active', activeFlags: ['waitingOnUserInput'], planImplementationOnly: true },
        children: [{ status: 'active', activeFlags: ['waitingOnApproval'] }],
        options: {},
        expected: { status: 'active', planImplementationOnly: false, hasInput: true, hasApproval: true, appServerActive: false }
      },
      {
        name: 'causally newer App Server running ignores a refollowed child waiting epoch',
        own: { status: 'active', activeFlags: [], desktopActiveSince: 1_900_000_012_000 },
        children: [{ status: 'active', activeFlags: ['waitingOnApproval'], desktopActiveSince: 1_900_000_020_000 }],
        options: { appServerActive: true },
        expected: { status: 'active', activeFlags: [], hasApproval: false, appServerActive: true, desktopActiveSince: 0 }
      },
      {
        name: 'child system error',
        own: { status: 'idle', activeFlags: [] },
        children: [{ status: 'systemError', activeFlags: [] }],
        options: {},
        expected: { status: 'systemError', activeFlags: [], hasSystemError: true, appServerActive: false, desktopActiveSince: 0 }
      },
      {
        name: 'app server fallback wins system error',
        own: { status: 'idle', activeFlags: [] },
        children: [{ status: 'systemError', activeFlags: [] }],
        options: { appServerActive: true, connectorActiveFlags: ['waitingOnApproval'] },
        expected: { status: 'active', activeFlags: ['waitingOnApproval'], hasSystemError: true, appServerActive: true, desktopActiveSince: 0 }
      },
      {
        name: 'App Server winner keeps only its authoritative Plan waiting subtype',
        own: { status: 'active', activeFlags: [] },
        children: [{ status: 'active', activeFlags: ['waitingOnApproval'] }],
        options: {
          appServerActive: true,
          connectorActiveFlags: ['waitingOnUserInput'],
          connectorPlanImplementationOnly: true
        },
        expected: {
          status: 'active',
          activeFlags: ['waitingOnUserInput'],
          planImplementationOnly: true,
          hasInput: true,
          hasApproval: false,
          appServerActive: true
        }
      }
    ]

    for (const testCase of cases) {
      const result = JSON.parse(JSON.stringify(native.codexResolveParentActivity(testCase.own, testCase.children, testCase.options)))
      expect(result, testCase.name).toMatchObject(testCase.expected)
    }
    bridge.close()
  })

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

    expect(result).toMatchObject({
      outcome: 'created',
      modelId: 'gpt-5.6-sol',
      retryAllowed: false,
      handoff: { stage: 'dispatched', nativeVisible: false, confirmsRead: false }
    })
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

  it('uses the desktop bridge watchdog and confirms a payload-less completion with one targeted Turn read', async () => {
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

    const statusReadsBeforeCompletion = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length
    child.stdout.emit('data', `${JSON.stringify({ method: 'turn/completed', params: { threadId: FIXED_THREAD_IDS[0] } })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(deltas.at(-1)).toMatchObject({
      inventoryChanged: false,
      entries: [{
        key: baseline.value.threads[0].key,
        lastTurnStatus: 'completed',
        lastTurnEvidence: 'turn-completed'
      }]
    })
    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1)).toHaveLength(statusReadsBeforeCompletion + 1)
    stop()
    bridge.close()
  })

  it('retries a payload-less exact completion after 25ms instead of waiting for full inventory', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000_100_000)
    try {
      const child = new FakeCodexProcess()
      child.inProgressTurnIds.add(FIXED_THREAD_IDS[1])
      const { bridge } = loadCodexBridge(child)
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      const task = baseline.value.threads[1]
      const deltas: Array<Record<string, any>> = []
      const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
      const targetedReads = () => child.writes.filter((frame) => frame.method === 'thread/turns/list'
        && frame.params?.limit === 1
        && frame.params?.threadId === FIXED_THREAD_IDS[1]).length
      const fullReadsBefore = child.writes.filter((frame) => frame.method === 'thread/list').length
      const readsBefore = targetedReads()

      child.stdout.emit('data', `${JSON.stringify({ method: 'turn/completed', params: { threadId: FIXED_THREAD_IDS[1] } })}\n`)
      await vi.advanceTimersByTimeAsync(0)
      expect(targetedReads()).toBe(readsBefore + 1)
      expect(deltas.flatMap((delta) => delta.entries || []).some((entry: Record<string, any>) => entry.lastTurnStatus === 'completed')).toBe(false)
      child.inProgressTurnIds.delete(FIXED_THREAD_IDS[1])

      await vi.advanceTimersByTimeAsync(24)
      expect(targetedReads()).toBe(readsBefore + 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(targetedReads()).toBe(readsBefore + 2)
      expect(deltas.at(-1)).toMatchObject({
        inventoryChanged: false,
        entries: [{
          key: task.key,
          lastTurnStatus: 'completed',
          lastTurnEvidence: 'turn-completed'
        }]
      })
      expect(child.writes.filter((frame) => frame.method === 'thread/list')).toHaveLength(fullReadsBefore)
      stop()
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
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

  it('accepts a same-revision exact completion without completedAt over an unresolved active snapshot', async () => {
    const child = new FakeCodexProcess()
    child.missingTurnCompletedAtIds.add(FIXED_THREAD_IDS[3])
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
    desktopSocket.unreadSnapshotThreadIds.delete(FIXED_THREAD_IDS[3])
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await Promise.resolve()
    await Promise.resolve()
    const task = baseline.value.threads[3]

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 1_900_000_000_000,
      lastTurnEvidence: 'inventory'
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId: FIXED_THREAD_IDS[3],
        turn: { status: 'completed', startedAt: 1_900_000_000 }
      }
    })}\n`)
    await Promise.resolve()

    const completed = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)
    expect(completed).toMatchObject({
      status: 'active',
      lastTurnStatus: 'completed',
      lastTurnStartedAt: 1_900_000_000_000,
      lastTurnEvidence: 'turn-completed'
    })
    expect(completed).not.toHaveProperty('lastTurnCompletedAt')
    bridge.close()
  })

  it('keeps exact completion provenance and the activity sequence across a full inventory rebuild', async () => {
    const child = new FakeCodexProcess()
    child.inProgressTurnIds.add(FIXED_THREAD_IDS[1])
    const { bridge } = loadCodexBridge(child)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = baseline.value.threads[1]
    const baselineActivity = await bridge.readActivitySnapshot()
    expect(baseline.value.activityGeneration).toBe(baselineActivity.value.generation)

    child.inProgressTurnIds.delete(FIXED_THREAD_IDS[1])
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId: FIXED_THREAD_IDS[1],
        turn: { status: 'completed', startedAt: 1_900_000_000, completedAt: 2_000_000_071 }
      }
    })}\n`)
    await Promise.resolve()

    const exact = (await bridge.readActivitySnapshot()).value
    expect(exact.generation).toBeGreaterThan(baselineActivity.value.generation)
    expect(exact.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed'
    })

    const rebuilt = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const rebuiltActivity = (await bridge.readActivitySnapshot()).value
    expect(rebuilt.value.activityGeneration).toBe(rebuiltActivity.generation)
    expect(rebuiltActivity.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed'
    })
    bridge.close()
  })

  it('does not let a full inventory rebuild overwrite exact live inProgress evidence', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[1])
    const context = loadCodexBridge(child)
    const { bridge } = context
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = baseline.value.threads[1]
    const kernel = seedSingleCodexKernelTask(context, baseline, task)

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: FIXED_THREAD_IDS[1],
        turn: { status: 'inProgress', startedAt: 1_900_000_000 }
      }
    })}\n`)
    await Promise.resolve()
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started'
    })
    expect(kernel.getLatest().tasks.find((candidate: Record<string, any>) => candidate.key === task.key)).toMatchObject({
      phase: 'running'
    })

    const liveGeneration = Number((await bridge.readActivitySnapshot()).value.generation) || 1
    const packageRevisionBeforeStaleReplay = kernel.getLatest().packageRevision
    expect(context.native.applyCodexActivityToCompanionKernel({
      generation: liveGeneration + 1,
      receivedAt: 2_000_000_000_000,
      inventoryChanged: false,
      entries: [{
        key: task.key,
        status: 'idle',
        statusAuthority: 'connector',
        lastTurnStatus: 'interrupted',
        lastTurnEvidence: 'targeted-after-exit',
        lastTurnStartedAt: 1_800_000_000_000,
        idleConfirmed: true
      }]
    })).toBe(false)
    expect(kernel.getLatest().tasks.find((candidate: Record<string, any>) => candidate.key === task.key)).toMatchObject({
      phase: 'running'
    })
    expect(kernel.getLatest().packageRevision).toBe(packageRevisionBeforeStaleReplay)
    expect(context.diagnosticEvents.filter((event) => event.scope === 'task-push' && event.event === 'codex-evidence-v7').at(-1))
      .toMatchObject({ outcome: 'semantic-noop' })

    await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started'
    })
    expect(context.native.privateBranchEvidence(FIXED_THREAD_IDS[1])?.branches?.[0]).toMatchObject({
      status: 'active',
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started'
    })
    expect(kernel.getLatest().tasks.find((candidate: Record<string, any>) => candidate.key === task.key)).toMatchObject({
      phase: 'running'
    })
    bridge.close()
  })

  it('retains the anonymous activity mapping while one verified inventory row is quarantined', async () => {
    const child = new FakeCodexProcess()
    const { bridge } = loadCodexBridge(child)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = baseline.value.threads[3]

    child.omittedIds.add(FIXED_THREAD_IDS[3])
    const missing = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(missing.value.threads.some((thread: Record<string, any>) => thread.key === task.key)).toBe(false)

    child.stdout.emit('data', `${JSON.stringify({
      method: 'thread/status/changed',
      params: { threadId: FIXED_THREAD_IDS[3], status: { type: 'active', activeFlags: [] } }
    })}\n`)
    await Promise.resolve()

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress'
    })
    expect((await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).value.threads
      .some((thread: Record<string, any>) => thread.key === task.key)).toBe(false)
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'app-server-live'
    })
    bridge.close()
  })

  it('settles a same-revision completed active snapshot without requiring completedAt', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeCodexProcess()
      child.missingTurnCompletedAtIds.add(FIXED_THREAD_IDS[3])
      const desktopSocket = new FakeCodexDesktopSocket()
      desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
      desktopSocket.unreadSnapshotThreadIds.delete(FIXED_THREAD_IDS[3])
      const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket, true)
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await Promise.resolve()
      await Promise.resolve()
      const task = baseline.value.threads[3]

      await vi.advanceTimersByTimeAsync(1_400)

      const completed = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)
      expect(completed).toMatchObject({
        status: 'idle',
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 1_900_000_000_000,
        lastTurnEvidence: 'snapshot-corroborated'
      })
      expect(completed).not.toHaveProperty('lastTurnCompletedAt')
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reuses one bounded corroboration cycle across repeated identical active snapshots', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeCodexProcess()
      child.missingTurnCompletedAtIds.add(FIXED_THREAD_IDS[3])
      const desktopSocket = new FakeCodexDesktopSocket()
      desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
      desktopSocket.unreadSnapshotThreadIds.delete(FIXED_THREAD_IDS[3])
      const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket, true)
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await Promise.resolve()
      await Promise.resolve()
      const task = baseline.value.threads[3]
      const repeatActiveSnapshot = () => desktopSocket.push({
        type: 'broadcast',
        method: 'thread-stream-state-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 11,
        params: {
          hostId: 'local',
          conversationId: FIXED_THREAD_IDS[3],
          change: {
            type: 'snapshot',
            revision: 1,
            conversationState: {
              threadRuntimeStatus: { type: 'active', activeFlags: [] },
              resumeState: '',
              hasUnreadTurn: false,
              requests: []
            }
          }
        }
      })

      for (let elapsed = 200; elapsed <= 1_200; elapsed += 200) {
        await vi.advanceTimersByTimeAsync(200)
        repeatActiveSnapshot()
        await Promise.resolve()
        await Promise.resolve()
      }
      await vi.advanceTimersByTimeAsync(200)

      expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'idle',
        lastTurnStatus: 'completed',
        lastTurnStartedAt: 1_900_000_000_000,
        lastTurnEvidence: 'snapshot-corroborated'
      })
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not promote unchanged inventory completion when an active shadow exits', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeCodexProcess()
      const desktopSocket = new FakeCodexDesktopSocket()
      desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
      desktopSocket.unreadSnapshotThreadIds.delete(FIXED_THREAD_IDS[3])
      const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket, true)
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await Promise.resolve()
      await Promise.resolve()
      const task = baseline.value.threads[3]
      const deltas: Array<Record<string, any>> = []
      const stop = bridge.onActivityChanged((delta) => deltas.push(delta))

      desktopSocket.push({
        type: 'broadcast',
        method: 'thread-stream-state-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 11,
        params: {
          hostId: 'local',
          conversationId: FIXED_THREAD_IDS[3],
          change: {
            type: 'patches',
            baseRevision: 1,
            revision: 2,
            patches: [{ op: 'replace', path: ['threadRuntimeStatus', 'type'], value: 'idle' }]
          }
        }
      })
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1_400)

      expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'idle',
        lastTurnStatus: 'completed',
        lastTurnEvidence: 'inventory'
      })
      expect(deltas.flatMap((delta) => delta.entries || [])
        .filter((entry: Record<string, any>) => entry.key === task.key)
        .some((entry: Record<string, any>) => entry.lastTurnEvidence === 'targeted-after-exit')).toBe(false)
      stop()
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
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
      await vi.advanceTimersByTimeAsync(0)

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

  it('recovers missed and atomic native unread writes in Host, rebuilds fs.watch and suppresses 1,000 no-op pushes', async () => {
    let nativeUnread = false
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread(nativeUnread ? [FIXED_THREAD_IDS[2]] : [])
    )
    const baseline = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = baseline.value.threads[2]
    const deltas: Array<Record<string, any>> = []
    const stop = context.bridge.onActivityChanged((delta: Record<string, any>) => deltas.push(delta))

    expect(context.nativeStateRecoveryInterval()).toBe(1_000)
    expect(context.nativeStateWatcherCount()).toBe(1)
    context.triggerNativeStateWatchError()
    await Promise.resolve()
    expect(context.nativeStateWatcherCount()).toBe(1)
    expect(context.diagnosticEvents).toContainEqual(expect.objectContaining({
      scope: 'codex-unread-watcher',
      event: 'directory-watch',
      outcome: 'failed',
      code: 'watch-error'
    }))

    // The native directory event is deliberately dropped.
    nativeUnread = true
    context.triggerNativeStateRecoveryCheck()
    expect(deltas.at(-1)).toMatchObject({
      entries: [{ key: task.key, readStateOnly: true, hasUnreadTurn: true, unreadAuthority: 'desktop-persisted' }]
    })

    const stableDeltaCount = deltas.length
    for (let index = 0; index < 1_000; index += 1) context.triggerNativeStateRecoveryCheck()
    expect(deltas).toHaveLength(stableDeltaCount)

    // A rename models the atomic replace used by the native state writer.
    nativeUnread = false
    context.triggerNativeStateChange('rename')
    expect(deltas.at(-1)).toMatchObject({
      entries: [{ key: task.key, readStateOnly: true, hasUnreadTurn: false, unreadAuthority: 'desktop-persisted' }]
    })

    stop()
    context.bridge.close()
  })

  it('keeps Codex unread recovery and Float publication live while Main is background-hidden', async () => {
    let nativeUnread = false
    const context = loadCodexBridge(
      new FakeCodexProcess(),
      () => nativeRegistryTextWithUnread(nativeUnread ? [FIXED_THREAD_IDS[2]] : []),
      null,
      true,
      true,
      null,
      true
    )
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads[2]
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 36 })
    await vi.waitFor(() => expect(kernel.getPackage()).toMatchObject({ complete: true }))
    context.platform.float.sync({
      visible: true,
      snapshot: {
        version: 2,
        baseRevision: 1,
        style: 'water',
        expandedFields: ['tasks'],
        conversationInboxEnabled: true,
        quota: {},
        conversations: { ongoing: [], stopped: [], hidden: [], completedUnread: [], completed: [] }
      },
      position: { displayId: 'display-1', edge: 'right' }
    })
    await vi.waitFor(() => expect(context.floatAppliedAt()).toBeGreaterThan(0))
    const baselineRevision = kernel.getPackage().packageRevision
    context.triggerPluginOut(false)

    nativeUnread = true
    context.triggerNativeStateRecoveryCheck()

    await vi.waitFor(() => expect(kernel.getPackage().tasks.find((candidate: Record<string, any>) => candidate.key === task.key))
      .toMatchObject({ phase: 'completed', unread: true }))
    expect(kernel.getPackage().packageRevision).toBe(baselineRevision + 1)
    expect(context.floatSends.some((entry) => entry.channel === 'eypc-float:task-package'
      && Number(entry.payload?.sentRevision) === kernel.getPackage().packageRevision)).toBe(true)
    const stableRevision = kernel.getPackage().packageRevision
    const stableTaskSends = context.floatSends.filter((entry) => entry.channel === 'eypc-float:task-package').length
    for (let index = 0; index < 1_000; index += 1) context.triggerNativeStateRecoveryCheck()
    expect(kernel.getPackage().packageRevision).toBe(stableRevision)
    expect(context.floatSends.filter((entry) => entry.channel === 'eypc-float:task-package')).toHaveLength(stableTaskSends)
    context.triggerPluginOut(true)
  })

  it('forces a latest-Turn terminal reconciliation when persisted unread follows exact active evidence', async () => {
    let nativeUnread = false
    const child = new FakeCodexProcess()
    child.inProgressTurnIds.add(FIXED_THREAD_IDS[1])
    const context = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread(nativeUnread ? [FIXED_THREAD_IDS[1]] : []),
      null,
      true
    )
    const snapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = snapshot.value.threads[1]
    const kernel = context.platform.companionKernel
    kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 36 })
    await vi.waitFor(() => expect(kernel.getPackage()).toMatchObject({ complete: true }))

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: FIXED_THREAD_IDS[1],
        turn: { status: 'inProgress', startedAt: 1_900_000_000 }
      }
    })}\n`)
    await Promise.resolve()
    await vi.waitFor(() => expect(kernel.getPackage().tasks.find((candidate: Record<string, any>) => candidate.key === task.key))
      .toMatchObject({ phase: 'running' }))
    const targetedReadsBefore = child.writes.filter((frame) => frame.method === 'thread/turns/list'
      && frame.params?.limit === 1
      && frame.params?.threadId === FIXED_THREAD_IDS[1]).length

    // The completion event is intentionally missed; only persisted unread
    // changes. Exact active must no longer suppress the targeted Turn read.
    child.inProgressTurnIds.delete(FIXED_THREAD_IDS[1])
    nativeUnread = true
    context.triggerNativeStateRecoveryCheck()

    await vi.waitFor(() => expect(kernel.getPackage().tasks.find((candidate: Record<string, any>) => candidate.key === task.key))
      .toMatchObject({ phase: 'completed', unread: true }))
    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list'
      && frame.params?.limit === 1
      && frame.params?.threadId === FIXED_THREAD_IDS[1])).toHaveLength(targetedReadsBefore + 1)
    expect((await context.bridge.readActivitySnapshot()).value.entries
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'targeted-after-exit',
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-persisted'
    })
    context.triggerPluginOut(true)
  })

  it('uses a late native unread write to reconcile a stale interrupted Turn without a task switch', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000_350_000)
    try {
      let nativeUnread = false
      const child = new FakeCodexProcess()
      child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
      const desktopSocket = new FakeCodexDesktopSocket()
      desktopSocket.unreadSnapshotThreadIds.delete(FIXED_THREAD_IDS[3])
      const { bridge, triggerNativeStateChange } = loadCodexBridge(
        child,
        () => nativeRegistryTextWithUnread(nativeUnread ? [FIXED_THREAD_IDS[3]] : []),
        desktopSocket,
        true
      )
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await Promise.resolve()
      await Promise.resolve()
      const task = baseline.value.threads[3]
      expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'idle',
        lastTurnStatus: 'interrupted',
        hasUnreadTurn: false
      })

      const deltas: Array<Record<string, any>> = []
      const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
      const statusReadsBefore = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length
      child.interruptedTurnIds.delete(FIXED_THREAD_IDS[3])
      nativeUnread = true
      triggerNativeStateChange()
      await vi.advanceTimersByTimeAsync(0)
      await Promise.resolve()
      await Promise.resolve()

      expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length).toBe(statusReadsBefore + 1)
      expect(deltas).toContainEqual(expect.objectContaining({
        entries: [expect.objectContaining({
          key: task.key,
          hasUnreadTurn: true,
          unreadAuthority: 'desktop-persisted'
        })]
      }))
      const completedEntries = deltas.flatMap((delta) => delta.entries || [])
        .filter((entry: Record<string, any>) => entry.key === task.key && entry.lastTurnStatus === 'completed')
      expect(completedEntries.at(-1)).toMatchObject({
        status: 'idle',
        lastTurnStatus: 'completed',
        lastTurnEvidence: 'targeted-after-exit',
        hasUnreadTurn: true,
        unreadAuthority: 'desktop-persisted'
      })
      expect(JSON.stringify(deltas)).not.toContain(FIXED_THREAD_IDS[3])
      stop()
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses an initially true native unread state to wake one bounded Turn verification cycle', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000_350_000)
    try {
      const child = new FakeCodexProcess()
      child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
      const { bridge } = loadCodexBridge(
        child,
        () => nativeRegistryTextWithUnread([FIXED_THREAD_IDS[3]]),
        null,
        true
      )

      await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await Promise.resolve()
      await Promise.resolve()

      const targetedReads = () => child.writes.filter((frame) => frame.method === 'thread/turns/list'
        && frame.params?.limit === 1
        && frame.params?.threadId === FIXED_THREAD_IDS[3]).length
      expect(targetedReads()).toBe(2)

      await bridge.readActivitySnapshot()
      await bridge.readActivitySnapshot()
      await Promise.resolve()
      expect(targetedReads()).toBe(2)
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses unread true to verify a stale active task without inferring completion from unread', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000_375_000)
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
      const statusReadsForTask = () => child.writes.filter((frame) => frame.method === 'thread/turns/list'
        && frame.params?.limit === 1
        && frame.params?.threadId === FIXED_THREAD_IDS[1]).length
      const statusReadsBefore = statusReadsForTask()

      child.inProgressTurnIds.delete(FIXED_THREAD_IDS[1])
      nativeUnread = true
      triggerNativeStateChange()
      await vi.advanceTimersByTimeAsync(0)
      await Promise.resolve()
      await Promise.resolve()

      // A later unread edge rechecks the cold inventory+snapshot live epoch
      // once; it must not infer completion from unread alone.
      expect(statusReadsForTask()).toBe(statusReadsBefore + 1)
      expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'active',
        lastTurnStatus: 'completed',
        lastTurnEvidence: 'targeted-after-exit',
        hasUnreadTurn: true,
        unreadAuthority: 'desktop-persisted'
      })
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries corroboration when unread true arrives after an active completed inventory snapshot', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000_390_000)
    try {
      let nativeUnread = false
      const child = new FakeCodexProcess()
      const desktopSocket = new FakeCodexDesktopSocket()
      desktopSocket.streamOwnerConnected = false
      desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
      desktopSocket.unreadSnapshotThreadIds.delete(FIXED_THREAD_IDS[3])
      const { bridge, triggerNativeStateChange } = loadCodexBridge(
        child,
        () => nativeRegistryTextWithUnread(nativeUnread ? [FIXED_THREAD_IDS[3]] : []),
        desktopSocket,
        true
      )
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await Promise.resolve()
      await Promise.resolve()
      const task = baseline.value.threads[3]
      child.holdNextLatestTurnRead = true
      desktopSocket.streamOwnerConnected = true
      desktopSocket.push({
        type: 'broadcast',
        method: 'client-status-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 0,
        params: { clientId: 'codex-desktop-owner', status: 'connected' }
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(0)
      expect(child.heldLatestTurnReads).toHaveLength(1)

      nativeUnread = true
      triggerNativeStateChange()
      await vi.advanceTimersByTimeAsync(1_400)
      await Promise.resolve()
      await Promise.resolve()

      expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'idle',
        lastTurnStatus: 'completed',
        lastTurnEvidence: 'snapshot-corroborated',
        hasUnreadTurn: true,
        unreadAuthority: 'desktop-persisted'
      })
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
      await vi.advanceTimersByTimeAsync(0)

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

  it('accepts the editor v1 read event without hostId and lets it override persisted unread', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.unreadSnapshotThreadIds.add(FIXED_THREAD_IDS[2])
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
      version: 1,
      params: { conversationId: FIXED_THREAD_IDS[2], hasUnreadTurn: false }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: false,
      unreadAuthority: 'desktop-live'
    })
    expect((await bridge.readActivitySnapshot()).value.desktopBridgeState).toBe('connected')
    bridge.close()
  })

  it('lets a current refollow read snapshot clear a stale persisted unread after a missed event', async () => {
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
      hasUnreadTurn: false,
      unreadAuthority: 'desktop-live'
    })
    bridge.close()
  })

  it('accepts unrevisioned editor v6 stream snapshots and patches without weakening newer versions', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[1]

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 6,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[1],
        change: {
          type: 'snapshot',
          conversationState: {
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            requests: [{ type: 'approval', method: 'requestApproval' }],
            hasUnreadTurn: false
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnApproval'],
      statusAuthority: 'desktop-live'
    })

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 6,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[1],
        change: {
          type: 'patches',
          patches: [
            { op: 'replace', path: ['threadRuntimeStatus'], value: { type: 'idle', activeFlags: [] } },
            { op: 'replace', path: ['requests'], value: [] }
          ]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value).toMatchObject({ desktopBridgeState: 'connected' })
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'idle',
      activeFlags: [],
      statusAuthority: 'desktop-live'
    })
    bridge.close()
  })

  it('keeps a completed unread task and its known Side Chats unread after deep-link dispatch', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const parentThreadId = FIXED_THREAD_IDS[2]
    const sideThreadId = 'a2345678-1234-4234-8234-123456789abc'
    desktopSocket.unreadSnapshotThreadIds.add(sideThreadId)
    desktopSocket.sideConversationParents.set(sideThreadId, parentThreadId)
    const { bridge, native, openExternal } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([sideThreadId]),
      desktopSocket
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[2]

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: sideThreadId,
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            sideConversation: true,
            forkedFromId: parentThreadId,
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            requests: [],
            hasUnreadTurn: true
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true
    })
    const privateEvidence = native.privateBranchEvidence(parentThreadId)
    expect(privateEvidence?.branches).toEqual(expect.arrayContaining([
      expect.objectContaining({ branchKind: 'main', unreadKnown: true, hasUnreadTurn: false }),
      expect.objectContaining({ branchKind: 'side', unreadKnown: true, hasUnreadTurn: true })
    ]))
    expect(JSON.stringify(privateEvidence)).not.toContain(parentThreadId)
    expect(JSON.stringify(privateEvidence)).not.toContain(sideThreadId)
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))

    openExternal.mockRejectedValueOnce(new Error('open failed'))
    await expect(bridge.openThread(task.actionAlias)).resolves.toMatchObject({ outcome: 'failed' })
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true
    })

    await expect(bridge.openThread(task.actionAlias)).resolves.toMatchObject({
      outcome: 'dispatched',
      confirmsRead: false,
      handoff: { stage: 'dispatched', nativeVisible: false }
    })
    expect(openExternal).toHaveBeenNthCalledWith(1, `codex://threads/${parentThreadId}`)
    expect(openExternal).toHaveBeenNthCalledWith(2, `codex://threads/${parentThreadId}`)
    expect(openExternal).not.toHaveBeenCalledWith(`codex://threads/${sideThreadId}`)
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-persisted'
    })
    expect(native.openedReadAcknowledgements()).toEqual([])
    expect(deltas).toEqual([])
    stop()
    bridge.close()
  })

  it('keeps a completed task unread after the accepted uTools fallback dispatch and a repeated inventory read', async () => {
    const child = new FakeCodexProcess()
    const threadId = FIXED_THREAD_IDS[2]
    const { bridge, shellOpenExternal } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([threadId]),
      null,
      false,
      false
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = baseline.value.threads[2]
    expect(task).toMatchObject({ hasUnreadTurn: true, lastTurnStatus: 'completed' })

    await expect(bridge.openThread(task.actionAlias)).resolves.toMatchObject({ outcome: 'dispatched' })
    expect(shellOpenExternal).toHaveBeenCalledWith(`codex://threads/${threadId}`)
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-persisted'
    })

    const repeated = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(repeated.value.threads[2]).toMatchObject({
      key: task.key,
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-persisted'
    })
    bridge.close()
  })

  it('does not fabricate a native read acknowledgement while Desktop IPC is unavailable', async () => {
    const child = new FakeCodexProcess()
    const { bridge } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([FIXED_THREAD_IDS[2]])
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = baseline.value.threads[2]
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-persisted'
    })

    await expect(bridge.openThread(task.actionAlias)).resolves.toMatchObject({ outcome: 'dispatched', confirmsRead: false })
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-persisted'
    })
    bridge.close()
  })

  it('does not create a sticky read acknowledgement through an IPC reset and refollow', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const threadId = FIXED_THREAD_IDS[2]
    desktopSocket.unreadSnapshotThreadIds.add(threadId)
    const { bridge } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([threadId]),
      desktopSocket
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[2]

    await expect(bridge.openThread(task.actionAlias)).resolves.toMatchObject({ outcome: 'dispatched', confirmsRead: false })
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true
    })

    desktopSocket.push({
      type: 'broadcast',
      method: 'ipc-connection-reset',
      sourceClientId: 'codex-desktop-owner',
      version: 1,
      params: {}
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true
    })
    bridge.close()
  })

  it('keeps deep-link dispatch pending across mainHide rebuild without masking a new Turn', async () => {
    const child = new FakeCodexProcess(false, false)
    const desktopSocket = new FakeCodexDesktopSocket()
    const threadId = FIXED_THREAD_IDS[2]
    desktopSocket.unreadSnapshotThreadIds.add(threadId)
    const { bridge } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([threadId]),
      desktopSocket
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[2]

    await expect(bridge.openThread(task.actionAlias)).resolves.toMatchObject({ outcome: 'dispatched', confirmsRead: false })
    bridge.close()

    const reopened = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reopened.value.threads[2]).toMatchObject({
      key: task.key,
      hasUnreadTurn: true
    })
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true
    })

    bridge.close()
    child.inProgressTurnIds.add(threadId)
    const resumed = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(resumed.value.threads[2]).toMatchObject({
      key: task.key,
      lastTurnStatus: 'inProgress',
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-persisted'
    })
    bridge.close()
  })

  it('keeps deep-link dispatch from overriding late unread evidence for the same completion or a new Turn', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const threadId = FIXED_THREAD_IDS[2]
    desktopSocket.unreadSnapshotThreadIds.add(threadId)
    const { bridge } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([threadId]),
      desktopSocket
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[2]

    await expect(bridge.openThread(task.actionAlias)).resolves.toMatchObject({ outcome: 'dispatched', confirmsRead: false })
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-read-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 2,
      params: { hostId: 'local', conversationId: threadId, hasUnreadTurn: true }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-live'
    })
    expect(deltas.at(-1)).toMatchObject({
      entries: [{ key: task.key, readStateOnly: true, hasUnreadTurn: true, unreadAuthority: 'desktop-live' }]
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId,
        turn: {
          id: `turn-${threadId}`,
          status: 'completed',
          startedAt: 1_900_000_000,
          completedAt: 2_000_000_072
        }
      }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-live'
    })

    child.stdout.emit('data', `${JSON.stringify({ method: 'turn/completed', params: { threadId } })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-live'
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: { threadId, turn: { id: 'new-turn-after-read', status: 'inProgress', startedAt: 2_000_000_200 } }
    })}\n`)
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: { threadId, turn: { id: 'new-turn-after-read', status: 'completed', startedAt: 2_000_000_200, completedAt: 2_000_000_201 } }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-live'
    })
    stop()
    bridge.close()
  })

  it('lets parseable native unread absence clear a stale snapshot true while preserving a later exact event', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.unreadSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
    const { bridge } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([]),
      desktopSocket
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[3]

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: false,
      unreadAuthority: 'desktop-persisted'
    })

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-read-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 2,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[3], hasUnreadTurn: true }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-live'
    })
    bridge.close()
  })

  it('retains the last parsed native nonmembership across a transient unread-file read failure', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const threadId = FIXED_THREAD_IDS[3]
    desktopSocket.unreadSnapshotThreadIds.add(threadId)
    let nativeUnreadReadable = true
    const { bridge } = loadCodexBridge(
      child,
      () => nativeUnreadReadable ? nativeRegistryTextWithUnread([]) : nativeRegistryText(),
      desktopSocket
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[3]
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: false,
      unreadAuthority: 'desktop-persisted'
    })

    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
    nativeUnreadReadable = false
    const refreshed = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(refreshed.value.threads.find((thread: Record<string, any>) => thread.key === task.key)).toMatchObject({
      hasUnreadTurn: false,
      unreadAuthority: 'desktop-persisted'
    })
    desktopSocket.push({
      type: 'broadcast',
      method: 'ipc-connection-reset',
      sourceClientId: 'codex-desktop-owner',
      version: 1,
      params: {}
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      hasUnreadTurn: false,
      unreadAuthority: 'desktop-persisted'
    })
    expect(deltas.flatMap((delta) => delta.entries || [])).not.toContainEqual(expect.objectContaining({
      key: task.key,
      hasUnreadTurn: true
    }))
    stop()
    bridge.close()
  })

  it('applies the same unread authority order when aggregating a Side Chat', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const sideThreadId = 'a2345678-1234-4234-8234-123456789abc'
    const { bridge } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([]),
      desktopSocket
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const parent = baseline.value.threads[3]

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: sideThreadId,
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            sideConversation: true,
            forkedFromId: FIXED_THREAD_IDS[3],
            threadRuntimeStatus: { type: 'idle', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: true,
            requests: []
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({
      hasUnreadTurn: false,
      unreadAuthority: 'desktop-persisted'
    })

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-read-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 2,
      params: { hostId: 'local', conversationId: sideThreadId, hasUnreadTurn: true }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({
      hasUnreadTurn: true,
      unreadAuthority: 'desktop-live'
    })
    bridge.close()
  })

  it('lets a Side Chat refollow read snapshot clear its stale persisted unread in the parent aggregate', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const sideThreadId = 'a2345678-1234-4234-8234-123456789abc'
    const { bridge } = loadCodexBridge(
      child,
      () => nativeRegistryTextWithUnread([sideThreadId]),
      desktopSocket
    )
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const parent = baseline.value.threads[3]

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: sideThreadId,
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            sideConversation: true,
            forkedFromId: FIXED_THREAD_IDS[3],
            threadRuntimeStatus: { type: 'idle', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: false,
            requests: []
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({
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
        activityEvidence: 'initial-snapshot',
        lastTurnStatus: 'interrupted',
        lastTurnStartedAt: 1_900_000_000_000
      })
      expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).not.toHaveProperty('desktopActiveSince')

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
        entries: [{ key: task.key, hasUnreadTurn: true, unreadAuthority: 'desktop-live' }]
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
        statusAuthority: 'app-server-live',
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
    expect(deltas.at(-1)).toMatchObject({
      inventoryChanged: true,
      inventoryRefreshPriority: 'urgent',
      entries: [expect.objectContaining({
        key: expect.stringMatching(/^[a-f0-9]{32}$/),
        displayName: '新 Codex 任务',
        status: 'active',
        lastTurnStatus: 'inProgress'
      })]
    })
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

  it('admits a new thread immediately even before project metadata and the first inventory fingerprint exist', async () => {
    const child = new FakeCodexProcess()
    const context = loadCodexBridge(child, () => { throw new Error('registry still starting') })
    const kernel = context.platform.companionKernel
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
draft: v7EvidenceDraft({
        producer: 'renderer',
        sourceTaskStateRevision: 'task-state-v12',
        draftRevision: 1,
        acceptedAt: Date.now(),
        enabled: true,
        providers: { codex: true, claude: false },
        complete: true,
        focusedKey: '',
        sourceGenerations: { codex: 0, claude: 0 },
        sourceLaneGenerations: {
          codex: { membership: 0, activity: 0, unread: 0 },
          claude: { membership: 0, activity: 0, unread: 0 }
        },
        tasks: []
      })
    })
    await expect(context.bridge.readSnapshot({ includeQuota: true, includeConfig: false, includeThreads: false })).resolves.toMatchObject({ ok: true })
    const deltas: Array<Record<string, any>> = []
    const stop = context.bridge.onActivityChanged((delta) => deltas.push(delta))

    child.stdout.emit('data', `${JSON.stringify({
      method: 'thread/started',
      params: {
        thread: {
          id: child.createdThreadId,
          name: 'private title that must wait for metadata',
          cwd: '/private/new-task-before-registry',
          preview: 'private body'
        }
      }
    })}\n`)
    await Promise.resolve()

    expect(deltas.at(-1)).toMatchObject({
      inventoryChanged: true,
      inventoryRefreshPriority: 'urgent',
      entries: [expect.objectContaining({
        displayName: '新 Codex 任务',
        projectKey: 'chats',
        projectName: 'Chats',
        status: 'active',
        lastTurnStatus: 'inProgress',
        actionAlias: expect.stringMatching(/^ct_/)
      })]
    })
    expect(kernel.getPackage()).toMatchObject({
      complete: true,
      tasks: [expect.objectContaining({
        provider: 'codex',
        phase: 'running',
        displayName: '新 Codex 任务',
        projectKey: 'chats',
        capabilities: expect.objectContaining({ open: true, archive: false })
      })]
    })
    expect(JSON.stringify(deltas)).not.toContain(child.createdThreadId)
    expect(JSON.stringify(deltas)).not.toContain('private title')
    expect(JSON.stringify(deltas)).not.toContain('/private/new-task-before-registry')
    expect(JSON.stringify(deltas)).not.toContain('private body')
    stop()
    context.bridge.close()
  })

  it('retains an unknown Desktop waiting-input shadow and registers it by exact read while thread/list still lags', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    await expect(bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).resolves.toMatchObject({ ok: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
    const statusReadsBefore = child.writes.filter((frame) => frame.method === 'thread/turns/list'
      && frame.params?.limit === 1
      && frame.params?.threadId === child.createdThreadId).length

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
    const statusReadsAfter = child.writes.filter((frame) => frame.method === 'thread/turns/list'
      && frame.params?.limit === 1
      && frame.params?.threadId === child.createdThreadId).length
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

  it('keeps an active-to-active Plan request waiting until a causal newer Turn starts', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[1])
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads.find((thread: Record<string, any>) => thread.name === '运行中')
    const deltas: Array<Record<string, any>> = []
    const stop = bridge.onActivityChanged((delta) => deltas.push(delta))
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId: FIXED_THREAD_IDS[1],
        turn: { status: 'completed', startedAt: 1_900_000_000, completedAt: 2_000_000_071 }
      }
    })}\n`)
    await Promise.resolve()
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed'
    })
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
        planImplementationOnly: true,
        statusAuthority: 'desktop-live',
        activityEvidence: 'activity-event',
        activityRevision: 2,
        lastTurnStatus: 'inProgress'
      }]
    })
    expect(deltas.at(-1)?.entries?.[0]).not.toHaveProperty('lastTurnEvidence')
    const statusReadsAfter = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length
    expect(statusReadsAfter).toBe(statusReadsBefore)
    expect(JSON.stringify(deltas)).not.toContain('private plan body')

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
          baseRevision: 2,
          revision: 3,
          patches: [{ op: 'remove', path: ['requests', 0] }]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      activeFlags: ['waitingOnUserInput'],
      planImplementationOnly: true,
      statusAuthority: 'desktop-live',
      activityRevision: 3
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: FIXED_THREAD_IDS[1],
        turn: { status: 'inProgress', startedAt: 1_900_000_100 }
      }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      activeFlags: [],
      planImplementationOnly: false,
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress'
    })

    // The Desktop owner can refollow by replaying the previous waiting epoch
    // after the causal turn/started edge. That replacement snapshot must not
    // bounce the task back to waiting (or expose its stale unread bit) while
    // the newer App Server Turn is running.
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[1],
        change: {
          type: 'snapshot',
          revision: 4,
          conversationState: {
            threadRuntimeStatus: { type: 'active', activeFlags: ['waitingOnUserInput'] },
            resumeState: 'needs_resume',
            hasUnreadTurn: true,
            requests: [{
              type: 'serverRequest',
              method: 'item/plan/requestImplementation',
              planContent: 'private stale plan body'
            }]
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      planImplementationOnly: false,
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress'
    })
    expect(JSON.stringify(deltas)).not.toContain('item/plan/requestImplementation')
    expect(JSON.stringify(deltas)).not.toContain('private stale plan body')
    stop()
    bridge.close()
  })

  it('timestamps exact requests, falls back to first observation, and retains Plan input until runtime resumes', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[1]
    const observedAfter = Date.now()
    const explicitTimes = [
      observedAfter - 5_000,
      observedAfter - 4_000,
      observedAfter - 3_000,
      observedAfter - 2_000,
      observedAfter - 1_000
    ]
    const requests = [
      { type: 'commandExecution', method: 'item/commandExecution/requestApproval', startedAt: explicitTimes[0] },
      { type: 'fileChange', method: 'item/fileChange/requestApproval', startedAt: explicitTimes[1] },
      { type: 'elicitation', method: 'mcpServer/elicitation/request', startedAt: explicitTimes[2] },
      { type: 'userInput', method: 'item/tool/requestUserInput', startedAt: explicitTimes[3] },
      { type: 'plan', method: 'item/plan/requestImplementation', startedAt: explicitTimes[4] },
      {
        type: 'permissions',
        method: 'item/permissions/requestApproval',
        requestId: 'raw-request-id',
        params: { command: 'private command', cwd: '/private/path' }
      }
    ]
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[1],
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            threadRuntimeStatus: { type: 'idle', activeFlags: [] },
            requests,
            hasUnreadTurn: false
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const first = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)
    expect(first).toMatchObject({
      status: 'active',
      activeFlags: expect.arrayContaining(['waitingOnApproval', 'waitingOnUserInput']),
      statusAuthority: 'desktop-live'
    })
    expect(first.waitingSince).toBeGreaterThanOrEqual(observedAfter)

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[1],
        change: {
          type: 'snapshot',
          revision: 2,
          conversationState: {
            threadRuntimeStatus: { type: 'idle', activeFlags: [] },
            requests,
            hasUnreadTurn: false
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const replayed = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)
    expect(replayed.waitingSince).toBe(first.waitingSince)

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
          baseRevision: 2,
          revision: 3,
          patches: [{ op: 'remove', path: ['requests', 5] }]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const fallback = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)
    expect(fallback.waitingSince).toBe(explicitTimes[4])

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
          baseRevision: 3,
          revision: 4,
          patches: [{ op: 'replace', path: ['requests'], value: [] }]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const retainedPlan = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)
    expect(retainedPlan).toMatchObject({ status: 'active', activeFlags: ['waitingOnUserInput'], waitingSince: explicitTimes[4] })

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
          baseRevision: 4,
          revision: 5,
          patches: [{ op: 'replace', path: ['threadRuntimeStatus'], value: { type: 'active', activeFlags: [] } }]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const resumed = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)
    expect(resumed).toMatchObject({ status: 'active', activeFlags: [] })
    expect(resumed).not.toHaveProperty('waitingSince')
    const publicPayload = JSON.stringify((await bridge.readActivitySnapshot()).value)
    expect(publicPayload).not.toContain('raw-request-id')
    expect(publicPayload).not.toContain('private command')
    expect(publicPayload).not.toContain('/private/path')
    expect(publicPayload).not.toContain('requestApproval')
    bridge.close()
  })

  it('keeps distinct first-observation times for identical untimestamped approvals across full snapshots', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = baseline.value.threads[1]
    const approval = (requestId: string) => ({
      type: 'permissions',
      method: 'item/permissions/requestApproval',
      requestId
    })
    const snapshot = (revision: number, requests: Record<string, unknown>[]) => ({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[1],
        change: {
          type: 'snapshot',
          revision,
          conversationState: {
            threadRuntimeStatus: { type: 'idle', activeFlags: [] },
            requests,
            hasUnreadTurn: false
          }
        }
      }
    })

    desktopSocket.push(snapshot(1, [approval('approval-a')]))
    await new Promise((resolve) => setTimeout(resolve, 10))
    const first = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)

    desktopSocket.push(snapshot(2, [approval('approval-a'), approval('approval-b')]))
    await new Promise((resolve) => setTimeout(resolve, 10))
    const second = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)
    expect(second.waitingSince).toBeGreaterThan(first.waitingSince)

    desktopSocket.push(snapshot(3, [approval('approval-b')]))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const remaining = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)
    expect(remaining.waitingSince).toBe(second.waitingSince)
    expect(JSON.stringify((await bridge.readActivitySnapshot()).value)).not.toContain('approval-b')
    bridge.close()
  })

  it('uses the latest unresolved Side Chat request time for the parent attention instance', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const parent = baseline.value.threads[1]
    const sideThreadId = 'a2345678-1234-4234-8234-123456789abc'
    const parentAt = Date.now() - 2_000
    const childAt = Date.now() - 1_000
    const snapshot = (conversationId: string, requests: Record<string, any>[], sideConversation = false) => ({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId,
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            ...(sideConversation ? { sideConversation: true, forkedFromId: FIXED_THREAD_IDS[1] } : {}),
            threadRuntimeStatus: { type: 'idle', activeFlags: [] },
            requests,
            hasUnreadTurn: false
          }
        }
      }
    })
    desktopSocket.push(snapshot(FIXED_THREAD_IDS[1], [
      { type: 'userInput', method: 'item/tool/requestUserInput', startedAt: parentAt }
    ]))
    desktopSocket.push(snapshot(sideThreadId, [
      { type: 'permissions', method: 'item/permissions/requestApproval', startedAt: childAt }
    ], true))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({
      activeFlags: expect.arrayContaining(['waitingOnUserInput', 'waitingOnApproval']),
      waitingSince: childAt
    })
    bridge.close()
  })

  it('defers a hydration-only active patch after completion until a real Turn starts', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[1])
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads.find((thread: Record<string, any>) => thread.name === '运行中')
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId: FIXED_THREAD_IDS[1],
        turn: { status: 'completed', startedAt: 1_900_000_000, completedAt: 2_000_000_072 }
      }
    })}\n`)
    await Promise.resolve()
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed'
    })

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
          patches: [{ op: 'replace', path: ['threadRuntimeStatus', 'type'], value: 'active' }]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      statusAuthority: 'desktop-live',
      activityEvidence: 'initial-snapshot',
      lastTurnStatus: 'completed'
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: FIXED_THREAD_IDS[1],
        turn: { status: 'inProgress', startedAt: 2_000_000_073 }
      }
    })}\n`)
    await Promise.resolve()
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      lastTurnStatus: 'inProgress'
    })
    bridge.close()
  })

  it('folds an inventory-listed Side Chat into its paginated root without treating dispatch as read evidence', async () => {
    const child = new FakeCodexProcess()
    const parentThreadId = FIXED_THREAD_IDS[3]
    const sideThreadId = child.createdThreadId
    child.includeCreatedThreadInInventory = true
    child.inventoryPageSize = 1
    child.sessionIds.set(parentThreadId, 'shared-side-session')
    child.sessionIds.set(sideThreadId, 'shared-side-session')
    child.forkedFromIds.set(sideThreadId, parentThreadId)
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.streamOwnerConnected = false
    const context = loadCodexBridge(child, () => nativeRegistryTextWithUnread([sideThreadId]), desktopSocket)
    const baseline = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const parent = baseline.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')

    expect(parent).toBeTruthy()
    expect(baseline.value.threads).toHaveLength(5)
    expect(baseline.value.threads.some((thread: Record<string, any>) => thread.name === '刚创建的待输入任务')).toBe(false)
    expect(JSON.stringify(baseline.value)).not.toContain(sideThreadId)
    expect(child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived !== true).length).toBeGreaterThan(1)

    const privateEvidence = context.native.privateBranchEvidence(parentThreadId)
    expect(privateEvidence).toMatchObject({
      key: parent.key,
      branches: expect.arrayContaining([
        expect.objectContaining({ branchKind: 'main' }),
        expect.objectContaining({
          branchKind: 'side',
          lastTurnStatus: 'completed',
          unreadKnown: true,
          hasUnreadTurn: true
        })
      ])
    })
    expect(JSON.stringify(privateEvidence)).not.toContain(sideThreadId)

    const kernel = seedSingleCodexKernelTask(context, baseline, parent)
    expect(kernel.getPackage()).toMatchObject({
      // V7 gives terminal unread evidence priority over interaction guesses.
      tasks: [{ key: parent.key, phase: 'completed', unreadKnown: true, unread: true }],
      views: { counts: { active: 0, unread: 1 } }
    })
    expect(kernel.getPackage().tasks).toHaveLength(1)

    child.turnOverrides.set(sideThreadId, {
      id: `live-${sideThreadId}`,
      status: 'inProgress',
      startedAt: 2_000_000_200
    })
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: sideThreadId,
        turn: { id: `live-${sideThreadId}`, status: 'inProgress', startedAt: 2_000_000_200 }
      }
    })}\n`)
    await vi.waitFor(() => expect(context.native.privateBranchEvidence(parentThreadId)?.branches).toEqual(expect.arrayContaining([
      expect.objectContaining({ branchKind: 'side', lastTurnStatus: 'inProgress' })
    ])))
    const appServerBranches = context.native.privateBranchEvidence(parentThreadId)?.branches || []
    const sideRef = appServerBranches.find((branch: Record<string, any>) => branch.branchKind === 'side')?.ref
    expect(appServerBranches.find((branch: Record<string, any>) => branch.branchKind === 'side')).toMatchObject({
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress'
    })
    expect(appServerBranches.find((branch: Record<string, any>) => branch.branchKind === 'main')).not.toMatchObject({
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress'
    })
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === parent.key))
      .toMatchObject({ phase: 'running', unreadKnown: true, unread: true })
    expect(kernel.getPackage().views.counts).toMatchObject({ active: 1, unread: 0 })

    // The live App Server event arrives before Desktop's topology/activity
    // snapshot. The later snapshot must enrich the same private branch, not
    // recreate the Side Chat as a public root.
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: sideThreadId,
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            sideConversation: true,
            forkedFromId: parentThreadId,
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: true,
            requests: []
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(context.native.privateBranchEvidence(parentThreadId)?.branches
      .find((branch: Record<string, any>) => branch.branchKind === 'side')?.ref).toBe(sideRef)
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === parent.key))
      .toMatchObject({ phase: 'running', unread: true })
    expect(kernel.getPackage().views.counts).toMatchObject({ active: 1, unread: 0 })

    child.turnOverrides.set(sideThreadId, {
      id: `live-${sideThreadId}`,
      status: 'completed',
      startedAt: 2_000_000_200,
      completedAt: 2_000_000_220
    })
    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/completed',
      params: {
        threadId: sideThreadId,
        turn: {
          id: `live-${sideThreadId}`,
          status: 'completed',
          startedAt: 2_000_000_200,
          completedAt: 2_000_000_220
        }
      }
    })}\n`)
    await vi.waitFor(() => expect(context.native.privateBranchEvidence(parentThreadId)?.branches).toEqual(expect.arrayContaining([
      expect.objectContaining({ branchKind: 'side', lastTurnStatus: 'completed' })
    ])))
    // Turn completion alone closes the execution edge, while the prior Desktop
    // snapshot still says active. The matching idle patch supplies the exact
    // lifecycle closure required before V6 may terminalize the root.
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: sideThreadId,
        change: {
          type: 'patches',
          baseRevision: 1,
          revision: 2,
          patches: [{ op: 'replace', path: ['threadRuntimeStatus', 'type'], value: 'idle' }]
        }
      }
    })
    await vi.waitFor(() => expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === parent.key))
      .toMatchObject({ phase: 'completed', unreadKnown: true, unread: true }))
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === parent.key))
      .toMatchObject({ phase: 'completed', unreadKnown: true, unread: true })
    expect(kernel.getPackage().views.counts).toMatchObject({ active: 0, unread: 1 })

    await expect(context.bridge.openThread(parent.actionAlias)).resolves.toMatchObject({
      outcome: 'dispatched',
      confirmsRead: false,
      handoff: { stage: 'dispatched' }
    })
    expect(context.native.openedReadAcknowledgements()).toEqual([])
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === parent.key))
      .toMatchObject({ phase: 'completed', unreadKnown: true, unread: true })
    expect(kernel.getPackage().views.counts).toMatchObject({ active: 0, unread: 1 })
    expect(kernel.getPackage().views.counts).toMatchObject({ active: 0, unread: 1 })
    await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(context.native.openedReadAcknowledgements()).toEqual([])
    expect(context.native.privateBranchEvidence(parentThreadId)?.branches).toEqual(expect.arrayContaining([
      expect.objectContaining({ branchKind: 'side', unreadKnown: true, hasUnreadTurn: true })
    ]))
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === parent.key))
      .toMatchObject({ phase: 'completed', unread: true })

    child.archivedIds.add(sideThreadId)
    await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(context.native.privateBranchEvidence(parentThreadId)?.branches).toHaveLength(1)
    expect(kernel.getPackage().tasks.filter((task: Record<string, any>) => task.key === parent.key)).toHaveLength(1)
    expect(kernel.getPackage().tasks.some((task: Record<string, any>) => task.displayName === '刚创建的待输入任务')).toBe(false)
    expect(JSON.stringify(context.diagnosticEvents)).not.toContain(sideThreadId)
    expect(context.diagnosticEvents).toContainEqual(expect.objectContaining({
      event: 'side-topology-decision',
      outcome: 'merged'
    }))
    context.bridge.close()
  })

  it('persists Desktop Side relation hints and recovers the running child after a preload reload', async () => {
    const parentThreadId = FIXED_THREAD_IDS[2]
    const sideThreadId = 'a2345678-1234-4234-8234-123456789abc'
    const dbStorageHarness = { values: new Map<string, unknown>(), writes: [] as string[] }
    const child = new FakeCodexProcess()
    child.turnOverrides.set(sideThreadId, { id: `live-${sideThreadId}`, status: 'inProgress', startedAt: 2_000_000_300 })
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.sideConversationParents.set(sideThreadId, parentThreadId)
    desktopSocket.activeSnapshotThreadIds.add(sideThreadId)
    const first = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket, false, true, null, false, dbStorageHarness)
    await first.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: sideThreadId,
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            sideConversation: true,
            forkedFromId: parentThreadId,
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            resumeState: '',
            requests: []
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    const stored = dbStorageHarness.values.get('eypc/codex/desktop-side-relations/v1') as Record<string, any>
    expect(stored).toMatchObject({ version: 1 })
    expect(stored.relations).toEqual([{ threadId: sideThreadId, parentThreadId, observedAt: expect.any(Number) }])
    first.bridge.close()

    // A fresh preload process over the same dbStorage models the plugin reload.
    const child2 = new FakeCodexProcess()
    child2.turnOverrides.set(sideThreadId, { id: `live-${sideThreadId}`, status: 'inProgress', startedAt: 2_000_000_300 })
    const desktopSocket2 = new FakeCodexDesktopSocket()
    desktopSocket2.sideConversationParents.set(sideThreadId, parentThreadId)
    desktopSocket2.activeSnapshotThreadIds.add(sideThreadId)
    const second = loadCodexBridge(child2, () => nativeRegistryText(), desktopSocket2, false, true, null, false, dbStorageHarness)
    const baseline = await second.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = baseline.value.threads[2]
    expect(second.diagnosticEvents).toContainEqual(expect.objectContaining({
      event: 'side-relation-hints-restored',
      details: expect.objectContaining({ count: 1 })
    }))
    await vi.waitFor(() => expect(desktopSocket2.writes.some((message) => message.method === 'thread-stream-following-changed'
      && message.params?.conversationId === sideThreadId
      && message.params?.following === true)).toBe(true))
    await vi.waitFor(async () => {
      expect((await second.bridge.readActivitySnapshot()).value.entries
        .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({ status: 'active' })
    })
    const privateEvidence = second.native.privateBranchEvidence(parentThreadId)
    expect(privateEvidence?.branches).toEqual(expect.arrayContaining([
      expect.objectContaining({ branchKind: 'side' })
    ]))
    expect(JSON.stringify(privateEvidence)).not.toContain(sideThreadId)
    expect(JSON.stringify(second.diagnosticEvents)).not.toContain(sideThreadId)

    // Archiving the child retires the relation and the persisted hint together.
    desktopSocket2.push({
      type: 'broadcast',
      method: 'thread-archived',
      sourceClientId: 'codex-desktop-owner',
      version: 2,
      params: { hostId: 'local', conversationId: sideThreadId }
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    const cleared = dbStorageHarness.values.get('eypc/codex/desktop-side-relations/v1') as Record<string, any>
    expect(cleared.relations).toEqual([])
    second.bridge.close()
  })

  it('does not fabricate running from a restored side relation hint alone', async () => {
    const parentThreadId = FIXED_THREAD_IDS[2]
    const sideThreadId = 'a2345678-1234-4234-8234-123456789abc'
    const dbStorageHarness = { values: new Map<string, unknown>(), writes: [] as string[] }
    dbStorageHarness.values.set('eypc/codex/desktop-side-relations/v1', {
      version: 1,
      relations: [{ threadId: sideThreadId, parentThreadId, observedAt: Date.now() }],
      updatedAt: Date.now()
    })
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    // Nobody rebroadcasts the followed child: the hint alone must stay inert.
    desktopSocket.streamOwnerConnected = false
    const context = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket, false, true, null, false, dbStorageHarness)
    const baseline = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const task = baseline.value.threads[2]
    expect(context.diagnosticEvents).toContainEqual(expect.objectContaining({
      event: 'side-relation-hints-restored',
      details: expect.objectContaining({ count: 1 })
    }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await context.bridge.readActivitySnapshot()).value.entries
      .find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({ status: 'idle' })
    context.bridge.close()
  })

  it('drops expired persisted side relation hints instead of restoring them', async () => {
    const parentThreadId = FIXED_THREAD_IDS[2]
    const sideThreadId = 'a2345678-1234-4234-8234-123456789abc'
    const dbStorageHarness = { values: new Map<string, unknown>(), writes: [] as string[] }
    dbStorageHarness.values.set('eypc/codex/desktop-side-relations/v1', {
      version: 1,
      relations: [{ threadId: sideThreadId, parentThreadId, observedAt: Date.now() - 49 * 60 * 60 * 1000 }],
      updatedAt: Date.now()
    })
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const context = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket, false, true, null, false, dbStorageHarness)
    await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(context.diagnosticEvents).not.toContainEqual(expect.objectContaining({
      event: 'side-relation-hints-restored'
    }))
    expect(desktopSocket.writes.some((message) => message.method === 'thread-stream-following-changed'
      && message.params?.conversationId === sideThreadId)).toBe(false)
    context.bridge.close()
  })

  it('opens live from a fresh inProgress latest turn on an idle inventory Side row and re-verifies instead of trusting cache', async () => {
    const child = new FakeCodexProcess()
    const parentThreadId = FIXED_THREAD_IDS[3]
    const sideThreadId = child.createdThreadId
    child.includeCreatedThreadInInventory = true
    child.sessionIds.set(parentThreadId, 'shared-side-session')
    child.sessionIds.set(sideThreadId, 'shared-side-session')
    child.forkedFromIds.set(sideThreadId, parentThreadId)
    child.statusOverrides.set(sideThreadId, 'idle')
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.streamOwnerConnected = false
    const context = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const parent = baseline.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')
    expect(parent).toBeTruthy()
    const kernel = seedSingleCodexKernelTask(context, baseline, parent)
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === parent.key))
      .toMatchObject({ phase: 'completed' })

    // The turn starts while the App Server row still reads idle: the fresh
    // targeted latest-Turn read is the verification and must open live.
    child.turnOverrides.set(sideThreadId, { id: `live-${sideThreadId}`, status: 'inProgress', startedAt: 2_000_000_200 })
    context.native.markCodexThreadTurnStatusDirty(sideThreadId)
    const liveSnapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const liveBranches = context.native.privateBranchEvidence(parentThreadId)?.branches || []
    expect(liveBranches.find((branch: Record<string, any>) => branch.branchKind === 'side')).toMatchObject({
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress'
    })
    // The same branch evidence flows into the Kernel with the next activity
    // push, exactly as the event lane and host reconciliation deliver it.
    expect(context.native.applyCodexActivityToCompanionKernel({
      generation: Number(liveSnapshot.value.activityGeneration) + 1,
      receivedAt: 2_000_000_000_000,
      inventoryChanged: false,
      entries: [{ key: parent.key }]
    })).toBe(true)
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === parent.key))
      .toMatchObject({ phase: 'running' })
    expect(context.diagnosticEvents).toContainEqual(expect.objectContaining({
      event: 'side-topology-decision',
      details: expect.objectContaining({ recoveredLiveCount: 1 })
    }))

    // The turn later completes. A dirty-driven rescan of another thread must
    // not trust the cached inProgress: the contradictory row is re-read fresh
    // and settles as completed.
    child.turnOverrides.set(sideThreadId, {
      id: `live-${sideThreadId}`,
      status: 'completed',
      startedAt: 2_000_000_200,
      completedAt: 2_000_000_260
    })
    context.native.markCodexThreadTurnStatusDirty(FIXED_THREAD_IDS[0])
    const settledSnapshot = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const settledBranches = context.native.privateBranchEvidence(parentThreadId)?.branches || []
    expect(settledBranches.find((branch: Record<string, any>) => branch.branchKind === 'side')).toMatchObject({
      lastTurnStatus: 'completed'
    })
    expect(context.native.applyCodexActivityToCompanionKernel({
      generation: Number(settledSnapshot.value.activityGeneration) + 1,
      receivedAt: 2_000_000_000_001,
      inventoryChanged: false,
      entries: [{ key: parent.key }]
    })).toBe(true)
    expect(kernel.getPackage().tasks.find((task: Record<string, any>) => task.key === parent.key))
      .toMatchObject({ phase: 'completed' })
    expect(JSON.stringify(context.diagnosticEvents)).not.toContain(sideThreadId)
    context.bridge.close()
  })

  it('expires a former standalone child alias when later inventory lineage attaches it to a root', async () => {
    const child = new FakeCodexProcess()
    child.includeCreatedThreadInInventory = true
    const parentThreadId = FIXED_THREAD_IDS[2]
    const sideThreadId = child.createdThreadId
    const { bridge, openExternal } = loadCodexBridge(child, () => nativeRegistryText())
    const standalone = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const staleChild = standalone.value.threads.find((thread: Record<string, any>) => thread.name === '刚创建的待输入任务')
    expect(staleChild?.actionAlias).toEqual(expect.any(String))

    child.sessionIds.set(parentThreadId, 'shared-session')
    child.sessionIds.set(sideThreadId, 'shared-session')
    child.forkedFromIds.set(sideThreadId, parentThreadId)
    const rooted = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(rooted.value.threads.some((thread: Record<string, any>) => thread.name === '刚创建的待输入任务')).toBe(false)
    await expect(bridge.openThread(staleChild.actionAlias)).resolves.toMatchObject({
      outcome: 'failed',
      errorCode: 'expired-alias'
    })
    expect(openExternal).not.toHaveBeenCalledWith(`codex://threads/${sideThreadId}`)
    bridge.close()
  })

  it('queries Side Chat Turns by child id and replays multiple child activity after inventory rebuild', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const parent = baseline.value.threads[3]
    const firstChildId = child.createdThreadId
    const secondChildId = 'a2345678-1234-4234-8234-123456789abc'
    child.inProgressTurnIds.add(firstChildId)

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: firstChildId,
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            sideConversation: true,
            forkedFromId: FIXED_THREAD_IDS[3],
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: false,
            requests: []
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(child.writes.some((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1 && frame.params?.threadId === firstChildId)).toBe(true)
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({
      status: 'active',
      lastTurnStatus: 'inProgress'
    })

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: firstChildId,
        change: {
          type: 'patches',
          baseRevision: 1,
          revision: 2,
          patches: [{ op: 'add', path: ['requests', 0], value: { type: 'userInput', method: 'requestUserInput' } }]
        }
      }
    })
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: secondChildId,
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            sideConversation: true,
            forkedFromId: FIXED_THREAD_IDS[3],
            threadRuntimeStatus: { type: 'active', activeFlags: ['waitingOnApproval'] },
            resumeState: '',
            hasUnreadTurn: false,
            requests: []
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const active = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === parent.key)
    expect(active).toMatchObject({
      status: 'active',
      activeFlags: expect.arrayContaining(['waitingOnUserInput', 'waitingOnApproval']),
      lastTurnStatus: 'inProgress'
    })

    await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({
      status: 'active',
      activeFlags: expect.arrayContaining(['waitingOnUserInput', 'waitingOnApproval']),
      lastTurnStatus: 'inProgress'
    })

    const readsBeforeExit = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: firstChildId,
        change: {
          type: 'patches',
          baseRevision: 2,
          revision: 3,
          patches: [
            { op: 'remove', path: ['requests', 0] },
            { op: 'replace', path: ['threadRuntimeStatus', 'type'], value: 'idle' }
          ]
        }
      }
    })
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: secondChildId,
        change: {
          type: 'patches',
          baseRevision: 1,
          revision: 2,
          patches: [{ op: 'replace', path: ['threadRuntimeStatus', 'type'], value: 'idle' }]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const exitReads = child.writes
      .filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1)
      .slice(readsBeforeExit)
    expect(exitReads.some((frame) => frame.params?.threadId === secondChildId)).toBe(true)
    bridge.close()
  })

  it('rebuilds current runtime and unresolved-request states from refollow snapshots after an IPC reset', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryTextWithUnread([]), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    desktopSocket.waitingInputSnapshotThreadIds.delete(FIXED_THREAD_IDS[0])
    desktopSocket.waitingApprovalSnapshotThreadIds.add(FIXED_THREAD_IDS[1])
    desktopSocket.planImplementationSnapshotThreadIds.add(FIXED_THREAD_IDS[2])
    desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
    child.inProgressTurnIds.add(FIXED_THREAD_IDS[3])
    desktopSocket.push({
      type: 'broadcast',
      method: 'ipc-connection-reset',
      sourceClientId: 'codex-desktop-owner',
      version: 1,
      params: {}
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const entries = (await bridge.readActivitySnapshot()).value.entries
    expect(entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[0].key)).toMatchObject({
      status: 'idle',
      activeFlags: [],
      lastTurnStatus: 'completed'
    })
    expect(entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[1].key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnApproval'],
      planImplementationOnly: false
    })
    expect(entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[2].key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      planImplementationOnly: true
    })
    expect(entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[3].key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      lastTurnStatus: 'inProgress'
    })
    bridge.close()
  })

  it('retains only known Side Chat topology across bridge close/reopen and reconciles a recovered idle child', async () => {
    const child = new FakeCodexProcess(false, false)
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const desktopSocket = new FakeCodexDesktopSocket()
    const knownChildId = child.createdThreadId
    const unknownChildId = 'b2345678-1234-4234-8234-123456789abc'
    desktopSocket.sideConversationParents.set(knownChildId, FIXED_THREAD_IDS[3])
    desktopSocket.waitingInputSnapshotThreadIds.add(knownChildId)
    child.inProgressTurnIds.add(knownChildId)
    const { bridge, native } = loadCodexBridge(child, () => nativeRegistryTextWithUnread([]), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const parent = baseline.value.threads[3]

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: knownChildId,
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            sideConversation: true,
            forkedFromId: FIXED_THREAD_IDS[3],
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: false,
            requests: [{ type: 'userInput', method: 'requestUserInput' }]
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput']
    })

    const writesBeforeServerReset = desktopSocket.writes.length
    desktopSocket.waitingInputSnapshotThreadIds.delete(knownChildId)
    child.inProgressTurnIds.delete(knownChildId)
    native.resetCodexThreadSessionState()
    await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(desktopSocket.writes.slice(writesBeforeServerReset).some((message) => message.method === 'thread-stream-following-changed'
      && message.params?.conversationId === knownChildId
      && message.params?.following === true)).toBe(true)

    bridge.close()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const writesBeforeReopen = desktopSocket.writes.length
    const latestTurnReadsBeforeReopen = child.writes.filter((frame) => frame.method === 'thread/turns/list'
      && frame.params?.limit === 1
      && frame.params?.threadId === knownChildId).length
    desktopSocket.unreadSnapshotThreadIds.delete(knownChildId)
    desktopSocket.sideConversationParents.set(unknownChildId, FIXED_THREAD_IDS[3])

    const reopened = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const reopenWrites = desktopSocket.writes.slice(writesBeforeReopen)
    expect(reopenWrites.some((message) => message.method === 'thread-stream-following-changed'
      && message.params?.conversationId === knownChildId
      && message.params?.following === true)).toBe(true)
    expect(reopenWrites.some((message) => message.method === 'thread-stream-following-changed'
      && message.params?.conversationId === unknownChildId)).toBe(false)
    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list'
      && frame.params?.limit === 1
      && frame.params?.threadId === knownChildId).length).toBeGreaterThan(latestTurnReadsBeforeReopen)
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === reopened.value.threads[3].key)).toMatchObject({
      status: 'idle',
      activeFlags: [],
      lastTurnStatus: 'completed',
      hasUnreadTurn: false
    })
    bridge.close()
  })

  it('retires a Desktop-only active Side after complete inventory and exact empty-Turn checks agree it is gone', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeCodexProcess()
      const desktopSocket = new FakeCodexDesktopSocket()
      const { bridge, native } = loadCodexBridge(child, () => nativeRegistryTextWithUnread([]), desktopSocket)
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await vi.advanceTimersByTimeAsync(0)
      const parentThreadId = FIXED_THREAD_IDS[3]
      const parent = baseline.value.threads[3]
      const sideThreadId = 'a2345678-1234-4234-8234-123456789abc'

      desktopSocket.push({
        type: 'broadcast',
        method: 'thread-stream-state-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 11,
        params: {
          hostId: 'local',
          conversationId: sideThreadId,
          change: {
            type: 'snapshot',
            revision: 1,
            conversationState: {
              sideConversation: true,
              forkedFromId: parentThreadId,
              threadRuntimeStatus: { type: 'idle', activeFlags: [] },
              resumeState: '',
              hasUnreadTurn: false,
              requests: []
            }
          }
        }
      })
      child.stdout.emit('data', `${JSON.stringify({
        method: 'turn/completed',
        params: {
          threadId: parentThreadId,
          turn: { status: 'completed', startedAt: 2_000_000_100, completedAt: 2_000_000_120 }
        }
      })}\n`)
      await vi.advanceTimersByTimeAsync(0)

      child.emptyTurnIds.add(sideThreadId)
      child.transientTurnsFailures = 1
      desktopSocket.push({
        type: 'broadcast',
        method: 'thread-stream-state-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 11,
        params: {
          hostId: 'local',
          conversationId: sideThreadId,
          change: {
            type: 'patches',
            baseRevision: 1,
            revision: 2,
            patches: [{
              op: 'replace',
              path: ['threadRuntimeStatus'],
              value: { type: 'active', activeFlags: [] }
            }]
          }
        }
      })
      await vi.advanceTimersByTimeAsync(0)
      expect((await bridge.readActivitySnapshot()).value.entries
        .find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({ status: 'active' })

      await vi.advanceTimersByTimeAsync(3_100)

      expect((await bridge.readActivitySnapshot()).value.entries
        .find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({ status: 'active' })
      expect(native.privateBranchEvidence(parentThreadId)?.branches).toHaveLength(2)

      desktopSocket.push({
        type: 'broadcast',
        method: 'thread-stream-state-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 11,
        params: {
          hostId: 'local',
          conversationId: sideThreadId,
          change: {
            type: 'patches',
            baseRevision: 2,
            revision: 3,
            patches: [{
              op: 'replace',
              path: ['threadRuntimeStatus'],
              value: { type: 'idle', activeFlags: [] }
            }]
          }
        }
      })
      await vi.advanceTimersByTimeAsync(0)
      desktopSocket.push({
        type: 'broadcast',
        method: 'thread-stream-state-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 11,
        params: {
          hostId: 'local',
          conversationId: sideThreadId,
          change: {
            type: 'patches',
            baseRevision: 3,
            revision: 4,
            patches: [{
              op: 'replace',
              path: ['threadRuntimeStatus'],
              value: { type: 'active', activeFlags: [] }
            }]
          }
        }
      })
      await vi.advanceTimersByTimeAsync(3_100)

      expect(child.writes.filter((frame) => frame.method === 'thread/turns/list'
        && frame.params?.limit === 1
        && frame.params?.threadId === sideThreadId).length).toBeGreaterThanOrEqual(6)
      expect((await bridge.readActivitySnapshot()).value.entries
        .find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({
          status: 'idle',
          lastTurnStatus: 'completed'
        })
      expect(native.privateBranchEvidence(parentThreadId)?.branches).toHaveLength(1)
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('defers one Side Chat terminal while another branch remains active', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeCodexProcess()
      child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
      const desktopSocket = new FakeCodexDesktopSocket()
      const { bridge, native, publicPlatform } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await vi.advanceTimersByTimeAsync(0)
      const parent = baseline.value.threads[3]
      const terminalChildId = child.createdThreadId
      const activeChildId = 'b2345678-1234-4234-8234-123456789abc'
      child.inProgressTurnIds.add(activeChildId)

      const sideSnapshot = (conversationId: string) => ({
        type: 'broadcast',
        method: 'thread-stream-state-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 11,
        params: {
          hostId: 'local',
          conversationId,
          change: {
            type: 'snapshot',
            revision: 1,
            conversationState: {
              sideConversation: true,
              forkedFromId: FIXED_THREAD_IDS[3],
              threadRuntimeStatus: { type: 'active', activeFlags: [] },
              resumeState: '',
              hasUnreadTurn: false,
              requests: []
            }
          }
        }
      })
      desktopSocket.push(sideSnapshot(terminalChildId))
      desktopSocket.push(sideSnapshot(activeChildId))
      await vi.advanceTimersByTimeAsync(1_400)

      const activity = await bridge.readActivitySnapshot()
      expect(activity.value.entries.find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({
        status: 'active',
        lastTurnStatus: 'inProgress'
      })
      expect(activity.value.decisionDiagnostics).toMatchObject({
        branchTerminalDeferred: expect.any(Number),
        snapshotConflictSuppressed: expect.any(Number),
        staleTurnDiscarded: expect.any(Number)
      })
      expect(activity.value.decisionDiagnostics.branchTerminalDeferred).toBeGreaterThan(0)
      expect(JSON.stringify(activity.value.decisionDiagnostics)).not.toContain(terminalChildId)
      expect(JSON.stringify(activity.value.decisionDiagnostics)).not.toContain(activeChildId)
      const branchEvidence = native.privateBranchEvidence(FIXED_THREAD_IDS[3])
      const branches = branchEvidence?.branches || []
      expect(branches.filter((branch: Record<string, unknown>) => (
        branch.lastTurnStatus === 'completed'
        || branch.lastTurnStatus === 'interrupted'
        || branch.lastTurnStatus === 'failed'
      ))).toHaveLength(2)
      expect(branches).toContainEqual(expect.objectContaining({ lastTurnStatus: 'inProgress' }))
      expect(branches.every((branch: Record<string, unknown>) => /^[a-f0-9]{32}$/.test(String(branch.ref)))).toBe(true)
      expect(JSON.stringify(branchEvidence)).not.toContain(FIXED_THREAD_IDS[3])
      expect(JSON.stringify(branchEvidence)).not.toContain(terminalChildId)
      expect(JSON.stringify(branchEvidence)).not.toContain(activeChildId)
      expect(publicPlatform.companionKernel.publishCodexBranchEvidence).toBeUndefined()
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
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
      hasUnreadTurn: false,
      unreadAuthority: 'desktop-live'
    })
    expect(activity.value.entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[0].key))
      .not.toHaveProperty('desktopActiveSince')
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
    const archivePromise = bridge.archiveThread(completed.actionAlias, {
      expectedUpdatedAt: completed.updatedAt,
      expectedRevisionAt: completed.lastTurnCompletedAt,
      expectedCompletionAt: completed.lastTurnCompletedAt,
      expectedLastTurnStartedAt: completed.lastTurnStartedAt,
      expectedSourceFingerprint: baseline.value.sourceFingerprint,
      evidence: 'completed'
    })
    await vi.waitFor(() => expect(desktopSocket.writes).toContainEqual(expect.objectContaining({
      type: 'broadcast',
      method: 'thread-archived'
    })))
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-archived',
      sourceClientId: 'codex-desktop-owner',
      version: 2,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[3] }
    })
    const archiveResult = await archivePromise
    expect(archiveResult).toMatchObject({ outcome: 'archived', desktopSync: 'dispatched', nativeAck: 'acknowledged:desktop' })
    expect((await bridge.readActivitySnapshot()).value.entries.some((entry: Record<string, any>) => entry.key === completed.key)).toBe(false)
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
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      statusAuthority: 'desktop-live',
      unreadAuthority: 'desktop-live'
    })
    bridge.close()
  })

  it('keeps the task and alias when Desktop sync fails, then allows a verified retry', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.failArchiveBroadcast = true
    const context = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await vi.waitFor(async () => {
      expect((await context.bridge.readActivitySnapshot()).value.desktopBridgeState).toBe('connected')
    })
    const completed = baseline.value.threads[3]
    child.archiveThreadId = FIXED_THREAD_IDS[3]
    child.archiveThreadStatus = 'notLoaded'
    child.archiveThreadRecency = completed.updatedAt
    const request = {
      expectedUpdatedAt: completed.updatedAt,
      expectedRevisionAt: completed.lastTurnCompletedAt,
      expectedCompletionAt: completed.lastTurnCompletedAt,
      expectedLastTurnStartedAt: completed.lastTurnStartedAt,
      expectedSourceFingerprint: baseline.value.sourceFingerprint,
      evidence: 'completed'
    }

    await expect(context.bridge.archiveThread(completed.actionAlias, {
      ...request,
      operationId: 'archive-sync-failure-0001',
      source: 'archive-button'
    })).resolves.toMatchObject({
      outcome: 'indeterminate',
      operationId: 'archive-sync-failure-0001',
      errorCode: 'archive-desktop-sync-failed',
      message: expect.stringContaining('ure-0001')
    })
    expect((await context.bridge.readActivitySnapshot()).value.entries.some((entry: Record<string, any>) => entry.key === completed.key)).toBe(true)
    expect(context.notifications.at(-1)).toContain('ure-0001')
    expect(child.writes.filter((frame) => frame.method === 'thread/archive')).toHaveLength(1)
    const failedStages = context.diagnosticEvents.filter((event) => event.scope === 'archive-transaction'
      && event.operationId === 'archive-sync-failure-0001')
    expect(failedStages.map((event) => [event.event, event.outcome])).toEqual([
      ['archive-intent', 'started'],
      ['archive-confirmation-confirmed', 'confirmed'],
      ['archive-preflight', 'observed'],
      ['archive-preflight', 'verified'],
      ['archive-provider-write', 'completed'],
      ['archive-server-verify-1', 'verified'],
      ['archive-desktop-sync', 'indeterminate'],
      ['archive-local-retained', 'indeterminate'],
      ['archive-reconciliation', 'retained']
    ])
    expect(failedStages.every((event) => event.provider === 'codex'
      && /^h:[0-9a-f]{16}$/.test(String(event.taskRef || ''))
      && event.source === 'archive-button')).toBe(true)
    expect(failedStages.filter((event) => event.event === 'archive-intent')).toHaveLength(1)
    expect(failedStages.filter((event) => event.event === 'archive-confirmation-confirmed')).toHaveLength(1)
    expect(failedStages.find((event) => event.event === 'archive-desktop-sync')).toMatchObject({
      level: 'error',
      code: 'archive-desktop-sync-failed'
    })

    desktopSocket.failArchiveBroadcast = false
    const retry = context.bridge.archiveThread(completed.actionAlias, {
      ...request,
      operationId: 'archive-sync-retry-0002',
      source: 'archive-button'
    })
    await vi.waitFor(() => expect(desktopSocket.writes.filter((message) => message.method === 'thread-archived')).toHaveLength(2))
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-archived',
      sourceClientId: 'codex-desktop-owner',
      version: 2,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[3] }
    })
    await expect(retry).resolves.toMatchObject({
      outcome: 'archived',
      operationId: 'archive-sync-retry-0002',
      nativeAck: 'acknowledged:desktop'
    })
    expect(child.writes.filter((frame) => frame.method === 'thread/archive')).toHaveLength(2)
    expect((await context.bridge.readActivitySnapshot()).value.entries.some((entry: Record<string, any>) => entry.key === completed.key)).toBe(false)
    const successfulStages = context.diagnosticEvents.filter((event) => event.scope === 'archive-transaction'
      && event.operationId === 'archive-sync-retry-0002')
    expect(successfulStages.map((event) => event.event)).toEqual(expect.arrayContaining([
      'archive-intent',
      'archive-confirmation-confirmed',
      'archive-preflight',
      'archive-provider-write',
      'archive-server-verify-1',
      'archive-desktop-sync',
      'archive-native-ack',
      'archive-server-verify-2',
      'archive-kernel-commit',
      'archive-ui-removal',
      'archive-reconciliation'
    ]))
    expect(successfulStages.filter((event) => event.event === 'archive-intent')).toHaveLength(1)
    expect(successfulStages.filter((event) => event.event === 'archive-confirmation-confirmed')).toHaveLength(1)
    expect(successfulStages.every((event) => event.operationId === 'archive-sync-retry-0002')).toBe(true)
    context.bridge.close()
  })

  it('keeps the task when the delayed second server verification contradicts the first', async () => {
    const child = new FakeCodexProcess()
    child.revertArchiveOnArchivedListRead = 2
    const context = loadCodexBridge(child)
    const baseline = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const completed = baseline.value.threads[3]
    child.archiveThreadId = FIXED_THREAD_IDS[3]
    child.archiveThreadStatus = 'notLoaded'
    child.archiveThreadRecency = completed.updatedAt

    await expect(context.bridge.archiveThread(completed.actionAlias, {
      expectedUpdatedAt: completed.updatedAt,
      expectedRevisionAt: completed.lastTurnCompletedAt,
      expectedCompletionAt: completed.lastTurnCompletedAt,
      expectedLastTurnStartedAt: completed.lastTurnStartedAt,
      expectedSourceFingerprint: baseline.value.sourceFingerprint,
      evidence: 'completed',
      operationId: 'archive-verify-two-0003',
      source: 'archive-button'
    })).resolves.toMatchObject({
      outcome: 'indeterminate',
      operationId: 'archive-verify-two-0003',
      errorCode: 'archive-verify-2-failed',
      message: expect.stringContaining('two-0003')
    })
    expect(child.archivedListReadCount).toBe(2)
    expect(child.writes.filter((frame) => frame.method === 'thread/archive')).toHaveLength(1)
    expect((await context.bridge.readActivitySnapshot()).value.entries.some((entry: Record<string, any>) => entry.key === completed.key)).toBe(true)
    expect(context.notifications.at(-1)).toContain('two-0003')
    context.bridge.close()
  })

  it('keeps the task when Desktop receives the sync broadcast but never emits a native archive ACK', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const context = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const completed = baseline.value.threads[3]
    seedSingleCodexKernelTask(context, baseline, completed)
    context.triggerPluginEnter(null)
    await vi.waitFor(() => expect(context.codexMembershipWatcherCount('archived_sessions')).toBe(1))
    await vi.waitFor(() => expect(context.native.companionHostReconciliationPending()).toBe(false))
    await vi.waitFor(async () => {
      expect((await context.bridge.readActivitySnapshot()).value.desktopBridgeState).toBe('connected')
    })
    child.archiveThreadId = FIXED_THREAD_IDS[3]
    child.archiveThreadStatus = 'notLoaded'
    child.archiveThreadRecency = completed.updatedAt

    const archivePromise = context.bridge.archiveThread(completed.actionAlias, {
      expectedUpdatedAt: completed.updatedAt,
      expectedRevisionAt: completed.lastTurnCompletedAt,
      expectedCompletionAt: completed.lastTurnCompletedAt,
      expectedLastTurnStartedAt: completed.lastTurnStartedAt,
      expectedSourceFingerprint: baseline.value.sourceFingerprint,
      evidence: 'completed',
      operationId: 'archive-native-timeout-0004',
      source: 'archive-button'
    })
    await vi.waitFor(() => expect(desktopSocket.writes).toContainEqual(expect.objectContaining({
      type: 'broadcast',
      method: 'thread-archived'
    })))
    const archivedReadsBeforeRecovery = child.archivedListReadCount
    context.triggerCodexMembershipChange('archived_sessions')
    await vi.waitFor(() => expect(child.archivedListReadCount).toBeGreaterThan(archivedReadsBeforeRecovery))
    expect((await context.bridge.readActivitySnapshot()).value.entries.some((entry: Record<string, any>) => entry.key === completed.key)).toBe(true)

    await expect(archivePromise).resolves.toMatchObject({
      outcome: 'indeterminate',
      operationId: 'archive-native-timeout-0004',
      errorCode: 'archive-native-ack-timeout',
      message: expect.stringContaining('out-0004')
    })
    expect(desktopSocket.writes).toContainEqual(expect.objectContaining({ type: 'broadcast', method: 'thread-archived' }))
    expect(child.writes.filter((frame) => frame.method === 'thread/archive')).toHaveLength(1)
    expect((await context.bridge.readActivitySnapshot()).value.entries.some((entry: Record<string, any>) => entry.key === completed.key)).toBe(true)
    expect(context.notifications.at(-1)).toContain('out-0004')
    context.bridge.close()
  }, 10_000)

  it('retains sticky input and Plan requests across owner loss but drops ordinary active state and accepts newer evidence', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.waitingInputSnapshotThreadIds.clear()
    desktopSocket.waitingInputSnapshotThreadIds.add(FIXED_THREAD_IDS[4])
    desktopSocket.planImplementationSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
    desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[1])
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    desktopSocket.streamOwnerConnected = false
    desktopSocket.push({
      type: 'broadcast',
      method: 'client-status-changed',
      sourceClientId: 'desktop-broker',
      version: 0,
      params: { clientId: 'codex-desktop-owner', status: 'disconnected' }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const afterDisconnect = await bridge.readActivitySnapshot()
    const byKey = new Map(afterDisconnect.value.entries.map((entry: Record<string, any>) => [entry.key, entry]))
    expect(byKey.get(baseline.value.threads[4].key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      statusAuthority: 'desktop-live'
    })
    expect(byKey.get(baseline.value.threads[3].key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      planImplementationOnly: true,
      statusAuthority: 'desktop-live'
    })
    expect(byKey.get(baseline.value.threads[1].key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      statusAuthority: 'connector'
    })

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner-2',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[4],
        change: {
          type: 'snapshot',
          revision: 1,
          conversationState: {
            threadRuntimeStatus: { type: 'idle', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: false,
            requests: []
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[4].key)).toMatchObject({
      status: 'idle',
      activeFlags: [],
      statusAuthority: 'desktop-live'
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: { threadId: FIXED_THREAD_IDS[3], turn: { status: 'inProgress', startedAt: 2_100_000_000 } }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === baseline.value.threads[3].key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      planImplementationOnly: false,
      statusAuthority: 'app-server-live'
    })
    bridge.close()
  })

  it('clears a current-owner waiting instance on newer running evidence and blocks stale replay until a new request instance arrives', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[0]
    const streamState = (change: Record<string, any>) => desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[0], change }
    })
    const oldRequest = { type: 'userInput', method: 'requestUserInput', requestId: 'old-waiting-instance' }

    streamState({
      type: 'patches',
      baseRevision: 1,
      revision: 2,
      patches: [{ op: 'replace', path: ['requests'], value: [oldRequest] }]
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      statusAuthority: 'desktop-live'
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: FIXED_THREAD_IDS[0],
        turn: { status: 'inProgress', startedAt: 2_100_000_000 }
      }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      planImplementationOnly: false,
      lastTurnStatus: 'inProgress'
    })

    streamState({
      type: 'patches',
      baseRevision: 2,
      revision: 3,
      patches: [{ op: 'replace', path: ['hasUnreadTurn'], value: true }]
    })
    streamState({
      type: 'snapshot',
      revision: 4,
      conversationState: {
        threadRuntimeStatus: { type: 'active', activeFlags: [] },
        resumeState: '',
        hasUnreadTurn: true,
        requests: [oldRequest]
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: []
    })

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-following-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 1,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[0], following: false }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: []
    })

    const newRequest = { type: 'approval', method: 'requestApproval', requestId: 'new-waiting-instance' }
    streamState({
      type: 'patches',
      baseRevision: 1,
      revision: 2,
      patches: [{ op: 'replace', path: ['requests'], value: [newRequest] }]
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnApproval'],
      statusAuthority: 'desktop-live'
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'thread/status/changed',
      params: { threadId: FIXED_THREAD_IDS[0], status: { type: 'active', activeFlags: [] } }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    streamState({
      type: 'snapshot',
      revision: 3,
      conversationState: {
        threadRuntimeStatus: { type: 'active', activeFlags: [] },
        resumeState: '',
        hasUnreadTurn: true,
        requests: [newRequest]
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: []
    })
    bridge.close()
  })

  it('clears leftover plan and question requests once Desktop runtime resumes plain-active, but keeps a first-observation wait', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.waitingInputSnapshotThreadIds.clear()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const planTask = baseline.value.threads[1]
    const questionTask = baseline.value.threads[2]
    const firstWaitTask = baseline.value.threads[3]
    const streamState = (threadId: string, change: Record<string, any>) => desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: { hostId: 'local', conversationId: threadId, change }
    })
    const planRequest = { type: 'plan', method: 'item/plan/requestImplementation', requestId: 'leftover-plan-request' }
    const questionRequest = { type: 'userInput', method: 'requestUserInput', requestId: 'leftover-question-request' }
    const firstWaitRequest = { type: 'userInput', method: 'requestUserInput', requestId: 'first-wait-request' }

    streamState(FIXED_THREAD_IDS[1], {
      type: 'snapshot',
      revision: 1,
      conversationState: {
        threadRuntimeStatus: { type: 'idle', activeFlags: [] },
        resumeState: '',
        hasUnreadTurn: false,
        requests: [planRequest]
      }
    })
    streamState(FIXED_THREAD_IDS[2], {
      type: 'patches',
      baseRevision: 1,
      revision: 2,
      patches: [
        { op: 'replace', path: ['threadRuntimeStatus'], value: { type: 'active', activeFlags: ['waitingOnUserInput'] } },
        { op: 'replace', path: ['requests'], value: [questionRequest] }
      ]
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === planTask.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      planImplementationOnly: true
    })
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === questionTask.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput']
    })

    streamState(FIXED_THREAD_IDS[1], {
      type: 'patches',
      baseRevision: 1,
      revision: 2,
      patches: [{ op: 'replace', path: ['threadRuntimeStatus'], value: { type: 'active', activeFlags: [] } }]
    })
    streamState(FIXED_THREAD_IDS[2], {
      type: 'snapshot',
      revision: 3,
      conversationState: {
        threadRuntimeStatus: { type: 'active', activeFlags: [] },
        resumeState: '',
        hasUnreadTurn: false,
        requests: [questionRequest]
      }
    })
    streamState(FIXED_THREAD_IDS[3], {
      type: 'snapshot',
      revision: 1,
      conversationState: {
        threadRuntimeStatus: { type: 'active', activeFlags: [] },
        resumeState: '',
        hasUnreadTurn: false,
        requests: [firstWaitRequest]
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === planTask.key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      planImplementationOnly: false
    })
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === questionTask.key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      planImplementationOnly: false
    })
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === firstWaitTask.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput']
    })
    bridge.close()
  })

  it('uses serverRequest/resolved to clear only the matching request and conservatively resubscribes when correlation is missing', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.waitingInputSnapshotThreadIds.clear()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[1]
    const requests = [
      { type: 'userInput', method: 'requestUserInput', requestId: 'input-request' },
      { type: 'permissions', method: 'item/permissions/requestApproval', requestId: 'approval-request' }
    ]
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[1],
        change: {
          type: 'snapshot',
          revision: 2,
          conversationState: {
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: false,
            requests
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      activeFlags: ['waitingOnUserInput', 'waitingOnApproval']
    })

    desktopSocket.streamOwnerConnected = false
    child.stdout.emit('data', `${JSON.stringify({
      method: 'serverRequest/resolved',
      params: { threadId: FIXED_THREAD_IDS[1], requestId: 'unmatched-request' }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const unmatched = await bridge.readActivitySnapshot()
    expect(unmatched.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      activeFlags: ['waitingOnUserInput', 'waitingOnApproval']
    })
    expect(unmatched.value.decisionDiagnostics.waitingEdgeResubscribe).toBeGreaterThan(0)

    child.stdout.emit('data', `${JSON.stringify({
      method: 'serverRequest/resolved',
      params: { threadId: FIXED_THREAD_IDS[1], requestId: 'input-request' }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnApproval']
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'serverRequest/resolved',
      params: { threadId: FIXED_THREAD_IDS[1], requestId: 'approval-request' }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const resolved = await bridge.readActivitySnapshot()
    expect(resolved.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: []
    })
    expect(JSON.stringify(resolved)).not.toContain('input-request')
    expect(JSON.stringify(resolved)).not.toContain('approval-request')
    bridge.close()
  })

  it('records runtime waiting-flag removal as a causal barrier against stale full snapshots', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.waitingInputSnapshotThreadIds.clear()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[1]
    const push = (change: Record<string, any>) => desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[1], change }
    })

    push({
      type: 'snapshot',
      revision: 2,
      conversationState: {
        threadRuntimeStatus: { type: 'active', activeFlags: ['waitingOnApproval'] },
        resumeState: '',
        hasUnreadTurn: false,
        requests: []
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      activeFlags: ['waitingOnApproval']
    })

    push({
      type: 'patches',
      baseRevision: 2,
      revision: 3,
      patches: [{ op: 'replace', path: ['threadRuntimeStatus', 'activeFlags'], value: [] }]
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: []
    })

    push({
      type: 'snapshot',
      revision: 4,
      conversationState: {
        threadRuntimeStatus: { type: 'active', activeFlags: ['waitingOnApproval'] },
        resumeState: '',
        hasUnreadTurn: false,
        requests: []
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      activeFlags: []
    })
    bridge.close()
  })

  it('applies the same waiting-clear barrier to a Side Chat turn and rejects its stale request snapshot', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.waitingInputSnapshotThreadIds.clear()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const parent = baseline.value.threads[1]
    const sideThreadId = 'a2345678-1234-4234-8234-123456789abc'
    const sideRequest = { type: 'plan', method: 'item/plan/requestImplementation', requestId: 'side-plan-request' }
    const pushSideSnapshot = (revision: number) => desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: sideThreadId,
        change: {
          type: 'snapshot',
          revision,
          conversationState: {
            sideConversation: true,
            forkedFromId: FIXED_THREAD_IDS[1],
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            resumeState: '',
            hasUnreadTurn: false,
            requests: [sideRequest]
          }
        }
      }
    })
    pushSideSnapshot(1)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({
      activeFlags: ['waitingOnUserInput'],
      planImplementationOnly: true
    })

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: { threadId: sideThreadId, turn: { status: 'inProgress', startedAt: 2_100_000_000 } }
    })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    pushSideSnapshot(2)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === parent.key)).toMatchObject({
      status: 'active',
      activeFlags: [],
      planImplementationOnly: false,
      lastTurnStatus: 'inProgress'
    })
    bridge.close()
  })

  it('bounds a revision-gap resubscribe to 1.25s without guessing or scanning full inventory', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_100_000_000_000)
    try {
      const child = new FakeCodexProcess()
      const desktopSocket = new FakeCodexDesktopSocket()
      const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket, true)
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await vi.advanceTimersByTimeAsync(0)
      const task = baseline.value.threads[0]
      const inventoryReads = child.writes.filter((frame) => frame.method === 'thread/list').length
      const followWrites = () => desktopSocket.writes.filter((frame) =>
        frame.method === 'thread-stream-following-changed'
        && frame.params?.conversationId === FIXED_THREAD_IDS[0]
      ).length
      const followsBeforeGap = followWrites()

      desktopSocket.streamOwnerConnected = false
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
            baseRevision: 99,
            revision: 100,
            patches: [{ op: 'replace', path: ['requests'], value: [] }]
          }
        }
      })
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1_249)

      const conservative = await bridge.readActivitySnapshot({ phaseOnly: true })
      expect(conservative.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'active',
        activeFlags: ['waitingOnUserInput']
      })
      expect(child.writes.filter((frame) => frame.method === 'thread/list')).toHaveLength(inventoryReads)

      await vi.advanceTimersByTimeAsync(1)
      const expired = await bridge.readActivitySnapshot({ phaseOnly: true })
      expect(expired.value.decisionDiagnostics).toMatchObject({
        waitingEdgeResubscribe: 1,
        waitingEdgeRecoveryExpired: 1
      })
      expect(followWrites() - followsBeforeGap).toBeLessThanOrEqual(12)
      expect(child.writes.filter((frame) => frame.method === 'thread/list')).toHaveLength(inventoryReads)
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels a revision-gap resubscribe as soon as exact App Server evidence arrives', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_100_000_000_000)
    try {
      const child = new FakeCodexProcess()
      const desktopSocket = new FakeCodexDesktopSocket()
      const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket, true)
      const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
      await vi.advanceTimersByTimeAsync(0)
      const task = baseline.value.threads[0]
      const followWrites = () => desktopSocket.writes.filter((frame) =>
        frame.method === 'thread-stream-following-changed'
        && frame.params?.conversationId === FIXED_THREAD_IDS[0]
      ).length

      desktopSocket.streamOwnerConnected = false
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
            baseRevision: 99,
            revision: 100,
            patches: [{ op: 'replace', path: ['requests'], value: [] }]
          }
        }
      })
      await vi.advanceTimersByTimeAsync(300)

      child.stdout.emit('data', `${JSON.stringify({
        method: 'turn/started',
        params: {
          threadId: FIXED_THREAD_IDS[0],
          turn: { status: 'inProgress', startedAt: 2_100_000_100 }
        }
      })}\n`)
      await Promise.resolve()
      const followsAfterEvidence = followWrites()
      await vi.advanceTimersByTimeAsync(1_250)

      const current = await bridge.readActivitySnapshot({ phaseOnly: true })
      expect(current.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
        status: 'active',
        activeFlags: [],
        statusAuthority: 'app-server-live'
      })
      expect(current.value.decisionDiagnostics).toMatchObject({
        waitingEdgeResubscribe: 1,
        waitingEdgeRecoveryExpired: 0
      })
      expect(followWrites()).toBe(followsAfterEvidence)
      bridge.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps App Server aliases and Desktop observation hot across a non-kill pluginOut', async () => {
    const child = new FakeCodexProcess(false, false)
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.planImplementationSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
    const { bridge, spawn, triggerPluginOut } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const planTask = baseline.value.threads[3]
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === planTask.key)).toMatchObject({
      activeFlags: ['waitingOnUserInput'],
      planImplementationOnly: true,
      statusAuthority: 'desktop-live'
    })
    const unfollowsBefore = desktopSocket.writes.filter((message) => message.method === 'thread-stream-following-changed' && message.params?.following === false).length

    triggerPluginOut(false)
    expect(child.endCalls).toBe(0)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(desktopSocket.writable).toBe(true)
    expect(desktopSocket.writes.filter((message) => message.method === 'thread-stream-following-changed' && message.params?.following === false)).toHaveLength(unfollowsBefore)
    const inventoryReadsBeforeOpen = child.writes.filter((frame) => frame.method === 'thread/list' || frame.method === 'thread/turns/list').length
    await expect(bridge.openThread(planTask.actionAlias)).resolves.toMatchObject({ outcome: 'dispatched' })
    expect(child.writes.filter((frame) => frame.method === 'thread/list' || frame.method === 'thread/turns/list')).toHaveLength(inventoryReadsBeforeOpen)

    const reopened = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(reopened.value.threads.find((thread: Record<string, any>) => thread.key === planTask.key)).toMatchObject({
      status: 'active',
      activeFlags: ['waitingOnUserInput'],
      planImplementationOnly: true,
      statusAuthority: 'desktop-live'
    })

    triggerPluginOut(true)
    expect(child.endCalls).toBe(1)
    expect(desktopSocket.writable).toBe(false)
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
    expect(switchedEntries).toEqual([])
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'idle',
      statusAuthority: 'desktop-live',
      lastTurnStatus: 'interrupted'
    })
    stop()
    bridge.close()
  })

  it('re-announces follow only for an explicit status request, never a peer follow announcement', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const positiveFollowsBefore = desktopSocket.writes.filter((message) => (
      message.method === 'thread-stream-following-changed'
      && message.params?.conversationId === FIXED_THREAD_IDS[0]
      && message.params?.following === true
    )).length
    expect(positiveFollowsBefore).toBeGreaterThan(0)

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-following-status-requested',
      sourceClientId: 'codex-desktop-owner',
      targetClientIds: ['eypc-test-client'],
      version: 1,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[0] }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const positiveFollowsAfterRequest = desktopSocket.writes.filter((message) => (
      message.method === 'thread-stream-following-changed'
      && message.params?.conversationId === FIXED_THREAD_IDS[0]
      && message.params?.following === true
    ))
    expect(positiveFollowsAfterRequest).toHaveLength(positiveFollowsBefore + 1)
    expect(positiveFollowsAfterRequest.at(-1)?.targetClientIds).toEqual(['codex-desktop-owner'])

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-following-changed',
      sourceClientId: 'codex-peer-follower',
      targetClientIds: ['eypc-test-client'],
      version: 1,
      params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[0], following: true }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(desktopSocket.writes.filter((message) => (
      message.method === 'thread-stream-following-changed'
      && message.params?.conversationId === FIXED_THREAD_IDS[0]
      && message.params?.following === true
    ))).toHaveLength(positiveFollowsBefore + 1)
    bridge.close()
  })

  it('lets a fresh App Server active event outrank an older interrupted Desktop idle event across read-state and inventory replay', async () => {
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

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[3],
        change: {
          type: 'patches',
          baseRevision: 1,
          revision: 2,
          patches: [{ op: 'replace', path: ['threadRuntimeStatus', 'type'], value: 'idle' }]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

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
    const latestTurnReadsBeforeUnread = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[3],
        change: {
          type: 'patches',
          baseRevision: 2,
          revision: 3,
          patches: [{ op: 'replace', path: ['hasUnreadTurn'], value: true }]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress'
    })
    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1)).toHaveLength(latestTurnReadsBeforeUnread)

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
    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1)).toHaveLength(latestTurnReadsBeforeUnread)

    for (let scan = 0; scan < 2; scan += 1) {
      expect((await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })).value.threads
        .find((thread: Record<string, any>) => thread.key === task.key)).toMatchObject({
        status: 'active',
        statusAuthority: 'app-server-live',
        lastTurnStatus: 'inProgress'
      })
    }

    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[3],
        change: {
          type: 'patches',
          baseRevision: 1,
          revision: 2,
          patches: [{ op: 'replace', path: ['threadRuntimeStatus', 'type'], value: 'idle' }]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
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

  it('does not let an in-flight stale-active reader revoke a newer exact positive epoch', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[3])
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    child.interruptedTurnIds.delete(FIXED_THREAD_IDS[3])
    child.inProgressTurnIds.add(FIXED_THREAD_IDS[3])
    child.holdNextLatestTurnRead = true
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[3],
        change: {
          type: 'snapshot',
          revision: 2,
          conversationState: {
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            requests: [],
            hasUnreadTurn: false
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[3]
    expect(child.heldLatestTurnReads).toHaveLength(1)

    child.stdout.emit('data', `${JSON.stringify({
      method: 'turn/started',
      params: {
        threadId: FIXED_THREAD_IDS[3],
        turn: { status: 'inProgress', startedAt: 1_900_000_100 }
      }
    })}\n`)
    await Promise.resolve()
    child.releaseHeldLatestTurnReads()
    await Promise.resolve()
    await Promise.resolve()

    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'active',
      statusAuthority: 'app-server-live',
      lastTurnStatus: 'inProgress',
      lastTurnStartedAt: 1_900_000_100_000,
      lastTurnEvidence: 'turn-started'
    })
    bridge.close()
  })

  it('replaces an in-flight stale-active verification with the active-exit terminal read', async () => {
    const child = new FakeCodexProcess()
    child.interruptedTurnIds.add(FIXED_THREAD_IDS[1])
    const desktopSocket = new FakeCodexDesktopSocket()
    desktopSocket.activeSnapshotThreadIds.add(FIXED_THREAD_IDS[1])
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    const baseline = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const task = baseline.value.threads[1]

    child.interruptedTurnIds.delete(FIXED_THREAD_IDS[1])
    child.inProgressTurnIds.add(FIXED_THREAD_IDS[1])
    child.holdNextLatestTurnRead = true
    desktopSocket.push({
      type: 'broadcast',
      method: 'thread-stream-state-changed',
      sourceClientId: 'codex-desktop-owner',
      version: 11,
      params: {
        hostId: 'local',
        conversationId: FIXED_THREAD_IDS[1],
        change: {
          type: 'snapshot',
          revision: 2,
          conversationState: {
            threadRuntimeStatus: { type: 'active', activeFlags: [] },
            requests: [],
            hasUnreadTurn: false
          }
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(child.heldLatestTurnReads).toHaveLength(1)
    expect(child.heldLatestTurnReads[0]?.params).toMatchObject({ threadId: FIXED_THREAD_IDS[1], limit: 1 })
    const statusReadsWithHeldVerification = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1).length

    child.inProgressTurnIds.delete(FIXED_THREAD_IDS[1])
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
          baseRevision: 2,
          revision: 3,
          patches: [
            { op: 'replace', path: ['threadRuntimeStatus', 'type'], value: 'idle' },
            { op: 'replace', path: ['requests'], value: [] }
          ]
        }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const settledAfterExit = (await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)
    expect(settledAfterExit).toMatchObject({
      status: 'idle',
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'targeted-after-exit'
    })
    expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.limit === 1)).toHaveLength(statusReadsWithHeldVerification + 1)

    child.releaseHeldLatestTurnReads()
    await Promise.resolve()
    await Promise.resolve()
    expect((await bridge.readActivitySnapshot()).value.entries.find((entry: Record<string, any>) => entry.key === task.key)).toMatchObject({
      status: 'idle',
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'targeted-after-exit'
    })
    bridge.close()
  })

  it('keeps a conflicting terminal active snapshot ongoing after bounded Turn rereads and restores a real new Turn', async () => {
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
        status: 'notLoaded',
        statusAuthority: 'desktop-live',
        lastTurnStatus: 'interrupted'
      })
      expect(settled.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).not.toHaveProperty('desktopActiveSince')
      const statusReadsAfterSettle = child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.threadId === FIXED_THREAD_IDS[3]).length
      expect(statusReadsAfterSettle).toBeGreaterThanOrEqual(5)

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
        statusAuthority: 'app-server-live',
        lastTurnStatus: 'inProgress',
        lastTurnStartedAt: 1_900_000_100_000
      })
      expect(resumed.value.entries.find((entry: Record<string, any>) => entry.key === task.key)).not.toHaveProperty('desktopActiveSince')
      await vi.advanceTimersByTimeAsync(0)
      expect(child.writes.filter((frame) => frame.method === 'thread/turns/list' && frame.params?.threadId === FIXED_THREAD_IDS[3])).toHaveLength(statusReadsAfterSettle)
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
        statusAuthority: 'app-server-live',
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

  it('turns 1,000 identical Desktop read-state broadcasts into zero Host/IPC semantic publications', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const context = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    await context.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const before = await context.bridge.readActivitySnapshot()
    const target = before.value.entries.find((entry: Record<string, any>) => entry.hasUnreadTurn === false)
    expect(target).toBeTruthy()
    const deltas: Array<Record<string, any>> = []
    const stop = context.bridge.onActivityChanged((delta) => deltas.push(delta))
    const packageRevision = context.platform.companionKernel.getLatest().packageRevision

    for (let index = 0; index < 1_000; index += 1) {
      desktopSocket.push({
        type: 'broadcast',
        method: 'thread-read-state-changed',
        sourceClientId: 'codex-desktop-owner',
        version: 2,
        params: { hostId: 'local', conversationId: FIXED_THREAD_IDS[2], hasUnreadTurn: false }
      })
    }
    await new Promise((resolve) => setTimeout(resolve, 0))

    const after = await context.bridge.readActivitySnapshot()
    expect(after.value.generation).toBe(before.value.generation)
    expect(deltas).toEqual([])
    expect(context.platform.companionKernel.getLatest().packageRevision).toBe(packageRevision)
    stop()
    context.triggerPluginOut(true)
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

  it('preserves a real activity-event time when an equivalent snapshot replaces its live shadow', async () => {
    const child = new FakeCodexProcess()
    const desktopSocket = new FakeCodexDesktopSocket()
    const { bridge } = loadCodexBridge(child, () => nativeRegistryText(), desktopSocket)
    await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

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
          patches: [{ op: 'replace', path: ['threadRuntimeStatus', 'activeFlags'], value: ['waitingOnApproval'] }]
        }
      }
    })
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
            threadRuntimeStatus: { type: 'active', activeFlags: ['waitingOnApproval'] },
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
        if (name === './runtime-identity.cjs') return TEST_RUNTIME_IDENTITY
        if (name === './companion/task-kernel.cjs') return nodeRequire(resolve(process.cwd(), 'preload/companion/task-kernel.cjs'))
        if (name === './companion/persisted-side-state.cjs') return nodeRequire(resolve(process.cwd(), 'preload/companion/persisted-side-state.cjs'))
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
        // The entry loads its own module groups by relative path; this shim stands
        // in for the module system, so it resolves those from `preload/` the way
        // the real one does. Naming each module here would mean every future
        // extraction breaks the run before anyone notices.
        if (name.startsWith('.')) return nodeRequire(resolve(process.cwd(), 'preload', name))
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(`${preload}\nwindow.__codexTestState = { codexThreadActions };`, sandbox, { filename: 'preload.js' })
    const platform = (sandbox.window as { eypcPlatform: Record<string, any> }).eypcPlatform
    handshakeTestRuntime(platform)
    const bridge = platform.codex as {
      readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>>
      openThread(alias: string): Promise<Record<string, unknown>>
      archiveThread(alias: string, request: Record<string, unknown>): Promise<Record<string, unknown>>
      close(): void
    }
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
    // 'ps' is the CodexHost lane's rendezvous probe (codexhost-discovery); in
    // this sandbox no Host Runtime exists, so the lane stops after one probe.
    expect(execFile.mock.calls.map((call) => call[0])).toEqual(['/usr/sbin/scutil', '/usr/bin/curl', 'ps'])
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
    await expect(bridge.openThread(alias)).resolves.toMatchObject({ outcome: 'dispatched' })
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
    await expect(bridge.archiveThread(unknownAlias, {
      expectedUpdatedAt: result.value.threads[4].updatedAt,
      expectedRevisionAt: result.value.threads[4].lastTurnStartedAt,
      expectedLastTurnStartedAt: result.value.threads[4].lastTurnStartedAt,
      expectedSourceFingerprint: result.value.sourceFingerprint,
      evidence: 'stopped'
    })).resolves.toMatchObject({ outcome: 'failed', errorCode: 'state-changed' })

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
    expect(archiveResult).toMatchObject({ outcome: 'archived', desktopSync: 'not-running', nativeAck: 'not-required' })
    expect(JSON.stringify(archiveResult)).not.toContain('private archive')
    const archiveRereads = child.writes.filter((frame) => frame.method === 'thread/read')
    expect(archiveRereads).toHaveLength(6)
    expect(archiveRereads.filter((frame) => frame.params?.threadId === '42345678-1234-4234-8234-123456789abc')).toHaveLength(5)
    expect(archiveRereads.every((frame) => frame.params?.includeTurns === false)).toBe(true)
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
    // archiveCodexThread/archiveCodexProject's thread/read calls moved into
    // preload/codex/archive-bridge.cjs under RAW-169; scanning the whole
    // module group keeps these assertions accurate as further blocks move out.
    const reachableForRpcAssertions = preload + '\n' + readdirSync(resolve(process.cwd(), 'preload/codex'))
      .filter((name) => name.endsWith('.cjs'))
      .map((name) => readFileSync(resolve(process.cwd(), 'preload/codex', name), 'utf8'))
      .join('\n')
    expect(reachableForRpcAssertions.match(/requestCodexRpc\('thread\/read'/g)?.length || 0).toBeGreaterThanOrEqual(3)
    expect(reachableForRpcAssertions).toContain("requestCodexRpc('thread/read', { threadId: entry.threadId, includeTurns: false })")
    expect(reachableForRpcAssertions).toContain('closeable: false')
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

    expect(preload).toContain('removeProject: (...args) => runtimeIdentityCompatible ? removeCodexProject(...args)')
    // The running-process check ('Codex'/'ChatGPT' executable probing) moved
    // into preload/codex/desktop-process-probe.cjs under RAW-169's route-1
    // extraction; the entry now only holds a delegate stub.
    const desktopProcessProbe = readFileSync(resolve(process.cwd(), 'preload/codex/desktop-process-probe.cjs'), 'utf8')
    expect(desktopProcessProbe).toContain("for (const executable of ['Codex', 'ChatGPT'])")
    expect(desktopProcessProbe).toContain('(?:ChatGPT|Codex)\\.exe')
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

  it('reads all three 100-row inventory pages without a product cap, then fails closed on malformed Turns or cursor loops', async () => {
    const child = new FakeCodexProcess()
    child.bulkInventoryCount = 240
    child.inventoryPageSize = 100
    const { bridge } = loadCodexBridge(child)
    const listCalls = () => child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === false)

    const complete = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(complete).toMatchObject({ ok: true, value: { version: 2, completeness: 'verified', rawSourceCount: 240, eligibleSourceCount: 240, nonConversationCount: 0 } })
    expect(complete.value.threads).toHaveLength(240)
    expect(listCalls()).toHaveLength(3)
    expect(listCalls().map((frame) => frame.params?.cursor || '')).toEqual(['', 'offset:100', 'offset:200'])
    for (const index of [40, 100, 200]) {
      expect(complete.value.threads[index]).toMatchObject({
        name: `批量任务 ${index + 1}`,
        actionAlias: expect.stringMatching(/^ct_/),
        projectKey: 'chats',
        lastTurnStatus: 'completed'
      })
    }

    child.writes.length = 0
    child.bulkInventoryCount = 25
    child.inventoryPageSize = 7

    child.emptyTurnIds.add('00000019-1234-4234-8234-123456789abc')
    const withoutEmptyConversation = await bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    expect(withoutEmptyConversation).toMatchObject({ ok: true, value: { rawSourceCount: 25, eligibleSourceCount: 25, nonConversationCount: 1 } })
    expect(withoutEmptyConversation.value.threads).toHaveLength(24)
    expect(listCalls()).toHaveLength(4)
    expect(listCalls().map((frame) => frame.params?.cursor || '')).toEqual(['', 'offset:7', 'offset:14', 'offset:21'])

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

  it('archives an exactly revalidated stopped task and rejects the same request after it resumes', async () => {
    const stoppedChild = new FakeCodexProcess()
    stoppedChild.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const stopped = loadCodexBridge(stoppedChild)
    const stoppedSnapshot = await stopped.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const stoppedTask = stoppedSnapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')
    const request = {
      expectedUpdatedAt: stoppedTask.updatedAt,
      expectedRevisionAt: stoppedTask.lastTurnStartedAt,
      expectedLastTurnStartedAt: stoppedTask.lastTurnStartedAt,
      expectedSourceFingerprint: stoppedSnapshot.value.sourceFingerprint,
      evidence: 'stopped'
    }

    await expect(stopped.bridge.archiveThread(stoppedTask.actionAlias, request)).resolves.toMatchObject({
      outcome: 'archived',
      desktopSync: 'not-running'
    })
    const exactReadIndex = stoppedChild.writes.findIndex((frame) => frame.method === 'thread/read' && frame.params?.threadId === FIXED_THREAD_IDS[3])
    const latestTurnIndex = stoppedChild.writes.findIndex((frame) => frame.method === 'thread/turns/list' && frame.params?.threadId === FIXED_THREAD_IDS[3] && frame.params?.limit === 1)
    const archiveIndex = stoppedChild.writes.findIndex((frame) => frame.method === 'thread/archive' && frame.params?.threadId === FIXED_THREAD_IDS[3])
    expect(exactReadIndex).toBeGreaterThanOrEqual(0)
    expect(latestTurnIndex).toBeGreaterThanOrEqual(0)
    expect(archiveIndex).toBeGreaterThan(exactReadIndex)
    expect(archiveIndex).toBeGreaterThan(latestTurnIndex)
    stopped.bridge.close()

    const resumedChild = new FakeCodexProcess()
    resumedChild.interruptedTurnIds.add(FIXED_THREAD_IDS[3])
    const resumed = loadCodexBridge(resumedChild)
    const resumedSnapshot = await resumed.bridge.readSnapshot({ includeQuota: false, includeConfig: false, includeThreads: true })
    const resumedTask = resumedSnapshot.value.threads.find((thread: Record<string, any>) => thread.name === '跨端未知')
    resumedChild.interruptedTurnIds.delete(FIXED_THREAD_IDS[3])
    resumedChild.inProgressTurnIds.add(FIXED_THREAD_IDS[3])

    await expect(resumed.bridge.archiveThread(resumedTask.actionAlias, {
      expectedUpdatedAt: resumedTask.updatedAt,
      expectedRevisionAt: resumedTask.lastTurnStartedAt,
      expectedLastTurnStartedAt: resumedTask.lastTurnStartedAt,
      expectedSourceFingerprint: resumedSnapshot.value.sourceFingerprint,
      evidence: 'stopped'
    })).resolves.toMatchObject({ outcome: 'failed', errorCode: 'state-changed' })
    expect(resumedChild.writes.some((frame) => frame.method === 'thread/archive')).toBe(false)
    resumed.bridge.close()
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
    expect(result.failed).toEqual([expect.objectContaining({ errorCode: 'archive-verify-1-failed' })])
    expect(result.desktopSyncedKeys).toHaveLength(22)
    expect(result.desktopSyncFailedKeys).toHaveLength(1)
    expect(child.writes.filter((frame) => frame.method === 'thread/archive')).toHaveLength(23)
    expect(child.writes.filter((frame) => frame.method === 'thread/list' && frame.params?.archived === true)).toHaveLength(45)
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
        // The entry loads its own module groups by relative path; this shim stands
        // in for the module system, so it resolves those from `preload/` the way
        // the real one does. Naming each module here would mean every future
        // extraction breaks the run before anyone notices.
        if (name.startsWith('.')) return nodeRequire(resolve(process.cwd(), 'preload', name))
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
        if (name === './runtime-identity.cjs') return TEST_RUNTIME_IDENTITY
        if (name === './companion/task-kernel.cjs') return nodeRequire(resolve(process.cwd(), 'preload/companion/task-kernel.cjs'))
        if (name === './companion/persisted-side-state.cjs') return nodeRequire(resolve(process.cwd(), 'preload/companion/persisted-side-state.cjs'))
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
        // The entry loads its own module groups by relative path; this shim stands
        // in for the module system, so it resolves those from `preload/` the way
        // the real one does. Naming each module here would mean every future
        // extraction breaks the run before anyone notices.
        if (name.startsWith('.')) return nodeRequire(resolve(process.cwd(), 'preload', name))
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(preload, sandbox, { filename: 'preload.js' })
    const platform = (sandbox.window as { eypcPlatform: Record<string, any> }).eypcPlatform
    handshakeTestRuntime(platform)
    const bridge = platform.codex as { readSnapshot(options: Record<string, unknown>): Promise<Record<string, any>>; openThread(alias: string): Promise<Record<string, unknown>>; close(): void }

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
        // The entry loads its own module groups by relative path; this shim stands
        // in for the module system, so it resolves those from `preload/` the way
        // the real one does. Naming each module here would mean every future
        // extraction breaks the run before anyone notices.
        if (name.startsWith('.')) return nodeRequire(resolve(process.cwd(), 'preload', name))
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
        // The entry loads its own module groups by relative path; this shim stands
        // in for the module system, so it resolves those from `preload/` the way
        // the real one does. Naming each module here would mean every future
        // extraction breaks the run before anyone notices.
        if (name.startsWith('.')) return nodeRequire(resolve(process.cwd(), 'preload', name))
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
        // The entry loads its own module groups by relative path; this shim stands
        // in for the module system, so it resolves those from `preload/` the way
        // the real one does. Naming each module here would mean every future
        // extraction breaks the run before anyone notices.
        if (name.startsWith('.')) return nodeRequire(resolve(process.cwd(), 'preload', name))
        throw new Error(`unexpected require: ${name}`)
      }
    }
    sandbox.globalThis = sandbox
    // The PAC refusals moved into preload/codex/proxy-discovery.cjs under
    // RAW-169. Reaching them through the boundary keeps these assertions
    // pointed at the code that actually decides, not at a name in the entry.
    vm.runInNewContext(`${preload}\nglobalThis.__codexProxyTest = codexProxyDiscovery`, sandbox, { filename: 'preload.js' })
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
        // The entry loads its own module groups by relative path; this shim stands
        // in for the module system, so it resolves those from `preload/` the way
        // the real one does. Naming each module here would mean every future
        // extraction breaks the run before anyone notices.
        if (name.startsWith('.')) return nodeRequire(resolve(process.cwd(), 'preload', name))
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
        // The entry loads its own module groups by relative path; this shim stands
        // in for the module system, so it resolves those from `preload/` the way
        // the real one does. Naming each module here would mean every future
        // extraction breaks the run before anyone notices.
        if (name.startsWith('.')) return nodeRequire(resolve(process.cwd(), 'preload', name))
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
        // The entry loads its own module groups by relative path; this shim stands
        // in for the module system, so it resolves those from `preload/` the way
        // the real one does. Naming each module here would mean every future
        // extraction breaks the run before anyone notices.
        if (name.startsWith('.')) return nodeRequire(resolve(process.cwd(), 'preload', name))
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
