'use strict'

const { compareCodexTurnOrder } = require('../companion/branch-causality.cjs')
const { codexRolloutTurnStart } = require('./rollout-evidence.cjs')

/**
 * Reads a Codex rollout JSONL tail and answers whether the thread's live
 * runtime (as opposed to persisted Turn status) is active, completed, or
 * interrupted, and what edge last moved it there.
 *
 * `task_started`/`task_complete`/`turn_aborted` are hard phase boundaries.
 * Between boundaries, any live-stream event (agent message, reasoning, tool
 * call, patch apply, token count) or response item (tool call, function
 * call, reasoning) counts as a live append that keeps the phase `active` --
 * this is what lets a caller tell "still streaming" apart from "the last
 * boundary was a completion and nothing has happened since."
 *
 * Pure text analysis with no host contact, on the same discipline as
 * rollout-evidence.cjs: an unparseable or oversized line is skipped, not
 * treated as evidence, and a malformed line must never make this reader
 * throw. `record` and `rolloutTimestampMs` are injected -- `codexRecord` is
 * among the hottest helpers in the entry, and `rolloutTimestampMs` is
 * itself already an extracted rollout-evidence.cjs port reached through the
 * entry's own delegation.
 */

const CODEX_ROLLOUT_RUNTIME_STATE_REVISION = 'codex-rollout-runtime-state-v1'
/** A rollout line is another process's output; refuse to read pathological ones. */
const MAX_ROLLOUT_RUNTIME_LINE_BYTES = 1_000_000

