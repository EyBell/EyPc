import http from 'node:http'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import bridge from '../preload/companion/task-state-bridge.cjs'

const { SCHEMA, HOST, SNAPSHOT_PATH, WATCH_PATH, readTaskStateEndpoint } = bridge
const MAX_FRAME_LENGTH = 16 * 1024 * 1024
const HOST_TIMEOUT_MS = 5_000
const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_REPLAY_BYTES = 64 * 1024 * 1024
const MAX_TRANSITIONS = 256
const MAX_REPLAY_EVENTS = 5_000
const REF = /^h:[a-f0-9]{16}$/
const HOST_GENERATION = /^[a-f0-9]{32}$/
const TRANSITION_ID = /^[A-Za-z0-9:_-]{1,64}$/
const MEMBER = /^(?:main|side|side:[0-7])$/
const PHASES = new Set(['running', 'waiting-input', 'waiting-approval', 'completed', 'stopped', 'unknown'])
const TURNS = new Set(['not-started', 'turn-running', 'turn-completed', 'turn-interrupted', 'turn-failed', 'unknown'])
const GROUPS = new Set(['pinned', 'input', 'active', 'unknown', 'stopped', 'unread', 'completed'])
const PINS = new Set(['none', 'local', 'native'])
const BADGES = ['active', 'input', 'unread']
const NON_VISIBLE = new Set(['hidden', 'folded', 'background', 'not-displayed', 'not-in-viewport', 'rows-unavailable', 'empty', 'expanded', 'unconfirmed'])
const PENDING_REASONS = new Set(['endpoint-unavailable', 'host-timeout', 'host-disconnected', 'host-unavailable', 'endpoint-mismatch', 'invalid-response', 'watch-behind', 'host-changed', 'window-changed'])
const args = process.argv.slice(2)
const watch = args.includes('--watch')
const summary = args.includes('--summary')
const checkTransitions = args.includes('--check-transitions')
const directory = args.find((arg) => arg.startsWith('--dir='))?.slice('--dir='.length)
const expectFile = args.find((arg) => arg.startsWith('--expect='))?.slice('--expect='.length)
const replayFile = args.find((arg) => arg.startsWith('--replay='))?.slice('--replay='.length)
const knownArg = (arg) => arg === '--watch' || arg === '--summary' || arg === '--check-transitions'
  || /^--dir=.+$/.test(arg) || /^--expect=.+$/.test(arg) || /^--replay=.+$/.test(arg)

function summarize(event) {
  if (event.type !== 'snapshot') return event
  const { tasks, views, ...snapshot } = event.package
  const providers = Object.fromEntries(Object.keys(snapshot.providers).map((provider) => [provider, {
    roots: 0, nativePins: 0, localPins: 0, verifyingPins: 0
  }]))
  const { active, input, unread, native, local, group } = views.counts
  const pinEvidenceAvailable = [native, local, group].every(Number.isSafeInteger)
  for (const task of tasks) {
    const counts = providers[task.provider]
    if (!counts) continue
    counts.roots += 1
    if (task.providerPin === true) counts.nativePins += 1
    if (task.localPin === true) counts.localPins += 1
    if (task.providerPinFreshness === 'verifying') counts.verifyingPins += 1
  }
  return {
    ...event,
    package: {
      ...snapshot,
      rootCount: tasks.length,
      badgeCounts: { active, input, unread },
      groupCounts: Object.fromEntries(Object.entries(views.groups).map(([group, keys]) => [group, keys.length])),
      cycleCount: views.cycleKeys.length,
      pinCounts: pinEvidenceAvailable ? { native, local, group } : null,
      pinEvidenceByProvider: pinEvidenceAvailable ? providers : null
    },
    ...(Array.isArray(event.consumerReceipts) ? {
      consumerReceipts: event.consumerReceipts.filter((receipt) => receipt.packageRevision === snapshot.packageRevision)
    } : {})
  }
}

async function write(value) {
  if (!process.stdout.write(`${JSON.stringify(value)}\n`)) await once(process.stdout, 'drain')
}

