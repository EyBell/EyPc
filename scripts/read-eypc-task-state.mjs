import http from 'node:http'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import bridge from '../preload/companion/task-state-bridge.cjs'
import { EYPC_CORE_VERSION } from './eypc-core-version.mjs'

const require = createRequire(import.meta.url)
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
const ERROR_TURNS = new Set(['turn-failed'])
const SEGMENT_ID = /^[a-z0-9-]{1,32}$/
const SLO_MIN_SAMPLES = 20
const CONNECTION_MODES = new Set(['normal', 'disconnected'])
const HOT_UPDATE_LIMITS_MS = { normal: 2_000, disconnected: 5_000 }
const TARGETED_DISPATCH_LIMIT_MS = 1_000
const SAMPLE_SEGMENTS = new Set(['full', 'page', 'tail', 'targeted'])
const PENDING_REASONS = new Set(['endpoint-unavailable', 'host-timeout', 'host-disconnected', 'host-unavailable', 'endpoint-mismatch', 'invalid-response', 'watch-behind', 'host-changed', 'window-changed'])
const args = process.argv.slice(2)
const watch = args.includes('--watch')
const summary = args.includes('--summary')
const checkVersion = args.includes('--check-version')
const checkTransitions = args.includes('--check-transitions')
const directory = args.find((arg) => arg.startsWith('--dir='))?.slice('--dir='.length)
const expectFile = args.find((arg) => arg.startsWith('--expect='))?.slice('--expect='.length)
const replayFile = args.find((arg) => arg.startsWith('--replay='))?.slice('--replay='.length)
const taskRefsArg = args.find((arg) => arg.startsWith('--task-refs='))
const taskRefs = taskRefsArg ? new Set(taskRefsArg.slice('--task-refs='.length).split(',')) : null
const knownArg = (arg) => arg === '--watch' || arg === '--summary' || arg === '--check-version' || arg === '--check-transitions'
  || /^--dir=.+$/.test(arg) || /^--expect=.+$/.test(arg) || /^--replay=.+$/.test(arg) || arg.startsWith('--task-refs=')

function projectWatchSnapshot(event) {
  if (!taskRefs || event.type !== 'snapshot' || !Array.isArray(event.package?.tasks)) return event
  return { ...event, taskScope: [...taskRefs],
    package: { ...event.package, tasks: event.package.tasks.filter(task => taskRefs.has(task.taskRef)) } }
}

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
          || (sequence < 0 ? event.type !== 'snapshot' : !['snapshot', 'receipt', 'inventory'].includes(event.type))) return 'invalid-response'
        sequence = event.sequence
        await accept(event)
        if (event.type === 'inventory') continue
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

async function readSnapshot(readEndpoint) {
  const endpoint = readEndpoint()
  if (!endpoint) return { reason: 'endpoint-unavailable' }
  let event
  let reason
  try {
    reason = await observe(endpoint, readEndpoint, (snapshot) => { event = snapshot }, false)
  } catch (error) {
    reason = error.message === 'host-timeout' ? 'host-timeout' : 'host-disconnected'
  }
  return { event, reason }
}

function versionIdentity(value) {
  const { coreVersion, hostAssetId, rendererAssetId, builtAt } = value ?? {}
  if (![coreVersion, hostAssetId, rendererAssetId, builtAt].every((field) => typeof field === 'string' && field.trim())
    || !Number.isFinite(Date.parse(builtAt))) return null
  return { coreVersion, hostAssetId, rendererAssetId, builtAt }
}

function readVersionIdentity(read) {
  try { return versionIdentity(read()) } catch { return null }
}

function compareVersions(left, right) {
  if (!left || !right) return 'unverified'
  if (left.coreVersion !== right.coreVersion || left.hostAssetId !== right.hostAssetId
    || left.rendererAssetId !== right.rendererAssetId) return 'mismatch'
  return left.builtAt === right.builtAt ? 'match' : 'same-content'
}

