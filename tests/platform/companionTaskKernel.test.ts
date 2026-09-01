import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createCompanionTaskKernel: createCompanionTaskKernelRaw, UNKNOWN_GRACE_MS } = require('../../preload/companion/task-kernel.cjs') as {
  createCompanionTaskKernel(options?: Record<string, unknown>): any
  UNKNOWN_GRACE_MS: number
}
const {
  codexBranchObservationV7,
  createEvidenceNodeV7,
  createEvidenceBatchV7
} = require('../../preload/companion/evidence-adapter-v7.cjs') as Record<string, (...args: any[]) => any>

function createCompanionTaskKernel(options: Record<string, unknown> = {}) {
  return createCompanionTaskKernelRaw({ now: () => 1_000, ...options })
}

function nativeOpened(confirmsRead = false) {
  return {
    outcome: 'opened',
    confirmsRead,
    handoff: {
      revision: 'companion-open-handoff-v1',
      handoffId: 'coh_kernel_native_0001',
      stage: 'native-confirmed',
      sourceRelease: 'unknown',
      nativeVisible: true,
      controlOwner: 'target-native',
      confirmsRead
    }
  }
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    key: 'codex-a',
    provider: 'codex',
    kind: 'codex-thread',
    phase: 'running',
    cycleTier: 'active',
    dynamicGroup: 'active',
    actionAlias: 'ct_codex_a_1234567890',
    revisionAt: 100,
    membershipRevision: 100,
    phaseRevision: 100,
    unreadRevision: 100,
    visibilityRevision: 100,
    statusEnteredAt: 100,
    lastQuestionAt: 100,
    createdAt: 50,
    displayOrder: 0,
    cycleOrder: 0,
    attentionOrder: 0,
    hidden: false,
    unread: false,
    planImplementation: false,
    planReady: false,
    planLifecycleRevision: 0,
    paused: false,
    turnMode: 'unknown',
    idleConfirmed: false,
    localPin: false,
    dynamicEligible: true,
    capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false },
    ...overrides
  }
}

function evidenceNode(value: Record<string, any>, lanes: Record<string, number> = {}) {
  const phase = value.phase
  const activityKind = phase === 'running' ? 'turn-running'
    : phase === 'waiting-input' || phase === 'waiting-approval' ? 'turn-completed'
        : phase === 'completed' ? 'turn-completed'
          : phase === 'stopped' ? value.error === true ? 'turn-failed' : 'turn-interrupted'
            : 'unknown'
  const capabilities = Object.entries(value.capabilities || {})
    .filter(([, enabled]) => enabled === true)
    .map(([name]) => name === 'executePlan' ? 'execute-plan' : name)
  const planState = value.planLifecycleState === 'cleared'
    ? 'cleared'
    : value.planReady === true || value.planImplementation === true ? 'ready' : 'unknown'
  return {
    key: value.key,
    provider: value.provider,
    family: value.family || `${value.provider}:${value.key}`,
    role: value.role === 'child' ? 'child' : 'root',
    membership: 'present',
    activity: {
      kind: activityKind,
      causalKey: typeof value.causalKey === 'string' ? value.causalKey : '',
      sequence: Number(value.phaseRevision) || Number(value.statusEnteredAt) || Number(lanes.activity) || Number(value.revisionAt) || 1,
      exact: value.freshness !== 'verifying',
      observedAt: Number(value.observedAt) || 0,
      statusEnteredAt: Number(value.statusEnteredAt) || 0,
      turnStartedAt: Number(value.turnStartedAt) || 0,
      terminalAt: Number(value.terminalAt) || 0
    },
    unread: {
      known: value.unreadKnown !== false && typeof value.unread === 'boolean',
      value: value.unread === true,
      sequence: Number(lanes.unread) || Number(value.unreadRevision) || 0
    },
    planArtifact: {
      revision: 'companion-plan-artifact-v1',
      state: planState === 'ready'
        ? 'available'
        : planState === 'cleared'
          ? value.planClearReason === 'cancel' ? 'cancelled'
            : value.planClearReason === 'archive' || value.planClearReason === 'removal' ? 'removed'
              : value.planClearReason === 'execution-start' ? 'executing' : 'consumed'
          : 'unknown',
      sequence: Number(value.planLifecycleRevision) || 0,
      actionable: planState === 'ready',
      reason: ['cancel', 'execution-start', 'archive', 'removal'].includes(value.planClearReason) ? value.planClearReason : ''
    },
    metadata: { ...value, partial: false },
    capabilities,
    standaloneEligible: value.standaloneEligible !== false,
    error: value.error === true
  }
}

function interactionEvidence(value: Record<string, any>, authority = 'provider-live') {
  if (value.phase !== 'waiting-input' && value.phase !== 'waiting-approval') return []
  const kind = value.phase === 'waiting-approval'
    ? 'approval'
    : value.planImplementation === true ? 'plan-implementation' : 'user-input'
  const sequence = Number(value.phaseRevision) || Number(value.statusEnteredAt) || Number(value.revisionAt) || 1
  return [{
    revision: 'companion-interaction-evidence-v1',
    provider: value.provider,
    taskKey: value.key,
    branchRef: value.role === 'child' ? 'child' : 'root',
    interactionRef: createHash('sha256').update(`${value.provider}\0${value.key}\0${kind}\0${sequence}`).digest('hex').slice(0, 32),
    kind,
    state: 'opened',
    sequence,
    turnEpoch: Number(value.turnStartedAt) || 0,
    requestSetRevision: sequence,
    authority,
    exact: value.freshness !== 'verifying'
  }]
}

function interactionSetEvidence(value: Record<string, any>) {
  const requestSetRevision = Number(value.phaseRevision) || Number(value.statusEnteredAt) || Number(value.revisionAt) || 1
  return {
    revision: 'companion-interaction-evidence-v1',
    provider: value.provider,
    taskKey: value.key,
    requestSetRevision,
    complete: true
  }
}

function interaction(overrides: Record<string, any> = {}) {
  const sequence = Number(overrides.sequence) || 100
  return {
    revision: 'companion-interaction-evidence-v1',
    provider: 'codex',
    taskKey: 'codex-a',
    branchRef: 'root',
    interactionRef: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    kind: 'user-input',
    state: 'opened',
    sequence,
    turnEpoch: sequence,
    requestSetRevision: Number(overrides.requestSetRevision) || sequence,
    authority: 'provider-live',
    exact: true,
    ...overrides
  }
}

function draft(tasks: unknown[], revision = 1, overrides: Record<string, unknown> = {}) {
  const configuredProviders = (overrides.providers as { codex?: boolean; claude?: boolean; cursor?: boolean } | undefined) || {}
  const providers = {
    codex: configuredProviders.codex !== false,
    claude: configuredProviders.claude !== false,
    cursor: configuredProviders.cursor === true
  }
  const incomingGenerations = (overrides.sourceGenerations as { codex?: number; claude?: number; cursor?: number } | undefined) || {}
  const sourceGenerations = {
    codex: incomingGenerations.codex ?? revision,
    claude: incomingGenerations.claude ?? revision,
    cursor: incomingGenerations.cursor ?? 0
  }
  const sourceLaneGenerations = (overrides.sourceLaneGenerations as Record<string, unknown> | undefined)
    || {
      codex: { membership: sourceGenerations.codex || 0, activity: sourceGenerations.codex || 0, interaction: sourceGenerations.codex || 0, unread: sourceGenerations.codex || 0, planArtifact: sourceGenerations.codex || 0, metadata: sourceGenerations.codex || 0, topology: sourceGenerations.codex || 0 },
      claude: { membership: sourceGenerations.claude || 0, activity: sourceGenerations.claude || 0, interaction: sourceGenerations.claude || 0, unread: sourceGenerations.claude || 0, planArtifact: sourceGenerations.claude || 0, metadata: sourceGenerations.claude || 0, topology: sourceGenerations.claude || 0 },
      cursor: { membership: sourceGenerations.cursor || 0, activity: sourceGenerations.cursor || 0, interaction: sourceGenerations.cursor || 0, unread: sourceGenerations.cursor || 0, planArtifact: sourceGenerations.cursor || 0, metadata: sourceGenerations.cursor || 0, topology: sourceGenerations.cursor || 0 }
    }
  const producer = typeof overrides.producer === 'string' ? overrides.producer : 'host-evidence'
  const relations = Array.isArray(overrides.relations) ? overrides.relations : []
  const evidenceBatches = Object.fromEntries(['codex', 'claude', 'cursor'].map((provider) => {
    const lanes = (sourceLaneGenerations[provider] || {}) as Record<string, number>
    const snapshot = producer === 'host-preflight'
    const providerRelations = relations.filter((relation: any) => relation?.provider === provider)
    return [provider, {
      revision: 'companion-provider-evidence-batch-v3',
      provider,
      channels: Object.fromEntries(['membership', 'activity', 'interaction', 'unread', 'planArtifact', 'metadata', 'topology'].map((channel) => [channel, {
        mode: snapshot ? 'snapshot' : 'delta',
        complete: snapshot,
        generation: Number(lanes[channel]) || 0,
        removedKeys: []
      }])),
      nodes: (tasks as Record<string, any>[]).filter((value) => value.provider === provider).map((value) => evidenceNode(value, lanes)),
      interactions: (Array.isArray(overrides.interactions) ? overrides.interactions as Record<string, any>[] : (tasks as Record<string, any>[]).flatMap((value) => interactionEvidence(value)))
        .filter((value) => value.provider === provider),
      interactionSets: (tasks as Record<string, any>[])
        .filter((value) => value.provider === provider)
        .map(interactionSetEvidence),
      relations: providerRelations,
      relationMode: snapshot ? 'snapshot' : 'delta',
      relationsComplete: snapshot,
      removedRelationChildKeys: [],
      health: providers[provider as keyof typeof providers] ? 'ready' : 'unavailable'
    }]
  }))
  return {
    schema: 'companion-task-evidence-draft-v7',
    producer: 'host-evidence',
    sourceTaskStateRevision: 'task-state-v12',
    draftRevision: revision,
    acceptedAt: 1_000 + revision,
    enabled: true,
    complete: true,
    focusedKey: '',
    tasks,
    evidenceBatches,
    ...overrides,
    providers,
    sourceGenerations,
    sourceLaneGenerations,
    providerHealth: {
      codex: { status: providers.codex ? 'ready' : 'disabled', generation: sourceGenerations.codex, errorCode: '' },
      claude: { status: providers.claude ? 'ready' : 'disabled', generation: sourceGenerations.claude, errorCode: '' },
      cursor: { status: providers.cursor ? 'ready' : 'disabled', generation: sourceGenerations.cursor, errorCode: '' }
    }
  }
}

function publishCodexParentEvidenceV7(
  kernel: Record<string, any>,
  generation: number,
  parents: Array<{ key: string; complete?: boolean; branches: Record<string, any>[] }>
) {
  const nodes: Record<string, any>[] = []
  const relations: Record<string, any>[] = []
  let order = 0
  for (const parent of parents) {
    const family = `codex:${parent.key}`
    parent.branches.forEach((branch, branchIndex) => {
      const isRoot = branch.branchKind === 'main' || (branch.branchKind !== 'side' && branchIndex === 0)
      const nodeKey = isRoot ? parent.key : `codex-child:${branch.ref}`
      const observation = codexBranchObservationV7(branch)
      const node = createEvidenceNodeV7({
        provider: 'codex',
        key: nodeKey,
        family,
        role: isRoot ? 'root' : 'child',
        observation,
        causalKey: `codex:${nodeKey}:${Number(observation.turnStartedAt) || Number(observation.sequence) || generation}`,
        observedAt: Number(observation.sequence) || generation,
        metadata: {
          kind: isRoot ? 'codex-thread' : 'topology-child',
          actionAlias: isRoot ? 'ct_codex_a_1234567890' : '',
          capabilityToken: isRoot ? 'ct_codex_a_1234567890' : '',
          revisionAt: Math.max(1, Number(observation.sequence) || generation),
          membershipRevision: generation,
          visibilityRevision: generation,
          metadataRevision: generation,
          lastQuestionAt: Math.max(1, Number(observation.turnStartedAt) || Number(observation.sequence) || generation),
          createdAt: Math.max(1, Number(observation.turnStartedAt) || Number(observation.sequence) || generation),
          displayOrder: order,
          cycleOrder: order,
          attentionOrder: order,
          hidden: false,
          idleConfirmed: !(observation.candidates || []).some((candidate: Record<string, any>) => candidate.kind === 'turn-running'),
          localPin: false,
          dynamicEligible: true,
          ...(isRoot ? { displayName: 'Kernel task', originalTitle: 'Kernel task' } : {})
        },
        capabilities: isRoot ? ['open'] : [],
        standaloneEligible: isRoot
      })
      if (node) nodes.push(node)
      if (!isRoot) {
        relations.push({
          childKey: nodeKey,
          parentKey: parent.key,
          provider: 'codex',
          family,
          relation: 'side-thread',
          authority: 'test-provider-fixture',
          exact: parent.complete === true,
          generation
        })
      }
      order += 1
    })
  }
  const lanes = {
    membership: generation,
    activity: generation,
    interaction: generation,
    unread: generation,
    planArtifact: generation,
    metadata: generation,
    topology: generation
  }
  const base = draft([], generation, {
    providers: { codex: true, claude: false },
    sourceGenerations: { codex: generation, claude: 0 },
    sourceLaneGenerations: {
      codex: lanes,
      claude: { membership: 0, activity: 0, interaction: 0, unread: 0, planArtifact: 0, metadata: 0, topology: 0 }
    }
  }) as Record<string, any>
  return kernel.publishEvidence({
    ...base,
    evidenceBatches: {
      ...base.evidenceBatches,
      codex: createEvidenceBatchV7({
        provider: 'codex',
        nodes,
        relations,
        laneGenerations: lanes,
        snapshotLanes: ['membership', 'activity', 'interaction', 'unread', 'planArtifact', 'metadata', 'topology'],
        completeLanes: ['membership', 'activity', 'interaction', 'unread', 'planArtifact', 'metadata', 'topology'],
        relationsComplete: true,
        health: 'ready'
      })
    }
  })
}

afterEach(() => vi.useRealTimers())

