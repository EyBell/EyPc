'use strict'

/**
 * Discovers Codex subagent threads from recent session rollout files.
 *
 * `thread/list` omits subagent runs entirely (verified against app-server
 * 0.150.1: a live subagent writing its rollout is absent from every page), so
 * a subagent working for a listed thread is invisible to the inventory scan —
 * the parent then presents its own last terminal state while Codex natively
 * shows the group running. The rollout files are the one discovery surface
 * that always exists locally: candidates come from walking only the newest
 * session day directories and taking each file's thread id from its basename.
 * The basename alone asserts nothing — a candidate becomes a row only through
 * the injected `thread/read` whose `parentThreadId` names a thread already in
 * the scan's inventory, and the verified row then flows through the ordinary
 * pipeline (topology, side relations, targeted latest-Turn reads) so no
 * consumer gains a second phase judgment.
 *
 * `fs`/`path` are injected on the native-state-paths precedent; `readThread`
 * and `record` keep RPC transport and diagnostics with the entry. The only
 * state is the per-factory verification cache, keyed by rollout mtime so
 * steady scans do not repeat targeted reads; every filesystem or RPC error
 * degrades to "not discovered this scan", never to a thrown scan.
 */

const CODEX_SUBAGENT_DISCOVERY_REVISION = 'codex-subagent-discovery-v1'
/** Bounded like side-relation hints: older activity is not worth a targeted read. */
const CODEX_SUBAGENT_DISCOVERY_MAX_AGE_MS = 48 * 60 * 60 * 1000
/** Caps per-scan `thread/read` verification work for unknown candidates. */
const CODEX_SUBAGENT_DISCOVERY_LIMIT = 24
/** Keeps the verification cache from outliving its candidate window. */
const CODEX_SUBAGENT_DISCOVERY_CACHE_LIMIT = 200
/** `rollout-<date>T<time>-<threadId>[_<segment>].jsonl`; the first uuid is the thread id. */
const ROLLOUT_BASENAME_PATTERN = /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_[0-9a-f][0-9a-f-]*)?\.jsonl$/i

function record(value) {
  return value && typeof value === 'object' ? value : {}
}

/**
 * Whether a thread's `threadSource` marks a machine sub-run (subagent or
 * guardian review). Such runs have no user-facing unread concept — the user
 * never opens them, so the desktop unread set keeps them "unread" forever and
 * an aggregation that counted that would pin every parent completed-unread.
 * RPC shapes observed on 0.150.1: the string `subagent`, the legacy rollout
 * string `guardian_review`, and the object form `{ subAgent: {...} }`.
 */
function isSubAgentThreadSource(value) {
  if (typeof value === 'string') return /^(subagent|guardian_review)$/i.test(value)
  return Boolean(value && typeof value === 'object' && value.subAgent !== undefined)
}

