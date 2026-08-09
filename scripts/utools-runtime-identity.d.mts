export interface UtoolsRuntimeIdentityV1 {
  readonly revision: 'runtime-identity-v1'
  readonly hostAssetId: string
  readonly rendererAssetId: string
  readonly kernelRevision: 'companion-task-kernel-v1'
  readonly taskPackageRevision: 'companion-task-package-v1'
  readonly artifactState: 'artifact-ready'
}

export const RUNTIME_IDENTITY_REVISION: UtoolsRuntimeIdentityV1['revision']
export const COMPANION_TASK_KERNEL_REVISION: UtoolsRuntimeIdentityV1['kernelRevision']
export const COMPANION_TASK_PACKAGE_REVISION: UtoolsRuntimeIdentityV1['taskPackageRevision']
export function buildUtoolsRuntimeIdentity(root: string): UtoolsRuntimeIdentityV1
export function runtimeIdentityCommonJs(identity: UtoolsRuntimeIdentityV1): string
