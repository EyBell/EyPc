import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

const require_ = createRequire(import.meta.url)
const codeSessions = require_(resolve(process.cwd(), 'preload/claude/code-sessions.cjs')) as {
  projectKeyForMetadata(dependencies: Record<string, unknown>, metadata: Record<string, unknown>): string
}

const NUL = String.fromCharCode(0)

/** The Codex recipe, transcribed from `codexProjectKey` in preload/codex/native-registry.cjs. */
function codexProjectKey(roots: readonly string[]): string {
  return createHash('sha256')
    .update(`codex-project${NUL}${[...roots].sort().join(NUL)}`)
    .digest('hex')
    .slice(0, 32)
}

/**
 * A project is one product concept spanning both Providers: the same directory
 * must group the same way whether its sessions came from Codex or Claude. That
 * contract is carried by two separate hash implementations — one in the Codex
 * native registry, one in the Claude inventory reader — because the entry deliberately
 * performs no unguarded local require, so the recipe cannot simply be shared.
 *
 * What matters is the derived value, not the shared code, so it is the value
 * that is asserted here. If either side is edited alone this test fails, and a
 * silent divergence would otherwise split one project into two rows.
 */
describe('project identity agrees across providers', () => {
  const dependencies = { fs, path, platform: process.platform }

  it('derives the same key for the same single project root', () => {
    const root = process.cwd()
    const claudeKey = codeSessions.projectKeyForMetadata(dependencies, { originCwd: root })
    expect(claudeKey).toHaveLength(32)
    expect(claudeKey).toBe(codexProjectKey([root]))
  })

  it('prefers originCwd over cwd, matching the Codex root normalization', () => {
    const root = process.cwd()
    const key = codeSessions.projectKeyForMetadata(dependencies, { originCwd: root, cwd: '/nonexistent/other' })
    expect(key).toBe(codexProjectKey([root]))
  })

  it('yields no key when there is no usable root', () => {
    expect(codeSessions.projectKeyForMetadata(dependencies, {})).toBe('')
    expect(codeSessions.projectKeyForMetadata(dependencies, { cwd: 'relative/path' })).toBe('')
  })

  it('keeps both implementations on the same documented recipe', () => {
    // The Codex side has moved between files under RAW-169, so search the entry
    // and the whole `preload/codex/` group rather than naming one file — and
    // require exactly one match, which pins single ownership at the same time.
    const codexDirectory = resolve(process.cwd(), 'preload/codex')
    const codexSide = [
      { name: 'preload/index.js', source: readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8') },
      ...readdirSync(codexDirectory)
        .filter((file) => file.endsWith('.cjs'))
        .map((file) => ({ name: `preload/codex/${file}`, source: readFileSync(join(codexDirectory, file), 'utf8') }))
    ]
    const recipe = /createHash\('sha256'\)[\s\S]{0,40}codex-project/
    const owners = codexSide.filter((candidate) => recipe.test(candidate.source)).map((candidate) => candidate.name)
    expect(owners, 'exactly one Codex-side definition of the project-key recipe').toHaveLength(1)

    const readerSource = readFileSync(resolve(process.cwd(), 'preload/claude/code-sessions.cjs'), 'utf8')
    for (const source of [codexSide.find((candidate) => candidate.name === owners[0])!.source, readerSource]) {
      expect(source).toMatch(recipe)
      expect(source).toMatch(/digest\('hex'\)\.slice\(0, 32\)/)
    }
  })
})
