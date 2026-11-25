'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { isKnownTaskPhase, isManualTaskPhase } = require('../task-phase.cjs')

const SCHEMA = 'eypc-task-state-v1'
const HOST = '127.0.0.1'
const SNAPSHOT_PATH = '/v1/task-state'
const WATCH_PATH = `${SNAPSHOT_PATH}/watch`
const DESCRIPTOR = 'host.json'
const REF = /^h:[a-f0-9]{16}$/
const HEARTBEAT_MS = 1_000
const MAX_WATCHERS = 8
const MAX_RECENT_ROWS = 128
const MAX_QUEUED_BYTES = 2 * 1024 * 1024
const RECEIPT_EVENTS = {
  'main-task-package-ack': ['main', 'delivery'],
  'main-task-presented': ['main', 'presentation'],
  'task-package-ack': ['float', 'delivery'],
  'float-task-presented': ['float', 'row']
}
const PIN_AUTHORITIES = new Set(['app-server', 'codexhost', 'claude-metadata', 'cursor-workspace', 'orca-tab', 'legacy-mirror'])
const PIN_SOURCES = new Set(['none', 'local', 'native'])
const ROW_GROUPS = new Set(['pinned', 'input', 'active', 'unknown', 'stopped', 'unread', 'completed'])
const MEMBER_TURNS = new Set(['not-started', 'turn-running', 'turn-completed', 'turn-interrupted', 'turn-failed', 'unknown'])
const MEMBER_GOALS = new Set(['', 'unknown', 'none', 'active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete'])
const MEMBER_THREADS = new Set(['unknown', 'active', 'idle', 'notLoaded', 'systemError'])
const ANONYMOUS_REF = /^h:[a-f0-9]{16}$/

const taskStateDirectory = () => path.join(os.homedir(), '.eypc', 'task-state')
const isPrivate = (stat) => typeof process.getuid !== 'function'
  || stat.uid === process.getuid() && (stat.mode & 0o077) === 0
const revision = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0
const phase = (value) => isKnownTaskPhase(value) ? value : null
const freshness = (value) => value === 'fresh' ? 'fresh' : 'verifying'
const pinAuthority = (value) => PIN_AUTHORITIES.has(value) ? value : ''
const pinSourceValue = (value) => PIN_SOURCES.has(value) ? value : null
const BADGE_COUNTS = ['active', 'input', 'unread']
const badgeCounts = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const result = {}
  for (const key of BADGE_COUNTS) {
    if (!Object.hasOwn(value, key)) continue
    const count = value[key]
    if (Number.isSafeInteger(count) && count >= 0) result[key] = count
  }
  return Object.keys(result).length ? result : null
}
const memberStatus = (value) => {
  if (!value || typeof value !== 'object') return null
  return {
    phase: phase(value.phase),
    turn: MEMBER_TURNS.has(value.turn) ? value.turn : 'unknown',
    goal: MEMBER_GOALS.has(value.goal) ? value.goal : '',
    threadStatus: MEMBER_THREADS.has(value.threadStatus) ? value.threadStatus : 'unknown'
  }
}
const codexEnums = (value) => {
  const main = memberStatus(value?.main)
  if (!main) return null
  const sides = Array.isArray(value.sides) ? value.sides.map(memberStatus).filter(Boolean).slice(0, 8) : []
  return sides.length ? { main, sides } : { main }
}
const pinTotals = (tasks, pinnedKeys) => {
  const totals = { native: 0, local: 0, group: Array.isArray(pinnedKeys) ? pinnedKeys.length : 0 }
  for (const task of tasks) {
    if (task?.role === 'child') continue
    if (task?.localPin === true) totals.local += 1
    if (task?.providerPin === true) totals.native += 1
  }
  return totals
}

function readTaskStateEndpoint(directory = taskStateDirectory()) {
  let descriptor
  try {
    const parent = fs.lstatSync(directory)
    if (!parent.isDirectory() || !isPrivate(parent)) return null
    descriptor = fs.openSync(path.join(directory, DESCRIPTOR),
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0))
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile() || !isPrivate(stat) || stat.size > 1024) return null
    const endpoint = JSON.parse(fs.readFileSync(descriptor, 'utf8'))
    return endpoint.schema === SCHEMA && /^[a-f0-9]{32}$/.test(endpoint.hostGeneration)
      && /^[a-f0-9]{64}$/.test(endpoint.token)
      && Number.isInteger(endpoint.port) && endpoint.port > 0 && endpoint.port <= 65535 ? endpoint : null
  } catch {
    return null
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
}

