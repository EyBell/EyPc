import type { AppTabId } from '../../domain/types'

export type RuntimeActionRisk = 'normal' | 'data-write' | 'destructive'
export type RuntimeActionScope = 'global' | 'tab' | 'row' | 'layer'

export interface RuntimeActionContext {
  tab: AppTabId
  selectedIds: string[]
  layerIds: string[]
  portPane?: 'groups' | 'results'
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
