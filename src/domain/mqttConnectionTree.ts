import type { MqttConnectionConfig, MqttConnectionGroup } from './types'

export const DEFAULT_MQTT_CONNECTION_GROUP_COLORS = ['#00A676', '#2F80ED', '#F2994A', '#9B51E0', '#EB5757'] as const

export type MqttConnectionTreeTarget =
  | { kind: 'group'; id: string }
  | { kind: 'config'; id: string }

export type MqttConnectionTreeDropPosition = 'before' | 'inside' | 'after'

export interface MqttConnectionTreeMoveTarget {
  parentGroupId: string | null
  beforeTarget: MqttConnectionTreeTarget | null
}

export interface MqttConnectionTreeBuildOptions {
  collapsedIds?: string[]
  activeConfigId?: string | null
  selectedConfigIds?: string[]
  selectedTarget?: MqttConnectionTreeTarget | null
  keyword?: string
}

export interface MqttConnectionTreeRow {
  rowId: string
  target: MqttConnectionTreeTarget
  kind: MqttConnectionTreeTarget['kind']
  id: string
  name: string
  color: string
  depth: number
  collapsed: boolean
  childCount: number
  active: boolean
  selected: boolean
  focused: boolean
  group: MqttConnectionGroup | null
  config: MqttConnectionConfig | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function timestampValue(value: unknown, fallback: number): number {
  const next = numberValue(value, fallback)
  return next >= 0 ? Math.trunc(next) : fallback
}

function normalizeGroupColor(value: unknown, fallbackIndex = 0): string {
  const raw = stringValue(value).trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw
  return DEFAULT_MQTT_CONNECTION_GROUP_COLORS[Math.abs(Math.trunc(numberValue(fallbackIndex, 0))) % DEFAULT_MQTT_CONNECTION_GROUP_COLORS.length]
}

function sortGroups(groups: MqttConnectionGroup[]): MqttConnectionGroup[] {
  return [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

function sortConfigs(configs: MqttConnectionConfig[]): MqttConnectionConfig[] {
  return [...configs].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

function groupParentId(group: MqttConnectionGroup, ids: Set<string>): string | null {
  return group.parentId && ids.has(group.parentId) && group.parentId !== group.id ? group.parentId : null
}

function collectGroupDescendantIds(groups: MqttConnectionGroup[], rootId: string): Set<string> {
  const result = new Set<string>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const group of groups) {
      if (group.parentId && result.has(group.parentId) && !result.has(group.id)) {
        result.add(group.id)
        changed = true
      }
    }
  }
  return result
}

function normalizeGroupSiblingOrders(groups: MqttConnectionGroup[]): MqttConnectionGroup[] {
  const byParent = new Map<string | null, MqttConnectionGroup[]>()
  for (const group of groups) {
    byParent.set(group.parentId, [...(byParent.get(group.parentId) || []), group])
  }

  const walk = (parentId: string | null): MqttConnectionGroup[] =>
    sortGroups(byParent.get(parentId) || []).flatMap((group, index) => [
      { ...group, sortOrder: index + 1 },
      ...walk(group.id)
    ])

  return walk(null)
}

function normalizeConfigSiblingOrders(configs: MqttConnectionConfig[], groups: MqttConnectionGroup[]): MqttConnectionConfig[] {
  const output: MqttConnectionConfig[] = []
  const parentOrder = [null, ...normalizeGroupSiblingOrders(groups).map((group) => group.id)]
  for (const parentId of parentOrder) {
    output.push(...sortConfigs(configs.filter((config) => (config.groupId ?? null) === parentId)).map((config, index) => ({ ...config, sortOrder: index + 1 })))
  }
  return output
}

export function normalizeMqttConnectionGroups(value: unknown, now = Date.now()): MqttConnectionGroup[] {
  if (!Array.isArray(value)) return []
  const groups = value.flatMap((item, index): MqttConnectionGroup[] => {
    const source = record(item)
    const id = stringValue(source.id).trim()
    const name = stringValue(source.name).trim()
    if (!id || !name) return []
    return [{
      id,
      name,
      color: normalizeGroupColor(source.color, index),
      parentId: stringValue(source.parentId).trim() || null,
      sortOrder: Math.max(1, Math.trunc(numberValue(source.sortOrder, index + 1))),
      createdAt: timestampValue(source.createdAt, now),
      updatedAt: timestampValue(source.updatedAt, now)
    }]
  })
  const unique = new Map<string, MqttConnectionGroup>()
  for (const group of groups) {
    if (!unique.has(group.id)) unique.set(group.id, group)
  }
  const next = [...unique.values()]
  const ids = new Set(next.map((group) => group.id))
  let normalized = next.map((group) => ({ ...group, parentId: groupParentId(group, ids) }))
  let changed = true
  while (changed) {
    changed = false
    for (const group of normalized) {
      if (group.parentId && collectGroupDescendantIds(normalized, group.id).has(group.parentId)) {
        group.parentId = null
        changed = true
      }
    }
  }
  normalized = normalized.map((group) => ({ ...group }))
  return normalizeGroupSiblingOrders(normalized)
}

export function normalizeMqttConfigGroupRefs(configs: MqttConnectionConfig[], groups: MqttConnectionGroup[]): MqttConnectionConfig[] {
  const groupIds = new Set(groups.map((group) => group.id))
  const normalized = configs.map((config) => ({
    ...config,
    groupId: config.groupId && groupIds.has(config.groupId) ? config.groupId : null
  }))
  return normalizeConfigSiblingOrders(normalized, groups)
}

function buildOptions(collapsedIdsOrOptions?: string[] | MqttConnectionTreeBuildOptions): Required<Omit<MqttConnectionTreeBuildOptions, 'keyword'>> & Pick<MqttConnectionTreeBuildOptions, 'keyword'> {
  const options = Array.isArray(collapsedIdsOrOptions) ? { collapsedIds: collapsedIdsOrOptions } : (collapsedIdsOrOptions || {})
  return {
    collapsedIds: options.collapsedIds || [],
    activeConfigId: options.activeConfigId || null,
    selectedConfigIds: options.selectedConfigIds || [],
    selectedTarget: options.selectedTarget || null,
    keyword: options.keyword || ''
  }
}

export function buildMqttConnectionTreeRows(
  configs: MqttConnectionConfig[],
  groups: MqttConnectionGroup[],
  collapsedIdsOrOptions?: string[] | MqttConnectionTreeBuildOptions
): MqttConnectionTreeRow[] {
  const options = buildOptions(collapsedIdsOrOptions)
  const collapsed = new Set(options.collapsedIds)
  const selectedConfigIds = new Set(options.selectedConfigIds)
  const normalizedGroups = normalizeMqttConnectionGroups(groups)
  const normalizedConfigs = normalizeMqttConfigGroupRefs(configs, normalizedGroups)
  const groupIds = new Set(normalizedGroups.map((group) => group.id))
  const groupsByParent = new Map<string | null, MqttConnectionGroup[]>()
  const configsByParent = new Map<string | null, MqttConnectionConfig[]>()

  for (const group of normalizedGroups) {
    groupsByParent.set(group.parentId, [...(groupsByParent.get(group.parentId) || []), group])
  }
  for (const config of normalizedConfigs) {
    const parentId = config.groupId && groupIds.has(config.groupId) ? config.groupId : null
    configsByParent.set(parentId, [...(configsByParent.get(parentId) || []), config])
  }

  const rows: MqttConnectionTreeRow[] = []
  const matches = (name: string) => !options.keyword || name.toLowerCase().includes(options.keyword.trim().toLowerCase())
  const walk = (parentId: string | null, depth: number) => {
    for (const group of sortGroups(groupsByParent.get(parentId) || [])) {
      const childGroups = groupsByParent.get(group.id) || []
      const childConfigs = configsByParent.get(group.id) || []
      const target: MqttConnectionTreeTarget = { kind: 'group', id: group.id }
      const row: MqttConnectionTreeRow = {
        rowId: `group:${group.id}`,
        target,
        kind: 'group',
        id: group.id,
        name: group.name,
        color: group.color,
        depth,
        collapsed: collapsed.has(group.id),
        childCount: childGroups.length + childConfigs.length,
        active: false,
        selected: false,
        focused: options.selectedTarget?.kind === 'group' && options.selectedTarget.id === group.id,
        group,
        config: null
      }
      if (matches(group.name) || !options.keyword) rows.push(row)
      if (!row.collapsed) walk(group.id, depth + 1)
    }
    for (const config of sortConfigs(configsByParent.get(parentId) || [])) {
      const target: MqttConnectionTreeTarget = { kind: 'config', id: config.id }
      if (!matches(config.name) && options.keyword) continue
      rows.push({
        rowId: `config:${config.id}`,
        target,
        kind: 'config',
        id: config.id,
        name: config.name,
        color: '#6B7280',
        depth,
        collapsed: false,
        childCount: 0,
        active: config.id === options.activeConfigId,
        selected: selectedConfigIds.has(config.id),
        focused: options.selectedTarget?.kind === 'config' && options.selectedTarget.id === config.id,
        group: null,
        config
      })
    }
  }

  walk(null, 0)
  return rows
}

export function isValidMqttConnectionGroupParent(groups: MqttConnectionGroup[], groupId: string, parentGroupId: string | null): boolean {
  if (!parentGroupId) return true
  const normalized = normalizeMqttConnectionGroups(groups)
  if (!normalized.some((group) => group.id === parentGroupId)) return false
  if (!groupId) return true
  if (groupId === parentGroupId) return false
  return !collectGroupDescendantIds(normalized, groupId).has(parentGroupId)
}

function targetParentId(configs: MqttConnectionConfig[], groups: MqttConnectionGroup[], target: MqttConnectionTreeTarget): string | null {
  if (target.kind === 'group') return groups.find((group) => group.id === target.id)?.parentId || null
  return configs.find((config) => config.id === target.id)?.groupId || null
}

function siblingsForTarget(configs: MqttConnectionConfig[], groups: MqttConnectionGroup[], target: MqttConnectionTreeTarget, parentGroupId: string | null): MqttConnectionTreeTarget[] {
  if (target.kind === 'group') {
    return sortGroups(groups.filter((group) => (group.parentId ?? null) === (parentGroupId ?? null))).map((group) => ({ kind: 'group', id: group.id }))
  }
  return sortConfigs(configs.filter((config) => (config.groupId ?? null) === (parentGroupId ?? null))).map((config) => ({ kind: 'config', id: config.id }))
}

export function mqttConnectionTreeMoveTarget(
  configs: MqttConnectionConfig[],
  groups: MqttConnectionGroup[],
  movingTarget: MqttConnectionTreeTarget,
  target: MqttConnectionTreeTarget,
  position: MqttConnectionTreeDropPosition
): MqttConnectionTreeMoveTarget | null {
  if (movingTarget.kind === target.kind && movingTarget.id === target.id) return null
  const normalizedGroups = normalizeMqttConnectionGroups(groups)
  const normalizedConfigs = normalizeMqttConfigGroupRefs(configs, normalizedGroups)
  const targetExists = target.kind === 'group'
    ? normalizedGroups.some((group) => group.id === target.id)
    : normalizedConfigs.some((config) => config.id === target.id)
  const movingExists = movingTarget.kind === 'group'
    ? normalizedGroups.some((group) => group.id === movingTarget.id)
    : normalizedConfigs.some((config) => config.id === movingTarget.id)
  if (!targetExists || !movingExists) return null

  if (position === 'inside') {
    if (target.kind !== 'group') return null
    return movingTarget.kind === 'group' && !isValidMqttConnectionGroupParent(normalizedGroups, movingTarget.id, target.id)
      ? null
      : { parentGroupId: target.id, beforeTarget: null }
  }

  const parentGroupId = targetParentId(normalizedConfigs, normalizedGroups, target)
  if (movingTarget.kind === 'group' && !isValidMqttConnectionGroupParent(normalizedGroups, movingTarget.id, parentGroupId)) return null
  if (position === 'before') return { parentGroupId, beforeTarget: target }

  const siblings = siblingsForTarget(normalizedConfigs, normalizedGroups, target, parentGroupId).filter((item) => !(item.kind === movingTarget.kind && item.id === movingTarget.id))
  const targetIndex = siblings.findIndex((item) => item.kind === target.kind && item.id === target.id)
  if (targetIndex < 0) return null
  return {
    parentGroupId,
    beforeTarget: siblings[targetIndex + 1] || null
  }
}

function reorderConfigs(configs: MqttConnectionConfig[], movingId: string, parentGroupId: string | null, beforeTarget: MqttConnectionTreeTarget | null): MqttConnectionConfig[] {
  const moving = configs.find((config) => config.id === movingId)
  if (!moving) return configs.map((config) => ({ ...config }))
  const siblings = sortConfigs(configs.filter((config) => config.id !== movingId && (config.groupId ?? null) === (parentGroupId ?? null)))
  const beforeConfigId = beforeTarget?.kind === 'config' ? beforeTarget.id : null
  const insertIndex = beforeConfigId ? Math.max(0, siblings.findIndex((config) => config.id === beforeConfigId)) : siblings.length
  const ordered = [...siblings.slice(0, insertIndex), { ...moving, groupId: parentGroupId }, ...siblings.slice(insertIndex)]
  const orderById = new Map(ordered.map((config, index) => [config.id, index + 1]))
  return configs.map((config) => {
    if (config.id === movingId) return { ...config, groupId: parentGroupId, sortOrder: orderById.get(config.id) || 1 }
    if ((config.groupId ?? null) === (parentGroupId ?? null) && orderById.has(config.id)) return { ...config, sortOrder: orderById.get(config.id) || config.sortOrder }
    return { ...config }
  })
}

function reorderGroups(groups: MqttConnectionGroup[], movingId: string, parentGroupId: string | null, beforeTarget: MqttConnectionTreeTarget | null): MqttConnectionGroup[] {
  const moving = groups.find((group) => group.id === movingId)
  if (!moving) return groups.map((group) => ({ ...group }))
  const siblings = sortGroups(groups.filter((group) => group.id !== movingId && (group.parentId ?? null) === (parentGroupId ?? null)))
  const beforeGroupId = beforeTarget?.kind === 'group' ? beforeTarget.id : null
  const insertIndex = beforeGroupId ? Math.max(0, siblings.findIndex((group) => group.id === beforeGroupId)) : siblings.length
  const ordered = [...siblings.slice(0, insertIndex), { ...moving, parentId: parentGroupId }, ...siblings.slice(insertIndex)]
  const orderById = new Map(ordered.map((group, index) => [group.id, index + 1]))
  return groups.map((group) => {
    if (group.id === movingId) return { ...group, parentId: parentGroupId, sortOrder: orderById.get(group.id) || 1 }
    if ((group.parentId ?? null) === (parentGroupId ?? null) && orderById.has(group.id)) return { ...group, sortOrder: orderById.get(group.id) || group.sortOrder }
    return { ...group }
  })
}

export function moveMqttConnectionTreeTarget(
  configs: MqttConnectionConfig[],
  groups: MqttConnectionGroup[],
  movingTarget: MqttConnectionTreeTarget,
  parentGroupId: string | null,
  beforeTarget: MqttConnectionTreeTarget | null
): { configs: MqttConnectionConfig[]; groups: MqttConnectionGroup[] } {
  const normalizedGroups = normalizeMqttConnectionGroups(groups)
  const normalizedConfigs = normalizeMqttConfigGroupRefs(configs, normalizedGroups)
  const validParentId = parentGroupId && normalizedGroups.some((group) => group.id === parentGroupId) ? parentGroupId : null
  if (movingTarget.kind === 'group') {
    if (!isValidMqttConnectionGroupParent(normalizedGroups, movingTarget.id, validParentId)) return { configs: normalizedConfigs, groups: normalizedGroups }
    return {
      configs: normalizedConfigs,
      groups: normalizeMqttConnectionGroups(reorderGroups(normalizedGroups, movingTarget.id, validParentId, beforeTarget))
    }
  }
  return {
    configs: normalizeMqttConfigGroupRefs(reorderConfigs(normalizedConfigs, movingTarget.id, validParentId, beforeTarget), normalizedGroups),
    groups: normalizedGroups
  }
}

export function deleteMqttConnectionGroup(
  configs: MqttConnectionConfig[],
  groups: MqttConnectionGroup[],
  groupId: string
): { configs: MqttConnectionConfig[]; groups: MqttConnectionGroup[] } {
  const normalizedGroups = normalizeMqttConnectionGroups(groups)
  const target = normalizedGroups.find((group) => group.id === groupId)
  if (!target) return { configs: normalizeMqttConfigGroupRefs(configs, normalizedGroups), groups: normalizedGroups }
  const promotedGroups = normalizedGroups
    .filter((group) => group.id !== groupId)
    .map((group) => group.parentId === groupId ? { ...group, parentId: target.parentId } : group)
  const nextGroups = normalizeMqttConnectionGroups(promotedGroups)
  const nextConfigs = normalizeMqttConfigGroupRefs(configs.map((config) => config.groupId === groupId ? { ...config, groupId: target.parentId } : config), nextGroups)
  return { configs: nextConfigs, groups: nextGroups }
}
