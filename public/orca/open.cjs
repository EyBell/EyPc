'use strict'

/**
 * Jump to an Orca agent terminal. Reports `dispatched` when switch.navigated
 * is true. Never confirms a native read.
 */

const OPEN_TIMEOUT_MS = 8_000
const HANDLE = /^term_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PANE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function textOf(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function outcome(kind, message, confirmsRead) {
  return {
    outcome: kind,
    confirmsRead: confirmsRead === true,
    message: message || ''
  }
}

function normalizePaneKey(value) {
  const key = textOf(value).toLowerCase()
  return PANE_KEY.test(key) ? key : ''
}

function normalizeHandle(value) {
  const handle = textOf(value)
  return HANDLE.test(handle) ? handle : ''
}

const ORCA_BUNDLE_ID = 'com.stablyai.orca'
const ORCA_APP_NAME = 'Orca'

function isOrcaWindow(row) {
  if (!row || typeof row !== 'object' || row.relationship === 'child') return false
  const appId = String(row.appId || '').trim().toLowerCase()
  const appName = String(row.appName || '').trim().toLowerCase()
  return appId.startsWith(ORCA_BUNDLE_ID) || appName === 'orca'
}

function pickOrcaWindow(rows) {
  const windows = (Array.isArray(rows) ? rows : []).filter(isOrcaWindow)
  return windows.find((row) => row.focused === true)
    || windows.find((row) => row.canActivate !== false && row.userVisible !== false)
    || windows[0]
    || null
}

function execOnce(execFile, file, args) {
  return new Promise((resolve) => {
    try {
      execFile(file, args, { timeout: 5_000 }, (error) => resolve(!error))
    } catch {
      resolve(false)
    }
  })
}

async function raiseOrcaApp(dependencies = {}) {
  const platform = dependencies.platform || (typeof process === 'object' && process.platform) || ''
  if (platform !== 'darwin') return false
  const list = dependencies.windowsList
  const activate = dependencies.windowsActivate
  if (typeof list === 'function' && typeof activate === 'function') {
    try {
      const listed = await list()
      const rows = Array.isArray(listed) ? listed : listed && Array.isArray(listed.windows) ? listed.windows : []
      const target = pickOrcaWindow(rows)
      if (target && target.platform) {
        const result = await activate({ mode: 'root-current', root: target })
        if (result && result.outcome === 'activated') return true
      }
    } catch { /* fall through to process activate */ }
  }
  const execFile = dependencies.execFile
  if (typeof execFile !== 'function') return false
  // `open -b` is a no-op for an already-running app without a URL event.
  // Codex deeplinks activate because they are URL opens; Orca switch is not.
  if (await execOnce(execFile, 'osascript', ['-e', `tell application id "${ORCA_BUNDLE_ID}" to activate`])) return true
  if (await execOnce(execFile, 'open', ['-a', ORCA_APP_NAME])) return true
  return execOnce(execFile, 'open', ['-b', ORCA_BUNDLE_ID])
}

function createOpener(dependencies = {}) {
  const cli = dependencies.cli
  const lookupHandle = typeof dependencies.lookupHandle === 'function' ? dependencies.lookupHandle : null
  let dispatchInFlight = false
  let pendingOpen = null

  async function resolveHandle(paneKey, explicitHandle) {
    const known = normalizeHandle(explicitHandle)
    if (known) return known
    if (!lookupHandle) return ''
    try {
      return normalizeHandle(await lookupHandle(paneKey))
    } catch {
      return ''
    }
  }

  async function dispatch(handle) {
    if (!cli || typeof cli.json !== 'function') return outcome('unavailable', 'Orca CLI 不可用')
    const result = await cli.json(['terminal', 'switch', '--terminal', handle], { timeoutMs: OPEN_TIMEOUT_MS })
    if (result.ok === true && result.result && result.result.focus && result.result.focus.navigated === true) {
      await raiseOrcaApp(dependencies)
      return outcome('dispatched', '已在 Orca 打开该任务')
    }
    if (result.ok === true) {
      await raiseOrcaApp(dependencies)
      return outcome('dispatched', '已请求 Orca 切换到该任务')
    }
    const code = textOf(result.error && result.error.code)
    if (code === 'missing-cli') return outcome('unavailable', '未找到 Orca CLI')
    return outcome('failed', '唤起 Orca 任务失败')
  }

  function openTask(paneKey, options = {}) {
    const key = normalizePaneKey(paneKey)
    if (!key) return Promise.resolve(outcome('unavailable', '任务标识无效'))
    const request = { key, handle: options.handle }
    pendingOpen = request
    if (dispatchInFlight) return Promise.resolve(outcome('unavailable', '跳转进行中'))
    dispatchInFlight = true
    return Promise.resolve()
      .then(async () => {
        const latest = pendingOpen
        pendingOpen = null
        const handle = await resolveHandle(latest.key, latest.handle)
        if (!handle) return outcome('unavailable', '找不到该 Orca 终端')
        return dispatch(handle)
      })
      .catch(() => outcome('failed', '唤起 Orca 任务失败'))
      .finally(() => {
        dispatchInFlight = false
        if (pendingOpen) {
          const next = pendingOpen
          pendingOpen = null
          void openTask(next.key, { handle: next.handle })
        }
      })
  }

  return { openTask, normalizePaneKey, normalizeHandle }
}

module.exports = {
  OPEN_TIMEOUT_MS,
  normalizePaneKey,
  normalizeHandle,
  raiseOrcaApp,
  createOpener
}
