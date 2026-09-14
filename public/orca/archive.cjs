'use strict'

/**
 * Archive an Orca agent by closing its terminal pane. Live `working` sessions
 * are refused. Conversation bodies are never read. Closes the pane, not the
 * whole workspace (`--all` is forbidden here).
 */

const ORCA_ARCHIVE_REVISION = 'orca-agent-archive-v1'
const CLOSE_TIMEOUT_MS = 8_000

function textOf(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function outcome(kind, message, extra) {
  return { outcome: kind, message: message || '', revision: ORCA_ARCHIVE_REVISION, ...(extra || {}) }
}

function createArchiver(dependencies = {}) {
  const cli = dependencies.cli
  const lookupSession = typeof dependencies.lookupSession === 'function' ? dependencies.lookupSession : null

  async function archiveTask(paneKey) {
    const key = textOf(paneKey).toLowerCase()
    if (!key) return outcome('failed', '任务标识无效')
    if (!cli || typeof cli.json !== 'function') return outcome('failed', 'Orca CLI 不可用', { errorCode: 'archive-unavailable' })
    let session = null
    try {
      session = lookupSession ? await lookupSession(key) : null
    } catch {
      session = null
    }
    if (!session || typeof session !== 'object') {
      return outcome('failed', '找不到该 Orca 任务', { errorCode: 'not-found' })
    }
    if (session.state === 'working') {
      return outcome('failed', '进行中的 Orca 任务不能归档', { errorCode: 'live' })
    }
    const handle = textOf(session.handle)
    if (!handle) return outcome('indeterminate', '该任务没有可关闭的终端')
    const result = await cli.json(['terminal', 'close', '--terminal', handle], { timeoutMs: CLOSE_TIMEOUT_MS })
    if (result.ok === true) return outcome('archived', '已关闭该 Orca 任务')
    return outcome('failed', '关闭 Orca 任务失败', { errorCode: textOf(result.error && result.error.code) || 'close-failed' })
  }

  return { archiveTask }
}

module.exports = {
  ORCA_ARCHIVE_REVISION,
  createArchiver
}
