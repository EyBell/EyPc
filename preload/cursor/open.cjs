'use strict'

/**
 * Cursor Agent task jump.
 *
 * The only accepted target is an existing local composer id (a bare UUID that
 * the cold inventory already listed). The jump mechanism is Cursor's own
 * deep-link handler: `cursor://anysphere.cursor-deeplink/agent?id=<composerId>`.
 * On this machine (Cursor 3.17.8) that link reliably flips the persisted
 * `cursor/glass.selectedAgent` to the exact local composer and focuses the
 * Agents window — the same route the in-app sidebar/deeplink uses. An invalid
 * id is a no-op on selection.
 *
 * The result is always `dispatched`, never `opened`. The OS URL handler accepts
 * the link and returns immediately, so a stale window, a missing composer and a
 * successful focus are indistinguishable from here. None of them proves Cursor
 * marked the conversation read, so this bridge never reports `confirmsRead`.
 */

const OPEN_TIMEOUT_MS = 8000

/**
 * Canonical local composer id — the only shape admitted by this route. The cold
 * inventory keys are `cursor:<composerId>` with a bare UUID composer id.
 */
const COMPOSER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DEEPLINK_AUTHORITY = 'anysphere.cursor-deeplink'

function normalizeComposerId(composerId) {
  const id = String(composerId || '').trim().toLowerCase()
  return COMPOSER_ID_PATTERN.test(id) ? id : ''
}

function agentDeepLink(composerId) {
  return `cursor://${DEEPLINK_AUTHORITY}/agent?id=${encodeURIComponent(composerId)}`
}

function outcome(kind, message, confirmsRead) {
  return {
    outcome: kind,
    confirmsRead: confirmsRead === true,
    message: message || ''
  }
}

function createOpener(dependencies) {
  const deps = dependencies || {}
  const execFile = deps.execFile || null
  const setTimer = deps.setTimeout || setTimeout
  let pendingOpen = null
  let dispatchInFlight = false

  /**
   * Hands the deep link to the OS URL handler, which is what focuses the Agents
   * window on the target composer. Success here means the URL was accepted for
   * delivery, nothing more — see the note on `dispatched` at the top.
   */
  function dispatchDeepLink(url, platform) {
    if (typeof execFile !== 'function') return Promise.resolve(outcome('unavailable', '命令派发不可用'))
    const host = platform || (typeof process === 'object' && process ? process.platform : '')
    return new Promise((resolvePromise) => {
      const done = (error) => resolvePromise(error
        ? outcome('failed', '唤起 Cursor 失败')
        : outcome('dispatched', '已在 Cursor 打开该对话'))
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

  function dispatchTask(composerId, options) {
    const settings = options || {}
    const localId = normalizeComposerId(composerId)
    if (!localId) return Promise.resolve(outcome('unavailable', '该任务不是可定位的 Cursor 本地会话'))
    return dispatchDeepLink(agentDeepLink(localId), settings.platform)
  }

  function pumpOpenQueue() {
    if (dispatchInFlight || !pendingOpen) return
    const current = pendingOpen
    pendingOpen = null
    dispatchInFlight = true
    void dispatchTask(current.composerId, current.options).then(current.resolve, () => {
      current.resolve(outcome('failed', '唤起 Cursor 失败'))
    }).finally(() => {
      dispatchInFlight = false
      if (pendingOpen) {
        if (typeof queueMicrotask === 'function') queueMicrotask(pumpOpenQueue)
        else setTimer(pumpOpenQueue, 0)
      }
    })
  }

  /** Single-flight, latest-target-wins dispatch for rapid previous/next keys. */
  function openTask(composerId, options) {
    return new Promise((resolvePromise) => {
      if (pendingOpen) {
        pendingOpen.resolve(outcome('unavailable', '已由更新的 Cursor 跳转目标替代'))
      }
      pendingOpen = { composerId, options: options || {}, resolve: resolvePromise }
      if (typeof queueMicrotask === 'function') queueMicrotask(pumpOpenQueue)
      else setTimer(pumpOpenQueue, 0)
    })
  }

  return { openTask }
}

module.exports = {
  OPEN_TIMEOUT_MS,
  COMPOSER_ID_PATTERN,
  DEEPLINK_AUTHORITY,
  normalizeComposerId,
  agentDeepLink,
  createOpener
}
