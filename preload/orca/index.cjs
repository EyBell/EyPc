'use strict'

/**
 * Orca Agents companion facade.
 *
 * Cold/hot inventory is `worktree ps` + `terminal list`. Open switches the
 * live terminal. Archive closes that pane. Status tracking is a 1s poll
 * because Orca has no EyPc-owned hook file. Conversation bodies never enter.
 */

const ORCA_BRIDGE_REVISION = 'orca-agent-companion-v1'
const { WATCHER_RECOVERY_INTERVAL_MS } = require('../timing-policy.cjs')
const { createOrcaCli } = require('./cli.cjs')
const { createInventoryReader, fingerprintOf } = require('./inventory.cjs')
const { createOpener } = require('./open.cjs')
const { createArchiver } = require('./archive.cjs')
const { createPinner } = require('./pin.cjs')
const { createUnreadBridge } = require('./unread-bridge.cjs')

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
  let pollTimer = null
  let pollInFlight = false
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

  async function poll() {
    if (pollInFlight || !watchers.size) return
    pollInFlight = true
    try {
      const previous = cache.fingerprint
      const snapshot = await inventory.readInventory()
      remember(snapshot)
      if (cache.fingerprint !== previous) broadcast()
    } catch { /* poll degrades last snapshot */ }
    pollInFlight = false
  }

  function ensurePoll() {
    if (pollTimer || !watchers.size) return
    pollTimer = setInterval(() => { void poll() }, WATCHER_RECOVERY_INTERVAL_MS)
    if (typeof pollTimer.unref === 'function') pollTimer.unref()
  }

  function stopPoll() {
    if (!pollTimer) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  async function inspect() {
    const snapshot = await inventory.readInventory()
    remember(snapshot)
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
    readInventory: async () => {
      const snapshot = await inventory.readInventory()
      remember(snapshot)
      return snapshot
    },
    watchInventory(listener) {
      if (typeof listener !== 'function') return () => {}
      watchers.add(listener)
      ensurePoll()
      void poll()
      return () => {
        watchers.delete(listener)
        if (!watchers.size) stopPoll()
      }
    },
    openTask: async (paneKey, options) => {
      const result = await opener.openTask(String(paneKey || ''), options || {})
      if (result && (result.outcome === 'dispatched' || result.outcome === 'opened')) {
        unreadBridge.markViewed(paneKey)
        const key = String(paneKey || '').toLowerCase()
        for (const session of cache.sessions) {
          if (session.paneKey === key && session.state !== 'working') session.unread = false
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
      stopPoll()
      watchers.clear()
    }
  }
}

module.exports = {
  ORCA_BRIDGE_REVISION,
  createOrcaBridge,
  createOrcaRuntimeStrategy
}
