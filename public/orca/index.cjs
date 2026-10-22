'use strict'

/**
 * Orca Agents companion facade.
 *
 * Cold/hot inventory is `worktree ps` + `terminal list`. Open switches the
 * live terminal. Archive closes that pane. Dynamic phase is projected from
 * `agent-hooks/last-status.json` as soon as its mtime changes: prompts,
 * assistant text and tool arguments are deleted before any session field is
 * copied, through the same phase rules as the CLI path. A turn leaving working
 * or an unknown pane triggers one CLI read; otherwise the CLI refreshes
 * membership, titles and pins every 5s, or 1s while a live pane is missing
 * from the file. Conversation bodies never enter the session.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ORCA_BRIDGE_REVISION = 'orca-agent-companion-v1'
const ORCA_WAKE_STAT_MS = 200
// Full CLI reads are slow while every live pane is covered by the status file;
// a live pane the file never mentions (structured chat) keeps the fast cadence.
const ORCA_QUIET_RECOVERY_MS = 5_000
const ORCA_LIVE_RECOVERY_MS = 1_000
const WAKE_SECRET_KEYS = ['prompt', 'lastAssistantMessage', 'toolInput', 'preview', 'path', 'cwd', 'worktreePath', 'command']
const { createOrcaCli } = require('./cli.cjs')
const { userDataPath } = require('./native-state.cjs')
const { createInventoryReader, fingerprintOf, sessionState, waitingInteractionKind } = require('./inventory.cjs')
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

function scrubWake(value) {
  if (!value || typeof value !== 'object') return
  for (const key of WAKE_SECRET_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) delete value[key]
  }
}

function wakeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function wakeTime(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0
}

function readWakeEntriesFromFile(file, io) {
  if (!file || !io || typeof io.readFileSync !== 'function') return null
  let raw
  try { raw = io.readFileSync(file, 'utf8') } catch { return null }
  let parsed
  try { parsed = JSON.parse(raw) } catch { return null }
  raw = ''
  const entries = parsed && parsed.entries
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return null
  const rows = []
  for (const value of Object.values(entries)) {
    if (!value || typeof value !== 'object') continue
    scrubWake(value)
    const payload = value.payload && typeof value.payload === 'object' ? value.payload : {}
    scrubWake(payload)
    const paneKey = wakeText(value.paneKey).toLowerCase()
    if (!paneKey) continue
    const presence = value.agentPresence && typeof value.agentPresence === 'object' ? value.agentPresence : {}
    rows.push({
      paneKey,
      state: wakeText(payload.state).toLowerCase(),
      agentType: wakeText(payload.agentType || presence.agent).toLowerCase(),
      toolName: wakeText(payload.toolName).slice(0, 80),
      interrupted: payload.interrupted === true,
      stateStartedAt: wakeTime(value.stateStartedAt)
    })
  }
  return rows
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
  const readWakeEntries = typeof dependencies.readWakeEntries === 'function'
    ? dependencies.readWakeEntries
    : () => readWakeEntriesFromFile(wakeFile, io)
  let wakeTimer = null
  let wakeWatcher = null
  let pollInFlight = false
  let pollQueued = false
  let pollEnabled = null
  let lastWakeSig = null
  let lastFullReadAt = 0
  let freshSnapshot = null
  let wakeCovered = null
  // Orca keeps entries for closed panes; ones a full read did not return stop triggering reads.
  let stalePanes = new Set()
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

  function currentSnapshot() {
    return {
      revision: inventory.revision,
      available: cache.available,
      reason: cache.reason,
      sessions: cache.sessions,
      truncated: false,
      readAt: clock()
    }
  }

  // Returns true when the file shows something only a CLI read can settle:
  // a pane the cache lacks, or a turn leaving working (unread, title, OSC).
  function applyWake() {
    const rows = readWakeEntries()
    if (!Array.isArray(rows)) return false
    const byPane = new Map()
    for (const row of rows) {
      if (row && typeof row.paneKey === 'string' && row.paneKey) byPane.set(row.paneKey, row)
    }
    wakeCovered = new Set(byPane.keys())
    const known = new Set(cache.sessions.map((session) => session.paneKey))
    let needsRead = [...byPane.keys()].some((paneKey) => !known.has(paneKey) && !stalePanes.has(paneKey))
    let changed = false
    for (const session of cache.sessions) {
      const row = byPane.get(session.paneKey)
      if (!row || (!row.state && row.interrupted !== true)) continue
      const agent = { state: row.state, interrupted: row.interrupted, agentType: row.agentType, toolName: row.toolName }
      const phase = sessionState(agent, session.connected, session.oscWorking === true, session.agentType)
      const interaction = waitingInteractionKind(agent, phase)
      if (session.state !== phase) {
        if (phase !== 'working') needsRead = true
        session.state = phase
        if (phase === 'working' && row.stateStartedAt) {
          session.stateStartedAt = row.stateStartedAt
          session.lastQuestionAt = row.stateStartedAt
          session.lastUpdatedAt = row.stateStartedAt
        } else if (phase !== 'working') {
          session.lastQuestionAt = 0
        }
        changed = true
      }
      if (session.interactionKind !== interaction) {
        session.interactionKind = interaction
        changed = true
      }
    }
    if (changed) {
      cache.fingerprint = fingerprintOf(cache.sessions)
      freshSnapshot = currentSnapshot()
      broadcast()
    }
    return needsRead
  }

  function recoveryInterval() {
    const uncoveredLive = cache.sessions.some((session) => session.state === 'working'
      && !(wakeCovered && wakeCovered.has(session.paneKey)))
    return uncoveredLive ? ORCA_LIVE_RECOVERY_MS : ORCA_QUIET_RECOVERY_MS
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
    let settle = false
    if (changed || (lastWakeSig !== null && wakeCovered === null)) {
      lastWakeSig = observed
      try { settle = applyWake() && changed } catch { /* keep the last snapshot */ }
    }
    const due = clock() - lastFullReadAt >= recoveryInterval()
    if (!force && !settle && lastWakeSig !== null && !due) return
    pollInFlight = true
    try {
      const previous = cache.fingerprint
      const snapshot = await inventory.readInventory()
      remember(snapshot)
      if (wakeCovered) {
        const known = new Set(cache.sessions.map((session) => session.paneKey))
        stalePanes = new Set([...wakeCovered].filter((paneKey) => !known.has(paneKey)))
      }
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
  ORCA_LIVE_RECOVERY_MS,
  readWakeEntriesFromFile,
  scrubWake,
  createOrcaBridge,
  createOrcaRuntimeStrategy
}
