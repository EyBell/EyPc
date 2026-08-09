const { ipcRenderer } = require('electron')

const RUNTIME_IDENTITY_REVISION = 'runtime-identity-v1'
let runtimeIdentityArtifact = null
try { runtimeIdentityArtifact = require('./runtime-identity.cjs') } catch {}
let runtimeIdentityCompatible = false

function runtimeIdentityHandshake(input = {}) {
  const expected = input && typeof input === 'object' ? input : {}
  const actual = {
    hostAssetId: typeof runtimeIdentityArtifact?.hostAssetId === 'string' ? runtimeIdentityArtifact.hostAssetId : '',
    rendererAssetId: typeof runtimeIdentityArtifact?.rendererAssetId === 'string' ? runtimeIdentityArtifact.rendererAssetId : '',
    kernelRevision: typeof runtimeIdentityArtifact?.kernelRevision === 'string' ? runtimeIdentityArtifact.kernelRevision : '',
    taskPackageRevision: typeof runtimeIdentityArtifact?.taskPackageRevision === 'string' ? runtimeIdentityArtifact.taskPackageRevision : ''
  }
  const expectation = {
    hostAssetId: typeof expected.hostAssetId === 'string' ? expected.hostAssetId : '',
    rendererAssetId: typeof expected.rendererAssetId === 'string' ? expected.rendererAssetId : '',
    kernelRevision: typeof expected.kernelRevision === 'string' ? expected.kernelRevision : '',
    taskPackageRevision: typeof expected.taskPackageRevision === 'string' ? expected.taskPackageRevision : ''
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
  resizeCancel: 'eypc-float:resize-cancel'
}

let lastSnapshot = null
let lastState = { expanded: false, pinned: false, resizing: false, resizeCorner: null, expandedSize: null }
const snapshotListeners = new Set()
const stateListeners = new Set()
const activationListeners = new Set()
const transientRequests = new Map()
let transientSequence = 0

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

ipcRenderer.on(CHANNELS.snapshot, (_event, snapshot) => {
  if (!snapshot || typeof snapshot !== 'object' || (snapshot.version !== 1 && snapshot.version !== 2)) return
  lastSnapshot = snapshot
  for (const listener of snapshotListeners) {
    try { listener(snapshot) } catch {}
  }
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

window.eypcFloat = {
  runtimeIdentity: {
    revision: RUNTIME_IDENTITY_REVISION,
    handshake: runtimeIdentityHandshake
  },
  getSnapshot: () => lastSnapshot,
  getState: () => lastState,
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
  dragStart: (screenX, screenY) => sendToParent(CHANNELS.dragStart, { screenX, screenY }),
  dragMove: (screenX, screenY) => sendToParent(CHANNELS.dragMove, { screenX, screenY }),
  dragEnd: () => sendToParent(CHANNELS.dragEnd, {}),
  resizeStart: (screenX, screenY, corner) => sendToParent(CHANNELS.resizeStart, { screenX, screenY, corner }),
  resizeMove: (screenX, screenY) => sendToParent(CHANNELS.resizeMove, { screenX, screenY }),
  resizeEnd: () => sendToParent(CHANNELS.resizeEnd, {}),
  resizeCancel: () => sendToParent(CHANNELS.resizeCancel, {})
}
