'use strict'

// Resident, content-free freeze recorder. All disk work runs in a child process.
// It never obtains a directory through a synchronous uTools SDK call.
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const REVISION = 'eypc-freeze-trace-v1'
const numericKeys = new Set(['count', 'bytes', 'durationMs', 'pending', 'dropped', 'lagMs'])
function metrics(input) {
  const result = {}
  for (const key of numericKeys) {
    if (Number.isFinite(input?.[key])) result[key] = Math.max(0, input[key])
  }
  return result
}
const validOp = value => typeof value === 'string' && /^[a-z][a-z0-9.-]{0,79}$/.test(value)

function createFreezeTrace(options = {}) {
  let worker = null
  let timer = null
  let stopped = false
  let sequence = 0
  let outstanding = 0
  let dropped = 0
  let ready = false
  let status = options.enabled === false ? 'disabled' : typeof spawn === 'function' ? 'starting' : 'unsupported'
  let errorCode = ''
  const fail = (code) => {
    if (status !== 'starting' && status !== 'ready') return
    status = 'worker-error'
    errorCode = /^[A-Z0-9_]{1,64}$/.test(code || '') ? code : 'unknown'
  }
  const directory = options.directory || path.join(os.homedir(), '.eypc', 'freeze-traces')
  function stop() {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    try { if (worker?.connected) worker.send({ type: 'stop' }) } catch {}
  }
  function send(event) {
    if (stopped || !worker?.connected) return false
    if (outstanding >= 256) { dropped++; return false }
    try { worker.send(event); outstanding++; return true } catch { return false }
  }
  function begin(op, details) {
    if (!validOp(op)) return null
    const token = { id: ++sequence, op, started: performance.now() }
    return send({ type: 'begin', id: token.id, op, at: Date.now(), ...metrics(details) }) ? token : null
  }
  function end(token, details) {
    if (token) send({ type: 'end', id: token.id, op: token.op, at: Date.now(), durationMs: performance.now() - token.started, ...metrics(details) })
  }
  function run(op, action, details) {
    const token = begin(op, details)
    try {
      const value = action()
      if (value && typeof value.then === 'function') {
        value.then(() => end(token), () => end(token))
      } else end(token)
      return value
    } catch (error) { end(token); throw error }
  }
  try {
    if (status === 'starting') {
      // The uTools renderer rejects worker_threads (ERR_MISSING_PLATFORM_FOR_WORKER),
      // and a packaged plugin lives inside an asar archive no child can load by
      // path, so the writer runs as eval source under the host's own Node mode.
      const config = {
        directory, processId: process.pid,
        durationMs: Number.isFinite(options.durationMs) ? options.durationMs : null,
        intervalMs: options.intervalMs ?? 1000,
        stallMs: options.stallMs ?? 2500,
        aliveMs: options.aliveMs ?? 60_000,
        slowSpanMs: options.slowSpanMs ?? 200,
        maxBytes: options.maxBytes ?? 4 * 1024 * 1024,
        maxFiles: options.maxFiles ?? 8,
        identity: /^[a-z0-9-]{1,80}$/.test(options.identity || '') ? options.identity : 'unmeasured'
      }
      worker = spawn(process.execPath, ['-e', WRITER_SOURCE], {
        env: { ELECTRON_RUN_AS_NODE: '1', EYPC_FREEZE_TRACE_CONFIG: JSON.stringify(config) },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        windowsHide: true
      })
      worker.on('message', message => {
        if (message === 'ack') outstanding = Math.max(0, outstanding - 1)
        if (message === 'ready') { ready = true; if (status === 'starting') status = 'ready' }
        if (message?.type === 'error') { fail(message.code); stop() }
      })
      worker.on('error', error => { fail(error?.code); stop() })
      worker.on('exit', code => { if (code) fail('WORKER_EXIT'); stopped = true; clearInterval(timer) })
      worker.unref()
      worker.channel?.unref?.()
      timer = setInterval(() => send({ type: 'pulse', at: Date.now(), dropped }), options.intervalMs ?? 1000)
      timer.unref?.()
    }
  } catch (error) { fail(error?.code || 'WORKER_CONSTRUCT'); stopped = true }
  return { begin, end, run, stop, directory, snapshot: () => ({ stopped, ready, supported: typeof spawn === 'function', status, errorCode, outstanding, dropped }) }
}

