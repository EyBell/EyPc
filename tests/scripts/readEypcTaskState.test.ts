import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, get } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { expect, it } from 'vitest'

it('keeps a quiet host serving heartbeats until the last watcher disconnects', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eypc-task-heartbeat-'))
  const host = spawn(process.execPath, ['-e', `
    const { startCompanionTaskStateBridge } = require('./preload/companion/task-state-bridge.cjs')
    process.stdin.resume()
    startCompanionTaskStateBridge({
      kernel: {
        getLatest: () => ({ packageRevision: 0, tasks: [], providers: {}, views: {
          counts: {}, groups: {}, cycleKeys: [], attentionKeys: { input: [], completedUnread: [] }
        } }),
        onPackage: () => () => {}
      },
      directory: process.argv[1],
      report: (outcome) => console.log(outcome)
    })
  `, directory])
  const stopped = once(host, 'exit')
  const deadline = setTimeout(() => host.kill(), 4_500)
  const output = createInterface({ input: host.stdout })
  let response: IncomingMessage | undefined
  try {
    expect(await output[Symbol.asyncIterator]().next()).toMatchObject({ value: 'listening' })
    const { port, token } = JSON.parse(readFileSync(join(directory, 'host.json'), 'utf8'))
    response = await new Promise<IncomingMessage>((resolve, reject) => {
      get({
        hostname: '127.0.0.1', port, path: '/v1/task-state/watch',
        headers: { Authorization: `Bearer ${token}` }
      }, resolve).once('error', reject)
    })
    const frames = createInterface({ input: response })[Symbol.asyncIterator]()
    async function readFrame() {
      const frame = await frames.next()
      if (frame.done) throw new Error('task watch closed before its next frame')
      return JSON.parse(frame.value)
    }
    expect(await readFrame()).toMatchObject({ type: 'snapshot' })
    host.stdin.end()
    expect(await readFrame()).toMatchObject({ type: 'heartbeat' })
    response.destroy()
    expect(await stopped).toEqual([0, null])
  } finally {
    clearTimeout(deadline)
    response?.destroy()
    output.close()
    if (host.exitCode === null && host.signalCode === null) {
      host.kill()
      await stopped
    }
    rmSync(directory, { recursive: true, force: true })
  }
}, 5_000)

it('keeps a healthy idle stream open and resubscribes if a snapshot shows it is behind', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eypc-task-watch-'))
  const schema = 'eypc-task-state-v1'
  const hostGeneration = 'a'.repeat(32)
  const frame = (sequence: number) => JSON.stringify({
    schema, hostGeneration, sequence, type: 'snapshot', package: { packageRevision: sequence + 1 }
  }) + '\n'
  let connections = 0
  let snapshotSequence = 0
  let watchedResponse: ServerResponse | undefined
  let resolveProbe!: () => void
  const probed = new Promise<void>(resolve => { resolveProbe = resolve })
  const server = createServer((request, response) => {
    if (request.url === '/v1/task-state/watch') {
      watchedResponse = response
      connections++
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
      response.write(frame(snapshotSequence))
      return
    }
    response.end(frame(snapshotSequence))
    resolveProbe()
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing task watch address')
  writeFileSync(join(directory, 'host.json'), JSON.stringify({
    schema, hostGeneration, port: address.port, token: 'b'.repeat(64)
  }), { mode: 0o600 })
  const child = spawn(process.execPath, ['scripts/read-eypc-task-state.mjs', '--watch', `--dir=${directory}`])
  const lines = createInterface({ input: child.stdout })
  const reader = lines[Symbol.asyncIterator]()
  async function readFrame() {
    const line = await reader.next()
    if (line.done) throw new Error('task watch exited')
    return JSON.parse(line.value)
  }
  const deadline = setTimeout(() => child.kill(), 13_000)
  try {
    expect(await readFrame()).toMatchObject({ type: 'snapshot', package: { packageRevision: 1 } })
    await Promise.race([probed, once(child, 'exit').then(() => { throw new Error('no idle snapshot probe') })])
    expect(connections).toBe(1)
    watchedResponse?.write(frame(1))
    expect(await readFrame()).toMatchObject({ type: 'snapshot', package: { packageRevision: 2 } })
    snapshotSequence = 2
    expect(await readFrame()).toMatchObject({ type: 'snapshot', package: { packageRevision: 3 } })
    expect(connections).toBe(2)
    server.close()
    server.closeAllConnections()
    expect(await readFrame()).toMatchObject({ type: 'unavailable', reason: 'host-disconnected' })
  } finally {
    clearTimeout(deadline)
    lines.close()
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await once(child, 'exit')
    }
    server.close()
    server.closeAllConnections()
    rmSync(directory, { recursive: true, force: true })
  }
}, 14_000)
