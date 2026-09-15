import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
const require_ = createRequire(import.meta.url)
const { createFreezeTrace, metrics } = require_(resolve('preload/freeze-trace.cjs'))
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('independent freeze recorder', () => {
  it('allows numeric metrics only and preserves sync/async results and exceptions', async () => {
    expect(metrics({ count: 2, bytes: 3, prompt: 'secret', path: '/private', title: 'private', durationMs: Infinity })).toEqual({ count: 2, bytes: 3 })
    const trace = createFreezeTrace({ enabled: false })
    expect(trace.run('test.sync', () => 7)).toBe(7)
    const promise = Promise.resolve(9)
    expect(trace.run('test.async', () => promise)).toBe(promise)
    expect(await promise).toBe(9)
    expect(() => trace.run('test.throw', () => { throw new Error('original') })).toThrow('original')
    trace.stop()
  })

  it('records a main-thread stall while that thread cannot drain its own log queue', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'eypc-freeze-test-'))
    const modulePath = resolve('preload/freeze-trace.cjs')
    const child = spawn(process.execPath, ['-e', `
      const trace = require(${JSON.stringify(modulePath)}).createFreezeTrace({ directory: ${JSON.stringify(directory)}, intervalMs: 20, stallMs: 80, durationMs: 2000 });
      setTimeout(() => {
        const span = trace.begin('test.blocked-call', { count: 200, prompt: 'SECRET-CONTENT' });
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
        trace.end(span);
        setTimeout(() => { trace.stop(); }, 100);
      }, 150);
    `], { stdio: 'ignore' })
    try {
      const exit = await new Promise<number | null>((resolve, reject) => { child.once('exit', resolve); child.once('error', reject) })
      expect(exit).toBe(0)
      const text = readdirSync(directory).map(name => readFileSync(join(directory, name), 'utf8')).join('')
      const events = text.trim().split('\n').map(line => JSON.parse(line))
      expect(events.some(row => row.type === 'main-stall' && row.pending.some((span: any) => span.op === 'test.blocked-call'))).toBe(true)
      expect(events.some(row => row.type === 'end' && row.op === 'test.blocked-call' && row.durationMs >= 290)).toBe(true)
      expect(text).not.toContain('SECRET-CONTENT')
    } finally { child.kill(); rmSync(directory, { recursive: true, force: true }) }
  })

  it('expires automatically and keeps the file under its byte budget', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'eypc-freeze-test-'))
    const trace = createFreezeTrace({ directory, durationMs: 100, intervalMs: 10, maxBytes: 1000 })
    try {
      await sleep(300)
      expect(trace.snapshot().stopped).toBe(true)
      const text = readdirSync(directory).map(name => readFileSync(join(directory, name), 'utf8')).join('')
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(1000)
      expect(text).toContain('eypc-freeze-trace-v1')
    } finally { trace.stop(); await sleep(50); rmSync(directory, { recursive: true, force: true }) }
  })
})

it('bounds outstanding messages when the writer cannot acknowledge yet', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eypc-freeze-test-'))
  const trace = createFreezeTrace({ directory, durationMs: 100, intervalMs: 10 })
  try {
    for (let i = 0; i < 1000; i++) trace.begin('test.pressure')
    expect(trace.snapshot().outstanding).toBeLessThanOrEqual(256)
    expect(trace.snapshot().dropped).toBeGreaterThan(0)
  } finally { trace.stop(); await sleep(200); rmSync(directory, { recursive: true, force: true }) }
})

it('summarizes missing ends and truncated tails without treating either as causation', async () => {
  // @ts-ignore standalone operational script has no declaration file
  const { summarize } = await import('../../scripts/summarize-freeze-trace.mjs')
  const summary = summarize([
    JSON.stringify({ revision: 'eypc-freeze-trace-v1', type: 'begin', id: 1, op: 'test.wait' }),
    JSON.stringify({ revision: 'eypc-freeze-trace-v1', type: 'main-stall', dropped: 2 }),
    '{truncated'
  ].join('\n'))
  expect(summary).toMatchObject({ incomplete: ['test.wait'], stalls: 1, dropped: 2, malformed: 1 })
  expect(summary.interpretation).toContain('not proof of causation')
})

it('keeps business calls usable after the file worker fails', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eypc-freeze-test-'))
  const trace = createFreezeTrace({ directory: join(directory, '\0invalid'), durationMs: 100, intervalMs: 10 })
  try {
    await sleep(200)
    expect(trace.snapshot().stopped).toBe(true)
    expect(trace.run('test.after-failure', () => 42)).toBe(42)
  } finally { trace.stop(); rmSync(directory, { recursive: true, force: true }) }
})
