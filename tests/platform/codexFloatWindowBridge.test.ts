import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

const nodeRequire = createRequire(import.meta.url)

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const TEST_RUNTIME_IDENTITY = {
  revision: 'runtime-identity-v1',
  artifactState: 'artifact-ready',
  hostAssetId: 'host-test-current',
  rendererAssetId: 'renderer-test-current',
  kernelRevision: 'companion-task-kernel-v4',
  taskPackageRevision: 'companion-task-package-v4'
}

afterEach(() => vi.useRealTimers())

interface FloatSnapshot {
  version?: 1 | 2
  baseRevision?: number
  style: 'water' | 'card'
  conversationInboxEnabled: boolean
  expandedFields: string[]
  quota: Record<string, unknown>
  conversations: { ongoing: unknown[]; stopped?: unknown[]; completedUnread: unknown[]; completed: unknown[]; hidden: unknown[]; pending: unknown[] }
}

function companionTask(revision: number, overrides: Record<string, unknown> = {}) {
  return {
    key: 'float-task-a',
    provider: 'codex',
    kind: 'codex-thread',
    phase: 'running',
    cycleTier: 'none',
    dynamicGroup: 'none',
    actionAlias: 'ct_float_task_a_1234567890',
    revisionAt: 10_000 + revision,
    membershipRevision: 10_000 + revision,
    phaseRevision: 10_000 + revision,
    unreadRevision: 10_000 + revision,
    visibilityRevision: 10_000 + revision,
    statusEnteredAt: 10_000 + revision,
    lastQuestionAt: 10_000 + revision,
    displayOrder: 0,
    cycleOrder: 0,
    attentionOrder: 0,
    hidden: false,
    unread: false,
    unreadKnown: true,
    planImplementation: false,
    planReady: false,
    planLifecycleRevision: 0,
    paused: false,
    turnMode: 'unknown',
    idleConfirmed: false,
    localPin: false,
    dynamicEligible: true,
    capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false },
    ...overrides
  }
}

function companionDraft(revision: number, taskOverrides: Record<string, unknown> = {}) {
  return {
    schema: 'companion-task-draft-v4',
    producer: 'host-evidence',
    sourceTaskStateRevision: 'task-state-v10',
    draftRevision: revision,
    acceptedAt: 10_000 + revision,
    enabled: true,
    providers: { codex: true, claude: false },
    complete: true,
    focusedKey: '',
    sourceGenerations: { codex: revision, claude: 0 },
    sourceLaneGenerations: {
      codex: { membership: revision, phase: revision, unread: revision },
      claude: { membership: 0, phase: 0, unread: 0 }
    },
    tasks: [companionTask(revision, taskOverrides)]
  }
}

function taskPackage(revision: number, taskOverrides: Record<string, unknown> = {}) {
  const task = companionTask(revision, taskOverrides)
  const group = task.phase === 'running' ? 'active' : task.phase === 'waiting-input' ? 'input' : 'none'
  return {
    schema: 'companion-task-package-v4',
    kernelRevision: 'companion-task-kernel-v4',
    packageRevision: revision,
    sourceTaskStateRevision: 'task-state-v10',
    publishedAt: 10_000 + revision,
    enabled: true,
    providers: { codex: true, claude: false },
    complete: true,
    freshness: 'fresh',
    focusedKey: '',
    sourceGenerations: { codex: revision, claude: 0 },
    sourceLaneGenerations: {
      codex: { membership: revision, phase: revision, unread: revision },
      claude: { membership: 0, phase: 0, unread: 0 }
    },
    tasks: [task],
    views: {
      groups: {
        input: group === 'input' ? [task.key] : [],
        active: group === 'active' ? [task.key] : [],
        stopped: [],
        unread: [],
        completed: []
      },
      counts: { input: group === 'input' ? 1 : 0, active: group === 'active' ? 1 : 0, unread: 0 },
      attentionKeys: { input: group === 'input' ? [task.key] : [], completedUnread: [] },
      cycleKeys: [task.key],
      pausedKeys: []
    }
  }
}

