import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const transitionSchema = 'eypc-task-state-v1'
const hostA = 'a'.repeat(32)
const hostB = 'b'.repeat(32)
const origin = 1_000_000

function refOf(index: number) {
  return `h:${index.toString(16).padStart(16, '0')}`
}

type TransitionMember = { phase: string; turn: string; goal: string; threadStatus: string }

function transitionTask(index: number, turnStartedAt: number, phase = 'running', turn = 'turn-running') {
  const codex: { main: TransitionMember; sides?: TransitionMember[] } = {
    main: { phase, turn, goal: 'none', threadStatus: 'active' }
  }
  return {
    taskRef: refOf(index), provider: 'codex', phase, turnStartedAt, terminalAt: 0, semanticRevision: 1,
    localPin: false, providerPin: true,
    codex
  }
}

type TransitionSnapshot<Task> = {
  schema: string
  hostGeneration: string
  sequence: number
  type: 'snapshot'
  package: {
    packageRevision: number
    publishedAt?: number
    capturedAt?: number
    freshness?: string
    tasks: Task[]
    views: {
      counts: { active: number; input: number; unread: number }
      groups: Record<string, string[]>
      cycleKeys: string[]
    }
  }
  consumerReceipts: object[]
  inventory?: object
}

function transitionSnapshot<Task extends { taskRef: string }>(
  sequence: number, host: string, publishedAt: number, tasks: Task[], receipts: object[] = []
): TransitionSnapshot<Task> {
  return {
    schema: transitionSchema, hostGeneration: host, sequence, type: 'snapshot',
    package: {
      packageRevision: 4, publishedAt, tasks,
      views: {
        counts: { active: 20, input: 0, unread: 0 },
        groups: { active: tasks.map((task) => task.taskRef) },
        cycleKeys: []
      }
    },
    consumerReceipts: receipts
  }
}

function visibleReceipts(taskRef = refOf(1)) {
  return [
    { surface: 'main', kind: 'delivery', packageRevision: 4, windowGeneration: 1, outcome: 'applied', observedAt: origin },
    { surface: 'main', kind: 'presentation', packageRevision: 4, windowGeneration: 1, outcome: 'visible', counts: { active: 20, input: 0, unread: 0 }, observedAt: origin },
    { surface: 'float', kind: 'delivery', packageRevision: 4, windowGeneration: 3, outcome: 'applied', observedAt: origin },
    { surface: 'float', kind: 'row', packageRevision: 4, windowGeneration: 3, taskRef, outcome: 'visible', phase: 'running', group: 'active', pinSource: 'native', pinned: true, observedAt: origin }
  ]
}

async function runScript(args: string[]) {
  const child = spawn(process.execPath, ['scripts/read-eypc-task-state.mjs', ...args])
  let stdout = ''
  let stderr = ''
  const timer = setTimeout(() => child.kill(), 4_000)
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk })
  const [code] = await once(child, 'exit')
  clearTimeout(timer)
  return { code, stdout, stderr }
}