function createCodexSubagentDiscovery(dependencies = {}) {
  const fs = dependencies.fs
  const path = dependencies.path
  const validThreadId = dependencies.validThreadId
  const readThread = typeof dependencies.readThread === 'function' ? dependencies.readThread : null
  const recordDiagnostic = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  if (!fs || !path || typeof validThreadId !== 'function') {
    throw new TypeError('codex subagent discovery requires fs, path and validThreadId')
  }

  /** threadId -> { mtimeMs, row|null }; `row: null` records a verified non-link. */
  let verifiedRows = new Map()

  function numericNameDescending(entries) {
    return entries
      .filter((name) => /^\d+$/.test(name))
      .sort((left, right) => Number(right) - Number(left))
  }

  function listDirectory(target) {
    try { return fs.readdirSync(target) } catch { return [] }
  }

  /** Newest day directories under `<root>/<yyyy>/<mm>/<dd>`, newest first. */
  function recentDayDirectories(root, maxDays) {
    const days = []
    for (const year of numericNameDescending(listDirectory(root))) {
      for (const month of numericNameDescending(listDirectory(path.join(root, year)))) {
        for (const day of numericNameDescending(listDirectory(path.join(root, year, month)))) {
          days.push(path.join(root, year, month, day))
          if (days.length >= maxDays) return days
        }
      }
    }
    return days
  }

  function codexRecentRolloutThreadCandidates(input = {}) {
    const root = typeof input.root === 'string' ? input.root : ''
    const knownIds = input.knownIds instanceof Set ? input.knownIds : new Set()
    const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now()
    const maxAgeMs = Number.isFinite(input.maxAgeMs) && input.maxAgeMs > 0
      ? input.maxAgeMs
      : CODEX_SUBAGENT_DISCOVERY_MAX_AGE_MS
    const limit = Number.isInteger(input.limit) && input.limit > 0
      ? input.limit
      : CODEX_SUBAGENT_DISCOVERY_LIMIT
    if (!root) return []
    // The age window can span at most one more local calendar day than it has whole days.
    const dayCount = Math.min(31, Math.ceil(maxAgeMs / (24 * 60 * 60 * 1000)) + 1)
    const newestByThreadId = new Map()
    for (const dayDirectory of recentDayDirectories(root, dayCount)) {
      for (const name of listDirectory(dayDirectory)) {
        const match = ROLLOUT_BASENAME_PATTERN.exec(name)
        const threadId = match ? match[1].toLowerCase() : ''
        if (!threadId || !validThreadId(threadId) || knownIds.has(threadId)) continue
        let mtimeMs = 0
        try { mtimeMs = fs.statSync(path.join(dayDirectory, name)).mtimeMs } catch { continue }
        if (!(mtimeMs > 0) || nowMs - mtimeMs > maxAgeMs) continue
        const previous = newestByThreadId.get(threadId)
        if (!previous || mtimeMs > previous.mtimeMs) newestByThreadId.set(threadId, { threadId, mtimeMs })
      }
    }
    return [...newestByThreadId.values()]
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, limit)
  }

  /**
   * Verified subagent rows for one scan: candidates from the rollout walk,
   * membership from the injected `thread/read`'s `parentThreadId`, freshness
   * from the mtime-keyed cache. Returns rows shaped exactly like the
   * `thread/list` rows the caller already holds.
   */
  async function codexDiscoverSubagentThreadRows(input = {}) {
    if (!readThread) return []
    const rows = Array.isArray(input.rows) ? input.rows : []
    const knownIds = new Set(rows.map((row) => record(row).id).filter((id) => validThreadId(id)))
    const candidates = codexRecentRolloutThreadCandidates({
      root: input.root,
      knownIds,
      nowMs: input.nowMs
    })
    const discovered = []
    const seenThisScan = new Set()
    let readCount = 0
    for (const candidate of candidates) {
      seenThisScan.add(candidate.threadId)
      const cached = verifiedRows.get(candidate.threadId)
      if (cached && cached.mtimeMs === candidate.mtimeMs) {
        if (cached.row && knownIds.has(record(cached.row).parentThreadId)) discovered.push(cached.row)
        continue
      }
      try {
        readCount += 1
        const thread = record(record(await readThread(candidate.threadId)).thread)
        const parentThreadId = typeof thread.parentThreadId === 'string' ? thread.parentThreadId : ''
        const linkable = thread.id === candidate.threadId
          && validThreadId(parentThreadId)
          && knownIds.has(parentThreadId)
        verifiedRows.set(candidate.threadId, { mtimeMs: candidate.mtimeMs, row: linkable ? thread : null })
        if (linkable) discovered.push(thread)
      } catch {}
    }
    if (verifiedRows.size > CODEX_SUBAGENT_DISCOVERY_CACHE_LIMIT) {
      for (const threadId of [...verifiedRows.keys()]) {
        if (!seenThisScan.has(threadId)) verifiedRows.delete(threadId)
      }
    }
    if (readCount || discovered.length) {
      recordDiagnostic({
        level: 'debug',
        scope: 'task-recovery',
        event: 'subagent-discovery',
        outcome: discovered.length ? 'discovered' : 'none-linkable',
        cache: 'provider-direct',
        count: discovered.length,
        details: { candidateCount: candidates.length, readCount }
      })
    }
    return discovered
  }

  function codexResetSubagentDiscovery() {
    verifiedRows = new Map()
  }

  /**
   * Whether this factory discovered `threadId` as a linked machine sub-run.
   * Consumers use it to keep user-facing unread semantics off such runs; a
   * thread never verified here (or verified as not linkable) answers false.
   */
  function codexIsMachineRunThread(threadId) {
    const cached = verifiedRows.get(typeof threadId === 'string' ? threadId.toLowerCase() : '')
    return Boolean(cached?.row) && isSubAgentThreadSource(record(cached.row).threadSource)
  }

  return {
    revision: CODEX_SUBAGENT_DISCOVERY_REVISION,
    codexRecentRolloutThreadCandidates,
    codexDiscoverSubagentThreadRows,
    codexResetSubagentDiscovery,
    codexIsMachineRunThread,
    isSubAgentThreadSource
  }
}

module.exports = {
  CODEX_SUBAGENT_DISCOVERY_REVISION,
  CODEX_SUBAGENT_DISCOVERY_MAX_AGE_MS,
  CODEX_SUBAGENT_DISCOVERY_LIMIT,
  isSubAgentThreadSource,
  createCodexSubagentDiscovery
}