function projectPackage(value, taskRef, membersByRoot) {
  const refs = new Map()
  const tasks = value.tasks.map((task) => {
    const ref = taskRef(task.provider, task.key)
    refs.set(task.key, ref)
    const codex = codexEnums(task.codexStatus)
    const members = membersByRoot?.get(task.key)
    const providerPinFreshness = task.providerPinFreshness === 'fresh' || task.providerPinFreshness === 'verifying'
      ? task.providerPinFreshness : ''
    const manualPhase = isManualTaskPhase(task.manualPhase) ? task.manualPhase : ''
    return {
      taskRef: ref,
      provider: task.provider,
      phase: phase(task.phase),
      ...(manualPhase ? { manualPhase } : {}),
      ...(typeof task.capabilities?.continueTask === 'boolean' ? { continueTask: task.capabilities.continueTask } : {}),
      semanticRevision: revision(task.semanticRevision),
      turnStartedAt: revision(task.turnStartedAt),
      terminalAt: revision(task.terminalAt),
      freshness: freshness(task.freshness),
      unread: task.unreadKnown ? task.unread === true : null,
      completedUnread: typeof task.completedUnread === 'boolean' ? task.completedUnread : null,
      planReady: task.planReady === true,
      hidden: task.hidden === true,
      paused: task.paused === true,
      localPin: task.localPin === true,
      providerPin: task.providerPin === true ? true : task.providerPin === false ? false : null,
      providerPinOrder: revision(task.providerPinOrder),
      providerPinAuthority: pinAuthority(task.providerPinAuthority),
      ...(providerPinFreshness ? { providerPinFreshness } : {}),
      ...(codex ? { codex } : {}),
      ...(members ? { codexMembers: members.filter(member => ANONYMOUS_REF.test(member.memberRef)).map(member => ({
        memberRef: member.memberRef,
        ...(ANONYMOUS_REF.test(member.turnRef) ? { turnRef: member.turnRef } : {}),
        root: member.root === true,
        phase: phase(member.phase),
        turn: MEMBER_TURNS.has(member.turn) ? member.turn : 'unknown',
        turnStartedAt: revision(member.turnStartedAt),
        terminalAt: revision(member.terminalAt),
        unread: typeof member.unread === 'boolean' ? member.unread : null
      })) } : {})
    }
  })
  const references = (keys) => keys.map((key) => refs.get(key)).filter(Boolean)
  return {
    schema: value.schema,
    packageRevision: value.packageRevision,
    publishedAt: revision(value.publishedAt),
    enabled: value.enabled === true,
    complete: value.complete === true,
    freshness: freshness(value.freshness),
    providers: Object.fromEntries(Object.entries(value.providers).map(([provider, enabled]) => [
      provider, { enabled, status: value.providerHealth[provider]?.status || 'unavailable' }
    ])),
    tasks,
    views: {
      counts: { ...value.views.counts, ...pinTotals(value.tasks, value.views?.groups?.pinned) },
      groups: Object.fromEntries(Object.entries(value.views.groups).map(([group, keys]) => [group, references(keys)])),
      cycleKeys: references(value.views.cycleKeys),
      attentionKeys: {
        input: references(value.views.attentionKeys.input),
        completedUnread: references(value.views.attentionKeys.completedUnread)
      }
    }
  }
}

