import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { changedFiles, countVerifiedTests, executePlan, matches, runCommand, selectChecks, validateMap } from '../../scripts/verify-core-changes.mjs'
import type { CoreMap } from '../../scripts/verify-core-changes.mjs'

const directories: string[] = []
function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'eypc-core-tests-')); directories.push(repo)
  const put = (file: string, text = '') => { mkdirSync(join(repo, file, '..'), { recursive: true }); writeFileSync(join(repo, file), text) }
  put('src/core.ts', 'export const x = 1')
  put('scripts/ok.mjs', 'console.log("verified: 1")')
  put('tests/core.test.ts', '// fixture')
  put('vibe/specs/requirements/core.md', '---\nqualified_source: SPEC-TEST::RAW-001\nstatus: active\n---\n')
  const map: CoreMap = { version: 1, protected: ['src/*', 'tests/*'], governance: ['map.json'], exclusions: ['*mqtt*'],
    guards: [{ id: 'core', sources: ['SPEC-TEST::RAW-001'], paths: ['src/core.ts'], checks: ['core'], boundary: 'offline only' }],
    checks: [{ id: 'core', kind: 'node', files: ['scripts/ok.mjs'], receipt: { pattern: 'verified: (\\d+)', minimum: 1 } }] }
  return { repo, map, put }
}
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('core verification selection and evidence', () => {
  it('selects the exact owner with requirement and reason; docs-only is explicitly not tested', () => {
    const { repo, map } = fixture(); validateMap(map, repo)
    expect(selectChecks(map, ['src/core.ts']).guards[0]).toMatchObject({ sources: ['SPEC-TEST::RAW-001'], reasons: ['src/core.ts'] })
    expect(selectChecks(map, ['README.md']).checks).toEqual([])
    expect(selectChecks(map, ['map.json']).checks).toHaveLength(1)
    expect(selectChecks(map, ['src/mqtt.ts']).excluded).toEqual(['src/mqtt.ts'])
  })
  it('rejects unknown core paths, stale requirements and missing checks instead of running a full suite', () => {
    const { repo, map, put } = fixture()
    expect(() => selectChecks(map, ['src/new.ts'])).toThrow('unmapped core change')
    put('vibe/specs/requirements/core.md', 'qualified_source: SPEC-TEST::RAW-001\nstatus: superseded\n')
    expect(() => validateMap(map, repo)).toThrow('inactive or missing requirement')
    map.checks[0].files = ['scripts/missing.mjs']
    expect(() => validateMap(map, repo)).toThrow('missing check file')
  })
  it('rejects nonexistent owner patterns and shell-shaped executable paths', () => {
    const { repo, map } = fixture()
    map.guards[0].paths = ['src/gone/*']
    expect(() => validateMap(map, repo)).toThrow('missing owner/consumer')
    map.checks[0].files = ['scripts/ok.mjs;touch injected']
    expect(() => validateMap(map, repo)).toThrow('invalid executable path')
    expect(() => selectChecks(map, ['../src/core.ts'])).toThrow('unsafe changed path')
    expect(matches('src/coreXts', 'src/core.ts')).toBe(false)
  })
  it('includes rename old/new, deletion, unstaged and untracked NUL-delimited names', () => {
    const calls: string[][] = []
    const read = (_repo: string, args: string[]) => { calls.push(args); return args[0] === 'diff' ? 'old.ts\0new.ts\0deleted.ts\0space and\nnewline.ts\0' : 'untracked.ts\0' }
    expect(changedFiles('/fixture', {}, read)).toEqual(['deleted.ts', 'new.ts', 'old.ts', 'space and\nnewline.ts', 'untracked.ts'])
    expect(calls[0]).toContain('--no-renames'); expect(calls[0]).toContain('HEAD')
    calls.length = 0; changedFiles('/fixture', { staged: true }, read)
    expect(calls).toHaveLength(1); expect(calls[0]).toContain('--cached')
    expect(() => changedFiles('/fixture', { base: '--output=bad' }, read)).toThrow('invalid base ref')
  })
  it('rejects skipped-only, missing-file and failed Vitest reports despite a zero exit code', () => {
    const report = (status: string) => ({ success: true, numFailedTests: 0, testResults: [{ name: '/repo/tests/core.test.ts', assertionResults: [{ status }] }] })
    expect(countVerifiedTests(report('passed'), ['tests/core.test.ts'])).toBe(1)
    expect(() => countVerifiedTests(report('pending'), ['tests/core.test.ts'])).toThrow('zero or failed')
    expect(() => countVerifiedTests(report('failed'), ['tests/core.test.ts'])).toThrow('zero or failed')
    expect(() => countVerifiedTests(report('passed'), ['tests/missing.test.ts'])).toThrow('zero or failed')
    expect(() => countVerifiedTests(report('passed'), ['tests/core.test.ts'], ['required exact case'])).toThrow('named test scope mismatch')
  })
  it('executes real bounded checks; failure, timeout and excess output cannot pass', async () => {
    const { repo, map, put } = fixture(); const plan = selectChecks(map, ['src/core.ts'])
    expect((await executePlan(repo, map, plan)).status).toBe('passed')
    put('scripts/ok.mjs', '// exited zero without executing any checks')
    expect((await executePlan(repo, map, plan)).results[0].reason).toBe('missing-or-empty-execution-receipt')
    put('scripts/ok.mjs', 'process.exit(7)')
    expect((await executePlan(repo, map, plan)).status).toBe('failed')
    expect((await runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: repo, timeoutMs: 100 })).reason).toBe('timeout')
    expect((await runCommand(process.execPath, ['-e', 'console.log("x".repeat(5000))'], { cwd: repo, maxBytes: 100 })).reason).toBe('output-limit')
  })
  it('invalidates evidence when a selected input changes during execution', async () => {
    const { repo, map, put } = fixture()
    const result = await executePlan(repo, map, selectChecks(map, ['src/core.ts']), async () => {
      put('src/core.ts', 'changed while running'); return { ok: true, reason: null, output: 'verified: 1' }
    })
    expect(result).toMatchObject({ status: 'stale', fresh: false })
    expect(Object.keys(result).sort()).toEqual(['fresh', 'inputDigest', 'results', 'revision', 'status'])
  })
  it('hashes indirect dependencies and requirement authorities even outside selector paths', async () => {
    const { repo, map, put } = fixture()
    put('preload/indirect.cjs', 'old dependency')
    const result = await executePlan(repo, map, selectChecks(map, ['src/core.ts']), async () => {
      put('preload/indirect.cjs', 'new dependency'); return { ok: true, reason: null, output: 'verified: 1' }
    })
    expect(result.status).toBe('stale')
  })
  it('routes shared production entries and test configuration to every registered affected domain', () => {
    const map = JSON.parse(readFileSync('vibe/knowledge/core-verification-map.json', 'utf8')) as CoreMap
    expect(selectChecks(map, ['preload/index.js']).guards.map(guard => guard.id).sort()).toEqual([
      'companion-state', 'favorites', 'interaction', 'ports', 'provider-evidence', 'settings', 'windows'
    ])
    expect(selectChecks(map, ['vite.config.ts']).guards).toHaveLength(map.guards.length)
    expect(selectChecks(map, ['vibe/rules/local-context.md']).guards).toHaveLength(map.guards.length)
    expect(selectChecks(map, ['preload/orca/inventory.cjs']).checks.map(check => check.id)).toEqual(expect.arrayContaining(['mirrors', 'working-mirrors']))
    for (const id of ['keybindings', 'settings-state']) {
      expect(map.checks.find(check => check.id === id)?.testNames).not.toEqual(expect.arrayContaining([expect.stringMatching(/MQTT/)]))
    }
  })
  it('requires the JSON test report and never calls empty plans passed', async () => {
    const { repo, map } = fixture()
    map.checks[0] = { id: 'core', kind: 'vitest', files: ['tests/core.test.ts'], receipt: { pattern: 'unused', minimum: 1 } }
    const result = await executePlan(repo, map, selectChecks(map, ['src/core.ts']), async () => ({ ok: true, reason: null, output: '' }))
    expect(result.results[0].reason).toBe('invalid-or-empty-test-report')
    expect((await executePlan(repo, map, selectChecks(map, []))).status).toBe('no-affected-checks')
  })
})
