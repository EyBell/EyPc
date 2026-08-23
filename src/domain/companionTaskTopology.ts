import manifest from '../../preload/companion/provider-manifest.json'
import type { CompanionProviderId } from './companionProvider'

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

export type CompanionEvidenceChannelV1 = 'membership' | 'phase' | 'unread' | 'metadata' | 'topology'

export interface CompanionProviderEvidenceBatchV1 {
  revision: 'companion-provider-evidence-batch-v1'
  provider: CompanionProviderId
  channels: Record<CompanionEvidenceChannelV1, {
    mode: 'snapshot' | 'delta'
    complete: boolean
    generation: number
    removedKeys: string[]
  }>
  nodes: CompanionTaskNodeObservationV1[]
  relations: CompanionTaskRelationObservationV1[]
  relationMode: 'snapshot' | 'delta'
  relationsComplete: boolean
  removedRelationChildKeys: string[]
  health: 'ready' | 'unavailable' | 'degraded'
}

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
