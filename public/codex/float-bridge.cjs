"use strict"
const { trace: freezeTrace } = require('../freeze-trace.cjs')

/**
 * Owns the Codex Float overlay window end to end: creation and teardown,
 * screen-edge snapping and drag/resize geometry, the independent snapshot
 * and task-package IPC revision lanes (a stalled renderer must not stall the
 * other), the health heartbeat that recreates a wedged window, and the IPC
 * channel set the renderer talks to it on.
 *
 * This is a route-3 (RAW-169) closure rewrite, not a route-1 delegate-stub
 * extraction: every module-level `let` the entry used to hold for this
 * subsystem now lives inside `createCodexFloatBridge`'s closure, created
 * fresh per instance. `handleHostVisibility(isKill)` is the boundary for the
 * uTools plugin-lifecycle signal -- the caller forwards the raw signal and
 * this module alone decides whether that means tearing the window down,
 * the same "the module fully explains its own decision" discipline already
 * applied in `desktop-ipc-endpoint.cjs` and `native-registry.cjs`.
 *
 * `record`/`runtimeDiagnostics`/`process` are hot primitives injected
 * because they are shared by dozens of call sites elsewhere in the entry.
 * `electronIpcRenderer`/`createCodexThread`/`openCodexBlank`/`copyText`/
 * `openCodexThread` are injected because they have call sites outside this
 * module too. `displayForPoint`/`displayForPosition`/`validResizeCorner`
 * are injected for the same reason -- discovered only once the entry's own
 * Action Runner window subsystem, which reused these three generic
 * window-geometry helpers, stopped compiling: they stay in the entry as
 * shared utilities rather than becoming Float-private. `companionTaskKernel`
 * is the entry's already-built instance, passed in the same way
 * `preload/claude/index.cjs` composes `archive` from already-built
 * `codeSessions`/`appState` readers. `float-window-size.cjs` is required
 * directly rather than injected as a handle -- it is this module's own
 * internal collaborator, not a cross-domain dependency, the same way
 * `preload/claude/index.cjs` requires its own sub-factories.
 */

const { createCodexFloatWindowSize } = require('./float-window-size.cjs')
const placement = require('./float-placement.cjs')

const CODEX_FLOAT_BRIDGE_REVISION = 'codex-float-bridge-v1'
const CODEX_FLOAT_WINDOW_TITLE = 'EyPc Codex'
const CODEX_FLOAT_WINDOW_SLOT = '__eypcCodexFloatWindow'

const CODEX_FLOAT_CHANNELS = {
  snapshot: 'eypc-float:snapshot',
  taskPackage: 'eypc-float:task-package',
  taskPackageAck: 'eypc-float:task-package-ack',
  state: 'eypc-float:state',
  activate: 'eypc-float:activate',
  expansion: 'eypc-float:expansion',
  returnFocus: 'eypc-float:return-focus',
  action: 'eypc-float:action',
  threadCreate: 'eypc-float:thread-create',
  threadCreateResult: 'eypc-float:thread-create-result',
  threadOpen: 'eypc-float:thread-open',
  threadOpenResult: 'eypc-float:thread-open-result',
  blankOpen: 'eypc-float:blank-open',
  blankOpenResult: 'eypc-float:blank-open-result',
  copyText: 'eypc-float:copy-text',
  copyTextResult: 'eypc-float:copy-text-result',
  dragStart: 'eypc-float:drag-start',
  dragMove: 'eypc-float:drag-move',
  dragEnd: 'eypc-float:drag-end',
  resizeStart: 'eypc-float:resize-start',
  resizeMove: 'eypc-float:resize-move',
  resizeEnd: 'eypc-float:resize-end',
  resizeCancel: 'eypc-float:resize-cancel',
  interactionCancel: 'eypc-float:interaction-cancel',
  heartbeat: 'eypc-float:heartbeat',
  heartbeatAck: 'eypc-float:heartbeat-ack',
  recreate: 'eypc-float:recreate'
}

const CODEX_FLOAT_WATER_SIZE = { width: 104, height: 99 }
const CODEX_FLOAT_CARD_SIZE = { width: 166, height: 92 }
const CODEX_FLOAT_EXPANDED_WIDTH = 360
const CODEX_FLOAT_EXPANDED_MIN_WIDTH = 340
const CODEX_FLOAT_EXPANDED_MIN_HEIGHT = 280
const CODEX_FLOAT_EXPANDED_MAX_HEIGHT = 460
const CODEX_FLOAT_MARGIN = 12
const CODEX_FLOAT_INTERACTION_IDLE_MS = 10_000
const CODEX_FLOAT_HEARTBEAT_MS = 2_000
const CODEX_FLOAT_STALL_MS = 6_000
const CODEX_FLOAT_RECOVERY_MS = 10_000
const CODEX_FLOAT_RECREATE_COOLDOWN_MS = 60_000
const CODEX_FLOAT_LIFECYCLE_RECREATE_COOLDOWN_MS = 5_000
const CODEX_FLOAT_LIFECYCLE_RECREATE_CODES = new Set([
  'plugin-enter',
  'host-identity-changed',
  'task-package-identity-mismatch',
  'task-package-invalid-payload',
  'task-revision-desync'
])