function connect(endpoint, streaming) {
  return new Promise((resolveResponse, reject) => {
    const request = http.get({
      hostname: HOST,
      port: endpoint.port,
      path: streaming ? WATCH_PATH : SNAPSHOT_PATH,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      agent: false,
      timeout: HOST_TIMEOUT_MS
    }, resolveResponse)
    request.on('error', reject)
    request.on('timeout', () => request.destroy(new Error('host-timeout')))
  })
}

async function observe(endpoint, readEndpoint, accept, streaming) {
  const response = await connect(endpoint, streaming)
  let sequence = -1
  let buffer = ''
  let idleTimer
  let probing = false
  let stopReason = ''

  function scheduleIdleProbe() {
    if (!streaming || probing) return
    clearTimeout(idleTimer)
    idleTimer = setTimeout(probeIdleStream, HOST_TIMEOUT_MS)
  }

  async function probeIdleStream() {
    if (sequence < 0) {
      stopReason = 'host-timeout'
      response.destroy()
      return
    }
    probing = true
    let snapshotSequence = -1
    let reason
    try {
      reason = await observe(endpoint, readEndpoint, (event) => { snapshotSequence = event.sequence }, false)
    } catch (error) {
      reason = error.message === 'host-timeout' ? 'host-timeout' : 'host-disconnected'
    }
    probing = false
    if (response.destroyed) return
    if (reason || snapshotSequence > sequence) {
      stopReason = reason || 'watch-behind'
      response.destroy()
      return
    }
    scheduleIdleProbe()
  }

  try {
    if (response.statusCode !== 200) return response.statusCode === 403 ? 'endpoint-mismatch' : 'host-unavailable'
    if (streaming) {
      response.setTimeout(0)
      scheduleIdleProbe()
    } else {
      response.setTimeout(HOST_TIMEOUT_MS, () => response.destroy(new Error('host-timeout')))
    }
    response.setEncoding('utf8')
    for await (const chunk of response) {
      scheduleIdleProbe()
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        if (newline > MAX_FRAME_LENGTH) return 'invalid-response'
        const event = JSON.parse(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
        if (event.schema !== SCHEMA || event.hostGeneration !== endpoint.hostGeneration) return 'endpoint-mismatch'
        if (readEndpoint()?.hostGeneration !== endpoint.hostGeneration) return 'host-changed'
        if (event.type === 'heartbeat') continue
        if (!Number.isSafeInteger(event.sequence) || event.sequence <= sequence
          || (sequence < 0 ? event.type !== 'snapshot' : !['snapshot', 'receipt'].includes(event.type))) return 'invalid-response'
        sequence = event.sequence
        await accept(event)
        if (!streaming) return ''
      }
      if (buffer.length > MAX_FRAME_LENGTH) return 'invalid-response'
    }
    return stopReason || 'host-disconnected'
  } catch (error) {
    if (stopReason) return stopReason
    if (error.message === 'host-timeout') return error.message
    return error instanceof SyntaxError ? 'invalid-response' : 'host-disconnected'
  } finally {
    clearTimeout(idleTimer)
    response.destroy()
  }
}

function usageError(message) {
  process.stderr.write(`${message}\n`)
  process.exitCode = 2
}

function boundedJson(file, maxBytes) {
  const bytes = readFileSync(resolve(file))
  if (bytes.length > maxBytes) throw new Error('too-large')
  return JSON.parse(bytes.toString('utf8'))
}

function assertKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape')
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error('key')
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function readManifest(file) {
  const manifest = boundedJson(file, MAX_MANIFEST_BYTES)
  assertKeys(manifest, new Set(['schema', 'hostGeneration', 'deadlineMs', 'transitions', 'presentation']))
  if (manifest.schema !== 'eypc-task-transition-manifest-v1' || !HOST_GENERATION.test(manifest.hostGeneration)
    || !safeCount(manifest.deadlineMs)) throw new Error('manifest')
  if (!Array.isArray(manifest.transitions) || manifest.transitions.length > MAX_TRANSITIONS) throw new Error('manifest')
  const seen = new Set()
  for (const transition of manifest.transitions) {
    assertKeys(transition, new Set(['id', 'taskRef', 'member', 'memberRef', 'memberPhase', 'turnRef', 'phase', 'turn',
      'turnStartedAt', 'terminalAt', 'semanticRevision', 'expectAt', 'hostReceivedAt', 'admittedAt', 'deadlineMs',
      'unread', 'memberUnread', 'planReady', 'continueTask']))
    if (!TRANSITION_ID.test(transition.id) || seen.has(transition.id) || !REF.test(transition.taskRef)
      || !PHASES.has(transition.phase) || !safeCount(transition.expectAt)) throw new Error('manifest')
    if (transition.member !== undefined && !MEMBER.test(transition.member)) throw new Error('manifest')
    for (const field of ['memberRef', 'turnRef']) {
      if (transition[field] !== undefined && !REF.test(transition[field])) throw new Error('manifest')
    }
    if (transition.member === 'side' && !transition.memberRef && !transition.turnRef && !(transition.turnStartedAt > 0)) {
      throw new Error('manifest')
    }
    if (transition.memberPhase !== undefined && !PHASES.has(transition.memberPhase)) throw new Error('manifest')
    if (transition.turn !== undefined && !TURNS.has(transition.turn)) throw new Error('manifest')
    for (const key of ['turnStartedAt', 'terminalAt', 'semanticRevision', 'hostReceivedAt', 'admittedAt', 'deadlineMs']) {
      if (transition[key] !== undefined && !safeCount(transition[key])) throw new Error('manifest')
    }
    for (const key of ['unread', 'memberUnread', 'planReady', 'continueTask']) {
      if (transition[key] !== undefined && typeof transition[key] !== 'boolean') throw new Error('manifest')
    }
    seen.add(transition.id)
  }
  if (manifest.presentation !== undefined) readPresentation(manifest.presentation)
  if (!manifest.transitions.length && !manifest.presentation) throw new Error('manifest')
  return manifest
}

function readPresentation(presentation) {
  assertKeys(presentation, new Set(['packageRevision', 'main', 'float']))
  if (!safeCount(presentation.packageRevision) || presentation.packageRevision < 1) throw new Error('manifest')
  if (!presentation.main && !presentation.float) throw new Error('manifest')
  if (presentation.main) {
    assertKeys(presentation.main, new Set(['windowGeneration', 'counts']))
    if (!safeCount(presentation.main.windowGeneration) || presentation.main.windowGeneration < 1) throw new Error('manifest')
    assertKeys(presentation.main.counts, new Set(BADGES))
    if (BADGES.some((key) => !safeCount(presentation.main.counts[key]))) throw new Error('manifest')
  }
  if (presentation.float) {
    assertKeys(presentation.float, new Set(['windowGeneration', 'rows']))
    if (!safeCount(presentation.float.windowGeneration) || presentation.float.windowGeneration < 1
      || !Array.isArray(presentation.float.rows) || !presentation.float.rows.length || presentation.float.rows.length > 128) throw new Error('manifest')
    for (const row of presentation.float.rows) {
      assertKeys(row, new Set(['taskRef', 'group', 'phase', 'pinSource', 'pinned']))
      if (!REF.test(row.taskRef) || !GROUPS.has(row.group) || !PHASES.has(row.phase) || !PINS.has(row.pinSource)) throw new Error('manifest')
      if (row.pinned !== undefined && typeof row.pinned !== 'boolean') throw new Error('manifest')
    }
  }
}

function readReplay(file) {
  const text = boundedJsonText(file)
  const events = []
  let unavailable = null
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    if (events.length >= MAX_REPLAY_EVENTS) throw new Error('replay')
    const event = JSON.parse(line)
    if (!event || typeof event !== 'object' || event.schema !== SCHEMA || !HOST_GENERATION.test(event.hostGeneration)
      || !safeCount(event.sequence) || !['snapshot', 'receipt', 'heartbeat', 'unavailable'].includes(event.type)) throw new Error('replay')
    if (event.type === 'heartbeat') continue
    if (event.type === 'unavailable') {
      unavailable = PENDING_REASONS.has(event.reason) ? event.reason : 'host-unavailable'
      continue
    }
    events.push(event)
  }
  return { events, unavailable }
}

