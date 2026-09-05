import type { Component } from 'vue'
import type { AppTabId, FeatureConfig } from '../../domain/types'
import type { AppRuntimeSnapshot, RuntimeNotificationDomainV7 } from '../appRuntime'
import type { KeybindingLayerId } from '../command/types'
import type { ShortcutCommandProfile } from '../keybinding/commandProfile'
import { createRuntimeSliceV7, type RuntimeSliceOwnerV7 } from '../runtimeSlice'
import type { FeatureActionHostV7 } from './featureActionHost'
import type { FeatureDefinition } from './featureRegistry'
import type { FeatureRoute } from './featureRouteHelpers'

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

export interface FeatureRouteMatchV7 {
  code: string
  groups?: string[]
}

export interface FeatureRouteContextV7 {
  configs?: FeatureConfig[]
  currentTab?: AppTabId | null
}

export interface FeatureRouteContributionV7 {
  code?: string
  codePattern?: RegExp
  toRoute: (match: FeatureRouteMatchV7, ctx: FeatureRouteContextV7) => FeatureRoute
}

export interface FeaturePageShellV7 {
  shortcutHints: boolean
  shiftPreview: boolean
  initialMaintenanceSection: 'features' | null
  favoriteQuickMode: boolean
}

export type FeaturePageHostV7 = {
  dispatch: (actionId: string, args?: Record<string, unknown>) => unknown
} & Record<string, unknown>

export interface FeaturePageBindingV7 {
  page: Component
  props: Record<string, unknown>
  on: Record<string, (...args: any[]) => unknown>
}

export interface FeatureSubscribeContextV7<View> {
  activeTab: AppTabId
  enabled: boolean
  view: View
}

export type FeatureSliceSourceV7 = {
  readSnapshot(): AppRuntimeSnapshot
  subscribeDomain(domain: RuntimeNotificationDomainV7, listener: () => void): () => void
}

export interface FeatureModuleV7<Id extends AppTabId = AppTabId, View = unknown> {
  readonly id: Id
  readonly definition: FeatureDefinition & { id: Id }
  readonly lifecycle: FeatureLifecycleV7
  readonly commands: readonly ShortcutCommandProfile[]
  readonly routes: readonly FeatureRouteContributionV7[]
  readonly layers: readonly KeybindingLayerId[]
  readonly menuKinds: readonly string[]
  readonly helpGuideId: Id
  readonly diagnosticDomains: readonly string[]
  readonly alwaysEnabled?: boolean
  selectView(snapshot: AppRuntimeSnapshot): View
  createSlice(source: FeatureSliceSourceV7): RuntimeSliceOwnerV7<View>
  shouldSubscribe(ctx: FeatureSubscribeContextV7<View>): boolean
  registerActions(host: FeatureActionHostV7): void
  bindPage(input: {
    runtime: FeaturePageHostV7
    slice: RuntimeSliceOwnerV7<View>
    shell: FeaturePageShellV7
  }): FeaturePageBindingV7
  confirmRestoreFocusSelectors?(snapshot: { activeFavoritePane?: string }): string[]
}

export function defaultShouldSubscribeV7<View>(
  id: AppTabId,
  lifecycle: FeatureLifecycleV7,
  ctx: FeatureSubscribeContextV7<View>,
  connected?: (view: View) => boolean
): boolean {
  if (ctx.activeTab === id) return true
  if (!ctx.enabled) return false
  if (lifecycle.backgroundPolicy === 'entry-enabled') return true
  if (lifecycle.backgroundPolicy === 'connected-only') return connected?.(ctx.view) === true
  return false
}

export function layersFromCommands(commands: readonly ShortcutCommandProfile[], fallback: KeybindingLayerId): KeybindingLayerId[] {
  const layers = [...new Set(commands.map((command) => command.layer))]
  return layers.length ? layers : [fallback]
}

export function createFeatureModuleV7<Id extends AppTabId, View>(
  spec: Omit<FeatureModuleV7<Id, View>, 'createSlice' | 'helpGuideId' | 'layers'> & {
    layers?: readonly KeybindingLayerId[]
  }
): FeatureModuleV7<Id, View> {
  const layers = spec.layers ?? layersFromCommands(spec.commands, spec.id as KeybindingLayerId)
  return Object.freeze({
    ...spec,
    helpGuideId: spec.id,
    layers: Object.freeze([...layers]),
    commands: Object.freeze([...spec.commands]),
    routes: Object.freeze([...spec.routes]),
    menuKinds: Object.freeze([...spec.menuKinds]),
    diagnosticDomains: Object.freeze([...spec.diagnosticDomains]),
    createSlice(source: FeatureSliceSourceV7) {
      return createRuntimeSliceV7({
        id: `feature:${spec.id}`,
        readSource: source.readSnapshot,
        select: spec.selectView,
        subscribeSource: (listener) => source.subscribeDomain(spec.id, listener)
      })
    }
  })
}
