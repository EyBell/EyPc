'use strict'

/**
 * Version-gated Claude App metadata archive adapter.
 *
 * The exact file, stat/hash guard, atomic replacement and rollback are owned by
 * `code-sessions.cjs`. This adapter owns only platform/version/phase gates and
 * maps the private transaction result to the public three-state contract.
 */

const { LOCAL_SESSION_PATTERN } = require('./code-sessions.cjs')

const CLAUDE_ARCHIVE_REVISION = 'claude-metadata-archive-v2'
const SUPPORTED_APP_VERSION = '1.26832.0'

function normalizedSessionId(value) {
  const sessionId = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return LOCAL_SESSION_PATTERN.test(sessionId) ? sessionId : ''
}

function createArchiveAdapter(dependencies) {
  const codeSessions = dependencies.codeSessions
  const appState = dependencies.appState

  async function readArchivablePhase(sessionId) {
    if (typeof dependencies.readCurrentSessionPhase !== 'function') {
      return { outcome: 'indeterminate', message: 'Claude 实时任务状态读取器不可用，未执行归档' }
    }
    let current
    try {
      current = await dependencies.readCurrentSessionPhase(sessionId)
    } catch {
      return { outcome: 'indeterminate', message: '无法重新读取 Claude 实时任务状态，未执行归档' }
    }
    if (current?.status !== 'found' || current.compatibility !== 'compatible') {
      return { outcome: 'indeterminate', message: 'Claude 实时任务状态无法唯一确认，未执行归档' }
    }
    if (!['completed', 'stopped'].includes(current.phase)) {
      return { outcome: 'failed', message: 'Claude 任务状态已变化，当前不再允许归档' }
    }
    return { outcome: 'archivable', phase: current.phase }
  }

  async function archiveCodeSession(value) {
    const sessionId = normalizedSessionId(value)
    if (!sessionId) return { outcome: 'failed', message: 'Claude 任务身份已失效' }
    if ((dependencies.platform || process.platform) !== 'darwin') {
      return { outcome: 'failed', message: 'Claude 静默归档当前仅支持 macOS' }
    }
    const gate = appState.read()
    if (gate.compatibility !== 'compatible' || gate.appVersion !== SUPPORTED_APP_VERSION) {
      return { outcome: 'failed', message: `Claude ${gate.appVersion || '未知版本'} 未通过静默归档适配门禁` }
    }
    const before = codeSessions.readSessionState(sessionId)
    if (before.status !== 'found') {
      return { outcome: 'failed', message: 'Claude 任务实时身份无法唯一确认' }
    }
    if (before.isArchived === true) {
      return {
        outcome: 'archived',
        message: 'EyPc 归档已完成，任务已从 EyPc 列表移除；Claude 原生侧栏可能仍待刷新，当前尚未确认同步。',
        alreadyArchived: true
      }
    }
    const phase = await readArchivablePhase(sessionId)
    if (phase.outcome !== 'archivable') return phase
    let result = codeSessions.archiveSessionMetadata(sessionId)
    // One bounded retry is safe before any confirmed write: revalidate the
    // exact phase, then let the metadata transaction rebase once more.
    if (result?.outcome === 'indeterminate' && result.errorCode === 'source-changed') {
      const retryPhase = await readArchivablePhase(sessionId)
      if (retryPhase.outcome !== 'archivable') return retryPhase
      result = codeSessions.archiveSessionMetadata(sessionId)
    }
    if (result?.outcome !== 'archived') {
      return {
        outcome: result?.outcome === 'indeterminate' ? 'indeterminate' : 'failed',
        ...(typeof result?.errorCode === 'string' ? { errorCode: result.errorCode } : {}),
        message: result?.outcome === 'indeterminate'
          ? 'Claude 文件在归档期间发生并发变化，结果无法唯一确认，已保留任务卡片'
          : 'Claude 静默归档失败，已保留任务卡片'
      }
    }
    const verified = codeSessions.readSessionState(sessionId)
    if (verified.status !== 'found'
      || verified.isArchived !== true
      || codeSessions.hasActiveSession(sessionId)) {
      return { outcome: 'indeterminate', message: 'Claude 元数据或活动库存未同时确认归档，已保留任务卡片' }
    }
    return {
      outcome: 'archived',
      message: 'EyPc 归档已完成，任务已从 EyPc 列表移除；Claude 原生侧栏可能仍待刷新，当前尚未确认同步。',
      alreadyArchived: result.alreadyArchived === true
    }
  }

  return { revision: CLAUDE_ARCHIVE_REVISION, archiveCodeSession }
}

module.exports = {
  CLAUDE_ARCHIVE_REVISION,
  SUPPORTED_APP_VERSION,
  createArchiveAdapter
}