function boundedJsonText(file) {
  const bytes = readFileSync(resolve(file))
  if (bytes.length > MAX_REPLAY_BYTES) throw new Error('too-large')
  return bytes.toString('utf8')
}

function percentile95(samples) {
  if (!samples.length) return null
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1]
}

function elapsedMs(from, to) {
  return safeCount(from) && safeCount(to) && to >= from ? to - from : null
}

function memberProjection(task, member) {
  const codex = task?.codex
  if (!codex || typeof codex !== 'object') return null
  if (member === 'main') return codex.main && typeof codex.main === 'object' ? codex.main : null
  const side = /^side:([0-7])$/.exec(member || '')
  if (!side || !Array.isArray(codex.sides)) return null
  const value = codex.sides[Number(side[1])]
  return value && typeof value === 'object' ? value : null
}

function compareTransition(task, expected) {
  if (!task || task.taskRef !== expected.taskRef) return 'absent'
  if (safeCount(expected.semanticRevision) && task.semanticRevision !== expected.semanticRevision) return 'absent'
  const exactMember = expected.memberRef || expected.turnRef || expected.member === 'side'
  let member
  if (exactMember) {
    if (!Array.isArray(task.codexMembers)) return 'unavailable'
    const matching = task.codexMembers.filter(candidate =>
      (!expected.memberRef || candidate.memberRef === expected.memberRef)
      && (!expected.turnRef || candidate.turnRef === expected.turnRef)
      && (expected.member !== 'side' || candidate.root === false)
      && (expected.member !== 'main' || candidate.root === true)
      && (!safeCount(expected.turnStartedAt) || candidate.turnStartedAt === expected.turnStartedAt)
      && (!safeCount(expected.terminalAt) || candidate.terminalAt === expected.terminalAt))
    if (!matching.length) return 'absent'
    if (matching.length > 1) return 'unavailable'
    member = matching[0]
  } else {
    for (const key of ['turnStartedAt', 'terminalAt']) {
      if (safeCount(expected[key]) && task[key] !== expected[key]) return 'absent'
    }
    member = memberProjection(task, expected.member || 'main')
  }
  if (expected.member && !member) return 'unavailable'
  const checks = [
    [task.phase, expected.phase], [task.unread, expected.unread],
    [task.planReady, expected.planReady], [task.continueTask, expected.continueTask],
    [member?.phase, expected.memberPhase], [member?.turn, expected.turn], [member?.unread, expected.memberUnread]
  ]
  let unavailable = false
  for (const [actual, wanted] of checks) {
    if (wanted === undefined) continue
    if (actual === undefined || actual === null) unavailable = true
    else if (actual !== wanted) return 'mismatch'
  }
  return unavailable ? 'unavailable' : 'match'
}

function packagePin(task) {
  if (!task || typeof task !== 'object') return {}
  if (task.providerPin === true) return { pinSource: 'native', pinned: true }
  if (task.localPin === true) return { pinSource: 'local', pinned: true }
  if (task.providerPin === false && task.localPin === false) return { pinSource: 'none', pinned: false }
  return {}
}

function snapshotsOf(events, host) {
  return events.filter((event) => event.type === 'snapshot' && event.hostGeneration === host
    && event.package && Array.isArray(event.package.tasks))
}

function receiptItems(events) {
  const items = []
  for (const event of events) {
    if (event.type === 'snapshot' && Array.isArray(event.consumerReceipts)) {
      for (const receipt of event.consumerReceipts) items.push({ hostGeneration: event.hostGeneration, sequence: event.sequence, receipt })
    } else if (event.type === 'receipt' && event.receipt && typeof event.receipt === 'object') {
      items.push({ hostGeneration: event.hostGeneration, sequence: event.sequence, receipt: event.receipt })
    }
  }
  return items.filter((item) => item.receipt && typeof item.receipt === 'object' && safeCount(item.receipt.packageRevision))
}

function latestItem(items) {
  return items.reduce((best, item) => !best || item.sequence >= best.sequence ? item : best, null)
}