describe('CompanionTaskKernel', () => {
  it('keeps canonical selectors and production fallback ownership inside the V7 Kernel', () => {
    const kernelSource = readFileSync(resolve(process.cwd(), 'preload/companion/task-kernel.cjs'), 'utf8')
    const hostSource = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
    const domainSource = readFileSync(resolve(process.cwd(), 'src/domain/companionTaskPackage.ts'), 'utf8')
    const controllerSource = readFileSync(resolve(process.cwd(), 'src/runtime/codexController.ts'), 'utf8')
    const floatSource = readFileSync(resolve(process.cwd(), 'src/FloatApp.vue'), 'utf8')

    expect(kernelSource).toContain('function derivedCycleTier(task)')
    expect(kernelSource).toContain('function derivedDynamicGroup(task)')
    expect(kernelSource).toContain('function buildViews(tasks)')
    expect(kernelSource).toContain('function reduceActivityCandidatesV7(activity = {})')
    expect(kernelSource).not.toContain('function reduceCodexTaskEvidenceV4(')
    expect(kernelSource).not.toContain('function reduceCodexParentBranchEvidenceV4(')
    expect(kernelSource).not.toContain('function reduceClaudeTaskEvidenceV4(')
    expect(controllerSource).not.toContain('buildCompanionTaskPackageDraft')
    expect(domainSource).not.toContain('buildCompanionTaskPackageDraft')
    expect(domainSource).not.toContain('function canonicalPhase(')
    expect(domainSource).not.toContain('function dynamicGroupByKey(')
    expect(domainSource).not.toContain('function cycleTier(')
    expect(controllerSource).not.toContain('allowLegacyCompanionAdapters')
    expect(controllerSource).not.toContain('companionTaskActionTarget')
    expect(controllerSource).not.toContain('syncCompanionNavigation')
    expect(controllerSource).not.toContain('syncCompanionTaskActions')
    expect(controllerSource).not.toContain('cycleOrderedTasks')
    expect(controllerSource).not.toContain('runDirectTaskCommand')
    expect(floatSource).not.toMatch(/(?:cycleTier|dynamicGroup|cycleKeys)\s*:/)
    expect(hostSource).not.toContain('function companionCycleTier(')
    expect(hostSource).not.toContain('function companionDynamicGroup(')
    expect(hostSource).toContain('claudeSessionObservationV7(session, unread')
    expect(hostSource).not.toContain('return reduceClaudeTaskEvidenceV4({ phase: value, unread: unread === true })')
    expect([...hostSource.matchAll(/cycleTier:\s*([^,\n]+)/g)].map((match) => match[1].trim()).every((value) => value === "'none'")).toBe(true)
    expect([...hostSource.matchAll(/dynamicGroup:\s*([^,\n]+)/g)].map((match) => match[1].trim()).every((value) => value === "'none'")).toBe(true)
  })

  it('keeps the Plan lifecycle across a supplementary default Turn, interruption and pause until an explicit execution-start edge', async () => {
    const persisted: Array<Record<string, unknown>> = []
    const kernel = createCompanionTaskKernel({
      persistPlanPause: (value: Record<string, unknown>) => { persisted.push(value); return true },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 1 }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 1 })
    const sync = (value: Record<string, unknown>, revision: number) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task(value)], revision, { providers: { codex: true, claude: false } })
    })

    expect(sync({ turnMode: 'plan', phase: 'running', planReady: false }, 1).tasks[0]).toMatchObject({ phase: 'running', planReady: false })
    const unreadPlan = sync({
      turnMode: 'plan',
      phase: 'completed',
      planImplementation: true,
      planReady: true,
      planLifecycleRevision: 200,
      unreadKnown: true,
      unread: true,
      capabilities: { open: true, archive: false, pause: true, resume: true, executePlan: false }
    }, 2)
    expect(unreadPlan.tasks[0]).toMatchObject({ phase: 'completed', unread: true, planReady: true, planLifecycleRevision: 200 })
    expect(unreadPlan.views.groups.unread).toEqual(['codex-a'])

    const ready = sync({
      turnMode: 'plan',
      phase: 'completed',
      planImplementation: true,
      planReady: true,
      planLifecycleRevision: 200,
      unreadKnown: true,
      unread: false,
      capabilities: { open: true, archive: false, pause: true, resume: true, executePlan: false }
    }, 3)
    expect(ready.tasks[0]).toMatchObject({
      phase: 'stopped',
      dynamicGroup: 'stopped',
      cycleTier: 'plan',
      planReady: true,
      planLifecycleRevision: 200
    })
    expect(ready.views.counts.input).toBe(0)
    expect(ready.views.groups.stopped).toEqual(['codex-a'])
    expect(ready.views.cycleKeys).toEqual(['codex-a'])

    expect(sync({ turnMode: 'default', phase: 'running', planReady: false, planLifecycleRevision: 0 }, 4).tasks[0])
      .toMatchObject({ phase: 'running', planReady: true, planLifecycleRevision: 200 })
    const stopped = sync({
      turnMode: 'plan',
      phase: 'stopped',
      planReady: true,
      planLifecycleRevision: 200,
      dynamicEligible: false,
      capabilities: { open: true, archive: true, pause: true, resume: true, executePlan: false }
    }, 5)
    expect(stopped.tasks[0]).toMatchObject({ phase: 'stopped', planReady: true, dynamicGroup: 'stopped' })
    expect(stopped.views.groups.stopped).toEqual(['codex-a'])
    expect(stopped.views.counts.input).toBe(0)
    expect(stopped.views.cycleKeys).toEqual(['codex-a'])

    await expect(kernel.dispatch({ action: 'pause', key: 'codex-a', planLifecycleRevision: 200 }))
      .resolves.toMatchObject({ outcome: 'paused' })
    expect(kernel.getLatest().views).toMatchObject({ pausedKeys: ['codex-a'], cycleKeys: [], counts: { input: 0, active: 0, unread: 0 } })
    await expect(kernel.dispatch({ action: 'resume', key: 'codex-a', planLifecycleRevision: 200 }))
      .resolves.toMatchObject({ outcome: 'resumed' })
    expect(persisted.map((value) => value.paused)).toEqual([true, false])

    const executing = sync({
      turnMode: 'default',
      turnStartedAt: 500,
      phase: 'running',
      planReady: false,
      planLifecycleState: 'cleared',
      planClearReason: 'execution-start',
      planLifecycleRevision: 500
    }, 6)
    expect(executing.tasks[0]).toMatchObject({
      phase: 'running',
      planReady: false,
      planLifecycleState: 'cleared',
      planLifecycleRevision: 500,
      paused: false
    })
  })

  it('keeps ordinary waiting ahead while retaining Plan controls when the Implement Plan request is absent', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const ordinaryWait = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'waiting-input',
        planReady: true,
        planLifecycleRevision: 200,
        planImplementation: false,
        capabilities: { open: true, archive: false, pause: true, resume: true, executePlan: true }
      })], 1, { providers: { codex: true, claude: false } })
    })
    expect(ordinaryWait.tasks[0]).toMatchObject({
      cycleTier: 'attention',
      capabilities: { pause: true, resume: false, executePlan: true }
    })

    const exactPlanWait = kernel.publishEvidence(draft([task({
      phase: 'waiting-input',
      phaseRevision: 201,
      statusEnteredAt: 201,
      planReady: true,
      planLifecycleRevision: 200,
      planImplementation: true,
      capabilities: { open: true, archive: false, pause: true, resume: true, executePlan: true }
    })], 2, { producer: 'host-evidence', providers: { codex: true, claude: false } }))
    expect(exactPlanWait.tasks[0]).toMatchObject({
      cycleTier: 'plan',
      planLifecycleRevision: 200,
      capabilities: { pause: true, resume: false, executePlan: true }
    })
  })

  it('keeps a completed Plan actionable when its implementation prompt was not observed', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'completed',
        turnMode: 'plan',
        planReady: true,
        planLifecycleRevision: 240,
        planImplementation: false,
        capabilities: { open: true, archive: true, pause: true, resume: true, executePlan: true }
      })], 1, { providers: { codex: true, claude: false } })
    })

    expect(current.tasks[0]).toMatchObject({
      phase: 'stopped',
      dynamicGroup: 'stopped',
      cycleTier: 'plan',
      planReady: true,
      capabilities: { pause: true, resume: false, executePlan: true }
    })
  })

  it('maps an artifact-only completed Plan to stopped and requires an explicit interaction to enter waiting', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const artifactOnly = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'completed',
        unreadKnown: true,
        unread: false,
        planReady: true,
        planLifecycleRevision: 100,
        capabilities: { open: true, archive: true, pause: true, resume: false, executePlan: true }
      })], 1, { providers: { codex: true, claude: false } })
    })
    expect(artifactOnly.tasks[0]).toMatchObject({
      phase: 'stopped',
      planArtifactState: 'available',
      planArtifactActionable: true
    })
    expect(artifactOnly.views).toMatchObject({ groups: { input: [], stopped: ['codex-a'] }, counts: { input: 0 } })

    const planChoice = kernel.publishEvidence(draft([task({
      phase: 'completed',
      phaseRevision: 101,
      statusEnteredAt: 101,
      unreadKnown: true,
      unread: true,
      planReady: true,
      planLifecycleRevision: 100,
      capabilities: { open: true, archive: false, pause: true, resume: false, executePlan: true }
    })], 2, {
      providers: { codex: true, claude: false },
      interactions: [interaction({
        interactionRef: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        kind: 'plan-choice',
        sequence: 101,
        requestSetRevision: 101
      })]
    }))
    expect(planChoice.tasks[0]).toMatchObject({
      phase: 'waiting-input',
      unread: true,
      planImplementation: true,
      cycleTier: 'plan',
      dynamicGroup: 'input'
    })
    expect(planChoice.views).toMatchObject({ groups: { input: ['codex-a'], unread: [] }, counts: { input: 1, unread: 0 } })

    const resolved = kernel.publishEvidence(draft([task({
      phase: 'completed',
      phaseRevision: 102,
      statusEnteredAt: 101,
      unreadKnown: true,
      unread: true,
      planReady: true,
      planLifecycleRevision: 100,
      capabilities: { open: true, archive: true, pause: true, resume: false, executePlan: true }
    })], 3, {
      providers: { codex: true, claude: false },
      interactions: [interaction({
        interactionRef: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        kind: 'plan-choice',
        state: 'resolved',
        sequence: 102,
        requestSetRevision: 102
      })]
    }))
    expect(resolved.tasks[0]).toMatchObject({ phase: 'completed', unread: true, planImplementation: false, dynamicGroup: 'unread' })
  })

  it('moves directly between running and every exact current interaction without publishing completed-unread', () => {
    const cases = [
      { kind: 'user-input', expectedPhase: 'waiting-input', planImplementation: false },
      { kind: 'approval', expectedPhase: 'waiting-approval', planImplementation: false },
      { kind: 'plan-choice', expectedPhase: 'waiting-input', planImplementation: true }
    ] as const

    for (const [index, scenario] of cases.entries()) {
      const kernel = createCompanionTaskKernel({
        initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
      })
      const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
      const publications: Array<{ phase: string; unread: boolean }> = []
      const stop = kernel.onPackage((value: Record<string, any>) => {
        const current = value.tasks[0]
        if (current) publications.push({ phase: current.phase, unread: current.unread === true })
      })
      const sequence = 200 + index * 10
      const planReady = scenario.kind === 'plan-choice'

      kernel.syncPackage({
        lease: receipt.lease,
        draft: draft([task({
          phase: 'running',
          phaseRevision: sequence,
          statusEnteredAt: sequence,
          turnStartedAt: sequence,
          unreadKnown: true,
          unread: true,
          planReady,
          planLifecycleRevision: planReady ? sequence - 1 : 0
        })], 1, { providers: { codex: true, claude: false } })
      })

      const waiting = kernel.publishEvidence(draft([task({
        phase: 'completed',
        phaseRevision: sequence + 1,
        statusEnteredAt: sequence + 1,
        terminalAt: sequence + 1,
        unreadKnown: true,
        unread: true,
        planReady,
        planLifecycleRevision: planReady ? sequence - 1 : 0
      })], 2, {
        providers: { codex: true, claude: false },
        interactions: [interaction({
          interactionRef: `${String(index + 1).repeat(32)}`,
          kind: scenario.kind,
          sequence: sequence + 1,
          requestSetRevision: sequence + 1
        })]
      }))
      expect(waiting.tasks[0]).toMatchObject({
        phase: scenario.expectedPhase,
        unread: true,
        planImplementation: scenario.planImplementation,
        dynamicGroup: 'input'
      })

      const resumed = kernel.publishEvidence(draft([task({
        phase: 'running',
        phaseRevision: sequence + 2,
        statusEnteredAt: sequence + 2,
        turnStartedAt: sequence + 2,
        unreadKnown: true,
        unread: true,
        planReady,
        planLifecycleRevision: planReady ? sequence - 1 : 0
      })], 3, { providers: { codex: true, claude: false } }))
      expect(resumed.tasks[0]).toMatchObject({ phase: 'running', unread: true, dynamicGroup: 'active' })
      expect(publications.filter((entry) => entry.phase === 'completed' && entry.unread)).toEqual([])
      stop()
    }
  })

  it('projects a completed-read task with an exact current Plan implementation request as waiting-input', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const publications: Array<{ phase: string; unread: boolean }> = []
    const stop = kernel.onPackage((value: Record<string, any>) => {
      const current = value.tasks[0]
      if (current) publications.push({ phase: current.phase, unread: current.unread === true })
    })

    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'running',
        phaseRevision: 300,
        statusEnteredAt: 300,
        turnStartedAt: 300,
        unreadKnown: true,
        unread: false,
        planReady: true,
        planLifecycleRevision: 299
      })], 1, { providers: { codex: true, claude: false } })
    })

    const waiting = kernel.publishEvidence(draft([task({
      phase: 'completed',
      phaseRevision: 301,
      statusEnteredAt: 301,
      terminalAt: 301,
      unreadKnown: true,
      unread: false,
      planReady: true,
      planLifecycleRevision: 299
    })], 2, {
      providers: { codex: true, claude: false },
      interactions: [interaction({
        interactionRef: 'dddddddddddddddddddddddddddddddd',
        kind: 'plan-choice',
        sequence: 301,
        requestSetRevision: 301
      })]
    }))

    expect(waiting.tasks[0]).toMatchObject({
      phase: 'waiting-input',
      unread: false,
      planImplementation: true,
      dynamicGroup: 'input'
    })
    expect(waiting.views).toMatchObject({ groups: { input: ['codex-a'], completed: [] }, counts: { input: 1 } })

    const resumed = kernel.publishEvidence(draft([task({
      phase: 'running',
      phaseRevision: 302,
      statusEnteredAt: 302,
      turnStartedAt: 302,
      unreadKnown: true,
      unread: false,
      planReady: true,
      planLifecycleRevision: 299
    })], 3, { providers: { codex: true, claude: false } }))
    expect(resumed.tasks[0]).toMatchObject({ phase: 'running', unread: false, dynamicGroup: 'active' })
    expect(publications.some((entry) => entry.phase === 'completed')).toBe(false)
    stop()
  })

  it('tombstones a resolved interaction, ignores its stale replay and lets only a new instance reopen waiting', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const baseTask = (phaseRevision: number) => task({
      phase: 'completed',
      phaseRevision,
      statusEnteredAt: phaseRevision,
      terminalAt: phaseRevision,
      unreadKnown: true,
      unread: false
    })
    const oldRef = 'cccccccccccccccccccccccccccccccc'
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([baseTask(100)], 1, {
        providers: { codex: true, claude: false },
        interactions: [interaction({ interactionRef: oldRef, sequence: 100, requestSetRevision: 100 })]
      })
    })
    expect(kernel.getLatest().tasks[0].phase).toBe('waiting-input')

    kernel.publishEvidence(draft([baseTask(101)], 2, {
      providers: { codex: true, claude: false },
      interactions: [interaction({ interactionRef: oldRef, state: 'resolved', sequence: 101, requestSetRevision: 101 })]
    }))
    expect(kernel.getLatest().tasks[0].phase).toBe('completed')

    kernel.publishEvidence(draft([baseTask(100)], 3, {
      providers: { codex: true, claude: false },
      interactions: [interaction({ interactionRef: oldRef, sequence: 100, requestSetRevision: 100 })]
    }))
    expect(kernel.getLatest().tasks[0].phase).toBe('completed')

    const newRef = 'dddddddddddddddddddddddddddddddd'
    kernel.publishEvidence(draft([baseTask(102)], 4, {
      providers: { codex: true, claude: false },
      interactions: [interaction({ interactionRef: newRef, sequence: 102, requestSetRevision: 102 })]
    }))
    expect(kernel.getLatest().tasks[0].phase).toBe('waiting-input')
    expect(JSON.stringify(kernel.getLatest())).not.toContain(oldRef)
    expect(JSON.stringify(kernel.getLatest())).not.toContain(newRef)
    expect(kernel.diagnostics()).toMatchObject({ openInteractionCount: 1, interactionTombstoneCount: 1 })
  })

  it('restores anonymous interaction tombstones across a Kernel restart and persists later terminal edges', () => {
    const oldRef = 'dddddddddddddddddddddddddddddddd'
    const newRef = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    const persisted: Record<string, any>[][] = []
    const restored = interaction({
      interactionRef: oldRef,
      state: 'resolved',
      sequence: 101,
      requestSetRevision: 101
    })
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } },
      initialInteractionTombstones: [restored],
      persistInteractionTombstones: (rows: Record<string, any>[]) => {
        persisted.push(rows)
        return true
      }
    })

    kernel.publishEvidence(draft([
      task({ phase: 'completed', phaseRevision: 100, unreadKnown: true, unread: false })
    ], 1, {
      interactions: [interaction({ interactionRef: oldRef, sequence: 100, requestSetRevision: 100 })]
    }))
    expect(kernel.getPackage().tasks[0].phase).toBe('completed')
    expect(kernel.diagnostics().interactionTombstoneCount).toBe(1)

    kernel.publishEvidence(draft([
      task({ phase: 'completed', phaseRevision: 102, unreadKnown: true, unread: false })
    ], 2, {
      interactions: [interaction({ interactionRef: newRef, sequence: 102, requestSetRevision: 102 })]
    }))
    expect(kernel.getPackage().tasks[0].phase).toBe('waiting-input')

    kernel.publishEvidence(draft([
      task({ phase: 'completed', phaseRevision: 103, unreadKnown: true, unread: false })
    ], 3, {
      interactions: [interaction({
        interactionRef: newRef,
        state: 'resolved',
        sequence: 103,
        requestSetRevision: 103
      })]
    }))
    expect(kernel.getPackage().tasks[0].phase).toBe('completed')
    expect(persisted.at(-1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ interactionRef: oldRef, state: 'resolved' }),
      expect.objectContaining({ interactionRef: newRef, state: 'resolved' })
    ]))
    kernel.close()
  })

  it('keeps concurrent approval and input requests independent and lets a complete request set remove only the absent instance', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const base = (revision: number) => task({
      phase: 'completed',
      phaseRevision: revision,
      statusEnteredAt: revision,
      terminalAt: revision,
      unreadKnown: true,
      unread: false
    })
    const inputRef = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    const approvalRef = 'ffffffffffffffffffffffffffffffff'
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([base(200)], 1, {
        providers: { codex: true, claude: false },
        interactions: [
          interaction({ interactionRef: inputRef, sequence: 200, requestSetRevision: 200 }),
          interaction({ interactionRef: approvalRef, kind: 'approval', sequence: 200, requestSetRevision: 200 })
        ]
      })
    })
    expect(kernel.getLatest().tasks[0].phase).toBe('waiting-approval')

    kernel.publishEvidence(draft([base(201)], 2, {
      providers: { codex: true, claude: false },
      interactions: [interaction({ interactionRef: approvalRef, kind: 'approval', sequence: 201, requestSetRevision: 201 })]
    }))
    expect(kernel.getLatest().tasks[0].phase).toBe('waiting-approval')
    expect(kernel.diagnostics()).toMatchObject({ openInteractionCount: 1, interactionTombstoneCount: 1 })

    kernel.publishEvidence(draft([base(202)], 3, {
      providers: { codex: true, claude: false },
      interactions: []
    }))
    expect(kernel.getLatest().tasks[0].phase).toBe('completed')
    expect(kernel.diagnostics()).toMatchObject({ openInteractionCount: 0, interactionTombstoneCount: 2 })
  })

  it('lets terminal evidence win a same-revision interaction conflict regardless of event order', () => {
    for (const interactions of [
      [interaction({ state: 'opened' }), interaction({ state: 'resolved' })],
      [interaction({ state: 'resolved' }), interaction({ state: 'opened' })]
    ]) {
      const kernel = createCompanionTaskKernel({
        initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
      })
      const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
      kernel.syncPackage({
        lease: receipt.lease,
        draft: draft([task({ phase: 'completed', unreadKnown: true, unread: false })], 1, {
          providers: { codex: true, claude: false },
          interactions
        })
      })
      expect(kernel.getLatest().tasks[0].phase).toBe('completed')
      expect(kernel.diagnostics()).toMatchObject({ openInteractionCount: 0, interactionTombstoneCount: 1 })
    }
  })

  it('does not change the Plan lifecycle revision when only generic metadata advances', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'waiting-input',
        planReady: true,
        planImplementation: true,
        planLifecycleRevision: 200,
        revisionAt: 200
      })], 1, { providers: { codex: true, claude: false } })
    })
    const refreshed = kernel.publishEvidence(draft([task({
      phase: 'waiting-input',
      planReady: true,
      planImplementation: true,
      planLifecycleRevision: 200,
      revisionAt: 9_999,
      metadataRevision: 9_999
    })], 2, { producer: 'host-evidence', providers: { codex: true, claude: false } }))
    expect(refreshed.tasks[0].planLifecycleRevision).toBe(200)
  })

  it('commits ordinary hide and restore locally without any Provider read', () => {
    const preflight = vi.fn(() => Promise.reject(new Error('codex-task-preflight-failed')))
    const kernel = createCompanionTaskKernel({
      preflight,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.publishEvidence(draft([task({ phase: 'stopped', revisionAt: 100 })], 1, { providers: { codex: true, claude: false } }))
    const readsBefore = preflight.mock.calls.length

    const hidden = kernel.setVisibility({ lease: receipt.lease, key: 'codex-a', revisionAt: 100, hidden: true })
    expect(hidden.tasks[0]).toMatchObject({ key: 'codex-a', hidden: true })
    expect(hidden.views.groups.stopped).toEqual([])

    const restored = kernel.setVisibility({ lease: receipt.lease, key: 'codex-a', revisionAt: 100, hidden: false })
    expect(restored.tasks[0]).toMatchObject({ key: 'codex-a', hidden: false })
    expect(restored.views.groups.stopped).toEqual(['codex-a'])
    expect(restored.packageRevision).toBeGreaterThan(hidden.packageRevision)
    expect(preflight.mock.calls.length).toBe(readsBefore)
  })

  it('commits a local pin without a Provider read and keeps Plan rows pinnable', () => {
    const preflight = vi.fn(() => Promise.reject(new Error('codex-task-preflight-failed')))
    const kernel = createCompanionTaskKernel({
      preflight,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.publishEvidence(draft([
      task({ phase: 'completed', revisionAt: 100 }),
      task({
        key: 'codex-plan',
        actionAlias: 'ct_codex_plan_1234567890',
        phase: 'stopped',
        planReady: true,
        planLifecycleRevision: 100,
        revisionAt: 100
      })
    ], 1, { providers: { codex: true, claude: false } }))
    const readsBefore = preflight.mock.calls.length

    const pinned = kernel.setLocalPin({ lease: receipt.lease, key: 'codex-a', revisionAt: 100, localPin: true })
    expect(pinned.tasks.find((value: { key: string }) => value.key === 'codex-a')).toMatchObject({
      localPin: true,
      kind: 'local-pin',
      cycleTier: 'none'
    })

    // A completed Plan owns the pause lane for hiding, but stays pinnable.
    const pinnedPlan = kernel.setLocalPin({ lease: receipt.lease, key: 'codex-plan', revisionAt: 100, localPin: true })
    expect(pinnedPlan.tasks.find((value: { key: string }) => value.key === 'codex-plan')).toMatchObject({ localPin: true })

    const unpinned = kernel.setLocalPin({ lease: receipt.lease, key: 'codex-a', revisionAt: 100, localPin: false })
    expect(unpinned.tasks.find((value: { key: string }) => value.key === 'codex-a')).toMatchObject({
      localPin: false,
      kind: 'codex-thread'
    })

    expect(kernel.setLocalPin({ lease: receipt.lease, key: 'codex-a', revisionAt: 99, localPin: true })).toBeNull()
    expect(kernel.setLocalPin({ lease: receipt.lease + 1, key: 'codex-a', revisionAt: 100, localPin: true })).toBeNull()
    expect(kernel.setLocalPin({ lease: receipt.lease, key: 'codex-missing', localPin: true })).toBeNull()
    expect(preflight.mock.calls.length).toBe(readsBefore)
  })

  it('rejects a stale, unleased or Plan-owned visibility mutation', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.publishEvidence(draft([
      task({ phase: 'stopped', revisionAt: 100 }),
      task({
        key: 'codex-plan',
        actionAlias: 'ct_codex_plan_1234567890',
        phase: 'stopped',
        planReady: true,
        planLifecycleRevision: 100,
        revisionAt: 100
      })
    ], 1, { providers: { codex: true, claude: false } }))

    expect(kernel.setVisibility({ lease: receipt.lease, key: 'codex-a', revisionAt: 99, hidden: true })).toBeNull()
    expect(kernel.setVisibility({ lease: receipt.lease + 1, key: 'codex-a', revisionAt: 100, hidden: true })).toBeNull()
    expect(kernel.setVisibility({ lease: receipt.lease, key: 'codex-missing', revisionAt: 100, hidden: true })).toBeNull()
    expect(kernel.setVisibility({ lease: receipt.lease, key: 'codex-plan', revisionAt: 100, hidden: true })).toBeNull()
    expect(kernel.getLatest().tasks.every((value: { hidden: boolean }) => !value.hidden)).toBe(true)
  })

  it('does not renew ordinary dynamic visibility from metadata or observation revisions', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 10_000_000,
      initialConfiguration: {
        enabled: true,
        providers: { codex: true, claude: false },
        dynamicTaskWindowHours: 1
      }
    })
    const receipt = kernel.attach({
      enabled: true,
      providers: { codex: true, claude: false },
      dynamicTaskWindowHours: 1
    })
    const next = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        lastQuestionAt: 1_000,
        turnStartedAt: 1_000,
        statusEnteredAt: 1_000,
        createdAt: 500,
        revisionAt: 10_000,
        metadataRevision: 10_000,
        visibilityRevision: 10_000
      })], 1, { providers: { codex: true, claude: false } })
    })
    expect(next.tasks[0]).toMatchObject({ phase: 'running', dynamicEligible: false, dynamicGroup: 'none', cycleTier: 'none' })
  })

  it('migrates a legacy hidden Plan transactionally and rolls back pause when hidden-state cleanup fails', () => {
    const persisted: boolean[] = []
    const kernel = createCompanionTaskKernel({
      persistPlanPause: (value: Record<string, unknown>) => { persisted.push(value.paused === true); return true },
      migrateHiddenPlan: () => false,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        hidden: true,
        phase: 'stopped',
        planReady: true,
        planLifecycleRevision: 200
      })], 1, { providers: { codex: true, claude: false } })
    })
    expect(current.tasks[0]).toMatchObject({ hidden: true, paused: false })
    expect(persisted).toEqual([true, false])
  })

  it('uses one next-boundary timer and publishes only when dynamic visibility actually changes', () => {
    vi.useFakeTimers()
    let now = 1_000
    const kernel = createCompanionTaskKernel({
      now: () => now,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 1 }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 1 })
    const revisions: number[] = []
    kernel.subscribe(0, (value: any) => { if (value.complete) revisions.push(value.packageRevision) })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false } }) })
    expect(kernel.getLatest().views.groups.active).toEqual(['codex-a'])
    expect(kernel.diagnostics().nextVisibilityTransitionAt).toBe(3_600_100)

    now = 3_600_101
    vi.advanceTimersByTime(3_599_101)
    expect(kernel.getLatest().views.groups.active).toEqual([])
    expect(kernel.getLatest().tasks[0]).toMatchObject({ phase: 'running', dynamicEligible: false, cycleTier: 'none' })
    expect(kernel.getLatest().views.cycleKeys).toEqual([])
    expect(revisions).toHaveLength(2)
    expect(kernel.diagnostics().nextVisibilityTransitionAt).toBe(0)
  })

  it('keeps all visible input and unread attention outside the ordinary activity window', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 1_000_000_000,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'old-input', phase: 'waiting-input', dynamicEligible: false, lastQuestionAt: 10 }),
        task({ key: 'old-unread', phase: 'completed', unread: true, dynamicEligible: false, lastQuestionAt: 9 }),
        task({ key: 'old-running', phase: 'running', dynamicEligible: false, lastQuestionAt: 8 })
      ], 1, { providers: { codex: true, claude: false } })
    })

    expect(current.views.groups.input).toEqual(['old-input'])
    expect(current.views.groups.unread).toEqual(['old-unread'])
    expect(current.views.groups.active).toEqual([])
    expect(current.views.counts).toEqual({ input: 1, active: 0, unread: 1 })
    expect(current.views.attentionKeys).toMatchObject({ input: ['old-input'], completedUnread: ['old-unread'] })
    // Both badges count these, so both must be reachable: tier order puts the
    // input task first without excluding the unread one from the ring.
    expect(current.views.cycleKeys).toEqual(['old-input', 'old-unread'])
  })

  it('keeps a pinned finished task in the dynamic list after the activity window retires it', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 1_000_000_000,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'codex-pin-old', phase: 'completed', unread: false, localPin: true, dynamicEligible: false, lastQuestionAt: 9 }),
        task({ key: 'codex-plain-old', phase: 'completed', unread: false, dynamicEligible: false, lastQuestionAt: 8 })
      ], 1, { providers: { codex: true, claude: false } })
    })

    // Both are past the window. Only the pinned one survives in the list, which
    // is the entire point of pinning a finished task.
    expect(current.views.groups.pinned).toEqual(['codex-pin-old'])
    expect(current.views.groups.completed).toEqual([])
    // The pinned group is a placement, not a badge: counts stay untouched.
    expect(current.views.counts).toEqual({ input: 0, active: 0, unread: 0 })
  })

  it('exempts a pin from the activity window in every phase, not only the finished one', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 1_000_000_000,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'codex-pin-running', phase: 'running', localPin: true, dynamicEligible: false, lastQuestionAt: 9 }),
        task({ key: 'codex-pin-stopped', phase: 'stopped', localPin: true, dynamicEligible: false, lastQuestionAt: 8 }),
        task({ key: 'codex-plain-running', phase: 'running', dynamicEligible: false, lastQuestionAt: 7 })
      ], 1, { providers: { codex: true, claude: false } })
    })

    // A pin in ANY phase moves the row to the pin group (user decision,
    // 2026-09-01) and is exempt from the activity window; the badges keep
    // counting by real state, so the pinned running task still counts active.
    expect(current.views.groups.pinned).toEqual(['codex-pin-running', 'codex-pin-stopped'])
    expect(current.views.groups.active).toEqual([])
    expect(current.views.groups.stopped).toEqual([])
    // The window still retires unpinned work.
    expect(current.views.counts).toEqual({ input: 0, active: 1, unread: 0 })
  })

  it('gives a pinned unknown-phase task a group so the ring cannot outrun the list', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 1_000_000_000,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'claude-pin-unknown', provider: 'claude', kind: 'claude-session', phase: 'unknown', localPin: true, dynamicEligible: false, lastQuestionAt: 9 }),
        task({ key: 'claude-plain-unknown', provider: 'claude', kind: 'claude-session', phase: 'unknown', dynamicEligible: false, lastQuestionAt: 8 })
      ], 1, { providers: { codex: false, claude: true } })
    })

    // The reported defect: the pin held a ring slot through the `fallback` tier
    // while `unknown` earned it no group at all, so 上一个/下一个 kept landing on
    // a task no tab could show. `unknown` has no status group to stay in, so the
    // pin's own group takes it — one task, one place.
    expect(current.views.groups.pinned).toEqual(['claude-pin-unknown'])
    expect(current.views.groups.stopped).toEqual([])
    // ...and the pin group is served by the 已完成未读 entry, not the ordinary
    // ring. Sitting in 置顶 while every shortcut skipped it was the second half
    // of the same defect; being in both rings would be a third.
    expect(current.views.attentionKeys.completedUnread).toEqual(['claude-pin-unknown'])
    expect(current.views.cycleKeys).toEqual([])
    // An unpinned unknown task earns neither a group nor a ring slot.
    expect(current.views.groups.pinned).not.toContain('claude-plain-unknown')
    expect(current.views.cycleKeys).not.toContain('claude-plain-unknown')
    expect(current.views.attentionKeys.completedUnread).not.toContain('claude-plain-unknown')
  })

  it('keeps each pin in one display group and suppresses pin fallback while unread exists', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 1_000_000_000,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const phases = ['running', 'stopped', 'completed', 'unknown', 'waiting-input', 'waiting-approval']
    const tasks = phases.flatMap((phase, index) => [false, true].map((unread) => task({
      key: `codex-${phase}-${unread ? 'unread' : 'read'}`,
      phase,
      unread,
      localPin: true,
      kind: 'local-pin',
      dynamicEligible: false,
      lastQuestionAt: 100 - index
    })))
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(tasks, 1, { providers: { codex: true, claude: false } })
    })

    const ring = new Set<string>(current.views.cycleKeys)
    const entry = new Set<string>(current.views.attentionKeys.completedUnread)
    // Every pin now displays in the pin group (user decision, 2026-09-01)...
    expect([...current.views.groups.pinned].sort())
      .toEqual((current.tasks as Array<Record<string, any>>).map((value) => value.key).sort())
    for (const value of current.tasks as Array<Record<string, any>>) {
      const parked = value.phase === 'completed' && !value.unread || value.phase === 'unknown'
      if (parked) {
        // ...but a parked pin (completed-read / unknown) stays out of the
        // ordinary ring, and a real unread backlog keeps it out of the
        // dedicated entry, so that shortcut can never drift from unread work
        // into parked pins.
        expect(entry.has(value.key)).toBe(false)
        expect(ring.has(value.key)).toBe(false)
      } else {
        // Its state-earned reachability survives the display move: pinning
        // must neither add a ring slot nor take one away.
        expect(ring.has(value.key)).toBe(true)
      }
    }
    // The unread backlog is deliberately reachable both ways: the entry is the
    // fast path to it, the ring still walks it as a tier. Parked pins become the
    // entry's fallback only after this backlog is empty.
    expect([...entry].sort()).toEqual(
      (current.tasks as Array<Record<string, any>>)
        .filter((value) => value.phase === 'completed' && value.unread)
        .map((value) => value.key)
        .sort()
    )
  })

  it('derives every badge and entry from the display group rather than a restated phase test', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 1_000_000_000,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const phases = ['running', 'stopped', 'completed', 'unknown', 'waiting-input', 'waiting-approval']
    const tasks = phases.flatMap((phase, index) => [false, true].flatMap((localPin) => [false, true].flatMap((unread) => [false, true].map((open) => task({
      key: `codex-${phase}-${localPin ? 'pin' : 'plain'}-${unread ? 'unread' : 'read'}-${open ? 'open' : 'shut'}`,
      phase,
      localPin,
      unread,
      dynamicEligible: false,
      lastQuestionAt: 100 - index,
      capabilities: { open, archive: false, pause: false, resume: false, executePlan: false }
    })))))
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(tasks, 1, { providers: { codex: true, claude: false } })
    })

    const rows = current.tasks as Array<Record<string, any>>
    // Badges and entries read state-earned reachability (RAW + user decision
    // 2026-09-01): moving every pin's ROW into the pin group must not shrink
    // what the attention badges promise or what the direct entries reach.
    const stateInput = rows
      .filter((value) => ['waiting-input', 'waiting-approval'].includes(value.phase) && value.capabilities.open)
      .map((value) => value.key)
    const stateUnread = rows
      .filter((value) => value.phase === 'completed' && value.unread && value.capabilities.open)
      .map((value) => value.key)
    const stateActive = rows
      .filter((value) => value.phase === 'running' && value.localPin && value.capabilities.open)
      .map((value) => value.key)
    expect(current.views.counts.input).toBe(stateInput.length)
    expect(current.views.counts.unread).toBe(stateUnread.length)
    expect(current.views.counts.active).toBe(stateActive.length)
    expect([...current.views.attentionKeys.input].sort()).toEqual(stateInput.sort())
    expect([...current.views.attentionKeys.completedUnread].sort()).toEqual(stateUnread.sort())
    // A guard on the fixture itself: an all-open or all-empty matrix would let
    // every assertion above hold vacuously.
    expect(current.views.groups.pinned.length).toBeGreaterThan(0)
    expect(stateUnread.length).toBeGreaterThan(0)
  })

  it('never puts a task in the ring that no dynamic group shows', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 1_000_000_000,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const phases = ['running', 'stopped', 'completed', 'unknown', 'waiting-input']
    const tasks = phases.flatMap((phase, index) => [false, true].flatMap((localPin) => [false, true].map((unread) => task({
      key: `codex-${phase}-${localPin ? 'pin' : 'plain'}-${unread ? 'unread' : 'read'}`,
      phase,
      localPin,
      unread,
      dynamicEligible: false,
      lastQuestionAt: 100 - index
    }))))
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(tasks, 1, { providers: { codex: true, claude: false } })
    })

    const placements = Object.values(current.views.groups as Record<string, string[]>).flat()
    const grouped = new Set(placements)
    // A badge promises reachability (RAW-182); a ring slot promises visibility.
    // Every cycle key must therefore be somewhere the user can actually look.
    expect(current.views.cycleKeys.filter((key: string) => !grouped.has(key))).toEqual([])
    // ...and in exactly one place: a task listed twice reads as a duplicate row.
    expect(placements.length).toBe(grouped.size)
  })

  it('keeps the complete admitted inventory without a product task-count cap', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const tasks = Array.from({ length: 2_005 }, (_, index) => task({
      key: `codex-${index}`,
      actionAlias: `ct_codex_${String(index).padStart(10, '0')}`,
      revisionAt: 1_000 + index,
      membershipRevision: 1_000 + index,
      phaseRevision: 1_000 + index,
      unreadRevision: 1_000 + index,
      visibilityRevision: 1_000 + index,
      displayOrder: index,
      cycleOrder: index,
      attentionOrder: index
    }))
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(tasks, 1, { providers: { codex: true, claude: false } })
    })
    expect(kernel.getPackage().tasks).toHaveLength(2_005)
    expect(kernel.diagnostics()).toMatchObject({
      taskCount: 2_005,
      navigation: { targetCount: 2_005 },
      actions: { targetCount: 2_005 }
    })
    kernel.close()
  })

  it('keeps all 240 paged tasks in package, unread tab, badge, attention shortcut and archive targets', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const tasks = Array.from({ length: 240 }, (_, index) => task({
      key: `codex-page-${index + 1}`,
      actionAlias: `ct_codex_page_${String(index + 1).padStart(10, '0')}`,
      phase: 'completed',
      cycleTier: 'none',
      dynamicGroup: 'unread',
      revisionAt: 1_000 + index,
      membershipRevision: 1_000 + index,
      phaseRevision: 1_000 + index,
      unreadRevision: 1_000 + index,
      visibilityRevision: 1_000 + index,
      displayOrder: index,
      cycleOrder: index,
      attentionOrder: index,
      unread: true,
      unreadKnown: true,
      capabilities: { open: true, archive: true },
      archiveRequest: {
        evidence: 'completed',
        expectedRevisionAt: 1_000 + index,
        expectedUpdatedAt: 1_000 + index,
        expectedCompletionAt: 1_000 + index,
        expectedLastTurnStartedAt: 900 + index,
        expectedSourceFingerprint: 'a'.repeat(64)
      }
    }))
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(tasks, 1, { providers: { codex: true, claude: false } })
    })

    for (const index of [40, 100, 200]) {
      const key = `codex-page-${index + 1}`
      expect(current.tasks.some((value: any) => value.key === key)).toBe(true)
      expect(current.views.groups.unread).toContain(key)
      expect(current.views.attentionKeys.completedUnread).toContain(key)
      expect(current.views.attentionKeys.archive).toContain(key)
    }
    expect(current.views.counts.unread).toBe(240)
    expect(kernel.diagnostics()).toMatchObject({ taskCount: 240, actions: { targetCount: 240 } })
    kernel.close()
  })

  it('routes card click and keyboard cycle through the same complete target', async () => {
    const opened: Array<Record<string, unknown>> = []
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      adapters: {
        codex: {
          open: vi.fn(async (target: Record<string, unknown>) => {
            opened.push({ ...target })
            return nativeOpened()
          })
        }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false } }) })
    await expect(kernel.dispatch({ action: 'open', key: 'codex-a', source: 'manual' })).resolves.toMatchObject({ outcome: 'opened' })
    await expect(kernel.dispatch({ action: 'cycle', direction: 1 })).resolves.toMatchObject({ outcome: 'opened' })

    expect(opened).toHaveLength(2)
    expect(opened[0]).toMatchObject({ key: 'codex-a', provider: 'codex', revisionAt: 100, phase: 'running', canArchive: false })
    expect(opened[1]).toEqual(opened[0])
    expect(kernel.diagnostics().navigation.lastOutcome).toBe('opened')
  })

  it('routes a first-class Cursor root through the same snapshot and command gateway', async () => {
    const openedCursor: string[] = []
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      adapters: {
        codex: { open: vi.fn(async () => nativeOpened()) },
        cursor: {
          open: vi.fn(async (target: Record<string, unknown>) => {
            openedCursor.push(String(target.actionAlias))
            return { outcome: 'dispatched' }
          })
        }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false, cursor: true } })
    const cursorKey = 'cursor:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'completed',
        dynamicGroup: 'completed',
        statusEnteredAt: 120,
        terminalAt: 120,
        lastQuestionAt: 0,
        unread: false
      }), task({
        key: cursorKey,
        provider: 'cursor',
        kind: 'cursor-session',
        actionAlias: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        family: 'cursor:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        role: 'root',
        revisionAt: 900,
        phaseRevision: 900,
        membershipRevision: 900,
        statusEnteredAt: 900,
        lastQuestionAt: 900,
        createdAt: 800
      })], 1, { providers: { codex: true, claude: false, cursor: true }, sourceGenerations: { codex: 1, claude: 0, cursor: 1 } })
    })
    const snapshot = kernel.getLatest()
    expect(snapshot.tasks.map((row: Record<string, unknown>) => row.key)).toEqual([cursorKey, 'codex-a'])
    expect(snapshot.views.cycleKeys).toEqual([cursorKey])

    await expect(kernel.dispatchCommand({
      revision: 'companion-task-command-v1',
      operationId: 'cursor-cycle-1',
      command: 'cycle',
      selector: { direction: 1 },
      source: 'global-shortcut',
      expectedRevision: { snapshot: snapshot.packageRevision, topology: snapshot.topologyRevision }
    })).resolves.toMatchObject({
      outcome: 'dispatched',
      provider: 'cursor',
      key: cursorKey
    })
    expect(openedCursor).toEqual(['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'])
    expect(kernel.publishAuxiliaryCycleTasks).toBeUndefined()
  })

  it('publishes only the aggregate root and excludes topology children from badges and cycling', () => {
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false, cursor: false } })
    const family = 'codex:family-a'
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'root', family, role: 'root', phase: 'completed', unreadKnown: true, unread: false }),
        task({
          key: 'child',
          family,
          role: 'child',
          kind: 'topology-child',
          phase: 'waiting-input',
          actionAlias: '',
          unreadKnown: true,
          unread: true,
          capabilities: { open: false, archive: false, pause: false, resume: false, executePlan: false }
        })
      ], 1, {
        providers: { codex: true, claude: false, cursor: false },
        relations: [{
          childKey: 'child',
          parentKey: 'root',
          provider: 'codex',
          family,
          relation: 'subagent',
          authority: 'test-exact-identity',
          exact: true,
          generation: 1
        }]
      })
    })

    expect(current.tasks).toHaveLength(1)
    expect(current.tasks[0]).toMatchObject({
      key: 'root',
      phase: 'waiting-input',
      unread: true,
      topology: { mode: 'aggregate', memberCount: 2, liveCount: 1, attentionCount: 1 }
    })
    expect(current.views.counts).toMatchObject({ input: 1, active: 0, unread: 0 })
    // The child stays private; its exact current interaction is represented by
    // the aggregate root in the same input badge and ring, without an
    // intermediate completed-unread publication.
    expect(current.views.cycleKeys).toEqual(['root'])
    expect(JSON.stringify(current)).not.toContain('test-exact-identity')
  })

  it('deduplicates command operations, isolates adapter exceptions and rejects old command revisions', async () => {
    const opened = vi.fn(async () => { throw new Error('provider crash') })
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      adapters: { codex: { open: opened } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false, cursor: false } })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false, cursor: false } }) })
    const snapshot = kernel.getLatest()
    const command = {
      revision: 'companion-task-command-v1',
      operationId: 'dedupe_open_1',
      command: 'open',
      selector: { key: 'codex-a' },
      source: 'manual',
      expectedRevision: { snapshot: snapshot.packageRevision, topology: snapshot.topologyRevision }
    }
    const first = kernel.dispatchCommand(command)
    const duplicate = kernel.dispatchCommand(command)
    expect(duplicate).toBe(first)
    await expect(first).resolves.toMatchObject({ outcome: 'failed', errorCode: 'open-failed', key: 'codex-a' })
    expect(opened).toHaveBeenCalledTimes(1)
    expect(kernel.getLatest()).toMatchObject({
      complete: true,
      providerHealth: { codex: { status: 'degraded', errorCode: 'open-failed' } }
    })
    await expect(kernel.dispatchCommand({ ...command, revision: 'companion-task-command-v0', operationId: 'legacy_open_1' }))
      .resolves.toMatchObject({ outcome: 'unavailable', errorCode: 'reload-required' })
  })

  it('replays the latest full snapshot after a missed revision and records monotonic consumer ACKs', () => {
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false, cursor: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false, cursor: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task()], 1, { providers: { codex: true, claude: false, cursor: false } })
    })
    const replayed: Array<Record<string, any>> = []
    const stop = kernel.subscribe(0, (value: Record<string, any>) => replayed.push(value))
    expect(replayed).toHaveLength(1)
    expect(replayed[0]).toBe(current)
    expect(kernel.acknowledge({ consumer: 'float', revision: current.packageRevision })).toBe(true)
    expect(kernel.acknowledge({ consumer: 'float', revision: current.packageRevision - 1 })).toBe(false)
    expect(kernel.diagnostics().consumerAcknowledgements).toEqual({ float: current.packageRevision })
    stop()
  })

  it('owns attention progress, preserves it across equivalent packages and advances only after a successful open', async () => {
    const opened: string[] = []
    let failFirst = true
    const kernel = createCompanionTaskKernel({
      adapters: {
        codex: {
          open: async (target: Record<string, unknown>) => {
            opened.push(String(target.key))
            if (target.key === 'codex-new' && failFirst) {
              failFirst = false
              return { outcome: 'failed', errorCode: 'test-failure' }
            }
            return nativeOpened()
          }
        }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'codex-old', phase: 'waiting-input', lastQuestionAt: 100, statusEnteredAt: 100 }),
        task({ key: 'codex-new', phase: 'waiting-input', lastQuestionAt: 200, statusEnteredAt: 200 })
      ], 1, { providers: { codex: true, claude: false } })
    })

    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input' })).resolves.toMatchObject({ outcome: 'failed' })
    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input' })).resolves.toMatchObject({ outcome: 'opened', key: 'codex-new' })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'codex-old', phase: 'waiting-input', lastQuestionAt: 100, statusEnteredAt: 100, metadataRevision: 500 }),
        task({ key: 'codex-new', phase: 'waiting-input', lastQuestionAt: 200, statusEnteredAt: 200, metadataRevision: 500 })
      ], 2, { providers: { codex: true, claude: false } })
    })
    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input' })).resolves.toMatchObject({ outcome: 'opened', key: 'codex-old' })
    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input' })).resolves.toMatchObject({ outcome: 'opened', key: 'codex-new' })

    expect(opened).toEqual(['codex-new', 'codex-new', 'codex-old', 'codex-new'])
  })

  it('keeps a parked pin visited once its lifecycle fields move underneath it', async () => {
    const opened: string[] = []
    const kernel = createCompanionTaskKernel({
      adapters: { codex: { open: async (target: Record<string, unknown>) => { opened.push(String(target.key)); return nativeOpened() } } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const pin = (key: string, lastQuestionAt: number, statusEnteredAt: number) => task({
      key,
      actionAlias: `ct_${key.replace(/[^a-z0-9]/g, '')}_1234567890`,
      phase: 'completed',
      unread: false,
      localPin: true,
      kind: 'local-pin',
      dynamicEligible: false,
      lastQuestionAt,
      statusEnteredAt
    })
    const publish = (headStatusEnteredAt: number, generation: number) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([pin('codex-a', 300, headStatusEnteredAt), pin('codex-b', 200, 100), pin('codex-c', 100, 100)],
        generation, { providers: { codex: true, claude: false } })
    })

    const first = publish(100, 1)
    expect(first.views.attentionKeys.completedUnread).toEqual(['codex-a', 'codex-b', 'codex-c'])

    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })
    // A parked pin is finished and already read, so nothing about it is a new
    // instance to revisit. Its lifecycle timestamps are recomputed as
    // max-over-members on an aggregate root, so they can move without the task
    // itself changing — visit progress must not be reset by that.
    publish(999, 2)
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })

    expect(opened).toEqual(['codex-a', 'codex-b', 'codex-c'])
  })

  it('fixes the progress identity of an unknown pin too, not only a read completion', async () => {
    const opened: string[] = []
    const kernel = createCompanionTaskKernel({
      adapters: { codex: { open: async (target: Record<string, unknown>) => { opened.push(String(target.key)); return nativeOpened() } } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const pin = (key: string, lastQuestionAt: number, statusEnteredAt: number) => task({
      key,
      actionAlias: `ct_${key.replace(/[^a-z0-9]/g, '')}_1234567890`,
      phase: 'unknown',
      localPin: true,
      kind: 'local-pin',
      dynamicEligible: false,
      lastQuestionAt,
      statusEnteredAt
    })
    const publish = (headStatusEnteredAt: number, generation: number) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([pin('codex-a', 300, headStatusEnteredAt), pin('codex-b', 200, 100)],
        generation, { providers: { codex: true, claude: false } })
    })

    expect(publish(100, 1).views.attentionKeys.completedUnread).toEqual(['codex-a', 'codex-b'])
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })
    // An `unknown` pin is parked for the same reason a read completion is: no
    // evidence, so no new instance to revisit. The identity test used to name
    // `completed && !unread` instead of the pin group, so once the queue grew to
    // serve `unknown` pins their visit was invalidated by max-over-members churn
    // and the walk jumped back to the head, never reaching the tail.
    publish(999, 2)
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })

    expect(opened).toEqual(['codex-a', 'codex-b'])
  })

  it('keeps completed-read pins in explicit local order while unrelated metadata changes', async () => {
    const opened: string[] = []
    const kernel = createCompanionTaskKernel({
      adapters: { codex: { open: async (target: Record<string, unknown>) => { opened.push(String(target.key)); return nativeOpened() } } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const pin = (key: string, lastQuestionAt: number, displayOrder: number) => task({
      key,
      actionAlias: `ct_${key.replace(/[^a-z0-9]/g, '')}_1234567890`,
      phase: 'completed',
      unread: false,
      localPin: true,
      kind: 'local-pin',
      dynamicEligible: false,
      lastQuestionAt,
      displayOrder,
      statusEnteredAt: 100
    })
    const publish = (values: Array<Record<string, unknown>>, generation: number) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(values, generation, { providers: { codex: true, claude: false } })
    })

    const first = publish([
      pin('codex-a', 300, 0),
      pin('codex-b', 200, 1),
      pin('codex-c', 100, 2)
    ], 1)
    expect(first.views.groups.pinned).toEqual(['codex-a', 'codex-b', 'codex-c'])
    expect(first.views.attentionKeys.completedUnread).toEqual(['codex-a', 'codex-b', 'codex-c'])
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })

    const metadataRefresh = publish([
      pin('codex-a', 300, 0),
      pin('codex-b', 200, 1),
      pin('codex-c', 400, 2)
    ], 2)
    expect(metadataRefresh.views.groups.pinned).toEqual(['codex-a', 'codex-b', 'codex-c'])
    expect(metadataRefresh.views.attentionKeys.completedUnread).toEqual(['codex-a', 'codex-b', 'codex-c'])
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })

    expect(opened).toEqual(['codex-a', 'codex-b', 'codex-c', 'codex-a'])

    const explicitReorder = publish([
      pin('codex-a', 300, 1),
      pin('codex-b', 200, 2),
      pin('codex-c', 400, 0)
    ], 3)
    expect(explicitReorder.views.groups.pinned).toEqual(['codex-c', 'codex-a', 'codex-b'])
    expect(explicitReorder.views.attentionKeys.completedUnread).toEqual(['codex-c', 'codex-a', 'codex-b'])
  })

  it('holds input attention order across metadata-only re-sorts too', async () => {
    const opened: string[] = []
    const kernel = createCompanionTaskKernel({
      adapters: { codex: { open: async (target: Record<string, unknown>) => { opened.push(String(target.key)); return nativeOpened() } } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const waiting = (key: string, lastQuestionAt: number) => task({
      key,
      actionAlias: `ct_${key.replace(/[^a-z0-9]/g, '')}_1234567890`,
      phase: 'waiting-input',
      lastQuestionAt,
      statusEnteredAt: 100
    })
    const publish = (values: Array<Record<string, unknown>>, generation: number) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(values, generation, { providers: { codex: true, claude: false } })
    })

    expect(publish([waiting('codex-a', 300), waiting('codex-b', 200), waiting('codex-c', 100)], 1)
      .views.attentionKeys.input).toEqual(['codex-a', 'codex-b', 'codex-c'])
    await kernel.dispatch({ action: 'open-attention', kind: 'input' })
    expect(publish([waiting('codex-a', 300), waiting('codex-b', 200), waiting('codex-c', 400)], 2)
      .views.attentionKeys.input).toEqual(['codex-c', 'codex-a', 'codex-b'])
    await kernel.dispatch({ action: 'open-attention', kind: 'input' })
    await kernel.dispatch({ action: 'open-attention', kind: 'input' })
    await kernel.dispatch({ action: 'open-attention', kind: 'input' })

    expect(opened).toEqual(['codex-a', 'codex-b', 'codex-c', 'codex-c'])
  })

  it('lets a new attention instance preempt queued opens and then resumes surviving order', async () => {
    const opened: string[] = []
    let releaseFirst!: () => void
    let signalFirstStarted!: () => void
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const firstStarted = new Promise<void>((resolve) => { signalFirstStarted = resolve })
    const kernel = createCompanionTaskKernel({
      adapters: {
        codex: {
          open: async (target: Record<string, unknown>) => {
            opened.push(String(target.key))
            if (opened.length === 1) {
              signalFirstStarted()
              await firstGate
            }
            return nativeOpened()
          }
        }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const waiting = (key: string, lastQuestionAt: number, statusEnteredAt: number) => task({
      key,
      actionAlias: `ct_${key.replace(/[^a-z0-9]/g, '')}_1234567890`,
      phase: 'waiting-input',
      lastQuestionAt,
      statusEnteredAt
    })
    const publish = (values: Array<Record<string, unknown>>, generation: number) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(values, generation, { providers: { codex: true, claude: false } })
    })

    publish([
      waiting('codex-a', 300, 300),
      waiting('codex-b', 200, 200),
      waiting('codex-c', 100, 100)
    ], 1)
    const first = kernel.dispatch({ action: 'open-attention', kind: 'input' })
    await firstStarted
    const second = kernel.dispatch({ action: 'open-attention', kind: 'input' })
    const third = kernel.dispatch({ action: 'open-attention', kind: 'input' })

    expect(publish([
      waiting('codex-new', 600, 600),
      waiting('codex-c', 500, 100),
      waiting('codex-a', 300, 300),
      waiting('codex-b', 200, 200)
    ], 2).views.attentionKeys.input).toEqual(['codex-new', 'codex-c', 'codex-a', 'codex-b'])
    releaseFirst()
    await Promise.all([first, second, third])
    await kernel.dispatch({ action: 'open-attention', kind: 'input' })

    expect(opened).toEqual(['codex-a', 'codex-new', 'codex-b', 'codex-c'])
  })

  it('drops pin progress while unread exists and restarts pin fallback after it clears', async () => {
    const opened: string[] = []
    const kernel = createCompanionTaskKernel({
      adapters: { codex: { open: async (target: Record<string, unknown>) => { opened.push(String(target.key)); return nativeOpened() } } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const pin = (key: string, lastQuestionAt: number) => task({
      key,
      actionAlias: `ct_${key.replace(/[^a-z0-9]/g, '')}_1234567890`,
      phase: 'completed',
      unread: false,
      localPin: true,
      kind: 'local-pin',
      dynamicEligible: false,
      lastQuestionAt
    })
    const unread = (key: string, lastQuestionAt: number) => task({
      key,
      actionAlias: `ct_${key.replace(/[^a-z0-9]/g, '')}_1234567890`,
      phase: 'completed',
      unread: true,
      unreadKnown: true,
      lastQuestionAt,
      statusEnteredAt: lastQuestionAt
    })
    const publish = (tasks: Array<Record<string, unknown>>, generation: number, snapshot = false) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(tasks, generation, {
        providers: { codex: true, claude: false },
        ...(snapshot ? { producer: 'host-preflight' } : {})
      })
    })
    const pins = [pin('codex-pin-a', 200), pin('codex-pin-b', 100)]

    expect(publish(pins, 1).views.attentionKeys.completedUnread).toEqual(['codex-pin-a', 'codex-pin-b'])
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })

    const mixed = publish([
      unread('codex-unread-a', 400),
      unread('codex-unread-b', 300),
      ...pins
    ], 2)
    expect(mixed.views.attentionKeys.completedUnread).toEqual(['codex-unread-a', 'codex-unread-b'])
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })

    expect(opened).toEqual(['codex-pin-a', 'codex-unread-a', 'codex-unread-b', 'codex-unread-a'])

    expect(publish(pins, 3, true).views.attentionKeys.completedUnread).toEqual(['codex-pin-a', 'codex-pin-b'])
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })
    await kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' })

    // The pin visit from generation 1 was pruned while unread owned the entry,
    // so the fallback starts a fresh stable walk instead of resuming mid-list.
    expect(opened).toEqual([
      'codex-pin-a',
      'codex-unread-a',
      'codex-unread-b',
      'codex-unread-a',
      'codex-pin-a',
      'codex-pin-b'
    ])
  })

  it('keeps a pinned live task in every shortcut its own state earns it', async () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'codex-pin-input', phase: 'waiting-input', localPin: true, lastQuestionAt: 300 }),
        task({ key: 'codex-pin-running', phase: 'running', localPin: true, lastQuestionAt: 200 }),
        task({ key: 'codex-pin-unread', phase: 'completed', unread: true, localPin: true, lastQuestionAt: 100 })
      ], 1, { providers: { codex: true, claude: false } })
    })

    // Pinning must never quietly remove a task from the entries its own phase
    // earns it; the rows themselves now display in the pin group (user
    // decision, 2026-09-01) while every shortcut stays state-earned.
    expect(current.views.cycleKeys).toEqual(['codex-pin-input', 'codex-pin-running', 'codex-pin-unread'])
    expect(current.views.attentionKeys.input).toEqual(['codex-pin-input'])
    expect(current.views.groups.pinned).toEqual(['codex-pin-input', 'codex-pin-running', 'codex-pin-unread'])
    expect(current.views.groups.input).toEqual([])
    expect(current.views.groups.active).toEqual([])
    expect(current.views.groups.unread).toEqual([])
    expect(current.views.counts).toEqual({ input: 1, active: 1, unread: 1 })
  })

  it('gives a finished, already-read pin its own fast-access entry instead of the ring', async () => {
    const opened: string[] = []
    const kernel = createCompanionTaskKernel({
      adapters: {
        codex: {
          open: async (target: Record<string, unknown>) => {
            opened.push(String(target.key))
            return nativeOpened()
          }
        }
      },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const packageValue = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ key: 'codex-pin', phase: 'completed', localPin: true, unread: false })], 1, {
        providers: { codex: true, claude: false }
      })
    })

    expect(packageValue.views.counts.input).toBe(0)
    expect(packageValue.views.attentionKeys.input).toEqual([])
    // The one pin that leaves the ring: it has a dedicated entry instead.
    expect(packageValue.views.cycleKeys).toEqual([])
    // A finished, already-read pin is what the dedicated pinned group collects.
    expect(packageValue.views.groups.pinned).toEqual(['codex-pin'])
    expect(packageValue.views.attentionKeys.completedUnread).toEqual(['codex-pin'])
    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input' })).resolves.toMatchObject({ outcome: 'unavailable' })
    expect(opened).toEqual([])

    await expect(kernel.dispatch({ action: 'open-attention', kind: 'completed-unread' }))
      .resolves.toMatchObject({ outcome: 'opened' })
    expect(opened).toEqual(['codex-pin'])
  })

  it('keeps a Claude native open-read receipt for the same completion and releases it for the next completion', async () => {
    const kernel = createCompanionTaskKernel({
      adapters: { claude: { open: async () => nativeOpened(true) } },
      initialConfiguration: { enabled: true, providers: { codex: false, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: false, claude: true } })
    const claudeTask = (overrides: Record<string, unknown>) => task({
      key: 'claude:local-a',
      provider: 'claude',
      kind: 'claude-session',
      actionAlias: 'local-a',
      capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false },
      ...overrides
    })

    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([claudeTask({ phase: 'completed', unread: true, revisionAt: 100, phaseRevision: 100, statusEnteredAt: 100, terminalAt: 100 })], 1, {
        providers: { codex: false, claude: true }
      })
    })
    await expect(kernel.dispatch({ action: 'open', key: 'claude:local-a' })).resolves.toMatchObject({ outcome: 'opened' })
    expect(kernel.getLatest().tasks[0]).toMatchObject({ phase: 'completed', unread: false })

    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([claudeTask({ phase: 'completed', unread: true, revisionAt: 100, phaseRevision: 100, unreadRevision: 200, statusEnteredAt: 100, terminalAt: 100 })], 2, {
        providers: { codex: false, claude: true }
      })
    })
    expect(kernel.getLatest().tasks[0]).toMatchObject({ phase: 'completed', unread: false })

    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([claudeTask({ phase: 'running', unread: false, revisionAt: 200, phaseRevision: 200, statusEnteredAt: 200, terminalAt: 0 })], 3, {
        providers: { codex: false, claude: true }
      })
    })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([claudeTask({ phase: 'completed', unread: true, revisionAt: 300, phaseRevision: 300, statusEnteredAt: 300, terminalAt: 300 })], 4, {
        providers: { codex: false, claude: true }
      })
    })
    expect(kernel.getLatest().tasks[0]).toMatchObject({ phase: 'completed', unread: true })
  })

  it('downgrades an unverified opened claim and preserves unread in the canonical snapshot', async () => {
    const kernel = createCompanionTaskKernel({
      adapters: { claude: { open: async () => ({ outcome: 'opened', confirmsRead: true }) } },
      initialConfiguration: { enabled: true, providers: { codex: false, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: false, claude: true } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        key: 'claude:unverified-open',
        provider: 'claude',
        kind: 'claude-session',
        actionAlias: 'local-unverified-open',
        phase: 'completed',
        unread: true,
        terminalAt: 100,
        capabilities: { open: true, archive: false, pause: false, resume: false, executePlan: false }
      })], 1, { providers: { codex: false, claude: true } })
    })

    await expect(kernel.dispatch({ action: 'open', key: 'claude:unverified-open' })).resolves.toMatchObject({
      outcome: 'dispatched',
      confirmsRead: false
    })
    expect(kernel.getLatest().tasks[0]).toMatchObject({ phase: 'completed', unread: true })
  })

  it('reduces precise state immediately, ignores stale terminal regressions and permits a newer Turn restart only without Goal evidence', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const sync = (value: Record<string, unknown>, revision: number, phaseGeneration = revision) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task(value)], revision, {
        providers: { codex: true, claude: false },
        sourceLaneGenerations: {
          codex: { membership: revision, activity: phaseGeneration, unread: revision },
          claude: { membership: 0, activity: 0, unread: 0 }
        }
      })
    })

    expect(sync({ phase: 'running', revisionAt: 100, phaseRevision: 100, statusEnteredAt: 100 }, 1).tasks[0].phase).toBe('running')
    expect(sync({ phase: 'waiting-input', cycleTier: 'attention', dynamicGroup: 'input', revisionAt: 110, phaseRevision: 110, statusEnteredAt: 110 }, 2).tasks[0].phase).toBe('waiting-input')
    expect(sync({ phase: 'completed', cycleTier: 'none', dynamicGroup: 'completed', revisionAt: 120, phaseRevision: 120, statusEnteredAt: 120 }, 3).tasks[0].phase).toBe('completed')
    expect(sync({ phase: 'running', revisionAt: 120, phaseRevision: 119, statusEnteredAt: 119 }, 4, 3).tasks[0].phase).toBe('completed')
    expect(sync({ phase: 'running', revisionAt: 130, phaseRevision: 130, statusEnteredAt: 130 }, 5).tasks[0].phase).toBe('running')
    expect(sync({
      phase: 'waiting-approval',
      cycleTier: 'attention',
      dynamicGroup: 'input',
      revisionAt: 140,
      phaseRevision: 140,
      statusEnteredAt: 140,
      causalKey: 'approval:turn-140',
      causalReliable: true
    }, 6).tasks[0].phase).toBe('waiting-approval')
    expect(sync({ phase: 'stopped', cycleTier: 'none', dynamicGroup: 'stopped', revisionAt: 140, phaseRevision: 139, statusEnteredAt: 139 }, 7, 6).tasks[0].phase).toBe('waiting-approval')
  })

  it('accepts a newer Claude completion and unread lane even when its metadata revision is lower', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: false, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: false, claude: true } })
    const claude = task({
      key: 'claude-a',
      provider: 'claude',
      kind: 'claude-session',
      actionAlias: 'local-claude-a',
      revisionAt: 200,
      statusEnteredAt: 200
    })

    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([claude], 1, {
        providers: { codex: false, claude: true },
        sourceGenerations: { codex: 0, claude: 10 },
        sourceLaneGenerations: {
          codex: { membership: 0, activity: 0, unread: 0 },
          claude: { membership: 10, activity: 10, unread: 10 }
        }
      })
    })
    const completed = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([{
        ...claude,
        phase: 'completed',
        cycleTier: 'none',
        dynamicGroup: 'unread',
        revisionAt: 150,
        statusEnteredAt: 150,
        unread: true,
        capabilities: { open: true, archive: true }
      }], 2, {
        providers: { codex: false, claude: true },
        sourceGenerations: { codex: 0, claude: 12 },
        sourceLaneGenerations: {
          codex: { membership: 0, activity: 0, unread: 0 },
          claude: { membership: 10, activity: 11, unread: 12 }
        }
      })
    })

    expect(completed.tasks[0]).toMatchObject({
      phase: 'completed',
      unread: true,
      dynamicGroup: 'unread',
      capabilities: { open: true, archive: true }
    })
    expect(completed.views.groups.unread).toEqual(['claude-a'])
    expect(completed.sourceLaneGenerations.claude).toEqual({
      membership: 10,
      activity: 11,
      interaction: 0,
      unread: 12,
      planArtifact: 0,
      metadata: 0,
      topology: 0
    })
  })

  it('revokes a stale Codex archive capability on a newer non-terminal phase without inventory', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const completed = task({
      phase: 'completed',
      cycleTier: 'none',
      dynamicGroup: 'completed',
      capabilities: { open: true, archive: true },
      archiveRequest: {
        evidence: 'completed',
        expectedRevisionAt: 100,
        expectedUpdatedAt: 100,
        expectedLastTurnStartedAt: 90,
        expectedSourceFingerprint: 'a'.repeat(64)
      }
    })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([completed], 1, {
        providers: { codex: true, claude: false },
        sourceLaneGenerations: {
          codex: { membership: 10, activity: 10, unread: 10 },
          claude: { membership: 0, activity: 0, unread: 0 }
        }
      })
    })
    expect(kernel.getPackage().tasks[0]).not.toHaveProperty('archiveRequest')

    const running = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        ...completed,
        phase: 'running',
        cycleTier: 'active',
        dynamicGroup: 'active',
        phaseRevision: 110,
        statusEnteredAt: 110,
        capabilities: { open: true, archive: false }
      })], 2, {
        providers: { codex: true, claude: false },
        sourceLaneGenerations: {
          codex: { membership: 10, activity: 11, unread: 10 },
          claude: { membership: 0, activity: 0, unread: 0 }
        }
      })
    })

    expect(running.tasks[0]).toMatchObject({ phase: 'running', capabilities: { open: true, archive: false } })
    expect(running.tasks[0]).not.toHaveProperty('archiveRequest')
  })

  it('orders every group and the selected cycle tier by latest question across providers and pins', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: true } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'codex-old', lastQuestionAt: 100, createdAt: 10 }),
        task({ key: 'claude-new', provider: 'claude', kind: 'claude-session', actionAlias: 'local-new', lastQuestionAt: 300, createdAt: 30 }),
        task({ key: 'codex-pinned-middle', kind: 'local-pin', localPin: true, lastQuestionAt: 200, createdAt: 20 })
      ], 1)
    })

    // A pin on a live task keeps the ring position its own running state earns
    // it; only the ROW moves to the pin group (user decision, 2026-09-01).
    expect(current.views.groups.pinned).toEqual(['codex-pinned-middle'])
    expect(current.views.groups.active).toEqual(['claude-new', 'codex-old'])
    expect(current.views.cycleKeys).toEqual(['claude-new', 'codex-pinned-middle', 'codex-old'])
  })

  it('keeps an ordinary stopped local pin in the fourth navigation layer', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'stopped',
        localPin: true,
        kind: 'local-pin',
        planReady: false,
        capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false }
      })], 1, { providers: { codex: true, claude: false } })
    })
    expect(current.tasks[0].cycleTier).toBe('fallback')
    expect(current.views.cycleKeys).toEqual(['codex-a'])
    // The ROW displays in the pin group (user decision, 2026-09-01), but a
    // continuable stopped pin rides the ring's fourth layer, not the parked
    // fast-access entry.
    expect(current.views.groups.pinned).toEqual(['codex-a'])
    expect(current.views.groups.stopped).toEqual([])
    expect(current.views.attentionKeys.completedUnread).toEqual([])
  })

  it('ignores duplicate and lower producer drafts without deleting newer tasks', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const second = task({ key: 'codex-b', actionAlias: 'ct_codex_b_1234567890', displayOrder: 1, cycleOrder: 1, attentionOrder: 1 })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task(), second], 5, { providers: { codex: true, claude: false }, sourceGenerations: { codex: 5, claude: 0 } })
    })

    const lower = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ revisionAt: 999 })], 4, { providers: { codex: true, claude: false }, sourceGenerations: { codex: 4, claude: 0 } })
    })
    const duplicate = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ revisionAt: 1_000 })], 5, { providers: { codex: true, claude: false }, sourceGenerations: { codex: 6, claude: 0 } })
    })

    expect(lower).toBe(current)
    expect(duplicate).toBe(current)
    expect(current.tasks.map((value: any) => value.key)).toEqual(['codex-a', 'codex-b'])
  })

  it('preserves only the provider slice whose source generation regressed', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: true } })
    const claude = task({
      key: 'claude-a',
      provider: 'claude',
      kind: 'claude-session',
      actionAlias: 'local-claude-a',
      displayOrder: 1,
      cycleOrder: 1,
      attentionOrder: 1
    })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task(), claude], 1, { sourceGenerations: { codex: 10, claude: 10 } })
    })

    const next = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task({ key: 'codex-stale', actionAlias: 'ct_codex_stale_123456', revisionAt: 999 }),
        { ...claude, phase: 'waiting-input', cycleTier: 'attention', dynamicGroup: 'input', revisionAt: 200, statusEnteredAt: 200 }
      ], 2, { sourceGenerations: { codex: 9, claude: 11 } })
    })

    expect(next.tasks.find((value: any) => value.provider === 'codex')).toMatchObject({ key: 'codex-a', revisionAt: 100 })
    expect(next.tasks.find((value: any) => value.provider === 'claude')).toMatchObject({ key: 'claude-a', phase: 'waiting-input', revisionAt: 100 })
    expect(next.sourceGenerations).toEqual({ codex: 10, claude: 11, cursor: 0 })
  })

  it('holds one unknown observation for only the bounded 250 ms grace', () => {
    let now = 1_000
    const kernel = createCompanionTaskKernel({
      now: () => now,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { acceptedAt: now, providers: { codex: true, claude: false } }) })
    const firstUnknown = kernel.syncPackage({ lease: receipt.lease, draft: draft([task({ phase: 'unknown', cycleTier: 'none', dynamicGroup: 'none' })], 2, { acceptedAt: now, providers: { codex: true, claude: false } }) })
    expect(firstUnknown).toMatchObject({ freshness: 'verifying' })
    expect(firstUnknown.tasks[0].phase).toBe('running')

    now += UNKNOWN_GRACE_MS
    const secondUnknown = kernel.syncPackage({ lease: receipt.lease, draft: draft([task({ phase: 'unknown', cycleTier: 'none', dynamicGroup: 'none' })], 3, { acceptedAt: now, providers: { codex: true, claude: false } }) })
    expect(secondUnknown.tasks[0].phase).toBe('running')
    expect(secondUnknown.views.groups.active).toEqual(['codex-a'])
    expect(secondUnknown.views.counts.active).toBe(1)
    expect(secondUnknown.views.cycleKeys).toEqual(['codex-a'])

    const claudeKernel = createCompanionTaskKernel({
      now: () => now,
      initialConfiguration: { enabled: true, providers: { codex: false, claude: true } }
    })
    const claudeReceipt = claudeKernel.attach({ enabled: true, providers: { codex: false, claude: true } })
    const claudeUnknown = claudeKernel.syncPackage({
      lease: claudeReceipt.lease,
      draft: draft([task({
        key: 'claude-a',
        provider: 'claude',
        kind: 'claude-session',
        actionAlias: 'cs_claude_a_123456',
        phase: 'unknown',
        cycleTier: 'none',
        dynamicGroup: 'none',
        capabilities: { open: true, archive: false }
      })], 1, { acceptedAt: now, providers: { codex: false, claude: true } })
    })
    expect(claudeUnknown.views.groups.stopped).toEqual([])
    expect(claudeUnknown.views.counts.active).toBe(0)
    expect(claudeUnknown.views.cycleKeys).toEqual([])
  })

  it('cycles from a complete package while a phase is still verifying, without a blocking preflight', async () => {
    const opened = vi.fn(async () => nativeOpened())
    const preflight = vi.fn(async () => { throw new Error('provider unavailable') })
    const records: Array<Record<string, any>> = []
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      preflight,
      record: (entry: Record<string, any>) => records.push(entry),
      adapters: { codex: { open: opened } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    // The attach-time cold preflight for the still-empty package fails on its own.
    await vi.waitFor(() => expect(preflight).toHaveBeenCalledTimes(1))
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false } }) })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'unknown', cycleTier: 'none', dynamicGroup: 'none' })], 2, { providers: { codex: true, claude: false } })
    })

    expect(kernel.getPackage()).toMatchObject({ complete: true, freshness: 'verifying', tasks: [{ phase: 'running' }] })
    // A verifying phase is not a membership gap: previous/next and the attention
    // entries read the complete process package directly instead of paying the
    // full cold read under the 5-second timeout.
    await expect(kernel.dispatch({ action: 'cycle', direction: 1, source: 'global-shortcut' })).resolves.toMatchObject({
      outcome: 'opened',
      key: 'codex-a'
    })
    await expect(kernel.dispatch({ action: 'open-attention', kind: 'input', source: 'global-shortcut' })).resolves.toMatchObject({
      outcome: 'unavailable',
      errorCode: 'no-task'
    })
    expect(preflight).toHaveBeenCalledTimes(1)
    expect(opened).toHaveBeenCalledTimes(1)
    expect(kernel.getPackage()).toMatchObject({ complete: true, freshness: 'verifying', tasks: [{ phase: 'running' }] })
    expect(records).not.toContainEqual(expect.objectContaining({ event: 'ready-preflight', outcome: 'failed' }))
    expect(records).toContainEqual(expect.objectContaining({
      scope: 'task-kernel',
      event: 'open-attention',
      outcome: 'no-task',
      details: expect.objectContaining({ kind: 'input', complete: true, freshness: 'verifying', inputCount: 0 })
    }))
  })

  it('refuses an incomplete navigation snapshot without waiting for or binding to a preflight', async () => {
    const opened = vi.fn(async () => nativeOpened())
    const preflight = vi.fn(async () => { throw new Error('provider unavailable') })
    const records: Array<Record<string, any>> = []
    const notifications: string[] = []
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      preflight,
      record: (entry: Record<string, any>) => records.push(entry),
      notify: (message: string) => notifications.push(message),
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } },
      adapters: { codex: { open: opened } }
    })
    kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    expect(kernel.getPackage().complete).toBe(false)

    await expect(kernel.dispatch({ action: 'cycle', direction: 1, source: 'global-shortcut', operationId: 'cycle_incomplete_1' })).resolves.toMatchObject({
      outcome: 'unavailable',
      errorCode: 'inventory-not-ready'
    })
    expect(preflight).toHaveBeenCalledTimes(1)
    expect(opened).not.toHaveBeenCalled()
    expect(records).toContainEqual(expect.objectContaining({
      level: 'info',
      scope: 'task-kernel',
      event: 'ready-preflight',
      outcome: 'started',
      details: expect.objectContaining({ reason: 'incomplete', exactTarget: false })
    }))
    await Promise.resolve()
    expect(records).not.toContainEqual(expect.objectContaining({ operationId: 'cycle_incomplete_1' }))
    expect(kernel.getLatest().providerHealth.codex.status).toBe('unavailable')
    expect(notifications).toEqual([])
  })

  it('keeps the exact-target freshness gate for mutations while a verifying phase is retained', async () => {
    // The attach-time cold read settles an older generation; later host
    // evidence advances the lane and then retains an unknown (verifying) phase.
    const preflight = vi.fn(async () => draft([task({ phase: 'completed', cycleTier: 'none', dynamicGroup: 'completed', capabilities: { open: true, archive: true, pause: false, resume: false, executePlan: false } })], 1, { producer: 'host-preflight', providers: { codex: true, claude: false } }))
    const archive = vi.fn(async () => ({ outcome: 'archived' }))
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      preflight,
      adapters: { codex: { open: async () => nativeOpened(), archive } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    await vi.waitFor(() => expect(preflight).toHaveBeenCalledTimes(1))
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task({ revisionAt: 110, phaseRevision: 110, statusEnteredAt: 110 })], 10, { providers: { codex: true, claude: false } }) })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'unknown', cycleTier: 'none', dynamicGroup: 'none', revisionAt: 111, phaseRevision: 111, statusEnteredAt: 111 })], 11, { providers: { codex: true, claude: false } })
    })
    expect(kernel.getPackage()).toMatchObject({ complete: true, freshness: 'verifying', tasks: [{ phase: 'running' }] })
    const preflightCallsBeforeArchive = preflight.mock.calls.length

    const result = await kernel.dispatch({ action: 'archive', key: 'codex-a', revisionAt: 100, phase: 'running', source: 'archive-button' })
    // The verifying exact target forced the shared preflight before any mutation.
    expect(preflight).toHaveBeenCalledTimes(preflightCallsBeforeArchive + 1)
    expect(result.outcome).not.toBe('archived')
    expect(archive).not.toHaveBeenCalled()
  })

  it('records the feature code and the no-task exit for a silent attention shortcut', async () => {
    const opened = vi.fn(async () => nativeOpened())
    const records: Array<Record<string, any>> = []
    const notifications: string[] = []
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      preflight: async () => draft([task()], 1, { producer: 'host-preflight', providers: { codex: true, claude: false } }),
      record: (entry: Record<string, any>) => records.push(entry),
      notify: (message: string) => notifications.push(message),
      adapters: { codex: { open: opened } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false } }) })
    expect(kernel.getPackage()).toMatchObject({ complete: true, freshness: 'fresh' })

    expect(kernel.handleEnter({ code: 'eypc-codex-input' })).toBe(true)
    await vi.waitFor(() => expect(notifications).toContain('当前没有符合条件的任务'))
    expect(opened).not.toHaveBeenCalled()
    expect(records).toContainEqual(expect.objectContaining({
      level: 'info',
      scope: 'task-kernel',
      event: 'shortcut-enter',
      outcome: 'open-attention',
      source: 'global-shortcut',
      details: expect.objectContaining({ featureCode: 'eypc-codex-input', complete: true, cycleCount: 1, inputCount: 0 })
    }))
    expect(records).toContainEqual(expect.objectContaining({
      scope: 'task-kernel',
      event: 'open-attention',
      outcome: 'no-task',
      details: expect.objectContaining({ kind: 'input' })
    }))
    expect(records).toContainEqual(expect.objectContaining({
      level: 'info',
      scope: 'task-kernel',
      event: 'shortcut-enter',
      outcome: 'failed',
      code: 'no-task',
      details: expect.objectContaining({ featureCode: 'eypc-codex-input', action: 'open-attention' })
    }))

    expect(kernel.handleEnter({ code: 'eypc-codex-task-next' })).toBe(true)
    await vi.waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
    expect(records).toContainEqual(expect.objectContaining({
      event: 'shortcut-enter',
      outcome: 'cycle',
      details: expect.objectContaining({ featureCode: 'eypc-codex-task-next' })
    }))
  })

  it('delegates exact-key target recovery to Host without a public alias or target substitution', async () => {
    const opened: Array<Record<string, unknown>> = []
    const coldKey = 'b'.repeat(32)
    const preflight = vi.fn(async () => draft([task()], 2, { producer: 'host-preflight', providers: { codex: true, claude: false } }))
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      preflight,
      adapters: { codex: { open: async (target: Record<string, unknown>) => { opened.push(target); return nativeOpened() } } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false } }) })
    await vi.waitFor(() => expect(preflight).toHaveBeenCalledTimes(1))
    preflight.mockClear()
    const preflightCallsBeforeOpen = preflight.mock.calls.length

    await expect(kernel.dispatch({
      action: 'open',
      key: coldKey,
      source: 'card-click'
    })).resolves.toMatchObject({ outcome: 'opened', key: coldKey })
    expect(preflight).toHaveBeenCalledTimes(preflightCallsBeforeOpen)
    expect(opened).toEqual([expect.objectContaining({
      key: coldKey,
      actionAlias: ''
    })])

    await expect(kernel.dispatch({
      action: 'open',
      key: coldKey,
      source: 'manual-row-open'
    })).resolves.toMatchObject({ outcome: 'opened', key: coldKey })
    expect(preflight).toHaveBeenCalledTimes(preflightCallsBeforeOpen)
    expect(opened).toHaveLength(2)
    expect(opened.every((target) => target.key === coldKey && target.actionAlias === '')).toBe(true)
  })

  it('consumes a silent shortcut before any Renderer attaches and never replays it after cold cache recovery', async () => {
    const opened = vi.fn(async () => nativeOpened())
    const preflight = vi.fn(async () => draft([task()], 1, { providers: { codex: true, claude: false } }))
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      preflight,
      adapters: { codex: { open: opened } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })

    expect(kernel.handleEnter({ code: 'eypc-codex-task-next' })).toBe(true)
    expect(preflight).not.toHaveBeenCalled()
    expect(opened).not.toHaveBeenCalled()

    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    expect(receipt.retained).toBe(false)
    await vi.waitFor(() => expect(preflight).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(kernel.getLatest().complete).toBe(true))
    expect(opened).not.toHaveBeenCalled()
    expect(kernel.handleEnter({ code: 'eypc-codex-task-next' })).toBe(true)
    await vi.waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
  })

  it('publishes coherent revisions once across 100 rapid provider transitions', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: true } })
    const published: Array<{ revision: number; phase: string; group: string }> = []
    kernel.onPackage((value: any) => {
      if (!value.complete) return
      const row = value.tasks[0]
      published.push({
        revision: value.packageRevision,
        phase: row.phase,
        group: Object.entries(value.views.groups).find(([, keys]) => (keys as string[]).includes(row.key))?.[0] || 'none'
      })
    })

    for (let index = 1; index <= 100; index += 1) {
      const waiting = index % 2 === 0
      kernel.syncPackage({
        lease: receipt.lease,
        draft: draft([task({
          phase: waiting ? 'waiting-input' : 'running',
          cycleTier: waiting ? 'attention' : 'active',
          dynamicGroup: waiting ? 'input' : 'active',
          revisionAt: 100 + index,
          phaseRevision: 100 + index,
          statusEnteredAt: 100 + index,
          causalKey: `turn:${index}`,
          causalReliable: true
        })], index)
      })
    }

    expect(published).toHaveLength(100)
    expect(new Set(published.map((value) => value.revision)).size).toBe(100)
    expect(published.every((value) => value.phase === 'waiting-input' ? value.group === 'input' : value.group === 'active')).toBe(true)
  })

  it('turns 1,000 equivalent observations into complete semantic no-ops', () => {
    const records: Array<Record<string, unknown>> = []
    const opened = vi.fn(async () => nativeOpened())
    const kernel = createCompanionTaskKernel({
      record: (entry: Record<string, unknown>) => records.push(entry),
      adapters: { codex: { open: opened } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const publications: number[] = []
    const floatPublications: number[] = []
    kernel.onPackage((value: any) => {
      if (value.complete) publications.push(value.packageRevision)
    })
    kernel.subscribe(0, (value: any) => {
      if (value.complete) floatPublications.push(value.packageRevision)
    })
    const initial = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ observationGeneration: 1 })], 1, { providers: { codex: true, claude: false } })
    })
    const initialTaskRevision = initial.tasks[0].semanticRevision
    const initialPackageRevision = initial.packageRevision
    const consumerDiagnostics = kernel.diagnostics()

    for (let index = 2; index <= 1_001; index += 1) {
      const current = kernel.publishEvidence(draft([task({ observationGeneration: index })], index, {
        producer: 'host-evidence',
        providers: { codex: true, claude: false },
        sourceGenerations: { codex: index, claude: 0 },
        sourceLaneGenerations: {
          codex: { membership: index, activity: index, interaction: index, unread: index, planArtifact: index, metadata: index, topology: index },
          claude: { membership: 0, activity: 0, interaction: 0, unread: 0, planArtifact: 0, metadata: 0, topology: 0 },
          cursor: { membership: 0, activity: 0, interaction: 0, unread: 0, planArtifact: 0, metadata: 0, topology: 0 }
        }
      }))
      expect(current.packageRevision).toBe(initialPackageRevision)
      expect(current.tasks[0].semanticRevision).toBe(initialTaskRevision)
    }

    expect(publications).toEqual([initialPackageRevision])
    expect(floatPublications).toEqual([initialPackageRevision])
    expect(opened).not.toHaveBeenCalled()
    expect(records.filter((entry) => entry.event === 'same-state-no-op')).toHaveLength(1_000)
    expect(records.filter((entry) => entry.level === 'info' && entry.outcome === 'no-op')).toEqual([])
    expect(kernel.diagnostics().navigation).toMatchObject({ dispatched: { codex: 0, claude: 0 } })
    expect(kernel.diagnostics().navigation.syncNoopCount).toBe(consumerDiagnostics.navigation.syncNoopCount)
    expect(kernel.diagnostics().actions.syncNoopCount).toBe(consumerDiagnostics.actions.syncNoopCount)
    kernel.close()
  })

  it('keeps repeated UI focus changes process-private without publishing task packages', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([
        task(),
        task({
          key: 'codex-b',
          actionAlias: 'ct_codex_b_1234567890',
          revisionAt: 101,
          membershipRevision: 101,
          phaseRevision: 101,
          unreadRevision: 101,
          visibilityRevision: 101
        })
      ], 1, { providers: { codex: true, claude: false } })
    })
    const baselineRevision = kernel.getLatest().packageRevision
    const publications: number[] = []
    const stop = kernel.subscribe(baselineRevision, (value: Record<string, any>) => publications.push(value.packageRevision))

    for (let index = 0; index < 100; index += 1) {
      const focusedKey = index % 2 === 0 ? 'codex-a' : 'codex-b'
      const current = kernel.configure({
        lease: receipt.lease,
        enabled: true,
        providers: { codex: true, claude: false },
        focusedKey
      })
      expect(current.focusedKey).toBe(focusedKey)
      expect(current.packageRevision).toBe(baselineRevision)
    }

    expect(publications).toEqual([])
    expect(kernel.getLatest()).toMatchObject({ packageRevision: baselineRevision, focusedKey: 'codex-b' })
    stop()
    kernel.close()
  })

  it('keeps hot dispatch and atomic Main/Float publication inside the accepted latency budgets', async () => {
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      adapters: { codex: { open: async () => nativeOpened() } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const mainApplied: number[] = []
    const floatApplied: number[] = []
    kernel.onPackage((value: any) => { if (value.complete) mainApplied.push(value.packageRevision) })
    kernel.onPackage((value: any) => { if (value.complete) floatApplied.push(value.packageRevision) })
    const publishStarted = performance.now()
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task()], 1, { providers: { codex: true, claude: false } }) })
    const publishElapsed = performance.now() - publishStarted
    expect(mainApplied.at(-1)).toBe(floatApplied.at(-1))
    expect(publishElapsed).toBeLessThan(50)

    const samples: number[] = []
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now()
      await kernel.dispatch({ action: 'open', key: 'codex-a', source: 'manual' })
      samples.push(performance.now() - started)
    }
    samples.sort((left, right) => left - right)
    expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThan(200)
  })

  it('builds an available-provider cold cache within 1.5 seconds, then opens without another refresh', async () => {
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      preflight: async () => draft([task()], 1, { providers: { codex: true, claude: false } }),
      adapters: { codex: { open: async () => nativeOpened() } },
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const started = performance.now()
    kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    await vi.waitFor(() => expect(kernel.getLatest().complete).toBe(true))
    await expect(kernel.dispatch({ action: 'cycle', direction: 1 })).resolves.toMatchObject({ outcome: 'opened' })
    expect(performance.now() - started).toBeLessThan(1_500)
  })
})

