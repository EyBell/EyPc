'use strict'

/**
 * Write Orca tab pin through `terminal pin --pinned/--no-pinned`.
 * Conversation bodies are never read. Pinning one agent pins that tab,
 * the same native tab pin Codex-style companion tasks use.
 */

const ORCA_PIN_REVISION = 'orca-tab-pin-v1'
const SET_TIMEOUT_MS = 8_000
const HANDLE = /^term_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    if (!key) return outcome('failed', '任务标识无效', { errorCode: 'stale-target' })
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
    const handle = textOf(session.handle)
    if (!HANDLE.test(handle)) {
      return outcome('failed', '该任务没有可同步的 Orca 标签', { errorCode: 'unsupported' })
    }
    const result = await cli.json(
      ['terminal', 'pin', '--terminal', handle, pinned ? '--pinned' : '--no-pinned'],
      { timeoutMs: SET_TIMEOUT_MS }
    )
    if (result.ok === true) {
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
