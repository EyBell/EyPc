'use strict'

// Temporary, content-free freeze recorder. All disk work runs in a worker.
// It never obtains a directory through a synchronous uTools SDK call.
const path = require('node:path')
const os = require('node:os')
let threads = {}
try { threads = require('node:worker_threads') } catch { /* host may not expose workers */ }
const { Worker, isMainThread, workerData, parentPort } = threads
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
  const directory = options.directory || path.join(os.homedir(), '.eypc', 'freeze-traces')
  function stop() {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    try { worker?.postMessage({ type: 'stop' }) } catch {}
  }
  function send(event) {
    if (stopped || !worker) return false
    if (outstanding >= 256) { dropped++; return false }
    try { worker.postMessage(event); outstanding++; return true } catch { return false }
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
    if (options.enabled !== false && typeof Worker === 'function') {
      worker = new Worker(__filename, { workerData: {
        freezeTrace: true, directory, processId: process.pid,
        durationMs: options.durationMs ?? 10 * 60_000,
        intervalMs: options.intervalMs ?? 1000,
        stallMs: options.stallMs ?? 2500,
        maxBytes: options.maxBytes ?? 4 * 1024 * 1024,
        identity: /^[a-z0-9-]{1,80}$/.test(options.identity || '') ? options.identity : 'unmeasured'
      } })
      worker.on('message', message => {
        if (message === 'ack') outstanding = Math.max(0, outstanding - 1)
        if (message === 'ready') ready = true
      })
      worker.on('error', stop)
      worker.on('exit', () => { stopped = true; clearInterval(timer) })
      worker.unref()
      timer = setInterval(() => send({ type: 'pulse', at: Date.now(), dropped }), options.intervalMs ?? 1000)
      timer.unref?.()
    }
  } catch { stopped = true }
  return { begin, end, run, stop, directory, snapshot: () => ({ stopped, ready, supported: typeof Worker === 'function', outstanding, dropped }) }
}

function runWriter() {
  const fs = require('node:fs')
  const data = workerData
  let bytes = 0
  let lastPulse = Date.now()
  let dropped = 0
  let closed = false
  let tick
  const pending = new Map()
  fs.mkdirSync(data.directory, { recursive: true, mode: 0o700 })
  // Bound only this recorder's files. Never touch ordinary diagnostics.
  const names = fs.readdirSync(data.directory).filter(name => /^freeze-\d+-\d+\.jsonl$/.test(name)).sort()
  for (const name of names.slice(0, Math.max(0, names.length - 7))) fs.unlinkSync(path.join(data.directory, name))
  const file = path.join(data.directory, `freeze-${Date.now()}-${data.processId}.jsonl`)
  function write(event) {
    if (closed) return
    const line = JSON.stringify({ revision: REVISION, pid: data.processId, ...event }) + '\n'
    if (bytes + Buffer.byteLength(line) > data.maxBytes) { close(); return }
    fs.appendFileSync(file, line, { mode: 0o600 })
    bytes += Buffer.byteLength(line)
  }
  function close() { closed = true; clearInterval(tick); parentPort.close() }
  write({ type: 'start', at: Date.now(), identity: data.identity })
  parentPort.postMessage('ready')
  const deadline = Date.now() + data.durationMs
  parentPort.on('message', event => {
    if (closed) return
    if (event.type === 'stop') { write({ type: 'stop', at: Date.now() }); close(); return }
    if (event.type === 'pulse') { lastPulse = Date.now(); dropped = event.dropped || 0 }
    else if ((event.type === 'begin' || event.type === 'end') && validOp(event.op)) {
      if (event.type === 'begin' && pending.size < 128) pending.set(event.id, { id: event.id, op: event.op, at: event.at })
      if (event.type === 'end') pending.delete(event.id)
      write({ type: event.type, id: event.id, op: event.op, at: event.at, ...metrics(event) })
    }
    if (!closed) parentPort.postMessage('ack')
  })
  tick = setInterval(() => {
    const now = Date.now()
    write({ type: now - lastPulse > data.stallMs ? 'main-stall' : 'heartbeat', at: now,
      lagMs: now - lastPulse, pending: [...pending.values()], dropped })
    if (now >= deadline) { write({ type: 'expired', at: now }); close() }
  }, data.intervalMs)
}

let active = null
const trace = {
  begin: (...args) => active?.begin(...args),
  end: (...args) => active?.end(...args),
  run: (_op, action, details) => active ? active.run(_op, action, details) : action(),
  start: options => { if (!active) active = createFreezeTrace(options); return active },
  snapshot: () => active?.snapshot(),
  stop: () => active?.stop()
}
if (!isMainThread && workerData?.freezeTrace === true) runWriter()
module.exports = { createFreezeTrace, trace, metrics }
