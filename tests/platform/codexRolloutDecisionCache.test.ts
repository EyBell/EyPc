import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

// Exercise the exact preload owner with content-free host doubles. The
// integration suite independently guards waiting/Plan/runtime state semantics.
function harness() {
  const source = fs.readFileSync(path.resolve('preload/index.js'), 'utf8')
  const begin = source.indexOf('function codexRefreshRolloutDecisionTracker(')
  const end = source.indexOf('\nfunction codexRefreshRolloutDecisionTrackers(', begin)
  const state = { input: { pending: true, correlations: new Set(['question']) }, plan: { pending: false }, runtime: { phase: 'active' } }
  const tracker: any = { candidate: 'synthetic', signature: '100:1', size: 100, inputCorrelations: new Set() }
  let stat = { isFile: () => true, size: 100, mtimeMs: 1 }
  const parse = vi.fn(() => state)
  const apply = vi.fn((..._args: any[]) => true)
  const sandbox: any = { fs: { statSync: () => stat }, codexRolloutDecisionTrackers: new Map([['thread', tracker]]),
    codexTimestampMs: (value: number) => value, codexRolloutDecisionState: parse, codexApplyRolloutDecisionState: apply }
  vm.runInNewContext(source.slice(begin, end), sandbox)
  return { tracker, state, parse, apply, refresh: sandbox.codexRefreshRolloutDecisionTracker,
    stat(value: Partial<typeof stat>) { stat = { ...stat, ...value } } }
}

describe('rollout decision cache', () => {
  it('parses once for 1,000 unchanged process probes and reapplies live evidence every time', () => {
    const h = harness()
    for (let i=0;i<1000;i++) h.refresh('thread', { force: true, observeRuntime: true })
    expect(h.parse).toHaveBeenCalledTimes(1)
    expect(h.apply).toHaveBeenCalledTimes(1000)
    expect(h.apply.mock.calls[999][1]).toBe(h.state)
    expect(h.apply.mock.calls[999][3]).toMatchObject({ observeRuntime: true })
  })
  it('invalidates on append, same-size rewrite, truncation, and size change with unchanged timestamp', () => {
    const h = harness();h.refresh('thread',{force:true})
    for (const stat of [{size:110},{mtimeMs:2},{size:90},{size:100}]) {
      h.stat(stat);h.refresh('thread',{force:true})
    }
    expect(h.parse).toHaveBeenCalledTimes(5)
    expect(h.tracker.signature).toBe('100:2')
  })
  it('reapplies cached state after close/reopen without reparsing or delaying the existing reducer', () => {
    const h=harness();h.refresh('thread',{force:true,observeRuntime:true})
    h.tracker.rolloutLiveSequence=0;h.tracker.externalOpen=false
    h.refresh('thread',{force:true,observeRuntime:true})
    expect(h.parse).toHaveBeenCalledTimes(1)
    expect(h.apply).toHaveBeenCalledTimes(2)
    expect(h.apply.mock.calls[1][1].input.pending).toBe(true)
  })
  it('does not advance the signature on a parsing failure and retries the same changed file', () => {
    const h=harness();h.refresh('thread',{force:true});h.stat({size:120,mtimeMs:2})
    h.parse.mockImplementationOnce(()=>{throw new Error('read-failed')})
    expect(h.refresh('thread',{})).toBe(false)
    expect(h.tracker.signature).toBe('100:1')
    h.refresh('thread',{})
    expect(h.parse).toHaveBeenCalledTimes(3)
    expect(h.tracker.signature).toBe('120:2')
  })
  it('keeps unchanged event callbacks cheap and forwards changed appends immediately', () => {
    const h=harness();h.refresh('thread',{force:true});h.parse.mockClear();h.apply.mockClear()
    expect(h.refresh('thread',{})).toBe(false)
    expect(h.parse).not.toHaveBeenCalled();expect(h.apply).not.toHaveBeenCalled()
    h.stat({size:101});h.refresh('thread',{emit:false})
    expect(h.parse).toHaveBeenCalledTimes(1)
    expect(h.apply.mock.calls[0][2]).toBe(false)
    expect(h.apply.mock.calls[0][3]).toMatchObject({observeRuntime:true})
  })
})