describe('phase sets and lane units stay single-owner', () => {
  const kernelSource = readFileSync(resolve(process.cwd(), 'preload/companion/task-kernel.cjs'), 'utf8')
  const hostSource = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')

  // A phase set is a product rule — "waiting-approval and waiting-input are one
  // group" is stated in the PRD — so it needs one executable definition. Writing
  // it inline means changing the rule is a search, and a missed site disagrees
  // with its siblings silently.
  it('states each phase set once as a named predicate', () => {
    // The definitions moved to preload/task-phase.cjs when the claude group and
    // the entry needed them too; the Kernel now consumes the same owner rather
    // than being it.
    const phaseSource = readFileSync(resolve(process.cwd(), 'preload/task-phase.cjs'), 'utf8')
    const predicates = ['isLiveTaskPhase', 'isTerminalTaskPhase', 'isAttentionTaskPhase', 'isRetainableTaskPhase']
    for (const predicate of predicates) expect(phaseSource).toContain(`function ${predicate}(phase)`)
    for (const predicate of ['isLiveTaskPhase', 'isTerminalTaskPhase', 'isAttentionTaskPhase']) {
      expect(kernelSource).toContain(predicate)
    }
    expect(kernelSource).not.toContain('isRetainableTaskPhase')
    // Assert against the Kernel body: it may call the predicates but never
    // respell their sets.
    const callSites = kernelSource
    expect(callSites).not.toMatch(/\['running', 'waiting-input'[^\]]*\]\.includes\(/)
    expect(callSites).not.toMatch(/\.phase === 'waiting-input'/)
    expect(callSites).not.toMatch(/=== 'completed' \|\| \w+(\.\w+)* === 'stopped'/)
  })

  // The 2026-08-13 host defect: a counter lane seeded from a wall-clock value
  // can never be overtaken again, so the lane rejects every later generation as
  // stale. `membership` is a timestamp and may use one; the counter lanes may
  // not, and the counter aggregate may not absorb one.
  // The Claude App version gate fails closed on an unlisted version. Two copies
  // agreeing today is discipline, not structure: adding a version to one side
  // alone leaves the archive adapter refusing what the state reader accepts.
  // Same product rule as the Kernel predicates, other side of the bridge. The
  // renderer carries `activityState` where the Kernel carries `phase`, but both
  // spell the waiting values identically, so one predicate owns both.
  it('keeps no inline attention or live phase set in the renderer', () => {
    const files = [
      'src/domain/companionAggregate.ts',
      'src/domain/companionTaskPackage.ts',
      'src/domain/codex.ts',
      'src/domain/claudeCode.ts',
      'src/runtime/codexController.ts'
    ]
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source, file).not.toMatch(/=== 'waiting-input' \|\| [\w.]+ === 'waiting-approval'/)
      expect(source, file).not.toMatch(/\['running', 'waiting-input', 'waiting-approval'\]/)
    }
    const provider = readFileSync(resolve(process.cwd(), 'src/domain/companionProvider.ts'), 'utf8')
    expect(provider).toContain('export function isCompanionAttentionState(')
    expect(provider).toContain('export function isCompanionLivePhase(')
  })

  // The preload side of the same rule. `preload/task-phase.cjs` owns the phase
  // vocabulary and its groupings; every other preload file asks it. A guard is
  // what keeps that true — the previous convergence was undone once already by
  // new inline literals arriving in files nobody thought to re-check.
  it('states the task phase vocabulary and its groupings exactly once in preload', () => {
    const owner = readFileSync(resolve(process.cwd(), 'preload/task-phase.cjs'), 'utf8')
    expect(owner).toContain('const TASK_PHASES = Object.freeze(')
    for (const predicate of ['isKnownTaskPhase', 'isLiveTaskPhase', 'isTerminalTaskPhase', 'isAttentionTaskPhase', 'isRetainableTaskPhase', 'isSettledTaskPhase']) {
      expect(owner, predicate).toContain(`function ${predicate}(phase) {`)
    }
    const consumers = [
      'preload/index.js',
      'preload/companion/task-kernel.cjs',
      'preload/companion/branch-causality.cjs',
      'preload/claude/code-sessions.cjs',
      'preload/claude/app-state.cjs',
      'preload/claude/events.cjs',
      'preload/claude/archive.cjs'
    ]
    for (const file of consumers) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      // The vocabulary, "live" and "settled" as inline literals.
      expect(source, file).not.toMatch(/'running', 'waiting-input', 'waiting-approval', 'completed', 'stopped', 'unknown'/)
      expect(source, file).not.toMatch(/\['running', 'waiting-(input|approval)', 'waiting-(input|approval)'\]/)
      expect(source, file).not.toMatch(/\['waiting-input', 'stopped', 'completed'\]/)
      expect(source, file).not.toMatch(/function is(Known|Live|Terminal|Attention|Retainable|Settled)TaskPhase\(/)
    }
  })

  // Two runtimes, one product rule. The bridge cannot share a module across
  // CJS preload and TS renderer, so the guard is that both spell the same
  // membership — a phase added to one side alone would silently fall into the
  // other side's else-branch.
  it('keeps the renderer and preload live-phase predicates in step', () => {
    const owner = readFileSync(resolve(process.cwd(), 'preload/task-phase.cjs'), 'utf8')
    const provider = readFileSync(resolve(process.cwd(), 'src/domain/companionProvider.ts'), 'utf8')
    const members = (source: string, name: string) => {
      const at = source.indexOf(name)
      expect(at, name).toBeGreaterThan(-1)
      const body = source.slice(at, source.indexOf('}', at))
      return [...body.matchAll(/'(running|waiting-input|waiting-approval|completed|stopped|unknown)'/g)].map((m) => m[1]).sort()
    }
    expect(members(owner, 'function isAttentionTaskPhase(')).toEqual(members(provider, 'export function isCompanionAttentionState('))
    // The renderer composes live from attention; the preload owner spells it
    // out. Comparing the difference keeps the composition honest either way.
    expect(members(owner, 'function isLiveTaskPhase(')).toEqual(['running', 'waiting-approval', 'waiting-input'])
    expect(members(provider, 'export function isCompanionLivePhase(')).toEqual(['running'])
    expect(provider).toContain("return value === 'running' || isCompanionAttentionState(value)")
  })

  // "Did the Action start?" is asked on both sides of the bridge — the renderer
  // to report the outcome, the host to decide whether a post-exit restart
  // failed. Same CJS/TS split, same remedy.
  it('keeps the renderer and preload Action start predicates in step', () => {
    const domain = readFileSync(resolve(process.cwd(), 'src/domain/codexEnvironment.ts'), 'utf8')
    const controller = readFileSync(resolve(process.cwd(), 'src/runtime/codexController.ts'), 'utf8')
    const outcomes = (source: string, name: string) => {
      const at = source.indexOf(name)
      expect(at, name).toBeGreaterThan(-1)
      const body = source.slice(at, source.indexOf('}', at))
      return [...body.matchAll(/'(ok|started|running|stopping|confirm-required|rejected|failed)'/g)].map((m) => m[1]).sort()
    }
    // codexActionStartAccepted moved into preload/codex/environment-bridge.cjs
    // under RAW-169, alongside the run-lifecycle logic that calls it.
    const environmentBridge = readFileSync(resolve(process.cwd(), 'preload/codex/environment-bridge.cjs'), 'utf8')
    expect(outcomes(domain, 'export function isCodexActionStartAccepted(')).toEqual(outcomes(environmentBridge, 'function codexActionStartAccepted('))
    for (const [file, source] of [['preload/index.js', hostSource], ['preload/codex/environment-bridge.cjs', environmentBridge], ['src/runtime/codexController.ts', controller]] as const) {
      expect(source, file).not.toMatch(/\['ok', 'started', 'running', 'stopping'\]/)
    }
  })

  it('states the supported Claude App versions exactly once', () => {
    const appState = readFileSync(resolve(process.cwd(), 'preload/claude/app-state.cjs'), 'utf8')
    const archive = readFileSync(resolve(process.cwd(), 'preload/claude/archive.cjs'), 'utf8')
    expect(appState).toMatch(/const SUPPORTED_APP_VERSIONS = new Set\(/)
    expect(archive).not.toMatch(/const SUPPORTED_APP_VERSIONS = new Set\(/)
    expect(archive).toContain("require('./app-state.cjs')")
  })

  it('never seeds a counter lane from wall-clock time', () => {
    expect(hostSource).not.toMatch(/sourceLaneGenerations\.\w+\.(phase|unread)\s*=[^\n]*(Date\.now\(\)|readAt)/)
    expect(hostSource).toContain('function companionCounterAggregate(lanes)')
    expect(kernelSource).toContain("lane === 'activity' ? value?.[provider]?.phase")
  })
})

