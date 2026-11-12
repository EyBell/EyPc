const { ipcRenderer } = require('electron')

const RUNTIME_IDENTITY_REVISION = 'runtime-identity-v2'
let runtimeIdentityArtifact = null
try { runtimeIdentityArtifact = require('./runtime-identity.cjs') } catch {}
let runtimeIdentityCompatible = false

function runtimeIdentityHandshake(input = {}) {
  const expected = input && typeof input === 'object' ? input : {}
  const actual = {
    hostAssetId: typeof runtimeIdentityArtifact?.hostAssetId === 'string' ? runtimeIdentityArtifact.hostAssetId : '',
    rendererAssetId: typeof runtimeIdentityArtifact?.rendererAssetId === 'string' ? runtimeIdentityArtifact.rendererAssetId : '',
    kernelRevision: typeof runtimeIdentityArtifact?.kernelRevision === 'string' ? runtimeIdentityArtifact.kernelRevision : '',
    registryRevision: typeof runtimeIdentityArtifact?.registryRevision === 'string' ? runtimeIdentityArtifact.registryRevision : '',
    topologyRevision: typeof runtimeIdentityArtifact?.topologyRevision === 'string' ? runtimeIdentityArtifact.topologyRevision : '',
    taskPackageRevision: typeof runtimeIdentityArtifact?.taskPackageRevision === 'string' ? runtimeIdentityArtifact.taskPackageRevision : '',
    commandRevision: typeof runtimeIdentityArtifact?.commandRevision === 'string' ? runtimeIdentityArtifact.commandRevision : '',
    subscribeRevision: typeof runtimeIdentityArtifact?.subscribeRevision === 'string' ? runtimeIdentityArtifact.subscribeRevision : '',
    ackRevision: typeof runtimeIdentityArtifact?.ackRevision === 'string' ? runtimeIdentityArtifact.ackRevision : ''
  }
  const expectation = {
    hostAssetId: typeof expected.hostAssetId === 'string' ? expected.hostAssetId : '',
    rendererAssetId: typeof expected.rendererAssetId === 'string' ? expected.rendererAssetId : '',
    kernelRevision: typeof expected.kernelRevision === 'string' ? expected.kernelRevision : '',
    registryRevision: typeof expected.registryRevision === 'string' ? expected.registryRevision : '',
    topologyRevision: typeof expected.topologyRevision === 'string' ? expected.topologyRevision : '',
    taskPackageRevision: typeof expected.taskPackageRevision === 'string' ? expected.taskPackageRevision : '',
    commandRevision: typeof expected.commandRevision === 'string' ? expected.commandRevision : '',
    subscribeRevision: typeof expected.subscribeRevision === 'string' ? expected.subscribeRevision : '',
    ackRevision: typeof expected.ackRevision === 'string' ? expected.ackRevision : ''
  }
  runtimeIdentityCompatible = runtimeIdentityArtifact?.revision === RUNTIME_IDENTITY_REVISION
    && runtimeIdentityArtifact?.artifactState === 'artifact-ready'
    && Object.keys(actual).every((key) => actual[key] && actual[key] === expectation[key])
  return {
    revision: RUNTIME_IDENTITY_REVISION,
    status: runtimeIdentityCompatible ? 'host-loaded' : 'reload-required',
    expected: expectation,
    actual,
    artifactState: runtimeIdentityArtifact?.artifactState === 'artifact-ready' ? 'artifact-ready' : 'missing',
    builtAt: typeof runtimeIdentityArtifact?.builtAt === 'string' ? runtimeIdentityArtifact.builtAt : '',
    builtAtLocal: typeof runtimeIdentityArtifact?.builtAtLocal === 'string' ? runtimeIdentityArtifact.builtAtLocal : '',
    packageVersion: typeof runtimeIdentityArtifact?.packageVersion === 'string' ? runtimeIdentityArtifact.packageVersion : '',
    kernelRevision: actual.kernelRevision,
    taskPackageRevision: actual.taskPackageRevision,
    message: runtimeIdentityCompatible
      ? 'Float Preload 已加载当前构建'
      : `Float Preload ${actual.hostAssetId || 'unknown'} / UI ${expectation.hostAssetId || 'unknown'}，需要重新打开 Float`
  }
}