async function checkLoadedVersion(readEndpoint) {
  const { event, reason } = await readSnapshot(readEndpoint)
  const { status: hostStatus, handshakeAt, windowGeneration } = event?.host ?? {}
  const loaded = hostStatus === 'host-loaded' && Number.isSafeInteger(handshakeAt) && handshakeAt > 0
    ? versionIdentity(event.host) : null
  const artifact = readVersionIdentity(() => require('../dist/runtime-identity.cjs'))
  const lastSuccessfulBuild = readVersionIdentity(() => {
    const state = JSON.parse(readFileSync(new URL('../.codex/build-hook/state.json', import.meta.url), 'utf8'))
    return state.version === 1 ? state.success?.identity : null
  })
  const comparison = compareVersions(loaded, artifact)
  return {
    schema: 'eypc-core-version-check-v1',
    status: loaded && artifact && artifact.coreVersion !== EYPC_CORE_VERSION ? 'mismatch' : comparison,
    sourceCoreVersion: EYPC_CORE_VERSION,
    host: event ? {
      status: loaded ? 'host-loaded' : 'unconfirmed',
      hostGeneration: event.hostGeneration,
      windowGeneration: windowGeneration ?? null,
      handshakeAt: handshakeAt ?? null,
      identity: loaded
    } : { status: 'unavailable', reason },
    artifact,
    lastSuccessfulBuild,
    artifactVsLastSuccessfulBuild: compareVersions(artifact, lastSuccessfulBuild)
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

function readSegments(segments) {
  if (!Array.isArray(segments) || !segments.length || segments.length > 16) throw new Error('manifest')
  const seen = new Set()
  for (const segment of segments) {
    assertKeys(segment, new Set(['id', 'startAt', 'endAt']))
    if (!SEGMENT_ID.test(segment.id) || seen.has(segment.id) || !safeCount(segment.startAt) || !safeCount(segment.endAt)
      || segment.endAt < segment.startAt) throw new Error('manifest')
    seen.add(segment.id)
  }
  return seen
}

function readForbidden(forbidden) {
  if (!Array.isArray(forbidden) || !forbidden.length || forbidden.length > 8) throw new Error('manifest')
  const seen = new Set()
  for (const status of forbidden) {
    if (typeof status !== 'string' || seen.has(status) || (!PHASES.has(status) && !TURNS.has(status))) throw new Error('manifest')
    seen.add(status)
  }
}

function readManifest(file) {
  const manifest = boundedJson(file, MAX_MANIFEST_BYTES)
  assertKeys(manifest, new Set(['schema', 'hostGeneration', 'deadlineMs', 'sloP95Ms', 'hotUpdate', 'segments', 'transitions', 'presentation']))
  if (manifest.schema !== 'eypc-task-transition-manifest-v1' || !HOST_GENERATION.test(manifest.hostGeneration)
    || !safeCount(manifest.deadlineMs)) throw new Error('manifest')
  if (manifest.sloP95Ms !== undefined && (!safeCount(manifest.sloP95Ms) || manifest.sloP95Ms < 1)) throw new Error('manifest')
  if (manifest.hotUpdate !== undefined && typeof manifest.hotUpdate !== 'boolean') throw new Error('manifest')
  const segmentIds = manifest.segments === undefined ? new Set() : readSegments(manifest.segments)
  if (!Array.isArray(manifest.transitions) || manifest.transitions.length > MAX_TRANSITIONS) throw new Error('manifest')
  const seen = new Set()
  for (const transition of manifest.transitions) {
    assertKeys(transition, new Set(['id', 'taskRef', 'member', 'memberRef', 'memberPhase', 'turnRef', 'phase', 'turn',
      'turnStartedAt', 'terminalAt', 'semanticRevision', 'expectAt', 'expectAtPrecisionMs', 'hostReceivedAt', 'admittedAt', 'deadlineMs',
      'unread', 'memberUnread', 'planReady', 'continueTask', 'continueDispatchAllowed', 'forbidden', 'precisionMs', 'segment',
      'connectionMode', 'nativeEventRef', 'statusRequestedAt', 'statusReceivedAt', 'queuedAt', 'requestedAt']))
    if (!TRANSITION_ID.test(transition.id) || seen.has(transition.id) || !REF.test(transition.taskRef)
      || !PHASES.has(transition.phase) || !safeCount(transition.expectAt)) throw new Error('manifest')
    if (transition.expectAtPrecisionMs !== undefined && (![1, 1000].includes(transition.expectAtPrecisionMs)
      || transition.expectAtPrecisionMs === 1000 && transition.expectAt % 1000 !== 0)) throw new Error('manifest')
    if (transition.member !== undefined && !MEMBER.test(transition.member)) throw new Error('manifest')
    for (const field of ['memberRef', 'turnRef', 'nativeEventRef']) {
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
    for (const key of ['unread', 'memberUnread', 'planReady', 'continueTask', 'continueDispatchAllowed']) {
      if (transition[key] !== undefined && typeof transition[key] !== 'boolean') throw new Error('manifest')
    }
    if (transition.forbidden !== undefined) readForbidden(transition.forbidden)
    if (transition.precisionMs !== undefined && (!safeCount(transition.precisionMs) || transition.precisionMs > 60_000)) throw new Error('manifest')
    if (transition.segment !== undefined && !segmentIds.has(transition.segment)) throw new Error('manifest')
    if (transition.connectionMode !== undefined && !CONNECTION_MODES.has(transition.connectionMode)) throw new Error('manifest')
    for (const key of ['statusRequestedAt', 'statusReceivedAt', 'queuedAt', 'requestedAt']) {
      if (transition[key] !== undefined && (!Number.isSafeInteger(transition[key]) || transition[key] <= 0)) throw new Error('manifest')
    }
    if (transition.statusReceivedAt !== undefined && transition.statusRequestedAt !== undefined
      && transition.statusReceivedAt < transition.statusRequestedAt) throw new Error('manifest')
    if (transition.requestedAt !== undefined && transition.queuedAt !== undefined
      && transition.requestedAt < transition.queuedAt) throw new Error('manifest')
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
    assertKeys(presentation.main, new Set(['windowGeneration', 'counts', 'continueTask']))
    if (!safeCount(presentation.main.windowGeneration) || presentation.main.windowGeneration < 1) throw new Error('manifest')
    assertKeys(presentation.main.counts, new Set(BADGES))
    if (BADGES.some((key) => !safeCount(presentation.main.counts[key]))) throw new Error('manifest')
    if (presentation.main.continueTask !== undefined && typeof presentation.main.continueTask !== 'boolean') throw new Error('manifest')
  }
  if (presentation.float) {
    assertKeys(presentation.float, new Set(['windowGeneration', 'rows']))
    if (!safeCount(presentation.float.windowGeneration) || presentation.float.windowGeneration < 1
      || !Array.isArray(presentation.float.rows) || !presentation.float.rows.length || presentation.float.rows.length > 128) throw new Error('manifest')
    for (const row of presentation.float.rows) {
      assertKeys(row, new Set(['taskRef', 'group', 'phase', 'pinSource', 'pinned', 'continueTask']))
      if (!REF.test(row.taskRef) || !GROUPS.has(row.group) || !PHASES.has(row.phase) || !PINS.has(row.pinSource)) throw new Error('manifest')
      if (row.pinned !== undefined && typeof row.pinned !== 'boolean') throw new Error('manifest')
      if (row.continueTask !== undefined && typeof row.continueTask !== 'boolean') throw new Error('manifest')
    }
  }
}

function readReplay(file) {
  const text = boundedJsonText(file)
  const events = []
  let unavailable = null
  let disconnectAfter = null
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    if (events.length >= MAX_REPLAY_EVENTS) throw new Error('replay')
    const event = JSON.parse(line)
    if (!event || typeof event !== 'object' || event.schema !== SCHEMA || !HOST_GENERATION.test(event.hostGeneration)
      || !safeCount(event.sequence) || !['snapshot', 'receipt', 'heartbeat', 'inventory', 'unavailable'].includes(event.type)) throw new Error('replay')
    if (event.type === 'inventory' && (!event.inventory || typeof event.inventory !== 'object' || Array.isArray(event.inventory))) throw new Error('replay')
    if (event.type === 'heartbeat') continue
    if (event.type === 'unavailable') {
      unavailable = PENDING_REASONS.has(event.reason) ? event.reason : 'host-unavailable'
      if (event.reason === 'host-disconnected' && disconnectAfter === null) disconnectAfter = event.sequence
      continue
    }
    events.push(event)
  }
  return { events, unavailable, disconnectAfter }
}

function boundedJsonText(file) {
  const bytes = readFileSync(resolve(file))
  if (bytes.length > MAX_REPLAY_BYTES) throw new Error('too-large')
  return bytes.toString('utf8')
}

function percentile(samples, rank = 0.95) {
  if (!samples.length) return null
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * rank) - 1]
}

function elapsedMs(from, to) {
  return safeCount(from) && safeCount(to) && to >= from ? to - from : null
}

function publishClock(pkg) {
  if (!pkg || typeof pkg !== 'object') return null
  if (safeCount(pkg.capturedAt) && pkg.capturedAt > 0) return pkg.capturedAt
  return safeCount(pkg.publishedAt) ? pkg.publishedAt : null
}

function publishedClock(pkg) {
  if (!pkg || typeof pkg !== 'object') return null
  if (safeCount(pkg.publishedAt) && pkg.publishedAt > 0) return pkg.publishedAt
  return safeCount(pkg.capturedAt) && pkg.capturedAt > 0 ? pkg.capturedAt : null
}

function hotPublishedAt(pkg) {
  return pkg && safeCount(pkg.publishedAt) && pkg.publishedAt > 0 ? pkg.publishedAt : null
}

function targetSignature(task, expected) {
  if (!task || task.taskRef !== expected.taskRef) return 'absent'
  const member = Array.isArray(task.codexMembers)
    ? task.codexMembers.find((candidate) => (!expected.memberRef || candidate.memberRef === expected.memberRef)
      && (!expected.turnRef || candidate.turnRef === expected.turnRef))
    : null
  const projected = memberProjection(task, expected.member || 'main')
  return JSON.stringify([
    task.phase ?? null, task.unread ?? null, task.planReady ?? null, task.continueTask ?? null,
    task.continueDispatchAllowed ?? null, member?.phase ?? null, member?.turn ?? null, member?.unread ?? null,
    projected?.phase ?? null, projected?.turn ?? null
  ])
}

