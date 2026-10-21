'use strict'

/**
 * Orca Agents companion facade.
 *
 * Cold/hot inventory is `worktree ps` + `terminal list`. Open switches the
 * live terminal. Archive closes that pane. Status wakes from the mtime of
 * Orca's `agent-hooks/last-status.json` (stat only — that file holds prompts
 * and assistant text and must never be read here). A quiet 2s read covers
 * structured sessions, which Orca does not persist into that file.
 * Conversation bodies never enter.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ORCA_BRIDGE_REVISION = 'orca-agent-companion-v1'
const ORCA_WAKE_STAT_MS = 200
const ORCA_QUIET_RECOVERY_MS = 2_000
const { createOrcaCli } = require('./cli.cjs')
const { userDataPath } = require('./native-state.cjs')
const { createInventoryReader, fingerprintOf } = require('./inventory.cjs')
const { createOpener } = require('./open.cjs')
const { createArchiver } = require('./archive.cjs')
const { createPinner } = require('./pin.cjs')
const { createUnreadBridge } = require('./unread-bridge.cjs')

function statusWakeFile(dependencies) {
  const env = dependencies.env && typeof dependencies.env === 'object' ? dependencies.env : process.env
  const home = typeof dependencies.homedir === 'string' ? dependencies.homedir : os.homedir()
  const root = userDataPath(env, home)
  return root ? path.join(root, 'agent-hooks', 'last-status.json') : ''
}

function statWakeFile(file, io) {
  if (!file) return 'missing'
  try {
    const stat = io.statSync(file)
    return `${Number(stat.mtimeMs) || 0}:${Number(stat.size) || 0}`
  } catch {
    return 'missing'
  }
}

function watchStatusFile(file, onChange, io) {
  if (!file || !io || typeof io.watch !== 'function') return null
  try {
    const watcher = io.watch(path.dirname(file), { persistent: false }, (_event, filename) => {
      if (filename && String(filename) !== path.basename(file)) return
      onChange()
    })
    if (watcher && typeof watcher.on === 'function') {
      watcher.on('error', () => {
        try { if (typeof watcher.close === 'function') watcher.close() } catch { /* already gone */ }
      })
    }
    return watcher
  } catch {
    return null
  }
}

function createOrcaRuntimeStrategy(cli) {
  return {
    label: 'Orca',
    async probe() {
      if (!cli || typeof cli.json !== 'function' || cli.available === false) return 'unknown'
      const status = await cli.json(['status'])
      if (status.ok !== true) return 'closed'
      const app = status.result && status.result.app
      return app && app.running === true ? 'running' : 'closed'
    },
    async launch() {
      if (!cli || typeof cli.json !== 'function' || cli.available === false) {
        return { ok: false, code: 'missing-cli', launcher: 'orca-cli', message: '未找到 Orca CLI' }
      }
      const opened = await cli.json(['open'])
      if (opened.ok === true) return { ok: true, launcher: 'orca-open' }
      return {
        ok: false,
        code: 'launch-failed',
        launcher: 'orca-open',
        message: '无法启动 Orca，未跳转'
      }
    },
    async settle() {
      if (!cli || typeof cli.json !== 'function') return false
      const status = await cli.json(['status'])
      const runtime = status.result && status.result.runtime
      return status.ok === true && runtime && runtime.state === 'ready' && runtime.reachable === true
    }
  }
}