const CHANNELS = {
  snapshot: 'eypc-float:snapshot',
  taskPackage: 'eypc-float:task-package',
  taskPackageAck: 'eypc-float:task-package-ack',
  state: 'eypc-float:state',
  transitionReady: 'eypc-float:transition-ready',
  presentationReady: 'eypc-float:presentation-ready',
  mousePassthrough: 'eypc-float:mouse-passthrough',
  renderObserved: 'eypc-float:render-observed',
  interactionObserved: 'eypc-float:interaction-observed',
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

let lastSnapshot = null
let lastBaseSnapshotRevision = 0
let lastTaskPackageRevision = 0
let lastState = { expanded: false, pinned: false, resizing: false, resizeCorner: null, expandedSize: null }
const snapshotListeners = new Set()
const stateListeners = new Set()
const activationListeners = new Set()
const transientRequests = new Map()
let transientSequence = 0
let interactionSequence = 0
let activeDragInteractionId = ''
let activeResizeInteractionId = ''
let heartbeatSequence = 0
let heartbeatTimer = null
let lastHeartbeatAckAt = 0
let observedExpansion = null
let renderObservationSequence = 0
let expansionRequestSequence = 0
const interactionObservations = new Map()

function nextInteractionId(kind) {
  interactionSequence = (interactionSequence + 1) % Number.MAX_SAFE_INTEGER
  return `${kind}:${Date.now().toString(36)}:${interactionSequence.toString(36)}`
}

function transientRequest(channel, payload, timeoutMs = 30_000) {
  transientSequence = (transientSequence + 1) % Number.MAX_SAFE_INTEGER
  const requestId = `ftr_${Date.now().toString(36)}_${transientSequence.toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      transientRequests.delete(requestId)
      resolve({ outcome: 'failed', errorCode: 'timeout', message: '请求响应超时', retryAllowed: true })
    }, timeoutMs)
    transientRequests.set(requestId, { resolve, timeoutId })
    if (!sendToParent(channel, { requestId, ...payload })) {
      clearTimeout(timeoutId)
      transientRequests.delete(requestId)
      resolve({ outcome: 'failed', errorCode: 'unavailable', message: '浮窗桥接不可用', retryAllowed: true })
    }
  })
}

function resolveTransientRequest(payload) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const pending = transientRequests.get(source.requestId)
  if (!pending) return
  clearTimeout(pending.timeoutId)
  transientRequests.delete(source.requestId)
  pending.resolve(Object.prototype.hasOwnProperty.call(source, 'result') ? source.result : { outcome: 'failed', errorCode: 'protocol-error', message: '请求结果无效', retryAllowed: true })
}

function sendToParent(channel, payload) {
  try {
    if (globalThis.utools && typeof globalThis.utools.sendToParent === 'function') {
      globalThis.utools.sendToParent(channel, payload)
      return true
    }
  } catch {}
  return false
}

function taskPackageRevision(value) {
  const revision = Number(value && typeof value === 'object' ? value.packageRevision : 0)
  return Number.isInteger(revision) && revision > 0 ? revision : 0
}

function baseSnapshotRevision(value) {
  const revision = Number(value && typeof value === 'object' ? value.baseRevision : 0)
  return Number.isInteger(revision) && revision > 0 ? revision : 0
}

function sendTaskPackageAck(stage, sentRevision, reason) {
  const revision = Number.isInteger(sentRevision) && sentRevision > 0 ? sentRevision : lastTaskPackageRevision
  if (!revision) return false
  return sendToParent(CHANNELS.taskPackageAck, {
    revision,
    sentRevision: revision,
    currentRevision: lastTaskPackageRevision,
    stage,
    ...(reason ? { reason } : {})
  })
}

function notifySnapshotListeners(snapshot) {
  for (const listener of snapshotListeners) {
    try { listener(snapshot) } catch {}
  }
}

function acceptTaskPackage(taskPackage, sentRevision, baseSnapshot = lastSnapshot, options = {}) {
  const revision = taskPackageRevision(taskPackage)
  if (!revision
    || sentRevision !== revision
    || taskPackage?.schema !== runtimeIdentityArtifact?.taskPackageRevision
    || taskPackage?.kernelRevision !== runtimeIdentityArtifact?.kernelRevision
    || taskPackage?.registryRevision !== 'companion-provider-registry-v1'
    || taskPackage?.topologySchemaRevision !== 'companion-task-topology-v2'
    || taskPackage?.commandRevision !== 'companion-task-command-v1') {
    sendTaskPackageAck('rejected', Number.isInteger(sentRevision) ? sentRevision : revision, 'invalid-payload')
    return false
  }
  if (revision < lastTaskPackageRevision) {
    sendTaskPackageAck('rejected', revision, 'older-revision')
    return false
  }
  if (revision === lastTaskPackageRevision) {
    lastSnapshot = { ...(baseSnapshot || lastSnapshot || {}), taskSnapshot: taskPackage }
    sendTaskPackageAck('received', revision)
    // A retry may mean the Host missed the Renderer ACK. Re-deliver the same
    // immutable snapshot so the Renderer can re-ack a revision it has already
    // proven rendered; the preload itself never manufactures that proof.
    notifySnapshotListeners(lastSnapshot)
    return true
  }
  lastTaskPackageRevision = revision
  lastSnapshot = { ...(baseSnapshot || {}), taskSnapshot: taskPackage }
  sendTaskPackageAck('received', revision)
  notifySnapshotListeners(lastSnapshot)
  return true
}

ipcRenderer.on(CHANNELS.snapshot, (_event, snapshot) => {
  if (!snapshot || typeof snapshot !== 'object' || (snapshot.version !== 1 && snapshot.version !== 2)) return
  const incomingBaseRevision = baseSnapshotRevision(snapshot)
  if (lastBaseSnapshotRevision > 0 && incomingBaseRevision === 0) return
  if (incomingBaseRevision > 0 && incomingBaseRevision < lastBaseSnapshotRevision) return
  const baseAdvanced = incomingBaseRevision === 0 || incomingBaseRevision > lastBaseSnapshotRevision
  if (incomingBaseRevision > 0) lastBaseSnapshotRevision = Math.max(lastBaseSnapshotRevision, incomingBaseRevision)
  const taskPackage = snapshot.taskSnapshot
  const baseSnapshot = taskPackage
    ? snapshot
    : { ...snapshot, ...(lastSnapshot?.taskSnapshot ? { taskSnapshot: lastSnapshot.taskSnapshot } : {}) }
  if (taskPackage) {
    acceptTaskPackage(taskPackage, taskPackageRevision(taskPackage), baseSnapshot, { notify: baseAdvanced })
    return
  }
  if (!baseAdvanced) return
  lastSnapshot = baseSnapshot
  notifySnapshotListeners(lastSnapshot)
})

ipcRenderer.on(CHANNELS.taskPackage, (_event, payload) => {
  const source = payload && typeof payload === 'object' ? payload : {}
  acceptTaskPackage(source.taskSnapshot, Number(source.sentRevision), lastSnapshot)
})

ipcRenderer.on(CHANNELS.state, (_event, state) => {
  if (!state || typeof state !== 'object') return
  const resizeCorner = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(state.resizeCorner) ? state.resizeCorner : null
  const expandedSize = state.expandedSize && typeof state.expandedSize === 'object' ? {
    displayId: typeof state.expandedSize.displayId === 'string' ? state.expandedSize.displayId : '',
    width: Number.isFinite(state.expandedSize.width) ? state.expandedSize.width : 0,
    height: Number.isFinite(state.expandedSize.height) ? state.expandedSize.height : 0,
    manual: state.expandedSize.manual === true
  } : null
  const safeRect = (value) => value && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key])) && value.width > 0 && value.height > 0
    ? { x: value.x, y: value.y, width: value.width, height: value.height } : null
  const geometry = state.placement
  const placement = geometry && safeRect(geometry.bounds) && safeRect(geometry.rail) && safeRect(geometry.slot)
    ? { bounds: safeRect(geometry.bounds), rail: safeRect(geometry.rail), slot: safeRect(geometry.slot), panel: safeRect(geometry.panel) } : undefined
  const panel = safeRect(state.panel)
  const compactOffset = state.compactOffset && Number.isFinite(state.compactOffset.x) && Number.isFinite(state.compactOffset.y)
    ? { x: state.compactOffset.x, y: state.compactOffset.y } : undefined
  const sourceTransition = state.transition
  const sourceLayout = sourceTransition?.layout
  const transitionLayout = sourceLayout && safeRect(sourceLayout.anchor) && safeRect(sourceLayout.expandedBounds) && safeRect(sourceLayout.workArea)
    && sourceLayout.compactOffset && Number.isFinite(sourceLayout.compactOffset.x) && Number.isFinite(sourceLayout.compactOffset.y)
    ? { anchor: safeRect(sourceLayout.anchor), expandedBounds: safeRect(sourceLayout.expandedBounds), workArea: safeRect(sourceLayout.workArea),
      compactOffset: { x: sourceLayout.compactOffset.x, y: sourceLayout.compactOffset.y },
      displayId: typeof sourceLayout.displayId === 'string' ? sourceLayout.displayId : '', constrained: sourceLayout.constrained === true,
      corner: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(sourceLayout.corner) ? sourceLayout.corner : null } : undefined
  const transition = sourceTransition && Number.isSafeInteger(sourceTransition.id) && Number.isSafeInteger(sourceTransition.windowGeneration)
    && ['expanding', 'collapsing', 'expanded', 'collapsed'].includes(sourceTransition.phase)
    ? { id: sourceTransition.id, windowGeneration: sourceTransition.windowGeneration, phase: sourceTransition.phase, ...(transitionLayout ? { layout: transitionLayout } : {}) } : undefined
  const parked = state.parked === true
  const presentation = Number.isSafeInteger(state.presentationId) && state.presentationId > 0
    && Number.isSafeInteger(state.windowGeneration) && state.windowGeneration > 0
    ? { presentationId: state.presentationId, windowGeneration: state.windowGeneration } : {}
  const extra = { ...presentation, ...(panel ? { panel } : {}), ...(parked ? { parked: true } : {}), ...(['water', 'card', 'edge'].includes(state.style) ? { style: state.style } : {}), ...(typeof state.dragging === 'boolean' ? { dragging: state.dragging } : {}), ...(['left', 'right', 'top', 'bottom'].includes(state.edge) ? { edge: state.edge } : {}), ...(['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(state.corner) ? { corner: state.corner } : {}), ...(placement ? { placement } : {}), ...(compactOffset ? { compactOffset } : {}), ...(transition ? { transition } : {}) }
  const viewportSize = state.viewportSize && Number.isFinite(state.viewportSize.width) && state.viewportSize.width > 0
    && Number.isFinite(state.viewportSize.height) && state.viewportSize.height > 0
    ? { width: state.viewportSize.width, height: state.viewportSize.height } : undefined
  lastState = { ...extra, ...(viewportSize ? { viewportSize } : {}), expanded: state.expanded === true, pinned: state.pinned === true, resizing: state.resizing === true, resizeCorner, expandedSize }
  for (const listener of stateListeners) {
    try { listener(lastState) } catch {}
  }
  const observationContext = {
    windowGeneration: Number.isSafeInteger(state.windowGeneration) ? state.windowGeneration : 0,
    geometrySequence: Number.isSafeInteger(state.geometrySequence) ? state.geometrySequence : 0,
    requestId: Number.isSafeInteger(state.expansionRequestId) ? state.expansionRequestId : 0
  }
  const observationKey = JSON.stringify([lastState.expanded, observationContext])
  if (typeof process !== 'undefined' && process.platform === 'win32' && observedExpansion !== observationKey) {
    observedExpansion = observationKey
    const sequence = ++renderObservationSequence
    setTimeout(() => {
      if (sequence !== renderObservationSequence || typeof document === 'undefined') return
      const panel = document.querySelector('.float-expanded-card')
      const bounds = panel?.getBoundingClientRect()
      const style = panel && typeof getComputedStyle === 'function' ? getComputedStyle(panel) : null
      const panelX = bounds?.left ?? bounds?.x ?? 0
      const panelY = bounds?.top ?? bounds?.y ?? 0
      const panelOpacity = style ? Number(style.opacity || 1) : null
      const documentVisible = document.visibilityState !== 'hidden'
      const intersectsViewport = Boolean(bounds && bounds.width > 0 && bounds.height > 0
        && panelX < window.innerWidth && panelY < window.innerHeight
        && panelX + bounds.width > 0 && panelY + bounds.height > 0)
      sendToParent(CHANNELS.renderObserved, {
        ...observationContext,
        expanded: lastState.expanded,
        panelPresent: Boolean(panel),
        compactPresent: Boolean(document.querySelector('.float-compact')),
        panelVisible: Boolean(panel && intersectsViewport && documentVisible && panelOpacity > 0
          && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.visibility !== 'collapse'),
        intersectsViewport, documentVisible, panelOpacity, panelX, panelY,
        viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        panelWidth: bounds?.width || 0, panelHeight: bounds?.height || 0
      })
    }, 120)
  }
})

ipcRenderer.on(CHANNELS.activate, (_event, payload) => {
  for (const listener of activationListeners) {
    try { listener(payload || {}) } catch {}
  }
})

ipcRenderer.on(CHANNELS.threadCreateResult, (_event, payload) => resolveTransientRequest(payload))
ipcRenderer.on(CHANNELS.threadOpenResult, (_event, payload) => resolveTransientRequest(payload))
ipcRenderer.on(CHANNELS.blankOpenResult, (_event, payload) => resolveTransientRequest(payload))
ipcRenderer.on(CHANNELS.copyTextResult, (_event, payload) => resolveTransientRequest(payload))
ipcRenderer.on(CHANNELS.heartbeatAck, (_event, payload) => {
  const source = payload && typeof payload === 'object' ? payload : {}
  if (Number.isInteger(source.sequence) && source.sequence > 0) lastHeartbeatAckAt = Date.now()
})

function scheduleHeartbeat() {
  if (heartbeatTimer) clearTimeout(heartbeatTimer)
  heartbeatTimer = setTimeout(() => {
    heartbeatTimer = null
    heartbeatSequence = (heartbeatSequence + 1) % Number.MAX_SAFE_INTEGER || 1
    sendToParent(CHANNELS.heartbeat, { sequence: heartbeatSequence, sentAt: Date.now() })
    scheduleHeartbeat()
  }, 2_000)
  heartbeatTimer?.unref?.()
}

scheduleHeartbeat()

window.eypcFloat = {
  runtimeIdentity: {
    revision: RUNTIME_IDENTITY_REVISION,
    handshake: runtimeIdentityHandshake
  },
  getSnapshot: () => lastSnapshot,
  getState: () => lastState,
  getHealth: () => ({ heartbeatSequence, lastHeartbeatAckAt }),
  ackTaskSnapshot: (stage, revision, reason) => {
    if (!['applied', 'rejected'].includes(stage)) return false
    if (!Number.isInteger(revision) || revision <= 0 || revision > lastTaskPackageRevision) return false
    return sendTaskPackageAck(stage, revision, stage === 'rejected' ? reason : undefined)
  },
  onSnapshot(listener) {
    if (typeof listener !== 'function') return () => {}
    snapshotListeners.add(listener)
    if (lastSnapshot) listener(lastSnapshot)
    return () => snapshotListeners.delete(listener)
  },
  onState(listener) {
    if (typeof listener !== 'function') return () => {}
    stateListeners.add(listener)
    listener(lastState)
    return () => stateListeners.delete(listener)
  },
  onActivate(listener) {
    if (typeof listener !== 'function') return () => {}
    activationListeners.add(listener)
    return () => activationListeners.delete(listener)
  },
  setExpansion: (expanded, pinned = false) => sendToParent(CHANNELS.expansion, {
    expanded: expanded === true, pinned: expanded === true && pinned === true,
    requestId: ++expansionRequestSequence
  }),
  transitionReady: (id, windowGeneration) => sendToParent(CHANNELS.transitionReady, { id, windowGeneration }),
  presentationReady: (id, windowGeneration) => sendToParent(CHANNELS.presentationReady, { id, windowGeneration }),
  setMousePassthrough: (enabled) => sendToParent(CHANNELS.mousePassthrough, { enabled: enabled === true }),
  observeInteraction: (event, details = {}) => {
    if (typeof process === 'undefined' || process.platform !== 'win32') return false
    if (!['compact-hover', 'expansion-intent', 'hover-leave'].includes(event)) return false
    const observation = {
      event, blocked: details.blocked === true, reason: details.reason,
      expanded: details.expanded === true, hostExpanded: details.hostExpanded === true,
      nextExpanded: details.nextExpanded === true, upperZone: details.upperZone === true
    }
    const signature = JSON.stringify(observation)
    const previous = interactionObservations.get(event)
    if (previous?.signature === signature && Date.now() - previous.at < 250) return false
    interactionObservations.set(event, { signature, at: Date.now() })
    if (event === 'hover-leave') interactionObservations.delete('compact-hover')
    return sendToParent(CHANNELS.interactionObserved, observation)
  },
  returnFocus: () => sendToParent(CHANNELS.returnFocus, {}),
  requestRecreate: (code) => sendToParent(CHANNELS.recreate, {
    code: typeof code === 'string' && /^[A-Za-z0-9:_-]{1,80}$/.test(code) ? code : 'identity-mismatch'
  }),
  action: (actionId, args = {}) => runtimeIdentityCompatible && sendToParent(CHANNELS.action, { actionId, args }),
  createThread: (request) => runtimeIdentityCompatible
    ? transientRequest(CHANNELS.threadCreate, { request })
    : Promise.resolve({ outcome: 'failed', errorCode: 'reload-required', message: 'Float 运行版本不一致，请重新打开悬浮卡片' }),
  reopenThread: (actionAlias) => runtimeIdentityCompatible
    ? transientRequest(CHANNELS.threadOpen, { actionAlias })
    : Promise.resolve({ outcome: 'failed', errorCode: 'reload-required', message: 'Float 运行版本不一致，请重新打开悬浮卡片' }),
  openBlank: () => runtimeIdentityCompatible
    ? transientRequest(CHANNELS.blankOpen, {})
    : Promise.resolve({ outcome: 'failed', errorCode: 'reload-required', message: 'Float 运行版本不一致，请重新打开悬浮卡片' }),
  copyText: (text) => transientRequest(CHANNELS.copyText, { text: typeof text === 'string' ? text : '' }),
  dragStart: (screenX, screenY) => {
    const interactionId = nextInteractionId('drag')
    const sent = sendToParent(CHANNELS.dragStart, { screenX, screenY, interactionId })
    activeDragInteractionId = sent ? interactionId : ''
    return sent
  },
  dragMove: (screenX, screenY) => Boolean(activeDragInteractionId)
    && sendToParent(CHANNELS.dragMove, { screenX, screenY, interactionId: activeDragInteractionId }),
  dragEnd: () => {
    const interactionId = activeDragInteractionId
    activeDragInteractionId = ''
    return Boolean(interactionId) && sendToParent(CHANNELS.dragEnd, { interactionId })
  },
  resizeStart: (screenX, screenY, corner) => {
    const interactionId = nextInteractionId('resize')
    const sent = sendToParent(CHANNELS.resizeStart, { screenX, screenY, corner, interactionId })
    activeResizeInteractionId = sent ? interactionId : ''
    return sent
  },
  resizeMove: (screenX, screenY) => Boolean(activeResizeInteractionId)
    && sendToParent(CHANNELS.resizeMove, { screenX, screenY, interactionId: activeResizeInteractionId }),
  resizeEnd: () => {
    const interactionId = activeResizeInteractionId
    activeResizeInteractionId = ''
    return Boolean(interactionId) && sendToParent(CHANNELS.resizeEnd, { interactionId })
  },
  resizeCancel: () => {
    const interactionId = activeResizeInteractionId
    activeResizeInteractionId = ''
    return Boolean(interactionId) && sendToParent(CHANNELS.resizeCancel, { interactionId })
  },
  cancelInteraction: () => {
    activeDragInteractionId = ''
    activeResizeInteractionId = ''
    return sendToParent(CHANNELS.interactionCancel, {})
  }
}