function runWriter() {
  const fs = require('node:fs')
  const data = JSON.parse(process.env.EYPC_FREEZE_TRACE_CONFIG)
  let bytes = 0
  let lastPulse = Date.now()
  let lastAlive = 0
  let lastStamp = 0
  let dropped = 0
  let closed = false
  let tick
  let file = ''
  const pending = new Map()
  const stalledIds = new Set()
  // One stall episode writes one main-stall, repeated only when new spans join it,
  // and one stall-end on recovery. A suspended host otherwise logs every tick.
  let stall = null
  fs.mkdirSync(data.directory, { recursive: true, mode: 0o700 })
  // Bound only this recorder's files. Never touch ordinary diagnostics.
  function prune(keep) {
    const names = fs.readdirSync(data.directory).filter(name => /^freeze-\d+-\d+\.jsonl$/.test(name)).sort()
    for (const name of names.slice(0, Math.max(0, names.length - keep))) fs.unlinkSync(path.join(data.directory, name))
  }
  function open() {
    prune(Math.max(0, data.maxFiles - 1))
    lastStamp = Math.max(Date.now(), lastStamp + 1)
    file = path.join(data.directory, `freeze-${lastStamp}-${data.processId}.jsonl`)
    bytes = 0
    append(serialize({ type: 'start', at: Date.now(), identity: data.identity }))
  }
  const serialize = event => JSON.stringify({ revision: REVISION, pid: data.processId, ...event }) + '\n'
  function append(line) {
    fs.appendFileSync(file, line, { mode: 0o600 })
    bytes += Buffer.byteLength(line)
  }
  function write(event) {
    if (closed) return
    const line = serialize(event)
    const size = Buffer.byteLength(line)
    if (bytes + size > data.maxBytes) {
      if (size > data.maxBytes / 2) return
      open()
    }
    append(line)
  }
  function endStall(now) {
    if (!stall) return
    write({ type: 'stall-end', at: now, lagMs: stall.maxLagMs, durationMs: now - stall.since, dropped })
    stall = null
  }
  function close() { closed = true; clearInterval(tick); if (process.connected) process.disconnect() }
  open()
  process.send('ready')
  const deadline = Number.isFinite(data.durationMs) ? Date.now() + data.durationMs : Infinity
  // The channel closes when the plugin process exits or is killed.
  process.on('disconnect', () => { if (!closed) { endStall(Date.now()); write({ type: 'disconnect', at: Date.now() }); close() } })
  process.on('message', event => {
    if (closed) return
    if (event.type === 'stop') { endStall(Date.now()); write({ type: 'stop', at: Date.now() }); close(); return }
    if (event.type === 'pulse') { lastPulse = Date.now(); dropped = event.dropped || 0; endStall(lastPulse) }
    else if (event.type === 'begin' && validOp(event.op)) {
      if (pending.size < 128) pending.set(event.id, { id: event.id, op: event.op, at: event.at })
    } else if (event.type === 'end' && validOp(event.op)) {
      pending.delete(event.id)
      const stalled = stalledIds.delete(event.id)
      if (stalled || !(event.durationMs < data.slowSpanMs)) write({ type: 'end', id: event.id, op: event.op, at: event.at, ...metrics(event) })
    }
    if (!closed) process.send('ack')
  })
  tick = setInterval(() => {
    const now = Date.now()
    if (now - lastPulse > data.stallMs) {
      const joined = [...pending.keys()].some(id => !stalledIds.has(id))
      for (const id of pending.keys()) stalledIds.add(id)
      if (!stall) stall = { since: lastPulse, maxLagMs: 0 }
      const first = stall.maxLagMs === 0
      stall.maxLagMs = now - lastPulse
      if (first || joined) write({ type: 'main-stall', at: now, lagMs: now - lastPulse, pending: [...pending.values()], dropped })
    } else if (now - lastAlive >= data.aliveMs) {
      lastAlive = now
      write({ type: 'heartbeat', at: now, lagMs: now - lastPulse, pending: pending.size, dropped })
    }
    if (now >= deadline) { write({ type: 'expired', at: now }); close() }
  }, data.intervalMs)
}

const WRITER_SOURCE = [
  "'use strict'",
  "const path = require('node:path')",
  `const REVISION = ${JSON.stringify(REVISION)}`,
  `const numericKeys = new Set(${JSON.stringify([...numericKeys])})`,
  `const metrics = ${metrics}`,
  `const validOp = ${validOp}`,
  `${runWriter}`,
  "try { runWriter() } catch (error) { process.send({ type: 'error', code: String(error && error.code || '') }, () => process.disconnect()) }"
].join('\n')

let active = null
const trace = {
  begin: (...args) => active?.begin(...args),
  end: (...args) => active?.end(...args),
  run: (_op, action, details) => active ? active.run(_op, action, details) : action(),
  start: options => { if (!active) active = createFreezeTrace(options); return active },
  snapshot: () => active?.snapshot(),
  stop: () => active?.stop()
}
module.exports = { createFreezeTrace, trace, metrics }
