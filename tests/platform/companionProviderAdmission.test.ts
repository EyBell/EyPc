import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPANION_PROVIDER_ABBREVS
} from '../../src/domain/companionPresentation'
import {
  COMPANION_PROVIDER_IDS,
  COMPANION_PROVIDER_LABELS,
  COMPANION_PROVIDER_PIN_POLICY
} from '../../src/domain/companionProvider'
import { UTOOLS_PRELOAD_MODULE_GROUPS } from '../../scripts/utools-preload-assets.mjs'

const require = createRequire(import.meta.url)
const manifest = require('../../preload/companion/provider-manifest.json') as {
  order: string[]
  providers: Record<string, { taskKind: string; pin: { inbound: boolean; outbound: boolean } }>
}
const {
  createCompanionTaskKernel,
  TASK_KINDS,
  PROVIDERS,
  PROVIDER_TRAITS
} = require('../../preload/companion/task-kernel.cjs') as {
  createCompanionTaskKernel(options?: Record<string, unknown>): any
  TASK_KINDS: string[]
  PROVIDERS: string[]
  PROVIDER_TRAITS: Record<string, { taskKind: string }>
}
const { PROVIDERS: registryProviders } = require('../../preload/companion/provider-registry.cjs') as {
  PROVIDERS: string[]
}

const NOW = 1_000
const LANES = ['membership', 'activity', 'interaction', 'unread', 'planArtifact', 'metadata', 'topology'] as const

function emptyLanes(generation: number) {
  return Object.fromEntries(LANES.map((lane) => [lane, generation]))
}

function enablement(id: string) {
  return Object.fromEntries(manifest.order.map((provider) => [provider, provider === id]))
}

function runningDraft(id: string) {
  const taskKind = manifest.providers[id].taskKind
  const key = id === 'codex' ? 'codex-admission-root' : `${id}:admission-root`
  const generation = NOW
  const providers = enablement(id)
  const sourceGenerations = Object.fromEntries(manifest.order.map((provider) => [provider, provider === id ? generation : 0]))
  const sourceLaneGenerations = Object.fromEntries(manifest.order.map((provider) => [
    provider,
    emptyLanes(provider === id ? generation : 0)
  ]))
  const node = {
    key,
    provider: id,
    family: key,
    role: 'root',
    membership: 'present',
    activity: {
      kind: 'turn-running',
      authority: 'inventory',
      exact: true,
      sequence: generation,
      observedAt: generation,
      statusEnteredAt: generation,
      turnStartedAt: generation,
      terminalAt: 0
    },
    unread: { known: true, value: false, sequence: generation },
    planArtifact: { revision: 'companion-plan-artifact-v1', state: 'unknown', sequence: 0, actionable: false, reason: '' },
    metadata: {
      kind: taskKind,
      actionAlias: id === 'codex' ? 'ct_admission' : 'admission-root',
      revisionAt: generation,
      membershipRevision: generation,
      visibilityRevision: generation,
      metadataRevision: generation,
      lastQuestionAt: generation,
      createdAt: generation - 10,
      displayOrder: 0,
      cycleOrder: 0,
      attentionOrder: 0,
      hidden: false,
      idleConfirmed: false,
      localPin: false,
      dynamicEligible: true,
      displayName: 'admission',
      originalTitle: 'admission'
    },
    capabilities: ['open'],
    standaloneEligible: true,
    error: false
  }
  const evidenceBatches = Object.fromEntries(manifest.order.map((provider) => [provider, {
    revision: 'companion-provider-evidence-batch-v3',
    provider,
    channels: Object.fromEntries(LANES.map((channel) => [channel, {
      mode: 'snapshot',
      complete: true,
      generation: provider === id ? generation : 0,
      removedKeys: []
    }])),
    nodes: provider === id ? [node] : [],
    interactions: [],
    interactionSets: [],
    relations: [],
    relationMode: 'snapshot',
    relationsComplete: true,
    removedRelationChildKeys: [],
    health: provider === id ? 'ready' : 'disabled'
  }]))
  return {
    schema: 'companion-task-evidence-draft-v7',
    producer: 'host-preflight',
    sourceTaskStateRevision: 'task-state-v12',
    draftRevision: 1,
    acceptedAt: NOW + 1,
    enabled: true,
    complete: true,
    focusedKey: '',
    providers,
    sourceGenerations,
    sourceLaneGenerations,
    providerHealth: Object.fromEntries(manifest.order.map((provider) => [provider, {
      status: provider === id ? 'ready' : 'disabled',
      generation: provider === id ? generation : 0,
      errorCode: ''
    }])),
    evidenceBatches
  }
}

describe('companion provider admission', () => {
  it('keeps Kernel kinds, traits and presentation in lockstep with the manifest', () => {
    expect([...PROVIDERS]).toEqual(manifest.order)
    expect([...registryProviders]).toEqual(manifest.order)
    for (const id of manifest.order) {
      const taskKind = manifest.providers[id].taskKind
      expect(TASK_KINDS).toContain(taskKind)
      expect(PROVIDER_TRAITS[id].taskKind).toBe(taskKind)
      expect(COMPANION_PROVIDER_IDS).toContain(id)
      expect(COMPANION_PROVIDER_LABELS[id as keyof typeof COMPANION_PROVIDER_LABELS]).toBeTruthy()
      expect(COMPANION_PROVIDER_ABBREVS[id as keyof typeof COMPANION_PROVIDER_ABBREVS]).toMatch(/^[A-Z]{2}$/)
      expect(COMPANION_PROVIDER_PIN_POLICY[id as keyof typeof COMPANION_PROVIDER_PIN_POLICY]).toEqual(
        expect.objectContaining({ inbound: expect.any(Boolean), outbound: expect.any(Boolean) })
      )
    }
  })

  it('admits a running root for every manifest provider into the active group', () => {
    for (const id of manifest.order) {
      const kernel = createCompanionTaskKernel({
        coalesceMs: 0,
        now: () => NOW,
        initialConfiguration: { enabled: true, providers: enablement(id), dynamicTaskWindowHours: 48 }
      })
      const receipt = kernel.attach({ enabled: true, providers: enablement(id), dynamicTaskWindowHours: 48 })
      kernel.syncPackage({ lease: receipt.lease, draft: runningDraft(id) })
      const snapshot = kernel.getLatest()
      const key = id === 'codex' ? 'codex-admission-root' : `${id}:admission-root`
      const admitted = snapshot.tasks.filter((task: { provider: string }) => task.provider === id)
      expect(admitted, `${id} dropped by Kernel despite a running evidence node`).toHaveLength(1)
      expect(admitted[0]).toMatchObject({ key, kind: manifest.providers[id].taskKind, phase: 'running' })
      expect(snapshot.views.groups.active, `${id} running root must be list-visible`).toEqual([key])
    }
  })

  it('packages every on-disk provider preload directory', () => {
    for (const id of manifest.order) {
      const directory = resolve(process.cwd(), 'preload', id)
      if (!existsSync(directory)) continue
      const group = UTOOLS_PRELOAD_MODULE_GROUPS.find((entry) => entry.directory === id)
      expect(group, `preload/${id} exists but is missing from utools-preload-assets.mjs`).toBeTruthy()
    }
  })
})
