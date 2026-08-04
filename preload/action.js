const { ipcRenderer } = require('electron')

const CHANNELS = {
  snapshot: 'eypc-action-runner:snapshot',
  log: 'eypc-action-runner:log',
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

ipcRenderer.on(CHANNELS.log, (_event, delta) => {
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
  hide: () => sendToParent(CHANNELS.hide, {}),
  dragStart: (screenX, screenY) => sendToParent(CHANNELS.dragStart, { screenX, screenY }),
  dragMove: (screenX, screenY) => sendToParent(CHANNELS.dragMove, { screenX, screenY }),
  dragEnd: () => sendToParent(CHANNELS.dragEnd, {}),
  resizeStart: (screenX, screenY, corner) => sendToParent(CHANNELS.resizeStart, { screenX, screenY, corner }),
  resizeMove: (screenX, screenY) => sendToParent(CHANNELS.resizeMove, { screenX, screenY }),
  resizeEnd: () => sendToParent(CHANNELS.resizeEnd, {}),
  resizeCancel: () => sendToParent(CHANNELS.resizeCancel, {})
}
