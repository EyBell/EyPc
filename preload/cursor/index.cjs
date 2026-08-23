'use strict'

/**
 * Cursor Agent companion facade.
 *
 * Cold inventory stays read-only. Hook registration writes only the user-level
 * `hooks.json` after an explicit UI confirmation. Open dispatches Cursor's own
 * `agent?id=<composerId>` deep link (verified on Cursor 3.17.8 to focus the
 * exact local conversation) and reports `dispatched`, never a read confirmation.
 * Archive is the one confirmed state write: it flips the App's own
 * `isArchived` pair on a single `composerHeaders` row after re-verifying the
 * task is not live (see `archive.cjs`). Conversation bodies are never read.
 */

const CURSOR_BRIDGE_REVISION = 'cursor-agent-companion-v5'
const { createInventoryReader } = require('./inventory.cjs')
const { createEventQueue } = require('./events.cjs')
const { HOOK_SCRIPT_NAME, hookScript, settingsCommandLine } = require('./scripts.cjs')
const { EYPC_MARKER, withEypcHooks, withoutEypcHooks, hookInstallState } = require('./settings.cjs')
const { createOpener } = require('./open.cjs')
const { createArchiver } = require('./archive.cjs')

function defaultHooksPath(os, pathModule) {
  const home = typeof os.homedir === 'function' ? os.homedir() : ''
  return pathModule.join(home, '.cursor', 'hooks.json')
}

