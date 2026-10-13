import { mkdtempSync, readFileSync, readdirSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkCompanionLifecycles } from '../../scripts/check-companion-lifecycles.mjs'

async function withMutation(mutate: (source: string) => string) {
  const temporary = mkdtempSync(join(tmpdir(), 'eypc-lifecycle-'))
  try {
    const root = resolve('preload')
    for (const entry of readdirSync(root)) {
      if (entry !== 'companion') symlinkSync(join(root, entry), join(temporary, entry))
    }
    mkdirSync(join(temporary, 'companion'))
    for (const entry of readdirSync(join(root, 'companion'))) {
      if (entry !== 'task-kernel.cjs') symlinkSync(join(root, 'companion', entry), join(temporary, 'companion', entry))
    }
    writeFileSync(join(temporary, 'companion/task-kernel.cjs'), mutate(readFileSync(join(root, 'companion/task-kernel.cjs'), 'utf8')))
    await expect(checkCompanionLifecycles(temporary)).rejects.toThrow()
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}

describe('Companion unread and Side lifecycle preservation gate', () => {
  it('covers complete/incomplete retirement, stale evidence, nested sides, unread and open races', async () => {
    expect(await checkCompanionLifecycles(resolve('preload'))).toBe(17)
  })
  it('rejects stale relation deletion in a newer transport batch', async () => {
    await withMutation(source => {
      const guard = 'if (enabledProviders.has(provider) && topologyGeneration >= topologyCurrent) {'
      expect(source).toContain(guard)
      return source.replace(guard, 'if (enabledProviders.has(provider)) {')
    })
  })
  it('rejects invalidating admitted relations with an unrelated newer global topology generation', async () => {
    await withMutation(source => {
      const entry = 'relations: [...relationStore.values()]\n    })'
      expect(source).toContain(entry)
      return source.replace(entry, "relations: [...relationStore.values()], generationFloor: Object.fromEntries(PROVIDERS.map(provider => [provider, currentPackage.sourceLaneGenerations[provider].topology]))\n    })")
    })
  })
  it('rejects using the global generation floor when removing the archived family', async () => {
    await withMutation(source => {
      const entry = 'relations: [...relationStore.values()]\n    })'
      const index = source.lastIndexOf(entry)
      expect(index).toBeGreaterThan(0)
      return source.slice(0, index) + source.slice(index).replace(entry,
        "relations: [...relationStore.values()], generationFloor: Object.fromEntries(PROVIDERS.map(provider => [provider, currentPackage.sourceLaneGenerations[provider].topology]))\n    })")
    })
  })
  it('rejects root phase diagnostics that lose the Provider namespace used by Side topology', async () => {
    await withMutation(source => {
      const entry = "event: 'phase-transition',\n        outcome: task.phase,\n        provider: task.provider,"
      expect(source).toContain(entry)
      return source.replace(entry, "event: 'phase-transition',\n        outcome: task.phase,")
    })
  })
})
