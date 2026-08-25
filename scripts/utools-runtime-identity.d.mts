export interface UtoolsRuntimeIdentityV1 {
  readonly revision: 'runtime-identity-v2'
  readonly hostAssetId: string
  readonly rendererAssetId: string
  readonly kernelRevision: 'companion-task-kernel-v7'
  readonly registryRevision: 'companion-provider-registry-v1'
  readonly topologyRevision: 'companion-task-topology-v2'
  readonly taskPackageRevision: 'companion-task-snapshot-v7'
  readonly commandRevision: 'companion-task-command-v1'
  readonly subscribeRevision: 'companion-task-subscribe-v1'
  readonly ackRevision: 'companion-task-ack-v2'
  readonly artifactState: 'artifact-ready'
}

export const RUNTIME_IDENTITY_REVISION: UtoolsRuntimeIdentityV1['revision']
export const COMPANION_TASK_KERNEL_REVISION: UtoolsRuntimeIdentityV1['kernelRevision']
export const COMPANION_PROVIDER_REGISTRY_REVISION: UtoolsRuntimeIdentityV1['registryRevision']
export const COMPANION_TASK_TOPOLOGY_REVISION: UtoolsRuntimeIdentityV1['topologyRevision']
export const COMPANION_TASK_PACKAGE_REVISION: UtoolsRuntimeIdentityV1['taskPackageRevision']
export const COMPANION_TASK_COMMAND_REVISION: UtoolsRuntimeIdentityV1['commandRevision']
export const COMPANION_TASK_SUBSCRIBE_REVISION: UtoolsRuntimeIdentityV1['subscribeRevision']
export const COMPANION_TASK_ACK_REVISION: UtoolsRuntimeIdentityV1['ackRevision']
export function buildUtoolsRuntimeIdentity(root: string): UtoolsRuntimeIdentityV1
export function runtimeIdentityCommonJs(identity: UtoolsRuntimeIdentityV1): string