function forbiddenHit(task, expected) {
  if (!task) return false
  const same = expected.turnRef && Array.isArray(task.codexMembers)
    ? task.codexMembers.find((candidate) => candidate.turnRef === expected.turnRef) : null
  const projected = memberProjection(task, expected.member || 'main')
  const statuses = [same?.turn, same?.phase, projected?.turn, projected?.phase, task.phase]
  const forbidden = Array.isArray(expected.forbidden) ? expected.forbidden : []
  return forbidden.some((status) => statuses.includes(status)) || Boolean(same && ERROR_TURNS.has(same.turn))
}

function clockClose(actual, expected, precision, actualSecond) {
  if (!safeCount(expected)) return true
  if (safeCount(actualSecond)) return Math.floor(expected / 1000) === actualSecond
  return safeCount(actual) && (safeCount(precision) && precision > 0 ? Math.abs(actual - expected) <= precision : actual === expected)
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

function identifiedMembers(task, expected) {
  return task.codexMembers.filter(candidate =>
    (!expected.memberRef || candidate.memberRef === expected.memberRef)
    && (!expected.turnRef || candidate.turnRef === expected.turnRef)
    && (expected.member !== 'side' || candidate.root === false)
    && (expected.member !== 'main' || candidate.root === true))
}

function memberTimeStatus(member, expected) {
  let unavailable = false
  for (const [msKey, secondKey] of [['turnStartedAt', 'turnStartedSecond'], ['terminalAt', 'terminalSecond']]) {
    if (!safeCount(expected[msKey])) continue
    const actual = member?.[msKey]
    const second = member?.[secondKey]
    if ((actual === undefined || actual === null) && (second === undefined || second === null)) {
      unavailable = true
      continue
    }
    if (!clockClose(actual, expected[msKey], expected.precisionMs, second)) return 'mismatch'
  }
  return unavailable ? 'unavailable' : 'match'
}

function compareTransition(task, expected) {
  if (!task || task.taskRef !== expected.taskRef) return 'absent'
  if (safeCount(expected.semanticRevision) && task.semanticRevision !== expected.semanticRevision) return 'absent'
  const exactMember = expected.memberRef || expected.turnRef || expected.member === 'side'
  let member
  let identifiedTime = 'match'
  if (expected.memberRef || expected.turnRef) {
    if (!Array.isArray(task.codexMembers)) return 'unavailable'
    const matching = identifiedMembers(task, expected)
    if (!matching.length) {
      return safeCount(task.codexMemberTotal) && task.codexMemberTotal > task.codexMembers.length ? 'coverage' : 'absent'
    }
    const timed = matching.filter((candidate) => memberTimeStatus(candidate, expected) === 'match')
    if (matching.length > 1 && timed.length !== 1) {
      if (timed.length > 1) return 'unavailable'
      return matching.some((candidate) => memberTimeStatus(candidate, expected) === 'mismatch') ? 'mismatch' : 'unavailable'
    }
    member = timed[0] || matching[0]
    identifiedTime = memberTimeStatus(member, expected)
    if (identifiedTime === 'mismatch') return 'mismatch'
  } else if (exactMember) {
    if (!Array.isArray(task.codexMembers)) return 'unavailable'
    const matching = identifiedMembers(task, expected).filter(candidate =>
      (!safeCount(expected.turnStartedAt) || clockClose(candidate.turnStartedAt, expected.turnStartedAt, expected.precisionMs, candidate.turnStartedSecond))
      && (!safeCount(expected.terminalAt) || clockClose(candidate.terminalAt, expected.terminalAt, expected.precisionMs, candidate.terminalSecond)))
    if (!matching.length) {
      return safeCount(task.codexMemberTotal) && task.codexMemberTotal > task.codexMembers.length ? 'coverage' : 'absent'
    }
    if (matching.length > 1) return 'unavailable'
    member = matching[0]
  } else {
    for (const key of ['turnStartedAt', 'terminalAt']) {
      if (!clockClose(task[key], expected[key], expected.precisionMs)) return 'absent'
    }
    member = memberProjection(task, expected.member || 'main')
  }
  if (expected.member && !member) return 'unavailable'
  const checks = [
    [task.phase, expected.phase], [task.unread, expected.unread],
    [task.planReady, expected.planReady], [task.continueTask, expected.continueTask],
    [task.continueDispatchAllowed, expected.continueDispatchAllowed],
    [member?.phase, expected.memberPhase], [member?.turn, expected.turn], [member?.unread, expected.memberUnread]
  ]
  let unavailable = identifiedTime === 'unavailable'
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

function dedupeEvents(events) {
  const seen = new Set()
  const unique = []
  for (const event of events) {
    const identity = `${event.hostGeneration}:${event.type}:${event.sequence}`
    if (seen.has(identity)) continue
    seen.add(identity)
    unique.push(event)
  }
  return unique
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

function eventClock(event) {
  const clock = publishClock(event?.package)
  if (clock !== null) return clock
  if (safeCount(event?.observedAt)) return event.observedAt
  const sample = event?.type === 'inventory' ? event.inventory?.latest : null
  if (safeCount(sample?.emittedAt) && sample.emittedAt > 0) return sample.emittedAt
  if (safeCount(sample?.observedAt) && sample.observedAt > 0) return sample.observedAt
  return null
}

function inventoryGap(inventory) {
  const latest = inventory?.latest
  if (!latest || typeof latest !== 'object') return false
  if (latest.disposition === 'deferred') return true
  const segments = Array.isArray(inventory.segments) ? inventory.segments : []
  const latestGeneration = safeCount(latest.sourceGeneration) ? latest.sourceGeneration : null
  if (segments.some((sample) => safeCount(sample?.sourceGeneration)
    && (latestGeneration === null || sample.sourceGeneration > latestGeneration))) return true
  return latest.truncated === true || latest.coverage === 'partial'
    || safeCount(latest.totalCount) && safeCount(latest.readCount) && latest.totalCount > latest.readCount
}

function latestInventory(events, host, expected) {
  let inventory = null
  for (const event of events) {
    if (event.hostGeneration !== host || (event.type !== 'snapshot' && event.type !== 'inventory') || !event.inventory) continue
    const clock = eventClock(event)
    if (clock !== null && clock < expected.expectAt) continue
    inventory = event.inventory
  }
  return inventory
}

function sawRollback(expected, events, deadlineMs, readClock = eventClock) {
  if (!expected.turnRef && !Array.isArray(expected.forbidden)) return false
  const limit = expected.expectAt + deadlineMs
  let failed = false
  for (const event of events) {
    if (Array.isArray(event.taskScope) && !event.taskScope.includes(expected.taskRef)) continue
    const clock = readClock(event)
    if (clock === null || clock < expected.expectAt || clock > limit) continue
    const task = event.package.tasks.find((candidate) => candidate?.taskRef === expected.taskRef)
    const compared = compareTransition(task, expected)
    if (!task || compared === 'absent' || compared === 'coverage') continue
    const same = expected.turnRef && Array.isArray(task.codexMembers)
      ? task.codexMembers.find((candidate) => candidate.turnRef === expected.turnRef) : null
    const projected = memberProjection(task, expected.member || 'main')
    const statuses = [same?.turn, same?.phase, projected?.turn, projected?.phase, task.phase]
    const forbidden = Array.isArray(expected.forbidden) ? expected.forbidden : []
    const exactError = forbidden.some((status) => statuses.includes(status))
      || Boolean(same && ERROR_TURNS.has(same.turn))
    if (exactError) failed = true
    else if (failed && compared === 'match') return true
  }
  return false
}

function checkTransitionsAgainst(manifest, events, disconnectAfter = null) {
  const sameHost = snapshotsOf(events, manifest.hostGeneration)
  const foreign = events.some((event) => event.hostGeneration !== manifest.hostGeneration)
  const hotUpdate = manifest.hotUpdate === true
  const readClock = hotUpdate ? (event) => hotPublishedAt(event?.package) : eventClock
  const nativeEvents = new Set()
  const items = []
  const samples = []
  const lowerSamples = []
  const groupedSamples = { normal: [], disconnected: [], disconnect: [] }
  const groupedLower = { normal: [], disconnected: [], disconnect: [] }
  const stageSamples = { nativeToHost: [], hostToAdmission: [], admissionToPackage: [] }
  let timely = 0
  let missing = 0
  let timeout = 0
  let mismatched = 0
  let pending = 0
  let pendingReason = ''
  let rolledBack = 0
  let intermediate = 0
  let duplicates = 0
  let dispatchTimeouts = 0
  let outputsMatch = true
  const segmentSamples = new Map((manifest.segments || []).map((segment) => [segment.id, []]))
  const segmentReads = Object.fromEntries((manifest.segments || []).map((segment) => [segment.id, 0]))
  if (manifest.segments) {
    for (const event of sameHost) {
      const clock = eventClock(event)
      if (clock === null) continue
      for (const segment of manifest.segments) {
        if (clock >= segment.startAt && clock <= segment.endAt) segmentReads[segment.id] += 1
      }
    }
  }
  for (const expected of manifest.transitions) {
    const item = { id: expected.id, taskRef: expected.taskRef, status: 'missing', reason: 'missing', latencyMs: null }
    const identity = hotUpdate ? expected.nativeEventRef || JSON.stringify([
      expected.taskRef, expected.memberRef, expected.turnRef, expected.phase, expected.memberPhase,
      expected.turn, expected.unread, expected.memberUnread, expected.planReady, expected.continueTask
    ]) : ''
    const measured = !hotUpdate || expected.memberRef && expected.turnRef && CONNECTION_MODES.has(expected.connectionMode)
    if (measured && identity && nativeEvents.has(identity)) {
      duplicates += 1
      items.push({ ...item, status: 'duplicate', reason: 'same-native-event' })
      continue
    }
    if (measured && identity) nativeEvents.add(identity)
    if (!measured) {
      if (hotUpdate && dispatchTimedOut(events, manifest.hostGeneration, expected)) {
        item.status = 'dispatch-timeout'
        item.reason = 'dispatch-timeout'
      } else {
        item.status = 'pending'
        item.reason = 'evidence-unverified'
      }
    } else if (!sameHost.length) {
      if (hotUpdate && dispatchTimedOut(events, manifest.hostGeneration, expected)) {
        item.status = 'dispatch-timeout'
        item.reason = 'dispatch-timeout'
      } else if (foreign) {
        item.status = 'pending'
        item.reason = 'host-changed'
      } else if (inventoryGap(latestInventory(events, manifest.hostGeneration, expected))) {
        item.status = 'pending'
        item.reason = 'coverage-insufficient'
      }
    } else {
      let matched = null
      let sawMismatch = false
      let sawWrongPackage = false
      let sawUnavailable = false
      let sawCoverage = false
      let baseline = null
      let previousSignature = null
      let previousForbidden = false
      for (const event of sameHost) {
        if (Array.isArray(event.taskScope) && !event.taskScope.includes(expected.taskRef)) {
          sawCoverage = true
          continue
        }
        const clock = readClock(event)
        const task = event.package.tasks.find((candidate) => candidate?.taskRef === expected.taskRef)
        if (clock !== null && clock < expected.expectAt) {
          if (hotUpdate) {
            baseline = event
            previousSignature = targetSignature(task, expected)
            previousForbidden = forbiddenHit(task, expected)
          }
          continue
        }
        if (hotUpdate && !clock) continue
        const compared = compareTransition(task, expected)
        if (compared === 'match') { matched = { event, task }; break }
        if (hotUpdate) {
          const signature = targetSignature(task, expected)
          const forbiddenNow = forbiddenHit(task, expected)
          if ((signature !== previousSignature && compared === 'mismatch') || (forbiddenNow && !previousForbidden)) {
            sawMismatch = true
            sawWrongPackage = true
          }
          previousSignature = signature
          previousForbidden = forbiddenNow
        } else if (compared === 'mismatch') {
          sawMismatch = true
          sawWrongPackage = true
        }
        if (compared === 'unavailable') sawUnavailable = true
        if (compared === 'coverage') sawCoverage = true
      }
      const before = baseline?.package.tasks.find((task) => task?.taskRef === expected.taskRef)
      if (hotUpdate && (!baseline || compareTransition(before, expected) === 'match')) {
        item.status = 'pending'
        item.reason = 'transition-baseline-unverified'
      } else if (!matched) {
        if (hotUpdate && !sawMismatch && dispatchTimedOut(events, manifest.hostGeneration, expected)) {
          item.status = 'dispatch-timeout'
          item.reason = 'dispatch-timeout'
        } else if (sawMismatch) {
          item.status = 'mismatch'
          item.reason = 'field-mismatch'
        } else if (sawCoverage || inventoryGap(latestInventory(events, manifest.hostGeneration, expected))) {
          item.status = 'pending'
          item.reason = 'coverage-insufficient'
        } else if (sawUnavailable) {
          item.status = 'pending'
          item.reason = 'field-unavailable'
        }
      } else {
        if (sawWrongPackage) { item.intermediate = true; intermediate += 1 }
        const evidence = segmentProof(events, manifest.hostGeneration, expected, hotUpdate ? matched.event : null)
        if (evidence === 'timeout') {
          item.status = 'dispatch-timeout'
          item.reason = 'dispatch-timeout'
        } else if (evidence === 'mismatch') {
          item.status = 'mismatch'
          item.reason = 'field-mismatch'
        } else if (evidence === 'unverified') {
          item.status = 'pending'
          item.reason = 'evidence-unverified'
        } else {
        const observedAt = readClock(matched.event)
        const latency = elapsedMs(expected.expectAt, observedAt)
        if (latency === null) {
          item.status = 'pending'
          item.reason = 'time-unavailable'
        } else {
          const deadline = safeCount(expected.deadlineMs) ? expected.deadlineMs : manifest.deadlineMs
          const latencyMin = Math.max(0, latency - ((expected.expectAtPrecisionMs || 1) - 1))
          const member = memberProjection(matched.task, expected.member || 'main')
          const currentPhase = member && typeof member.phase === 'string' ? member.phase : matched.task.phase
          if (matched.task.phase !== currentPhase) outputsMatch = false
          item.latencyMs = latency
          if (hotUpdate) item.packageRevision = matched.event.package.packageRevision
          if (latencyMin !== latency) item.latencyRangeMs = [latencyMin, latency]
          samples.push(latency)
          lowerSamples.push(latencyMin)
          const sampleGroup = hotUpdate ? expected.connectionMode
            : safeCount(disconnectAfter) && matched.event.sequence > disconnectAfter ? 'disconnect' : 'normal'
          groupedSamples[sampleGroup].push(latency)
          groupedLower[sampleGroup].push(latencyMin)
          item.stagesMs = {
            nativeToHost: elapsedMs(expected.expectAt, expected.hostReceivedAt),
            hostToAdmission: elapsedMs(expected.hostReceivedAt, expected.admittedAt),
            admissionToPackage: elapsedMs(expected.admittedAt, observedAt)
          }
          for (const [stage, duration] of Object.entries(item.stagesMs)) {
            if (duration !== null) stageSamples[stage].push(duration)
          }
          const named = manifest.segments?.find((segment) => segment.id === expected.segment)
          if (named && observedAt >= named.startAt && observedAt <= named.endAt) segmentSamples.get(named.id)?.push(latency)
          else if (!expected.segment && manifest.segments) {
            for (const segment of manifest.segments) {
              if (observedAt >= segment.startAt && observedAt <= segment.endAt) segmentSamples.get(segment.id).push(latency)
            }
          }
          if (latencyMin > deadline) {
            item.status = 'timeout'
            item.reason = 'timeout'
          } else if (latency > deadline) {
            item.status = 'pending'
            item.reason = 'time-precision'
          } else {
            item.status = 'timely'
            item.reason = 'ok'
          }
        }
        }
      }
    }
    const deadline = safeCount(expected.deadlineMs) ? expected.deadlineMs : manifest.deadlineMs
    if (sawRollback(expected, sameHost, deadline, readClock)) {
      item.rollback = true
      if (item.status === 'timely') {
        item.status = 'rollback'
        item.reason = 'rollback'
      }
    }
    if (item.status === 'timely') timely += 1
    else if (item.status === 'timeout') timeout += 1
    else if (item.status === 'dispatch-timeout') dispatchTimeouts += 1
    else if (item.status === 'missing') missing += 1
    else if (item.status === 'mismatch') mismatched += 1
    else if (item.status === 'rollback') rolledBack += 1
    else {
      pending += 1
      pendingReason ||= item.reason
    }
    items.push(item)
  }
  const scoredSamples = !hotUpdate && safeCount(disconnectAfter) ? groupedSamples.normal : samples
  const scoredLower = !hotUpdate && safeCount(disconnectAfter) ? groupedLower.normal : lowerSamples
  const groupStatus = (values, lowers, limit = manifest.sloP95Ms) => {
    const upper = percentile(values)
    const lower = percentile(lowers)
    if (!values.length) return { observed: 0, p95Ms: null, status: hotUpdate ? 'insufficient' : 'absent' }
    const status = !safeCount(limit) ? 'pass'
      : lower !== null && lower > limit ? 'fail'
      : values.length < SLO_MIN_SAMPLES ? 'insufficient'
      : upper > limit ? 'time-precision' : 'pass'
    return { observed: values.length, p95Ms: upper, ...(lower !== upper ? { p95LowerMs: lower } : {}), status }
  }
  const groups = hotUpdate ? Object.fromEntries(Object.entries(HOT_UPDATE_LIMITS_MS).map(([mode, limitMs]) => [
    mode, { limitMs, minimum: SLO_MIN_SAMPLES, ...groupStatus(groupedSamples[mode], groupedLower[mode], limitMs) }
  ])) : safeCount(disconnectAfter) ? {
    normal: groupStatus(groupedSamples.normal, groupedLower.normal),
    disconnect: groupStatus(groupedSamples.disconnect, groupedLower.disconnect)
  } : null
  const p95Ms = percentile(scoredSamples)
  const p95LowerMs = percentile(scoredLower)
  const hotStatus = hotUpdate && ['fail', 'insufficient', 'time-precision', 'pass']
    .find((status) => Object.values(groups).some(group => group.status === status))
  const slo = !hotUpdate && safeCount(manifest.sloP95Ms) && manifest.sloP95Ms > 0 ? {
    limitMs: manifest.sloP95Ms, p95Ms, observed: scoredSamples.length, minimum: SLO_MIN_SAMPLES,
    ...(p95LowerMs !== p95Ms ? { p95LowerMs } : {}),
    status: groups
      ? ['fail', 'insufficient', 'time-precision', 'pass'].find((status) => status === groups.normal.status || status === groups.disconnect.status) || 'pass'
      : p95LowerMs !== null && p95LowerMs > manifest.sloP95Ms ? 'fail'
      : scoredSamples.length < SLO_MIN_SAMPLES ? 'insufficient' : p95Ms > manifest.sloP95Ms ? 'time-precision' : 'pass'
  } : null
  let status = 'pass'
  let reason = 'ok'
  if (mismatched) { status = 'mismatch'; reason = 'field-mismatch' }
  else if (rolledBack) { status = 'fail'; reason = 'rollback' }
  else if (hotUpdate && intermediate) { status = 'fail'; reason = 'intermediate-error' }
  else if (dispatchTimeouts) { status = 'fail'; reason = 'dispatch-timeout' }
  else if (timeout) { status = 'fail'; reason = 'timeout' }
  else if (missing) { status = 'fail'; reason = 'missing' }
  else if (pending) { status = 'pending'; reason = pendingReason }
  else if ((hotStatus || slo?.status) === 'fail') { status = 'fail'; reason = 'slo' }
  else if ((hotStatus || slo?.status) === 'insufficient') { status = 'pending'; reason = 'slo-insufficient' }
  else if ((hotStatus || slo?.status) === 'time-precision') { status = 'pending'; reason = 'time-precision' }
  return {
    status, reason, expected: manifest.transitions.length, timely, missing, timeout, mismatched, pending, rolledBack,
    observed: scoredSamples.length, p95Ms, p50Ms: percentile(scoredSamples, 0.5), maxMs: scoredSamples.length ? Math.max(...scoredSamples) : null,
    outputsMatch, items,
    ...(hotUpdate ? { duplicates, intermediate } : {}),
    ...(dispatchTimeouts ? { dispatchTimeouts } : {}),
    ...(slo ? { slo } : {}),
    ...(groups ? { groups } : {}),
    ...(manifest.segments ? { segments: manifest.segments.map((segment) => {
      const values = segmentSamples.get(segment.id) || []
      return { id: segment.id, reads: segmentReads[segment.id], observed: values.length, p95Ms: percentile(values),
        p50Ms: percentile(values, 0.5), maxMs: values.length ? Math.max(...values) : null }
    }) } : {}),
    stages: Object.fromEntries(Object.entries(stageSamples).map(([stage, values]) => [
      stage, { observed: values.length, p95Ms: percentile(values) }
    ]))
  }
}

function packageMatchesSurface(event, surface, expected) {
  const taskPackage = event?.package
  if (!taskPackage || !Array.isArray(taskPackage.tasks)) return false
  if (surface === 'main') {
    const counts = taskPackage.views?.counts
    return !!counts && BADGES.every((key) => counts[key] === expected.counts[key])
  }
  return expected.rows.every((row) => {
    const task = taskPackage.tasks.find((candidate) => candidate?.taskRef === row.taskRef)
    return !!task && task.phase === row.phase
  })
}

function firstCorrectPackage(events, host, revision, surface, expected) {
  const revisions = snapshotsOf(events, host).filter((event) => event.package.packageRevision === revision)
  let intermediate = false
  for (const event of revisions) {
    if (packageMatchesSurface(event, surface, expected)) return { event, intermediate }
    intermediate = true
  }
  return { event: revisions[0] || null, intermediate }
}

function checkSurface(manifest, events, surface) {
  const presentation = manifest.presentation
  const expected = presentation?.[surface]
  if (!expected) return null
  const revision = presentation.packageRevision
  const correct = firstCorrectPackage(events, manifest.hostGeneration, revision, surface, expected)
  const receipts = receiptItems(events)
  const currentWindow = correct.event?.consumerWindowGenerations?.[surface]
  if (safeCount(currentWindow) && currentWindow > 0 && currentWindow !== expected.windowGeneration) {
    return { status: 'pending', reason: 'window-changed', applied: false, visible: false, ...(correct.intermediate ? { intermediate: true } : {}) }
  }
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
  const selected = correct.event
  if (!selected) return { ...stages, status: 'pending', reason: 'package-missing', ...(correct.intermediate ? { intermediate: true } : {}) }
  const presentations = windowed.filter((item) => item.receipt.kind === 'presentation')
  const latestPresentation = latestItem(presentations)
  const timeOf = (kind, outcome) => latestItem(windowed.filter(({ receipt }) =>
    receipt.kind === kind && receipt.outcome === outcome))?.receipt.observedAt
  const published = publishedClock(selected.package)
  stages.receivedMs = elapsedMs(published, timeOf('delivery', 'received'))
  stages.appliedMs = elapsedMs(published, timeOf('delivery', 'applied'))
  const hiding = latestPresentation && NON_VISIBLE.has(latestPresentation.receipt.outcome) ? latestPresentation : null
  if (surface === 'main') {
    if (hiding) return { ...stages, status: 'pending', reason: hiding.receipt.outcome }
    const visiblePresentation = latestPresentation?.receipt.outcome === 'visible' ? latestPresentation : null
    if (!visiblePresentation) {
      const delivery = latestItem(windowed.filter((item) => item.receipt.kind === 'delivery'))
      return { ...stages, status: 'pending', reason: delivery?.receipt.outcome === 'received' ? 'received' : delivery ? 'applied' : 'not-visible' }
    }
    const main = { ...stages, visibleMs: elapsedMs(published, visiblePresentation.receipt.observedAt),
      ...compareMain(visiblePresentation.receipt, selected.package, expected.counts),
      ...(correct.intermediate ? { intermediate: true } : {}) }
    return applyButton(main, visiblePresentation.receipt, expected.continueTask)
  }
  if (hiding && ['hidden', 'folded'].includes(hiding.receipt.outcome)) {
    return { ...stages, status: 'pending', reason: hiding.receipt.outcome, visible: false, ...(correct.intermediate ? { intermediate: true } : {}) }
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
      rowTimes.push(elapsedMs(published, latestRow.receipt.observedAt))
    }
  }
  const intermediate = correct.intermediate ? { intermediate: true } : {}
  return rowStatus === 'pass'
    ? { ...stages, visibleMs: rowTimes.every(value => value !== null) ? Math.max(...rowTimes) : null, ...intermediate }
    : { ...stages, status: 'pending', reason: rowReason, ...intermediate }
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
  if (typeof expected.continueTask === 'boolean') {
    if (typeof receipt.continueTask !== 'boolean') return 'field-unavailable'
    if (typeof task.continueTask !== 'boolean') return 'field-unavailable'
    if (receipt.continueTask !== expected.continueTask || task.continueTask !== expected.continueTask) return 'mismatch'
    if (typeof task.continueDispatchAllowed === 'boolean' && task.continueDispatchAllowed !== expected.continueTask) return 'mismatch'
  }
  return 'match'
}

function applyButton(result, receipt, expected) {
  if (typeof expected !== 'boolean') return result
  if (typeof receipt?.continueTask !== 'boolean') return { ...result, status: 'pending', reason: 'button-unavailable', button: 'unavailable' }
  if (receipt.continueTask !== expected) return { ...result, status: 'mismatch', reason: 'field-mismatch', button: 'mismatch' }
  return { ...result, button: 'match' }
}

function observationCounts(manifest, events) {
  const snapshots = snapshotsOf(events, manifest.hostGeneration)
  return {
    snapshots: snapshots.length,
    receipts: receiptItems(events).filter((item) => item.hostGeneration === manifest.hostGeneration).length,
    inventory: events.filter((event) => event.hostGeneration === manifest.hostGeneration && event.inventory
      && (event.type === 'snapshot' || event.type === 'inventory')).length
  }
}

function positiveClock(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function projectSampleMember(member) {
  if (!member || typeof member !== 'object' || Array.isArray(member)) return null
  const memberRef = REF.test(member.memberRef) ? member.memberRef : ''
  const taskRef = REF.test(member.taskRef) ? member.taskRef : ''
  if (!memberRef && !taskRef) return null
  const statusRequestedAt = positiveClock(member.statusRequestedAt)
  const statusReceivedAt = positiveClock(member.statusReceivedAt)
  const paired = statusRequestedAt !== null && statusReceivedAt !== null && statusReceivedAt >= statusRequestedAt
  return {
    ...(memberRef ? { memberRef } : {}),
    ...(taskRef ? { taskRef } : {}),
    ...(REF.test(member.turnRef) ? { turnRef: member.turnRef } : {}),
    ...(paired ? { statusRequestedAt, statusReceivedAt } : {}),
    ...(CONNECTION_MODES.has(member.connectionMode) ? { connectionMode: member.connectionMode } : {})
  }
}

function targetedSamples(inventory) {
  const raw = []
  if (Array.isArray(inventory?.segments)) raw.push(...inventory.segments)
  if (inventory?.latest && typeof inventory.latest === 'object') raw.push(inventory.latest)
  return raw.filter((sample) => sample?.segment === 'targeted' || sample?.segment === 'targeted-dispatch')
}

const LIVE_REASONS = new Set(['stream-evidence', 'rollout-evidence'])

function hotEvidenceSamples(inventory) {
  const value = inventory?.hotUpdateEvidence
  const raw = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []
  return raw.filter((sample) => sample && typeof sample === 'object' && !Array.isArray(sample)
    && sample.segment === 'targeted' && LIVE_REASONS.has(sample.reason))
}

function connectionSinceCounts(member, expected, packageEvent) {
  if (!packageEvent || !member || !Object.hasOwn(member, 'connectionSince')) return true
  const since = positiveClock(member.connectionSince)
  return since !== null && since <= expected.expectAt
}

function modeEvidenceCounts(sample, member, packageEvent, expected) {
  const publishedAt = hotPublishedAt(packageEvent?.package)
  if (publishedAt === null) return false
  const expectAt = expected.expectAt
  if (LIVE_REASONS.has(sample?.reason)) {
    const emittedAt = positiveClock(sample.emittedAt)
    const sourceMode = sample.reason === 'stream-evidence' ? 'normal' : 'disconnected'
    return member?.connectionMode === sourceMode && emittedAt !== null && emittedAt >= expectAt && emittedAt <= publishedAt
  }
  const receivedAt = positiveClock(member?.statusReceivedAt)
  if (receivedAt !== null) return receivedAt >= expectAt && receivedAt <= publishedAt
  const revision = Number.isSafeInteger(sample?.packageRevision) && sample.packageRevision >= 0 ? sample.packageRevision : null
  const observed = positiveClock(sample?.observedAt)
  return revision !== null && revision === packageEvent.package.packageRevision
    && observed !== null && observed >= expectAt && observed <= publishedAt
}

function expectsDispatch(expected) {
  return expected.queuedAt !== undefined || expected.requestedAt !== undefined
}

function dispatchTimedOut(events, host, expected) {
  return expectsDispatch(expected) && segmentProof(events, host, expected, null) === 'timeout'
}

function boundTarget(sample, expected) {
  const dispatch = sample?.segment === 'targeted-dispatch'
    || sample?.segment === 'targeted' && sample.reason === 'targeted-dispatch'
  if (sample?.segment !== 'targeted' && !dispatch) return null
  if (REF.test(sample.taskRef) && sample.taskRef !== expected.taskRef) return null
  const listed = (Array.isArray(sample.members) ? sample.members : []).map(projectSampleMember).filter(Boolean)
  const members = listed.filter((member) => {
    if (expected.memberRef && member.memberRef !== expected.memberRef) return false
    if (!expected.memberRef && member.taskRef && member.taskRef !== expected.taskRef) return false
    if (!dispatch && expected.turnRef && member.turnRef !== expected.turnRef) return false
    return true
  })
  if (listed.length && !members.length) return null
  if (!REF.test(sample.taskRef) && !members.length) return null
  if (dispatch && (!members.length || (expected.queuedAt !== undefined && positiveClock(sample.queuedAt) !== expected.queuedAt))) return null
  return { members }
}

function preferProof(current, next) {
  if (current === 'timeout' || next === 'timeout') return 'timeout'
  if (current === 'match' || next === 'match') return 'match'
  if (current === 'mismatch' || next === 'mismatch') return 'mismatch'
  return 'unverified'
}

function clockProof(member, expected) {
  if (!positiveClock(member.statusRequestedAt) || !positiveClock(member.statusReceivedAt)
    || member.statusReceivedAt < member.statusRequestedAt) return 'unverified'
  if (expected.statusRequestedAt !== undefined && member.statusRequestedAt !== expected.statusRequestedAt) return 'mismatch'
  if (expected.statusReceivedAt !== undefined && member.statusReceivedAt !== expected.statusReceivedAt) return 'mismatch'
  return 'match'
}

function dispatchProof(sample, expected) {
  const queuedAt = positiveClock(sample.queuedAt)
  const requestedAt = positiveClock(sample.requestedAt)
  const requestedOk = requestedAt !== null && (queuedAt === null || requestedAt >= queuedAt)
  if (expected.queuedAt !== undefined && queuedAt !== expected.queuedAt) return queuedAt === null ? 'unverified' : 'mismatch'
  if (queuedAt !== null && (requestedOk && requestedAt - queuedAt > TARGETED_DISPATCH_LIMIT_MS
    || !requestedOk && sample.readCount === 0 && sample.durationMs >= TARGETED_DISPATCH_LIMIT_MS)) return 'timeout'
  if (expected.requestedAt !== undefined && (!requestedOk || requestedAt !== expected.requestedAt)) return requestedOk ? 'mismatch' : 'unverified'
  if (expected.queuedAt !== undefined && !requestedOk) return 'unverified'
  return 'match'
}

function segmentProof(events, host, expected, packageEvent = null) {
  const wantsMode = expected.connectionMode !== undefined
  const wantsClock = expected.statusRequestedAt !== undefined || expected.statusReceivedAt !== undefined
  const wantsDispatch = expected.queuedAt !== undefined || expected.requestedAt !== undefined
  if (!wantsMode && !wantsClock && !wantsDispatch) return 'skip'
  let mode = 'unverified'
  let clocks = 'unverified'
  let dispatch = 'unverified'
  let sawTargeted = false
  const sameMember = (member, item) => item.memberRef === member.memberRef && item.turnRef === member.turnRef && item.taskRef === member.taskRef
  const consider = (sample, live) => {
    const bound = boundTarget(sample, expected)
    if (!bound) return
    sawTargeted = true
    if (wantsDispatch && !live) dispatch = preferProof(dispatch, dispatchProof(sample, expected))
    for (const raw of Array.isArray(sample.members) ? sample.members : []) {
      const member = projectSampleMember(raw)
      if (!member || !bound.members.some((item) => sameMember(member, item))) continue
      if (wantsMode && (!packageEvent || modeEvidenceCounts(sample, raw, packageEvent, expected) && connectionSinceCounts(raw, expected, packageEvent))) {
        mode = preferProof(mode, member.connectionMode === undefined ? 'unverified' : member.connectionMode === expected.connectionMode ? 'match' : 'mismatch')
      }
      if (wantsClock && !live) clocks = preferProof(clocks, clockProof(member, expected))
    }
  }
  for (const event of events) {
    if (event.hostGeneration !== host || (event.type !== 'snapshot' && event.type !== 'inventory') || !event.inventory) continue
    const clock = eventClock(event)
    if (clock === null || clock >= expected.expectAt) {
      for (const sample of targetedSamples(event.inventory)) consider(sample, false)
    }
    if (!packageEvent) continue
    for (const sample of hotEvidenceSamples(event.inventory)) {
      const emittedAt = positiveClock(sample.emittedAt)
      if (emittedAt === null || emittedAt < expected.expectAt) continue
      consider(sample, true)
    }
  }
  if (!sawTargeted) return 'unverified'
  const parts = [wantsMode ? mode : 'match', wantsClock ? clocks : 'match', wantsDispatch ? dispatch : 'match']
  if (parts.includes('timeout')) return 'timeout'
  if (parts.includes('mismatch')) return 'mismatch'
  if (parts.includes('unverified')) return 'unverified'
  return 'match'
}

function targetedSummary(inventory) {
  const sample = [...targetedSamples(inventory)].reverse()[0]
  if (!sample) return null
  const queuedAt = positiveClock(sample.queuedAt)
  const requestedAt = positiveClock(sample.requestedAt)
  const requestedOk = requestedAt !== null && (queuedAt === null || requestedAt >= queuedAt)
  const members = (Array.isArray(sample.members) ? sample.members : []).slice(0, 32).map(projectSampleMember).filter(Boolean)
  const view = {
    ...(queuedAt !== null ? { queuedAt } : {}),
    ...(requestedOk ? { requestedAt } : {}),
    ...(members.length ? { members } : {})
  }
  return Object.keys(view).length ? view : { unverified: true }
}

function inventorySummary(events, host) {
  const latest = [...events].reverse().find((event) => event.hostGeneration === host && event.inventory
    && (event.type === 'snapshot' || event.type === 'inventory'))
  if (!latest) return null
  const sample = latest.inventory.latest && typeof latest.inventory.latest === 'object' ? latest.inventory.latest : {}
  const targeted = targetedSummary(latest.inventory)
  return {
    firstReadbackAt: safeCount(latest.inventory.firstReadbackAt) ? latest.inventory.firstReadbackAt : 0,
    readCount: safeCount(sample.readCount) ? sample.readCount : null,
    totalCount: safeCount(sample.totalCount) ? sample.totalCount : null,
    coverage: typeof sample.coverage === 'string' ? sample.coverage : 'unknown',
    ...(typeof sample.stage === 'string' ? { stage: sample.stage } : {}),
    ...(safeCount(sample.durationMs) ? { durationMs: sample.durationMs } : {}),
    ...(typeof sample.disposition === 'string' ? { disposition: sample.disposition } : {}),
    ...(typeof sample.reason === 'string' ? { reason: sample.reason } : {}),
    ...(safeCount(sample.sourceGeneration) ? { sourceGeneration: sample.sourceGeneration } : {}),
    ...(safeCount(sample.readGeneration) ? { readGeneration: sample.readGeneration } : {}),
    ...(sample.listReads && ['activity', 'archive', 'index'].every(key => safeCount(sample.listReads[key]))
      ? { listReads: { activity: sample.listReads.activity, archive: sample.listReads.archive, index: sample.listReads.index } } : {}),
    ...(REF.test(sample.taskRef) ? { taskRef: sample.taskRef } : {}),
    ...(TURNS.has(sample.turn) ? { turn: sample.turn } : {}),
    ...(targeted ? { targeted } : {})
  }
}

function evaluateTransitions(manifest, events, disconnectAfter = null) {
  const unique = dedupeEvents(events)
  const transitions = manifest.transitions.length || manifest.hotUpdate ? checkTransitionsAgainst(manifest, unique, disconnectAfter) : {
    status: 'pass', reason: 'ok', expected: 0, timely: 0, missing: 0, timeout: 0, mismatched: 0, pending: 0,
    observed: 0, p95Ms: null, outputsMatch: true, items: []
  }
  const display = manifest.presentation ? {
    ...(manifest.presentation.main ? { main: checkSurface(manifest, unique, 'main') } : {}),
    ...(manifest.presentation.float ? { float: checkSurface(manifest, unique, 'float') } : {})
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
    ...(transitions.dispatchTimeouts ? { dispatchTimeouts: transitions.dispatchTimeouts } : {}),
    mismatched: transitions.mismatched,
    pending: transitions.pending,
    ...(manifest.hotUpdate ? { duplicates: transitions.duplicates || 0, intermediate: transitions.intermediate || 0 } : {}),
    observed: transitions.observed,
    p95Ms: transitions.p95Ms,
    p50Ms: transitions.p50Ms ?? null,
    maxMs: transitions.maxMs ?? null,
    reads: observationCounts(manifest, unique),
    capture: { deadlineMs: manifest.deadlineMs, exceeded: transitions.timeout },
    ...(transitions.slo ? { slo: transitions.slo } : {}),
    ...(transitions.groups ? { groups: transitions.groups } : {}),
    ...(transitions.segments ? { segments: transitions.segments } : {}),
    ...(inventorySummary(unique, manifest.hostGeneration) ? { inventory: inventorySummary(unique, manifest.hostGeneration) } : {}),
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
    mismatched: 0, pending: manifest.transitions.length, observed: 0, p95Ms: null, outputsMatch: true,
    reads: { snapshots: 0, receipts: 0, inventory: 0 },
    capture: { deadlineMs: manifest.deadlineMs, exceeded: 0 },
    items: manifest.transitions.map((transition) => ({
      id: transition.id, taskRef: transition.taskRef, status: 'pending', reason: pendingReason, latencyMs: null
    }))
  }
}

async function main() {
  if (args.includes('--help')) {
    process.stdout.write('Usage: node scripts/read-eypc-task-state.mjs [--watch] [--summary] [--dir=<endpoint-directory>]\n'
      + '       node scripts/read-eypc-task-state.mjs --watch --task-refs=<ref[,ref...]> [--dir=<endpoint-directory>]\n'
      + '       node scripts/read-eypc-task-state.mjs --check-version [--dir=<endpoint-directory>]\n'
      + '       node scripts/read-eypc-task-state.mjs --check-transitions --expect=<manifest.json> [--replay=<events.ndjson>] [--dir=<endpoint-directory>]\n')
    return
  }
  if (args.some((arg) => !knownArg(arg))) {
    process.stderr.write('Unknown option. Use --help.\n')
    process.exitCode = 2
    return
  }
  if (taskRefs && (!watch || summary || checkVersion || checkTransitions || taskRefs.size > MAX_TRANSITIONS
    || [...taskRefs].some(ref => !REF.test(ref)))) {
    usageError('Use --task-refs with --watch and anonymous task references.')
    return
  }
  if (checkVersion && (watch || summary || checkTransitions || expectFile || replayFile)) {
    usageError('Use --check-version with optional --dir only.')
    return
  }
  if (checkTransitions && (watch || summary) || checkTransitions !== Boolean(expectFile) || Boolean(replayFile) !== checkTransitions && Boolean(replayFile)) {
    usageError('Use --check-transitions only with --expect and optional --replay or --dir.')
    return
  }
  const readEndpoint = () => readTaskStateEndpoint(directory ? resolve(directory) : undefined)
  if (checkVersion) {
    const result = await checkLoadedVersion(readEndpoint)
    await write(result)
    if (!['match', 'same-content'].includes(result.status)) process.exitCode = 1
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
        ? pendingCheck(manifest, replay.unavailable) : evaluateTransitions(manifest, replay.events, replay.disconnectAfter)
      await write(result)
      if (result.verdict !== 'pass') process.exitCode = 1
      return
    }
    const { event, reason } = await readSnapshot(readEndpoint)
    const result = event ? evaluateTransitions(manifest, [event]) : pendingCheck(manifest, reason)
    await write(result)
    if (result.verdict !== 'pass') process.exitCode = 1
    return
  }
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
          await write(summary ? summarize(event) : projectWatchSnapshot(event))
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
