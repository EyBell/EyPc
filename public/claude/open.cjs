'use strict'

/**
 * Claude task jump.
 *
 * Only an existing Claude App Code row (`local_<uuid>`) is accepted. The App's
 * normal local-history route is `claude://claude.ai/epitaxy/<local-id>`; the
 * import-oriented alternative handler is intentionally not present here.
 *
 * The result is always `dispatched`, never `opened`. The OS handler takes the
 * URL and returns immediately, so an expired sign-in, missing local history and
 * a successful navigation are indistinguishable from here. None of them is
 * evidence that Claude itself confirmed a read, so this bridge never reports
 * `confirmsRead`. The Controller may still create a revocable, process-local
 * hint for the exact completion epoch while it rechecks native unread state.
 */

/** Dispatch timeout for the deep-link handoff. */
const OPEN_TIMEOUT_MS = 8000
const APP_PRESENCE_TTL_MS = 2000
const APP_PRESENCE_PROBE_TIMEOUT_MS = 900

/**
 * Application identity of the Claude desktop app. Identity comes from the app,
 * never from a window title — the Window Jump contract is explicit that titles,
 * tabs, ordinals and geometry establish neither identity nor relationship.
 * `Claude Code URL Handler` shares the vendor prefix but ships no user-visible
 * window; it is excluded anyway so an unexpected one can never win.
 */
const DESKTOP_APP_ID_PREFIX = 'com.anthropic.claude'
const DESKTOP_APP_ID_EXCLUDE = /url[-_.]?handler|helper|updater/
const DESKTOP_APP_NAMES = new Set(['claude', 'claude for desktop'])

/**
 * Canonical App-local id — the only shape admitted by this route. Rejecting
 * every other id prevents a CLI id from creating an imported copy.
 */
const LOCAL_SESSION_PATTERN = /^local_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isClaudeDesktopWindow(row) {
  if (!row || typeof row !== 'object') return false
  const appId = String(row.appId || '').trim().toLowerCase()
  const appName = String(row.appName || '').trim().toLowerCase()
  if (appId && DESKTOP_APP_ID_EXCLUDE.test(appId)) return false
  if (appId.startsWith(DESKTOP_APP_ID_PREFIX)) return true
  return DESKTOP_APP_NAMES.has(appName)
}

/**
 * App-local session id → exact deep-link id. Returns '' for CLI ids and every
 * other shape, so this helper can never fall through to an import path.
 */
function deepLinkLocalSessionId(sessionId) {
  const localId = String(sessionId || '').trim().toLowerCase()
  return LOCAL_SESSION_PATTERN.test(localId) ? localId : ''
}

function desktopEpitaxyUrl(localSessionId) {
  return `claude://claude.ai/epitaxy/${encodeURIComponent(localSessionId)}`
}

function outcome(kind, message, confirmsRead) {
  return {
    outcome: kind,
    confirmsRead: confirmsRead === true,
    message: message || ''
  }
}