function createCodexFloatBridge(dependencies = {}) {
  const utools = dependencies.utools
  const record = dependencies.record
  const runtimeDiagnostics = dependencies.runtimeDiagnostics
  const process = dependencies.process
  const electronIpcRenderer = dependencies.electronIpcRenderer
  const createCodexThread = dependencies.createCodexThread
  const openCodexBlank = dependencies.openCodexBlank
  const copyText = dependencies.copyText
  const openCodexThread = dependencies.openCodexThread
  const companionTaskKernel = dependencies.companionTaskKernel || null
  const floatDisplayForPoint = dependencies.displayForPoint
  const floatDisplayForPosition = dependencies.displayForPosition
  const validCodexResizeCorner = dependencies.validResizeCorner
  if (typeof record !== 'function' || !runtimeDiagnostics || typeof runtimeDiagnostics.record !== 'function' || !process
    || typeof electronIpcRenderer !== 'function' || typeof createCodexThread !== 'function' || typeof openCodexBlank !== 'function'
    || typeof copyText !== 'function' || typeof openCodexThread !== 'function' || typeof floatDisplayForPoint !== 'function'
    || typeof floatDisplayForPosition !== 'function' || typeof validCodexResizeCorner !== 'function') {
    throw new TypeError('codex float bridge requires utools, record, runtimeDiagnostics, process, electronIpcRenderer, createCodexThread, openCodexBlank, copyText, openCodexThread, displayForPoint, displayForPosition and validResizeCorner')
  }

  let codexFloatWindow = null
  let codexFloatWindowGeneration = 0
  let codexFloatExpanded = false
  let codexFloatPinned = false
  let codexFloatEdge = 'right'
  let codexFloatSnapshot = null
  let codexFloatPendingDock = null
  let codexFloatBaseLastSentRevision = 0
  let codexFloatTaskLastSentRevision = 0
  let codexFloatTaskAppliedRevision = 0
  let codexFloatTaskPendingRevision = 0
  let codexFloatTaskSendAttempts = 0
  let codexFloatTaskPendingStartedAt = 0
  let codexFloatTaskAckTimer = null
  let codexFloatDrag = null
  let codexFloatResize = null
  let codexFloatInteractionTimer = null
  let codexFloatLastHeartbeatAt = 0
  let codexFloatLastRecreateAt = 0
  let codexFloatLastStallLoggedAt = 0
  let codexFloatRecoveryDeadline = 0
  let codexFloatRecoveryReported = false
  let codexFloatHealthTimer = null
  let codexFloatExpandedSizes = []
  let codexFloatPositionDisplayId = ''
  let codexFloatAnchor = null
  let codexFloatRailLayout = null
  let codexFloatPreferredPosition = {}
  let codexFloatSyncedPosition = ''
  let codexFloatDisplaySignature = ''
  let codexFloatPersistent = false
  let codexFloatBoundMainRendererId = ''
  let codexFloatWorkspaceDiagnostics = {
    supported: process.platform === 'darwin',
    alwaysOnTop: false,
    allWorkspaces: false,
    visibleOnFullScreen: false,
    checkedAt: 0,
    errorCode: process.platform === 'darwin' ? 'not-checked' : 'unsupported'
  }
  const codexFloatActionListeners = new Set()

  const isEdgeFloat = () => codexFloatSnapshot?.style === 'edge'
  function allFloatDisplays() {
    try { return utools?.getAllDisplays?.().filter((display) => display && (display.bounds || display.workArea)) || [] } catch { return [] }
  }
  function resolveFloatDisplay(position) {
    const displays = allFloatDisplays()
    // Only a first use without saved coordinates follows the pointer.
    const fallback = position?.displayId ? displays[0] : floatDisplayForPosition(null)
    return placement.resolveDisplay(position, displays, fallback || floatDisplayForPosition(null)).display
  }
  function currentFloatDisplay() {
    return allFloatDisplays().find((display) => String(display.id) === codexFloatPositionDisplayId)
      || resolveFloatDisplay(codexFloatPreferredPosition)
  }
  function adoptFloatPosition(position) {
    const display = resolveFloatDisplay(position)
    const restored = placement.restoreAnchor(position, display, codexFloatSnapshot?.style)
    codexFloatAnchor = restored.anchor
    codexFloatEdge = restored.edge
    codexFloatPositionDisplayId = String(display.id)
    return display
  }
  function applyRailGeometry(expanded) {
    if (!codexFloatAnchor || !codexFloatAlive()) return false
    const display = currentFloatDisplay()
    const size = expanded ? codexFloatDesiredSize(codexFloatSnapshot, true, display) : null
    const layout = placement.railLayout(codexFloatAnchor, display, codexFloatEdge, size)
    try {
      const current = codexFloatWindow.getBounds()
      if (['x', 'y', 'width', 'height'].some((key) => current[key] !== layout.bounds[key])) codexFloatWindow.setBounds(layout.bounds)
      const actual = codexFloatWindow.getBounds()
      codexFloatAnchor = { ...codexFloatAnchor, x: codexFloatAnchor.x + actual.x - layout.bounds.x, y: codexFloatAnchor.y + actual.y - layout.bounds.y }
      codexFloatRailLayout = { ...layout, bounds: actual }
      codexFloatExpanded = expanded
      return true
    } catch {
      runtimeDiagnostics.record({ scope: 'float-geometry', event: 'position', outcome: 'failed', code: 'set-bounds-failed', level: 'error' })
      return false
    }
  }
  function persistFloatAnchor(display, autoDock = false) {
    if (!codexFloatAnchor) return
    const position = placement.savePosition(codexFloatAnchor, display, codexFloatEdge)
    codexFloatPreferredPosition = position
    emitCodexFloatAction('codex.float.position.save', { position, ...(autoDock ? { displayStyle: 'edge' } : {}) })
  }
  function reconcileFloatDisplays() {
    if (!codexFloatAlive() || codexFloatDrag || codexFloatResize) return
    const displays = allFloatDisplays()
    if (!displays.length) return
    const signature = JSON.stringify(displays.map((display) => [String(display.id), display.bounds, display.workArea, display.scaleFactor]))
    if (signature === codexFloatDisplaySignature) return
    const display = adoptFloatPosition(codexFloatPreferredPosition)
    if (isEdgeFloat()) { if (!applyRailGeometry(codexFloatExpanded)) return }
    else {
      const initial = initialCodexFloatBounds(codexFloatPreferredPosition)
      try { codexFloatWindow.setBounds(initial.bounds) } catch { return }
      if (codexFloatExpanded) resizeCodexFloat(true, false)
    }
    codexFloatDisplaySignature = signature
    codexFloatPositionDisplayId = String(display.id)
    applyCodexFloatWorkspaceVisibility()
    pushCodexFloatState()
  }

  function codexFloatAlive() {
    if (!codexFloatWindow) return false
    try {
      return typeof codexFloatWindow.isDestroyed !== 'function' || !codexFloatWindow.isDestroyed()
    } catch {
      return false
    }
  }

  function applyCodexFloatWorkspaceVisibility() {
    const diagnostics = {
      supported: process.platform === 'darwin',
      alwaysOnTop: false,
      allWorkspaces: false,
      visibleOnFullScreen: false,
      checkedAt: Date.now(),
      errorCode: ''
    }
    if (!codexFloatAlive()) {
      codexFloatWorkspaceDiagnostics = { ...diagnostics, errorCode: 'window-unavailable' }
      return false
    }
    try {
      codexFloatWindow.setAlwaysOnTop(true, isEdgeFloat() ? 'pop-up-menu' : 'floating')
      diagnostics.alwaysOnTop = typeof codexFloatWindow.isAlwaysOnTop === 'function' ? codexFloatWindow.isAlwaysOnTop() === true : true
    } catch {
      diagnostics.errorCode = 'always-on-top-failed'
    }
    if (process.platform !== 'darwin') {
      codexFloatWorkspaceDiagnostics = { ...diagnostics, errorCode: diagnostics.errorCode || 'unsupported' }
      return diagnostics.alwaysOnTop
    }
    if (typeof codexFloatWindow.setVisibleOnAllWorkspaces !== 'function') {
      codexFloatWorkspaceDiagnostics = { ...diagnostics, errorCode: diagnostics.errorCode || 'all-workspaces-unavailable' }
      return false
    }
    try {
      codexFloatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      diagnostics.allWorkspaces = true
      diagnostics.visibleOnFullScreen = true
    } catch {
      diagnostics.errorCode = diagnostics.errorCode || 'all-workspaces-failed'
    }
    codexFloatWorkspaceDiagnostics = diagnostics
    return diagnostics.alwaysOnTop && diagnostics.allWorkspaces && diagnostics.visibleOnFullScreen
  }

  function getCodexFloatWorkspaceDiagnostics() {
    return {
      ...codexFloatWorkspaceDiagnostics,
      health: {
        alive: codexFloatAlive(),
        persistent: codexFloatPersistent,
        lastHeartbeatAt: codexFloatLastHeartbeatAt,
        lastRecreateAt: codexFloatLastRecreateAt,
        recoveryDeadline: codexFloatRecoveryDeadline,
        interaction: codexFloatResize ? 'resize' : codexFloatDrag ? 'drag' : 'idle'
      }
    }
  }

  function clampFloatBounds(bounds, display) {
    const area = display.workArea || display.bounds || { x: 0, y: 0, width: 1440, height: 900 }
    const areaWidth = Math.max(1, Math.round(area.width))
    const areaHeight = Math.max(1, Math.round(area.height))
    const marginX = areaWidth >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
    const marginY = areaHeight >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
    const requestedWidth = Number.isFinite(bounds.width) ? Math.round(bounds.width) : 72
    const requestedHeight = Number.isFinite(bounds.height) ? Math.round(bounds.height) : 72
    const width = Math.max(1, Math.min(Math.max(72, requestedWidth), areaWidth - marginX * 2))
    const height = Math.max(1, Math.min(Math.max(72, requestedHeight), areaHeight - marginY * 2))
    const minX = area.x + marginX
    const minY = area.y + marginY
    const maxX = area.x + areaWidth - width - marginX
    const maxY = area.y + areaHeight - height - marginY
    const requestedX = Number.isFinite(bounds.x) ? Math.round(bounds.x) : minX
    const requestedY = Number.isFinite(bounds.y) ? Math.round(bounds.y) : minY
    return { x: Math.min(maxX, Math.max(minX, requestedX)), y: Math.min(maxY, Math.max(minY, requestedY)), width, height }
  }

  function nearestFloatEdge(bounds, display) {
    const area = display.workArea || display.bounds
    const distances = [
      ['left', Math.abs(bounds.x - area.x)],
      ['right', Math.abs(area.x + area.width - (bounds.x + bounds.width))],
      ['top', Math.abs(bounds.y - area.y)],
      ['bottom', Math.abs(area.y + area.height - (bounds.y + bounds.height))]
    ]
    distances.sort((a, b) => a[1] - b[1])
    return distances[0][0]
  }

  function snapFloatBounds(bounds, display) {
    const area = display.workArea || display.bounds
    const next = clampFloatBounds(bounds, display)
    const edge = nearestFloatEdge(next, display)
    const marginX = area.width >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
    const marginY = area.height >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
    if (edge === 'left') next.x = area.x + marginX
    if (edge === 'right') next.x = area.x + area.width - next.width - marginX
    if (edge === 'top') next.y = area.y + marginY
    if (edge === 'bottom') next.y = area.y + area.height - next.height - marginY
    return { bounds: next, edge }
  }

  function normalizeCodexExpandedSizes(value) {
    if (!Array.isArray(value)) return []
    const byDisplay = new Map()
    for (const item of value) {
      const source = record(item)
      const displayId = typeof source.displayId === 'string' ? source.displayId.slice(0, 120) : ''
      if (!displayId || !Number.isFinite(source.width) || !Number.isFinite(source.height) || !Number.isFinite(source.updatedAt)) continue
      const entry = {
        displayId,
        width: Math.max(CODEX_FLOAT_EXPANDED_MIN_WIDTH, Math.round(source.width)),
        height: Math.max(CODEX_FLOAT_EXPANDED_MIN_HEIGHT, Math.round(source.height)),
        updatedAt: Math.max(0, Math.round(source.updatedAt))
      }
      const previous = byDisplay.get(displayId)
      if (!previous || entry.updatedAt >= previous.updatedAt) byDisplay.set(displayId, entry)
    }
    return [...byDisplay.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
  }

  function clampCodexExpandedSize(size, display) {
    const area = display?.workArea || display?.bounds || { x: 0, y: 0, width: 1440, height: 900 }
    const maxWidth = Math.max(1, Math.round(area.width) - CODEX_FLOAT_MARGIN * 2)
    const maxHeight = Math.max(1, Math.round(area.height) - CODEX_FLOAT_MARGIN * 2)
    return {
      width: Math.min(maxWidth, Math.max(Math.min(CODEX_FLOAT_EXPANDED_MIN_WIDTH, maxWidth), Math.round(size.width))),
      height: Math.min(maxHeight, Math.max(Math.min(CODEX_FLOAT_EXPANDED_MIN_HEIGHT, maxHeight), Math.round(size.height)))
    }
  }

  function codexFloatExpandedPreference(display) {
    const displayId = String(display?.id || '')
    const exact = codexFloatExpandedSizes.find((entry) => entry.displayId === displayId)
    if (exact) return exact
    if (codexFloatPreferredPosition?.displayId && String(codexFloatPreferredPosition.displayId) === displayId) return null
    return codexFloatExpandedSizes[0] || null
  }

  const codexFloatWindowSize = createCodexFloatWindowSize({
    record,
    expandedPreference: codexFloatExpandedPreference,
    clampExpandedSize: clampCodexExpandedSize,
    cardSize: CODEX_FLOAT_CARD_SIZE,
    waterSize: CODEX_FLOAT_WATER_SIZE,
    expandedMinHeight: CODEX_FLOAT_EXPANDED_MIN_HEIGHT,
    expandedMaxHeight: CODEX_FLOAT_EXPANDED_MAX_HEIGHT,
    expandedWidth: CODEX_FLOAT_EXPANDED_WIDTH
  })

  function codexFloatCollapsedSize(snapshot) {
    return codexFloatWindowSize ? codexFloatWindowSize.codexFloatCollapsedSize(snapshot) : { ...CODEX_FLOAT_WATER_SIZE }
  }

  function codexFloatExpandedHeight(snapshot) {
    return codexFloatWindowSize ? codexFloatWindowSize.codexFloatExpandedHeight(snapshot) : CODEX_FLOAT_EXPANDED_MIN_HEIGHT
  }

  function codexFloatDesiredSize(snapshot, expanded, display) {
    if (!expanded) return codexFloatCollapsedSize(snapshot)
    if (codexFloatWindowSize) return codexFloatWindowSize.codexFloatDesiredSize(snapshot, expanded, display)
    const preferred = codexFloatExpandedPreference(display)
    return clampCodexExpandedSize(preferred || { width: CODEX_FLOAT_EXPANDED_WIDTH, height: codexFloatExpandedHeight(snapshot) }, display)
  }

  function codexFloatResizeCorner(bounds, display, edge) {
    const area = display.workArea || display.bounds
    const vertical = bounds.y + bounds.height / 2 <= area.y + area.height / 2 ? 'bottom' : 'top'
    const horizontal = bounds.x + bounds.width / 2 <= area.x + area.width / 2 ? 'right' : 'left'
    if (edge === 'left') return `${vertical}-right`
    if (edge === 'right') return `${vertical}-left`
    if (edge === 'top') return `bottom-${horizontal}`
    return `top-${horizontal}`
  }

  function validCodexFloatEdge(edge) {
    return edge === 'left' || edge === 'right' || edge === 'top' || edge === 'bottom'
  }

  function alignFloatBoundsToEdge(bounds, display, edge) {
    const area = display.workArea || display.bounds
    const next = clampFloatBounds(bounds, display)
    const marginX = area.width >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
    const marginY = area.height >= 72 + CODEX_FLOAT_MARGIN * 2 ? CODEX_FLOAT_MARGIN : 0
    if (edge === 'left') next.x = area.x + marginX
    if (edge === 'right') next.x = area.x + area.width - next.width - marginX
    if (edge === 'top') next.y = area.y + marginY
    if (edge === 'bottom') next.y = area.y + area.height - next.height - marginY
    return clampFloatBounds(next, display)
  }

  function resizeFloatBounds(current, size, display, preferredEdge) {
    const edge = validCodexFloatEdge(preferredEdge) ? preferredEdge : nearestFloatEdge(current, display)
    const next = { x: current.x, y: current.y, width: size.width, height: size.height }
    if (edge === 'right') next.x = current.x + current.width - size.width
    if (edge === 'bottom') next.y = current.y + current.height - size.height
    return { bounds: alignFloatBoundsToEdge(next, display, edge), edge }
  }

  function codexFloatTaskPackageRevision(taskPackage) {
    const revision = Number(record(taskPackage).packageRevision)
    return Number.isInteger(revision) && revision > 0 ? revision : 0
  }

  function clearCodexFloatTaskAckTimer() {
    if (codexFloatTaskAckTimer) clearTimeout(codexFloatTaskAckTimer)
    codexFloatTaskAckTimer = null
  }

  function resetCodexFloatTaskLane() {
    clearCodexFloatTaskAckTimer()
    codexFloatBaseLastSentRevision = 0
    codexFloatTaskLastSentRevision = 0
    codexFloatTaskAppliedRevision = 0
    codexFloatTaskPendingRevision = 0
    codexFloatTaskSendAttempts = 0
    codexFloatTaskPendingStartedAt = 0
  }

  function armCodexFloatTaskAck(taskPackage, revision, attempt) {
    clearCodexFloatTaskAckTimer()
    if (!revision || revision <= codexFloatTaskAppliedRevision) return
    if (revision !== codexFloatTaskPendingRevision) {
      codexFloatTaskPendingRevision = revision
      codexFloatTaskPendingStartedAt = Date.now()
      codexFloatTaskSendAttempts = 0
    }
    codexFloatTaskSendAttempts = Math.max(codexFloatTaskSendAttempts, attempt)
    codexFloatTaskAckTimer = setTimeout(() => {
      codexFloatTaskAckTimer = null
      if (codexFloatTaskAppliedRevision >= revision || codexFloatTaskPendingRevision !== revision) return
      const latest = companionTaskKernel?.getLatest?.() || companionTaskKernel?.getPackage?.() || taskPackage
      const latestRevision = codexFloatTaskPackageRevision(latest)
      if (codexFloatTaskSendAttempts < 2) {
        pushCodexFloatTaskPackage(latest, { force: true })
        return
      }
      const elapsed = Date.now() - codexFloatTaskPendingStartedAt
      const heartbeatHealthy = codexFloatLastHeartbeatAt > 0
        && Date.now() - codexFloatLastHeartbeatAt <= CODEX_FLOAT_HEARTBEAT_MS * 2
      runtimeDiagnostics.record({
        level: 'error',
        scope: 'float-bridge',
        event: 'task-package-ack',
        outcome: 'missing',
        code: heartbeatHealthy ? 'applied-ack-missing' : 'heartbeat-unhealthy',
        durationMs: elapsed,
        count: latestRevision
      })
      // Missing presentation ACK is diagnostic evidence, not permission to tear
      // down a healthy window. Forced recreation here used to turn a slow render
      // into an apparent crash during rapid previous/next navigation.
    }, 500)
    codexFloatTaskAckTimer?.unref?.()
  }

  function pushCodexFloatTaskPackage(taskPackage, options = {}) {
    if (!codexFloatAlive()) return false
    const revision = codexFloatTaskPackageRevision(taskPackage)
    if (!revision || revision <= codexFloatTaskAppliedRevision) return false
    const force = record(options).force === true
    if (!force && revision <= codexFloatTaskLastSentRevision) return false
    const attempt = revision === codexFloatTaskPendingRevision ? codexFloatTaskSendAttempts + 1 : 1
    try {
      codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.taskPackage, {
        taskSnapshot: taskPackage,
        sentRevision: revision,
        sentAt: Date.now()
      })
      codexFloatTaskLastSentRevision = Math.max(codexFloatTaskLastSentRevision, revision)
      armCodexFloatTaskAck(taskPackage, revision, attempt)
      runtimeDiagnostics.record({
        level: 'debug',
        scope: 'float-bridge',
        event: 'task-package-send',
        outcome: force ? 'resent' : 'sent',
        count: revision,
        cache: 'process-package'
      })
      return true
    } catch {
      runtimeDiagnostics.record({ scope: 'float-bridge', event: 'task-package-send', outcome: 'failed', code: 'send-failed', level: 'error', count: revision })
      return false
    }
  }

  function pushCodexFloatSnapshot(options = {}) {
    const freezeSpan = freezeTrace.begin('codex.push-codex-float-snapshot')
    try {
    if (!codexFloatAlive() || !codexFloatSnapshot) return false
    const baseRevision = Number(codexFloatSnapshot.baseRevision) || 0
    if (record(options).force !== true
      && baseRevision > 0
      && baseRevision <= codexFloatBaseLastSentRevision) return false
    const startedAt = Date.now()
    try {
      const taskPackage = codexFloatSnapshot.taskSnapshot
      const revision = codexFloatTaskPackageRevision(taskPackage)
      const outboundSnapshot = codexFloatTaskLastSentRevision > 0
        ? (({ taskSnapshot: _taskSnapshot, ...snapshotWithoutTasks }) => snapshotWithoutTasks)(codexFloatSnapshot)
        : codexFloatSnapshot
      codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.snapshot, outboundSnapshot)
      if (baseRevision > 0) codexFloatBaseLastSentRevision = Math.max(codexFloatBaseLastSentRevision, baseRevision)
      if (revision > 0 && codexFloatTaskLastSentRevision === 0) {
        codexFloatTaskLastSentRevision = revision
        armCodexFloatTaskAck(taskPackage, revision, 1)
      }
      pushCodexFloatState()
      runtimeDiagnostics.record({
        level: 'debug',
        scope: 'float-bridge',
        event: 'snapshot-send',
        outcome: 'sent',
        durationMs: Date.now() - startedAt,
        slowMs: 50,
        count: Number(codexFloatSnapshot?.taskSnapshot?.tasks?.length) || 0,
        cache: 'process-package'
      })
      return true
    } catch {
      runtimeDiagnostics.record({ scope: 'float-bridge', event: 'snapshot-send', outcome: 'failed', code: 'send-failed', durationMs: Date.now() - startedAt, level: 'error' })
      return false
    }

    } finally { freezeTrace.end(freezeSpan) }
  }

  function pushCodexFloatState() {
    if (!codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return false
    try {
      const bounds = codexFloatWindow.getBounds()
      const display = floatDisplayForPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
      const preference = codexFloatExpandedPreference(display)
      codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.state, {
        expanded: codexFloatExpanded,
        pinned: codexFloatPinned,
        resizing: Boolean(codexFloatResize),
        dragging: Boolean(codexFloatDrag),
        style: codexFloatSnapshot?.style,
        edge: codexFloatEdge,
        ...(isEdgeFloat() && codexFloatRailLayout ? { placement: codexFloatRailLayout } : {}),
        resizeCorner: codexFloatExpanded && !isEdgeFloat() ? codexFloatResizeCorner(bounds, display, codexFloatEdge) : null,
        expandedSize: codexFloatExpanded ? {
          displayId: String(display.id || ''),
          width: isEdgeFloat() ? codexFloatRailLayout?.panel?.width || bounds.width : bounds.width,
          height: isEdgeFloat() ? codexFloatRailLayout?.panel?.height || bounds.height : bounds.height,
          manual: Boolean(preference)
        } : null
      })
      return true
    } catch {
      return false
    }
  }

  function initialCodexFloatBounds(position) {
    const display = adoptFloatPosition(position)
    if (isEdgeFloat()) {
      codexFloatRailLayout = placement.railLayout(codexFloatAnchor, display, codexFloatEdge)
      return { display, bounds: codexFloatRailLayout.bounds, edge: codexFloatEdge }
    }
    codexFloatRailLayout = null
    const size = codexFloatCollapsedSize(codexFloatSnapshot)
    return { display, bounds: { x: codexFloatAnchor.x - 5, y: codexFloatAnchor.y - collapsedTopInset(), ...size }, edge: codexFloatEdge }
  }

  function codexFloatDevelopmentEntry() {
    const href = typeof globalThis.location?.href === 'string' ? globalThis.location.href : ''
    return /^http:\/\/127\.0\.0\.1:8092(?:\/|$)/.test(href)
      ? 'http://127.0.0.1:8092/float.html'
      : ''
  }

  function listBrowserWindows() {
    try {
      const electron = typeof dependencies.requireElectron === 'function' ? dependencies.requireElectron() : null
      if (typeof electron?.BrowserWindow?.getAllWindows === 'function') return electron.BrowserWindow.getAllWindows() || []
      if (typeof electron?.remote?.BrowserWindow?.getAllWindows === 'function') return electron.remote.BrowserWindow.getAllWindows() || []
    } catch {}
    return []
  }

  function windowTitle(win) {
    try {
      return typeof win?.getTitle === 'function' ? String(win.getTitle() || '') : ''
    } catch {
      return ''
    }
  }

  function stashCodexFloatWindow(win) {
    try { globalThis[CODEX_FLOAT_WINDOW_SLOT] = win || null } catch {}
  }

  function closeExistingCodexFloatWindows(keep) {
    const freezeSpan = freezeTrace.begin('codex.close-existing-codex-float-windows')
    try {
    const seen = new Set()
    const stashed = (() => { try { return globalThis[CODEX_FLOAT_WINDOW_SLOT] || null } catch { return null } })()
    const candidates = [stashed, ...listBrowserWindows()]
    for (const win of candidates) {
      if (!win || seen.has(win) || win === keep) continue
      seen.add(win)
      if (win !== stashed && windowTitle(win) !== CODEX_FLOAT_WINDOW_TITLE) continue
      try {
        if (typeof win.isDestroyed === 'function' && win.isDestroyed()) continue
      } catch {}
      try { win.close() } catch {}
    }
    if (!keep) stashCodexFloatWindow(null)

    } finally { freezeTrace.end(freezeSpan) }
  }

  function createCodexFloat(position) {
    const freezeSpan = freezeTrace.begin('codex.create-codex-float')
    try {
    const generation = ++codexFloatWindowGeneration
    closeExistingCodexFloatWindows(null)
    if (!utools || typeof utools.createBrowserWindow !== 'function') return false
    const initial = initialCodexFloatBounds(position)
    const developmentEntry = codexFloatDevelopmentEntry()
    let redirectedToDevelopment = false
    const isCurrentWindow = () => generation === codexFloatWindowGeneration && codexFloatWindow !== null
    const finishCreateCodexFloat = () => {
      if (!isCurrentWindow()) return
      applyCodexFloatWorkspaceVisibility()
      try {
        if (typeof codexFloatWindow?.showInactive === 'function') codexFloatWindow.showInactive()
        else codexFloatWindow?.show()
      } catch {}
      pushCodexFloatSnapshot()
      pushCodexFloatState()
    }
    try {
      codexFloatEdge = initial.edge
      codexFloatWindow = freezeTrace.run('float.sdk-create-browser-window', () => (utools.createBrowserWindow('float.html', {
        show: false,
        title: CODEX_FLOAT_WINDOW_TITLE,
        x: initial.bounds.x,
        y: initial.bounds.y,
        width: initial.bounds.width,
        height: initial.bounds.height,
        backgroundColor: '#00000000',
        frame: false,
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        movable: false,
        closeable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        roundedCorners: false,
        hasShadow: false,
        autoHideMenuBar: true,
        webPreferences: { preload: 'float-preload.js' }
      }, () => {
        if (!isCurrentWindow()) return
        if (developmentEntry && !redirectedToDevelopment && typeof codexFloatWindow?.loadURL === 'function') {
          redirectedToDevelopment = true
          try {
            const loading = codexFloatWindow.loadURL(developmentEntry)
            if (loading && typeof loading.then === 'function') loading.then(finishCreateCodexFloat).catch(finishCreateCodexFloat)
            return
          } catch {}
        }
        finishCreateCodexFloat()
      })))
      codexFloatLastHeartbeatAt = Date.now()
      try { codexFloatWindow?.on?.('unresponsive', () => { if (isCurrentWindow()) requestCodexFloatRecreate('window-unresponsive') }) } catch {}
      try { codexFloatWindow?.webContents?.on?.('render-process-gone', () => { if (isCurrentWindow()) requestCodexFloatRecreate('render-process-gone') }) } catch {}
      try { codexFloatWindow?.webContents?.on?.('did-fail-load', () => { if (isCurrentWindow()) requestCodexFloatRecreate('did-fail-load') }) } catch {}
      applyCodexFloatWorkspaceVisibility()
      stashCodexFloatWindow(codexFloatWindow)
      return true
    } catch {
      codexFloatWindow = null
      stashCodexFloatWindow(null)
      return false
    }

    } finally { freezeTrace.end(freezeSpan) }
  }

  function isLifecycleRecreateCode(code) {
    const key = typeof code === 'string' ? code : ''
    return CODEX_FLOAT_LIFECYCLE_RECREATE_CODES.has(key) || key.startsWith('float-')
  }

  function isSilentPluginEnter(action) {
    const code = typeof record(action).code === 'string' ? record(action).code : ''
    if (!code) return false
    if (/-slot-\d+$/.test(code) || /-action-\d+$/.test(code)) return true
    return code.endsWith('-toggle')
      || code.endsWith('-activate')
      || code.endsWith('-quick')
      || code.endsWith('-input')
      || code.endsWith('-unread')
      || code.endsWith('-archive')
      || code.includes('-task-')
      || code === 'eypc-codex-action-runner'
  }

  function requestCodexFloatRecreate(code = 'heartbeat-stall') {
    const now = Date.now()
    if (!codexFloatPersistent) return false
    const cooldown = isLifecycleRecreateCode(code)
      ? CODEX_FLOAT_LIFECYCLE_RECREATE_COOLDOWN_MS
      : CODEX_FLOAT_RECREATE_COOLDOWN_MS
    if (codexFloatLastRecreateAt > 0 && now - codexFloatLastRecreateAt < cooldown) return false
    codexFloatLastRecreateAt = now
    const expanded = codexFloatExpanded
    const pinned = codexFloatPinned
    const edge = codexFloatEdge
    let position = codexFloatPreferredPosition
    // Recreate from the durable anchor, never the expanded preview rectangle.
    runtimeDiagnostics.record({ scope: 'float-health', event: 'controlled-recreate', outcome: 'started', code, level: 'info' })
    closeCodexFloat()
    codexFloatExpanded = expanded
    codexFloatPinned = pinned
    codexFloatEdge = edge
    const created = createCodexFloat(position)
    if (created && expanded) resizeCodexFloat(true, false)
    if (created) {
      applyCodexFloatWorkspaceVisibility()
      pushCodexFloatSnapshot()
      const taskPackage = codexFloatSnapshot?.taskSnapshot
      if (codexFloatTaskPackageRevision(taskPackage) > 0) pushCodexFloatTaskPackage(taskPackage, { force: true })
    }
    codexFloatRecoveryDeadline = now + CODEX_FLOAT_RECOVERY_MS
    codexFloatRecoveryReported = false
    runtimeDiagnostics.record({
      level: created ? 'info' : 'error',
      scope: 'float-health',
      event: 'controlled-recreate',
      outcome: created ? 'created' : 'failed',
      code
    })
    return created
  }

  function handlePluginEnter(action) {
    if (isSilentPluginEnter(action)) return false
    if (codexFloatPersistent && codexFloatAlive()) return requestCodexFloatRecreate('plugin-enter')
    closeExistingCodexFloatWindows(null)
    return false
  }

  function incomingMainRendererIdentity(snapshot) {
    const identity = record(record(snapshot).runtimeIdentity)
    const expectedId = record(identity.expected).rendererAssetId
    const actualId = record(identity.actual).hostAssetId
    if (typeof expectedId === 'string' && expectedId) return expectedId
    return typeof actualId === 'string' ? actualId : ''
  }

  function scheduleCodexFloatHealthCheck() {
    const setTimer = globalThis.setTimeout
    const clearTimer = globalThis.clearTimeout
    if (typeof setTimer !== 'function') return false
    if (codexFloatHealthTimer && typeof clearTimer === 'function') clearTimer(codexFloatHealthTimer)
    codexFloatHealthTimer = setTimer(() => {
      codexFloatHealthTimer = null
      const now = Date.now()
      if (codexFloatPersistent && codexFloatAlive()) {
        reconcileFloatDisplays()
        const age = codexFloatLastHeartbeatAt ? now - codexFloatLastHeartbeatAt : Number.POSITIVE_INFINITY
        if (codexFloatRecoveryDeadline && now >= codexFloatRecoveryDeadline && !codexFloatRecoveryReported) {
          codexFloatRecoveryReported = true
          runtimeDiagnostics.record({ scope: 'float-health', event: 'recovery-window', outcome: 'timeout', code: 'heartbeat-missing', level: 'error', durationMs: CODEX_FLOAT_RECOVERY_MS })
        }
        if (age > CODEX_FLOAT_STALL_MS) {
          if (now - codexFloatLastStallLoggedAt >= CODEX_FLOAT_RECREATE_COOLDOWN_MS) {
            codexFloatLastStallLoggedAt = now
            runtimeDiagnostics.record({ scope: 'float-health', event: 'heartbeat', outcome: 'stalled', code: 'heartbeat-timeout', level: 'info', durationMs: age })
          }
          requestCodexFloatRecreate('heartbeat-timeout')
        }
      }
      scheduleCodexFloatHealthCheck()
    }, CODEX_FLOAT_HEARTBEAT_MS)
    codexFloatHealthTimer?.unref?.()
    return true
  }

  function clearCodexFloatInteractionTimer() {
    if (codexFloatInteractionTimer) clearTimeout(codexFloatInteractionTimer)
    codexFloatInteractionTimer = null
  }

  // Only the card retains top padding. The water window is cropped to the
  // ball's top edge while its 94 DIP artwork and bottom badges keep their size.
  const collapsedTopInset = () => codexFloatSnapshot?.style === 'card' ? 5 : 0

  function applyCollapsedAnchor() {
    if (isEdgeFloat()) return applyRailGeometry(false)
    try {
      codexFloatWindow.setBounds({ x: codexFloatAnchor.x - 5, y: codexFloatAnchor.y - collapsedTopInset(), ...codexFloatCollapsedSize(codexFloatSnapshot) })
      const actual = codexFloatWindow.getBounds()
      codexFloatAnchor = { ...codexFloatAnchor, x: actual.x + 5, y: actual.y + collapsedTopInset() }
      codexFloatExpanded = false
      return true
    } catch { return false }
  }

  function cancelCodexFloatInteraction(restore = true) {
    clearCodexFloatInteractionTimer()
    const start = codexFloatDrag
    if (start) runtimeDiagnostics.record({ scope: 'float-drag', event: 'cancel', outcome: restore ? 'restored' : 'cleared', level: 'info' })
    const bounds = codexFloatResize?.bounds || start?.bounds || null
    codexFloatDrag = null
    codexFloatResize = null
    if (restore && bounds && codexFloatAlive()) {
      if (start) {
        codexFloatAnchor = start.anchor
        codexFloatEdge = start.edge
        codexFloatPositionDisplayId = start.displayId
        codexFloatPinned = start.pinned
        codexFloatExpanded = start.expanded
        if (isEdgeFloat()) applyRailGeometry(start.expanded)
        else { try { codexFloatWindow.setBounds(bounds) } catch {} }
      } else { try { codexFloatWindow.setBounds(bounds) } catch {} }
    }
    if (codexFloatAlive()) pushCodexFloatState()
  }

  function armCodexFloatInteractionTimeout() {
    clearCodexFloatInteractionTimer()
    if (!codexFloatDrag && !codexFloatResize) return
    codexFloatInteractionTimer = setTimeout(() => cancelCodexFloatInteraction(true), CODEX_FLOAT_INTERACTION_IDLE_MS)
    codexFloatInteractionTimer?.unref?.()
  }

  function codexFloatInteractionId(value, fallback) {
    return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(value) ? value : fallback
  }

  function sameCodexFloatInteraction(active, payload) {
    if (!active) return false
    const requested = record(payload).interactionId
    return typeof requested !== 'string' || !requested
      ? active.interactionId.startsWith('legacy-')
      : requested === active.interactionId
  }

  function closeCodexFloat() {
    // Invalidate callbacks before close can emit any lifecycle events.
    codexFloatWindowGeneration += 1
    const closing = codexFloatWindow
    if (codexFloatAlive()) {
      try { codexFloatWindow.close() } catch {}
    }
    try {
      if (globalThis[CODEX_FLOAT_WINDOW_SLOT] === closing) stashCodexFloatWindow(null)
    } catch {}
    codexFloatWindow = null
    codexFloatExpanded = false
    codexFloatPinned = false
    codexFloatEdge = 'right'
    codexFloatLastHeartbeatAt = 0
    codexFloatRecoveryDeadline = 0
    codexFloatRecoveryReported = false
    resetCodexFloatTaskLane()
    clearCodexFloatInteractionTimer()
    codexFloatDrag = null
    codexFloatResize = null
  }

  function activateCodexFloat(payload) {
    if (!codexFloatAlive()) return false
    resizeCodexFloat(true, true)
    try {
      if (typeof codexFloatWindow.show === 'function') codexFloatWindow.show()
      else if (typeof codexFloatWindow.showInactive === 'function') codexFloatWindow.showInactive()
      if (typeof codexFloatWindow.focus === 'function') codexFloatWindow.focus()
      const requestedCommand = record(payload).command
      const command = requestedCommand === 'new-thread' || requestedCommand === 'quick' ? requestedCommand : undefined
      codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.activate, { requestedAt: Date.now(), ...(command ? { command } : {}) })
      return true
    } catch {
      return false
    }
  }

  function syncCodexFloat(payload) {
    const source = record(payload)
    codexFloatPersistent = source.visible === true
    if (source.visible !== true) {
      closeCodexFloat()
      return true
    }
    const previousStyle = codexFloatSnapshot?.style
    const rendererSnapshot = source.snapshot && typeof source.snapshot === 'object' ? source.snapshot : null
    const incomingIdentity = incomingMainRendererIdentity(rendererSnapshot)
    const identityChanged = Boolean(
      incomingIdentity
      && codexFloatBoundMainRendererId
      && incomingIdentity !== codexFloatBoundMainRendererId
      && codexFloatAlive()
    )
    if (identityChanged && requestCodexFloatRecreate('host-identity-changed')) {
      codexFloatBoundMainRendererId = incomingIdentity
    } else if (incomingIdentity) {
      codexFloatBoundMainRendererId = incomingIdentity
    }
    const hostTaskPackage = companionTaskKernel?.getPackage?.()
    codexFloatSnapshot = rendererSnapshot && hostTaskPackage
      ? { ...rendererSnapshot, taskSnapshot: hostTaskPackage }
      : rendererSnapshot
    codexFloatExpandedSizes = normalizeCodexExpandedSizes(source.expandedSizes || record(source.snapshot).expandedSizes)
    const position = record(source.position)
    const positionKey = JSON.stringify(position)
    // Retain the native drop presentation until its atomic settings write
    // arrives; quota refreshes may still carry the pre-drop settings.
    if (codexFloatPendingDock) {
      if (codexFloatSnapshot?.style === codexFloatPendingDock.style && positionKey === codexFloatPendingDock.positionKey) {
        codexFloatSnapshot = { ...codexFloatSnapshot, style: 'edge' }
      } else codexFloatPendingDock = null
    }
    if (positionKey !== codexFloatSyncedPosition) {
      codexFloatPreferredPosition = position
      codexFloatSyncedPosition = positionKey
    }
    if (previousStyle !== codexFloatSnapshot?.style && codexFloatAlive()) adoptFloatPosition(codexFloatPreferredPosition)
    if (!codexFloatAlive() && !createCodexFloat(position)) return false
    applyCodexFloatWorkspaceVisibility()
    reconcileFloatDisplays()
    if (!codexFloatResize && !codexFloatDrag) resizeCodexFloat(codexFloatExpanded, false)
    pushCodexFloatState()
    const snapshotSent = pushCodexFloatSnapshot({ force: identityChanged })
    const taskPackage = codexFloatSnapshot?.taskSnapshot
    if (codexFloatTaskPackageRevision(taskPackage) > codexFloatTaskLastSentRevision) {
      pushCodexFloatTaskPackage(taskPackage)
    }
    return snapshotSent
  }

  function emitCodexFloatAction(actionId, args) {
    if (typeof actionId !== 'string' || !actionId.startsWith('codex.')) return
    if (actionId === 'codex.settings.open') {
      try {
        if (utools && typeof utools.showMainWindow === 'function') utools.showMainWindow()
      } catch {}
    }
    for (const listener of codexFloatActionListeners) {
      try { listener({ actionId, args: record(args) }) } catch {}
    }
  }

  function resizeCodexFloat(expanded, notifyState = true) {
    if (!codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
    if (isEdgeFloat()) {
      if (applyRailGeometry(expanded) && notifyState) pushCodexFloatState()
      return
    }
    const current = codexFloatWindow.getBounds()
    const display = floatDisplayForPoint({ x: current.x + current.width / 2, y: current.y + current.height / 2 })
    const edge = validCodexFloatEdge(codexFloatEdge) ? codexFloatEdge : nearestFloatEdge(current, display)
    const size = codexFloatDesiredSize(codexFloatSnapshot, expanded, display)
    const resized = !expanded && codexFloatAnchor
      ? { bounds: { x: codexFloatAnchor.x - 5, y: codexFloatAnchor.y - collapsedTopInset(), ...size }, edge }
      : resizeFloatBounds(current, size, display, edge)
    if (current.x !== resized.bounds.x || current.y !== resized.bounds.y || current.width !== resized.bounds.width || current.height !== resized.bounds.height) {
      try { codexFloatWindow.setBounds(resized.bounds) } catch {}
    }
    codexFloatEdge = resized.edge
    codexFloatExpanded = expanded
    if (!expanded) codexFloatPinned = false
    if (notifyState) pushCodexFloatState()
  }

  function resetCodexFloatGeometry(payload) {
    const source = record(payload)
    codexFloatExpandedSizes = normalizeCodexExpandedSizes(source.expandedSizes)
    if (!codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return true
    clearCodexFloatInteractionTimer()
    codexFloatDrag = null
    codexFloatResize = null
    const position = record(source.position)
    codexFloatPreferredPosition = position
    codexFloatSyncedPosition = JSON.stringify(position)
    const initial = initialCodexFloatBounds(position)
    if (isEdgeFloat()) {
      if (!applyRailGeometry(codexFloatExpanded)) return false
    } else {
      try { codexFloatWindow.setBounds(initial.bounds) } catch { return false }
      if (codexFloatExpanded) resizeCodexFloat(true, false)
    }
    applyCodexFloatWorkspaceVisibility()
    pushCodexFloatState()
    return true
  }

  function moveCodexFloatResize(screenX, screenY) {
    if (!codexFloatResize || !codexFloatAlive()) return false
    if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return false
    const start = codexFloatResize
    const dx = screenX - start.pointerX
    const dy = screenY - start.pointerY
    const left = start.corner.endsWith('-left')
    const top = start.corner.startsWith('top-')
    const requested = {
      width: left ? start.bounds.width - dx : start.bounds.width + dx,
      height: top ? start.bounds.height - dy : start.bounds.height + dy
    }
    const size = clampCodexExpandedSize(requested, start.display)
    const candidate = {
      x: left ? start.bounds.x + start.bounds.width - size.width : start.bounds.x,
      y: top ? start.bounds.y + start.bounds.height - size.height : start.bounds.y,
      ...size
    }
    const bounds = alignFloatBoundsToEdge(candidate, start.display, start.edge)
    try { codexFloatWindow.setBounds(bounds) } catch { return false }
    return true
  }

  function installCodexFloatIpc() {
    const ipc = electronIpcRenderer()
    if (!ipc || typeof ipc.on !== 'function') return
    ipc.on(CODEX_FLOAT_CHANNELS.expansion, (_event, payload) => {
      if (codexFloatResize || codexFloatDrag) return
      const source = record(payload)
      const expanded = source.expanded === true
      codexFloatPinned = expanded && source.pinned === true
      resizeCodexFloat(expanded, true)
    })
    ipc.on(CODEX_FLOAT_CHANNELS.returnFocus, () => {
      if (!codexFloatAlive()) return
      try { codexFloatWindow.hide() } catch {}
    })
    ipc.on(CODEX_FLOAT_CHANNELS.action, (_event, payload) => emitCodexFloatAction(record(payload).actionId, record(payload).args))
    ipc.on(CODEX_FLOAT_CHANNELS.taskPackageAck, (_event, payload) => {
      const source = record(payload)
      const sentRevision = Number(source.revision || source.sentRevision)
      const currentRevision = Number(source.currentRevision)
      const stage = source.stage
      if (!Number.isInteger(sentRevision) || sentRevision <= 0 || !Number.isInteger(currentRevision) || currentRevision < 0) return
      if (stage === 'received') return
      if (stage === 'applied') {
        if (sentRevision > codexFloatTaskLastSentRevision || currentRevision < sentRevision) return
        codexFloatTaskAppliedRevision = Math.max(codexFloatTaskAppliedRevision, sentRevision)
        companionTaskKernel?.acknowledge?.({ consumer: 'float', revision: sentRevision })
        if (codexFloatTaskAppliedRevision >= codexFloatTaskPendingRevision) {
          const elapsed = codexFloatTaskPendingStartedAt ? Date.now() - codexFloatTaskPendingStartedAt : 0
          clearCodexFloatTaskAckTimer()
          codexFloatTaskPendingRevision = 0
          codexFloatTaskSendAttempts = 0
          codexFloatTaskPendingStartedAt = 0
          runtimeDiagnostics.record({
            level: elapsed > 250 ? 'info' : 'debug',
            scope: 'float-bridge',
            event: 'task-package-ack',
            outcome: 'applied',
            durationMs: elapsed,
            slowMs: 250,
            count: sentRevision
          })
        }
        return
      }
      if (stage !== 'rejected') return
      if (source.reason === 'older-revision' && currentRevision >= sentRevision) {
        const hostRevision = Number(
          companionTaskKernel?.getLatest?.()?.packageRevision
          || companionTaskKernel?.getPackage?.()?.packageRevision
          || sentRevision
        )
        if (currentRevision > hostRevision) {
          requestCodexFloatRecreate('task-revision-desync')
          return
        }
        codexFloatTaskAppliedRevision = Math.max(codexFloatTaskAppliedRevision, currentRevision)
        companionTaskKernel?.acknowledge?.({ consumer: 'float', revision: currentRevision })
        if (codexFloatTaskAppliedRevision >= codexFloatTaskPendingRevision) {
          clearCodexFloatTaskAckTimer()
          codexFloatTaskPendingRevision = 0
          codexFloatTaskSendAttempts = 0
          codexFloatTaskPendingStartedAt = 0
        }
        return
      }
      runtimeDiagnostics.record({
        scope: 'float-bridge',
        event: 'task-package-ack',
        outcome: 'rejected',
        code: ['identity-mismatch', 'invalid-payload'].includes(source.reason) ? source.reason : 'invalid-ack',
        level: 'error',
        count: sentRevision
      })
      if (source.reason === 'identity-mismatch' || source.reason === 'invalid-payload') requestCodexFloatRecreate(`task-package-${source.reason}`)
    })
    ipc.on(CODEX_FLOAT_CHANNELS.threadCreate, async (_event, payload) => {
      const source = record(payload)
      const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
      if (!requestId) return
      const result = await createCodexThread(source.request)
      if (!codexFloatAlive()) return
      try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.threadCreateResult, { requestId, result }) } catch {}
    })
    ipc.on(CODEX_FLOAT_CHANNELS.blankOpen, async (_event, payload) => {
      const source = record(payload)
      const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
      if (!requestId) return
      const result = await openCodexBlank()
      if (!codexFloatAlive()) return
      try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.blankOpenResult, { requestId, result }) } catch {}
    })
    ipc.on(CODEX_FLOAT_CHANNELS.copyText, async (_event, payload) => {
      const source = record(payload)
      const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
      const text = typeof source.text === 'string' && source.text.length <= 50_000 ? source.text : ''
      if (!requestId || !text.trim()) return
      const copied = await copyText(text)
      if (!codexFloatAlive()) return
      try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.copyTextResult, { requestId, result: copied }) } catch {}
    })
    ipc.on(CODEX_FLOAT_CHANNELS.threadOpen, async (_event, payload) => {
      const source = record(payload)
      const requestId = typeof source.requestId === 'string' && /^ftr_[A-Za-z0-9_-]{6,80}$/.test(source.requestId) ? source.requestId : ''
      const actionAlias = typeof source.actionAlias === 'string' ? source.actionAlias : ''
      if (!requestId) return
      const result = await openCodexThread(actionAlias)
      if (!codexFloatAlive()) return
      try { codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.threadOpenResult, { requestId, result }) } catch {}
    })
    ipc.on(CODEX_FLOAT_CHANNELS.dragStart, (_event, payload) => {
      if (codexFloatDrag || codexFloatResize || !codexFloatAlive() || !codexFloatAnchor) return
      const point = record(payload)
      if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
      codexFloatDrag = {
        interactionId: codexFloatInteractionId(point.interactionId, `legacy-drag-${Date.now()}`),
        pointerX: point.screenX, pointerY: point.screenY,
        bounds: codexFloatWindow.getBounds(), anchor: { ...codexFloatAnchor },
        edge: codexFloatEdge, displayId: codexFloatPositionDisplayId,
        expanded: codexFloatExpanded, pinned: codexFloatPinned, moved: false
      }
      // Native resize during an active press can release Chromium's pointer
      // capture. Hide the edge preview, but retain the native viewport until up.
      if (isEdgeFloat()) codexFloatExpanded = false
      runtimeDiagnostics.record({ scope: 'float-drag', event: 'start', outcome: 'accepted', level: 'info' })
      armCodexFloatInteractionTimeout()
      pushCodexFloatState()
    })
    ipc.on(CODEX_FLOAT_CHANNELS.dragMove, (_event, payload) => {
      if (!sameCodexFloatInteraction(codexFloatDrag, payload) || !codexFloatAlive()) return
      const point = record(payload)
      if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return
      const dx = point.screenX - codexFloatDrag.pointerX
      const dy = point.screenY - codexFloatDrag.pointerY
      if (!codexFloatDrag.moved && Math.hypot(dx, dy) < 5) return
      const display = floatDisplayForPoint({ x: point.screenX, y: point.screenY })
      const start = codexFloatDrag
      let stage = 'write'
      try {
        // PointerEvent screen coordinates can be fractional DIP. Electron's
        // Rectangle contract requires integers, including after subtraction.
        codexFloatWindow.setBounds({ ...start.bounds, x: Math.round(start.bounds.x + dx), y: Math.round(start.bounds.y + dy) })
        stage = 'read'
        const actual = codexFloatWindow.getBounds()
        stage = 'readback'
        if (!actual || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(actual[key]))) throw new TypeError('Invalid native bounds')
        codexFloatAnchor = { ...start.anchor, x: start.anchor.x + actual.x - start.bounds.x, y: start.anchor.y + actual.y - start.bounds.y }
        codexFloatPositionDisplayId = String(display.id)
        start.intent = { dx, dy }
        if (isEdgeFloat() && codexFloatRailLayout) codexFloatRailLayout = { ...codexFloatRailLayout, bounds: actual }
        const moved = actual.x !== start.bounds.x || actual.y !== start.bounds.y
        if (moved && !codexFloatDrag.moved) runtimeDiagnostics.record({ scope: 'float-drag', event: 'move', outcome: 'native-moved', level: 'info' })
        codexFloatDrag.moved = moved
        start.lastErrorStage = ''
      } catch (error) {
        // One classified failure per stage/gesture; never flood logs with every
        // pointer frame or retain raw native messages/coordinates.
        if (start.lastErrorStage !== stage) {
          const errorName = ['Error', 'TypeError', 'RangeError'].includes(error?.name) ? error.name : 'Error'
          const message = String(error?.message || '')
          const reason = /integer|conversion|argument/i.test(message) ? 'invalid-native-argument' : /not a function/i.test(message) ? 'method-unavailable' : 'native-call-failed'
          runtimeDiagnostics.record({ scope: 'float-geometry', event: 'drag-move', outcome: 'failed', code: `${stage}-bounds-failed`, level: 'error', details: { stage, errorName, reason } })
          start.lastErrorStage = stage
        }
      }
      armCodexFloatInteractionTimeout()
      pushCodexFloatState()
    })
    ipc.on(CODEX_FLOAT_CHANNELS.dragEnd, (_event, payload) => {
      if (!sameCodexFloatInteraction(codexFloatDrag, payload) || !codexFloatAlive()) return
      clearCodexFloatInteractionTimer()
      const start = codexFloatDrag
      if (start.moved && (codexFloatAnchor.x !== start.anchor.x || codexFloatAnchor.y !== start.anchor.y)) {
        const display = currentFloatDisplay()
        const previousStyle = codexFloatSnapshot?.style
        const autoDock = previousStyle !== 'edge'
        const snapped = placement.snapAnchor(codexFloatAnchor, display, codexFloatEdge, 'edge', {
          ...start.intent, ...(process.platform === 'darwin' ? { topBoundary: display.workArea?.y } : {})
        })
        if (autoDock) codexFloatSnapshot = { ...codexFloatSnapshot, style: 'edge' }
        applyCodexFloatWorkspaceVisibility()
        codexFloatAnchor = snapped.anchor
        codexFloatEdge = snapped.edge
        // Commit only after a successful native write and actual-bounds readback.
        if (!applyCollapsedAnchor()) {
          codexFloatSnapshot = { ...codexFloatSnapshot, style: previousStyle }
          cancelCodexFloatInteraction(true)
          applyCodexFloatWorkspaceVisibility()
          return
        }
        const actualDisplay = floatDisplayForPoint({ x: codexFloatAnchor.x + codexFloatAnchor.width / 2, y: codexFloatAnchor.y + codexFloatAnchor.height / 2 })
        codexFloatPositionDisplayId = String(actualDisplay.id)
        if (autoDock) codexFloatPendingDock = { style: previousStyle, positionKey: codexFloatSyncedPosition }
        // Finish the gesture before the settings action can synchronously sync.
        codexFloatDrag = null
        persistFloatAnchor(actualDisplay, autoDock)
        const topInset = Math.max(0, Math.round(codexFloatAnchor.y - placement.areaOf(actualDisplay).y))
        runtimeDiagnostics.record({ scope: 'float-drag', event: 'end', outcome: 'saved', level: 'info', details: { edge: codexFloatEdge, style: 'edge', autoDock, ...(codexFloatEdge === 'top' ? { topInset } : {}) } })
      } else {
        codexFloatAnchor = start.anchor
        codexFloatEdge = start.edge
        codexFloatPositionDisplayId = start.displayId
        applyCollapsedAnchor()
      }
      codexFloatDrag = null
      codexFloatPinned = start.pinned
      if (start.pinned || (!isEdgeFloat() && start.expanded)) resizeCodexFloat(true, false)
      applyCodexFloatWorkspaceVisibility()
      pushCodexFloatState()
    })
    ipc.on(CODEX_FLOAT_CHANNELS.resizeStart, (_event, payload) => {
      if (isEdgeFloat() || !codexFloatExpanded || codexFloatDrag || codexFloatResize || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
      const point = record(payload)
      if (!Number.isFinite(point.screenX) || !Number.isFinite(point.screenY) || !validCodexResizeCorner(point.corner)) return
      const bounds = codexFloatWindow.getBounds()
      const display = floatDisplayForPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
      const expectedCorner = codexFloatResizeCorner(bounds, display, codexFloatEdge)
      if (point.corner !== expectedCorner) return
      codexFloatResize = {
        interactionId: codexFloatInteractionId(point.interactionId, `legacy-resize-${Date.now()}`),
        pointerX: point.screenX,
        pointerY: point.screenY,
        bounds: { ...bounds },
        display,
        displayId: String(display.id || ''),
        edge: codexFloatEdge,
        corner: point.corner
      }
      armCodexFloatInteractionTimeout()
      pushCodexFloatState()
    })
    ipc.on(CODEX_FLOAT_CHANNELS.resizeMove, (_event, payload) => {
      const point = record(payload)
      if (!sameCodexFloatInteraction(codexFloatResize, point)) return
      moveCodexFloatResize(point.screenX, point.screenY)
      armCodexFloatInteractionTimeout()
    })
    ipc.on(CODEX_FLOAT_CHANNELS.resizeEnd, (_event, payload) => {
      if (!sameCodexFloatInteraction(codexFloatResize, payload) || !codexFloatAlive() || typeof codexFloatWindow.getBounds !== 'function') return
      clearCodexFloatInteractionTimer()
      const resize = codexFloatResize
      const bounds = codexFloatWindow.getBounds()
      codexFloatResize = null
      pushCodexFloatState()
      if (bounds.width === resize.bounds.width && bounds.height === resize.bounds.height) return
      emitCodexFloatAction('codex.float.geometry.save', {
        position: codexFloatPreferredPosition,
        expandedSize: { displayId: resize.displayId, width: bounds.width, height: bounds.height, updatedAt: Date.now() }
      })
    })
    ipc.on(CODEX_FLOAT_CHANNELS.resizeCancel, (_event, payload) => {
      if (!sameCodexFloatInteraction(codexFloatResize, payload) || !codexFloatAlive()) return
      clearCodexFloatInteractionTimer()
      const bounds = codexFloatResize.bounds
      codexFloatResize = null
      try { codexFloatWindow.setBounds(bounds) } catch {}
      pushCodexFloatState()
    })
    ipc.on(CODEX_FLOAT_CHANNELS.interactionCancel, () => cancelCodexFloatInteraction(true))
    ipc.on(CODEX_FLOAT_CHANNELS.recreate, (_event, payload) => {
      const code = record(payload).code
      const safe = typeof code === 'string' && /^[A-Za-z0-9:_-]{1,80}$/.test(code) ? code : 'request'
      requestCodexFloatRecreate(`float-${safe}`)
    })
    ipc.on(CODEX_FLOAT_CHANNELS.heartbeat, (_event, payload) => {
      if (!codexFloatAlive()) {
        closeExistingCodexFloatWindows(null)
        return
      }
      const source = record(payload)
      const sequence = Number.isInteger(source.sequence) && source.sequence > 0 ? source.sequence : 0
      codexFloatLastHeartbeatAt = Date.now()
      if (codexFloatRecoveryDeadline) {
        runtimeDiagnostics.record({
          level: 'info',
          scope: 'float-health',
          event: 'recovery-window',
          outcome: 'recovered',
          durationMs: Math.max(0, CODEX_FLOAT_RECOVERY_MS - Math.max(0, codexFloatRecoveryDeadline - codexFloatLastHeartbeatAt))
        })
        codexFloatRecoveryDeadline = 0
        codexFloatRecoveryReported = false
      }
      try {
        codexFloatWindow.webContents.send(CODEX_FLOAT_CHANNELS.heartbeatAck, { sequence, receivedAt: codexFloatLastHeartbeatAt })
      } catch {}
    })
  }

  // Kill is a process boundary: clear desired visibility and the health
  // timer with the window. Ordinary hide (mainHide/pluginOut without kill)
  // must not tear down a float the last sync asked to keep -- a renderer
  // remount may call close() without clearing that intent; only
  // sync({visible:false}) or kill may clear it.
  function handleHostVisibility(isKill) {
    if (isKill) {
      if (codexFloatHealthTimer) clearTimeout(codexFloatHealthTimer)
      codexFloatHealthTimer = null
      codexFloatPersistent = false
      closeCodexFloat()
      return
    }
    if (!codexFloatPersistent) closeCodexFloat()
  }

  if (companionTaskKernel?.onPackage) {
    companionTaskKernel.onPackage((taskPackage) => {
      if (!codexFloatSnapshot || typeof codexFloatSnapshot !== 'object') return
      codexFloatSnapshot = { ...codexFloatSnapshot, taskSnapshot: taskPackage }
      pushCodexFloatTaskPackage(taskPackage)
    })
  }

  closeExistingCodexFloatWindows(null)
  installCodexFloatIpc()
  scheduleCodexFloatHealthCheck()

  return {
    revision: CODEX_FLOAT_BRIDGE_REVISION,
    sync: syncCodexFloat,
    activate: activateCodexFloat,
    diagnostics: getCodexFloatWorkspaceDiagnostics,
    resetGeometry: resetCodexFloatGeometry,
    close() {
      // Destroy the child window only. Desired visibility stays owned by
      // sync({ visible }) so a mainHide remount's close() cannot make the
      // following handleHostVisibility(false) treat an enabled float as
      // disposable.
      closeCodexFloat()
    },
    onAction(listener) {
      if (typeof listener !== 'function') return () => {}
      codexFloatActionListeners.add(listener)
      return () => codexFloatActionListeners.delete(listener)
    },
    handleHostVisibility,
    handlePluginEnter,
    // Test-only escape hatch, mirrors the entry's former
    // `window.__codexFloatGeometry` hook -- exposes internal geometry and
    // interaction helpers that have no public IPC-facing method of their own.
    __internal: {
      codexFloatDesiredSize,
      codexFloatExpandedHeight,
      codexFloatCollapsedSize,
      resizeFloatBounds,
      snapFloatBounds,
      moveCodexFloatResize,
      reconcileFloatDisplays
    }
  }
}

module.exports = {
  CODEX_FLOAT_BRIDGE_REVISION,
  CODEX_FLOAT_CHANNELS,
  createCodexFloatBridge
}
