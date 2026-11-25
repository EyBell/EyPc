'use strict'

const { COMPANION_V7_REVISIONS } = require('../companion/contracts-v7.cjs')
const { compareCodexTurnOrder } = require('../companion/branch-causality.cjs')

/**
 * Reads a Codex rollout JSONL tail and answers two questions about the thread:
 * is it waiting on the user, and does it hold a ready Plan.
 *
 * Pure text analysis with no host contact — no filesystem, no caches, no
 * timers. The caller decides how much tail to read and progressively widens it
 * until one of these returns `known: true`; that widening policy, and the byte
 * budgets it uses, stay with the caller.
 *
 * Both readers fold a line stream into a small state, and both must treat an
 * unparseable or oversized line as absent rather than as evidence. Extracting
 * them together keeps that shared discipline in one file: a rollout line is
 * untrusted input written by another process, and a reader that throws on a
 * malformed line would take down whichever scan invoked it.
 *
 * The value coercers are injected rather than imported. They are among the
 * hottest helpers in the entry — `codexRecord` alone has 211 call sites — so
 * they stay there, where a load failure cannot reach them.
 */

const CODEX_ROLLOUT_EVIDENCE_REVISION = COMPANION_V7_REVISIONS.rolloutEvidence

/** A rollout line is another process's output; refuse to read pathological ones. */
const MAX_ROLLOUT_LINE_BYTES = 1_000_000
/** Correlation ids come from the same untrusted stream. */
const MAX_CALL_ID_LENGTH = 200
/** Structural mutation also proves execution when native attribution is absent. */
const PLAN_EXECUTION_ITEM_TYPES = new Set(['filechange'])
const PLAN_EXECUTION_EVENT_TYPES = new Set(['patch_apply_begin', 'patch_apply_end'])
const PLAN_CLEAR_REASONS = new Set(['cancel', 'execution-start', 'archive', 'removal'])

function codexRolloutTurnStart(timestampMs, ...values) {
  for (const value of values) {
    const at = timestampMs(value)
    if (!at) continue
    const numeric = ['number', 'string'].includes(typeof value) ? Number(value) : NaN
    let precision = 0
    if (numeric === at || Number.isFinite(numeric) && !Number.isInteger(numeric)) precision = 1
    else if (numeric * 1000 === at) precision = 1000
    else if (typeof value === 'string' && /T\d\d:\d\d:\d\d/.test(value)) precision = /\d\d\.\d+/.test(value) ? 1 : 1000
    return { at, precision }
  }
  return { at: 0, precision: 0 }
}

