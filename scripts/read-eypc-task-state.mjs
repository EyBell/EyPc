import http from 'node:http'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import bridge from '../preload/companion/task-state-bridge.cjs'

const { SCHEMA, HOST, SNAPSHOT_PATH, WATCH_PATH, readTaskStateEndpoint } = bridge
const MAX_FRAME_LENGTH = 16 * 1024 * 1024
const HOST_TIMEOUT_MS = 5_000
const args = process.argv.slice(2)
const watch = args.includes('--watch')
const directory = args.find((arg) => arg.startsWith('--dir='))?.slice('--dir='.length)

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

async function main() {
  if (args.includes('--help')) {
    process.stdout.write('Usage: node scripts/read-eypc-task-state.mjs [--watch] [--dir=<endpoint-directory>]\n')
    return
  }
  if (args.some((arg) => arg !== '--watch' && !/^--dir=.+/.test(arg))) {
    process.stderr.write('Unknown option. Use --help.\n')
    process.exitCode = 2
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
          await write(event)
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
