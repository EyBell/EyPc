'use strict'

/**
 * Detects a user-interrupted Claude Code CLI turn from the session transcript.
 *
 * An Esc interrupt fires no hook at all — verified live: the hook queue shows
 * `UserPromptSubmit … (nothing) … UserPromptSubmit` around an interrupt while
 * the transcript records a user line whose text is
 * `[Request interrupted by user]` — so hook-only evidence keeps the session
 * "running" until the next prompt arrives. The transcript tail is the one
 * durable witness. This module reads a bounded tail and answers "was the open
 * turn interrupted, and when"; the caller folds that into the published phase.
 *
 * The verdict considers only the LAST user/assistant record: a tool-result
 * user line without the marker means the Turn is genuinely still running, and
 * any newer prompt or assistant record supersedes an older interrupt. Every
 * filesystem error degrades to "no evidence", never to a thrown snapshot.
 */

const CLAUDE_INTERRUPT_PROBE_REVISION = 'claude-interrupt-probe-v1'
const INTERRUPT_MARKER = '[Request interrupted by user]'
const TAIL_BYTES = 16 * 1024
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function createClaudeInterruptProbe(dependencies = {}) {
  const fs = dependencies.fs
  const path = dependencies.path
  const projectsRoot = dependencies.projectsRoot
  if (!fs || !path || typeof projectsRoot !== 'string' || !projectsRoot) {
    throw new TypeError('claude interrupt probe requires fs, path and projectsRoot')
  }

  /** sessionId -> transcript path ('' = known missing; retried when asked again after a miss). */
  const transcriptPaths = new Map()
  /** sessionId -> { mtimeMs, turnStartedAt, at } */
  const verdicts = new Map()

  function transcriptPath(sessionId) {
    const cached = transcriptPaths.get(sessionId)
    if (cached) return cached
    let resolved = ''
    try {
      for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const candidate = path.join(projectsRoot, entry.name, `${sessionId}.jsonl`)
        try {
          if (fs.statSync(candidate).isFile()) {
            resolved = candidate
            break
          }
        } catch {}
      }
    } catch { resolved = '' }
    if (resolved) transcriptPaths.set(sessionId, resolved)
    return resolved
  }

  /**
   * Millisecond timestamp of the interrupt that closed the CURRENT open turn,
   * or 0 when the tail shows the turn still running (or no evidence at all).
   */
  function claudeInterruptedAt(sessionId, turnStartedAt) {
    if (!SESSION_ID_PATTERN.test(String(sessionId || ''))) return 0
    const startedAt = Number(turnStartedAt) || 0
    if (!startedAt) return 0
    const file = transcriptPath(sessionId)
    if (!file) return 0
    let stat
    try { stat = fs.statSync(file) } catch {
      transcriptPaths.delete(sessionId)
      return 0
    }
    const cached = verdicts.get(sessionId)
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.turnStartedAt === startedAt) return cached.at
    let tail = ''
    try {
      const fd = fs.openSync(file, 'r')
      try {
        const start = Math.max(0, stat.size - TAIL_BYTES)
        const buffer = Buffer.alloc(stat.size - start)
        fs.readSync(fd, buffer, 0, buffer.length, start)
        tail = buffer.toString('utf8')
      } finally {
        fs.closeSync(fd)
      }
    } catch { return 0 }
    let at = 0
    const lines = tail.split('\n')
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]
      if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue
      let record
      try { record = JSON.parse(line) } catch { continue }
      if (record.type !== 'user' && record.type !== 'assistant') continue
      if (record.type === 'user' && JSON.stringify(record.message?.content ?? '').includes(INTERRUPT_MARKER)) {
        const timestamp = Date.parse(record.timestamp || '') || 0
        if (timestamp >= startedAt) at = timestamp
      }
      // Only the last user/assistant record decides: anything newer than an
      // interrupt (a tool result, a fresh prompt, an assistant reply) means
      // the story moved on and the hook lane owns the phase again.
      break
    }
    verdicts.set(sessionId, { mtimeMs: stat.mtimeMs, turnStartedAt: startedAt, at })
    if (verdicts.size > 200) {
      for (const key of verdicts.keys()) {
        if (verdicts.size <= 200) break
        if (key !== sessionId) verdicts.delete(key)
      }
    }
    return at
  }

  return {
    revision: CLAUDE_INTERRUPT_PROBE_REVISION,
    claudeInterruptedAt
  }
}

module.exports = {
  CLAUDE_INTERRUPT_PROBE_REVISION,
  createClaudeInterruptProbe
}
