import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

function finish(result, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = exitCode
}

function option(name) {
  const prefix = `--${name}=`
  const direct = process.argv.slice(2).find((value) => value.startsWith(prefix))
  return direct ? direct.slice(prefix.length) : ''
}

function explicitDirectory() {
  const direct = option('dir')
  return direct ? resolve(direct) : String(process.env.EYPC_DIAGNOSTICS_DIR || '').trim()
}

function resolveDirectory() {
  const explicit = explicitDirectory()
  if (explicit) return explicit
  return [
    join(homedir(), 'Library', 'Application Support', 'uTools', 'eypc-diagnostics'),
    join(homedir(), 'Library', 'Application Support', 'utools', 'eypc-diagnostics'),
    join(homedir(), '.eypc', 'eypc-diagnostics')
  ].find((candidate) => existsSync(candidate)) || ''
}

function readEvents(directory) {
  const files = readdirSync(directory)
    .filter((name) => /^runtime-[0-9]+-[0-9]+\.jsonl$/.test(name))
    .map((name) => {
      const stats = statSync(join(directory, name))
      return { name, size: stats.size, mtimeMs: stats.mtimeMs }
    })
    .sort((left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name))
  const events = []
  let malformedLines = 0
  for (const file of files) {
    for (const line of readFileSync(join(directory, file.name), 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        if (![1, 2, 3].includes(event?.v) || typeof event.scope !== 'string' || typeof event.event !== 'string') malformedLines += 1
        else events.push(event)
      } catch { malformedLines += 1 }
    }
  }
  return { files, events, malformedLines }
}

function filteredEvents(events) {
  const scope = option('scope')
  const eventName = option('event')
  const level = option('level')
  const session = option('session')
  const operation = option('operation')
  const trace = option('trace')
  const provider = option('provider')
  const taskRef = option('taskRef')
  const sinceRaw = option('since')
  const since = sinceRaw ? (Number.isFinite(Number(sinceRaw)) ? Number(sinceRaw) : Date.parse(sinceRaw)) : 0
  return events.filter((event) => {
    if (scope && event.scope !== scope) return false
    if (eventName && event.event !== eventName) return false
    if (level && event.level !== level) return false
    if (session && event.sessionId !== session) return false
    if (operation && event.operationId !== operation) return false
    if (trace && event.traceId !== trace) return false
    if (provider && event.provider !== provider) return false
    if (taskRef && event.taskRef !== taskRef) return false
    if (since && Number(event.at) < since) return false
    return true
  })
}

function countBy(events, selector) {
  const counts = new Map()
  for (const event of events) {
    const key = selector(event)
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function diagnosticAggregates(events) {
  const stateChanges = events.filter((event) => event.event === 'state-transition'
    || event.event === 'task-state-transition'
    || event.beforePhase !== event.afterPhase
    || event.beforeUnread !== event.afterUnread)
  const noOps = events.filter((event) => event.outcome === 'no-op'
    || event.outcome === 'ignored' && String(event.event || '').includes('no-op')
    || String(event.event || '').includes('same-state-no-op'))
  const shortcuts = events.filter((event) => [
    'global-shortcut',
    'local-shortcut',
    'attention-shortcut',
    'archive-shortcut'
  ].includes(event.source) || String(event.event || '').includes('shortcut'))
  const navigation = events.filter((event) => [
    'card-click',
    'manual-row-open',
    'manual-quick-jump',
    'global-shortcut',
    'local-shortcut',
    'attention-shortcut'
  ].includes(event.source) || event.scope === 'companion-navigation')
  const archive = events.filter((event) => String(event.event || '').startsWith('archive-'))
  const errors = events.filter((event) => event.level === 'error')
  const summarize = (rows) => ({ count: rows.length, byEvent: countBy(rows, (event) => event.event) })
  return {
    stateChanges: summarize(stateChanges),
    noOps: summarize(noOps),
    shortcuts: {
      ...summarize(shortcuts),
      bySource: countBy(shortcuts, (event) => event.source)
    },
    navigation: {
      ...summarize(navigation),
      bySource: countBy(navigation, (event) => event.source)
    },
    archiveStages: summarize(archive),
    errors: {
      ...summarize(errors),
      byCode: countBy(errors, (event) => event.errorCode || event.code || 'unknown')
    }
  }
}

const directory = resolveDirectory()
if (!directory || !existsSync(directory)) {
  finish({ status: 'unavailable', reason: 'diagnostics-directory-missing', hint: 'run-with---dir-or-EYPC_DIAGNOSTICS_DIR' }, 2)
} else {
  try {
    const { files, events, malformedLines } = readEvents(directory)
    const matching = filteredEvents(events)
    const requestedTail = Math.trunc(Number(option('tail') || 100))
    const tail = Math.max(0, Math.min(500, Number.isFinite(requestedTail) ? requestedTail : 100))
    const byScope = Object.fromEntries([...new Set(events.map((event) => event.scope))]
      .sort()
      .map((scope) => [scope, events.filter((event) => event.scope === scope).length]))
    const byLevel = Object.fromEntries(['debug', 'info', 'warn', 'error']
      .map((level) => [level, events.filter((event) => event.level === level).length])
      .filter(([, count]) => count > 0))
    const newestAt = events.reduce((latest, event) => Math.max(latest, Number(event.at) || 0), 0)
    const aggregates = diagnosticAggregates(events)
    finish({
      status: malformedLines ? 'degraded' : 'ok',
      revision: [...new Set(events.map((event) => `v${event.v}`))].sort(),
      directory,
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      eventCount: events.length,
      matchingEventCount: matching.length,
      malformedLines,
      slowCount: events.filter((event) => Number(event.durationMs) >= 250).length,
      errorCount: events.filter((event) => event.level === 'error').length,
      newestAt,
      sessions: [...new Set(events.map((event) => event.sessionId).filter(Boolean))],
      byLevel,
      byScope,
      archiveStages: Object.fromEntries([...new Set(events.filter((event) => String(event.event || '').startsWith('archive-')).map((event) => event.event))]
        .sort()
        .map((eventName) => [eventName, events.filter((event) => event.event === eventName).length])),
      aggregates,
      operations: [...new Set(events.map((event) => event.operationId).filter(Boolean))],
      appliedFilters: {
        scope: option('scope') || null,
        event: option('event') || null,
        level: option('level') || null,
        session: option('session') || null,
        operation: option('operation') || null,
        trace: option('trace') || null,
        provider: option('provider') || null,
        taskRef: option('taskRef') || null,
        since: option('since') || null,
        tail
      },
      recentEvents: tail ? matching.slice(-tail) : []
    }, malformedLines ? 1 : 0)
  } catch {
    finish({ status: 'unavailable', reason: 'diagnostics-read-failed', directory }, 2)
  }
}