function createOrcaBridge(dependencies = {}) {
  const cli = dependencies.cli || createOrcaCli(dependencies)
  const unreadBridge = dependencies.unreadBridge || createUnreadBridge(dependencies)
  const inventory = createInventoryReader({ cli, unreadBridge })
  const cache = { sessions: [], available: false, reason: 'unknown', readAt: 0, fingerprint: '' }
  const watchers = new Set()
  const clock = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  const io = dependencies.fs || fs
  const setTimer = dependencies.setInterval || setInterval
  const clearTimer = dependencies.clearInterval || clearInterval
  const wakeFile = typeof dependencies.wakeFile === 'string' ? dependencies.wakeFile : statusWakeFile(dependencies)
  const statWake = typeof dependencies.statWake === 'function'
    ? dependencies.statWake
    : () => statWakeFile(wakeFile, io)
  const watchWake = typeof dependencies.watchWake === 'function'
    ? dependencies.watchWake
    : (onChange) => watchStatusFile(wakeFile, onChange, io)
  let wakeTimer = null
  let wakeWatcher = null
  let pollInFlight = false
  let pollQueued = false
  let pollEnabled = null
  let lastWakeSig = null
  let lastFullReadAt = 0
  let freshSnapshot = null
  const opener = createOpener({
    cli,
    execFile: dependencies.execFile,
    platform: dependencies.platform,
    windowsList: dependencies.windowsList,
    windowsActivate: dependencies.windowsActivate,
    lookupHandle: async (paneKey) => {
      const hit = cache.sessions.find((session) => session.paneKey === paneKey)
      if (hit && hit.handle) return hit.handle
      const snapshot = await inventory.readInventory()
      remember(snapshot)
      const next = snapshot.sessions.find((session) => session.paneKey === paneKey)
      return next && next.handle ? next.handle : ''
    }
  })
  async function lookupSession(paneKey) {
    const hit = cache.sessions.find((session) => session.paneKey === paneKey)
    if (hit) return hit
    const snapshot = await inventory.readInventory()
    remember(snapshot)
    return snapshot.sessions.find((session) => session.paneKey === paneKey) || null
  }
  const archiver = createArchiver({ cli, lookupSession })
  const pinner = createPinner({ cli, lookupSession })

  function remember(snapshot) {
    cache.sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : []
    cache.available = snapshot.available === true
    cache.reason = typeof snapshot.reason === 'string' ? snapshot.reason : 'unknown'
    cache.readAt = Number(snapshot.readAt) || Date.now()
    cache.fingerprint = fingerprintOf(cache.sessions)
  }

  function broadcast() {
    for (const listener of watchers) {
      try { listener() } catch { /* consumer's problem */ }
    }
  }

  async function readFresh() {
    if (freshSnapshot) {
      const snapshot = freshSnapshot
      freshSnapshot = null
      return snapshot
    }
    const observed = statWake()
    const snapshot = await inventory.readInventory()
    remember(snapshot)
    lastWakeSig = observed
    lastFullReadAt = clock()
    return snapshot
  }

  async function poll(force) {
    if (!watchers.size) return
    try { if (pollEnabled && !pollEnabled()) return } catch { return }
    if (pollInFlight) {
      pollQueued = true
      return
    }
    const observed = statWake()
    const changed = lastWakeSig !== null && observed !== lastWakeSig
    const due = clock() - lastFullReadAt >= ORCA_QUIET_RECOVERY_MS
    if (!force && lastWakeSig !== null && !changed && !due) return
    pollInFlight = true
    try {
      const previous = cache.fingerprint
      const snapshot = await inventory.readInventory()
      remember(snapshot)
      lastWakeSig = observed
      lastFullReadAt = clock()
      if (cache.fingerprint !== previous) {
        freshSnapshot = snapshot
        broadcast()
      }
    } catch {
      lastWakeSig = observed
      lastFullReadAt = clock()
    }
    pollInFlight = false
    if (!watchers.size) return
    if (pollQueued) {
      pollQueued = false
      void poll(false)
    }
  }

  function ensureWake() {
    if (wakeTimer || !watchers.size) return
    wakeTimer = setTimer(() => { void poll(false) }, ORCA_WAKE_STAT_MS)
    if (wakeTimer && typeof wakeTimer.unref === 'function') wakeTimer.unref()
    if (!wakeWatcher) {
      try { wakeWatcher = watchWake(() => { void poll(false) }) || null } catch { wakeWatcher = null }
    }
  }

  function stopWake() {
    if (wakeTimer) {
      clearTimer(wakeTimer)
      wakeTimer = null
    }
    if (wakeWatcher && typeof wakeWatcher.close === 'function') {
      try { wakeWatcher.close() } catch { /* already gone */ }
    }
    wakeWatcher = null
    pollQueued = false
    freshSnapshot = null
  }

  async function inspect() {
    const snapshot = await readFresh()
    return {
      available: snapshot.available === true,
      reason: snapshot.reason || (snapshot.available ? 'ready' : 'unknown'),
      sessionCount: snapshot.sessions.length,
      cliPath: cli.executable || '',
      readAt: snapshot.readAt
    }
  }

  return {
    revision: ORCA_BRIDGE_REVISION,
    inspect,
    readInventory: () => readFresh(),
    // `isEnabled` keeps the wake from spawning the CLI while the Orca source is off.
    watchInventory(listener, options = {}) {
      if (typeof listener !== 'function') return () => {}
      if (typeof options.isEnabled === 'function') pollEnabled = options.isEnabled
      watchers.add(listener)
      ensureWake()
      void poll(true)
      return () => {
        watchers.delete(listener)
        if (!watchers.size) stopWake()
      }
    },
    openTask: async (paneKey, options) => {
      const result = await opener.openTask(String(paneKey || ''), options || {})
      if (result && (result.outcome === 'dispatched' || result.outcome === 'opened')) {
        const key = String(paneKey || '').toLowerCase()
        const native = cache.sessions.find((session) => session.paneKey === key)?.nativeUnread === true
        if (typeof unreadBridge.ready === 'function') await unreadBridge.ready()
        if (!native) unreadBridge.markViewed(paneKey)
        for (const session of cache.sessions) {
          if (session.paneKey === key && session.state !== 'working' && session.nativeUnread !== true) session.unread = false
        }
        cache.fingerprint = fingerprintOf(cache.sessions)
        broadcast()
      }
      return result
    },
    archiveTask: (paneKey) => archiver.archiveTask(String(paneKey || '')),
    setPin: (paneKey, request) => pinner.setPin(String(paneKey || ''), request || {}),
    runtimeStrategy: () => createOrcaRuntimeStrategy(cli),
    diagnostics() {
      return {
        revision: ORCA_BRIDGE_REVISION,
        loaded: true,
        loadError: '',
        inventoryRevision: inventory.revision,
        cliPath: cli.executable || '',
        cliAvailable: cli.available !== false
      }
    },
    close() {
      stopWake()
      watchers.clear()
    }
  }
}

module.exports = {
  ORCA_BRIDGE_REVISION,
  ORCA_WAKE_STAT_MS,
  ORCA_QUIET_RECOVERY_MS,
  createOrcaBridge,
  createOrcaRuntimeStrategy
}
