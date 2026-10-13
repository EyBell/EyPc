import { mkdtempSync, readFileSync, readdirSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkCompanionCoreInvariants } from '../../scripts/check-companion-core-invariants.mjs'

describe('independent Companion core preservation gate', () => {
  it('accepts the current source behavior', () => {
    expect(checkCompanionCoreInvariants(resolve('preload'))).toBe(10)
  })

  it('rejects child-only aggregation even if ordinary test expectations were changed to accept it', () => {
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
      const original = 'const phaseMembers = preserveRootInput ? [root] : members'
      expect(source).toContain(original)
      writeFileSync(join(companion, 'task-kernel.cjs'), source.replace(original,
        "const phaseMembers = preserveRootInput ? [root] : members.length > 1 ? members.filter(node => node.key !== root.key) : members"))
      expect(() => checkCompanionCoreInvariants(temporary)).toThrow(/main activity survives historical stopped side: phase/)
    } finally { rmSync(temporary, { recursive: true, force: true }) }
  })
})
