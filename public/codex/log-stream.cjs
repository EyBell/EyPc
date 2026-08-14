'use strict'

/**
 * Action Runner log buffering, decoding and safety limits.
 *
 * Owns three limits that exist to stop a runaway action from taking the bridge
 * with it: the flush window and byte threshold that batch deltas, the 2MB tail
 * the retained transcript is trimmed to, and the 64KB cap on a single line
 * without a newline — past which the rest of that line is dropped rather than
 * buffered forever.
 *
 * Unlike the other extractions this one is not a verbatim move: the host
 * effects are injected instead of reached for. The module therefore never sees
 * the runner window, the IPC channel names or the database — it decides *what*
 * to deliver and the entry decides *how*. `deliverLogDeltas` takes the whole
 * batch rather than one delta at a time so the liveness check stays where it
 * was, outside the loop.
 */

const CODEX_LOG_STREAM_REVISION = 'codex-log-stream-v1'
const CODEX_ACTION_LOG_FLUSH_MS = 50
const CODEX_ACTION_LOG_FLUSH_BYTES = 16 * 1024
const CODEX_ACTION_LOG_RETAINED_BYTES = 2 * 1024 * 1024
const CODEX_ACTION_LOG_MAX_PENDING_BYTES = 64 * 1024

function createCodexActionLogStream(dependencies = {}) {
  const redact = typeof dependencies.redact === 'function' ? dependencies.redact : (text) => String(text || '')
  const persistRun = typeof dependencies.persistRun === 'function' ? dependencies.persistRun : () => {}
  const deliverLogDeltas = typeof dependencies.deliverLogDeltas === 'function' ? dependencies.deliverLogDeltas : () => {}
  const flushMs = Number(dependencies.flushMs) || CODEX_ACTION_LOG_FLUSH_MS
  const flushBytes = Number(dependencies.flushBytes) || CODEX_ACTION_LOG_FLUSH_BYTES

  function codexActionFlushLog(run) {
    if (!run) return
    if (run._logFlushTimer) {
      clearTimeout(run._logFlushTimer)
      run._logFlushTimer = null
    }
    const queue = Array.isArray(run._logQueue) ? run._logQueue.splice(0) : []
    run._logQueueBytes = 0
    if (!queue.length) return
    let next = run.logText || ''
    const deltas = []
    for (const item of queue) {
      next += item.text
      run.cursor = (run.cursor || 0) + 1
      deltas.push({ version: 1, runId: run.runId, cursor: run.cursor, stream: item.stream, text: item.text, receivedAt: item.receivedAt })
    }
    run.logText = next.length > CODEX_ACTION_LOG_RETAINED_BYTES ? next.slice(next.length - CODEX_ACTION_LOG_RETAINED_BYTES) : next
    run.logBytes = Buffer.byteLength(run.logText, 'utf8')
    run.logLines = (run.logText.match(/\n/g) || []).length + (run.logText && !run.logText.endsWith('\n') ? 1 : 0)
    persistRun(run)
    deliverLogDeltas(deltas)
  }

  function codexActionQueueSafeLog(run, stream, text) {
    if (!text) return
    run._logQueue ||= []
    const previous = run._logQueue[run._logQueue.length - 1]
    if (previous && previous.stream === stream && Buffer.byteLength(previous.text, 'utf8') + Buffer.byteLength(text, 'utf8') <= flushBytes) {
      previous.text += text
      previous.receivedAt = Date.now()
    } else {
      run._logQueue.push({ stream, text, receivedAt: Date.now() })
    }
    run._logQueueBytes = (run._logQueueBytes || 0) + Buffer.byteLength(text, 'utf8')
    if (run._logQueueBytes >= flushBytes) codexActionFlushLog(run)
    else if (!run._logFlushTimer) run._logFlushTimer = setTimeout(() => codexActionFlushLog(run), flushMs)
  }

  function codexActionLogStream(run, stream, privatePaths) {
    run._logStreams ||= new Map()
    if (run._logStreams.has(stream)) return run._logStreams.get(stream)
    let decoder = null
    try {
      const { StringDecoder } = require('node:string_decoder')
      decoder = new StringDecoder('utf8')
    } catch {
      decoder = { write: (chunk) => Buffer.from(chunk).toString('utf8'), end: () => '' }
    }
    const state = { decoder, pending: '', dropUntilNewline: false, privatePaths: [...new Set(privatePaths || [])] }
    run._logStreams.set(stream, state)
    return state
  }

  function codexActionConsumeDecodedLog(run, stream, state, decoded, final = false) {
    if (decoded) state.pending += decoded
    if (state.dropUntilNewline) {
      const newline = state.pending.indexOf('\n')
      if (newline < 0) {
        state.pending = ''
        return
      }
      state.pending = state.pending.slice(newline + 1)
      state.dropUntilNewline = false
    }
    for (;;) {
      const newline = state.pending.indexOf('\n')
      if (newline < 0) break
      const complete = state.pending.slice(0, newline + 1)
      state.pending = state.pending.slice(newline + 1)
      codexActionQueueSafeLog(run, stream, redact(complete, state.privatePaths))
    }
    if (state.pending.length > CODEX_ACTION_LOG_MAX_PENDING_BYTES) {
      codexActionQueueSafeLog(run, 'system', '[单行输出超过安全上限，已截断]\n')
      state.pending = ''
      state.dropUntilNewline = true
    }
    if (final && state.pending) {
      codexActionQueueSafeLog(run, stream, redact(state.pending, state.privatePaths))
      state.pending = ''
    }
  }

  return {
    revision: CODEX_LOG_STREAM_REVISION,
    codexActionFlushLog,
    codexActionQueueSafeLog,
    codexActionLogStream,
    codexActionConsumeDecodedLog
  }
}

module.exports = {
  CODEX_LOG_STREAM_REVISION,
  CODEX_ACTION_LOG_FLUSH_MS,
  CODEX_ACTION_LOG_FLUSH_BYTES,
  createCodexActionLogStream
}
