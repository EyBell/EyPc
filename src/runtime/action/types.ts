import type { AppTabId } from '../../domain/types'
import type { KeybindingContext } from '../keybinding/keybindingRuntime'
import type { CommandHandlerV7, RuntimeActionRisk, RuntimeActionScope } from '../command/types'

export type { RuntimeActionRisk, RuntimeActionScope } from '../command/types'

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
  windowActionsOpen?: boolean
  windowEditorOpen?: boolean
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

export type RuntimeActionHandlerV7 = CommandHandlerV7<RuntimeActionContext>

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
