'use strict'

const COMPANION_OPEN_HANDOFF_REVISION = 'companion-open-handoff-v1'
const HANDOFF_ID_PATTERN = /^coh_[A-Za-z0-9_-]{12,80}$/
const HANDOFF_STAGES = new Set(['requested', 'dispatched', 'native-confirmed', 'applied', 'failed'])
const SOURCE_RELEASE_STATES = new Set(['confirmed', 'unknown', 'not-required'])
const CONTROL_OWNERS = new Set(['source', 'target-native', 'unknown'])

function normalizeCompanionOpenHandoff(value, requestedOutcome) {
  const source = value && typeof value === 'object' ? value : null
  if (!source
    || source.revision !== COMPANION_OPEN_HANDOFF_REVISION
    || typeof source.handoffId !== 'string'
    || !HANDOFF_ID_PATTERN.test(source.handoffId)
    || !HANDOFF_STAGES.has(source.stage)
    || !SOURCE_RELEASE_STATES.has(source.sourceRelease)
    || !CONTROL_OWNERS.has(source.controlOwner)) return null

  const nativeVisible = source.nativeVisible === true
  const confirmedStage = source.stage === 'native-confirmed' || source.stage === 'applied'
  if (requestedOutcome === 'opened' && (!confirmedStage || !nativeVisible || source.controlOwner !== 'target-native')) return null
  if (requestedOutcome === 'dispatched' && source.stage !== 'requested' && source.stage !== 'dispatched') return null
  if ((requestedOutcome === 'failed' || requestedOutcome === 'unavailable') && source.stage !== 'failed') return null

  return {
    revision: COMPANION_OPEN_HANDOFF_REVISION,
    handoffId: source.handoffId,
    stage: source.stage,
    sourceRelease: source.sourceRelease,
    nativeVisible,
    controlOwner: source.controlOwner,
    confirmsRead: source.confirmsRead === true && confirmedStage && nativeVisible && source.controlOwner === 'target-native'
  }
}

/** 自称 opened 但无原生可见且 controlOwner≠target-native 时，降成 dispatched。 */
function normalizeCompanionOpenReceipt(value) {
  const source = value && typeof value === 'object' ? value : {}
  const requestedOutcome = ['opened', 'dispatched', 'unavailable', 'failed'].includes(source.outcome)
    ? source.outcome
    : 'failed'
  const handoff = normalizeCompanionOpenHandoff(source.handoff, requestedOutcome)
  const downgraded = requestedOutcome === 'opened' && !handoff
  return {
    outcome: downgraded ? 'dispatched' : requestedOutcome,
    confirmsRead: !downgraded && requestedOutcome === 'opened' && handoff?.confirmsRead === true,
    handoff,
    downgraded
  }
}

/** Bounded readiness note: what the open-readiness step did before the opener ran. */
function normalizeOpenLaunch(value) {
  if (!value || typeof value !== 'object') return null
  const outcome = value.outcome === 'launched' ? 'launched' : value.outcome === 'ready' ? 'ready' : ''
  if (!outcome) return null
  const launcher = ['none', 'open-b', 'open-a', 'codexhost', 'unsupported'].includes(value.launcher) ? value.launcher : 'none'
  const waitedMs = Number.isFinite(Number(value.waitedMs)) ? Math.max(0, Math.trunc(Number(value.waitedMs))) : 0
  return { outcome, launcher, waitedMs }
}

/**
 * Kernel 与 navigation 共用同一打开结果形；字段只在这里加，避免两侧各拷一份。
 * One open result shape for the Kernel and the navigation lane. Both used to
 * carry a verbatim copy of this normalizer; a field added on one side was
 * silently dropped on the other.
 */
function normalizeOpenResult(value, target) {
  const source = value && typeof value === 'object' ? value : {}
  const receipt = normalizeCompanionOpenReceipt(source)
  const launch = normalizeOpenLaunch(source.launch)
  return {
    outcome: receipt.outcome,
    provider: target.provider,
    key: target.key,
    ...(typeof source.operationId === 'string' ? { operationId: source.operationId.slice(0, 160) } : {}),
    ...(typeof source.errorCode === 'string' && source.errorCode ? { errorCode: source.errorCode.slice(0, 80) } : {}),
    ...(typeof source.message === 'string' && source.message
      ? { message: source.message.slice(0, 240) }
      : receipt.downgraded ? { message: '打开请求已发送，等待原生确认' } : {}),
    confirmsRead: receipt.confirmsRead,
    ...(receipt.handoff ? { handoff: receipt.handoff } : {}),
    ...(launch ? { launch } : {})
  }
}

module.exports = {
  COMPANION_OPEN_HANDOFF_REVISION,
  normalizeCompanionOpenHandoff,
  normalizeCompanionOpenReceipt,
  normalizeOpenLaunch,
  normalizeOpenResult
}
