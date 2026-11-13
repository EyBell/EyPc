import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { handleStop, inputDigest } from '../../scripts/codex-build-stop.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eypc-build-hook-'))
  roots.push(root)
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src/main.ts'), 'export const value = 1')
  return root
}

function event(root: string, extra = {}) {
  return { hook_event_name: 'Stop', cwd: root, session_id: 'fixture-session', stop_hook_active: false, ...extra }
}

function artifact(root: string) {
  mkdirSync(join(root, 'dist'), { recursive: true })
  writeFileSync(join(root, 'dist/runtime-identity.cjs'), `module.exports = ${JSON.stringify({
    coreVersion: 'V7', hostAssetId: 'fixture-host', rendererAssetId: 'fixture-renderer', builtAt: 'fixture-time'
  })}`)
}

function receipts(root: string) {
  const directory = join(root, '.codex/build-hook/receipts')
  return readdirSync(directory).filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')))
}

describe('Codex build Stop hook', () => {
  it('records each rebuild and reuse with anonymous session, source, timing and artifact identity', async () => {
    const root = fixture()
    const build = async () => { artifact(root); return { code: 0 } }
    await handleStop(event(root), { root, build })
    await handleStop(event(root), { root, build, source: 'hook' })
    const records = receipts(root)
    expect(records).toHaveLength(2)
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'rebuilt', source: 'manual', buildAttempted: true, exitCode: 0 }),
      expect.objectContaining({ status: 'reused', source: 'hook', buildAttempted: false, exitCode: null })
    ]))
    for (const record of records) {
      expect(record.sessionHash).toMatch(/^[a-f0-9]{64}$/)
      expect(Date.parse(record.finishedAt)).toBeGreaterThanOrEqual(Date.parse(record.startedAt))
      expect(record.identity.hostAssetId).toBe('fixture-host')
    }
    expect(new Set(records.map((record) => record.id)).size).toBe(2)
    expect(JSON.stringify(records)).not.toContain('fixture-session')
  })

  it('records failures and suppressed retries without persisting build output or arbitrary event fields', async () => {
    const root = fixture()
    const build = async () => ({ code: 1, reason: 'build-exit', output: 'fixture-private-output' })
    await handleStop(event(root, { prompt: 'fixture-private-prompt' }), { root, build })
    await handleStop(event(root), { root, build })
    const records = receipts(root)
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'failed', reason: 'build-failed', buildAttempted: true, exitCode: 1 }),
      expect.objectContaining({ status: 'failed', reason: 'unchanged-failed-input', buildAttempted: false })
    ]))
    expect(JSON.stringify(records)).not.toContain('fixture-private')
  })

  it('retains at most 100 receipts and records thrown errors without their raw messages', async () => {
    const root = fixture()
    const build = async () => { throw new Error('fixture-private-error') }
    for (let count = 0; count < 102; count += 1) {
      await expect(handleStop(event(root), { root, build })).rejects.toThrow('fixture-private-error')
    }
    const records = receipts(root)
    expect(records).toHaveLength(100)
    expect(records.every((record) => record.status === 'failed' && record.reason === 'hook-error')).toBe(true)
    expect(JSON.stringify(records)).not.toContain('fixture-private-error')
  })

  it('tracks shared script file symlink contents', () => {
    const root = fixture()
    const shared = fixture()
    mkdirSync(join(root, 'scripts'))
    symlinkSync(join(shared, 'src/main.ts'), join(root, 'scripts/shared.mjs'))
    const before = inputDigest(root)
    writeFileSync(join(shared, 'src/main.ts'), 'updated shared script')
    expect(inputDigest(root)).not.toBe(before)
  })

  it('reuses a successful unchanged artifact, skips docs-only edits and rebuilds changed source or artifact', async () => {
    const root = fixture()
    let calls = 0
    const build = async () => { calls += 1; artifact(root); return { code: 0 } }
    expect((await handleStop(event(root), { root, build })).systemMessage).toContain('已通过')
    writeFileSync(join(root, 'README.md'), 'docs only')
    expect(await handleStop(event(root), { root, build })).toEqual({})
    expect(calls).toBe(1)
    writeFileSync(join(root, 'src/main.ts'), 'export const value = 2')
    await handleStop(event(root), { root, build })
    expect(calls).toBe(2)
    writeFileSync(join(root, 'dist/runtime-identity.cjs'), 'damaged')
    await handleStop(event(root), { root, build })
    expect(calls).toBe(3)
  })

  it('ignores generated mirrors in the input digest', async () => {
    const root = fixture()
    const build = async () => {
      mkdirSync(join(root, 'public'), { recursive: true })
      writeFileSync(join(root, 'public/runtime-identity.cjs'), 'generated')
      writeFileSync(join(root, 'public/preload.js'), 'generated')
      artifact(root)
      return { code: 0 }
    }
    mkdirSync(join(root, 'public'))
    expect((await handleStop(event(root), { root, build })).systemMessage).toContain('已通过')
  })

  it('continues on failure once and never persists output or retries identical failed inputs', async () => {
    const root = fixture()
    let calls = 0
    const build = async () => { calls += 1; return { code: 1, reason: 'build-exit', output: 'fixture-output' } }
    const failed = await handleStop(event(root), { root, build })
    expect(failed.decision).toBe('block')
    expect(failed.reason).toContain('fixture-output')
    expect(readFileSync(join(root, '.codex/build-hook/state.json'), 'utf8')).not.toContain('fixture-output')
    expect((await handleStop(event(root, { stop_hook_active: true }), { root, build })).decision).toBeUndefined()
    expect(calls).toBe(1)
    writeFileSync(join(root, 'src/main.ts'), 'changed')
    expect((await handleStop(event(root, { stop_hook_active: true }), { root, build })).decision).toBeUndefined()
    expect(calls).toBe(2)
  })

  it('rejects a successful command when inputs changed during the build or the artifact is missing', async () => {
    const root = fixture()
    const build = async () => {
      writeFileSync(join(root, 'src/main.ts'), 'changed during build')
      artifact(root)
      return { code: 0 }
    }
    expect((await handleStop(event(root), { root, build })).reason).toContain('输入发生变化')
    const emptyRoot = fixture()
    expect((await handleStop(event(emptyRoot), { root: emptyRoot, build: async () => ({ code: 0 }) })).reason)
      .toContain('未生成完整产物')
  })

  it('serializes builds in the same checkout and ignores other projects and events', async () => {
    const root = fixture()
    let finish!: () => void
    const first = handleStop(event(root), { root, build: () => new Promise<{ code: number }>((resolve) => {
      finish = () => { artifact(root); resolve({ code: 0 }) }
    }) })
    expect((await handleStop(event(root), { root })).reason).toContain('构建锁')
    expect(receipts(root)).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'running', buildAttempted: true }),
      expect.objectContaining({ status: 'locked', reason: 'lock-busy', buildAttempted: false })
    ]))
    finish()
    await first
    expect(await handleStop(event(fixture()), { root })).toEqual({})
    expect(await handleStop(event(root, { hook_event_name: 'SubagentStop' }), { root })).toEqual({})
  })
})