function checkTransitionsAgainst(manifest, events) {
  const sameHost = snapshotsOf(events, manifest.hostGeneration)
  const foreign = events.some((event) => event.hostGeneration !== manifest.hostGeneration)
  const items = []
  const samples = []
  const stageSamples = { nativeToHost: [], hostToAdmission: [], admissionToPackage: [] }
  let timely = 0
  let missing = 0
  let timeout = 0
  let mismatched = 0
  let pending = 0
  let pendingReason = ''
  let outputsMatch = true
  for (const expected of manifest.transitions) {
    const item = { id: expected.id, taskRef: expected.taskRef, status: 'missing', reason: 'missing', latencyMs: null }
    if (!sameHost.length) {
      if (foreign) {
        item.status = 'pending'
        item.reason = 'host-changed'
      }
    } else {
      let matched = null
      let sawMismatch = false
      let sawUnavailable = false
      for (const event of sameHost) {
        if (safeCount(event.package.publishedAt) && event.package.publishedAt < expected.expectAt) continue
        const task = event.package.tasks.find((candidate) => candidate?.taskRef === expected.taskRef)
        const compared = compareTransition(task, expected)
        if (compared === 'match') { matched = { event, task }; break }
        if (compared === 'mismatch') sawMismatch = true
        if (compared === 'unavailable') sawUnavailable = true
      }
      if (!matched) {
        if (sawMismatch) {
          item.status = 'mismatch'
          item.reason = 'field-mismatch'
        } else if (sawUnavailable) {
          item.status = 'pending'
          item.reason = 'field-unavailable'
        }
      } else {
        const publishedAt = matched.event.package.publishedAt
        const observedAt = safeCount(publishedAt) ? publishedAt : safeCount(matched.event.observedAt) ? matched.event.observedAt : null
        const latency = elapsedMs(expected.expectAt, observedAt)
        if (latency === null) {
          item.status = 'pending'
          item.reason = 'time-unavailable'
        } else {
          const deadline = safeCount(expected.deadlineMs) ? expected.deadlineMs : manifest.deadlineMs
          const member = memberProjection(matched.task, expected.member || 'main')
          const currentPhase = member && typeof member.phase === 'string' ? member.phase : matched.task.phase
          if (matched.task.phase !== currentPhase) outputsMatch = false
          item.latencyMs = latency
          samples.push(latency)
          item.stagesMs = {
            nativeToHost: elapsedMs(expected.expectAt, expected.hostReceivedAt),
            hostToAdmission: elapsedMs(expected.hostReceivedAt, expected.admittedAt),
            admissionToPackage: elapsedMs(expected.admittedAt, observedAt)
          }
          for (const [stage, duration] of Object.entries(item.stagesMs)) {
            if (duration !== null) stageSamples[stage].push(duration)
          }
          if (latency > deadline) {
            item.status = 'timeout'
            item.reason = 'timeout'
          } else {
            item.status = 'timely'
            item.reason = 'ok'
          }
        }
      }
    }
    if (item.status === 'timely') timely += 1
    else if (item.status === 'timeout') timeout += 1
    else if (item.status === 'missing') missing += 1
    else if (item.status === 'mismatch') mismatched += 1
    else {
      pending += 1
      pendingReason ||= item.reason
    }
    items.push(item)
  }
  let status = 'pass'
  let reason = 'ok'
  if (mismatched) { status = 'mismatch'; reason = 'field-mismatch' }
  else if (timeout) { status = 'fail'; reason = 'timeout' }
  else if (missing) { status = 'fail'; reason = 'missing' }
  else if (pending) { status = 'pending'; reason = pendingReason }
  return {
    status, reason, expected: manifest.transitions.length, timely, missing, timeout, mismatched, pending,
    observed: samples.length, p95Ms: percentile95(samples), outputsMatch, items,
    stages: Object.fromEntries(Object.entries(stageSamples).map(([stage, values]) => [
      stage, { observed: values.length, p95Ms: percentile95(values) }
    ]))
  }
}

function packageAt(events, host, revision) {
  return latestItem(snapshotsOf(events, host).filter((event) => event.package.packageRevision === revision))
}

