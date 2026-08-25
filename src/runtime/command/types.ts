import type { ShortcutProfileId } from '../../domain/types'

export type CommandId = string

export type RuntimeActionRisk = 'normal' | 'data-write' | 'destructive'
export type RuntimeActionScope = 'global' | 'tab' | 'row' | 'layer'

export type CommandExecutionOwner =
  | 'runtime-action'
  | 'shell'
  | 'main-quick-jump'
  | 'float-local'
  | 'action-local'

export type CommandSurfaceIdV7 = 'main' | 'float' | 'action'

export type CommandSurfaceExecutionOwnersV7 = Readonly<Partial<Record<CommandSurfaceIdV7, CommandExecutionOwner>>>

export type KeybindingLayerId =
  | 'app'
  | 'confirm'
  | 'settings-shortcut-record'
  | 'settings-when-edit'
  | 'favorites-run-prompt'
  | 'favorites-slot-manager'
  | 'mqtt-editor'
  | 'mqtt-connection-group-editor'
  | 'mqtt-config-subscription-editor'
  | 'mqtt-config-publish-editor'
  | 'mqtt-publish-editor'
  | 'mqtt-publish-options'
  | 'mqtt-publish-draft'
  | 'mqtt-publish-draft-editor'
  | 'mqtt-subscription-editor'
  | 'mqtt-favorite-editor'
  | 'mqtt-record-editor'
  | 'mqtt-preview'
  | 'mqtt-search'
  | 'mqtt-topic-filter'
  | 'mqtt-connections'
  | 'mqtt-subscriptions'
  | 'mqtt-drawer'
  | 'mqtt-detail'
  | 'mqtt-log-drawer'
  | 'port-group-editor'
  | 'port-group-detail'
  | 'port-drawer'
  | 'port-detail'
  | 'favorites-drawer'
  | 'favorite-detail'
  | 'favorites-pick-review'
  | 'ports-selection'
  | 'ports-search'
  | 'favorites-search'
  | 'favorites-editor'
  | 'window-editor'
  | 'window-actions'
  | 'windows-search'
  | 'codex-composer'
  | 'codex-model'
  | 'codex-quick-jump'
  | 'codex-preview'
  | 'codex-inline-editor'
  | 'codex-drawer'
  | 'codex-detail'
  | 'codex'
  | 'settings'
  | 'ports'
  | 'mqtt'
  | 'favorites'
  | 'windows'
  | 'global'

export interface CommandBindingDescriptorV7 {
  shortcutIds: readonly string[]
  layer: KeybindingLayerId
  when: string
  weight: number
}

export interface CommandDescriptorV7 {
  id: CommandId
  title: string
  group: string
  description?: string
  icon?: string
  risk: RuntimeActionRisk
  /** Default owner used when a surface has no explicit adapter override. */
  executionOwner: CommandExecutionOwner
  /**
   * Surface adapters declare local ownership here. This keeps a single command
   * identity while preventing Main, Float and Action from each guessing who
   * executes it from the command name.
   */
  surfaceExecutionOwners?: CommandSurfaceExecutionOwnersV7
  profileId?: ShortcutProfileId
  defaultBindings: readonly CommandBindingDescriptorV7[]
}

export interface CommandHandlerV7<TContext, TResult = boolean | { handled: boolean; error?: string }> {
  commandId: CommandId
  scope: RuntimeActionScope
  priority: number
  when: (context: TContext) => boolean
  run: (context: TContext, args?: Record<string, unknown>) => TResult
}
