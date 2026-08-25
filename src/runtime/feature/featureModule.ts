import type { AppTabId } from '../../domain/types'
import type { AppRuntimeSnapshot, RuntimeNotificationDomainV7 } from '../appRuntime'
import type { CommandDescriptorV7, KeybindingLayerId } from '../command/types'
import type { RuntimeSliceOwnerV7 } from '../runtimeSlice'
import type { FeatureDefinition } from './featureRegistry'

export type FeatureBackgroundPolicyV7 =
  | 'visible-only'
  | 'on-demand'
  | 'connected-only'
  | 'entry-enabled'

export interface FeatureLifecycleV7 {
  backgroundPolicy: FeatureBackgroundPolicyV7
  startOnVisible: boolean
  retainWhileHidden: boolean
}

export interface FeatureModuleV7<Id extends AppTabId = AppTabId, View = unknown> {
  readonly id: Id
  readonly definition: FeatureDefinition & { id: Id }
  readonly lifecycle: FeatureLifecycleV7
  readonly commands: readonly CommandDescriptorV7[]
  readonly layers: readonly KeybindingLayerId[]
  readonly menuKinds: readonly string[]
  readonly helpGuideId: Id
  readonly diagnosticDomains: readonly string[]
  selectView(snapshot: AppRuntimeSnapshot): View
  createSlice(source: {
    readSnapshot(): AppRuntimeSnapshot
    subscribeDomain(domain: RuntimeNotificationDomainV7, listener: () => void): () => void
  }): RuntimeSliceOwnerV7<View>
  start?(): void
  dispose?(): void
}
