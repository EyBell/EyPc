import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { buildCompanionTaskTopology } = require('../../preload/companion/task-topology.cjs') as {
  buildCompanionTaskTopology(input?: Record<string, unknown>): Record<string, any>
}

function node(key: string, overrides: Record<string, unknown> = {}) {
  return {
    key,
    provider: 'codex',
    family: 'family-a',
    phase: 'completed',
    unreadKnown: true,
    unread: false,
    standaloneEligible: true,
    revisionAt: 1,
    capabilities: { open: true, archive: true },
    ...overrides
  }
}

function relation(childKey: string, parentKey: string, overrides: Record<string, unknown> = {}) {
  return {
    childKey,
    parentKey,
    provider: 'codex',
    family: 'family-a',
    relation: 'subagent',
    authority: 'test-exact-identity',
    exact: true,
    generation: 1,
    ...overrides
  }
}

describe('Companion task topology', () => {
  it('resolves nested exact relations to one root and aggregates phase, unread, counts and archive safety', () => {
    const topology = buildCompanionTaskTopology({
      nodes: [
        node('root', { phase: 'completed', unreadKnown: true, unread: false }),
        node('child', { phase: 'running', unreadKnown: false }),
        node('nested', { phase: 'waiting-approval', unreadKnown: true, unread: true, error: true })
      ],
      relations: [
        relation('child', 'root', { relation: 'fork' }),
        relation('nested', 'child', { relation: 'side-thread' })
      ]
    })

    expect(topology.acceptedRelations).toHaveLength(2)
    expect(topology.rootByKey).toEqual({ root: 'root', child: 'root', nested: 'root' })
    expect(topology.roots).toHaveLength(1)
    expect(topology.roots[0]).toMatchObject({
      key: 'root',
      phase: 'waiting-approval',
      unreadKnown: true,
      unread: true,
      capabilities: { open: true, archive: false },
      topology: { mode: 'aggregate', memberCount: 3, liveCount: 2, attentionCount: 1, errorCount: 1 }
    })
  })

  it('fails closed for missing parents, self-links, cross-provider, cross-family, inexact and old relations', () => {
    const topology = buildCompanionTaskTopology({
      nodes: [
        node('root'),
        node('missing-child'),
        node('self-child'),
        node('provider-child'),
        node('cursor-parent', { provider: 'cursor' }),
        node('family-child'),
        node('family-parent', { family: 'family-b' }),
        node('inexact-child'),
        node('old-child')
      ],
      relations: [
        relation('missing-child', 'absent', { generation: 5 }),
        relation('self-child', 'self-child', { generation: 5 }),
        relation('provider-child', 'cursor-parent', { generation: 5 }),
        relation('family-child', 'family-parent', { generation: 5 }),
        relation('inexact-child', 'root', { exact: false, generation: 5 }),
        relation('old-child', 'root', { generation: 4 })
      ],
      generationFloor: { codex: 5 }
    })

    expect(topology.acceptedRelations).toHaveLength(0)
    expect(topology.rejected.map((entry: Record<string, unknown>) => entry.reason)).toEqual(expect.arrayContaining([
      'missing-node',
      'self',
      'cross-provider',
      'cross-family',
      'inexact',
      'old-generation'
    ]))
    expect(topology.roots.map((root: Record<string, unknown>) => root.key)).toEqual(expect.arrayContaining([
      'root',
      'missing-child',
      'self-child',
      'provider-child',
      'cursor-parent',
      'family-child',
      'family-parent',
      'inexact-child',
      'old-child'
    ]))
  })

  it('isolates a complete cyclic path instead of attaching any member of it', () => {
    const topology = buildCompanionTaskTopology({
      nodes: [node('a'), node('b'), node('descendant')],
      relations: [
        relation('a', 'b'),
        relation('b', 'a'),
        relation('descendant', 'a')
      ]
    })

    expect(topology.acceptedRelations).toHaveLength(0)
    expect(topology.rejected.filter((entry: Record<string, unknown>) => entry.reason === 'cycle-path')).toHaveLength(3)
    expect(topology.roots).toHaveLength(3)
  })

  it('selects only a strictly newer parent and rejects same-generation ambiguity', () => {
    const reparented = buildCompanionTaskTopology({
      nodes: [node('parent-a'), node('parent-b'), node('child')],
      relations: [
        relation('child', 'parent-a', { generation: 7 }),
        relation('child', 'parent-b', { generation: 8 })
      ]
    })
    expect(reparented.rootByKey.child).toBe('parent-b')
    expect(reparented.rejected).toContainEqual(expect.objectContaining({ reason: 'superseded-relation' }))

    const ambiguous = buildCompanionTaskTopology({
      nodes: [node('parent-a'), node('parent-b'), node('child')],
      relations: [
        relation('child', 'parent-a', { generation: 8 }),
        relation('child', 'parent-b', { generation: 8 })
      ]
    })
    expect(ambiguous.acceptedRelations).toHaveLength(0)
    expect(ambiguous.rootByKey.child).toBe('child')
    expect(ambiguous.rejected.filter((entry: Record<string, unknown>) => entry.reason === 'ambiguous-parent')).toHaveLength(2)
  })

  it('treats a withdrawn relation as standalone and quarantines an invalid non-standalone child', () => {
    const attached = buildCompanionTaskTopology({
      nodes: [node('root'), node('child')],
      relations: [relation('child', 'root', { generation: 10 })]
    })
    expect(attached.rootByKey.child).toBe('root')

    const withdrawn = buildCompanionTaskTopology({
      nodes: [node('root'), node('child')],
      relations: [],
      generationFloor: { codex: 11 }
    })
    expect(withdrawn.rootByKey.child).toBe('child')
    expect(withdrawn.roots).toHaveLength(2)

    const quarantined = buildCompanionTaskTopology({
      nodes: [node('root'), node('private-child', { standaloneEligible: false })],
      relations: [relation('private-child', 'missing')]
    })
    expect(quarantined.quarantinedKeys).toEqual(['private-child'])
    expect(quarantined.rootByKey).not.toHaveProperty('private-child')
    expect(quarantined.roots.map((root: Record<string, unknown>) => root.key)).toEqual(['root'])
  })

  it('keeps unread unknown unless any member is unread or every member is explicitly read', () => {
    const unknown = buildCompanionTaskTopology({
      nodes: [node('root'), node('child', { unreadKnown: false })],
      relations: [relation('child', 'root')]
    })
    expect(unknown.roots[0]).toMatchObject({ unreadKnown: false, unread: false })

    const read = buildCompanionTaskTopology({
      nodes: [node('root'), node('child')],
      relations: [relation('child', 'root')]
    })
    expect(read.roots[0]).toMatchObject({ unreadKnown: true, unread: false })
  })
})
