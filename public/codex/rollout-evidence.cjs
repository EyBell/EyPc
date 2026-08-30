'use strict'

const { COMPANION_V7_REVISIONS } = require('../companion/contracts-v7.cjs')

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
/** A later default Turn consumes a Plan only on structural mutation evidence. */
const PLAN_EXECUTION_ITEM_TYPES = new Set(['filechange'])
const PLAN_EXECUTION_EVENT_TYPES = new Set(['patch_apply_begin', 'patch_apply_end'])
const PLAN_CLEAR_REASONS = new Set(['cancel', 'execution-start', 'archive', 'removal'])

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

  function codexRolloutPendingUserInputStateText(text, initialCorrelations) {
    const pendingCallIds = new Set(
      initialCorrelations instanceof Set
        ? [...initialCorrelations].filter((callId) => typeof callId === 'string' && callId.length <= MAX_CALL_ID_LENGTH)
        : []
    )
    if (typeof text !== 'string' || !text) {
      return { known: pendingCallIds.size > 0, pending: pendingCallIds.size > 0, correlations: pendingCallIds, edge: 'none' }
    }
    let known = pendingCallIds.size > 0
    let edge = 'none'
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.length > MAX_ROLLOUT_LINE_BYTES) continue
      let parsed
      try { parsed = JSON.parse(line) } catch { continue }
      const source = record(parsed)
      const payload = record(source.payload)
      const isUserContinuation = (source.type === 'event_msg' && payload.type === 'user_message')
        || (source.type === 'response_item' && payload.type === 'message' && payload.role === 'user')
      if (isUserContinuation) {
        pendingCallIds.clear()
        known = true
        edge = 'resume'
        continue
      }
      if (source.type === 'event_msg' && payload.type === 'task_started') {
        pendingCallIds.clear()
        known = true
        edge = 'resume'
        continue
      }
      if (source.type === 'event_msg' && (payload.type === 'task_complete' || payload.type === 'turn_aborted')) {
        pendingCallIds.clear()
        known = true
        edge = 'terminal'
        continue
      }
      if (source.type !== 'response_item') continue
      const callId = typeof payload.call_id === 'string' && payload.call_id.length <= MAX_CALL_ID_LENGTH
        ? payload.call_id
        : ''
      if (!callId) continue
      if (payload.type === 'function_call' && payload.name === 'request_user_input') {
        pendingCallIds.add(callId)
        known = true
        edge = 'waiting'
      } else if (payload.type === 'function_call_output') {
        if (pendingCallIds.has(callId)) edge = 'resume'
        pendingCallIds.delete(callId)
        known = true
      }
    }
    return { known, pending: pendingCallIds.size > 0, correlations: pendingCallIds, edge }
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
    const clearExecutedPlan = (source, payload) => {
      if (!planReady || turnMode !== 'default') return
      planReady = false
      planLifecycleState = 'cleared'
      planClearReason = 'execution-start'
      planLifecycleRevision = Math.max(
        planLifecycleRevision,
        currentTurnStartedAt,
        codexRolloutTimestampMs(source.timestamp, payload.started_at, payload.completed_at)
      )
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.length > MAX_ROLLOUT_LINE_BYTES) continue
      let parsed
      try { parsed = JSON.parse(line) } catch { continue }
      const source = record(parsed)
      const payload = record(source.payload)
      if (source.type !== 'event_msg') continue
      if (payload.type === 'task_started') {
        const mode = String(payload.collaboration_mode_kind || payload.collaborationModeKind || '').toLowerCase()
        turnMode = mode === 'plan' ? 'plan' : mode === 'default' ? 'default' : 'unknown'
        currentTurnStartedAt = codexRolloutTimestampMs(source.timestamp, payload.started_at)
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
        clearExecutedPlan(source, payload)
        continue
      }
      if (payload.type !== 'item_completed') continue
      const item = record(payload.item)
      const itemType = String(item.type || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (itemType === 'plan') {
        sawPlanCompletion = true
        planReady = true
        planLifecycleState = 'ready'
        planClearReason = ''
        planLifecycleRevision = currentTurnStartedAt
          || codexRolloutTimestampMs(source.timestamp, payload.completed_at)
          || planLifecycleRevision
      } else if (PLAN_EXECUTION_ITEM_TYPES.has(itemType)) {
        clearExecutedPlan(source, payload)
      }
    }
    return {
      // A later generic/default Turn can be a supplementary user message, so
      // task_started or AgentMessage alone cannot destroy the independent Plan
      // lifecycle. A structural file mutation is exact execution evidence.
      known: sawPlanCompletion,
      // A completed Plan establishes an actionable artifact. It does not
      // prove that a current input interaction is still open.
      pending: false,
      planReady,
      planLifecycleState,
      planLifecycleRevision,
      planClearReason,
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
    const retainedClear = previous.planLifecycleState === 'cleared'
      && PLAN_CLEAR_REASONS.has(previous.planClearReason) && previousRevision >= projectionRevision
    const projectedClear = projection.planLifecycleState === 'cleared'
      && PLAN_CLEAR_REASONS.has(projection.planClearReason) && projectionRevision > previousRevision
    const clear = retainedClear ? previous : projectedClear ? projection : null
    if (clear) return {
      planReady: false,
      planLifecycleState: 'cleared',
      planLifecycleRevision: Number(clear.planLifecycleRevision) || 0,
      planClearReason: clear.planClearReason || 'execution-start'
    }
    return {
      planReady: projection.planReady === true || previous.planReady === true,
      planLifecycleState: projection.planReady === true || previous.planReady === true ? 'ready' : 'unknown',
      planLifecycleRevision: projectionRevision || previousRevision,
      planClearReason: ''
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
  createCodexRolloutEvidence
}
