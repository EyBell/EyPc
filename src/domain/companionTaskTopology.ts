import manifest from '../../preload/companion/provider-manifest.json'
import type { CompanionProviderId } from './companionProvider'
import {
  COMPANION_V7_REVISIONS,
  type CompanionActivityKindV7,
  type CompanionEvidenceChannelV7,
  type CompanionInteractionEvidenceV1,
  type CompanionInteractionSetEvidenceV1,
  type CompanionPlanArtifactEvidenceV1
} from './generated/companionContractsV7'

export const COMPANION_PROVIDER_REGISTRY_REVISION = manifest.revision
export const COMPANION_TASK_TOPOLOGY_REVISION = manifest.topologyRevision
export const COMPANION_TASK_COMMAND_REVISION = manifest.commandRevision
export const COMPANION_TASK_SUBSCRIBE_REVISION = manifest.subscribeRevision
export const COMPANION_TASK_ACK_REVISION = manifest.ackRevision

export type CompanionTaskRelationType = 'fork' | 'side-thread' | 'subagent'

export interface CompanionTaskTopologySummaryV1 {
  mode: 'independent' | 'aggregate'
  memberCount: number
  liveCount: number
  attentionCount: number
  errorCount: number
}

export interface CompanionTaskNodeObservationV1 {
  key: string
  provider: CompanionProviderId
  family: string
  role: 'root' | 'child'
  phase: 'running' | 'waiting-input' | 'waiting-approval' | 'completed' | 'stopped' | 'unknown'
  unread: { known: boolean; value: boolean }
  causalKey: string
  causalReliable: boolean
  standaloneEligible: boolean
  capabilities: readonly string[]
}

export type CompanionActivityEvidenceKindV3 =
  CompanionActivityKindV7

/** @deprecated V7 uses `CompanionPlanArtifactEvidenceV1`. */
export interface CompanionPlanLifecycleEvidenceV2 {
  state: 'unknown' | 'ready' | 'cleared'
  sequence: number
  reason: '' | 'cancel' | 'execution-start' | 'archive' | 'removal'
}

/** Host-private, provider-neutral evidence. Canonical phase/views are Kernel output only. */
export interface CompanionTaskEvidenceNodeV3 {
  key: string
  provider: CompanionProviderId
  family: string
  role: 'root' | 'child'
  membership: 'present' | 'archived' | 'missing-candidate'
  activity: {
    kind: CompanionActivityEvidenceKindV3
    causalKey: string
    sequence: number
    exact: boolean
    observedAt: number
    statusEnteredAt: number
    turnStartedAt: number
    terminalAt: number
    candidates?: Array<{
      kind: CompanionActivityEvidenceKindV3
      causalKey: string
      sequence: number
      exact: boolean
      observedAt: number
      statusEnteredAt: number
      turnStartedAt: number
      terminalAt: number
    }>
  }
  unread: { known: boolean; value: boolean; sequence: number }
  planArtifact: CompanionPlanArtifactEvidenceV1 & {
    reason: '' | 'cancel' | 'execution-start' | 'archive' | 'removal'
  }
  metadata: Record<string, unknown>
  capabilities: string[]
  standaloneEligible: boolean
  error: boolean
}

export interface CompanionTaskRelationObservationV1 {
  childKey: string
  parentKey: string
  provider: CompanionProviderId
  family: string
  relation: CompanionTaskRelationType
  authority: string
  exact: boolean
  generation: number
}

export interface CompanionProviderEvidenceBatchV3 {
  revision: typeof COMPANION_V7_REVISIONS.providerEvidenceBatch
  provider: CompanionProviderId
  channels: Record<CompanionEvidenceChannelV7, {
    mode: 'snapshot' | 'delta'
    complete: boolean
    generation: number
    removedKeys: string[]
  }>
  nodes: CompanionTaskEvidenceNodeV3[]
  interactions: CompanionInteractionEvidenceV1[]
  interactionSets: CompanionInteractionSetEvidenceV1[]
  relations: CompanionTaskRelationObservationV1[]
  relationMode: 'snapshot' | 'delta'
  relationsComplete: boolean
  removedRelationChildKeys: string[]
  health: 'ready' | 'unavailable' | 'degraded'
}

/** Narrow migration aliases. Runtime values are V7/V3. */
export type CompanionActivityEvidenceKindV2 = CompanionActivityEvidenceKindV3
export type CompanionTaskEvidenceNodeV2 = CompanionTaskEvidenceNodeV3
export type CompanionEvidenceChannelV1 = CompanionEvidenceChannelV7
export type CompanionProviderEvidenceBatchV1 = CompanionProviderEvidenceBatchV3

export type CompanionTaskCommandNameV1 =
  | 'open'
  | 'cycle'
  | 'open-attention'
  | 'archive'
  | 'pause'
  | 'resume'
  | 'execute-plan'
  | 'focus'
  | 'set-alias'
  | 'set-visibility'
  | 'set-pin'
  | 'set-collapse'

export interface CompanionTaskCommandV1 {
  revision: typeof COMPANION_TASK_COMMAND_REVISION
  operationId: string
  command: CompanionTaskCommandNameV1
  selector: {
    key?: string
    direction?: -1 | 1
    attention?: 'input' | 'completed-unread'
  }
  source: string
  expectedRevision: {
    snapshot: number
    topology: number
  }
  payload?: Record<string, unknown>
}
