import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface FloatSnapshot {
  style: 'water' | 'card'
  conversationInboxEnabled: boolean
  expandedFields: string[]
  quota: Record<string, unknown>
  conversations: { ongoing: unknown[]; completedUnread: unknown[]; completed: unknown[]; hidden: unknown[]; pending: unknown[] }
}

function snapshot(overrides: Partial<FloatSnapshot> = {}): FloatSnapshot {
  return {
    style: 'water',
    conversationInboxEnabled: true,
    expandedFields: ['plan', 'short', 'weekly', 'reset', 'config', 'tasks', 'updatedAt'],
    quota: { short: { remainingPercent: 80 }, weekly: { remainingPercent: 35 } },
    conversations: { ongoing: [], completedUnread: [], completed: [], hidden: [], pending: [] },
    ...overrides
  }
}

function loadPreloadHarness() {
  const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
  const ipcHandlers = new Map<string, (...args: unknown[]) => void>()
  const sent: Array<{ channel: string; payload: unknown }> = []
  const displays = [
    { id: 'left', workArea: { x: -1280, y: 0, width: 1280, height: 800 }, bounds: { x: -1280, y: 0, width: 1280, height: 800 } },
    { id: 'right', workArea: { x: 1920, y: -100, width: 1440, height: 900 }, bounds: { x: 1920, y: -100, width: 1440, height: 900 } }
  ]
  let floatBounds: Rect | null = null
  const floatWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ ...(floatBounds as Rect) }),
    setBounds: vi.fn((bounds: Rect) => { floatBounds = { ...bounds } }),
    close: vi.fn(),
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
      floatBounds = { x: options.x, y: options.y, width: options.width, height: options.height }
      return floatWindow
    })
  }
  const sandbox: Record<string, any> = {
    window: {},
    globalThis: null,
    console,
    process: { platform: 'darwin', env: {}, cwd: () => process.cwd() },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    utools,
    require(name: string) {
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
  vm.runInNewContext(`${preload}\nwindow.__codexFloatGeometry = { codexFloatDesiredSize, codexFloatExpandedHeight, resizeFloatBounds };`, sandbox, { filename: 'preload.js' })
  return {
    bridge: sandbox.window.eypcPlatform.float as {
      sync(payload: Record<string, unknown>): boolean
      activate(): boolean
      diagnostics(): Record<string, unknown>
      resetGeometry(payload: Record<string, unknown>): boolean
      onAction(listener: (action: { actionId: string; args: Record<string, unknown> }) => void): () => void
    },
    geometry: sandbox.window.__codexFloatGeometry as {
      codexFloatDesiredSize(value: unknown, expanded: boolean): { width: number; height: number }
      codexFloatExpandedHeight(value: unknown): number
      resizeFloatBounds(current: Rect, size: { width: number; height: number }, display: Record<string, unknown>, edge: string): { bounds: Rect; edge: string }
    },
    ipcHandlers,
    displays,
    sent,
    floatWindow,
    bounds: () => floatBounds as Rect
  }
}

function loadFloatRendererPreloadHarness() {
  const preload = readFileSync(resolve(process.cwd(), 'preload/float.js'), 'utf8')
  const ipcHandlers = new Map<string, (...args: unknown[]) => void>()
  const sent: Array<{ channel: string; payload: Record<string, unknown> }> = []
  const sandbox: Record<string, any> = {
    window: {},
    globalThis: null,
    setTimeout,
    clearTimeout,
    utools: {
      sendToParent: (channel: string, payload: Record<string, unknown>) => sent.push({ channel, payload })
    },
    require(name: string) {
      if (name === 'electron') return { ipcRenderer: { on: (channel: string, listener: (...args: unknown[]) => void) => ipcHandlers.set(channel, listener) } }
      throw new Error(`unexpected float require: ${name}`)
    }
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(preload, sandbox, { filename: 'float-preload.js' })
  return {
    bridge: sandbox.window.eypcFloat as {
      createThread(request: Record<string, unknown>): Promise<Record<string, unknown>>
      returnFocus(): boolean
    },
    ipcHandlers,
    sent
  }
}

function setExpansion(ipcHandlers: Map<string, (...args: unknown[]) => void>, expanded: boolean, pinned = false) {
  ipcHandlers.get('eypc-float:expansion')?.({}, { expanded, pinned: expanded && pinned })
}

describe('Codex float preload sizing', () => {
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
})