function snapshot(overrides: Partial<FloatSnapshot> = {}): FloatSnapshot {
  return {
    style: 'water',
    conversationInboxEnabled: true,
    expandedFields: ['plan', 'short', 'weekly', 'reset', 'config', 'tasks', 'updatedAt'],
    quota: { short: { remainingPercent: 80 }, weekly: { remainingPercent: 35 } },
    conversations: { ongoing: [], stopped: [], completedUnread: [], completed: [], hidden: [], pending: [] },
    ...overrides
  }
}

function loadPreloadHarness() {
  const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
  const ipcHandlers = new Map<string, (...args: unknown[]) => void>()
  const sent: Array<{ channel: string; payload: unknown }> = []
  const pluginOutListeners: Array<(isKill: boolean) => void> = []
  const displays = [
    { id: 'left', workArea: { x: -1280, y: 0, width: 1280, height: 800 }, bounds: { x: -1280, y: 0, width: 1280, height: 800 } },
    { id: 'right', workArea: { x: 1920, y: -100, width: 1440, height: 900 }, bounds: { x: 1920, y: -100, width: 1440, height: 900 } }
  ]
  let floatBounds: Rect | null = null
  let floatDestroyed = false
  const floatWindow = {
    isDestroyed: () => floatDestroyed,
    getBounds: () => ({ ...(floatBounds as Rect) }),
    setBounds: vi.fn((bounds: Rect) => { floatBounds = { ...bounds } }),
    close: vi.fn(() => { floatDestroyed = true }),
    setAlwaysOnTop: vi.fn(),
    isAlwaysOnTop: vi.fn(() => true),
    setVisibleOnAllWorkspaces: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    showInactive: vi.fn(),
    webContents: { send: vi.fn((channel: string, payload: unknown) => sent.push({ channel, payload })) }
  }
  const utools = {
    getAllDisplays: () => displays,
    getCursorScreenPoint: () => ({ x: 2500, y: 300 }),
    getDisplayNearestPoint: (point: { x: number }) => point.x < 0 ? displays[0] : displays[1],
    createBrowserWindow: vi.fn((_url: string, options: Rect) => {
      floatDestroyed = false
      floatBounds = { x: options.x, y: options.y, width: options.width, height: options.height }
      return floatWindow
    }),
    onPluginOut: (listener: (isKill: boolean) => void) => { pluginOutListeners.push(listener) }
  }
  const sandbox: Record<string, any> = {
    window: {},
    globalThis: null,
    console,
    Date,
    process: { platform: 'darwin', env: {}, cwd: () => process.cwd() },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    utools,
    require(name: string) {
      if (name === './companion/task-kernel.cjs') return nodeRequire(resolve(process.cwd(), 'preload/companion/task-kernel.cjs'))
      if (name === 'node:buffer') return { Buffer }
      if (name === 'node:child_process') return { execFile, spawn }
      if (name === 'node:crypto') return crypto
      if (name === 'node:net') return { connect: vi.fn() }
      if (name === 'node:fs') return fs
      if (name === 'node:os') return os
      if (name === 'node:path') return path
      if (name === 'electron') return { ipcRenderer: { on: (channel: string, listener: (...args: unknown[]) => void) => ipcHandlers.set(channel, listener) } }
      throw new Error(`unexpected require: ${name}`)
    }
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(`${preload}\nwindow.__codexFloatGeometry = { codexFloatDesiredSize, codexFloatExpandedHeight, resizeFloatBounds }; window.__codexFloatTaskTest = { kernel: companionTaskKernel };`, sandbox, { filename: 'preload.js' })
  return {
    bridge: sandbox.window.eypcPlatform.float as {
      sync(payload: Record<string, unknown>): boolean
      activate(): boolean
      diagnostics(): Record<string, unknown>
      resetGeometry(payload: Record<string, unknown>): boolean
      close(): void
      onAction(listener: (action: { actionId: string; args: Record<string, unknown> }) => void): () => void
    },
    geometry: sandbox.window.__codexFloatGeometry as {
      codexFloatDesiredSize(value: unknown, expanded: boolean): { width: number; height: number }
      codexFloatExpandedHeight(value: unknown): number
      resizeFloatBounds(current: Rect, size: { width: number; height: number }, display: Record<string, unknown>, edge: string): { bounds: Rect; edge: string }
    },
    taskKernel: sandbox.window.__codexFloatTaskTest.kernel as {
      publishEvidence(draft: Record<string, unknown>): Record<string, unknown>
      getLatest(): Record<string, any>
    },
    ipcHandlers,
    displays,
    sent,
    floatWindow,
    bounds: () => floatBounds as Rect,
    createCount: () => utools.createBrowserWindow.mock.calls.length,
    triggerPluginOut: (isKill: boolean) => pluginOutListeners.forEach((listener) => listener(isKill)),
    isFloatDestroyed: () => floatDestroyed
  }
}

function loadFloatRendererPreloadHarness() {
  const preload = readFileSync(resolve(process.cwd(), 'preload/float.js'), 'utf8')
  const ipcHandlers = new Map<string, (...args: unknown[]) => void>()
  const sent: Array<{ channel: string; payload: Record<string, unknown> }> = []
  const sandbox: Record<string, any> = {
    window: {},
    globalThis: null,
    Date,
    setTimeout,
    clearTimeout,
    utools: {
      sendToParent: (channel: string, payload: Record<string, unknown>) => sent.push({ channel, payload })
    },
    require(name: string) {
      if (name === 'electron') return { ipcRenderer: { on: (channel: string, listener: (...args: unknown[]) => void) => ipcHandlers.set(channel, listener) } }
      if (name === './runtime-identity.cjs') return TEST_RUNTIME_IDENTITY
      throw new Error(`unexpected float require: ${name}`)
    }
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(preload, sandbox, { filename: 'float-preload.js' })
  const bridge = sandbox.window.eypcFloat
  const handshake = bridge.runtimeIdentity.handshake({
    hostAssetId: TEST_RUNTIME_IDENTITY.hostAssetId,
    rendererAssetId: TEST_RUNTIME_IDENTITY.rendererAssetId,
    kernelRevision: TEST_RUNTIME_IDENTITY.kernelRevision,
    taskPackageRevision: TEST_RUNTIME_IDENTITY.taskPackageRevision
  })
  if (handshake.status !== 'host-loaded') throw new Error('test Float identity handshake failed')
  return {
    bridge: bridge as {
      createThread(request: Record<string, unknown>): Promise<Record<string, unknown>>
      returnFocus(): boolean
      getHealth(): { heartbeatSequence: number; lastHeartbeatAckAt: number }
      getSnapshot(): Record<string, any> | null
      ackTaskPackage(stage: 'applied' | 'rejected', reason?: string): boolean
      onSnapshot(listener: (value: Record<string, any>) => void): () => void
    },
    ipcHandlers,
    sent
  }
}

function setExpansion(ipcHandlers: Map<string, (...args: unknown[]) => void>, expanded: boolean, pinned = false) {
  ipcHandlers.get('eypc-float:expansion')?.({}, { expanded, pinned: expanded && pinned })
}

describe('Codex float preload sizing', () => {
  it('keeps task packages on an independent revision lane and recreates only after two missing applied ACKs', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const { bridge, taskKernel, ipcHandlers, sent, createCount } = loadPreloadHarness()
    taskKernel.publishEvidence(companionDraft(1))

    expect(bridge.sync({ visible: true, snapshot: { ...snapshot({ baseRevision: 1 }), version: 2 }, position: {} })).toBe(true)
    expect(createCount()).toBe(1)
    const initial = sent.find((item) => item.channel === 'eypc-float:snapshot')
    expect(initial?.payload).toMatchObject({ companionTaskPackage: { packageRevision: 1 } })
    ipcHandlers.get('eypc-float:task-package-ack')?.({}, {
      sentRevision: 1,
      currentRevision: 1,
      stage: 'applied'
    })

    const taskSendsBeforeQuota = sent.filter((item) => item.channel === 'eypc-float:task-package').length
    expect(bridge.sync({ visible: true, snapshot: { ...snapshot({ baseRevision: 2, quota: { short: { remainingPercent: 79 } } }), version: 2 }, position: {} })).toBe(true)
    expect(sent.at(-2)?.channel).toBe('eypc-float:snapshot')
    expect(sent.at(-2)?.payload).not.toHaveProperty('companionTaskPackage')
    expect(sent.filter((item) => item.channel === 'eypc-float:task-package')).toHaveLength(taskSendsBeforeQuota)

    taskKernel.publishEvidence(companionDraft(2, { phase: 'waiting-input' }))
    const taskFrames = () => sent.filter((item) => item.channel === 'eypc-float:task-package')
    expect(taskFrames()).toHaveLength(1)
    expect(taskFrames()[0].payload).toMatchObject({ sentRevision: 2, taskPackage: { packageRevision: 2 } })

    taskKernel.publishEvidence(companionDraft(3, {
      phase: 'waiting-input',
      revisionAt: 10_002,
      statusEnteredAt: 10_002,
      lastQuestionAt: 10_002
    }))
    expect(taskFrames()).toHaveLength(1)

    ipcHandlers.get('eypc-float:heartbeat')?.({}, { sequence: 1 })
    await vi.advanceTimersByTimeAsync(500)
    expect(taskFrames()).toHaveLength(2)
    expect(taskFrames()[1].payload).toMatchObject({ sentRevision: 2, taskPackage: { packageRevision: 2 } })
    await vi.advanceTimersByTimeAsync(500)
    expect(createCount()).toBe(2)
  })

  it('retains the latest task object, ignores repeated revisions and emits received/applied/rejected ACK stages', () => {
    const { bridge, ipcHandlers, sent } = loadFloatRendererPreloadHarness()
    const snapshots: Record<string, any>[] = []
    bridge.onSnapshot((value) => snapshots.push(value))
    const firstPackage = taskPackage(1)
    ipcHandlers.get('eypc-float:snapshot')?.({}, { ...snapshot({ baseRevision: 1 }), version: 2, companionTaskPackage: firstPackage })

    expect(snapshots).toHaveLength(1)
    expect(sent.at(-1)).toMatchObject({
      channel: 'eypc-float:task-package-ack',
      payload: { sentRevision: 1, currentRevision: 1, stage: 'received' }
    })
    expect(bridge.ackTaskPackage('applied')).toBe(true)
    expect(sent.at(-1)).toMatchObject({ channel: 'eypc-float:task-package-ack', payload: { stage: 'applied', currentRevision: 1 } })

    const retained = bridge.getSnapshot()?.companionTaskPackage
    ipcHandlers.get('eypc-float:snapshot')?.({}, { ...snapshot({ baseRevision: 2, quota: { short: { remainingPercent: 78 } } }), version: 2 })
    expect(bridge.getSnapshot()?.companionTaskPackage).toBe(retained)
    expect(snapshots).toHaveLength(2)

    ipcHandlers.get('eypc-float:snapshot')?.({}, { ...snapshot({ baseRevision: 2, quota: { short: { remainingPercent: 77 } } }), version: 2 })
    expect(bridge.getSnapshot()?.quota).toEqual({ short: { remainingPercent: 78 } })
    expect(snapshots).toHaveLength(2)

    const secondPackage = taskPackage(2, { phase: 'waiting-input' })
    ipcHandlers.get('eypc-float:task-package')?.({}, { taskPackage: secondPackage, sentRevision: 2 })
    expect(snapshots).toHaveLength(3)
    expect(sent.at(-1)).toMatchObject({ channel: 'eypc-float:task-package-ack', payload: { stage: 'received', currentRevision: 2 } })
    ipcHandlers.get('eypc-float:task-package')?.({}, { taskPackage: secondPackage, sentRevision: 2 })
    expect(snapshots).toHaveLength(3)
    expect(sent.slice(-2).map((item) => item.payload.stage)).toEqual(['received', 'applied'])

    ipcHandlers.get('eypc-float:task-package')?.({}, { taskPackage: firstPackage, sentRevision: 1 })
    expect(snapshots).toHaveLength(3)
    expect(sent.at(-1)).toMatchObject({
      channel: 'eypc-float:task-package-ack',
      payload: { stage: 'rejected', reason: 'older-revision', currentRevision: 2 }
    })
  })

  it('correlates transient create results without expanding the float Node dependency allowlist', async () => {
    const { bridge, ipcHandlers, sent } = loadFloatRendererPreloadHarness()
    const pending = bridge.createThread({ modelId: 'gpt-5.6-sol', prompt: 'temporary test draft' })
    const frame = sent.at(-1)

    expect(frame).toMatchObject({ channel: 'eypc-float:thread-create', payload: { requestId: expect.stringMatching(/^ftr_[A-Za-z0-9_-]{6,80}$/) } })
    ipcHandlers.get('eypc-float:thread-create-result')?.({}, {
      requestId: frame?.payload.requestId,
      result: { outcome: 'opened', modelId: 'gpt-5.6-sol', retryAllowed: false }
    })

    await expect(pending).resolves.toMatchObject({ outcome: 'opened', modelId: 'gpt-5.6-sol', retryAllowed: false })
  })

  it('requests a transient focus return without changing persistent float visibility', () => {
    const { bridge, sent } = loadFloatRendererPreloadHarness()

    expect(bridge.returnFocus()).toBe(true)
    expect(sent.at(-1)).toEqual({ channel: 'eypc-float:return-focus', payload: {} })
  })

  it('hides the existing float window when the renderer returns focus', () => {
    const { bridge, ipcHandlers, floatWindow } = loadPreloadHarness()
    bridge.sync({ visible: true, snapshot: snapshot(), position: {} })

    ipcHandlers.get('eypc-float:return-focus')?.({}, {})

    expect(floatWindow.hide).toHaveBeenCalledTimes(1)
  })

  it('uses exact compact dimensions for the water and horizontal card skins', () => {
    const { geometry } = loadPreloadHarness()

    expect({ ...geometry.codexFloatDesiredSize(snapshot({ style: 'water' }), false) }).toEqual({ width: 104, height: 104 })
    expect({ ...geometry.codexFloatDesiredSize(snapshot({ style: 'card' }), false) }).toEqual({ width: 166, height: 92 })
  })

  it('derives expanded height from visible content and clamps it to 280–460px', () => {
    const { geometry } = loadPreloadHarness()
    const minimum = snapshot({ conversationInboxEnabled: false, expandedFields: [], quota: {}, conversations: { ongoing: [], completedUnread: [], completed: [], hidden: [], pending: [] } })
    const ordinary = snapshot()
    const crowded = snapshot({
      conversations: {
        ongoing: Array.from({ length: 3 }, (_, index) => ({ key: `ongoing-${index}` })),
        completedUnread: Array.from({ length: 2 }, (_, index) => ({ key: `unread-${index}` })),
        completed: Array.from({ length: 3 }, (_, index) => ({ key: `completed-${index}` })),
        hidden: [],
        pending: Array.from({ length: 3 }, (_, index) => ({ key: `pending-${index}` }))
      }
    })

    expect(geometry.codexFloatExpandedHeight(minimum)).toBe(280)
    expect(geometry.codexFloatExpandedHeight(ordinary)).toBe(370)
    expect(geometry.codexFloatExpandedHeight(crowded)).toBe(460)
    expect({ ...geometry.codexFloatDesiredSize(crowded, true) }).toEqual({ width: 360, height: 460 })
  })

  it('sizes by the largest tab without adding obsolete status-group headings', () => {
    const { geometry } = loadPreloadHarness()
    const oneRow = snapshot({
      expandedFields: ['tasks'],
      quota: {},
      conversations: { ongoing: [{ state: 'running' }], completedUnread: [], completed: [], hidden: [], pending: [] }
    })
    const sameGroup = snapshot({
      expandedFields: ['tasks'],
      quota: {},
      conversations: { ongoing: [{ state: 'running' }, { state: 'running' }], completedUnread: [], completed: [], hidden: [], pending: [] }
    })
    const distinctGroups = snapshot({
      expandedFields: ['tasks'],
      quota: {},
      conversations: { ongoing: [{ state: 'waiting-input' }, { state: 'recent-activity' }], completedUnread: [], completed: [], hidden: [], pending: [] }
    })

    expect(geometry.codexFloatExpandedHeight(oneRow)).toBe(280)
    expect(geometry.codexFloatExpandedHeight(sameGroup)).toBe(321)
    expect(geometry.codexFloatExpandedHeight(distinctGroups)).toBe(321)
  })

  it.each([
    ['left', { x: 1932, y: 120, width: 104, height: 104 }, { x: 1932, y: 120, width: 360, height: 280 }],
    ['right', { x: 3244, y: 120, width: 104, height: 104 }, { x: 2988, y: 120, width: 360, height: 280 }],
    ['top', { x: 2300, y: -88, width: 104, height: 104 }, { x: 2300, y: -88, width: 360, height: 280 }],
    ['bottom', { x: 2300, y: 684, width: 104, height: 104 }, { x: 2300, y: 508, width: 360, height: 280 }]
  ])('keeps the %s edge while resizing on a non-primary monitor', (edge, current, expected) => {
    const { geometry, displays } = loadPreloadHarness()

    const result = geometry.resizeFloatBounds(current, { width: 360, height: 280 }, displays[1], edge)

    expect({ ...result.bounds }).toEqual(expected)
    expect(result.edge).toBe(edge)
  })

  it('recomputes a live window for style, fields and task-count snapshot changes', () => {
    const { bridge, bounds, ipcHandlers, floatWindow } = loadPreloadHarness()
    const position = { displayId: 'right', x: 3244, y: 120, edge: 'right' }

    expect(bridge.sync({ visible: true, snapshot: snapshot(), position })).toBe(true)
    expect(bounds()).toEqual({ x: 3244, y: 120, width: 104, height: 104 })
    expect(floatWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating')
    expect(floatWindow.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true })
    expect(bridge.diagnostics()).toMatchObject({ supported: true, alwaysOnTop: true, allWorkspaces: true, visibleOnFullScreen: true })

    expect(bridge.sync({ visible: true, snapshot: snapshot({ style: 'card' }), position })).toBe(true)
    expect(bounds()).toEqual({ x: 3182, y: 120, width: 166, height: 92 })

    setExpansion(ipcHandlers, true, false)
    expect(bounds()).toEqual({ x: 2988, y: 120, width: 360, height: 370 })

    const crowded = snapshot({
      style: 'card',
      conversations: {
        ongoing: Array.from({ length: 3 }, (_, index) => ({ key: `ongoing-${index}` })),
        completedUnread: Array.from({ length: 3 }, (_, index) => ({ key: `unread-${index}` })),
        completed: Array.from({ length: 3 }, (_, index) => ({ key: `completed-${index}` })),
        hidden: [],
        pending: Array.from({ length: 3 }, (_, index) => ({ key: `pending-${index}` }))
      }
    })
    expect(bridge.sync({ visible: true, snapshot: crowded, position })).toBe(true)
    expect(bounds()).toEqual({ x: 2988, y: 120, width: 360, height: 460 })

    expect(bridge.sync({ visible: true, snapshot: snapshot({ style: 'card', expandedFields: [] }), position })).toBe(true)
    expect(bounds()).toEqual({ x: 2988, y: 120, width: 360, height: 280 })
  })

  it('expands, shows, focuses and notifies the child when globally activated', () => {
    const { bridge, bounds, floatWindow, sent } = loadPreloadHarness()
    const position = { displayId: 'right', x: 3244, y: 120, edge: 'right' }
    bridge.sync({ visible: true, snapshot: snapshot(), position })

    expect(bridge.activate()).toBe(true)
    expect(bounds()).toEqual({ x: 2988, y: 120, width: 360, height: 370 })
    expect(floatWindow.show).toHaveBeenCalledTimes(1)
    expect(floatWindow.focus).toHaveBeenCalledTimes(1)
    expect(sent.some((item) => item.channel === 'eypc-float:activate')).toBe(true)
  })

  it('resizes from the inward corner, preserves the edge and saves geometry only on end', () => {
    const { bridge, bounds, ipcHandlers } = loadPreloadHarness()
    const actions: Array<{ actionId: string; args: Record<string, unknown> }> = []
    bridge.onAction((action) => actions.push(action))
    const position = { displayId: 'right', x: 3244, y: 120, edge: 'right' }
    bridge.sync({ visible: true, snapshot: snapshot(), position, expandedSizes: [] })
    setExpansion(ipcHandlers, true, true)
    const original = bounds()

    ipcHandlers.get('eypc-float:resize-start')?.({}, { screenX: original.x, screenY: original.y + original.height, corner: 'bottom-left' })
    ipcHandlers.get('eypc-float:resize-move')?.({}, { screenX: original.x - 100, screenY: original.y + 400 })
    expect(bounds()).toEqual({ x: 2888, y: 120, width: 460, height: 400 })
    expect(actions).toHaveLength(0)

    ipcHandlers.get('eypc-float:resize-end')?.()
    expect(actions).toEqual([{
      actionId: 'codex.float.geometry.save',
      args: {
        position: { displayId: 'right', x: 2888, y: 120, edge: 'right' },
        expandedSize: expect.objectContaining({ displayId: 'right', width: 460, height: 400 })
      }
    }])
  })

  it('restores the starting bounds on resize cancel and never persists it', () => {
    const { bridge, bounds, ipcHandlers } = loadPreloadHarness()
    const actions: Array<{ actionId: string }> = []
    bridge.onAction((action) => actions.push(action))
    bridge.sync({ visible: true, snapshot: snapshot(), position: { displayId: 'right', x: 3244, y: 120, edge: 'right' }, expandedSizes: [] })
    setExpansion(ipcHandlers, true, true)
    const original = { ...bounds() }

    ipcHandlers.get('eypc-float:resize-start')?.({}, { screenX: original.x, screenY: original.y + original.height, corner: 'bottom-left' })
    ipcHandlers.get('eypc-float:resize-move')?.({}, { screenX: 2600, screenY: 700 })
    expect(bounds()).not.toEqual(original)
    ipcHandlers.get('eypc-float:resize-cancel')?.()

    expect(bounds()).toEqual(original)
    expect(actions).toHaveLength(0)
  })

  it('expires a lost resize interaction so later expansion changes cannot remain locked', async () => {
    vi.useFakeTimers()
    const { bridge, bounds, ipcHandlers } = loadPreloadHarness()
    bridge.sync({ visible: true, snapshot: snapshot(), position: { displayId: 'right', x: 3244, y: 120, edge: 'right' }, expandedSizes: [] })
    setExpansion(ipcHandlers, true, true)
    const expanded = bounds()

    ipcHandlers.get('eypc-float:resize-start')?.({}, {
      screenX: expanded.x,
      screenY: expanded.y + expanded.height,
      corner: 'bottom-left',
      interactionId: 'resize-test-1'
    })
    await vi.advanceTimersByTimeAsync(10_001)
    setExpansion(ipcHandlers, false, false)

    expect(bounds()).toEqual({ x: 3244, y: 120, width: 104, height: 104 })
  })

  it('does not convert auto size to a manual preference when the resize handle is only clicked', () => {
    const { bridge, bounds, ipcHandlers } = loadPreloadHarness()
    const actions: Array<{ actionId: string }> = []
    bridge.onAction((action) => actions.push(action))
    bridge.sync({ visible: true, snapshot: snapshot(), position: { displayId: 'right', x: 3244, y: 120, edge: 'right' }, expandedSizes: [] })
    setExpansion(ipcHandlers, true, true)
    const original = bounds()
    ipcHandlers.get('eypc-float:resize-start')?.({}, { screenX: original.x, screenY: original.y + original.height, corner: 'bottom-left' })
    ipcHandlers.get('eypc-float:resize-end')?.()
    expect(actions).toHaveLength(0)
  })

  it('restores a recent per-display size, clamps it to work area and resets size independently from position', () => {
    const { bridge, bounds, ipcHandlers } = loadPreloadHarness()
    const position = { displayId: 'removed-display', x: 3244, y: 120, edge: 'right' }
    const expandedSizes = [{ displayId: 'removed-display', width: 5000, height: 5000, updatedAt: 200 }]
    bridge.sync({ visible: true, snapshot: snapshot(), position, expandedSizes })
    setExpansion(ipcHandlers, true, true)
    expect(bounds()).toEqual({ x: 1932, y: -88, width: 1416, height: 876 })

    expect(bridge.resetGeometry({ position: { ...position, displayId: 'right' }, expandedSizes: [{ displayId: 'left', width: 700, height: 600, updatedAt: 100 }] })).toBe(true)
    expect(bounds()).toEqual({ x: 2988, y: 120, width: 360, height: 370 })
  })

  it('retains the persisted edge at corners where nearest-edge inference is ambiguous', () => {
    const { bridge, bounds, ipcHandlers } = loadPreloadHarness()
    const position = { displayId: 'right', x: 3000, y: 684, edge: 'bottom' }

    expect(bridge.sync({ visible: true, snapshot: snapshot(), position })).toBe(true)
    expect(bounds()).toEqual({ x: 3000, y: 684, width: 104, height: 104 })

    expect(bridge.sync({ visible: true, snapshot: snapshot({ style: 'card' }), position })).toBe(true)
    expect(bounds()).toEqual({ x: 3000, y: 696, width: 166, height: 92 })

    setExpansion(ipcHandlers, true, true)
    expect(bounds()).toEqual({ x: 2988, y: 418, width: 360, height: 370 })
  })

  it('keeps a visible float across remount close and non-kill pluginOut', () => {
    const { bridge, createCount, floatWindow, triggerPluginOut, isFloatDestroyed } = loadPreloadHarness()
    const position = { displayId: 'right', x: 3244, y: 120, edge: 'right' }

    expect(bridge.sync({ visible: true, snapshot: snapshot(), position })).toBe(true)
    expect(createCount()).toBe(1)
    floatWindow.close.mockClear()

    // Simulate mainHide remount: renderer may destroy the child without clearing
    // the last sync(visible:true) intent.
    bridge.close()
    expect(isFloatDestroyed()).toBe(true)
    expect(createCount()).toBe(1)

    triggerPluginOut(false)
    triggerPluginOut(false)
    expect(createCount()).toBe(1)

    expect(bridge.sync({ visible: true, snapshot: snapshot(), position })).toBe(true)
    expect(createCount()).toBe(2)
    expect(isFloatDestroyed()).toBe(false)
  })

  it('recreates a stalled persistent float once and respects the recovery cooldown', async () => {
    vi.useFakeTimers()
    const { bridge, createCount, ipcHandlers, sent } = loadPreloadHarness()
    bridge.sync({ visible: true, snapshot: snapshot(), position: { displayId: 'right', x: 3244, y: 120, edge: 'right' } })
    expect(createCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(8_001)
    expect(createCount()).toBe(2)
    expect(bridge.diagnostics()).toMatchObject({ health: { alive: true, persistent: true, interaction: 'idle' } })

    ipcHandlers.get('eypc-float:heartbeat')?.({}, { sequence: 9 })
    expect(sent.at(-1)).toMatchObject({ channel: 'eypc-float:heartbeat-ack', payload: { sequence: 9 } })
    expect(bridge.diagnostics()).toMatchObject({ health: { recoveryDeadline: 0 } })

    await vi.advanceTimersByTimeAsync(8_001)
    expect(createCount()).toBe(2)
  })

  it('emits a renderer heartbeat every two seconds and records its acknowledgement', async () => {
    vi.useFakeTimers()
    const { bridge, ipcHandlers, sent } = loadFloatRendererPreloadHarness()

    await vi.advanceTimersByTimeAsync(2_001)
    expect(sent.at(-1)).toMatchObject({ channel: 'eypc-float:heartbeat', payload: { sequence: 1 } })
    ipcHandlers.get('eypc-float:heartbeat-ack')?.({}, { sequence: 1, receivedAt: Date.now() })
    expect(bridge.getHealth()).toMatchObject({ heartbeatSequence: 1, lastHeartbeatAckAt: expect.any(Number) })
  })

  it('closes the float only on sync(visible:false) or kill pluginOut', () => {
    const position = { displayId: 'right', x: 3244, y: 120, edge: 'right' }

    {
      const { bridge, createCount, triggerPluginOut, isFloatDestroyed } = loadPreloadHarness()
      expect(bridge.sync({ visible: true, snapshot: snapshot(), position })).toBe(true)
      expect(bridge.sync({ visible: false })).toBe(true)
      expect(isFloatDestroyed()).toBe(true)
      triggerPluginOut(false)
      expect(bridge.sync({ visible: true, snapshot: snapshot(), position })).toBe(true)
      expect(createCount()).toBe(2)
    }

    {
      const { bridge, createCount, triggerPluginOut, isFloatDestroyed } = loadPreloadHarness()
      expect(bridge.sync({ visible: true, snapshot: snapshot(), position })).toBe(true)
      triggerPluginOut(true)
      expect(isFloatDestroyed()).toBe(true)
      expect(bridge.sync({ visible: true, snapshot: snapshot(), position })).toBe(true)
      expect(createCount()).toBe(2)
    }
  })
})