function presentationReceipt(event, taskRef, observedAt) {
  if (!Object.hasOwn(RECEIPT_EVENTS, event.event)) return null
  const [surface, kind] = RECEIPT_EVENTS[event.event]
  const details = event.details || {}
  if (surface === 'float' && event.scope !== 'float-bridge') return null
  if (kind === 'delivery' && !['received', 'applied'].includes(event.outcome)) return null
  const packageRevision = revision(event.packageRevision)
  const windowGeneration = revision(details.windowGeneration)
  if (!packageRevision || !windowGeneration) return null
  const receipt = { surface, kind, packageRevision, windowGeneration, observedAt }
  if (kind === 'row') {
    if (!REF.test(taskRef) || !['visible', 'mismatch'].includes(event.outcome)) return null
    const observedPin = pinSourceValue(details.pinSource)
    const expectedPin = pinSourceValue(details.expectedPinSource)
    return {
      ...receipt, taskRef, outcome: event.outcome,
      phase: phase(event.phase) || phase(details.phase),
      expectedPhase: phase(details.expectedPhase),
      semanticRevision: revision(details.semanticRevision),
      ...(ROW_GROUPS.has(details.group) ? { group: details.group } : {}),
      ...(ROW_GROUPS.has(details.expectedGroup) ? { expectedGroup: details.expectedGroup } : {}),
      ...(observedPin ? { pinSource: observedPin } : {}),
      ...(expectedPin ? { expectedPinSource: expectedPin } : {}),
      ...(typeof details.pinned === 'boolean' ? { pinned: details.pinned } : {}),
      ...(typeof details.expectedPinned === 'boolean' ? { expectedPinned: details.expectedPinned } : {})
    }
  }
  if (kind === 'delivery') receipt.outcome = event.outcome
  if (['visible', 'empty', 'hidden', 'not-in-viewport', 'not-displayed', 'background', 'expanded', 'folded', 'rows-unavailable']
    .includes(details.presentation)) receipt.presentation = details.presentation
  if (kind === 'presentation') {
    receipt.outcome = ['mismatch', 'unconfirmed'].includes(event.outcome)
      ? event.outcome : receipt.presentation || 'unconfirmed'
    receipt.activeCount = Number.isSafeInteger(details.activeCount) && details.activeCount >= 0 ? details.activeCount : null
    receipt.expectedActiveCount = revision(details.expected)
    const counts = badgeCounts(details.counts)
    const expectedCounts = badgeCounts(details.expectedCounts)
    if (counts) receipt.counts = counts
    if (expectedCounts) receipt.expectedCounts = expectedCounts
  }
  return receipt
}

