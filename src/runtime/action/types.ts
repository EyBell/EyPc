import type { AppTabId } from '../../domain/types'
import type { KeybindingContext } from '../keybinding/keybindingRuntime'

export type RuntimeActionRisk = 'normal' | 'data-write' | 'destructive'
export type RuntimeActionScope = 'global' | 'tab' | 'row' | 'layer'

export interface RuntimeActionContext {
  tab: AppTabId
  selectedIds: string[]
  layerIds: string[]
  portPane?: 'groups' | 'results'
  favoritePane?: 'containers' | 'items' | 'directory'
  favoriteUndoAvailable?: boolean
  favoriteQuickMode?: boolean
  textInputFocused?: boolean
  activeInputRole?: KeybindingContext['activeInputRole']
  mqttPane?: KeybindingContext['mqttPane']
  mqttPanelOpen?: boolean
  mqttTargetKind?: KeybindingContext['mqttTargetKind']
}

export interface RuntimeActionDefinition {
  id: string
  title: string
  description?: string
  icon?: string
  group: string
  risk: RuntimeActionRisk
  scope: RuntimeActionScope
  priority: number
  shortcut?: string
  when: (context: RuntimeActionContext) => boolean
  run: (context: RuntimeActionContext, args?: Record<string, unknown>) => boolean | { handled: boolean; error?: string }
}

export interface RuntimeActionIntent {
  actionId: string
  context: RuntimeActionContext
  args?: Record<string, unknown>
}

export interface RuntimeActionDispatchResult {
  handled: boolean
  actionId: string | null
  error?: string
}