function createOpener(dependencies) {
  const windows = dependencies.windows || null
  const execFile = dependencies.execFile || null
  const execFileSync = dependencies.execFileSync || null
  const processApi = dependencies.process || (typeof process === 'object' ? process : null)
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  const setTimer = dependencies.setTimeout || setTimeout
  const clearTimer = dependencies.clearTimeout || clearTimeout
  let presence = null
  let presenceCheckInFlight = null
  let pendingOpen = null
  let dispatchInFlight = false

  function windowsUnavailable() {
    return !windows || typeof windows.list !== 'function'
  }

  /** Window inventory, tolerant of both the array and enveloped shapes. */
  async function listWindowRows() {
    const listed = await windows.list()
    if (Array.isArray(listed)) return { rows: listed, capability: null }
    return {
      rows: listed && Array.isArray(listed.windows) ? listed.windows : [],
      capability: listed && typeof listed.capability === 'object' ? listed.capability : null
    }
  }

  async function boundedWindowRows() {
    let timer = null
    try {
      return await Promise.race([
        listWindowRows(),
        new Promise((resolvePromise) => {
          timer = setTimer(() => resolvePromise(null), APP_PRESENCE_PROBE_TIMEOUT_MS)
        })
      ])
    } finally {
      if (timer) clearTimer(timer)
    }
  }

  /**
   * Whether an empty inventory is empty because nothing is running, or because
   * the plugin was never allowed to look. Returns '' when the inventory is
   * simply empty.
   */
  function inventoryBlockReason(capability) {
    if (!capability || typeof capability !== 'object') return ''
    if (capability.supported === false) return '当前系统不支持窗口跳转'
    if (capability.permission === 'required' || capability.canList === false) {
      return '需要在系统设置中允许 EyPc 使用辅助功能'
    }
    return ''
  }

  /**
   * Is the desktop app up?
   *
   * Only a readable inventory can answer that. A denied accessibility
   * permission produces exactly the same empty list as a closed app. The route
   * must not auto-launch Claude, so unknown fails closed rather than dispatching.
   */
  function processStartToken(pid) {
    if (!Number.isInteger(pid) || pid <= 0 || typeof execFileSync !== 'function') return ''
    try {
      return String(execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
        encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore']
      }) || '').trim()
    } catch {
      return ''
    }
  }

  function cachedRunningState() {
    if (!presence || presence.status !== 'running') return ''
    const pid = Number(presence.pid) || 0
    if (pid > 0 && processApi && typeof processApi.kill === 'function') {
      try {
        processApi.kill(pid, 0)
        const currentToken = processStartToken(pid)
        if (!presence.startToken || !currentToken || currentToken === presence.startToken) return 'running'
      } catch { /* cache invalidated below */ }
      presence = null
      return ''
    }
    if (now() - presence.verifiedAt <= APP_PRESENCE_TTL_MS) return 'running'
    presence = null
    return ''
  }

  async function probeDesktopRunningState() {
    const cached = cachedRunningState()
    if (cached) return cached
    if (windowsUnavailable()) return 'unknown'
    let listed = null
    try {
      listed = await boundedWindowRows()
    } catch {
      return 'unknown'
    }
    if (!listed) return 'unknown'
    if (inventoryBlockReason(listed.capability)) return 'unknown'
    const running = listed.rows.find((row) => isClaudeDesktopWindow(row)
      && row.relationship !== 'child')
    if (!running) {
      presence = null
      return 'closed'
    }
    const pid = Math.max(0, Math.trunc(Number(running.pid) || 0))
    presence = {
      status: 'running',
      pid,
      appId: String(running.appId || running.appName || ''),
      instanceId: String(running.instanceId || ''),
      startToken: processStartToken(pid),
      verifiedAt: now()
    }
    return 'running'
  }

  function desktopRunningState() {
    const cached = cachedRunningState()
    if (cached) return Promise.resolve(cached)
    if (presenceCheckInFlight) return presenceCheckInFlight
    presenceCheckInFlight = probeDesktopRunningState().finally(() => { presenceCheckInFlight = null })
    return presenceCheckInFlight
  }

  async function readPresence() {
    const status = await desktopRunningState()
    if (status === 'running' && presence) return { ...presence }
    return {
      status,
      pid: 0,
      appId: '',
      instanceId: '',
      startToken: '',
      verifiedAt: now()
    }
  }

  /**
   * Hands the deep link to the OS URL handler, which is what brings the app
   * forward. Success here means the URL was accepted for delivery, nothing more
   * — see the note on `dispatched` at the top of this file.
   */
  function dispatchDeepLink(url, platform) {
    if (typeof execFile !== 'function') return Promise.resolve(outcome('unavailable', '命令派发不可用'))
    const host = platform || process.platform
    return new Promise((resolvePromise) => {
      const done = (error) => resolvePromise(error
        ? outcome('failed', '唤起 Claude 桌面端失败')
        : outcome('dispatched', '已在 Claude 桌面端打开该任务'))
      try {
        if (host === 'darwin') {
          execFile('open', [url], { timeout: OPEN_TIMEOUT_MS }, done)
          return
        }
        if (host === 'win32') {
          execFile('cmd', ['/c', 'start', '', url], { timeout: OPEN_TIMEOUT_MS }, done)
          return
        }
        execFile('xdg-open', [url], { timeout: OPEN_TIMEOUT_MS }, done)
      } catch {
        done(new Error('dispatch failed'))
      }
    })
  }

  async function dispatchTask(sessionId, options) {
    const settings = options || {}
    const localSessionId = deepLinkLocalSessionId(sessionId)
    if (!localSessionId) return outcome('unavailable', '该任务不是可定位的 Claude App Code 会话')
    const running = await desktopRunningState()
    if (running === 'closed') return outcome('unavailable', 'Claude 桌面端未在运行')
    if (running !== 'running') return outcome('unavailable', '无法确认 Claude 桌面端正在运行')
    return dispatchDeepLink(desktopEpitaxyUrl(localSessionId), settings.platform)
  }

  function pumpOpenQueue() {
    if (dispatchInFlight || !pendingOpen) return
    const current = pendingOpen
    pendingOpen = null
    dispatchInFlight = true
    void dispatchTask(current.sessionId, current.options).then(current.resolve, () => {
      current.resolve(outcome('failed', '唤起 Claude 桌面端失败'))
    }).finally(() => {
      dispatchInFlight = false
      if (pendingOpen) queueMicrotask(pumpOpenQueue)
    })
  }

  /** Single-flight, latest-target-wins dispatch for rapid previous/next keys. */
  function openTask(sessionId, options) {
    return new Promise((resolvePromise) => {
      if (pendingOpen) {
        pendingOpen.resolve(outcome('unavailable', '已由更新的 Claude 跳转目标替代'))
      }
      pendingOpen = { sessionId, options: options || {}, resolve: resolvePromise }
      queueMicrotask(pumpOpenQueue)
    })
  }

  function inspectPresence() {
    return presence ? { ...presence } : { status: 'unknown', pid: 0, appId: '', instanceId: '', startToken: '', verifiedAt: 0 }
  }

  function invalidatePresence() {
    presence = null
  }

  return { openTask, readPresence, inspectPresence, invalidatePresence }
}

module.exports = {
  OPEN_TIMEOUT_MS,
  APP_PRESENCE_TTL_MS,
  APP_PRESENCE_PROBE_TIMEOUT_MS,
  LOCAL_SESSION_PATTERN,
  isClaudeDesktopWindow,
  deepLinkLocalSessionId,
  desktopEpitaxyUrl,
  createOpener
}
