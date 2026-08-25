import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const scriptPath = resolve(root, 'scripts/validate-preload-entry-budget.mjs')
const entryPath = resolve(root, 'preload/index.js')

function runBudget(entryOverride?: string) {
  // The script reads `preload/index.js` relative to its own location, so an
  // override is exercised by running a copy of the script whose entry path is
  // redirected at a scratch file. This keeps the real entry untouched.
  const dir = mkdtempSync(resolve(tmpdir(), 'eypc-budget-'))
  try {
    const script = readFileSync(scriptPath, 'utf8')
    const scratchEntry = resolve(dir, 'entry.js')
    writeFileSync(scratchEntry, entryOverride ?? readFileSync(entryPath, 'utf8'))
    writeFileSync(
      resolve(dir, 'budget.mjs'),
      script.replace("resolve(root, 'preload/index.js')", JSON.stringify(scratchEntry))
    )
    const stdout = execFileSync(process.execPath, [resolve(dir, 'budget.mjs')], { encoding: 'utf8' })
    return { ok: true as const, stdout }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string }
    return { ok: false as const, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('preload entry budget ratchet', () => {
  it('passes on the current entry and reports all three measurements', () => {
    const result = runBudget()
    expect(result.ok).toBe(true)
    expect(result.stdout).toContain('preload entry budget:')
    expect(result.stdout).toContain('preload entry budget validation passed')
  })

  it('fails when the entry grows past the recorded line budget', () => {
    const grown = readFileSync(entryPath, 'utf8') + '\n' + Array.from({ length: 40 }, () => '// growth').join('\n') + '\n'
    const result = runBudget(grown)
    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('entry lines')
    expect(result.stderr).toContain('exceeds the recorded budget')
  })

  it('fails when a new top-level codex function is added', () => {
    const grown = readFileSync(entryPath, 'utf8').replace(
      /^function /m,
      'function codexBudgetProbeAdded() { return null }\n\nfunction '
    )
    const result = runBudget(grown)
    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('top-level codex functions')
  })

  it('fails when a new module-level mutable binding is added', () => {
    const grown = 'let codexBudgetProbeState = null\nconst codexBudgetProbeCache = new Map()\n'
      + readFileSync(entryPath, 'utf8')
    const result = runBudget(grown)
    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('module-level mutable bindings')
  })

  it('fails when the entry drops below a budget so the ceiling follows the floor', () => {
    // A strict ratchet: a ceiling left above the floor has no tension, because
    // the next round of growth would be free up to the stale number. The error
    // names the exact value to write back, so the fix is one edit.
    const shrunk = readFileSync(entryPath, 'utf8').split('\n').slice(0, -30).join('\n') + '\n'
    const result = runBudget(shrunk)
    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('is below the recorded budget')
    expect(result.stderr).toContain('keeps its tension')
  })

  it('counts verb-first codex names that a prefix filter would miss', () => {
    // The infix match is the whole point: `installCodexFloatIpc` and friends do
    // not start with the domain word, and a prefix filter undercounts by more
    // than half -- the exact failure recorded in RAW-169's error memory.
    const stripped = readFileSync(entryPath, 'utf8')
    const declarations = stripped.match(/^(?:async )?function ([A-Za-z][A-Za-z0-9_]*)\s*\(/gm) || []
    const infix = declarations.filter((line) => line.includes('odex')).length
    const prefixOnly = declarations.filter((line) => /^(?:async )?function codex/.test(line)).length
    expect(infix).toBeGreaterThan(prefixOnly)
  })
})
