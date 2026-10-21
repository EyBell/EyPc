import { mkdtempSync, readFileSync, readdirSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname, basename } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkCompanionLifecycles } from '../../scripts/check-companion-lifecycles.mjs'

async function withMutation(mutate: (source: string) => string, target = 'companion/task-kernel.cjs', expectedError?: RegExp) {
  const temporary = mkdtempSync(join(tmpdir(), 'eypc-lifecycle-'))
  try {
    const root = resolve('preload')
    const directory = dirname(target)
    const file = basename(target)
    for (const entry of readdirSync(root)) {
      if (entry !== directory) symlinkSync(join(root, entry), join(temporary, entry))
    }
    mkdirSync(join(temporary, directory))
    for (const entry of readdirSync(join(root, directory))) {
      if (entry !== file) symlinkSync(join(root, directory, entry), join(temporary, directory, entry))
    }
    writeFileSync(join(temporary, target), mutate(readFileSync(join(root, target), 'utf8')))
    await expect(checkCompanionLifecycles(temporary)).rejects.toThrow(expectedError)
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}

describe('Companion unread and Side lifecycle preservation gate', () => {
  it('covers complete/incomplete retirement, stale evidence, nested sides, unread and open races', async () => {
    expect(await checkCompanionLifecycles(resolve('preload'))).toBe(58)
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
  it('rejects dropping a completed Side unread result while its sibling remains live', async () => {
    await withMutation(source => {
      const entry = 'const unread = aggregateMemberUnread(members)'
      expect(source).toContain(entry)
      return source.replace(entry, "const unread = aggregateMemberUnread(members.filter(node => node.phase === 'running' || node.phase === 'waiting-input'))")
    })
  })

  it('rejects accepting a terminal without complete newest canonical coverage', async () => {
    await withMutation(source => {
      const guard = 'shadow.canonicalLatestComplete !== true || '
      expect(source).toContain(guard)
      return source.replace(guard, '')
    }, 'codex/desktop-activity-resolution.cjs', /native Side incomplete-canonical must not complete/)
  })
  it('rejects an older owner completion while the previous owner is still running', async () => {
    await withMutation(source => {
      const guard = "if (previous?.ownerClientId && !sameOwner && previousLive"
      expect(source).toContain(guard)
      return source.replace(guard, 'if (false')
    }, 'codex/desktop-activity-resolution.cjs', /native Side previous-owner-live must not complete/)
  })
  it('rejects treating an ordinary Side as Goal-unsupported', async () => {
    await withMutation(source => {
      const guard = "shadow?.sideConversation !== true || shadow.ephemeral !== true\n      || typeof shadow.ownerClientId"
      expect(source).toContain(guard)
      return source.replace(guard, "shadow?.sideConversation !== true\n      || typeof shadow.ownerClientId")
    }, 'codex/desktop-shadow.cjs', /native Goal ordinary-side cannot imply unsupported/)
  })
  it('rejects ephemeral capability swallowing an explicit active Goal', async () => {
    await withMutation(source => {
      const entry = 'const goal = shadow.nativeGoal'
      expect(source).toContain(entry)
      return source.replace(entry, 'const goal = null')
    }, 'codex/desktop-shadow.cjs', /native Goal explicit-active preserves goalStatus/)
  })

  it('rejects admitting exact internal reviews as task members', async () => {
    await withMutation(source => {
      const start = source.indexOf('function isInternalReviewThreadSource(')
      expect(start).toBeGreaterThanOrEqual(0)
      const body = source.indexOf('{', start)
      return source.slice(0, body + 1) + '\nreturn false;\n' + source.slice(body + 1)
    }, 'codex/subagent-discovery.cjs', /exact internal review is excluded/)
  })
  it('rejects excluding ordinary spawned agents together with internal reviews', async () => {
    await withMutation(source => {
      const start = source.indexOf('function isInternalReviewThreadSource(')
      expect(start).toBeGreaterThanOrEqual(0)
      const body = source.indexOf('{', start)
      return source.slice(0, body + 1) + "\nif (value === 'subagent') return true;\n" + source.slice(body + 1)
    }, 'codex/subagent-discovery.cjs', /ordinary and unknown sources retain task membership/)
  })

  it('rejects ignoring exact main owner canonical terminals', async () => {
    await withMutation(source => source.replace('function codexDesktopCanonicalTerminalDecision(shadow, options = {}) {',
      "function codexDesktopCanonicalTerminalDecision(shadow, options = {}) {\nif (!shadow.sideConversation) return {};"),
    'codex/desktop-activity-resolution.cjs', /native main owner completion is accepted/)
  })
  it('rejects trusting an independent interrupted result over the same owner Turn', async () => {
    await withMutation(source => source.replace("function codexDesktopTerminalConflictsWithOwner(turn, shadow, turnRef = '') {",
      "function codexDesktopTerminalConflictsWithOwner(turn, shadow, turnRef = '') {\nreturn false;"),
    'codex/desktop-activity-resolution.cjs', /independent interrupted cannot override/)
  })
  it('rejects pairing a connector outcome with a different canonical epoch', async () => {
    await withMutation(source => source.replace('turnStartedAt: timestampMs(candidate.startedAt)',
      'turnStartedAt: timestampMs(shadow?.currentCanonicalTurn?.startedAt) || timestampMs(candidate.startedAt)'),
    'codex/desktop-activity-resolution.cjs', /inventory terminal status keeps its own epoch/)
  })

  it('rejects allowing a conflicting inventory terminal into the projection', async () => {
    await withMutation(source => source.replace("function codexDesktopInventoryTurnCandidate(turn, shadow, known, turnRef = '') {",
      "function codexDesktopInventoryTurnCandidate(turn, shadow, known, turnRef = '') {\nreturn turn;"),
    'codex/desktop-activity-resolution.cjs', /inventory owner conflict is rejected/)
  })

})
