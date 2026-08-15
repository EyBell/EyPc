'use strict'

/**
 * How the desktop plan bridge classifies a live Codex request: a stable
 * correlation identity, a best-effort timestamp, and whether the request is
 * currently waiting on the user (input or approval).
 *
 * `codexDesktopProjectedRequest`/`codexDesktopProjectedRequests` fold a raw
 * request payload against the previous observation of "the same" request —
 * matched by correlation id when the source supplies one, otherwise by
 * `(type, method, startedAt)` — so a request's `observedSequence` and
 * `startedAt` survive across repeated observations instead of resetting on
 * every poll.
 *
 * `record`, `timestampMs` and `nextLiveEvidenceSequence` are injected on the
 * rollout-evidence precedent: `codexRecord`/`codexTimestampMs` are among the
 * hottest helpers in the entry, and `codexNextLiveEvidenceSequence` closes
 * over the entry's live-evidence counter, so all three stay there. `crypto`
 * is injected on the node-runtime precedent.
 */

const CODEX_DESKTOP_REQUEST_PROJECTION_REVISION = 'codex-desktop-request-projection-v1'

function createCodexDesktopRequestProjection(dependencies = {}) {
  const record = dependencies.record
  const timestampMs = dependencies.timestampMs
  const nextLiveEvidenceSequence = dependencies.nextLiveEvidenceSequence
  if (typeof record !== 'function' || typeof timestampMs !== 'function' || typeof nextLiveEvidenceSequence !== 'function') {
    throw new TypeError('codex desktop request projection requires record, timestampMs and nextLiveEvidenceSequence')
  }
  const crypto = dependencies.crypto || require('node:crypto')
  const correlationSalt = crypto.randomBytes(16)

  function codexDesktopRequestTimestamp(value) {
    const source = record(value)
    const params = record(source.params)
    return timestampMs(source.startedAt)
      || timestampMs(source.createdAt)
      || timestampMs(source.timestamp)
      || timestampMs(params.startedAt)
      || timestampMs(params.createdAt)
      || timestampMs(params.timestamp)
  }

  function codexDesktopRequestCorrelation(value) {
    const source = record(value)
    const params = record(source.params)
    const identity = [source.requestId, source.id, source.callId, params.requestId, params.id, params.callId]
      .find((candidate) => typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 512
        || Number.isSafeInteger(candidate))
    if (identity === undefined) return ''
    return crypto.createHash('sha256')
      .update(correlationSalt)
      .update('\0')
      .update(String(identity))
      .digest('hex')
      .slice(0, 32)
  }

  function codexDesktopProjectedRequest(value, observedAt = Date.now(), previous = null) {
    const source = record(value)
    const type = typeof source.type === 'string' ? source.type.slice(0, 80) : ''
    const method = typeof source.method === 'string' ? source.method.slice(0, 120) : ''
    const suppliedCorrelation = codexDesktopRequestCorrelation(source)
    const suppliedStartedAt = codexDesktopRequestTimestamp(source)
    const sameInstance = Boolean(previous)
      && (suppliedCorrelation
        ? previous.correlation === suppliedCorrelation
        : previous.type === type
          && previous.method === method
          && (!suppliedStartedAt || !previous.startedAt || previous.startedAt === suppliedStartedAt))
    const correlation = suppliedCorrelation
      || (sameInstance ? previous.correlation : '')
    const projection = {
      type,
      method,
      observedAt: timestampMs(observedAt) || Date.now(),
      observedSequence: sameInstance && Number.isInteger(previous?.observedSequence)
        ? previous.observedSequence
        : nextLiveEvidenceSequence()
    }
    if (correlation) projection.correlation = correlation
    const startedAt = suppliedStartedAt || (sameInstance ? timestampMs(previous?.startedAt) : 0)
    if (startedAt) projection.startedAt = startedAt
    if (sameInstance
      && previous.type === projection.type
      && previous.method === projection.method
      && !suppliedStartedAt
      && !startedAt
      && timestampMs(previous.observedAt)) projection.observedAt = previous.observedAt
    return projection
  }

  function codexDesktopProjectedRequests(values, previous = []) {
    const observations = Array.isArray(previous) ? [...previous] : []
    const used = new Set()
    const observedAt = Date.now()
    return values.map((value) => {
      const source = record(value)
      const type = typeof source.type === 'string' ? source.type.slice(0, 80) : ''
      const method = typeof source.method === 'string' ? source.method.slice(0, 120) : ''
      const startedAt = codexDesktopRequestTimestamp(source)
      const correlation = codexDesktopRequestCorrelation(source)
      const matchIndex = observations.findIndex((item, index) => !used.has(index)
        && (correlation
          ? item.correlation === correlation
          : item.type === type
            && item.method === method
            && (!startedAt || !item.startedAt || item.startedAt === startedAt)))
      if (matchIndex >= 0) used.add(matchIndex)
      return codexDesktopProjectedRequest(source, observedAt, matchIndex >= 0 ? observations[matchIndex] : null)
    })
  }

  function codexDesktopIsPlanImplementationRequest(request) {
    return String(request?.method || '').toLowerCase() === 'item/plan/requestimplementation'
  }

  function codexDesktopRequestFlag(request) {
    const type = String(request?.type || '').toLowerCase()
    const method = String(request?.method || '').toLowerCase()
    if (codexDesktopIsPlanImplementationRequest(request)
      || method === 'item/tool/requestuserinput'
      || method === 'requestuserinput'
      || type === 'userinput'
      || type === 'optionpicker'
      || type === 'setupcodex') return 'waitingOnUserInput'
    if (method === 'item/commandexecution/requestapproval'
      || method === 'item/filechange/requestapproval'
      || method === 'item/permissions/requestapproval'
      || method === 'mcpserver/elicitation/request'
      || method === 'requestapproval' && (type === 'approval' || type === 'commandexecution' || type === 'filechange' || type === 'permissions')
      || type === 'elicitation') return 'waitingOnApproval'
    return ''
  }

  return {
    revision: CODEX_DESKTOP_REQUEST_PROJECTION_REVISION,
    codexDesktopRequestTimestamp,
    codexDesktopRequestCorrelation,
    codexDesktopProjectedRequest,
    codexDesktopProjectedRequests,
    codexDesktopIsPlanImplementationRequest,
    codexDesktopRequestFlag
  }
}

module.exports = {
  CODEX_DESKTOP_REQUEST_PROJECTION_REVISION,
  createCodexDesktopRequestProjection
}