function createCodexRolloutRuntimeState(dependencies = {}) {
  const record = dependencies.record
  const rolloutTimestampMs = dependencies.rolloutTimestampMs
  if (typeof record !== 'function' || typeof rolloutTimestampMs !== 'function') {
    throw new TypeError('codex rollout runtime state requires record and rolloutTimestampMs')
  }

  function codexRolloutRuntimeStateText(text, appendedBytes = 0) {
    const state = {
      known: false,
      phase: 'unknown',
      edge: 'none',
      turnId: '',
      startedAt: 0,
      edgeAt: 0
    }
    if (typeof text !== 'string' || !text) return state
    const liveEventTypes = new Set([
      'agent_message',
      'agent_reasoning',
      'mcp_tool_call_begin',
      'mcp_tool_call_end',
      'patch_apply_begin',
      'patch_apply_end',
    ])
    const liveResponseTypes = new Set([
      'custom_tool_call',
      'custom_tool_call_output',
      'function_call',
      'function_call_output',
      'reasoning'
    ])
    let interruptedAt = 0
    let lineEnd = -1
    let edgeEnd = 0
    let startEnd = -1
    let itemEnd = -1
    let itemAt = 0
    let sawTurnBoundary = false
    let identifiedItemAt = 0
    let retainedTerminal = null
    const noteAmbiguous = (turnId) => {
      if (!turnId || !state.turnId || turnId === state.turnId) return
      state.turnOrderUnclear = true
    }
    // Ids and start times decide. A late older terminal must not become current,
    // and a same-second pair without precision or predecessor stays unresolved.
    const foreignTurnOrder = (turnId, eventStart, previousEnd) => {
      if (turnId && state.turnId && turnId === state.turnId) return 'current'
      if (!turnId || !state.turnId) {
        if (state.known && Boolean(turnId) !== Boolean(state.turnId)) return 'unknown'
        return 'current'
      }
      if (!state.known) return 'newer'
      const usePreviousEnd = !state.startedAt && previousEnd?.precision && eventStart.precision
      const order = compareCodexTurnOrder(
        {
          causalDomain: 'codex-rollout-turn',
          causalKey: state.turnId,
          turnStartedAt: usePreviousEnd ? previousEnd.at : state.startedAt,
          turnStartedAtPrecisionMs: usePreviousEnd ? previousEnd.precision : state.turnStartedAtPrecisionMs
        },
        {
          causalDomain: 'codex-rollout-turn',
          causalKey: turnId,
          turnStartedAt: eventStart.at,
          turnStartedAtPrecisionMs: eventStart.precision
        }
      )
      return order === 'newer' || (order === 'older' && !usePreviousEnd) ? order : 'unknown'
    }
    for (const line of text.split('\n')) {
      lineEnd += line.length + 1
      if (!line || line.length > MAX_ROLLOUT_RUNTIME_LINE_BYTES) continue
      let parsed
      try { parsed = JSON.parse(line) } catch { continue }
      const source = record(parsed)
      const payload = record(source.payload)
      const turnId = typeof payload.turn_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(payload.turn_id)
        ? payload.turn_id : ''
      const observedAt = rolloutTimestampMs(
        source.timestamp,
        payload.timestamp,
        payload.started_at,
        payload.completed_at
      )
      if (source.type === 'event_msg' && payload.type === 'task_started') {
        const start = codexRolloutTurnStart(rolloutTimestampMs, source.timestamp, payload.timestamp, payload.started_at)
        const startedRelation = foreignTurnOrder(turnId, start, retainedTerminal)
        if (startedRelation === 'older' || startedRelation === 'unknown') {
          if (startedRelation === 'unknown') noteAmbiguous(turnId)
          continue
        }
        retainedTerminal = null
        sawTurnBoundary = true
        edgeEnd = lineEnd
        startEnd = lineEnd
        itemEnd = -1
        itemAt = 0
        state.known = true
        state.phase = 'active'
        state.edge = 'task-started'
        state.turnId = turnId
        state.startedAt = start.at
        state.turnStartedAtPrecisionMs = start.precision
        state.edgeAt = observedAt
        if (startedRelation === 'newer') delete state.turnOrderUnclear
        continue
      }
      if (source.type === 'event_msg' && payload.type === 'task_complete') {
        const completeStart = codexRolloutTurnStart(rolloutTimestampMs, payload.started_at)
        const completeRelation = foreignTurnOrder(turnId, completeStart)
        if (completeRelation === 'older' || completeRelation === 'unknown') {
          if (completeRelation === 'unknown') noteAmbiguous(turnId)
          continue
        }
        retainedTerminal = turnId
          ? codexRolloutTurnStart(rolloutTimestampMs, source.timestamp, payload.timestamp, payload.completed_at)
          : null
        sawTurnBoundary = true
        edgeEnd = lineEnd
        state.known = true
        state.phase = 'completed'
        state.edge = 'task-complete'
        if (turnId) {
          if (state.turnId !== turnId) {
            state.startedAt = completeStart.at
            state.turnStartedAtPrecisionMs = completeStart.precision
          }
          state.turnId = turnId
        }
        state.edgeAt = observedAt
        if (completeRelation === 'newer') delete state.turnOrderUnclear
        continue
      }
      if (source.type === 'event_msg' && payload.type === 'turn_aborted') {
        const explicitStart = codexRolloutTurnStart(rolloutTimestampMs, payload.started_at)
        if (!state.known && !turnId) continue
        const abortRelation = foreignTurnOrder(turnId, explicitStart)
        if (abortRelation === 'older' || abortRelation === 'unknown') {
          if (abortRelation === 'unknown') noteAmbiguous(turnId)
          continue
        }
        retainedTerminal = turnId
          ? codexRolloutTurnStart(rolloutTimestampMs, source.timestamp, payload.timestamp, payload.completed_at)
          : null
        sawTurnBoundary = true
        edgeEnd = lineEnd
        state.known = true
        state.phase = 'interrupted'
        state.edge = 'turn-aborted'
        interruptedAt = turnId ? rolloutTimestampMs(source.timestamp, payload.timestamp, payload.completed_at) : 0
        if (turnId) {
          if (explicitStart.at && explicitStart.at <= observedAt) {
            state.startedAt = explicitStart.at
            state.turnStartedAtPrecisionMs = explicitStart.precision
          } else if (state.turnId !== turnId) {
            state.startedAt = 0
            state.turnStartedAtPrecisionMs = 0
          }
          state.turnId = turnId
        }
        state.edgeAt = observedAt
        if (abortRelation === 'newer') delete state.turnOrderUnclear
        continue
      }
      const identifiedItem = source.type === 'event_msg' && payload.type === 'item_completed'
        && turnId && observedAt > 0
      if (identifiedItem) {
        if (sawTurnBoundary && !(state.phase === 'active' && state.startedAt && state.turnId === turnId)) continue
        state.turnId = turnId
        if (!sawTurnBoundary) identifiedItemAt = observedAt
      }
      const liveAppend = identifiedItem || (source.type === 'event_msg' && liveEventTypes.has(payload.type))
        || (source.type === 'response_item' && liveResponseTypes.has(payload.type))
      if (!liveAppend || state.phase === 'completed' || state.phase === 'interrupted'
        || turnId && state.turnId && turnId !== state.turnId) continue
      if (identifiedItem) {
        itemEnd = lineEnd
        itemAt = observedAt
      }
      edgeEnd = lineEnd
      state.known = true
      state.phase = 'active'
      state.edge = 'live-append'
      state.edgeAt = observedAt
    }
    if (!sawTurnBoundary && identifiedItemAt > 0) state.turnActivityAt = identifiedItemAt
    if (state.edge === 'turn-aborted' && interruptedAt > 0) state.interruptedAt = interruptedAt
    if (retainedTerminal?.at === state.edgeAt && retainedTerminal?.precision) {
      state.terminalAtPrecisionMs = retainedTerminal.precision
    }
    if (state.known && appendedBytes > 0 && Buffer.byteLength(text.slice(edgeEnd)) < appendedBytes) {
      state.appended = true
      if (startEnd >= 0 && Buffer.byteLength(text.slice(startEnd)) < appendedBytes) state.startAppended = true
      if (state.phase === 'active' && itemEnd >= 0 && Buffer.byteLength(text.slice(itemEnd)) < appendedBytes) {
        state.appendedTurnItemAt = itemAt
      }
    }
    return state
  }

  function codexRolloutRuntimeForTurn(runtime, input = {}) {
    if (!runtime?.known) return null
    const appended = input.appended === true && runtime.appended === true
    const owner = input.owner
    const currentOwner = owner?.ownerClientId && !owner.ownerDisconnectedAt
    const ownerTurn = currentOwner && owner.canonicalLatestComplete === true
      ? owner.currentCanonicalTurn : null
    const known = input.known
    const sameTurn = Boolean(runtime.turnId) && known?.lastTurnId === runtime.turnId
    if (runtime.phase === 'active') {
      const knownStart = Number(known?.lastTurnStartedAt) || 0
      if (runtime.turnActivityAt > 0 && (!sameTurn || !knownStart || runtime.turnActivityAt < knownStart)) return null
      if (!appended) {
        if (!input.writable || !sameTurn || !(runtime.startedAt > 0 || runtime.turnActivityAt > 0) || input.confirmedTerminal
          || !['interrupted', 'inProgress'].includes(known.lastTurnStatus)
          || known.idleConfirmed || known.appServerLiveActive || known.activeFlags?.length || currentOwner) return null
      } else if (input.confirmedTerminal || known?.lastTurnStatus === 'completed') {
        const terminalAt = Math.max(Number(known?.lastTurnCompletedAt) || 0, Number(known?.lastTurnStartedAt) || 0,
          input.cachedTurn?.id === known?.lastTurnId ? Number(input.cachedTurn?.interruptedAt) || 0 : 0)
        if (!runtime.startAppended || runtime.startedAt <= terminalAt) return null
      } else if (!sameTurn && (!runtime.startedAt || runtime.startedAt < (Number(known?.lastTurnStartedAt) || 0))) {
        return null
      }
    } else if (!appended && (!input.writable || !sameTurn || !runtime.edgeAt || currentOwner
      || known.appServerLiveActive || input.confirmedTerminal)) {
      return null
    }
    if (!runtime?.turnId) return ownerTurn?.turnRef ? null : runtime
    const sameOwnerTurn = Boolean(ownerTurn?.turnRef) && ownerTurn.turnRef === input.turnRef
    if (sameOwnerTurn && runtime.phase === 'active'
      && ['completed', 'interrupted', 'failed'].includes(ownerTurn.status)) return null
    const startedAt = sameOwnerTurn ? Number(ownerTurn.startedAt) || 0
      : input.cachedTurn?.id === runtime.turnId ? Number(input.cachedTurn.startedAt) || 0
        : input.known?.lastTurnId === runtime.turnId ? Number(input.known.lastTurnStartedAt) || 0 : 0
    return startedAt > 0 ? { ...runtime, startedAt } : runtime
  }

  return {
    revision: CODEX_ROLLOUT_RUNTIME_STATE_REVISION,
    codexRolloutRuntimeStateText,
    codexRolloutRuntimeForTurn
  }
}

module.exports = {
  CODEX_ROLLOUT_RUNTIME_STATE_REVISION,
  createCodexRolloutRuntimeState
}