function checkSurface(manifest, events, surface) {
  const presentation = manifest.presentation
  const expected = presentation?.[surface]
  if (!expected) return null
  const revision = presentation.packageRevision
  const latest = latestItem(snapshotsOf(events, manifest.hostGeneration))
  const currentWindow = latest?.consumerWindowGenerations?.[surface]
  if (safeCount(currentWindow) && currentWindow !== expected.windowGeneration) {
    return { status: 'pending', reason: 'window-changed', applied: false, visible: false }
  }
  const receipts = receiptItems(events)
  const sameHost = receipts.filter((item) => item.hostGeneration === manifest.hostGeneration && item.receipt.surface === surface && item.receipt.packageRevision === revision)
  const applied = (items) => items.some((item) => item.receipt.kind === 'delivery' && item.receipt.outcome === 'applied')
  const visible = (items) => items.some((item) => item.receipt.outcome === 'visible' || item.receipt.presentation === 'visible')
  if (!sameHost.length) {
    const reason = events.some((event) => event.hostGeneration === manifest.hostGeneration) ? 'receipt-missing'
      : events.length ? 'host-changed' : 'receipt-missing'
    return { status: 'pending', reason, applied: false, visible: false }
  }
  const windowed = sameHost.filter((item) => item.receipt.windowGeneration === expected.windowGeneration)
  if (!windowed.length) return { status: 'pending', reason: 'window-changed', applied: false, visible: false }
  const stages = { status: 'pass', reason: 'ok', applied: applied(windowed), visible: visible(windowed) }
  const selected = packageAt(events, manifest.hostGeneration, revision)
  if (!selected) return { ...stages, status: 'pending', reason: 'package-missing' }
  const presentations = windowed.filter((item) => item.receipt.kind === 'presentation')
  const latestPresentation = latestItem(presentations)
  const timeOf = (kind, outcome) => latestItem(windowed.filter(({ receipt }) =>
    receipt.kind === kind && receipt.outcome === outcome))?.receipt.observedAt
  stages.receivedMs = elapsedMs(selected.package.publishedAt, timeOf('delivery', 'received'))
  stages.appliedMs = elapsedMs(selected.package.publishedAt, timeOf('delivery', 'applied'))
  const hiding = latestPresentation && NON_VISIBLE.has(latestPresentation.receipt.outcome) ? latestPresentation : null
  if (surface === 'main') {
    if (hiding) return { ...stages, status: 'pending', reason: hiding.receipt.outcome }
    const visiblePresentation = latestPresentation?.receipt.outcome === 'visible' ? latestPresentation : null
    if (!visiblePresentation) {
      const delivery = latestItem(windowed.filter((item) => item.receipt.kind === 'delivery'))
      return { ...stages, status: 'pending', reason: delivery?.receipt.outcome === 'received' ? 'received' : delivery ? 'applied' : 'not-visible' }
    }
    return { ...stages, visibleMs: elapsedMs(selected.package.publishedAt, visiblePresentation.receipt.observedAt),
      ...compareMain(visiblePresentation.receipt, selected.package, expected.counts) }
  }
  if (hiding) {
    const newestRow = latestItem(windowed.filter((item) => item.receipt.kind === 'row'))
    if (!newestRow || hiding.sequence >= newestRow.sequence) return { ...stages, status: 'pending', reason: hiding.receipt.outcome }
  }
  let rowStatus = 'pass'
  let rowReason = 'ok'
  const rowTimes = []
  for (const row of expected.rows) {
    const latestRow = latestItem(windowed.filter((item) => item.receipt.kind === 'row' && item.receipt.taskRef === row.taskRef))
    const rowVerdict = compareRow(latestRow?.receipt, selected.package, row)
    if (rowVerdict === 'mismatch') return { ...stages, status: 'mismatch', reason: 'field-mismatch' }
    if (rowVerdict !== 'match') {
      rowStatus = 'pending'
      rowReason = rowVerdict
    } else {
      rowTimes.push(elapsedMs(selected.package.publishedAt, latestRow.receipt.observedAt))
    }
  }
  return rowStatus === 'pass'
    ? { ...stages, visibleMs: rowTimes.every(value => value !== null) ? Math.max(...rowTimes) : null }
    : { ...stages, status: 'pending', reason: rowReason }
}