function startCompanionTaskStateBridge({
  kernel, artifact, sessionId, taskRef, directory = taskStateDirectory(), report = () => {}
}) {
  const startedAt = Date.now()
  const hostGeneration = crypto.randomBytes(16).toString('hex')
  const token = crypto.randomBytes(32).toString('hex')
  const credential = Buffer.from(`Bearer ${token}`)
  const watchers = new Map()
  const sockets = new Set()
  const recent = new Map()
  const recentRows = new Map()
  const windowGenerations = { main: 0, float: 0 }
  let sequence = 0
  let firstComplete = null
  let projection = null
  let heartbeat = null
  let closed = false
  let unsubscribe = () => {}
  let host = {
    sessionId,
    startedAt,
    status: 'starting',
    windowGeneration: 0,
    handshakeAt: null,
    coreVersion: artifact?.coreVersion || '',
    hostAssetId: artifact?.hostAssetId || '',
    rendererAssetId: artifact?.rendererAssetId || '',
    builtAt: artifact?.builtAt || ''
  }

  function snapshot(packageValue, runtime, first, includeReceipts = false, members) {
    const projected = projection?.packageRevision === packageValue.packageRevision
      ? projection : projectPackage(packageValue, taskRef, members ?? kernel.getCodexDiagnosticMembers?.(packageValue))
    if (!projection || packageValue.packageRevision > projection.packageRevision) projection = projected
    return {
      type: 'snapshot', host: runtime, firstComplete: first, package: projected,
      ...(includeReceipts ? { consumerWindowGenerations: { ...windowGenerations },
        consumerReceipts: [...recent.values(), ...recentRows.values()] } : {})
    }
  }

  const encode = (event, cursor) => `${JSON.stringify({ schema: SCHEMA, hostGeneration, sequence: cursor, ...event })}\n`

  function send(response, data) {
    if (response.destroyed) return
    if (response.writableLength > MAX_QUEUED_BYTES) {
      response.destroy()
      return
    }
    response.write(data)
  }

  function enqueue(buildEvent) {
    const cursor = ++sequence
    if (!watchers.size) return
    setImmediate(() => {
      if (closed) return
      let data
      for (const [response, after] of watchers) {
        if (cursor <= after) continue
        try { data ??= encode(buildEvent(), cursor) } catch (error) {
          unavailable(error)
          return
        }
        send(response, data)
      }
    })
  }

  function publish(packageValue) {
    const runtime = host
    const first = firstComplete
    const members = watchers.size && projection?.packageRevision !== packageValue.packageRevision
      ? kernel.getCodexDiagnosticMembers?.(packageValue) : null
    enqueue(() => snapshot(packageValue, runtime, first, false, members))
  }

  function recordReceipt(event, ref) {
    if (closed || !Object.hasOwn(RECEIPT_EVENTS, event.event)) return
    const receipt = presentationReceipt(event, ref, Date.now())
    if (!receipt || receipt.packageRevision > kernel.getLatest().packageRevision) return
    const { surface, kind, packageRevision, windowGeneration } = receipt
    if (windowGeneration < windowGenerations[surface]) return
    if (windowGeneration > windowGenerations[surface]) {
      windowGenerations[surface] = windowGeneration
      for (const [key, value] of recent) if (value.surface === surface) recent.delete(key)
      for (const [key, value] of recentRows) if (value.surface === surface) recentRows.delete(key)
    }
    const suffix = kind === 'delivery' ? receipt.outcome : receipt.taskRef || ''
    const key = `${surface}:${kind}:${suffix}`
    const receiptMap = kind === 'row' ? recentRows : recent
    if ((receiptMap.get(key)?.packageRevision || 0) > packageRevision) return
    receiptMap.delete(key)
    receiptMap.set(key, receipt)
    if (recentRows.size > MAX_RECENT_ROWS) recentRows.delete(recentRows.keys().next().value)
    enqueue(() => ({ type: 'receipt', receipt }))
  }

  function acknowledgeHost(status, windowGeneration) {
    if (closed) return
    host = { ...host, status, windowGeneration, handshakeAt: Date.now() }
    publish(kernel.getLatest())
  }

  const server = http.createServer({ maxHeaderSize: 4096, headersTimeout: 3000, requestTimeout: 3000 }, (request, response) => {
    if (closed || request.method !== 'GET' || ![SNAPSHOT_PATH, WATCH_PATH].includes(request.url)) {
      response.writeHead(404, { Connection: 'close' }).end()
      return
    }
    const provided = Buffer.from(request.headers.authorization || '')
    if (provided.length !== credential.length || !crypto.timingSafeEqual(provided, credential)) {
      response.writeHead(403, { Connection: 'close' }).end()
      return
    }
    const watch = request.url === WATCH_PATH
    if (watch && watchers.size >= MAX_WATCHERS) {
      response.writeHead(503, { Connection: 'close' }).end()
      return
    }
    let current
    try { current = encode(snapshot(kernel.getLatest(), host, firstComplete, true), sequence) } catch (error) {
      unavailable(error)
      return
    }
    response.on('error', () => response.destroy())
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': watch ? 'application/x-ndjson' : 'application/json',
      Connection: 'close'
    })
    if (!watch) {
      response.end(current)
      return
    }
    watchers.set(response, sequence)
    response.once('close', () => {
      watchers.delete(response)
      if (!watchers.size) {
        clearInterval(heartbeat)
        heartbeat = null
      }
    })
    send(response, current)
    if (!heartbeat) {
      heartbeat = setInterval(() => {
        const data = encode({ type: 'heartbeat' }, sequence)
        for (const watcher of watchers.keys()) send(watcher, data)
      }, HEARTBEAT_MS)
    }
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.unref()
    socket.once('close', () => sockets.delete(socket))
  })

  function close() {
    if (closed) return
    closed = true
    unsubscribe()
    clearInterval(heartbeat)
    server.close()
    for (const socket of sockets) socket.destroy()
  }

  function unavailable(error) {
    close()
    report('unavailable', error?.code || 'endpoint-unavailable')
  }

  server.on('error', unavailable)
  unsubscribe = kernel.onPackage((packageValue) => {
    if (!firstComplete && packageValue.enabled && packageValue.complete) {
      firstComplete = {
        packageRevision: packageValue.packageRevision,
        taskCount: packageValue.tasks.length,
        observedAt: Date.now()
      }
    }
    publish(packageValue)
  })
  server.listen(0, HOST, () => {
    if (closed) return
    const temporary = path.join(directory, `${hostGeneration}.tmp`)
    try {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
      const parent = fs.lstatSync(directory)
      if (!parent.isDirectory() || !isPrivate(parent)) throw new Error('invalid endpoint directory')
      fs.writeFileSync(temporary, JSON.stringify({ schema: SCHEMA, hostGeneration, port: server.address().port, token }), { mode: 0o600, flag: 'wx' })
      try { fs.renameSync(temporary, path.join(directory, DESCRIPTOR)) } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
      }
      report('listening', '')
    } catch (error) {
      unavailable(error)
    }
  })
  server.unref()
  return { close, acknowledgeHost, recordReceipt }
}

module.exports = { SCHEMA, HOST, SNAPSHOT_PATH, WATCH_PATH, readTaskStateEndpoint, startCompanionTaskStateBridge }
