const { ipcRenderer } = require('electron')

let runtimeIdentityArtifact = null
let childEnvelopeContractsV7 = null
try { runtimeIdentityArtifact = require('./runtime-identity.cjs') } catch {}
try { childEnvelopeContractsV7 = require('./companion/contracts-v7.cjs') } catch {}

const CHANNELS = {
  snapshot: 'eypc-action-runner:snapshot',
  log: 'eypc-action-runner:log',
  logRequest: 'eypc-action-runner:log-request',
  action: 'eypc-action-runner:action',
  snapshotRequest: 'eypc-action-runner:snapshot-request',
  hide: 'eypc-action-runner:hide',
  dragStart: 'eypc-action-runner:drag-start',
  dragMove: 'eypc-action-runner:drag-move',
  dragEnd: 'eypc-action-runner:drag-end',
  resizeStart: 'eypc-action-runner:resize-start',
  resizeMove: 'eypc-action-runner:resize-move',
  resizeEnd: 'eypc-action-runner:resize-end',
  resizeCancel: 'eypc-action-runner:resize-cancel'
}

let lastSnapshot = null
const snapshotListeners = new Set()
const logListeners = new Set()
let childRequestSequence = 0

function nextChildRequestId() {
  childRequestSequence = (childRequestSequence + 1) % Number.MAX_SAFE_INTEGER
  return `action:${Date.now().toString(36)}:${childRequestSequence.toString(36)}`
}

function createActionEnvelope(channel, payload, metadata = {}) {
  return childEnvelopeContractsV7?.createChildEnvelopeV7?.({
    runtimeIdentity: String(runtimeIdentityArtifact?.hostAssetId || ''),
    surfaceId: 'action',
    channel,
    payloadRevision: Number.isSafeInteger(metadata.payloadRevision) ? metadata.payloadRevision : 0,
    requestId: metadata.requestId,
    logCursor: metadata.logCursor,
    payload
  }) || null
}

function actionEnvelopePayload(value, channel) {
  const envelope = childEnvelopeContractsV7?.normalizeChildEnvelopeV7?.(value, { surfaceId: 'action', channel }) || null
  if (!envelope || envelope.runtimeIdentity !== String(runtimeIdentityArtifact?.hostAssetId || '')) return null
  return envelope.payload
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
  if (!snapshot || typeof snapshot !== 'object' || snapshot.version !== 1) return
  lastSnapshot = snapshot
  for (const listener of snapshotListeners) {
    try { listener(snapshot) } catch {}
  }
})

ipcRenderer.on(CHANNELS.log, (_event, envelope) => {
  const delta = actionEnvelopePayload(envelope, CHANNELS.log)
  if (!delta || typeof delta !== 'object' || delta.version !== 1) return
  for (const listener of logListeners) {
    try { listener(delta) } catch {}
  }
})

window.eypcActionRunner = {
  getSnapshot: () => lastSnapshot,
  onSnapshot(listener) {
    if (typeof listener !== 'function') return () => {}
    snapshotListeners.add(listener)
    if (lastSnapshot) listener(lastSnapshot)
    return () => snapshotListeners.delete(listener)
  },
  onLog(listener) {
    if (typeof listener !== 'function') return () => {}
    logListeners.add(listener)
    return () => logListeners.delete(listener)
  },
  action(actionId, args = {}) {
    if (typeof actionId !== 'string' || !/^codex\.actionRunner\.[A-Za-z0-9._-]+$/.test(actionId)) return false
    return sendToParent(CHANNELS.action, { actionId, args: args && typeof args === 'object' ? args : {} })
  },
  requestSnapshot: () => sendToParent(CHANNELS.snapshotRequest, {}),
  requestLog(runId, cursor = 0) {
    if (typeof runId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(runId)) return false
    const safeCursor = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0
    const envelope = createActionEnvelope(CHANNELS.logRequest, { runId, cursor: safeCursor }, {
      requestId: nextChildRequestId(),
      payloadRevision: safeCursor,
      logCursor: safeCursor
    })
    return Boolean(envelope) && sendToParent(CHANNELS.logRequest, envelope)
  },
  hide: () => sendToParent(CHANNELS.hide, {}),
  dragStart: (screenX, screenY) => sendToParent(CHANNELS.dragStart, { screenX, screenY }),
  dragMove: (screenX, screenY) => sendToParent(CHANNELS.dragMove, { screenX, screenY }),
  dragEnd: () => sendToParent(CHANNELS.dragEnd, {}),
  resizeStart: (screenX, screenY, corner) => sendToParent(CHANNELS.resizeStart, { screenX, screenY, corner }),
  resizeMove: (screenX, screenY) => sendToParent(CHANNELS.resizeMove, { screenX, screenY }),
  resizeEnd: () => sendToParent(CHANNELS.resizeEnd, {}),
  resizeCancel: () => sendToParent(CHANNELS.resizeCancel, {})
}