function createCursorBridge(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path
  const os = dependencies.os || { homedir: () => '' }
  const dataDirectory = typeof dependencies.dataDirectory === 'string' ? dependencies.dataDirectory : ''
  const inventory = createInventoryReader(dependencies)
  const opener = createOpener(dependencies)
  const archiver = createArchiver(dependencies)
  const queue = dataDirectory
    ? createEventQueue({ ...dependencies, fs, path, directory: dataDirectory })
    : null
  const hookCommandPath = dataDirectory ? path.join(dataDirectory, HOOK_SCRIPT_NAME) : ''
  const hookCommandLine = hookCommandPath
    ? settingsCommandLine(hookCommandPath, dependencies.platform)
    : ''
  const hooksPath = typeof dependencies.hooksPath === 'string' && dependencies.hooksPath
    ? dependencies.hooksPath
    : defaultHooksPath(os, path)

  let eventWatchDispose = null
  let inventoryWatchDispose = null
  const eventWatchListeners = new Set()
  const inventoryWatchListeners = new Set()

  function hooksFilePath() {
    return hooksPath
  }

  function inspectHooksFile() {
    try {
      if (typeof fs.existsSync === 'function' && !fs.existsSync(hooksPath)) {
        return { state: 'missing', value: {}, raw: '' }
      }
      const raw = fs.readFileSync(hooksPath, 'utf8')
      if (!String(raw || '').trim()) return { state: 'missing', value: {}, raw: String(raw || '') }
      try {
        const value = JSON.parse(raw)
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return { state: 'unparseable', reason: 'hooks.json 不是对象', raw }
        }
        return { state: 'ok', value, raw }
      } catch {
        return { state: 'unparseable', reason: '无法解析 hooks.json', raw }
      }
    } catch {
      return { state: 'unreadable', reason: '无法读取 hooks.json' }
    }
  }

  function readableHooks() {
    const result = inspectHooksFile()
    if (result.state === 'unparseable' || result.state === 'unreadable') {
      return { ok: false, message: result.reason || '无法安全读取 hooks.json' }
    }
    return { ok: true, value: result.value, raw: result.raw }
  }

  function writeExecutable(filePath, contents) {
    if (!dataDirectory) throw new Error('cursor data directory is required')
    fs.mkdirSync(dataDirectory, { recursive: true })
    fs.writeFileSync(filePath, contents, { mode: 0o755 })
    try { fs.chmodSync(filePath, 0o755) } catch { /* filesystem without exec bits */ }
  }

  function writeHooks(next, previousRaw) {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true })
    if (typeof previousRaw === 'string' && previousRaw) {
      try { fs.writeFileSync(`${hooksPath}.eypc-bak`, previousRaw) } catch { /* backup is best effort */ }
    }
    const serialized = `${JSON.stringify(next, null, 2)}\n`
    const temporary = `${hooksPath}.eypc-tmp`
    fs.writeFileSync(temporary, serialized)
    fs.renameSync(temporary, hooksPath)
  }

  function ensureHookScript() {
    if (!queue || !hookCommandPath) return
    const next = hookScript({ queuePath: queue.queuePath })
    try {
      if (fs.readFileSync(hookCommandPath, 'utf8') === next) return
    } catch { /* missing script is rewritten below */ }
    writeExecutable(hookCommandPath, next)
  }

  function inspect() {
    try { ensureHookScript() } catch { /* owned script refresh is best effort */ }
    const snapshot = inventory.readInventory()
    const hooksFile = inspectHooksFile()
    const hooks = hooksFile.state === 'ok' || hooksFile.state === 'missing'
      ? hookInstallState(hooksFile.value || {}, { command: hookCommandLine })
      : 'unknown'
    return {
      available: snapshot.available === true,
      reason: snapshot.reason || (snapshot.available ? 'ready' : 'unknown'),
      sessionCount: Array.isArray(snapshot.sessions) ? snapshot.sessions.length : 0,
      readAt: snapshot.readAt || Date.now(),
      hooks
    }
  }

  function install() {
    if (!queue || !hookCommandLine) return { ok: false, message: 'Cursor 数据目录不可用' }
    const current = readableHooks()
    if (!current.ok) return { ok: false, message: current.message }
    try {
      queue.ensureQueueFile()
      writeExecutable(hookCommandPath, hookScript({ queuePath: queue.queuePath }))
      const next = withEypcHooks(current.value, { command: hookCommandLine })
      writeHooks(next, current.raw)
      return { ok: true, hooks: 'installed' }
    } catch (error) {
      return { ok: false, message: error && error.message ? String(error.message) : '注册失败' }
    }
  }

  function uninstall() {
    const current = readableHooks()
    if (!current.ok) return { ok: false, message: current.message }
    try {
      writeHooks(withoutEypcHooks(current.value), current.raw)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error && error.message ? String(error.message) : '注销失败' }
    }
  }

  function broadcastEventWatchers() {
    for (const subscriber of eventWatchListeners) {
      try { subscriber() } catch { /* consumer's problem */ }
    }
  }

  function watchEvents(listener, options) {
    if (typeof listener !== 'function') return () => {}
    if (!queue) return () => {}
    eventWatchListeners.add(listener)
    if (!eventWatchDispose) {
      eventWatchDispose = queue.watch(broadcastEventWatchers, options)
    }
    return () => {
      eventWatchListeners.delete(listener)
      if (eventWatchListeners.size || !eventWatchDispose) return
      eventWatchDispose()
      eventWatchDispose = null
    }
  }

  function broadcastInventoryWatchers() {
    for (const subscriber of inventoryWatchListeners) {
      try { subscriber() } catch { /* consumer's problem */ }
    }
  }

  function watchInventory(listener) {
    if (typeof listener !== 'function') return () => {}
    inventoryWatchListeners.add(listener)
    if (!inventoryWatchDispose && typeof inventory.watch === 'function') {
      inventoryWatchDispose = inventory.watch(broadcastInventoryWatchers)
    }
    return () => {
      inventoryWatchListeners.delete(listener)
      if (inventoryWatchListeners.size || !inventoryWatchDispose) return
      inventoryWatchDispose()
      inventoryWatchDispose = null
    }
  }

  function readHookState() {
    if (!queue) return []
    try {
      queue.rotateIfNeeded()
      queue.drain()
    } catch { /* drain degrades empty */ }
    const rows = []
    for (const [sessionId, state] of queue.state()) {
      rows.push({
        sessionId,
        phase: state && state.phase ? state.phase : 'unknown',
        turnOpen: state && state.turnOpen === true,
        lastEventAt: Number(state && state.lastEventAt) || 0,
        turnStartedAt: Number(state && state.turnStartedAt) || 0,
        generationId: state && typeof state.generationId === 'string' ? state.generationId : '',
        subagents: Object.values(state && state.subagents && typeof state.subagents === 'object' ? state.subagents : {})
          .filter((value) => value && typeof value === 'object')
          .map((value) => ({
            subagentId: typeof value.subagentId === 'string' ? value.subagentId : '',
            parentConversationId: typeof value.parentConversationId === 'string' ? value.parentConversationId : '',
            generationId: typeof value.generationId === 'string' ? value.generationId : '',
            active: value.active === true,
            startedAt: Number(value.startedAt) || 0,
            stoppedAt: Number(value.stoppedAt) || 0,
            lastEventAt: Number(value.lastEventAt) || 0
          }))
      })
    }
    return rows
  }

  return {
    revision: CURSOR_BRIDGE_REVISION,
    inspect,
    readInventory: () => inventory.readInventory(),
    readHookState,
    watchEvents,
    watchInventory,
    install,
    uninstall,
    openTask: (composerId) => opener.openTask(String(composerId || ''), { platform: dependencies.platform }),
    archiveTask: (composerId) => Promise.resolve(archiver.archiveTask(String(composerId || ''))),
    diagnostics() {
      return {
        revision: CURSOR_BRIDGE_REVISION,
        loaded: true,
        loadError: '',
        inventoryRevision: inventory.revision,
        marker: EYPC_MARKER,
        hooksPath: hooksFilePath()
      }
    },
    close() {
      if (eventWatchDispose) {
        try { eventWatchDispose() } catch { /* already gone */ }
        eventWatchDispose = null
      }
      eventWatchListeners.clear()
      if (inventoryWatchDispose) {
        try { inventoryWatchDispose() } catch { /* already gone */ }
        inventoryWatchDispose = null
      }
      inventoryWatchListeners.clear()
      if (queue && typeof queue.stopWatching === 'function') {
        try { queue.stopWatching() } catch { /* already gone */ }
      }
    }
  }
}

module.exports = {
  CURSOR_BRIDGE_REVISION,
  createCursorBridge
}
