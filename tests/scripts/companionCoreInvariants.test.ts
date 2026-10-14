import { mkdtempSync, readFileSync, readdirSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkCompanionCoreInvariants } from '../../scripts/check-companion-core-invariants.mjs'

const manifest = JSON.parse(readFileSync(resolve('preload/companion/provider-manifest.json'), 'utf8')) as { order: string[] }
const aggregationSource = 'const phaseMembers = preserveRootInput ? [root] : members'

function expectAggregationMutationRejected(replacement: string, message: RegExp) {
  const temporary = mkdtempSync(join(tmpdir(), 'eypc-preservation-'))
  try {
    const sourceRoot = resolve('preload')
    for (const entry of readdirSync(sourceRoot)) {
      if (entry !== 'companion') symlinkSync(join(sourceRoot, entry), join(temporary, entry))
    }
    const companion = join(temporary, 'companion')
    mkdirSync(companion)
    for (const entry of readdirSync(join(sourceRoot, 'companion'))) {
      if (entry !== 'task-kernel.cjs') symlinkSync(join(sourceRoot, 'companion', entry), join(companion, entry))
    }
    const source = readFileSync(join(sourceRoot, 'companion/task-kernel.cjs'), 'utf8')
    expect(source.includes(aggregationSource), 'Kernel aggregation mutation target exists').toBe(true)
    writeFileSync(join(companion, 'task-kernel.cjs'), source.replace(aggregationSource, replacement))
    expect(() => checkCompanionCoreInvariants(temporary)).toThrow(message)
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}

describe('independent Companion core preservation gate', () => {
  it('accepts the current source behavior', () => {
    // shared-raw-207.md keeps non-Codex approval priority; its scoped Codex
    // replacement preserves root input. The gate owns the literal oracle.
    expect(checkCompanionCoreInvariants(resolve('preload'))).toBe(40)
  })

  it('rejects child-only aggregation even if ordinary test expectations were changed to accept it', () => {
    expectAggregationMutationRejected(
      'const phaseMembers = preserveRootInput ? [root] : members.length > 1 ? members.filter(node => node.key !== root.key) : members',
      /codex: main activity survives historical stopped side: phase/
    )
  })

  it.each(manifest.order)('rejects child-only aggregation isolated to %s', provider => {
    // Mutate only running roots so Provider-specific input priority cannot
    // trigger an earlier failure than the historical-member preservation check.
    expectAggregationMutationRejected(
      `const phaseMembers = preserveRootInput ? [root] : root.provider === ${JSON.stringify(provider)} && root.phase === 'running' && members.length > 1 ? members.filter(node => node.key !== root.key) : members`,
      new RegExp(`${provider}: main activity survives historical stopped side: phase`)
    )
  })
})
