import type { AppTabId } from '../../domain/types'
import type { ChildSurfaceIdV7 } from '../../domain/generated/companionContractsV7'

export const NAVIGATION_INTENT_REVISION_V7 = 'navigation-intent-v7' as const

export type FeatureTargetKindV7 =
  | 'feature'
  | 'row'
  | 'task'
  | 'project'
  | 'record'
  | 'element'
  | 'port'
  | 'port-group'
  | 'favorite'
  | 'directory'
  | 'window'
  | 'mqtt-config'
  | 'mqtt-connection-group'
  | 'mqtt-subscription'
  | 'mqtt-session'
  | 'mqtt-message'
  | 'mqtt-log'
  | 'mqtt-publish-template'
  | 'mqtt-publish-draft-history'

export interface FeatureTargetRefV7 {
  featureId: AppTabId
  surfaceId: ChildSurfaceIdV7
  kind: FeatureTargetKindV7
  key: string
  keys?: readonly string[]
}

export interface NavigationIntentV7 {
  revision: typeof NAVIGATION_INTENT_REVISION_V7
  commandId: string
  target: FeatureTargetRefV7
  source: 'button' | 'shortcut' | 'context-menu' | 'more-menu' | 'drawer' | 'quick-jump'
  disposition: 'focus' | 'open' | 'execute'
}

const FEATURE_IDS = new Set<AppTabId>(['ports', 'mqtt', 'favorites', 'windows', 'codex', 'settings'])
const SINGLE_TARGET_ARG_KEYS = [
  'targetId', 'favoriteId', 'portId', 'groupId', 'windowId', 'rowId', 'recordId',
  'taskKey', 'projectKey', 'path', 'id'
] as const
const MULTI_TARGET_ARG_KEYS = ['favoriteIds', 'portIds', 'windowIds', 'directoryPaths'] as const

function publicTargetKeys(args?: Record<string, unknown>): { source: string; keys: string[] } | null {
  for (const source of MULTI_TARGET_ARG_KEYS) {
    const value = args?.[source]
    if (!Array.isArray(value)) continue
    const keys = [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
      .slice(0, 256)
      .map((item) => item.slice(0, 512))
    if (keys.length) return { source, keys }
  }
  for (const source of SINGLE_TARGET_ARG_KEYS) {
    const value = args?.[source]
    if (typeof value === 'string' && value.length > 0) return { source, keys: [value.slice(0, 512)] }
  }
  return null
}

function featureTargetKindV7(featureId: AppTabId, source: string, args?: Record<string, unknown>): FeatureTargetKindV7 {
  if (source === 'taskKey') return 'task'
  if (source === 'projectKey') return 'project'
  if (featureId === 'ports') return source === 'groupId' || args?.targetKind === 'group' || args?.targetKind === 'folder' ? 'port-group' : 'port'
  if (featureId === 'favorites') return source === 'directoryPaths' || source === 'path' ? 'directory' : 'favorite'
  if (featureId === 'windows') return 'window'
  if (featureId === 'mqtt') {
    const rawKind = typeof args?.targetKind === 'string' ? args.targetKind : typeof args?.kind === 'string' ? args.kind : ''
    const byRawKind: Record<string, FeatureTargetKindV7> = {
      config: 'mqtt-config',
      'connection-group': 'mqtt-connection-group',
      subscription: 'mqtt-subscription',
      session: 'mqtt-session',
      message: 'mqtt-message',
      log: 'mqtt-log',
      'publish-template': 'mqtt-publish-template',
      'publish-draft-history': 'mqtt-publish-draft-history'
    }
    return byRawKind[rawKind] || 'record'
  }
  return source === 'recordId' ? 'record' : 'row'
}

export function featureIdForCommandV7(commandId: string, fallback: AppTabId): AppTabId {
  const prefix = commandId.split('.')[0] as AppTabId
  return FEATURE_IDS.has(prefix) ? prefix : fallback
}

export function featureTargetRefForCommandV7(input: {
  commandId: string
  args?: Record<string, unknown>
  featureId: AppTabId
  surfaceId?: ChildSurfaceIdV7
}): FeatureTargetRefV7 {
  const featureId = featureIdForCommandV7(input.commandId, input.featureId)
  const target = publicTargetKeys(input.args)
  const key = target?.keys[0] || featureId
  const kind = target ? featureTargetKindV7(featureId, target.source, input.args) : 'feature'
  return Object.freeze({
    featureId,
    surfaceId: input.surfaceId || 'main',
    kind,
    key,
    ...(target && target.keys.length > 1 ? { keys: Object.freeze([...target.keys]) } : {})
  })
}

export function createNavigationIntentV7(input: Omit<NavigationIntentV7, 'revision'>): NavigationIntentV7 {
  if (!input.commandId.trim()) throw new Error('Navigation command id must not be empty')
  if (!input.target.key.trim()) throw new Error('Navigation target key must not be empty')
  return Object.freeze({
    revision: NAVIGATION_INTENT_REVISION_V7,
    ...input,
    target: Object.freeze({
      ...input.target,
      ...(input.target.keys ? { keys: Object.freeze([...input.target.keys]) } : {})
    })
  })
}