function compareMain(receipt, taskPackage, expected) {
  const actual = receipt.counts
  const packaged = taskPackage.views?.counts
  if (!actual || typeof actual !== 'object' || !packaged || typeof packaged !== 'object') return { status: 'pending', reason: 'field-unavailable' }
  for (const key of BADGES) {
    if (!safeCount(actual[key]) || !safeCount(packaged[key])) return { status: 'pending', reason: 'field-unavailable' }
    if (actual[key] !== expected[key] || actual[key] !== packaged[key]) return { status: 'mismatch', reason: 'field-mismatch' }
  }
  return { status: 'pass', reason: 'ok' }
}

function compareRow(receipt, taskPackage, expected) {
  if (!receipt) return 'receipt-missing'
  if (receipt.outcome === 'mismatch') return 'mismatch'
  if (receipt.outcome !== 'visible') return receipt.outcome === 'received' ? 'received' : receipt.kind === 'delivery' ? 'applied' : 'not-visible'
  const task = taskPackage.tasks.find((candidate) => candidate?.taskRef === expected.taskRef)
  const groups = taskPackage.views?.groups
  const membership = groups && typeof groups === 'object' && Array.isArray(groups[expected.group])
    ? groups[expected.group].includes(expected.taskRef) : undefined
  const pin = packagePin(task)
  if (!task || typeof receipt.phase !== 'string' || typeof task.phase !== 'string' || membership === undefined
    || typeof receipt.group !== 'string' || typeof receipt.pinSource !== 'string' || pin.pinSource === undefined) return 'field-unavailable'
  if (receipt.phase !== expected.phase || task.phase !== expected.phase || receipt.group !== expected.group || !membership
    || receipt.pinSource !== expected.pinSource || pin.pinSource !== expected.pinSource) return 'mismatch'
  if (expected.pinned !== undefined && (typeof receipt.pinned !== 'boolean' || pin.pinned === undefined)) return 'field-unavailable'
  if (expected.pinned !== undefined && (receipt.pinned !== expected.pinned || pin.pinned !== expected.pinned)) return 'mismatch'
  return 'match'
}

function evaluateTransitions(manifest, events) {
  const transitions = manifest.transitions.length ? checkTransitionsAgainst(manifest, events) : {
    status: 'pass', reason: 'ok', expected: 0, timely: 0, missing: 0, timeout: 0, mismatched: 0, pending: 0,
    observed: 0, p95Ms: null, outputsMatch: true, items: []
  }
  const display = manifest.presentation ? {
    ...(manifest.presentation.main ? { main: checkSurface(manifest, events, 'main') } : {}),
    ...(manifest.presentation.float ? { float: checkSurface(manifest, events, 'float') } : {})
  } : null
  const parts = [transitions, display?.main, display?.float].filter(Boolean)
  const selected = parts.find((part) => part.status === 'mismatch')
    || parts.find((part) => part.status === 'fail')
    || parts.find((part) => part.status === 'pending')
    || { status: 'pass', reason: 'ok' }
  return {
    schema: SCHEMA,
    type: 'transition-check',
    verdict: selected.status === 'fail' ? 'fail' : selected.status,
    reason: selected.reason,
    hostGeneration: manifest.hostGeneration,
    expected: transitions.expected,
    timely: transitions.timely,
    missing: transitions.missing,
    timeout: transitions.timeout,
    mismatched: transitions.mismatched,
    pending: transitions.pending,
    observed: transitions.observed,
    p95Ms: transitions.p95Ms,
    ...(transitions.stages ? { stages: transitions.stages } : {}),
    outputsMatch: transitions.outputsMatch,
    ...(display ? { display } : {}),
    items: transitions.items
  }
}

