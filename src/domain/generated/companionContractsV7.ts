// Generated from contracts/companion-v7.schema.json. Do not edit by hand.

export const COMPANION_V7_REVISIONS = {
  "taskState": "task-state-v12",
  "draft": "companion-task-evidence-draft-v7",
  "providerEvidenceBatch": "companion-provider-evidence-batch-v3",
  "kernel": "companion-task-kernel-v7",
  "snapshot": "companion-task-snapshot-v7",
  "interaction": "companion-interaction-evidence-v1",
  "interactionStore": "companion-interaction-tombstones-v1",
  "planArtifact": "companion-plan-artifact-v1",
  "rolloutEvidence": "codex-rollout-evidence-v2",
  "desktopRequestProjection": "codex-desktop-request-projection-v2",
  "desktopShadow": "codex-desktop-shadow-v2",
  "childEnvelope": "child-envelope-v7"
} as const
export const COMPANION_EVIDENCE_CHANNELS_V7 = ["membership","activity","interaction","unread","planArtifact","metadata","topology"] as const
export const COMPANION_ACTIVITY_KINDS_V7 = ["turn-running","turn-completed","turn-interrupted","turn-failed","unknown"] as const
export const COMPANION_ACTIVITY_AUTHORITIES_V7 = ["goal-verifying","goal","live-turn","terminal","inventory","unknown"] as const
export const COMPANION_INTERACTION_KINDS_V1 = ["user-input","approval","plan-choice","plan-implementation"] as const
export const COMPANION_INTERACTION_STATES_V1 = ["opened","resolved","cancelled","execution-started"] as const
export const COMPANION_INTERACTION_AUTHORITIES_V1 = ["provider-live","provider-snapshot","host-command","rollout"] as const
export const COMPANION_PLAN_ARTIFACT_STATES_V1 = ["unknown","available","executing","consumed","cancelled","removed"] as const
export const COMPANION_PLAN_ARTIFACT_REASONS_V1 = ["","cancel","execution-start","archive","removal"] as const
export const CHILD_SURFACES_V7 = ["main","float","action","quick-favorites"] as const
export const CHILD_ACK_STAGES_V7 = ["accepted","dispatched","native-confirmed","read-confirmed","applied","rejected"] as const

export type CompanionEvidenceChannelV7 = typeof COMPANION_EVIDENCE_CHANNELS_V7[number]
export type CompanionActivityKindV7 = typeof COMPANION_ACTIVITY_KINDS_V7[number]
export type CompanionActivityAuthorityV7 = typeof COMPANION_ACTIVITY_AUTHORITIES_V7[number]
export type CompanionInteractionKindV1 = typeof COMPANION_INTERACTION_KINDS_V1[number]
export type CompanionInteractionStateV1 = typeof COMPANION_INTERACTION_STATES_V1[number]
export type CompanionInteractionAuthorityV1 = typeof COMPANION_INTERACTION_AUTHORITIES_V1[number]
export type CompanionPlanArtifactStateV1 = typeof COMPANION_PLAN_ARTIFACT_STATES_V1[number]
export type CompanionPlanArtifactReasonV1 = typeof COMPANION_PLAN_ARTIFACT_REASONS_V1[number]
export type ChildSurfaceIdV7 = typeof CHILD_SURFACES_V7[number]
export type ChildAckStageV7 = typeof CHILD_ACK_STAGES_V7[number]

export interface ChildEnvelopeV7<TPayload = Record<string, unknown>> {
  revision: typeof COMPANION_V7_REVISIONS.childEnvelope
  runtimeIdentity: string
  surfaceId: ChildSurfaceIdV7
  channel: string
  payloadRevision: number
  requestId?: string
  interactionId?: string
  ack?: ChildAckStageV7
  heartbeat?: number
  logCursor?: number
  payload: TPayload
}

export interface CompanionInteractionEvidenceV1 {
  revision: typeof COMPANION_V7_REVISIONS.interaction
  provider: 'codex' | 'claude' | 'cursor'
  taskKey: string
  branchRef: string
  interactionRef: string
  kind: CompanionInteractionKindV1
  state: CompanionInteractionStateV1
  sequence: number
  turnEpoch: number
  requestSetRevision: number
  authority: CompanionInteractionAuthorityV1
  exact: boolean
}

export interface CompanionInteractionSetEvidenceV1 {
  revision: typeof COMPANION_V7_REVISIONS.interaction
  provider: 'codex' | 'claude' | 'cursor'
  taskKey: string
  requestSetRevision: number
  complete: boolean
}

export interface CompanionPlanArtifactEvidenceV1 {
  revision: typeof COMPANION_V7_REVISIONS.planArtifact
  state: CompanionPlanArtifactStateV1
  sequence: number
  actionable: boolean
  reason: CompanionPlanArtifactReasonV1
}