describe('provider differences are declared, not branched', () => {
  const kernelSource = readFileSync(resolve(process.cwd(), 'preload/companion/task-kernel.cjs'), 'utf8')

  // Real capability differences survive the causal-core extraction — Codex owns
  // Plan lifecycle and fork topology, Claude revalidates its archive target at
  // dispatch. They belong in one declared table so that adding a Provider is a
  // row rather than a search for every conditional.
  it('keeps no inline provider conditional in the reducer', () => {
    expect(kernelSource).not.toMatch(/provider === '(codex|claude)'/)
    expect(kernelSource).not.toMatch(/inferred === '(codex|claude)'/)
  })

  it('declares a trait row for every registered provider', () => {
    expect(kernelSource).toContain('const PROVIDER_TRAITS = Object.freeze({')
    for (const provider of ['codex', 'claude', 'cursor']) {
      expect(kernelSource).toContain(`  ${provider}: Object.freeze({`)
    }
  })

  it('keeps topology relations Provider-neutral instead of branching in traits', () => {
    expect(kernelSource).not.toContain('branchTopology')
    expect(kernelSource).toContain('relationStore')
  })
})

describe('claude evidence line uses the shared causal core', () => {
  // Claude has no fork topology, so it never entered the Codex branch store and
  // therefore never got bidirectional phase admission. The two directions that
  // were hand-written at the task layer covered terminal→running and
  // waiting→terminal only; an older terminal replacing a newer one was free.
  const claudeTask = (overrides: Record<string, unknown> = {}) => task({
    key: 'claude:local_a',
    provider: 'claude',
    kind: 'claude-session',
    actionAlias: 'local_a',
    ...overrides
  })
  const claudeLanes = (generation: number) => ({
    sourceGenerations: { codex: 0, claude: generation },
    sourceLaneGenerations: {
      codex: { membership: 0, activity: 0, unread: 0 },
      claude: { membership: 0, activity: generation, unread: generation }
    }
  })

  it('refuses an older terminal over a newer terminal at the same revision', () => {
    const kernel = createCompanionTaskKernel()
    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'completed', phaseRevision: 5, statusEnteredAt: 2_000, revisionAt: 2_000 })],
      1,
      claudeLanes(5)
    ))
    expect(kernel.getPackage().tasks[0].phase).toBe('completed')

    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'stopped', phaseRevision: 5, statusEnteredAt: 1_000, revisionAt: 2_000 })],
      2,
      claudeLanes(5)
    ))
    expect(kernel.getPackage().tasks[0].phase).toBe('completed')
  })

  it('still admits a strictly newer terminal at the same revision', () => {
    const kernel = createCompanionTaskKernel()
    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'completed', phaseRevision: 5, statusEnteredAt: 1_000, revisionAt: 2_000 })],
      1,
      claudeLanes(5)
    ))
    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'stopped', phaseRevision: 5, statusEnteredAt: 2_000, revisionAt: 2_000 })],
      2,
      claudeLanes(5)
    ))
    expect(kernel.getPackage().tasks[0].phase).toBe('stopped')
  })

  it('keeps refusing a late running observation over a newer terminal', () => {
    const kernel = createCompanionTaskKernel()
    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'completed', phaseRevision: 5, statusEnteredAt: 2_000, revisionAt: 2_000 })],
      1,
      claudeLanes(5)
    ))
    kernel.publishEvidence(draft(
      [claudeTask({ phase: 'running', phaseRevision: 5, statusEnteredAt: 1_000, revisionAt: 2_000 })],
      2,
      claudeLanes(5)
    ))
    expect(kernel.getPackage().tasks[0].phase).toBe('completed')
  })
})

