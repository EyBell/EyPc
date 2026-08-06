'use strict'

/**
 * Claude task jump.
 *
 * Every Claude task opens inside the Claude desktop app — CLI sessions
 * (`~/.claude`, a bare uuid) and desktop sessions (`local_<uuid>`) alike. There
 * is no terminal route: the plugin never focuses a terminal window and never
 * runs `claude --resume`.
 *
 * The address is the desktop app's own deep link, read out of Claude 1.25927.0's
 * `claudeURLHandler`:
 *
 *   claude://resume?session=<uuid>
 *
 * The handler accepts a canonical UUID only, then hands it to
 * `LocalSessionManager.importCliSession(uuid)`, which resolves to the desktop
 * session id `local_<uuid>` and navigates the app there. One link therefore
 * serves both families:
 *
 *  - a desktop session is already in the app's store, so the manager returns
 *    early: it un-archives the session, navigates, and touches nothing else;
 *  - a CLI session is imported first, and that import is not free. The app
 *    strips thinking blocks from `~/.claude/projects/**\/<uuid>.jsonl` **in
 *    place**, marks the session's cwd as a trusted workspace and may claim its
 *    git worktree. EyPc stays read-only — it only dispatches the link — but the
 *    writes do happen, once per session, on the desktop app's side.
 *
 * The result is always `dispatched`, never `opened`. The OS handler takes the
 * URL and returns immediately, so an expired sign-in, a missing transcript and
 * a successful navigation are indistinguishable from here. None of them is
 * evidence that the user saw the session, so no jump writes a read receipt.
 */

/** Dispatch timeout for the deep-link handoff. */
const OPEN_TIMEOUT_MS = 8000

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
 * Canonical UUID — the only shape the `resume` handler accepts. Its own regex is
 * exactly this, and anything else is dropped before the session manager is ever
 * reached, so rejecting it here buys the user a real message instead of a
 * silent no-op.
 */
const SESSION_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isClaudeDesktopWindow(row) {
  if (!row || typeof row !== 'object') return false
  const appId = String(row.appId || '').trim().toLowerCase()
  const appName = String(row.appName || '').trim().toLowerCase()
  if (appId.startsWith(DESKTOP_APP_ID_PREFIX) && !DESKTOP_APP_ID_EXCLUDE.test(appId)) return true
  return DESKTOP_APP_NAMES.has(appName)
}

/**
 * Session id → deep-link uuid.
 *
 * A desktop id is `local_` followed by the very uuid the link wants, and a CLI
 * id is that uuid already, so both families reduce to the same value. Returns
 * '' for anything the handler would reject.
 */
function deepLinkSessionUuid(sessionId) {
  const uuid = String(sessionId || '').trim().replace(/^local_/i, '')
  return SESSION_UUID_PATTERN.test(uuid) ? uuid.toLowerCase() : ''
}

function desktopResumeUrl(uuid) {
  return `claude://resume?session=${encodeURIComponent(uuid)}`
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
   * permission produces exactly the same empty list as a closed app — and the
   * deep link needs no accessibility at all — so an unreadable inventory
   * answers `unknown` and the jump proceeds, rather than refusing on evidence
   * the plugin was never allowed to collect.
   */
  async function desktopRunningState() {
    if (windowsUnavailable()) return 'unknown'
    let listed = null
    try {
      listed = await listWindowRows()
    } catch {
      return 'unknown'
    }
    if (inventoryBlockReason(listed.capability)) return 'unknown'
    const running = listed.rows.some((row) => isClaudeDesktopWindow(row)
      && row.relationship !== 'child'
      && row.userVisible !== false)
    return running ? 'running' : 'closed'
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

  async function openTask(sessionId, options) {
    const settings = options || {}
    const uuid = deepLinkSessionUuid(sessionId)
    // Without a canonical uuid the handler drops the link silently, so say so
    // here instead of reporting a hand-off that never happened.
    if (!uuid) return outcome('unavailable', '该会话没有可用于桌面端的地址')
    if (await desktopRunningState() === 'closed') return outcome('unavailable', 'Claude 桌面端未在运行')
    return dispatchDeepLink(desktopResumeUrl(uuid), settings.platform)
  }

  return { openTask }
}

module.exports = {
  OPEN_TIMEOUT_MS,
  SESSION_UUID_PATTERN,
  isClaudeDesktopWindow,
  deepLinkSessionUuid,
  desktopResumeUrl,
  createOpener
}