async function checkTransitions(manifest: unknown, events: unknown[]) {
  const directory = mkdtempSync(join(tmpdir(), 'eypc-transition-'))
  try {
    const expectPath = join(directory, 'manifest.json')
    const replayPath = join(directory, 'replay.ndjson')
    writeFileSync(expectPath, JSON.stringify(manifest))
    writeFileSync(replayPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`)
    const args = ['--check-transitions', `--expect=${expectPath}`, `--replay=${replayPath}`]
    const first = await runScript(args)
    const second = await runScript(args)
    expect(second.stdout).toBe(first.stdout)
    return { code: first.code, stdout: first.stdout, stderr: first.stderr, body: JSON.parse(first.stdout) }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

it('fails when two of twenty-two transitions are missing even if the observed outputs match', async () => {
  const transitions = Array.from({ length: 22 }, (_, index) => {
    const number = index + 1
    return {
      id: `tr-${String(number).padStart(2, '0')}`, taskRef: refOf(number), member: 'main', phase: 'running',
      turn: 'turn-running', turnStartedAt: number === 21 ? 2 : number, expectAt: origin
    }
  })
  const manifest = {
    schema: 'eypc-task-transition-manifest-v1', hostGeneration: hostA, deadlineMs: 1_000, transitions,
    presentation: {
      packageRevision: 4,
      main: { windowGeneration: 1, counts: { active: 20, input: 0, unread: 0 } },
      float: { windowGeneration: 3, rows: [{ taskRef: refOf(1), group: 'active', phase: 'running', pinSource: 'native', pinned: true }] }
    }
  }
  const partials = Array.from({ length: 20 }, (_, index) => transitionSnapshot(index + 1, hostA, origin + (index + 1) * 10, [transitionTask(index + 1, index + 1)]))
  const present = Array.from({ length: 20 }, (_, index) => transitionTask(index + 1, index + 1))
  const finalTasks = [...present, transitionTask(21, 1, 'stopped', 'turn-interrupted')]
  const final = transitionSnapshot(21, hostA, origin + 50_000, finalTasks, visibleReceipts())
  final.package.views = { counts: { active: 20, input: 0, unread: 0 }, groups: { active: present.map((task) => task.taskRef) }, cycleKeys: [] }
  const foreign = transitionSnapshot(1, hostB, origin + 10, Array.from({ length: 22 }, (_, index) => transitionTask(index + 1, index === 20 ? 2 : index + 1)), visibleReceipts())
  const wrongWindow = [
    { schema: transitionSchema, hostGeneration: hostA, sequence: 40, type: 'receipt', receipt: { surface: 'main', kind: 'presentation', packageRevision: 4, windowGeneration: 9, outcome: 'visible', counts: { active: 0, input: 1, unread: 1 }, observedAt: origin } },
    { schema: transitionSchema, hostGeneration: hostA, sequence: 41, type: 'receipt', receipt: { surface: 'float', kind: 'row', packageRevision: 4, windowGeneration: 9, taskRef: refOf(1), outcome: 'visible', phase: 'stopped', group: 'unread', pinSource: 'none', pinned: false, observedAt: origin } }
  ]
  const result = await checkTransitions(manifest, [
    { schema: transitionSchema, hostGeneration: hostA, sequence: 0, type: 'heartbeat' },
    foreign, ...partials, final, ...wrongWindow
  ])
  expect(result.code).toBe(1)
  expect(result.body).toMatchObject({
    verdict: 'fail', reason: 'missing', expected: 22, timely: 20, missing: 2, timeout: 0,
    mismatched: 0, pending: 0, observed: 20, p95Ms: 190, outputsMatch: true
  })
  expect(result.body.display.main).toMatchObject({ status: 'pass', applied: true, visible: true })
  expect(result.body.display.float).toMatchObject({ status: 'pass', applied: true, visible: true })
  expect(result.body.items.filter((item: { status: string, latencyMs: number | null }) => item.status === 'missing').map((item: { id: string, latencyMs: number | null }) => [item.id, item.latencyMs])).toEqual([['tr-21', null], ['tr-22', null]])
}, 10_000)

it('keeps timeout observations in the percentile and excludes missing ones', async () => {
  const manifest = {
    schema: 'eypc-task-transition-manifest-v1', hostGeneration: hostA, deadlineMs: 1_000,
    transitions: [1, 2, 3, 4].map((number) => ({
      id: `tr-${number}`, taskRef: refOf(number), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: number, expectAt: origin
    }))
  }
  const onTime = transitionTask(1, 1)
  onTime.codex.main.phase = 'completed'
  const events = [
    transitionSnapshot(1, hostA, origin + 100, [onTime]),
    transitionSnapshot(2, hostA, origin + 5_000, [transitionTask(2, 2)])
  ]
  const result = await checkTransitions(manifest, events)
  expect(result.body).toMatchObject({
    verdict: 'fail', reason: 'timeout', expected: 4, timely: 1, timeout: 1, missing: 2, observed: 2, p95Ms: 5_000, outputsMatch: false, mismatched: 0
  })
}, 10_000)

it('distinguishes Side members and Turns when their native clocks overlap', async () => {
  const main = transitionTask(1, 1, 'completed', 'turn-completed')
  const member = { memberRef: refOf(11), turnRef: refOf(31), root: false, phase: 'completed', turn: 'turn-completed',
    turnStartedAt: 1000, terminalAt: 2000, unread: false }
  const task = { ...main, planReady: false, codexMembers: [
    { ...member, memberRef: refOf(12), turnRef: refOf(32) }, member
  ] }
  const transition = {
    taskRef: refOf(1), member: 'side', memberPhase: 'completed', phase: 'completed',
    turn: 'turn-completed', turnStartedAt: 1000, terminalAt: 2000, expectAt: origin, planReady: false, memberUnread: false
  }
  const manifest = {
    schema: 'eypc-task-transition-manifest-v1', hostGeneration: hostA, deadlineMs: 1_000,
    transitions: [
      { ...transition, id: 'exact-side', memberRef: refOf(11), turnRef: refOf(31),
        hostReceivedAt: origin + 5, admittedAt: origin + 25 },
      { ...transition, id: 'other-turn', memberRef: refOf(11), turnRef: refOf(33) },
      { ...transition, id: 'missing-side', memberRef: refOf(13) }
    ]
  }
  const old = { ...task, codexMembers: [{ ...member, turnRef: refOf(33) }] }
  const result = await checkTransitions(manifest, [
    transitionSnapshot(1, hostA, origin - 1, [old]),
    transitionSnapshot(2, hostA, origin + 67, [task])
  ])
  expect(result.body).toMatchObject({ verdict: 'fail', reason: 'missing', timely: 1, missing: 2, p95Ms: 67,
    stages: { nativeToHost: { observed: 1, p95Ms: 5 }, hostToAdmission: { observed: 1, p95Ms: 20 },
      admissionToPackage: { observed: 1, p95Ms: 42 } } })
}, 10_000)

it('passes only a same-window visible row and keeps applied distinct', async () => {
  const task = transitionTask(1, 1)
  const manifest = {
    schema: 'eypc-task-transition-manifest-v1', hostGeneration: hostA, deadlineMs: 1_000,
    transitions: [{ id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 1, expectAt: origin }],
    presentation: {
      packageRevision: 4,
      main: { windowGeneration: 1, counts: { active: 20, input: 0, unread: 0 } },
      float: { windowGeneration: 3, rows: [{ taskRef: refOf(1), group: 'active', phase: 'running', pinSource: 'native', pinned: true }] }
    }
  }
  const passed = await checkTransitions(manifest, [transitionSnapshot(2, hostA, origin + 20, [task], visibleReceipts()), {
    schema: transitionSchema, hostGeneration: hostA, sequence: 9, type: 'receipt',
    receipt: { surface: 'main', kind: 'presentation', packageRevision: 4, windowGeneration: 8, outcome: 'visible', counts: { active: 1, input: 1, unread: 1 }, observedAt: origin }
  }])
  expect(passed.code).toBe(0)
  expect(passed.body).toMatchObject({ verdict: 'pass', reason: 'ok', p95Ms: 20 })
  expect(passed.body.display.main).toMatchObject({ applied: true, visible: true, status: 'pass' })

  const appliedOnly = structuredClone(manifest)
  const applied = await checkTransitions(appliedOnly, [transitionSnapshot(2, hostA, origin + 20, [task], [
    { surface: 'main', kind: 'delivery', packageRevision: 4, windowGeneration: 1, outcome: 'applied', observedAt: origin },
    { surface: 'float', kind: 'delivery', packageRevision: 4, windowGeneration: 3, outcome: 'applied', observedAt: origin }
  ])])
  expect(applied.code).toBe(1)
  expect(applied.body.verdict).toBe('pending')
  expect(applied.body.reason).toBe('applied')
  expect(applied.body.mismatched).toBe(0)
  expect(applied.body.display.main).toMatchObject({ applied: true, visible: false, status: 'pending' })
  expect(applied.body.display.float.visible).toBe(false)
}, 10_000)

it('keeps host, window, hidden, folded, and missing endpoint states distinct from mismatch', async () => {
  const transition = [{ id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 1, expectAt: origin }]
  const base = {
    schema: 'eypc-task-transition-manifest-v1', hostGeneration: hostA, deadlineMs: 1_000, transitions: transition,
    presentation: { packageRevision: 4, main: { windowGeneration: 1, counts: { active: 20, input: 0, unread: 0 } } }
  }
  const task = transitionTask(1, 1)
  const foreign = await checkTransitions(base, [transitionSnapshot(1, hostB, origin + 10, [task], visibleReceipts())])
  expect(foreign.body).toMatchObject({ verdict: 'pending', reason: 'host-changed', mismatched: 0, missing: 0 })

  const otherWindow = await checkTransitions(base, [transitionSnapshot(1, hostA, origin + 10, [task]), {
    schema: transitionSchema, hostGeneration: hostA, sequence: 5, type: 'receipt',
    receipt: { surface: 'main', kind: 'presentation', packageRevision: 4, windowGeneration: 9, outcome: 'visible', counts: { active: 0, input: 4, unread: 4 }, observedAt: origin }
  }])
  expect(otherWindow.body).toMatchObject({ verdict: 'pending', reason: 'window-changed', mismatched: 0 })
  expect(otherWindow.body.display.main).toMatchObject({ visible: false, applied: false })

  const hidden = await checkTransitions(base, [transitionSnapshot(1, hostA, origin + 10, [task]), {
    schema: transitionSchema, hostGeneration: hostA, sequence: 2, type: 'receipt',
    receipt: { surface: 'main', kind: 'presentation', packageRevision: 4, windowGeneration: 1, outcome: 'visible', counts: { active: 9, input: 9, unread: 9 }, observedAt: origin }
  }, {
    schema: transitionSchema, hostGeneration: hostA, sequence: 3, type: 'receipt',
    receipt: { surface: 'main', kind: 'presentation', packageRevision: 4, windowGeneration: 1, outcome: 'hidden', observedAt: origin }
  }])
  expect(hidden.body).toMatchObject({ verdict: 'pending', reason: 'hidden', mismatched: 0 })

  const foldedManifest = { ...base, presentation: { packageRevision: 4,
    float: { windowGeneration: 3, rows: [{ taskRef: refOf(1), group: 'active', phase: 'running', pinSource: 'native', pinned: true }] } } }
  const folded = await checkTransitions(foldedManifest, [transitionSnapshot(1, hostA, origin + 10, [task]), {
    schema: transitionSchema, hostGeneration: hostA, sequence: 4, type: 'receipt',
    receipt: { surface: 'float', kind: 'row', packageRevision: 4, windowGeneration: 3, taskRef: refOf(1), outcome: 'visible', phase: 'stopped', group: 'unread', pinSource: 'none', pinned: false, observedAt: origin }
  }, {
    schema: transitionSchema, hostGeneration: hostA, sequence: 5, type: 'receipt',
    receipt: { surface: 'float', kind: 'presentation', packageRevision: 4, windowGeneration: 3, outcome: 'folded', observedAt: origin }
  }])
  expect(folded.body).toMatchObject({ verdict: 'pending', reason: 'folded', mismatched: 0 })

  const mismatched = await checkTransitions(base, [transitionSnapshot(1, hostA, origin + 10, [task], [
    { surface: 'main', kind: 'presentation', packageRevision: 4, windowGeneration: 1, outcome: 'visible', counts: { active: 1, input: 0, unread: 0 }, observedAt: origin }
  ])])
  expect(mismatched.body).toMatchObject({ verdict: 'mismatch', reason: 'field-mismatch' })

  const directory = mkdtempSync(join(tmpdir(), 'eypc-transition-live-'))
  try {
    const endpoint = join(directory, 'endpoint')
    const expectPath = join(directory, 'manifest.json')
    mkdirSync(endpoint)
    writeFileSync(expectPath, JSON.stringify(base))
    const live = await runScript(['--check-transitions', `--expect=${expectPath}`, `--dir=${endpoint}`])
    expect(live.code).toBe(1)
    expect(JSON.parse(live.stdout)).toMatchObject({ verdict: 'pending', reason: 'endpoint-unavailable', mismatched: 0, missing: 0 })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 10_000)

it('uses the explicit side ordinal and does not treat an old host gap as a mismatch', async () => {
  const sided = transitionTask(1, 4)
  sided.codex = {
    main: { phase: 'running', turn: 'turn-running', goal: 'none', threadStatus: 'active' },
    sides: [
      { phase: 'running', turn: 'turn-running', goal: '', threadStatus: 'active' },
      { phase: 'completed', turn: 'turn-completed', goal: '', threadStatus: 'idle' }
    ]
  }
  const manifest = {
    schema: 'eypc-task-transition-manifest-v1', hostGeneration: hostA, deadlineMs: 1_000,
    transitions: [{ id: 'side-1', taskRef: refOf(1), member: 'side:1', phase: 'running', turn: 'turn-completed', turnStartedAt: 4, expectAt: origin }]
  }
  const matched = await checkTransitions(manifest, [transitionSnapshot(1, hostA, origin + 5, [sided])])
  expect(matched.body).toMatchObject({ verdict: 'pass', timely: 1 })
  const wrongSide = structuredClone(manifest)
  wrongSide.transitions[0].id = 'side-0'
  wrongSide.transitions[0].member = 'side:0'
  const mismatched = await checkTransitions(wrongSide, [transitionSnapshot(1, hostA, origin + 5, [sided])])
  expect(mismatched.body).toMatchObject({ verdict: 'mismatch', reason: 'field-mismatch', missing: 0 })

  const legacy = await checkTransitions(manifest, [transitionSnapshot(1, hostA, origin + 5, [{
    taskRef: refOf(1), provider: 'codex', phase: 'running', turnStartedAt: 4
  }])])
  expect(legacy.body).toMatchObject({ verdict: 'pending', reason: 'field-unavailable', mismatched: 0 })
}, 10_000)

it('keeps summary output compatible with an old host and rejects unsafe check input', async () => {
  const help = await runScript(['--help'])
  expect(help.code).toBe(0)
  expect(help.stdout).toContain('--watch')
  expect(help.stdout).toContain('--summary')
  expect(help.stdout).toContain('--check-transitions')
  const mixed = await runScript(['--check-transitions', '--watch', '--expect=unused.json'])
  expect(mixed.code).toBe(2)

  const directory = mkdtempSync(join(tmpdir(), 'eypc-task-summary-'))
  const schema = transitionSchema
  const hostGeneration = 'c'.repeat(32)
  const server = createServer((_request, response) => {
    response.end(`${JSON.stringify({
      schema, hostGeneration, sequence: 1, type: 'snapshot', package: {
        packageRevision: 3, providers: { codex: { enabled: true, status: 'ready' } },
        tasks: [{ provider: 'codex', phase: 'running' }],
        views: { counts: { active: 1, input: 2, unread: 3 }, groups: { active: [refOf(1)] }, cycleKeys: [] }
      }
    })}\n`)
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('missing summary address')
    writeFileSync(join(directory, 'host.json'), JSON.stringify({ schema, hostGeneration, port: address.port, token: 'd'.repeat(64) }), { mode: 0o600 })
    const unsafe = join(directory, 'unsafe.json')
    writeFileSync(unsafe, JSON.stringify({ schema: 'eypc-task-transition-manifest-v1', title: 'raw-title-should-not-echo' }))
    const rejected = await runScript(['--check-transitions', `--expect=${unsafe}`])
    expect(rejected.code).toBe(2)
    expect(rejected.stdout + rejected.stderr).not.toContain('raw-title-should-not-echo')
    const summary = await runScript(['--summary', `--dir=${directory}`])
    expect(summary.code).toBe(0)
    expect(JSON.parse(summary.stdout)).toMatchObject({
      type: 'snapshot', package: { badgeCounts: { active: 1, input: 2, unread: 3 }, pinCounts: null }
    })
  } finally {
    server.close()
    server.closeAllConnections()
    rmSync(directory, { recursive: true, force: true })
  }
}, 10_000)

function measurementManifest(transitions: object[], extra: Record<string, unknown> = {}) {
  return {
    schema: 'eypc-task-transition-manifest-v1', hostGeneration: hostA, deadlineMs: 1_000, transitions, ...extra
  }
}

it('uses captured publish time and keeps an old publishedAt replay', async () => {
  const manifest = measurementManifest([{
    id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 1, expectAt: origin
  }])
  const task = transitionTask(1, 1)
  const captured = transitionSnapshot(1, hostA, origin + 5_000, [task])
  Object.assign(captured.package, { capturedAt: origin + 15 })
  const withCapture = await checkTransitions(manifest, [captured])
  expect(withCapture.body).toMatchObject({ verdict: 'pass', p95Ms: 15, capture: { deadlineMs: 1_000, exceeded: 0 } })
  const legacy = await checkTransitions(manifest, [transitionSnapshot(1, hostA, origin + 15, [task])])
  expect(legacy.body).toMatchObject({ verdict: 'pass', p95Ms: 15, timeout: 0 })
}, 10_000)

it('separates roster coverage from a missed member and keeps complete coverage as missing', async () => {
  const expected = {
    id: 'side', taskRef: refOf(1), member: 'side', memberRef: refOf(11), phase: 'running',
    turn: 'turn-running', expectAt: origin
  }
  const covered = { ...transitionTask(1, 1), codexMembers: [], codexMemberTotal: 4 }
  const partial = await checkTransitions(measurementManifest([expected]), [transitionSnapshot(1, hostA, origin + 10, [covered])])
  expect(partial.body).toMatchObject({ verdict: 'pending', reason: 'coverage-insufficient', missing: 0, mismatched: 0 })

  const listed = { ...transitionTask(1, 1), codexMemberTotal: 1,
    codexMembers: [{ memberRef: refOf(12), root: false, phase: 'running', turn: 'turn-running', turnStartedAt: 1, terminalAt: 0, unread: false }] }
  const missed = await checkTransitions(measurementManifest([expected]), [transitionSnapshot(1, hostA, origin + 10, [listed])])
  expect(missed.body).toMatchObject({ verdict: 'fail', reason: 'missing', missing: 1 })

  const unreadTask = { ...transitionSnapshot(2, hostA, origin + 20, []),
    inventory: { firstReadbackAt: origin + 5, latest: { readCount: 2, totalCount: 5, truncated: true, coverage: 'partial' } } }
  const roster = await checkTransitions(measurementManifest([expected]), [unreadTask])
  expect(roster.body).toMatchObject({
    verdict: 'pending', reason: 'coverage-insufficient', reads: { inventory: 1 },
    inventory: { firstReadbackAt: origin + 5, readCount: 2, totalCount: 5, coverage: 'partial' }
  })
  const complete = { ...transitionSnapshot(3, hostA, origin + 30, []),
    inventory: { firstReadbackAt: origin + 5, latest: { readCount: 5, totalCount: 5, truncated: false, coverage: 'complete' } } }
  const afterComplete = await checkTransitions(measurementManifest([expected]), [unreadTask, complete])
  expect(afterComplete.body).toMatchObject({ verdict: 'fail', reason: 'missing', inventory: { coverage: 'complete', readCount: 5, totalCount: 5 } })
  const deferred = { ...transitionSnapshot(4, hostA, origin + 40, []),
    inventory: {
      firstReadbackAt: origin + 5,
      latest: { readCount: 1, totalCount: 5, truncated: true, coverage: 'partial', disposition: 'deferred', reason: 'active-index', sourceGeneration: 9 },
      segments: [{ readCount: 5, totalCount: 5, truncated: false, coverage: 'complete', sourceGeneration: 8 }]
    } }
  const held = await checkTransitions(measurementManifest([expected]), [unreadTask, complete, deferred])
  expect(held.body).toMatchObject({ verdict: 'pending', reason: 'coverage-insufficient', inventory: { sourceGeneration: 9, disposition: 'deferred', reason: 'active-index' } })
  expect(held.body.inventory.sourceGeneration).not.toBe(8)
}, 10_000)

it('flags only a same-turn failure rollback and keeps a normal predecessor timely', async () => {
  const expected = {
    id: 'turn', taskRef: refOf(1), member: 'side', memberRef: refOf(11), turnRef: refOf(31), phase: 'completed',
    memberPhase: 'completed', turn: 'turn-completed', turnStartedAt: 1_000, terminalAt: 2_000, expectAt: origin
  }
  const member = (turn: string) => ({
    ...transitionTask(1, 1, 'completed', 'turn-completed'),
    codexMembers: [{ memberRef: refOf(11), turnRef: refOf(31), root: false, phase: 'completed', turn,
      turnStartedAt: 1_000, terminalAt: 2_000, unread: false }]
  })
  const rolled = await checkTransitions(measurementManifest([expected]), [
    transitionSnapshot(1, hostA, origin + 10, [member('turn-failed')]),
    transitionSnapshot(2, hostA, origin + 40, [member('turn-completed')])
  ])
  expect(rolled.body).toMatchObject({ verdict: 'fail', reason: 'rollback', timeout: 0, mismatched: 0 })
  const predecessor = await checkTransitions(measurementManifest([expected]), [
    transitionSnapshot(1, hostA, origin + 10, [{
      ...transitionTask(1, 1, 'running', 'turn-running'),
      codexMembers: [{ memberRef: refOf(11), turnRef: refOf(31), root: false, phase: 'running', turn: 'turn-running',
        turnStartedAt: 1_000, terminalAt: 0, unread: false }]
    }]),
    transitionSnapshot(2, hostA, origin + 40, [member('turn-completed')])
  ])
  expect(predecessor.body).toMatchObject({ verdict: 'pass', reason: 'ok', p95Ms: 40 })
}, 10_000)

it('compares clocks after member identity and withholds SLO pass below twenty samples', async () => {
  const expected = {
    id: 'id-time', taskRef: refOf(1), member: 'side', memberRef: refOf(11), turnRef: refOf(31), phase: 'completed',
    turn: 'turn-completed', turnStartedAt: 1_000, terminalAt: 2_000, expectAt: origin
  }
  const identified = (clocks: Record<string, number>) => ({
    ...transitionTask(1, 1, 'completed', 'turn-completed'),
    codexMembers: [{ memberRef: refOf(11), turnRef: refOf(31), root: false, phase: 'completed', turn: 'turn-completed',
      unread: false, ...clocks }]
  })
  const wrong = await checkTransitions(measurementManifest([expected]), [
    transitionSnapshot(1, hostA, origin + 10, [identified({ turnStartedAt: 1_000, terminalAt: 2_500 })])
  ])
  expect(wrong.body).toMatchObject({ verdict: 'mismatch', reason: 'field-mismatch', missing: 0 })
  const absentClock = await checkTransitions(measurementManifest([expected]), [
    transitionSnapshot(1, hostA, origin + 10, [identified({ turnStartedAt: 1_000 })])
  ])
  expect(absentClock.body).toMatchObject({ verdict: 'pending', reason: 'field-unavailable', mismatched: 0, missing: 0 })
  const legacy = await checkTransitions(measurementManifest([{
    id: 'legacy-time', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 9, expectAt: origin
  }]), [transitionSnapshot(1, hostA, origin + 10, [transitionTask(1, 4)])])
  expect(legacy.body).toMatchObject({ verdict: 'fail', reason: 'missing', mismatched: 0 })

  const batch = (count: number) => {
    const transitions = Array.from({ length: count }, (_, index) => ({
      id: `s-${index + 1}`, taskRef: refOf(index + 1), member: 'main', phase: 'running', turn: 'turn-running',
      turnStartedAt: index + 1, expectAt: origin
    }))
    const events = transitions.map((item, index) => transitionSnapshot(index + 1, hostA, origin + 10, [transitionTask(index + 1, index + 1)]))
    return checkTransitions(measurementManifest(transitions, { sloP95Ms: 100 }), events)
  }
  const under = await batch(19)
  expect(under.body).toMatchObject({ verdict: 'pending', reason: 'slo-insufficient', timeout: 0, timely: 19,
    slo: { status: 'insufficient', observed: 19, minimum: 20, p95Ms: 10 } })
  const enough = await batch(20)
  expect(enough.body).toMatchObject({ verdict: 'pass', timeout: 0, slo: { status: 'pass', observed: 20, p95Ms: 10 } })
}, 10_000)

it('keeps the single-capture deadline distinct from the P95 SLO and reports segments', async () => {
  const transition = {
    id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 1, expectAt: origin, segment: 'early'
  }
  const slow = await checkTransitions(measurementManifest([transition], {
    deadlineMs: 1_000, sloP95Ms: 10_000, segments: [{ id: 'early', startAt: origin, endAt: origin + 100 }]
  }), [transitionSnapshot(1, hostA, origin + 5_000, [transitionTask(1, 1)])])
  expect(slow.body).toMatchObject({
    verdict: 'fail', reason: 'timeout', capture: { deadlineMs: 1_000, exceeded: 1 },
    slo: { limitMs: 10_000, p95Ms: 5_000, observed: 1, minimum: 20, status: 'insufficient' },
    segments: [{ id: 'early', reads: 0, observed: 0 }]
  })
  const slo = await checkTransitions(measurementManifest([{ ...transition, segment: 'early' }], {
    deadlineMs: 1_000, sloP95Ms: 10, segments: [{ id: 'early', startAt: origin, endAt: origin + 100 }]
  }), [transitionSnapshot(1, hostA, origin + 20, [transitionTask(1, 1)])])
  expect(slo.body).toMatchObject({
    verdict: 'fail', reason: 'slo', timeout: 0, capture: { exceeded: 0 },
    slo: { status: 'fail', p95Ms: 20 }, segments: [{ id: 'early', reads: 1, observed: 1, p95Ms: 20 }]
  })
}, 10_000)

it('checks same-package button state without changing an old row', async () => {
  const task = { ...transitionTask(1, 1), continueTask: false, continueDispatchAllowed: false }
  const base = {
    schema: 'eypc-task-transition-manifest-v1', hostGeneration: hostA, deadlineMs: 1_000,
    transitions: [{ id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 1, expectAt: origin }],
    presentation: {
      packageRevision: 4,
      main: { windowGeneration: 1, counts: { active: 20, input: 0, unread: 0 }, continueTask: true },
      float: { windowGeneration: 3, rows: [{ taskRef: refOf(1), group: 'active', phase: 'running', pinSource: 'native', pinned: true, continueTask: false }] }
    }
  }
  const receipts = visibleReceipts()
  Object.assign(receipts[1], { continueTask: true })
  Object.assign(receipts[3], { continueTask: false })
  const matched = await checkTransitions(base, [transitionSnapshot(1, hostA, origin + 10, [task], receipts)])
  expect(matched.body).toMatchObject({ verdict: 'pass', display: { main: { button: 'match' }, float: { status: 'pass' } } })
  const wrong = structuredClone(base)
  wrong.presentation.float.rows[0].continueTask = true
  const mismatched = await checkTransitions(wrong, [transitionSnapshot(1, hostA, origin + 10, [task], receipts)])
  expect(mismatched.body).toMatchObject({ verdict: 'mismatch', reason: 'field-mismatch' })
}, 10_000)

it('pairs a member by second precision and rejects a different second', async () => {
  const expected = {
    id: 'sec', taskRef: refOf(1), member: 'side', memberRef: refOf(11), turnRef: refOf(31), phase: 'completed',
    turn: 'turn-completed', turnStartedAt: 1_500, terminalAt: 2_200, expectAt: origin
  }
  const task = (second: number) => ({
    ...transitionTask(1, 1, 'completed', 'turn-completed'),
    codexMembers: [{ memberRef: refOf(11), turnRef: refOf(31), root: false, phase: 'completed', turn: 'turn-completed',
      turnStartedAt: 0, terminalAt: 0, turnStartedSecond: second, terminalSecond: 2, unread: false }]
  })
  const paired = await checkTransitions(measurementManifest([expected]), [transitionSnapshot(1, hostA, origin + 12, [task(1)])])
  expect(paired.body).toMatchObject({ verdict: 'pass', timely: 1, p95Ms: 12 })
  const otherSecond = await checkTransitions(measurementManifest([expected]), [transitionSnapshot(1, hostA, origin + 12, [task(3)])])
  expect(otherSecond.body).toMatchObject({ verdict: 'mismatch', reason: 'field-mismatch', missing: 0 })
}, 10_000)

it('merges an inventory notice without counting it as another package', async () => {
  const task = transitionTask(1, 1)
  const snapshot = transitionSnapshot(1, hostA, origin + 20, [task])
  const notice = {
    schema: transitionSchema, hostGeneration: hostA, sequence: 2, type: 'inventory',
    inventory: { firstReadbackAt: origin + 5, latest: { readCount: 1, totalCount: 4, truncated: true, coverage: 'partial',
      observedAt: origin + 30, taskRef: refOf(9), turn: 'turn-running', stage: 'activity' } }
  }
  const matched = await checkTransitions(measurementManifest([{
    id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 1, expectAt: origin
  }]), [snapshot, notice])
  expect(matched.body).toMatchObject({
    verdict: 'pass', observed: 1, reads: { snapshots: 1, inventory: 1 },
    inventory: { coverage: 'partial', taskRef: refOf(9), turn: 'turn-running' }
  })
  const absent = await checkTransitions(measurementManifest([{
    id: 'side', taskRef: refOf(2), member: 'side', memberRef: refOf(11), phase: 'running', turn: 'turn-running', expectAt: origin
  }]), [notice])
  expect(absent.body).toMatchObject({ verdict: 'pending', reason: 'coverage-insufficient', reads: { snapshots: 0, inventory: 1 } })
  const hotNotice = {
    schema: transitionSchema, hostGeneration: hostA, sequence: 3, type: 'inventory',
    inventory: {
      ...notice.inventory,
      hotUpdateEvidence: {
        segment: 'targeted', reason: 'stream-evidence', emittedAt: origin + 80, coverage: 'complete', readCount: 9, totalCount: 9,
        members: [{ memberRef: refOf(11), turnRef: refOf(31), connectionMode: 'disconnected', connectionSince: origin + 90 }]
      }
    }
  }
  const kept = await checkTransitions(measurementManifest([{
    id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 1, expectAt: origin
  }]), [snapshot, hotNotice])
  expect(kept.body).toMatchObject({
    verdict: 'pass', observed: 1,
    inventory: { coverage: 'partial', readCount: 1, totalCount: 4, firstReadbackAt: origin + 5, taskRef: refOf(9) }
  })
  expect(kept.body.inventory.hotUpdateEvidence).toBeUndefined()
}, 10_000)

it('retains the first callback time and the first readback without echoing unsafe fields', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eypc-task-capture-'))
  const child = spawn(process.execPath, ['-e', `
    const http = require('node:http')
    const fs = require('node:fs')
    const { startCompanionTaskStateBridge } = require('./preload/companion/task-state-bridge.cjs')
    const directory = process.argv[1]
    const packageFor = (revision) => ({
      packageRevision: revision, enabled: true, complete: true, publishedAt: 10, freshness: 'fresh',
      providers: { codex: true }, providerHealth: { codex: { status: 'ready' } },
      tasks: [{ key: 'root', provider: 'codex', phase: 'running', semanticRevision: 1, freshness: 'fresh',
        capabilities: { continueTask: true }, localPin: false, providerPin: true }],
      views: { counts: { active: 1, input: 0, unread: 0 }, groups: { active: ['root'] }, cycleKeys: [],
        attentionKeys: { input: [], completedUnread: [] } }
    })
    let current = packageFor(1)
    const members = [{ memberRef: 'h:0000000000000002', turnRef: 'h:0000000000000003', root: true,
      phase: 'running', turn: 'turn-running', turnStartedAt: 4, terminalAt: 0, unread: false }]
    members.totalCount = 3
    let listener = () => {}
    const bridge = startCompanionTaskStateBridge({
      kernel: {
        getLatest: () => current,
        getCodexDiagnosticMembers: () => new Map([['root', members]]),
        onPackage: (fn) => { listener = fn; fn(current); return () => {} }
      },
      directory, taskRef: () => 'h:0000000000000001', report: () => {}
    })
    const read = async () => {
      let endpoint
      for (let attempt = 0; attempt < 50 && !endpoint; attempt += 1) {
        try { endpoint = JSON.parse(fs.readFileSync(directory + '/host.json', 'utf8')) }
        catch { await new Promise((resolve) => setTimeout(resolve, 20)) }
      }
      if (!endpoint) throw new Error('missing endpoint')
      return new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: endpoint.port, path: '/v1/task-state',
        headers: { Authorization: 'Bearer ' + endpoint.token } }, (response) => {
        let body = ''
        response.on('data', (chunk) => { body += chunk })
        response.on('end', () => resolve(JSON.parse(body)))
      }).once('error', reject)
    })
    }
    const sample = (emittedAt, readCount, totalCount) => ({
      event: 'codex-inventory-sample', outcome: emittedAt === 5000 ? 'first' : 'complete', packageRevision: current.packageRevision,
      durationMs: 40,
      details: { reason: 'rm -rf /secret', threadId: 'thread-secret', taskRef: 'h:0000000000000004', turn: 'turn-running', segment: 'full', segmentIndex: 0, segmentCount: 4,
        readCount, totalCount, truncated: totalCount > readCount, coverage: totalCount > readCount ? 'partial' : 'complete',
        firstReadback: true, emittedAt, readGeneration: 2, rootCount: 1, memberCount: totalCount, durationMs: 40,
        disposition: emittedAt === 5000 ? 'changed' : 'nope', stage: emittedAt === 5000 ? 'activity' : 'custom',
        members: [{ memberRef: 'h:0000000000000002', turnRef: 'h:0000000000000003', root: true, turnStartedAt: 4500, turnStartedSecond: 4 },
          { memberRef: 'thread-secret', turnStartedAt: 4500, turnStartedSecond: 4 }] }
    })
    ;(async () => {
      const subscribed = await read()
      current = packageFor(2)
      listener(current)
      const first = await read()
      listener(current)
      const retained = await read()
      bridge.recordReceipt({ event: 'codex-inventory-sample', outcome: 'nope', details: { reason: 'unsafe' } })
      const endpoint = JSON.parse(fs.readFileSync(directory + '/host.json', 'utf8'))
      const watch = await new Promise((resolve, reject) => {
        http.get({ hostname: '127.0.0.1', port: endpoint.port, path: '/v1/task-state/watch',
          headers: { Authorization: 'Bearer ' + endpoint.token } }, resolve).once('error', reject)
      })
      let pending = ''
      watch.setEncoding('utf8')
      watch.on('data', (chunk) => { pending += chunk })
      const take = async () => {
        for (let attempt = 0; attempt < 50; attempt += 1) {
          const newline = pending.indexOf('\\n')
          if (newline >= 0) {
            const line = pending.slice(0, newline)
            pending = pending.slice(newline + 1)
            return JSON.parse(line)
          }
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        throw new Error('missing inventory frame')
      }
      const watchedPackage = await take()
      bridge.recordReceipt(sample(5000, 1, 3))
      const notice = await take()
      bridge.recordReceipt({ event: 'codex-inventory-sample', outcome: 'partial', packageRevision: current.packageRevision,
        details: { reason: 'stream-evidence', segment: 'targeted', segmentIndex: 0, segmentCount: 1,
          readCount: 1, totalCount: 1, truncated: false, coverage: 'complete', emittedAt: 15000,
          taskRef: 'h:0000000000000004',
          members: [{ memberRef: 'h:0000000000000002', turnRef: 'h:0000000000000003', taskRef: 'h:0000000000000004', connectionMode: 'normal' }] } })
      const hotFrame = await take()
      watch.destroy()
      const readback = await read()
      bridge.recordReceipt(sample(9000, 3, 3))
      const repeated = await read()
      bridge.recordReceipt({ event: 'codex-inventory-sample', outcome: 'partial', packageRevision: current.packageRevision,
        details: { reason: 'active-index', segment: 'page', segmentIndex: 0, segmentCount: 1,
          readCount: 1, totalCount: 4, truncated: true, coverage: 'partial', disposition: 'deferred',
          sourceGeneration: 7, readGeneration: 2, stage: 'activity', emittedAt: 12000 } })
      const deferred = await read()
      bridge.recordReceipt({ event: 'float-task-presented', scope: 'float-bridge', outcome: 'visible', phase: 'running',
        packageRevision: 2, details: { windowGeneration: 3, group: 'active', pinSource: 'native', pinned: true,
          continueTask: false, command: 'do-not-copy' } }, 'h:0000000000000001')
      const button = await read()
      process.stdout.write(JSON.stringify({ subscribed, first, retained, watchedPackage, notice, hotFrame, readback, repeated, deferred, button }) + '\\n')
      bridge.close()
      process.exit(0)
    })().catch((error) => { process.stderr.write(String(error && error.stack || error)); process.exit(1) })
  `, directory])
  let stdout = ''
  let stderr = ''
  const timer = setTimeout(() => child.kill(), 4_000)
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk })
  try {
    const [code] = await once(child, 'exit')
    expect(stderr).toBe('')
    expect(code).toBe(0)
    const body = JSON.parse(stdout)
    expect(body.notice).toMatchObject({ type: 'inventory' })
    expect(body.notice.package).toBeUndefined()
    expect(body.hotFrame).toMatchObject({ type: 'inventory', inventory: { hotUpdateEvidence: { reason: 'stream-evidence', emittedAt: 15000, segment: 'targeted' } } })
    expect(body.hotFrame.inventory.firstReadbackAt).toBe(body.notice.inventory.firstReadbackAt)
    expect(body.hotFrame.inventory.latest).toEqual(body.notice.inventory.latest)
    expect(body.hotFrame.inventory.segments).toEqual(body.notice.inventory.segments)
    expect(body.readback.inventory.hotUpdateEvidence).toBeUndefined()
    expect(body.readback.package.packageRevision).toBe(body.watchedPackage.package.packageRevision)
    expect(body.subscribed.package.capturedAt).toBeUndefined()
    expect(body.first.package).toMatchObject({ packageRevision: 2, publishedAt: 10 })
    expect(body.first.package.codexMemberTotal).toBeUndefined()
    expect(body.first.package.tasks[0]).toMatchObject({ codexMemberTotal: 3, continueTask: true })
    expect(body.first.package.tasks[0].codexMembers).toHaveLength(1)
    expect(body.first.package.capturedAt).toEqual(expect.any(Number))
    expect(body.retained.package.capturedAt).toBe(body.first.package.capturedAt)
    expect(body.readback.inventory).toMatchObject({ firstReadbackAt: 5000, latest: { readCount: 1, totalCount: 3, coverage: 'partial', stage: 'activity', durationMs: 40, disposition: 'changed', taskRef: 'h:0000000000000004', turn: 'turn-running',
      members: [{ memberRef: 'h:0000000000000002', turnStartedAt: 4500, turnStartedSecond: 4 }] } })
    expect(body.readback.inventory.latest.members).toHaveLength(1)
    expect(body.repeated.inventory.firstReadbackAt).toBe(5000)
    expect(body.repeated.inventory.latest).toMatchObject({ readCount: 3, totalCount: 3, coverage: 'complete' })
    expect(body.repeated.inventory.latest.disposition).toBeUndefined()
    expect(body.repeated.inventory.latest.sourceGeneration).toBeUndefined()
    expect(body.repeated.inventory.latest.stage).toBe('activity')
    expect(body.deferred.inventory.firstReadbackAt).toBe(5000)
    expect(body.deferred.inventory.latest).toMatchObject({ disposition: 'deferred', reason: 'active-index', sourceGeneration: 7, readGeneration: 2 })
    expect(body.deferred.inventory.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ segment: 'full', coverage: 'complete' }),
      expect.objectContaining({ segment: 'page', disposition: 'deferred', sourceGeneration: 7 })
    ]))
    expect(body.deferred.inventory.segments.find((item: { segment: string }) => item.segment === 'full').sourceGeneration).toBeUndefined()
    expect(stdout).not.toContain('rm -rf')
    expect(stdout).not.toContain('thread-secret')
    expect(stdout).not.toContain('do-not-copy')
    expect(body.button.consumerReceipts[0]).toMatchObject({ continueTask: false, kind: 'row', taskRef: 'h:0000000000000001' })
  } finally {
    clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await once(child, 'exit')
    }
    rmSync(directory, { recursive: true, force: true })
  }
}, 10_000)

it('counts twenty independent samples once and keeps a short disconnect group from replacing them', async () => {
  const transitions = Array.from({ length: 20 }, (_, index) => {
    const number = index + 1
    return {
      id: `tr-${number}`, taskRef: refOf(number), member: 'main', phase: 'running', turn: 'turn-running',
      turnStartedAt: number, expectAt: origin
    }
  })
  const tasks = transitions.map((_, index) => transitionTask(index + 1, index + 1))
  const snapshot = transitionSnapshot(1, hostA, origin + 10, tasks)
  const counted = await checkTransitions(measurementManifest(transitions, {
    sloP95Ms: 1_000, segments: [{ id: 'early', startAt: origin, endAt: origin + 100 }]
  }), [snapshot, snapshot])
  expect(counted.code).toBe(0)
  expect(counted.body).toMatchObject({
    verdict: 'pass', observed: 20, p95Ms: 10, reads: { snapshots: 1 },
    slo: { observed: 20, status: 'pass', p95Ms: 10 },
    segments: [{ id: 'early', reads: 1, observed: 20, p95Ms: 10 }]
  })
  expect(counted.body.groups).toBeUndefined()
  const late = { ...transitions[0], id: 'late', taskRef: refOf(21), turnStartedAt: 21 }
  const disconnect = { schema: transitionSchema, hostGeneration: hostA, sequence: 2, type: 'unavailable', reason: 'host-disconnected' }
  const after = transitionSnapshot(3, hostA, origin + 10, [...tasks, transitionTask(21, 21)])
  const split = await checkTransitions(measurementManifest([...transitions, late], { sloP95Ms: 1_000 }), [snapshot, disconnect, after])
  expect(split.body).toMatchObject({
    verdict: 'pending', reason: 'slo-insufficient', observed: 20, p95Ms: 10, timely: 21, timeout: 0,
    groups: {
      normal: { observed: 20, p95Ms: 10, status: 'pass' },
      disconnect: { observed: 1, p95Ms: 10, status: 'insufficient' }
    }
  })
}, 20_000)

it('accepts the first correct package after a wrong one without using package freshness', async () => {
  const expected = {
    id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 1, expectAt: origin
  }
  const wrong = transitionSnapshot(1, hostA, origin + 10, [transitionTask(1, 1, 'stopped', 'turn-interrupted')])
  wrong.package.freshness = 'verifying'
  const correct = transitionSnapshot(2, hostA, origin + 30, [transitionTask(1, 1)])
  correct.package.freshness = 'verifying'
  const result = await checkTransitions(measurementManifest([expected]), [wrong, correct])
  expect(result.code).toBe(0)
  expect(result.body).toMatchObject({ verdict: 'pass', timely: 1, mismatched: 0, p95Ms: 30, timeout: 0 })
  expect(result.body.items[0]).toMatchObject({ status: 'timely', reason: 'ok', intermediate: true, latencyMs: 30 })
  expect(result.body.groups).toBeUndefined()
}, 10_000)

it('keeps a missing receipt unverified and a wrong package distinct from a miss', async () => {
  const transition = {
    id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 1, expectAt: origin
  }
  const task = transitionTask(1, 1)
  const manifest = measurementManifest([transition], {
    presentation: { packageRevision: 4, main: { windowGeneration: 1, counts: { active: 20, input: 0, unread: 0 } } }
  })
  const missing = await checkTransitions(manifest, [transitionSnapshot(1, hostA, origin + 10, [task])])
  expect(missing.body).toMatchObject({ verdict: 'pending', reason: 'receipt-missing', mismatched: 0, missing: 0, timeout: 0 })
  expect(missing.body.display.main).toMatchObject({ status: 'pending', reason: 'receipt-missing', visible: false, applied: false })
  const wrong = await checkTransitions(measurementManifest([transition]), [
    transitionSnapshot(1, hostA, origin + 10, [transitionTask(1, 1, 'stopped', 'turn-interrupted')])
  ])
  expect(wrong.body).toMatchObject({ verdict: 'mismatch', reason: 'field-mismatch', missing: 0, pending: 0 })
}, 10_000)

it('does not let a later window generation replace the first correct package', async () => {
  const running = transitionTask(1, 1)
  const stopped = transitionTask(1, 1, 'stopped', 'turn-interrupted')
  const manifest = measurementManifest([{
    id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 1, expectAt: origin
  }], {
    presentation: {
      packageRevision: 4,
      main: { windowGeneration: 1, counts: { active: 20, input: 0, unread: 0 } },
      float: { windowGeneration: 3, rows: [{ taskRef: refOf(1), group: 'active', phase: 'running', pinSource: 'native', pinned: true }] }
    }
  })
  const early = transitionSnapshot(1, hostA, origin + 10, [stopped])
  early.package.views.counts = { active: 0, input: 1, unread: 1 }
  const first = { ...early, consumerWindowGenerations: { main: 9, float: 9 } }
  const matched = {
    ...transitionSnapshot(2, hostA, origin + 30, [running], visibleReceipts()),
    consumerWindowGenerations: { main: 1, float: 3 }
  }
  const later = {
    ...transitionSnapshot(3, hostA, origin + 80, [running], [
      { surface: 'main', kind: 'presentation', packageRevision: 4, windowGeneration: 8, outcome: 'visible', counts: { active: 0, input: 1, unread: 1 }, observedAt: origin },
      { surface: 'float', kind: 'row', packageRevision: 4, windowGeneration: 8, taskRef: refOf(1), outcome: 'visible', phase: 'stopped', group: 'unread', pinSource: 'none', pinned: false, observedAt: origin }
    ]),
    consumerWindowGenerations: { main: 8, float: 8 }
  }
  const result = await checkTransitions(manifest, [first, matched, later])
  expect(result.code).toBe(0)
  expect(result.body).toMatchObject({ verdict: 'pass', p95Ms: 30, mismatched: 0 })
  expect(result.body.items[0]).toMatchObject({ status: 'timely', intermediate: true })
  expect(result.body.display.main).toMatchObject({ status: 'pass', visible: true, intermediate: true })
  expect(result.body.display.float).toMatchObject({ status: 'pass', visible: true, intermediate: true })
}, 10_000)

it('keeps an actual emit past one second pending when the native clock is coarse', async () => {
  const expected = {
    id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running',
    turnStartedAt: 1, expectAt: origin, expectAtPrecisionMs: 1000
  }
  const coarse = await checkTransitions(measurementManifest([expected]), [
    transitionSnapshot(1, hostA, origin + 1_500, [transitionTask(1, 1)])
  ])
  expect(coarse.body).toMatchObject({ verdict: 'pending', reason: 'time-precision', timeout: 0, pending: 1, observed: 1 })
  expect(coarse.body.items[0]).toMatchObject({ status: 'pending', reason: 'time-precision', latencyMs: 1_500, latencyRangeMs: [501, 1_500] })
  expect(coarse.body.groups).toBeUndefined()
  const exact = { ...expected, id: 'exact', expectAtPrecisionMs: 1 }
  const timedOut = await checkTransitions(measurementManifest([exact]), [
    transitionSnapshot(1, hostA, origin + 1_500, [transitionTask(1, 1)])
  ])
  expect(timedOut.body).toMatchObject({ verdict: 'fail', reason: 'timeout', timeout: 1, pending: 0, p95Ms: 1_500 })
}, 10_000)

it('leaves a natural sample without targeted proof unverified', async () => {
  const expected = {
    id: 'tr-1', taskRef: refOf(1), member: 'main', memberRef: refOf(11), phase: 'running', turn: 'turn-running',
    turnStartedAt: 1, expectAt: origin, connectionMode: 'normal',
    statusRequestedAt: 4_000, statusReceivedAt: 4_200, queuedAt: 3_000, requestedAt: 3_400
  }
  const task = {
    ...transitionTask(1, 1),
    codexMembers: [{ memberRef: refOf(11), turnRef: refOf(31), root: true, phase: 'running', turn: 'turn-running',
      turnStartedAt: 1, terminalAt: 0, unread: false }]
  }
  const natural = {
    ...transitionSnapshot(1, hostA, origin + 15, [task]),
    inventory: {
      firstReadbackAt: origin,
      latest: { segment: 'page', readCount: 1, totalCount: 1, coverage: 'complete', connectionMode: 'normal',
        queuedAt: 3_000, requestedAt: 3_400, durationMs: 40 },
      segments: [{ segment: 'page', coverage: 'complete', members: [{ memberRef: refOf(11), connectionMode: 'normal',
        statusRequestedAt: 4_000, statusReceivedAt: 4_200 }] }]
    }
  }
  const held = await checkTransitions(measurementManifest([expected]), [natural])
  expect(held.body).toMatchObject({ verdict: 'pending', reason: 'evidence-unverified', mismatched: 0, timeout: 0, observed: 0, p95Ms: null })
  expect(held.body.inventory.targeted).toBeUndefined()
  expect(held.body.inventory.durationMs).toBe(40)
  const bare = {
    ...transitionSnapshot(2, hostA, origin + 15, [task]),
    inventory: {
      firstReadbackAt: origin,
      latest: { segment: 'targeted', readCount: 1, totalCount: 1, coverage: 'complete',
        members: [{ memberRef: refOf(11), statusRequestedAt: 4_000 }] }
    }
  }
  const unverified = await checkTransitions(measurementManifest([expected]), [bare])
  expect(unverified.body).toMatchObject({ verdict: 'pending', reason: 'evidence-unverified', mismatched: 0, observed: 0 })
  expect(unverified.body.inventory.targeted.members[0].connectionMode).toBeUndefined()
  expect(unverified.body.inventory.targeted.members[0].statusRequestedAt).toBeUndefined()
  const proven = {
    ...transitionSnapshot(3, hostA, origin + 15, [task]),
    inventory: {
      firstReadbackAt: origin,
      latest: {
        segment: 'targeted', readCount: 1, totalCount: 1, coverage: 'complete', durationMs: 9_000,
        queuedAt: 3_000, requestedAt: 3_400,
        members: [{ memberRef: refOf(11), connectionMode: 'normal', statusRequestedAt: 4_000, statusReceivedAt: 4_200, threadId: 'do-not-copy' }]
      }
    }
  }
  const matched = await checkTransitions(measurementManifest([expected]), [proven])
  expect(matched.code).toBe(0)
  expect(matched.body).toMatchObject({
    verdict: 'pass', p95Ms: 15, timeout: 0,
    inventory: { durationMs: 9_000, targeted: { queuedAt: 3_000, requestedAt: 3_400,
      members: [{ memberRef: refOf(11), connectionMode: 'normal', statusRequestedAt: 4_000, statusReceivedAt: 4_200 }] } }
  })
  expect(JSON.stringify(matched.body)).not.toContain('do-not-copy')
  const wrongMode = structuredClone(proven)
  wrongMode.inventory.latest.members[0].connectionMode = 'disconnected'
  const mismatched = await checkTransitions(measurementManifest([expected]), [wrongMode])
  expect(mismatched.body).toMatchObject({ verdict: 'mismatch', reason: 'field-mismatch', observed: 0, missing: 0 })
}, 20_000)

it('does not apply another target dispatch and binds targeted-dispatch without a turn', async () => {
  const expected = {
    id: 'tr-1', taskRef: refOf(1), member: 'main', memberRef: refOf(11), turnRef: refOf(31), phase: 'running',
    turn: 'turn-running', turnStartedAt: 1, expectAt: origin, connectionMode: 'normal',
    statusRequestedAt: 4_000, statusReceivedAt: 4_200, queuedAt: 3_000, requestedAt: 3_400
  }
  const task = {
    ...transitionTask(1, 1),
    codexMembers: [{ memberRef: refOf(11), turnRef: refOf(31), root: true, phase: 'running', turn: 'turn-running',
      turnStartedAt: 1, terminalAt: 0, unread: false }]
  }
  const foreign = {
    ...transitionSnapshot(1, hostA, origin + 15, [task]),
    inventory: {
      firstReadbackAt: origin,
      latest: { segment: 'targeted', taskRef: refOf(2), readCount: 1, totalCount: 1, coverage: 'complete', queuedAt: 3_000, requestedAt: 9_999,
        members: [{ memberRef: refOf(12), turnRef: refOf(32), connectionMode: 'disconnected', statusRequestedAt: 1, statusReceivedAt: 2 }] },
      segments: [{ segment: 'targeted', taskRef: refOf(1), queuedAt: 8_000, requestedAt: 8_100,
        members: [{ memberRef: refOf(12), connectionMode: 'disconnected' }] }]
    }
  }
  const held = await checkTransitions(measurementManifest([expected]), [foreign])
  expect(held.body).toMatchObject({ verdict: 'pending', reason: 'evidence-unverified', mismatched: 0, observed: 0 })
  const bound = {
    ...transitionSnapshot(2, hostA, origin + 15, [task]),
    inventory: {
      firstReadbackAt: origin,
      latest: {
        segment: 'targeted-dispatch', taskRef: refOf(1), readCount: 1, totalCount: 1, coverage: 'complete',
        queuedAt: 3_000, requestedAt: 3_400,
        members: [{ memberRef: refOf(11), connectionMode: 'normal', statusRequestedAt: 4_000, statusReceivedAt: 4_200 }]
      },
      segments: [{ segment: 'targeted-dispatch', taskRef: refOf(1), queuedAt: 8_000, requestedAt: 1,
        members: [{ memberRef: refOf(11), connectionMode: 'disconnected' }] }]
    }
  }
  const matched = await checkTransitions(measurementManifest([expected]), [foreign, bound])
  expect(matched.code).toBe(0)
  expect(matched.body).toMatchObject({ verdict: 'pass', p95Ms: 15, mismatched: 0, timeout: 0 })
}, 20_000)

it('times the first correct package from publishedAt without replacing captured latency', async () => {
  const manifest = measurementManifest([{
    id: 'tr-1', taskRef: refOf(1), member: 'main', phase: 'running', turn: 'turn-running', turnStartedAt: 1, expectAt: origin
  }], {
    presentation: { packageRevision: 4, main: { windowGeneration: 1, counts: { active: 20, input: 0, unread: 0 } } }
  })
  const wrong = transitionSnapshot(1, hostA, origin + 5, [transitionTask(1, 1, 'stopped', 'turn-interrupted')])
  wrong.package.views.counts = { active: 0, input: 1, unread: 1 }
  const correct = transitionSnapshot(2, hostA, origin + 40, [transitionTask(1, 1)], [
    { surface: 'main', kind: 'delivery', packageRevision: 4, windowGeneration: 1, outcome: 'applied', observedAt: origin + 55 },
    { surface: 'main', kind: 'presentation', packageRevision: 4, windowGeneration: 1, outcome: 'visible', counts: { active: 20, input: 0, unread: 0 }, observedAt: origin + 55 }
  ])
  correct.package.capturedAt = origin + 15
  const result = await checkTransitions(manifest, [wrong, { ...correct, consumerWindowGenerations: { main: 1 } }])
  expect(result.code).toBe(0)
  expect(result.body).toMatchObject({ verdict: 'pass', p95Ms: 15, timeout: 0 })
  expect(result.body.items[0]).toMatchObject({ status: 'timely', intermediate: true, latencyMs: 15 })
  expect(result.body.display.main).toMatchObject({ status: 'pass', visibleMs: 15, intermediate: true })
}, 10_000)

it('scores distinct native transitions at publication in both connection modes', async () => {
  const scenarios = Array.from({ length: 40 }, (_, index) => {
    const ordinal = index + 1
    const connectionMode = index < 20 ? 'normal' : 'disconnected'
    const expectAt = origin + ordinal * 10_000
    const transition = {
      id: `native-${ordinal}`, taskRef: refOf(ordinal), memberRef: refOf(100 + ordinal), turnRef: refOf(200 + ordinal),
      phase: 'running', turn: 'turn-running', expectAt, connectionMode
    }
    const member = { ...transition, root: true, statusRequestedAt: expectAt + 100, statusReceivedAt: expectAt + 200 }
    const task = { ...transitionTask(ordinal, ordinal), codexMembers: [member], codexMemberTotal: 1 }
    const publishedAt = expectAt + (connectionMode === 'normal' ? 1_800 : 4_700)
    const event = transitionSnapshot(ordinal + 1, hostA, publishedAt, [task])
    return {
      transition,
      event: { ...event, package: { ...event.package, packageRevision: ordinal + 1, capturedAt: publishedAt + 600 },
        inventory: { latest: { segment: 'targeted', members: [member], observedAt: member.statusReceivedAt } } }
    }
  })
  const baseline = transitionSnapshot(1, hostA, origin, [])
  const replay = [baseline, ...scenarios.map(({ event }) => event)]
  const transitions = scenarios.map(({ transition }) => transition)
  const manifest = (items: object[]) => measurementManifest(items, { hotUpdate: true, deadlineMs: 6_000 })
  const scored = await checkTransitions(manifest(transitions), replay)
  expect(scored.code).toBe(0)
  expect(scored.body).toMatchObject({ verdict: 'pass', observed: 40, duplicates: 0,
    groups: { normal: { observed: 20, p95Ms: 1_800, status: 'pass' },
      disconnected: { observed: 20, p95Ms: 4_700, status: 'pass' } } })
  const duplicated = await checkTransitions(manifest([
    transitions[0], { ...transitions[0], id: 'duplicate' }, ...transitions.slice(2)
  ]), replay)
  expect(duplicated.body).toMatchObject({ verdict: 'pending', reason: 'slo-insufficient', observed: 39, duplicates: 1,
    groups: { normal: { observed: 19, status: 'insufficient' }, disconnected: { observed: 20, status: 'pass' } } })
}, 10_000)

it('checks the actual targeted dispatch deadline on the host wire format', async () => {
  const target = transitionTask(1, 1)
  const member = { root: true, memberRef: refOf(11), turnRef: refOf(12), phase: 'running', turn: 'turn-running' }
  const transition = { id: 'late-read', taskRef: refOf(1), memberRef: member.memberRef, turnRef: member.turnRef,
    phase: member.phase, turn: member.turn, queuedAt: origin + 10, expectAt: origin }
  const event = transitionSnapshot(2, hostA, origin + 1_300, [{ ...target, codexMembers: [member], codexMemberTotal: 1 }])
  const output = await checkTransitions(measurementManifest([transition], { deadlineMs: 5_000 }), [{
    ...event,
    inventory: { latest: {
      segment: 'targeted', reason: 'targeted-dispatch', taskRef: target.taskRef, members: [{ memberRef: member.memberRef }],
      queuedAt: transition.queuedAt, requestedAt: transition.queuedAt + 1_001, readCount: 1, durationMs: 1_001
    } }
  }])
  expect(output.body).toMatchObject({ verdict: 'fail', reason: 'dispatch-timeout', dispatchTimeouts: 1 })
}, 10_000)

it('accepts direct hot mode evidence and ignores a reconnect that starts later', async () => {
  const expectAt = origin + 10_000
  const publishedAt = expectAt + 1_000
  const memberRef = refOf(11)
  const turnRef = refOf(31)
  const expected = {
    id: 'direct', taskRef: refOf(1), memberRef, turnRef, phase: 'running', turn: 'turn-running', expectAt, connectionMode: 'normal'
  }
  const task = {
    ...transitionTask(1, 1),
    codexMembers: [{ memberRef, turnRef, root: true, phase: 'running', turn: 'turn-running', turnStartedAt: 1, terminalAt: 0, unread: false }],
    codexMemberTotal: 1
  }
  const baseline = transitionSnapshot(1, hostA, origin, [])
  const packaged = transitionSnapshot(2, hostA, publishedAt, [task])
  packaged.package.packageRevision = 7
  const stale = { segment: 'page', readCount: 1, totalCount: 4, truncated: true, coverage: 'partial', emittedAt: origin - 1, observedAt: origin - 1 }
  const live = (sequence: number, evidence: object) => ({
    schema: transitionSchema, hostGeneration: hostA, sequence, type: 'inventory',
    inventory: {
      firstReadbackAt: origin + 5, latest: stale,
      segments: [{ segment: 'page', coverage: 'partial', readCount: 1, totalCount: 4, truncated: true }],
      hotUpdateEvidence: evidence
    }
  })
  const member = (connectionMode: string, connectionSince?: number) => ({
    memberRef, turnRef, taskRef: refOf(1), connectionMode, ...(connectionSince === undefined ? {} : { connectionSince })
  })
  const manifest = measurementManifest([expected], { hotUpdate: true, deadlineMs: 6_000 })
  const run = (events: object[]) => checkTransitions(manifest, [baseline, packaged, ...events])
  const direct = await run([live(3, { segment: 'targeted', reason: 'stream-evidence', emittedAt: publishedAt, members: [member('normal', expectAt)] })])
  expect(direct.body.items[0]).toMatchObject({ status: 'timely', reason: 'ok' })
  expect(direct.body.mismatched).toBe(0)
  expect(direct.body.inventory).toMatchObject({ coverage: 'partial', readCount: 1, totalCount: 4, firstReadbackAt: origin + 5 })
  expect(direct.body.inventory.hotUpdateEvidence).toBeUndefined()
  const reconnected = await run([
    live(3, { segment: 'targeted', reason: 'stream-evidence', emittedAt: publishedAt, members: [member('normal', expectAt)] }),
    live(4, { segment: 'targeted', reason: 'rollout-evidence', emittedAt: publishedAt + 10, members: [member('disconnected', expectAt + 20)] })
  ])
  expect(reconnected.body.items[0]).toMatchObject({ status: 'timely', reason: 'ok' })
  expect(reconnected.body.mismatched).toBe(0)
  const historical = await run([live(3, { segment: 'targeted', reason: 'stream-evidence', emittedAt: publishedAt, members: [member('normal', expectAt + 1)] })])
  expect(historical.body.items[0]).toMatchObject({ status: 'pending', reason: 'evidence-unverified' })
  expect(historical.body.mismatched).toBe(0)
  const legacy = await run([live(3, { segment: 'targeted', reason: 'stream-evidence', emittedAt: publishedAt, members: [member('normal')] })])
  expect(legacy.body.items[0]).toMatchObject({ status: 'timely', reason: 'ok' })
  const mislabeled = await run([live(3, { segment: 'targeted', reason: 'rollout-evidence', emittedAt: publishedAt, members: [member('normal', expectAt)] })])
  expect(mislabeled.body.items[0]).toMatchObject({ status: 'pending', reason: 'evidence-unverified' })
  const lateEmit = await run([live(3, {
    segment: 'targeted', reason: 'stream-evidence', emittedAt: publishedAt + 1,
    members: [{ ...member('normal', expectAt), statusRequestedAt: publishedAt - 10, statusReceivedAt: publishedAt }]
  })])
  expect(lateEmit.body.items[0]).toMatchObject({ status: 'pending', reason: 'evidence-unverified' })
  const readback = transitionSnapshot(5, hostA, publishedAt, [task])
  readback.package.packageRevision = 7
  readback.inventory = { latest: { segment: 'targeted', packageRevision: 7, observedAt: publishedAt, members: [{
    memberRef, turnRef, taskRef: refOf(1), connectionMode: 'normal', connectionSince: expectAt
  }] } }
  expect((await run([readback])).body.items[0]).toMatchObject({ status: 'timely', reason: 'ok' })
  const lateRead = transitionSnapshot(6, hostA, publishedAt, [task])
  lateRead.package.packageRevision = 7
  lateRead.inventory = { latest: { segment: 'targeted', packageRevision: 7, observedAt: publishedAt, members: [{
    memberRef, turnRef, connectionMode: 'normal', connectionSince: expectAt,
    statusRequestedAt: publishedAt, statusReceivedAt: publishedAt + 1
  }] } }
  expect((await run([lateRead])).body.items[0]).toMatchObject({ status: 'pending', reason: 'evidence-unverified' })
}, 20_000)

it('treats an unchanged hot target as propagation delay and still flags a real change', async () => {
  const expectAt = origin + 10_000
  const memberRef = refOf(11)
  const turnRef = refOf(31)
  const running = { memberRef, turnRef, root: true, phase: 'running', turn: 'turn-running', turnStartedAt: 1, terminalAt: 0, unread: false }
  const oldTask = { ...transitionTask(1, 1), codexMembers: [running], codexMemberTotal: 1 }
  const other = transitionTask(2, 2)
  const readyMember = { ...running, phase: 'completed', turn: 'turn-completed', connectionMode: 'normal', statusRequestedAt: expectAt + 10, statusReceivedAt: expectAt + 20 }
  const readyTask = { ...transitionTask(1, 1, 'completed', 'turn-completed'), codexMembers: [readyMember], codexMemberTotal: 1 }
  const expected = {
    id: 'native-1', taskRef: refOf(1), memberRef, turnRef, phase: 'completed', turn: 'turn-completed', expectAt, connectionMode: 'normal'
  }
  const manifest = measurementManifest([expected], { hotUpdate: true, deadlineMs: 6_000 })
  const baseline = transitionSnapshot(1, hostA, origin, [oldTask])
  const propagated = transitionSnapshot(2, hostA, expectAt + 400, [oldTask, other])
  const correct = transitionSnapshot(3, hostA, expectAt + 800, [readyTask, other])
  correct.inventory = { latest: { segment: 'targeted', observedAt: expectAt + 20, members: [readyMember] } }
  const delayed = await checkTransitions(manifest, [baseline, propagated, correct])
  expect(delayed.body.intermediate).toBe(0)
  expect(delayed.body.reason).not.toBe('intermediate-error')
  expect(delayed.body.items[0]).toMatchObject({ status: 'timely', latencyMs: 800 })
  const wrong = { ...oldTask, phase: 'stopped', codexMembers: [{ ...running, phase: 'stopped', turn: 'turn-interrupted' }] }
  const changed = transitionSnapshot(2, hostA, expectAt + 400, [wrong, other])
  const bad = await checkTransitions(manifest, [baseline, changed, correct])
  expect(bad.body).toMatchObject({ verdict: 'fail', reason: 'intermediate-error', intermediate: 1 })
  const capturedOnly = transitionSnapshot(2, hostA, expectAt + 100, [readyTask])
  delete capturedOnly.package.publishedAt
  capturedOnly.package.capturedAt = expectAt + 100
  const scored = await checkTransitions(manifest, [baseline, capturedOnly, correct])
  expect(scored.body.items[0]).toMatchObject({ status: 'timely', latencyMs: 800 })
  expect(scored.body.intermediate).toBe(0)
  const stale = transitionSnapshot(4, hostA, expectAt + 800, [readyTask])
  stale.package.packageRevision = 7
  stale.inventory = { latest: { segment: 'targeted', packageRevision: 7, observedAt: expectAt - 1, members: [{
    ...readyMember, statusRequestedAt: expectAt - 30, statusReceivedAt: expectAt - 1
  }] } }
  expect((await checkTransitions(manifest, [baseline, stale])).body.items[0]).toMatchObject({ status: 'pending', reason: 'evidence-unverified' })
}, 20_000)

it('reports a hot dispatch timeout when the correct package never arrives', async () => {
  const expectAt = origin + 1_000
  const queuedAt = expectAt
  const memberRef = refOf(11)
  const turnRef = refOf(31)
  const expected = {
    id: 'late-read', taskRef: refOf(1), memberRef, turnRef, phase: 'running', turn: 'turn-running',
    expectAt, connectionMode: 'normal', queuedAt
  }
  const baseline = transitionSnapshot(1, hostA, origin, [])
  const missed = transitionSnapshot(2, hostA, expectAt + 100, [])
  missed.inventory = { latest: {
    segment: 'targeted', reason: 'targeted-dispatch', taskRef: refOf(1),
    members: [{ memberRef, turnRef }], queuedAt, requestedAt: queuedAt + 1_001, readCount: 1, durationMs: 1_001
  } }
  const result = await checkTransitions(measurementManifest([expected], { hotUpdate: true, deadlineMs: 6_000 }), [baseline, missed])
  expect(result.body).toMatchObject({ verdict: 'fail', reason: 'dispatch-timeout', dispatchTimeouts: 1 })
  expect(result.body.items[0]).toMatchObject({ status: 'dispatch-timeout', reason: 'dispatch-timeout' })
}, 10_000)