describe('source lane units', () => {
  // Real 2026-08-13 host regression. `membership` is an observation timestamp
  // while `phase`/`unread` are provider counters. Letting either seed the other
  // — directly, or through the aggregate — pins a lane to ~1.78e12, which no
  // counter can ever overtake, so every later generation is rejected as stale.
  it('never seeds the membership timestamp from the counter aggregate', () => {
    const kernel = createCompanionTaskKernel()
    kernel.publishEvidence(draft([task()], 1, {
      sourceGenerations: { codex: 7, claude: 0 },
      sourceLaneGenerations: {
        codex: { membership: 0, activity: 7, unread: 7 },
        claude: { membership: 0, activity: 0, unread: 0 }
      }
    }))
    expect(kernel.getPackage().sourceLaneGenerations.codex.membership).toBe(0)
    expect(kernel.getPackage().sourceLaneGenerations.codex.activity).toBe(7)
  })

  it('treats an unstated membership lane as unchanged rather than older', () => {
    const kernel = createCompanionTaskKernel()
    kernel.publishEvidence(draft([task()], 1, {
      sourceGenerations: { codex: 1, claude: 0 },
      sourceLaneGenerations: {
        codex: { membership: 1_786_600_000_000, activity: 1, unread: 1 },
        claude: { membership: 0, activity: 0, unread: 0 }
      }
    }))
    expect(kernel.getPackage().tasks).toHaveLength(1)

    // A phase-only push carries no inventory observation at all.
    kernel.publishEvidence(draft([task({ phase: 'completed' })], 2, {
      sourceGenerations: { codex: 2, claude: 0 },
      sourceLaneGenerations: {
        codex: { membership: 0, activity: 2, unread: 2 },
        claude: { membership: 0, activity: 0, unread: 0 }
      }
    }))
    const next = kernel.getPackage()
    expect(next.tasks).toHaveLength(1)
    expect(next.tasks[0].phase).toBe('completed')
    expect(next.sourceLaneGenerations.codex.membership).toBe(1_786_600_000_000)
  })
})

  it('atomically suppresses an intermediate Turn completion while the Goal remains active', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'running', unreadKnown: true, unread: true, turnStartedAt: 100 })], 1, {
        providers: { codex: true, claude: false }
      })
    })
    const publications: Array<{ phase: string; unread: boolean; active: number; completedUnread: number }> = []
    const stop = kernel.onPackage((value: Record<string, any>) => {
      if (!value.tasks[0]) return
      publications.push({
        phase: value.tasks[0].phase,
        unread: value.tasks[0].unread === true,
        active: value.views.counts.active,
        completedUnread: value.views.counts.unread
      })
    })

    const branch = (goalStatus: 'active' | 'complete', hasUnreadTurn: boolean) => ({
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      unreadKnown: true,
      hasUnreadTurn,
      status: 'idle',
      statusAuthority: 'connector',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 1,
      terminalEvidenceSequence: 2,
      turnStartedAt: 100,
      terminalAt: 120,
      idleConfirmed: true,
      goalStatus,
      goalFreshness: 'fresh',
      goalEvidenceSequence: goalStatus === 'active' ? 1 : 3,
      goalUpdatedAt: goalStatus === 'active' ? 90 : 130
    })
    const publish = (generation: number, goalStatus: 'active' | 'complete', hasUnreadTurn: boolean) => (
      publishCodexParentEvidenceV7(kernel, generation, [{
        key: 'codex-a',
        complete: true,
        branches: [branch(goalStatus, hasUnreadTurn)]
      }])
    )
    publish(2, 'active', true)

    expect(kernel.getLatest()).toMatchObject({
      tasks: [{ phase: 'running', unreadKnown: true, unread: true, freshness: 'fresh', terminalAt: 0 }],
      views: { counts: { active: 1, unread: 0 } }
    })
    expect(publications.map((entry) => entry.phase)).not.toContain('completed')
    expect(publications.at(-1)).toMatchObject({ phase: 'running', unread: true, active: 1, completedUnread: 0 })

    publish(3, 'complete', true)
    expect(kernel.getLatest()).toMatchObject({
      tasks: [{ phase: 'completed', unreadKnown: true, unread: true }],
      views: { counts: { active: 0, unread: 1 } }
    })
    const completedUnreadPublicationCount = publications.filter((entry) => entry.phase === 'completed' && entry.unread).length
    publish(4, 'complete', true)
    expect(publications.filter((entry) => entry.phase === 'completed' && entry.unread)).toHaveLength(completedUnreadPublicationCount)

    publish(5, 'complete', false)
    expect(kernel.getLatest()).toMatchObject({
      tasks: [{ phase: 'completed', unreadKnown: true, unread: false }],
      views: { counts: { active: 0, unread: 0 } }
    })
    publish(4, 'complete', true)
    expect(kernel.getLatest().tasks[0]).toMatchObject({ phase: 'completed', unread: false })
    stop()
  })

  it('stores V7 topology nodes and clears stale idle when a newer child is active', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'stopped', idleConfirmed: true })], 1, { providers: { codex: true, claude: false } })
    })

    publishCodexParentEvidenceV7(kernel, 2, [{
        key: 'codex-a',
        complete: true,
        branches: [
          {
            ref: 'branch-main-anonymous',
            status: 'active',
            statusAuthority: 'desktop-live',
            activeFlags: [],
            lastTurnStatus: 'inProgress',
            lastTurnEvidence: 'turn-started',
            activeEvidenceSequence: 12,
            terminalEvidenceSequence: 11,
            idleConfirmed: true
          },
          {
            ref: 'branch-side-anonymous',
            status: 'idle',
            statusAuthority: 'desktop-live',
            activeFlags: [],
            lastTurnStatus: 'interrupted',
            lastTurnEvidence: 'targeted-after-exit',
            activeEvidenceSequence: 10,
            terminalEvidenceSequence: 11,
            idleConfirmed: true
          }
        ]
      }])

    expect(kernel.getPackage()).toMatchObject({
      tasks: [{ key: 'codex-a', phase: 'running', freshness: 'fresh', idleConfirmed: false }],
      views: { counts: { active: 1 }, groups: { active: ['codex-a'], stopped: [] } }
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ topology: { mode: 'aggregate', memberCount: 2, liveCount: 1 } })
    expect(kernel.commitArchived({ provider: 'codex', key: 'codex-a', verified: true, membershipRevision: 3 }))
      .toMatchObject({ outcome: 'failed', errorCode: 'active-members' })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ topology: { memberCount: 2, liveCount: 1 } })
  })

  it('materializes all-bead Side Chat phase and unread decisions into mutually exclusive canonical views', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'completed', unreadKnown: true, unread: false, idleConfirmed: true })], 1, {
        providers: { codex: true, claude: false }
      })
    })
    const completedBranch = (branchKind: 'main' | 'side', hasUnreadTurn = false) => ({
      ref: `branch-${branchKind}-anonymous`,
      branchKind,
      unreadKnown: true,
      hasUnreadTurn,
      status: 'idle',
      statusAuthority: 'desktop-live',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'targeted-after-exit',
      terminalEvidenceSequence: 30,
      turnStartedAt: 200,
      terminalAt: 250,
      idleConfirmed: true
    })
    const publish = (generation: number, branches: Record<string, unknown>[]) => (
      publishCodexParentEvidenceV7(kernel, generation, [{ key: 'codex-a', complete: true, branches }])
    )

    publish(2, [
      completedBranch('main'),
      {
        ...completedBranch('side'),
        status: 'active',
        lastTurnStatus: 'inProgress',
        lastTurnEvidence: 'turn-started',
        activeEvidenceSequence: 21,
        terminalEvidenceSequence: 0,
        turnStartedAt: 200,
        idleConfirmed: false
      }
    ])
    expect(kernel.getPackage()).toMatchObject({
      tasks: [{ phase: 'running', unreadKnown: true, unread: false }],
      views: { counts: { active: 1, unread: 0 } }
    })

    publish(3, [completedBranch('main'), completedBranch('side', true)])
    expect(kernel.getPackage()).toMatchObject({
      tasks: [{ phase: 'completed', unreadKnown: true, unread: true }],
      views: { counts: { active: 0, unread: 1 } }
    })

    publish(4, [
      completedBranch('main', true),
      {
        ...completedBranch('side'),
        status: 'active',
        lastTurnStatus: 'inProgress',
        lastTurnEvidence: 'turn-started',
        activeEvidenceSequence: 22,
        terminalEvidenceSequence: 0,
        turnStartedAt: 300,
        idleConfirmed: false
      }
    ])
    expect(kernel.getPackage()).toMatchObject({
      tasks: [{ phase: 'running', unreadKnown: true, unread: true }],
      views: { counts: { active: 1, unread: 0 } }
    })
  })

  it('does not infer a public interaction from branch flags or let transport generation reorder activity', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'running' })], 1, { providers: { codex: true, claude: false } })
    })
    const publish = (generation: number, branch: Record<string, unknown>) => (
      publishCodexParentEvidenceV7(kernel, generation, [{ key: 'codex-a', complete: true, branches: [branch] }])
    )

    publish(2, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: ['waitingOnUserInput'],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 10,
      turnStartedAt: 200,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })

    publish(3, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'idle',
      statusAuthority: 'connector',
      activityEvidence: 'initial-snapshot',
      activeFlags: [],
      lastTurnStatus: 'interrupted',
      lastTurnEvidence: 'targeted-after-exit',
      activeEvidenceSequence: 10,
      terminalEvidenceSequence: 11,
      turnStartedAt: 100,
      terminalAt: 150,
      idleConfirmed: true
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })

    publish(4, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'idle',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 10,
      terminalEvidenceSequence: 12,
      turnStartedAt: 200,
      terminalAt: 250,
      idleConfirmed: true
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })
  })

  it('orders live evidence by Turn epoch in both directions instead of transport generation', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'running' })], 1, { providers: { codex: true, claude: false } })
    })
    const publish = (generation: number, branch: Record<string, unknown>) => (
      publishCodexParentEvidenceV7(kernel, generation, [{ key: 'codex-a', complete: true, branches: [branch] }])
    )

    publish(2, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: ['waitingOnUserInput'],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 20,
      turnStartedAt: 200,
      waitingSince: 220,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })

    publish(3, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 10,
      turnStartedAt: 100,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })

    publish(4, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 30,
      turnStartedAt: 300,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'running' })

    publish(5, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'idle',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 30,
      terminalEvidenceSequence: 40,
      turnStartedAt: 300,
      terminalAt: 350,
      idleConfirmed: true
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })

    publish(6, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 50,
      turnStartedAt: 200,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })

    publish(7, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 60,
      turnStartedAt: 400,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'running' })
  })

  it('uses real event sequence when a Provider omits comparable Turn timestamps', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'running' })], 1, { providers: { codex: true, claude: false } })
    })
    const publish = (generation: number, branch: Record<string, unknown>) => (
      publishCodexParentEvidenceV7(kernel, generation, [{ key: 'codex-a', complete: true, branches: [branch] }])
    )

    publish(2, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'desktop-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 10,
      turnStartedAt: 0,
      idleConfirmed: false
    })
    publish(3, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'idle',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 10,
      terminalEvidenceSequence: 20,
      turnStartedAt: 0,
      terminalAt: 200,
      idleConfirmed: true
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed' })

    publish(4, {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 30,
      turnStartedAt: 0,
      idleConfirmed: false
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'running' })
  })

  it('merges branch phase, unread and Goal as independent evidence lanes', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'running', unreadKnown: false, unread: false })], 1, {
        providers: { codex: true, claude: false }
      })
    })
    const publish = (generation: number, branch: Record<string, unknown>) => (
      publishCodexParentEvidenceV7(kernel, generation, [{ key: 'codex-a', complete: true, branches: [branch] }])
    )
    const live = {
      ref: 'branch-main-anonymous',
      branchKind: 'main',
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 10,
      turnStartedAt: 100,
      idleConfirmed: false
    }

    publish(2, {
      ...live,
      unreadKnown: true,
      hasUnreadTurn: true,
      goalStatus: 'active',
      goalFreshness: 'fresh',
      goalEvidenceSequence: 10,
      goalUpdatedAt: 90
    })
    // Complete Host branch rows carry `unreadKnown: false` when this source
    // has no unread authority. Unknown must abstain instead of erasing the
    // previously observed unread lane.
    publish(3, {
      ...live,
      activeEvidenceSequence: 20,
      unreadKnown: false,
      goalStatus: 'active',
      goalFreshness: 'fresh',
      goalEvidenceSequence: 10,
      goalUpdatedAt: 90
    })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'running',
        unreadKnown: false,
        unread: false,
        observationGeneration: 3
      })], 2, { providers: { codex: true, claude: false } })
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'running', unreadKnown: true, unread: true })

    const terminal = {
      ...live,
      status: 'idle',
      activeFlags: [],
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      activeEvidenceSequence: 20,
      terminalEvidenceSequence: 30,
      terminalAt: 150,
      idleConfirmed: true,
      goalStatus: 'active',
      goalFreshness: 'fresh',
      goalEvidenceSequence: 10,
      goalUpdatedAt: 90
    }
    publish(4, terminal)
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'running', unreadKnown: true, unread: true })

    publish(5, {
      ...terminal,
      goalStatus: 'complete',
      goalFreshness: 'fresh',
      goalEvidenceSequence: 40,
      goalUpdatedAt: 160
    })
    expect(kernel.getPackage().tasks[0]).toMatchObject({ phase: 'completed', unreadKnown: true, unread: true })
  })

  it('publishes aggregate semantics once and records an anonymous no-op for equivalent evidence', () => {
    const records: Array<Record<string, unknown>> = []
    const kernel = createCompanionTaskKernel({
      record: (entry: Record<string, unknown>) => records.push(entry),
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'completed', unreadKnown: true, unread: false })], 1, {
        providers: { codex: true, claude: false }
      })
    })
    const liveBranches = [{
      ref: 'private-main-ref',
      branchKind: 'main',
      unreadKnown: true,
      hasUnreadTurn: false,
      status: 'active',
      statusAuthority: 'app-server-live',
      activityEvidence: 'activity-event',
      activeFlags: [],
      lastTurnStatus: 'inProgress',
      lastTurnEvidence: 'turn-started',
      activeEvidenceSequence: 2,
      turnStartedAt: 200
    }]
    const publish = (generation: number, branches: Record<string, unknown>[]) => (
      publishCodexParentEvidenceV7(kernel, generation, [{ key: 'codex-a', complete: true, branches }])
    )

    publish(2, liveBranches)
    const runningRevision = kernel.getPackage().packageRevision
    publish(3, liveBranches)
    expect(kernel.getPackage()).toMatchObject({ packageRevision: runningRevision, tasks: [{ phase: 'running' }] })
    expect(records.filter((entry) => entry.event === 'same-state-no-op').at(-1)).toMatchObject({ outcome: 'ignored' })
    expect(JSON.stringify(records)).not.toContain('private-main-ref')

    publish(4, [{
      ...liveBranches[0],
      status: 'idle',
      statusAuthority: 'connector',
      activityEvidence: 'initial-snapshot',
      lastTurnStatus: 'completed',
      lastTurnEvidence: 'turn-completed',
      terminalEvidenceSequence: 4,
      terminalAt: 250,
      idleConfirmed: true
    }])
    expect(kernel.getPackage()).toMatchObject({ packageRevision: runningRevision + 1, tasks: [{ phase: 'completed' }] })
  })

  it('publishes one complete Provider evidence batch as one atomic Kernel revision', () => {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({ phase: 'stopped', idleConfirmed: true })], 1, { providers: { codex: true, claude: false } })
    })
    const baselineRevision = kernel.getPackage().packageRevision
    const publications: number[] = []
    const stop = kernel.onPackage((value: Record<string, any>) => publications.push(value.packageRevision))
    const baselinePublicationCount = publications.length

    publishCodexParentEvidenceV7(kernel, 2, [{
        key: 'codex-a',
        complete: true,
        branches: [{
          ref: 'branch-main-anonymous',
          status: 'active',
          statusAuthority: 'app-server-live',
          activityEvidence: 'activity-event',
          activeFlags: [],
          lastTurnStatus: 'inProgress',
          lastTurnEvidence: 'turn-started',
          activeEvidenceSequence: 2,
          terminalEvidenceSequence: 1,
          idleConfirmed: false
        }]
      }])

    expect(kernel.getPackage()).toMatchObject({
      packageRevision: baselineRevision + 1,
      tasks: [{ key: 'codex-a', phase: 'running', idleConfirmed: false }]
    })
    expect(publications.slice(baselinePublicationCount)).toEqual([baselineRevision + 1])
    stop()
  })

  it('rejects one invalid enabled Provider batch atomically without consuming the producer revision', () => {
    const records: Array<Record<string, any>> = []
    const kernel = createCompanionTaskKernel({
      record: (entry: Record<string, any>) => records.push(entry),
      initialConfiguration: { enabled: true, providers: { codex: true, claude: true } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: true } })
    const codexStopped = task({ phase: 'stopped', idleConfirmed: true })
    const claudeCompleted = task({
      key: 'claude-b',
      provider: 'claude',
      kind: 'claude-session',
      actionAlias: 'claude:session-b',
      phase: 'completed',
      idleConfirmed: true
    })
    kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([codexStopped, claudeCompleted], 1, { providers: { codex: true, claude: true } })
    })
    const baseline = kernel.getPackage()
    const baselineDiagnostics = kernel.diagnostics()
    const publications: number[] = []
    const stop = kernel.onPackage((value: Record<string, any>) => publications.push(value.packageRevision))
    const baselinePublicationCount = publications.length

    const attempt = draft([
      task({ phase: 'running', phaseRevision: 200, statusEnteredAt: 200, turnStartedAt: 200 }),
      task({
        key: 'claude-b',
        provider: 'claude',
        kind: 'claude-session',
        actionAlias: 'claude:session-b',
        phase: 'running',
        phaseRevision: 200,
        statusEnteredAt: 200,
        turnStartedAt: 200
      })
    ], 2, { providers: { codex: true, claude: true }, producer: 'host-evidence' }) as Record<string, any>
    attempt.evidenceBatches.codex.revision = 'invalid-provider-evidence-batch'

    expect(kernel.publishEvidence(attempt)).toBeNull()
    expect(kernel.getPackage()).toEqual(baseline)
    expect(publications).toHaveLength(baselinePublicationCount)
    expect(kernel.diagnostics()).toMatchObject({
      topologyRevision: baselineDiagnostics.topologyRevision,
      openInteractionCount: baselineDiagnostics.openInteractionCount,
      interactionTombstoneCount: baselineDiagnostics.interactionTombstoneCount
    })
    expect(records.filter((entry) => entry.event === 'provider-evidence-batch').at(-1)).toMatchObject({
      scope: 'task-kernel',
      event: 'provider-evidence-batch',
      outcome: 'rejected',
      code: 'invalid-batch',
      details: { producer: 'host-evidence' }
    })

    attempt.evidenceBatches.codex.revision = 'companion-provider-evidence-batch-v3'
    expect(kernel.publishEvidence(attempt)).not.toBeNull()
    expect(kernel.getPackage().packageRevision).toBe(baseline.packageRevision + 1)
    expect(kernel.getPackage().tasks.map((value: Record<string, any>) => [value.key, value.phase]).sort()).toEqual([
      ['claude-b', 'running'],
      ['codex-a', 'running']
    ])
    expect(publications.slice(baselinePublicationCount)).toEqual([baseline.packageRevision + 1])
    stop()
  })