function createCodexRolloutEvidence(dependencies = {}) {
  const record = dependencies.record
  const timestampMs = dependencies.timestampMs
  if (typeof record !== 'function' || typeof timestampMs !== 'function') {
    throw new TypeError('codex rollout evidence requires record and timestampMs')
  }

  /**
   * First usable timestamp across the candidates, tolerating both epoch numbers
   * and ISO strings — rollout writers use either depending on the field.
   */
  function codexRolloutTimestampMs(...values) {
    for (const value of values) {
      const numeric = timestampMs(value)
      if (numeric) return numeric
      if (typeof value === 'string') {
        const parsed = Date.parse(value)
        if (Number.isFinite(parsed) && parsed > 0) return parsed
      }
    }
    return 0
  }

  function codexReliableTurnId(payload) {
    const turnId = payload?.turn_id
    return typeof turnId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(turnId) ? turnId : ''
  }

  function codexRolloutPendingUserInputStateText(text, initialCorrelations) {
    const calls = new Map()
    if (initialCorrelations instanceof Set) {
      for (const callId of initialCorrelations) {
        if (typeof callId === 'string' && callId.length <= MAX_CALL_ID_LENGTH) calls.set(callId, { turnId: '', since: 0 })
      }
    }
    const empty = { known: calls.size > 0, pending: calls.size > 0, correlations: new Set(calls.keys()), edge: 'none', waitingSince: 0 }
    if (typeof text !== 'string' || !text) return empty
    let known = calls.size > 0
    let edge = 'none'
    let waitingSince = 0
    let currentTurnId = ''
    let currentStart = null
    const recomputeSince = () => {
      waitingSince = 0
      for (const owner of calls.values()) {
        if (owner.since && (!waitingSince || owner.since < waitingSince)) waitingSince = owner.since
      }
    }
    const clearOwned = (turnId, includeUnscoped) => {
      for (const [callId, owner] of calls) {
        if (owner.turnId === turnId || (includeUnscoped && !owner.turnId)) calls.delete(callId)
      }
      recomputeSince()
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.length > MAX_ROLLOUT_LINE_BYTES) continue
      let parsed
      try { parsed = JSON.parse(line) } catch { continue }
      const source = record(parsed)
      const payload = record(source.payload)
      const eventTurnId = codexReliableTurnId(payload)
      const isUserContinuation = (source.type === 'event_msg' && payload.type === 'user_message')
        || (source.type === 'response_item' && payload.type === 'message' && payload.role === 'user')
      const isTurnStart = source.type === 'event_msg' && payload.type === 'task_started'
      const isTurnEnd = source.type === 'event_msg' && (payload.type === 'task_complete' || payload.type === 'turn_aborted')
      if (isTurnStart) {
        const { at, precision } = codexRolloutTurnStart(codexRolloutTimestampMs, source.timestamp, payload.started_at)
        const start = { causalDomain: 'codex-rollout-turn', causalKey: eventTurnId,
          turnStartedAt: at, turnStartedAtPrecisionMs: precision }
        if (currentStart?.turnStartedAt && at && currentTurnId && eventTurnId && currentTurnId !== eventTurnId
          && compareCodexTurnOrder(currentStart, start) !== 'newer') continue
        if (eventTurnId) {
          currentTurnId = eventTurnId
          currentStart = start
        }
        calls.clear()
        waitingSince = 0
        known = true
        edge = 'resume'
        continue
      }
      if (isUserContinuation || isTurnEnd) {
        // A terminal or continuation of A must not retire B's pending tool.
        // Missing identity only clears the open undifferentiated stream.
        if (!(eventTurnId && currentTurnId && eventTurnId !== currentTurnId)) {
          const target = eventTurnId || currentTurnId
          if (!target) calls.clear()
          else clearOwned(target, target === currentTurnId)
          if (!calls.size) waitingSince = 0
          known = true
          edge = isTurnEnd ? 'terminal' : 'resume'
        }
        continue
      }
      if (source.type !== 'response_item') continue
      const callId = typeof payload.call_id === 'string' && payload.call_id.length <= MAX_CALL_ID_LENGTH
        ? payload.call_id
        : ''
      if (!callId) continue
      if (payload.type === 'function_call' && payload.name === 'request_user_input') {
        const since = codexRolloutTimestampMs(source.timestamp)
        calls.set(callId, { turnId: eventTurnId || currentTurnId, since })
        if (!waitingSince) waitingSince = since
        known = true
        edge = 'waiting'
      } else if (payload.type === 'function_call_output') {
        const owner = calls.get(callId)
        if (owner && (!eventTurnId || !owner.turnId || owner.turnId === eventTurnId)) {
          calls.delete(callId)
          edge = 'resume'
        }
        if (!calls.size) waitingSince = 0
        else recomputeSince()
        known = true
      }
    }
    return { known, pending: calls.size > 0, correlations: new Set(calls.keys()), edge, waitingSince }
  }

  function codexRolloutHasPendingUserInputText(text) {
    return codexRolloutPendingUserInputStateText(text).pending
  }

  function codexRolloutPendingPlanStateText(text) {
    if (typeof text !== 'string' || !text) {
      return {
        known: false,
        pending: false,
        planReady: false,
        planLifecycleState: 'unknown',
        planLifecycleRevision: 0,
        planClearReason: '',
        turnMode: 'unknown'
      }
    }
    let sawPlanCompletion = false
    let planReady = false
    let planLifecycleState = 'unknown'
    let planLifecycleRevision = 0
    let planClearReason = ''
    let turnMode = 'unknown'
    let currentTurnStartedAt = 0
    let currentTurnId = ''
    let planTurnId = ''
    let turnOrdinal = 0
    let planTurnOrdinal = 0
    let planEstablishedAt = 0
    const completedPlanIds = new Set()
    const clearExecutedPlan = (source, payload) => {
      const executionAt = codexRolloutTimestampMs(source.timestamp, payload.started_at, payload.completed_at)
      // Append order must establish a later default Turn, even when clocks tie.
      // A replayed older Turn/mutation cannot consume the current artifact.
      if (!planReady || turnMode !== 'default' || turnOrdinal <= planTurnOrdinal
        || currentTurnStartedAt && planEstablishedAt && currentTurnStartedAt < planEstablishedAt
        || executionAt && executionAt < Math.max(currentTurnStartedAt, planEstablishedAt)) return
      planReady = false
      planLifecycleState = 'cleared'
      planClearReason = 'execution-start'
      planLifecycleRevision = Math.max(
        planLifecycleRevision + 1,
        currentTurnStartedAt,
        executionAt
      )
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.length > MAX_ROLLOUT_LINE_BYTES) continue
      let parsed
      try { parsed = JSON.parse(line) } catch { continue }
      const source = record(parsed)
      const payload = record(source.payload)
      if (source.type !== 'event_msg') continue
      const turnId = typeof payload.turn_id === 'string' && payload.turn_id.length <= MAX_CALL_ID_LENGTH ? payload.turn_id : ''
      if (payload.type === 'task_started') {
        turnOrdinal += 1
        currentTurnId = turnId
        const mode = String(payload.collaboration_mode_kind || payload.collaborationModeKind || '').toLowerCase()
        turnMode = mode === 'plan' ? 'plan' : mode === 'default' ? 'default' : 'unknown'
        currentTurnStartedAt = codexRolloutTimestampMs(source.timestamp, payload.started_at)
        // Native implementation attribution consumes the latest same-thread
        // Plan even when implementation uses commands/MCP rather than patches.
        // Ordinary composer/queue/feedback turns remain non-consuming.
        if (record(payload.turn_attribution).turn_trigger === 'plan_implementation') {
          clearExecutedPlan(source, payload)
        }
        continue
      }
      if (payload.type === 'turn_aborted') {
        // Interruption is activity evidence only. It does not say whether the
        // native Plan card was cancelled, retained for later, or is about to
        // be executed. Keep an already-established lifecycle intact.
        turnMode = 'unknown'
        continue
      }
      if (PLAN_EXECUTION_EVENT_TYPES.has(payload.type)) {
        if (!turnId || !currentTurnId || turnId === currentTurnId) clearExecutedPlan(source, payload)
        continue
      }
      if (payload.type !== 'item_completed') continue
      const item = record(payload.item)
      const itemType = String(item.type || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (itemType === 'plan') {
        if (turnId && currentTurnId && turnId !== currentTurnId) continue
        // Repeated completion of one exact artifact is not a new Plan, including
        // replay after execution. Do not inspect/hash Plan prose for identity.
        const planId = typeof item.id === 'string' && item.id.length <= MAX_CALL_ID_LENGTH ? item.id : ''
        if (planId && completedPlanIds.has(planId)) continue
        if (planId) completedPlanIds.add(planId)
        planTurnOrdinal = turnOrdinal
        planTurnId = turnId || currentTurnId
        planEstablishedAt = codexRolloutTimestampMs(source.timestamp, payload.completed_at) || currentTurnStartedAt
        sawPlanCompletion = true
        planReady = true
        planLifecycleState = 'ready'
        planClearReason = ''
        planLifecycleRevision = Math.max(
          planLifecycleRevision ? planLifecycleRevision + 1 : 0,
          currentTurnStartedAt || planEstablishedAt
        )
      } else if (PLAN_EXECUTION_ITEM_TYPES.has(itemType)) {
        if (!turnId || !currentTurnId || turnId === currentTurnId) clearExecutedPlan(source, payload)
      }
    }
    return {
      // A later generic/default Turn can be a supplementary user message, so
      // task_started or AgentMessage alone cannot destroy the independent Plan
      // lifecycle. Native implementation attribution or a structural file
      // mutation is exact execution evidence.
      known: sawPlanCompletion,
      // A completed Plan establishes an actionable artifact. It does not
      // prove that a current input interaction is still open.
      pending: false,
      planReady,
      planLifecycleState,
      planLifecycleRevision,
      planClearReason,
      planTurnId,
      turnMode
    }
  }

  function codexRolloutNormalizedPlanLifecycle(value, lastTurn) {
    const source = record(value)
    const turn = record(lastTurn)
    const cleared = source.planLifecycleState === 'cleared' && PLAN_CLEAR_REASONS.has(source.planClearReason)
    const ready = !cleared && (source.planReady === true || source.pending === true)
    const revision = Number(source.planLifecycleRevision)
      || ((ready || cleared) && turn.status === 'completed' ? timestampMs(turn.startedAt) : 0)
    return {
      known: source.known === true,
      planReady: ready,
      planLifecycleState: cleared ? 'cleared' : ready ? 'ready' : 'unknown',
      planLifecycleRevision: revision,
      planClearReason: cleared ? source.planClearReason : '',
      turnMode: source.turnMode === 'plan' || source.turnMode === 'default' ? source.turnMode : 'unknown'
    }
  }

  function codexRolloutPlanClearPatch(current, value) {
    const source = codexRolloutNormalizedPlanLifecycle(value, current)
    const previousRevision = Number(record(current).planLifecycleRevision) || 0
    if (source.planLifecycleState !== 'cleared' || source.planClearReason !== 'execution-start'
      || source.planLifecycleRevision <= previousRevision) return null
    return {
      planReady: false,
      planLifecycleState: 'cleared',
      planLifecycleRevision: source.planLifecycleRevision,
      planClearReason: 'execution-start',
      planImplementationOnly: false,
      connectorPlanReady: false,
      connectorPlanLifecycleRevision: source.planLifecycleRevision,
      connectorPlanImplementationOnly: false,
      turnMode: 'default',
      connectorTurnMode: 'default'
    }
  }

  function codexMergeProjectedPlanLifecycle(projectionValue, previousValue) {
    const projection = record(projectionValue)
    const previous = record(previousValue)
    const projectionRevision = Number(projection.planLifecycleRevision) || 0
    const previousRevision = Number(previous.planLifecycleRevision) || 0
    const previousClear = previous.planLifecycleState === 'cleared' && PLAN_CLEAR_REASONS.has(previous.planClearReason)
    const projectedClear = projection.planLifecycleState === 'cleared' && PLAN_CLEAR_REASONS.has(projection.planClearReason)
    const previousKnown = previousClear || previous.planReady === true
    const projectedKnown = projectedClear || projection.planReady === true
    const acceptProjection = projectedKnown && (!previousKnown || projectionRevision > previousRevision
      || projectionRevision === previousRevision && projectedClear && !previousClear)
    const current = acceptProjection ? projection : previous
    const cleared = acceptProjection ? projectedClear : previousClear
    const ready = !cleared && current.planReady === true
    return {
      planReady: ready,
      planLifecycleState: cleared ? 'cleared' : ready ? 'ready' : 'unknown',
      planLifecycleRevision: cleared || ready ? Number(current.planLifecycleRevision) || 0 : 0,
      planClearReason: cleared ? current.planClearReason : ''
    }
  }

  return {
    revision: CODEX_ROLLOUT_EVIDENCE_REVISION,
    codexRolloutTimestampMs,
    codexRolloutPendingUserInputStateText,
    codexRolloutHasPendingUserInputText,
    codexRolloutPendingPlanStateText,
    codexRolloutNormalizedPlanLifecycle,
    codexRolloutPlanClearPatch,
    codexMergeProjectedPlanLifecycle
  }
}

module.exports = {
  CODEX_ROLLOUT_EVIDENCE_REVISION,
  MAX_ROLLOUT_LINE_BYTES,
  MAX_CALL_ID_LENGTH,
  codexRolloutTurnStart,
  createCodexRolloutEvidence
}
