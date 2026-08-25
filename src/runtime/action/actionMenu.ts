import type { RuntimeActionRisk } from '../command/types'
import { createNavigationIntentV7, type FeatureTargetRefV7, type NavigationIntentV7 } from '../navigation/navigationIntent'

export interface ActionInvocationV7 {
  commandId: string
  args?: Record<string, unknown>
  title?: string
  description?: string
  icon?: string
  target?: FeatureTargetRefV7
  source?: NavigationIntentV7['source']
  disposition?: NavigationIntentV7['disposition']
}

export interface ActionMenuCommandV7 {
  title: string
  description?: string
  icon?: string
  risk: RuntimeActionRisk
  available: boolean
}

export interface ActionMenuItemV7 {
  commandId: string
  title: string
  description: string
  icon: string
  shortcutLabel: string
  risk: RuntimeActionRisk
  enabled: boolean
  args?: Record<string, unknown>
  target?: FeatureTargetRefV7
  navigationIntent?: NavigationIntentV7
}

export interface ActionMenuResolverV7 {
  command(commandId: string): ActionMenuCommandV7 | null
  shortcutLabel(commandId: string): string
}

export function buildActionMenuItemV7(
  invocation: ActionInvocationV7,
  resolver: ActionMenuResolverV7,
  shortcutLabel?: string
): ActionMenuItemV7 {
  const command = resolver.command(invocation.commandId)
  const navigationIntent = invocation.target
    ? createNavigationIntentV7({
        commandId: invocation.commandId,
        target: invocation.target,
        source: invocation.source || 'more-menu',
        disposition: invocation.disposition || 'execute'
      })
    : undefined
  return {
    commandId: invocation.commandId,
    title: invocation.title || command?.title || invocation.commandId,
    description: invocation.description || command?.description || '',
    icon: invocation.icon || command?.icon || '',
    shortcutLabel: shortcutLabel ?? resolver.shortcutLabel(invocation.commandId),
    risk: command?.risk || 'normal',
    enabled: command?.available === true,
    args: invocation.args,
    target: invocation.target,
    navigationIntent
  }
}

export function actionMenuDispatchArgsV7(item: ActionMenuItemV7): Record<string, unknown> {
  return {
    ...(item.args || {}),
    ...(item.navigationIntent ? { navigationIntent: item.navigationIntent } : {})
  }
}

export function buildActionMenuModelV7(
  invocations: readonly ActionInvocationV7[],
  resolver: ActionMenuResolverV7
): readonly ActionMenuItemV7[] {
  return Object.freeze(invocations.map((invocation) => Object.freeze(buildActionMenuItemV7(invocation, resolver))))
}