describe('hand-set phase for an unknown task', () => {
  function harness() {
    const kernel = createCompanionTaskKernel({
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 1 }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false }, dynamicTaskWindowHours: 1 })
    const sync = (value: Record<string, unknown>, revision: number) => kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task(value)], revision, { providers: { codex: true, claude: false } })
    })
    return { kernel, sync }
  }

  it('stands in for unknown so the row and its group read one phase', () => {
    const { sync } = harness()
    const published = sync({
      phase: 'unknown',
      statusEnteredAt: 100,
      manualPhase: 'running',
      manualPhaseSetAt: 150
    }, 1)
    // The applied phase — not just the icon — is what grouping reads, so the
    // row cannot show one state while sitting in another's group.
    expect(published.tasks[0]).toMatchObject({ phase: 'running', manualPhase: 'running' })
  })

  it('never overrides a phase that real evidence already decided', () => {
    const { sync } = harness()
    expect(sync({
      phase: 'completed',
      statusEnteredAt: 100,
      manualPhase: 'running',
      manualPhaseSetAt: 150
    }, 1).tasks[0]).toMatchObject({ phase: 'completed' })
  })

  it('stops applying once a later unknown episode begins', () => {
    const { sync } = harness()
    expect(sync({
      phase: 'unknown',
      statusEnteredAt: 100,
      manualPhase: 'running',
      manualPhaseSetAt: 150
    }, 1).tasks[0]).toMatchObject({ phase: 'running' })
    // The task left `unknown` and came back: this stretch started after the
    // user chose, so the stale answer must not be resurrected. The phase lane
    // has to advance for the new episode to be accepted at all.
    expect(sync({
      phase: 'unknown',
      statusEnteredAt: 900,
      phaseRevision: 900,
      revisionAt: 900,
      manualPhase: 'running',
      manualPhaseSetAt: 150
    }, 2).tasks[0]).toMatchObject({ phase: 'unknown' })
  })

  it('rejects unknown as a hand-set target', () => {
    const { sync } = harness()
    expect(sync({
      phase: 'unknown',
      statusEnteredAt: 100,
      manualPhase: 'unknown',
      manualPhaseSetAt: 150
    }, 1).tasks[0]).toMatchObject({ phase: 'unknown', manualPhase: '' })
  })

  it('moves a hand-set pin between the two rings without ever leaving it in both', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 1_000_000_000,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const phases = ['running', 'waiting-input', 'waiting-approval', 'completed', 'stopped']
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft(phases.map((phase, index) => task({
        key: `codex-manual-${phase}`,
        phase: 'unknown',
        statusEnteredAt: 100,
        manualPhase: phase,
        manualPhaseSetAt: 150,
        localPin: true,
        kind: 'local-pin',
        dynamicEligible: false,
        lastQuestionAt: 100 - index
      })), 1, { providers: { codex: true, claude: false } })
    })

    const ring = new Set<string>(current.views.cycleKeys)
    const entry = new Set<string>(current.views.attentionKeys.completedUnread)
    // Hand-setting a phase is what hands the pin back to its own status group,
    // so it leaves the fast-access entry and rejoins the ordinary ring in the
    // same commit. Both derivations read the applied phase, so there is no
    // moment where the two disagree and the pin is served twice.
    for (const phase of phases) {
      const key = `codex-manual-${phase}`
      expect([...ring, ...entry].filter((value) => value === key)).toHaveLength(1)
    }
    // `completed` is the one hand-set phase with no status group of its own, so
    // it stays with the pins; every other answer earns the ring back.
    expect([...entry]).toEqual(['codex-manual-completed'])
    expect([...ring].sort()).toEqual([
      'codex-manual-running',
      'codex-manual-stopped',
      'codex-manual-waiting-approval',
      'codex-manual-waiting-input'
    ])
  })

  it('sends a hand-set completion that is unread to the unread backlog, not the pin group', () => {
    const kernel = createCompanionTaskKernel({
      now: () => 1_000_000_000,
      initialConfiguration: { enabled: true, providers: { codex: true, claude: false } }
    })
    const receipt = kernel.attach({ enabled: true, providers: { codex: true, claude: false } })
    const current = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'unknown',
        statusEnteredAt: 100,
        manualPhase: 'completed',
        manualPhaseSetAt: 150,
        unread: true,
        unreadKnown: true,
        localPin: true,
        kind: 'local-pin',
        dynamicEligible: false
      })], 1, { providers: { codex: true, claude: false } })
    })

    // The deliberate exception, and it is not the pin's: an unread completion
    // stays reachable from the entry AND the ring's `unread` tier because the
    // badge promises exactly that set. The ROW itself displays in the pin
    // group (user decision, 2026-09-01).
    expect(current.views.groups.pinned).toEqual(['codex-a'])
    expect(current.views.groups.unread).toEqual([])
    expect(current.views.counts.unread).toBe(1)
    expect(current.views.attentionKeys.completedUnread).toEqual(['codex-a'])
    expect(current.views.cycleKeys).toEqual(['codex-a'])
  })
})

