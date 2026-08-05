'use strict'

/**
 * Claude Code transcript reader.
 *
 * Sessions live at `~/.claude/projects/<slug>/<sessionId>.jsonl`, one JSON
 * object per line. This module extracts only structural evidence — timing,
 * turn shape, model, sidechain topology — and never retains prompt text,
 * assistant text, tool arguments or file paths from message content.
 *
 * Reads are bounded: only the tail of a transcript is parsed, because the
 * fields the companion needs all come from the newest entries.
 */

const DEFAULT_TAIL_BYTES = 256 * 1024

function toFiniteNumber(value) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function parseTimestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string' || !value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Splits a raw tail buffer into complete JSON lines. A tail read almost always
 * starts mid-line, so the first fragment is dropped unless the caller says the
 * buffer starts at byte zero.
 */
function completeLines(text, fromStart) {
  const lines = String(text || '').split('\n')
  if (!fromStart && lines.length) lines.shift()
  const last = lines[lines.length - 1]
  if (last !== undefined && last !== '' && !last.endsWith('}')) lines.pop()
  return lines.filter((line) => line.trim() !== '')
}

function countPendingToolUse(entries) {
  let pending = 0
  for (const entry of entries) {
    if (entry.type === 'assistant') {
      const content = entry.message && Array.isArray(entry.message.content) ? entry.message.content : []
      for (const block of content) if (block && block.type === 'tool_use') pending += 1
      continue
    }
    if (entry.type === 'user') {
      const content = entry.message && Array.isArray(entry.message.content) ? entry.message.content : []
      for (const block of content) if (block && block.type === 'tool_result') pending = Math.max(0, pending - 1)
    }
  }
  return pending
}

function contextTokensFrom(usage) {
  if (!usage || typeof usage !== 'object') return 0
  return toFiniteNumber(usage.input_tokens)
    + toFiniteNumber(usage.cache_read_input_tokens)
    + toFiniteNumber(usage.cache_creation_input_tokens)
}

/**
 * Reduces already-parsed transcript entries into a privacy-safe summary.
 * Exported separately from the file reader so it can be exercised without
 * touching a filesystem.
 */
function summarizeTranscriptEntries(entries, options) {
  const source = Array.isArray(entries) ? entries : []
  const settings = options || {}
  const summary = {
    sessionId: typeof settings.sessionId === 'string' ? settings.sessionId : '',
    cwd: '',
    gitBranch: '',
    model: '',
    isSidechain: false,
    parentSessionId: '',
    turns: 0,
    toolCalls: 0,
    pendingToolUse: 0,
    contextTokens: 0,
    startedAt: 0,
    lastPromptAt: 0,
    lastAssistantAt: 0,
    lastEventAt: 0,
    cliVersion: ''
  }
  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue
    const at = parseTimestamp(entry.timestamp)
    if (at) {
      if (!summary.startedAt || at < summary.startedAt) summary.startedAt = at
      if (at > summary.lastEventAt) summary.lastEventAt = at
    }
    if (typeof entry.sessionId === 'string' && entry.sessionId && !summary.sessionId) summary.sessionId = entry.sessionId
    if (typeof entry.cwd === 'string' && entry.cwd) summary.cwd = entry.cwd
    if (typeof entry.gitBranch === 'string' && entry.gitBranch) summary.gitBranch = entry.gitBranch
    if (typeof entry.version === 'string' && entry.version) summary.cliVersion = entry.version
    if (entry.isSidechain === true) summary.isSidechain = true
    if (typeof entry.parentSessionId === 'string' && entry.parentSessionId) summary.parentSessionId = entry.parentSessionId
    if (entry.type === 'user' && entry.isMeta !== true) {
      const content = entry.message && Array.isArray(entry.message.content) ? entry.message.content : null
      const isToolResult = Boolean(content && content.some((block) => block && block.type === 'tool_result'))
      if (!isToolResult) {
        summary.turns += 1
        if (at > summary.lastPromptAt) summary.lastPromptAt = at
      }
    }
    if (entry.type === 'assistant') {
      if (at > summary.lastAssistantAt) summary.lastAssistantAt = at
      const message = entry.message && typeof entry.message === 'object' ? entry.message : {}
      if (typeof message.model === 'string' && message.model) summary.model = message.model
      const usageTokens = contextTokensFrom(message.usage)
      if (usageTokens > 0) summary.contextTokens = usageTokens
      const content = Array.isArray(message.content) ? message.content : []
      for (const block of content) if (block && block.type === 'tool_use') summary.toolCalls += 1
    }
  }
  summary.pendingToolUse = countPendingToolUse(source)
  return summary
}

/** Parses a raw tail buffer straight into a summary. */
function summarizeTranscriptText(text, options) {
  const settings = options || {}
  const entries = []
  for (const line of completeLines(text, settings.fromStart === true)) {
    try { entries.push(JSON.parse(line)) } catch { /* partial or corrupt line */ }
  }
  return summarizeTranscriptEntries(entries, settings)
}

function createTranscriptReader(dependencies) {
  const fs = dependencies.fs
  const tailBytes = Number.isFinite(dependencies.tailBytes) ? dependencies.tailBytes : DEFAULT_TAIL_BYTES

  /** Reads at most `tailBytes` from the end of a transcript. */
  function readTail(filePath) {
    let handle = null
    try {
      const stat = fs.statSync(filePath)
      const size = Number(stat.size) || 0
      const length = Math.min(size, tailBytes)
      const position = Math.max(0, size - length)
      if (!length) return { text: '', fromStart: true, mtimeMs: Number(stat.mtimeMs) || 0, size }
      handle = fs.openSync(filePath, 'r')
      const buffer = Buffer.alloc(length)
      fs.readSync(handle, buffer, 0, length, position)
      return { text: buffer.toString('utf8'), fromStart: position === 0, mtimeMs: Number(stat.mtimeMs) || 0, size }
    } catch {
      return null
    } finally {
      if (handle !== null) { try { fs.closeSync(handle) } catch { /* already closed */ } }
    }
  }

  function summarize(filePath, sessionId) {
    const tail = readTail(filePath)
    if (!tail) return null
    const summary = summarizeTranscriptText(tail.text, { fromStart: tail.fromStart, sessionId })
    summary.mtimeMs = tail.mtimeMs
    summary.bytes = tail.size
    if (!summary.lastEventAt) summary.lastEventAt = tail.mtimeMs
    return summary
  }

  return { readTail, summarize }
}

module.exports = {
  DEFAULT_TAIL_BYTES,
  completeLines,
  summarizeTranscriptEntries,
  summarizeTranscriptText,
  createTranscriptReader
}