function pendingCheck(manifest, reason) {
  const pendingReason = PENDING_REASONS.has(reason) ? reason : 'host-unavailable'
  return {
    schema: SCHEMA, type: 'transition-check', verdict: 'pending', reason: pendingReason,
    hostGeneration: manifest.hostGeneration, expected: manifest.transitions.length, timely: 0, missing: 0, timeout: 0,
    mismatched: 0, pending: manifest.transitions.length, observed: 0, p95Ms: null, outputsMatch: true, items: manifest.transitions.map((transition) => ({
      id: transition.id, taskRef: transition.taskRef, status: 'pending', reason: pendingReason, latencyMs: null
    }))
  }
}

async function main() {
  if (args.includes('--help')) {
    process.stdout.write('Usage: node scripts/read-eypc-task-state.mjs [--watch] [--summary] [--dir=<endpoint-directory>]\n'
      + '       node scripts/read-eypc-task-state.mjs --check-transitions --expect=<manifest.json> [--replay=<events.ndjson>] [--dir=<endpoint-directory>]\n')
    return
  }
  if (args.some((arg) => !knownArg(arg))) {
    process.stderr.write('Unknown option. Use --help.\n')
    process.exitCode = 2
    return
  }
  if (checkTransitions && (watch || summary) || checkTransitions !== Boolean(expectFile) || Boolean(replayFile) !== checkTransitions && Boolean(replayFile)) {
    usageError('Use --check-transitions only with --expect and optional --replay or --dir.')
    return
  }
  if (checkTransitions) {
    let manifest
    try { manifest = readManifest(expectFile) } catch {
      usageError('Invalid transition manifest.')
      return
    }
    if (replayFile) {
      let replay
      try { replay = readReplay(replayFile) } catch {
        usageError('Invalid transition replay.')
        return
      }
      const result = !replay.events.length && replay.unavailable
        ? pendingCheck(manifest, replay.unavailable) : evaluateTransitions(manifest, replay.events)
      await write(result)
      if (result.verdict !== 'pass') process.exitCode = 1
      return
    }
    const readLiveEndpoint = () => readTaskStateEndpoint(directory ? resolve(directory) : undefined)
    const endpoint = readLiveEndpoint()
    if (!endpoint) {
      await write(pendingCheck(manifest, 'endpoint-unavailable'))
      process.exitCode = 1
      return
    }
    const events = []
    let reason = 'host-disconnected'
    try {
      reason = await observe(endpoint, readLiveEndpoint, async (event) => { events.push(event) }, false)
    } catch (error) {
      reason = error.message === 'host-timeout' ? 'host-timeout' : 'host-disconnected'
    }
    const result = events.length ? evaluateTransitions(manifest, events) : pendingCheck(manifest, reason)
    await write(result)
    if (result.verdict !== 'pass') process.exitCode = 1
    return
  }
  const readEndpoint = () => readTaskStateEndpoint(directory ? resolve(directory) : undefined)
  let lastFailure = ''
  let lastEvent
  do {
    const endpoint = readEndpoint()
    let reason = endpoint ? 'host-disconnected' : 'endpoint-unavailable'
    let receivedSnapshot = false
    if (endpoint) {
      try {
        reason = await observe(endpoint, readEndpoint, async (event) => {
          receivedSnapshot ||= event.type === 'snapshot'
          if (watch && lastEvent?.hostGeneration === event.hostGeneration && lastEvent.sequence >= event.sequence) return
          lastFailure = ''
          lastEvent = { hostGeneration: event.hostGeneration, sequence: event.sequence }
          await write(summary ? summarize(event) : event)
        }, watch)
      } catch (error) {
        reason = error.message === 'host-timeout' ? 'host-timeout' : 'host-disconnected'
      }
    }
    if (!reason) return
    if (watch && receivedSnapshot && ['host-timeout', 'host-disconnected', 'watch-behind'].includes(reason)) {
      await delay(400)
      continue
    }
    if (reason !== lastFailure) await write({ schema: SCHEMA, type: 'unavailable', reason })
    lastFailure = reason
    lastEvent = undefined
    if (watch) await delay(400)
  } while (watch)
  process.exitCode = 1
}

process.stdout.on('error', (error) => { process.exit(error.code === 'EPIPE' ? 0 : 1) })
await main()
