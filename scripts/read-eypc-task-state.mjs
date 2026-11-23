import http from 'node:http'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import bridge from '../preload/companion/task-state-bridge.cjs'

const { SCHEMA, HOST, SNAPSHOT_PATH, WATCH_PATH, readTaskStateEndpoint } = bridge
const MAX_FRAME_LENGTH = 16 * 1024 * 1024
const args = process.argv.slice(2)
const watch = args.includes('--watch')
const directory = args.find((arg) => arg.startsWith('--dir='))?.slice('--dir='.length)

async function write(value) {
  if (!process.stdout.write(`${JSON.stringify(value)}\n`)) await once(process.stdout, 'drain')
}

function connect(endpoint) {
  return new Promise((resolveResponse, reject) => {
    const request = http.get({
      hostname: HOST,
      port: endpoint.port,
      path: watch ? WATCH_PATH : SNAPSHOT_PATH,
      headers: { Authorization: `Bearer ${endpoint.token}` },
      agent: false,
      timeout: 5000
    }, resolveResponse)
    request.on('error', reject)
    request.on('timeout', () => request.destroy(new Error('host-timeout')))
  })
}

async function observe(endpoint, readEndpoint, accept) {
  const response = await connect(endpoint)
  let sequence = -1
  let buffer = ''
  try {
    if (response.statusCode !== 200) return response.statusCode === 403 ? 'endpoint-mismatch' : 'host-unavailable'
    response.setTimeout(5000, () => response.destroy(new Error('host-timeout')))
    response.setEncoding('utf8')
    for await (const chunk of response) {
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
        if (!watch) return ''
      }
      if (buffer.length > MAX_FRAME_LENGTH) return 'invalid-response'
    }
    return 'host-disconnected'
  } catch (error) {
    if (error.message === 'host-timeout') return error.message
    return error instanceof SyntaxError ? 'invalid-response' : 'host-disconnected'
  } finally {
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
  do {
    const endpoint = readEndpoint()
    let reason = endpoint ? 'host-disconnected' : 'endpoint-unavailable'
    if (endpoint) {
      try {
        reason = await observe(endpoint, readEndpoint, async (event) => {
          lastFailure = ''
          await write(event)
        })
      } catch (error) {
        reason = error.message === 'host-timeout' ? 'host-timeout' : 'host-disconnected'
      }
    }
    if (!reason) return
    if (reason !== lastFailure) await write({ schema: SCHEMA, type: 'unavailable', reason })
    lastFailure = reason
    if (watch) await delay(400)
  } while (watch)
  process.exitCode = 1
}

process.stdout.on('error', (error) => { process.exit(error.code === 'EPIPE' ? 0 : 1) })
await main()
