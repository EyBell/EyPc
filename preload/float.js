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
  heartbeatAck: 'eypc-float:heartbeat-ack'
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
  lastState = { expanded: state.expanded === true, pinned: state.pinned === true, resizing: state.resizing === true, resizeCorner, expandedSize }
  for (const listener of stateListeners) {
    try { listener(lastState) } catch {}
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
  setExpansion: (expanded, pinned = false) => sendToParent(CHANNELS.expansion, { expanded: expanded === true, pinned: expanded === true && pinned === true }),
  returnFocus: () => sendToParent(CHANNELS.returnFocus, {}),
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
