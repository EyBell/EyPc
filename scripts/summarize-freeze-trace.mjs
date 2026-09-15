import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'

// Read one explicitly selected recorder file; never crawl native app data.
export function summarize(text) {
  const pending = new Map(), operations = new Map(), stalledOperations = new Map()
  let stalls = 0, dropped = 0, identity = 'unmeasured', malformed = 0
  for (const line of text.split('\n').filter(Boolean)) {
    let row
    try { row = JSON.parse(line) } catch { malformed++; continue }
    if (row.revision !== 'eypc-freeze-trace-v1') continue
    if (row.type === 'start' && /^[a-z0-9-]{1,80}$/.test(row.identity)) identity = row.identity
    dropped = Math.max(dropped, Number(row.dropped) || 0)
    if (row.type === 'main-stall') {
      stalls++
      for (const span of Array.isArray(row.pending) ? row.pending : []) {
        if (/^[a-z][a-z0-9.-]{0,79}$/.test(span?.op || '')) stalledOperations.set(span.op, (stalledOperations.get(span.op) || 0) + 1)
      }
    }
    if (!/^[a-z][a-z0-9.-]{0,79}$/.test(row.op || '')) continue
    if (row.type === 'begin') pending.set(row.id, row.op)
    if (row.type === 'end') {
      pending.delete(row.id)
      const metric = operations.get(row.op) || { count: 0, maxMs: 0, totalMs: 0 }
      metric.count++
      metric.maxMs = Math.max(metric.maxMs, Number(row.durationMs) || 0)
      metric.totalMs += Number(row.durationMs) || 0
      operations.set(row.op, metric)
    }
  }
  return { identity, stalls, dropped, malformed, stalledOperations: Object.fromEntries(stalledOperations), incomplete: [...pending.values()], operations: Object.fromEntries(operations),
    interpretation: 'Missing end or heartbeat is a candidate boundary, not proof of causation. Drops or truncated files weaken attribution.' }
}
if (process.argv[1]?.endsWith('summarize-freeze-trace.mjs')) {
  const file = process.argv[2]
  if (!file || !/^freeze-\d+-\d+\.jsonl$/.test(basename(file))) throw new Error('Select one freeze-<timestamp>-<pid>.jsonl file')
  if (statSync(file).size > 4 * 1024 * 1024) throw new Error('File exceeds recorder budget')
  console.log(JSON.stringify(summarize(readFileSync(file, 'utf8')), null, 2))
}
