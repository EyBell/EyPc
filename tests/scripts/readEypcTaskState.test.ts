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

function transitionSnapshot<Task extends { taskRef: string }>(sequence: number, host: string, publishedAt: number, tasks: Task[], receipts: object[] = []) {
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
