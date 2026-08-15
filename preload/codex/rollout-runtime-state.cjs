'use strict'

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

  function codexRolloutRuntimeStateText(text) {
    const state = {
      known: false,
      phase: 'unknown',
      edge: 'none',
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
      'token_count'
    ])
    const liveResponseTypes = new Set([
      'custom_tool_call',
      'custom_tool_call_output',
      'function_call',
      'function_call_output',
      'reasoning'
    ])
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.length > MAX_ROLLOUT_RUNTIME_LINE_BYTES) continue
      let parsed
      try { parsed = JSON.parse(line) } catch { continue }
      const source = record(parsed)
      const payload = record(source.payload)
      const observedAt = rolloutTimestampMs(
        source.timestamp,
        payload.timestamp,
        payload.started_at,
        payload.completed_at
      )
      if (source.type === 'event_msg' && payload.type === 'task_started') {
        state.known = true
        state.phase = 'active'
        state.edge = 'task-started'
        state.startedAt = observedAt
        state.edgeAt = observedAt
        continue
      }
      if (source.type === 'event_msg' && payload.type === 'task_complete') {
        state.known = true
        state.phase = 'completed'
        state.edge = 'task-complete'
        state.edgeAt = observedAt
        continue
      }
      if (source.type === 'event_msg' && payload.type === 'turn_aborted') {
        state.known = true
        state.phase = 'interrupted'
        state.edge = 'turn-aborted'
        state.edgeAt = observedAt
        continue
      }
      const liveAppend = (source.type === 'event_msg' && liveEventTypes.has(payload.type))
        || (source.type === 'response_item' && liveResponseTypes.has(payload.type))
      if (!liveAppend) continue
      if (state.phase === 'completed' || state.phase === 'interrupted') state.startedAt = 0
      state.known = true
      state.phase = 'active'
      state.edge = 'live-append'
      state.edgeAt = observedAt
    }
    return state
  }

  return {
    revision: CODEX_ROLLOUT_RUNTIME_STATE_REVISION,
    codexRolloutRuntimeStateText
  }
}

module.exports = {
  CODEX_ROLLOUT_RUNTIME_STATE_REVISION,
  createCodexRolloutRuntimeState
}