describe('per-task phase transition diagnostics', () => {
  const providers = { codex: true, claude: false }

  function attachedKernel() {
    const records: Array<Record<string, any>> = []
    const kernel = createCompanionTaskKernel({
      coalesceMs: 0,
      record: (entry: Record<string, any>) => records.push(entry),
      initialConfiguration: { enabled: true, providers }
    })
    const receipt = kernel.attach({ enabled: true, providers })
    const transitions = () => records.filter((entry) => entry.event === 'phase-transition')
    return { kernel, receipt, records, transitions }
  }

  it('names the flipping task, which an aggregate group count cannot attribute', () => {
    const { kernel, receipt, transitions } = attachedKernel()
    kernel.syncPackage({ lease: receipt.lease, draft: draft([task({ phase: 'running' })], 1, { providers }) })
    // First publish has no previous package to diff against. Membership is not
    // a transition, so it must stay out of the timeline.
    expect(transitions()).toEqual([])

    const published = kernel.syncPackage({
      lease: receipt.lease,
      draft: draft([task({
        phase: 'completed',
        cycleTier: 'none',
        dynamicGroup: 'completed',
        phaseRevision: 200,
        statusEnteredAt: 200,
        terminalAt: 200
      })], 2, { providers })
    })

    expect(published.tasks[0].phase).toBe('completed')
    expect(transitions()).toEqual([expect.objectContaining({
      level: 'info',
      scope: 'task-kernel',
      event: 'phase-transition',
      outcome: 'completed',
      taskRef: 'codex-a',
      packageRevision: published.packageRevision,
      details: expect.objectContaining({
        from: 'running',
        provider: 'codex',
        unread: false,
        forced: false,
        batchNodes: expect.objectContaining({ codex: 1 })
      })
    })])
  })

  it('caps one publish at eight named flips and summarizes the remainder', () => {
    const { kernel, receipt, transitions } = attachedKernel()
    // Zero-padded so the published task order — which is what the cap walks —
    // matches the order these are declared in.
    const keys = Array.from({ length: 11 }, (_, index) => `codex-${String(index).padStart(2, '0')}`)
    const rows = (phase: string, revision: number) => keys.map((key, index) => task({
      key,
      actionAlias: `ct_${key.replace('-', '_')}_1234567890`,
      phase,
      cycleTier: phase === 'running' ? 'active' : 'none',
      dynamicGroup: phase === 'running' ? 'active' : 'completed',
      phaseRevision: revision,
      statusEnteredAt: revision,
      terminalAt: phase === 'running' ? 0 : revision,
      displayOrder: index,
      cycleOrder: index,
      attentionOrder: index
    }))

    kernel.syncPackage({ lease: receipt.lease, draft: draft(rows('running', 100), 1, { providers }) })
    kernel.syncPackage({ lease: receipt.lease, draft: draft(rows('completed', 200), 2, { providers }) })

    const named = transitions().filter((entry) => entry.outcome !== 'overflow')
    expect(named).toHaveLength(8)
    expect(named.map((entry) => entry.taskRef)).toEqual(keys.slice(0, 8))
    // The remainder is counted rather than dropped: a silent cap would read as
    // "only eight tasks moved".
    expect(transitions().filter((entry) => entry.outcome === 'overflow')).toEqual([expect.objectContaining({
      scope: 'task-kernel',
      event: 'phase-transition',
      outcome: 'overflow',
      count: 3
    })])
  })
})
