'use strict'

/**
 * Write Orca tab pin through `terminal pin --pinned/--no-pinned`.
 * Conversation bodies are never read. Pinning one agent pins that tab,
 * the same native tab pin Codex-style companion tasks use.
 */

const ORCA_PIN_REVISION = 'orca-tab-pin-v1'
const SET_TIMEOUT_MS = 8_000
const HANDLE = /^term_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PANE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function textOf(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function outcome(kind, message, extra) {
  return { outcome: kind, message: message || '', revision: ORCA_PIN_REVISION, ...(extra || {}) }
}

function createPinner(dependencies = {}) {
  const cli = dependencies.cli
  const lookupSession = typeof dependencies.lookupSession === 'function' ? dependencies.lookupSession : null

  async function setPin(paneKey, request = {}) {
    const key = textOf(paneKey).toLowerCase()
    const pinned = request.pinned === true
    if (!PANE.test(key)) return outcome('failed', '任务标识无效', { errorCode: 'stale-target' })
    if (!cli || typeof cli.json !== 'function') {
      return outcome('failed', 'Orca CLI 不可用', { errorCode: 'pin-unavailable' })
    }
    let session = null
    try {
      session = lookupSession ? await lookupSession(key) : null
    } catch {
      session = null
    }
    if (!session || typeof session !== 'object') {
      return outcome('failed', '找不到该 Orca 任务', { errorCode: 'not-found' })
    }
    if (textOf(session.paneKey).toLowerCase() !== key) {
      return outcome('failed', 'Orca 任务已变化', { errorCode: 'stale-target' })
    }
    const handle = textOf(session.handle)
    if (!HANDLE.test(handle)) {
      return outcome('failed', '该任务没有可同步的 Orca 标签', { errorCode: 'unsupported' })
    }
    const result = await cli.json(
      ['terminal', 'pin', '--terminal', handle, pinned ? '--pinned' : '--no-pinned'],
      { timeoutMs: SET_TIMEOUT_MS }
    )
    if (result.ok === true) {
      // A write receipt alone does not prove the renderer applied this tab's pin.
      const receipt = result.result && result.result.pin
      if (!receipt || receipt.handle !== handle || receipt.tabId !== key.slice(0, 36)
        || receipt.isPinned !== pinned) {
        return outcome('failed', 'Orca 置顶回执与原任务不一致', { errorCode: 'unverified' })
      }
      const listed = await cli.json(['terminal', 'list'], { timeoutMs: SET_TIMEOUT_MS })
      const rows = listed.ok === true && listed.result && listed.result.terminals
      const row = Array.isArray(rows) ? rows.find((item) => item.handle === handle
        && `${item.tabId}:${item.leafId}`.toLowerCase() === key) : null
      if (!row || row.connected === false || row.isPinned !== pinned) {
        return outcome('failed', 'Orca 标签置顶尚未核验', { errorCode: 'unverified' })
      }
      return outcome('completed', pinned ? '已同步到 Orca 标签置顶' : '已同步取消 Orca 标签置顶', {
        providerPin: pinned,
        method: 'terminal.pin'
      })
    }
    return outcome('failed', 'Orca 标签置顶同步失败', {
      errorCode: textOf(result.error && result.error.code) || 'pin-failed'
    })
  }

  return { setPin }
}

module.exports = {
  ORCA_PIN_REVISION,
  createPinner
}
