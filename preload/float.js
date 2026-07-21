const { ipcRenderer } = require('electron')

const CHANNELS = {
  snapshot: 'eypc-float:snapshot',
  state: 'eypc-float:state',
  activate: 'eypc-float:activate',
  expansion: 'eypc-float:expansion',
  action: 'eypc-float:action',
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

window.eypcFloat = {
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
  action: (actionId, args = {}) => sendToParent(CHANNELS.action, { actionId, args }),
  dragStart: (screenX, screenY) => sendToParent(CHANNELS.dragStart, { screenX, screenY }),
  dragMove: (screenX, screenY) => sendToParent(CHANNELS.dragMove, { screenX, screenY }),
  dragEnd: () => sendToParent(CHANNELS.dragEnd, {}),
  resizeStart: (screenX, screenY, corner) => sendToParent(CHANNELS.resizeStart, { screenX, screenY, corner }),
  resizeMove: (screenX, screenY) => sendToParent(CHANNELS.resizeMove, { screenX, screenY }),
  resizeEnd: () => sendToParent(CHANNELS.resizeEnd, {}),
  resizeCancel: () => sendToParent(CHANNELS.resizeCancel, {})
}
