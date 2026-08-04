import { resolveDrawerTargets, toggleIdWithAdvance } from './listSelection'
import {
  compareWindowRowsByApplication,
  normalizeWindowText,
  resolveLiveWindowsForTarget,
  targetMatchesLiveWindow,
  windowTargetAppMatches,
  windowSlotNumbersForTarget,
  type LiveWindow,
  type WindowFamily,
  type WindowInstanceId,
  type WindowPlatform,
  type WindowSlot,
  type WindowTarget
} from './windows'

export const FILE_MANAGER_GROUP_PREFIX = 'file-manager'

function normalizeAppId(value: string): string {
  return normalizeWindowText(value).replace(/\.exe$/i, '')
}

export function isSystemFileManager(platform: WindowPlatform, appId: string): boolean {
  const normalized = normalizeAppId(appId)
  return platform === 'darwin'
    ? normalized === 'com.apple.finder'
    : normalized === 'explorer'
}

export function fileManagerGroupKey(platform: WindowPlatform, appId: string): string | null {
  if (!isSystemFileManager(platform, appId)) return null
  return `${FILE_MANAGER_GROUP_PREFIX}:${platform}:${normalizeAppId(appId)}`
}

export function fileManagerGroupRowId(groupKey: string): string {
  return `group:${groupKey}`
}

export function targetWindowRowId(targetId: string): string {
  return `target:${targetId}`
}

export function liveWindowRowId(instanceId: WindowInstanceId): string {
  return `live:${instanceId}`
}

export function childWindowRowId(rootInstanceId: WindowInstanceId, memberInstanceId: WindowInstanceId): string {
  return `child:${rootInstanceId}:${memberInstanceId}`
}

export function windowFamilyExpansionKey(rootInstanceId: WindowInstanceId): string {
  return `family:${rootInstanceId}`
}

export function candidateWindowRowId(instanceId: WindowInstanceId): string {
  return `candidate:${instanceId}`
}

export function candidateInstanceIdFromRowId(rowId: string | null | undefined): WindowInstanceId | null {
  const prefix = 'candidate:'
  return rowId?.startsWith(prefix) ? rowId.slice(prefix.length) || null : null
}

export interface WindowTreeLeafSource<T> {
  row: T
  id: string
  platform: WindowPlatform
  appId: string
  appName: string
  displayName: string
  title: string
  pinned: boolean
  searchText: string
  familyKey?: string | null
  children?: WindowTreeLeafSource<T>[]
}

export interface FileManagerGroupMetadata {
  groupKey: string
  platform: WindowPlatform
  appId: string
  appName: string
  displayName: string
  pinned: boolean
  searchText: string
}

export interface WindowRow {
  id: string
  live: LiveWindow | null
  target: WindowTarget | null
  displayName: string
  appName: string
  title: string
  favorite: boolean
  pinned: boolean
  slotNumbers: number[]
  focused: boolean
  selected: boolean
  unavailable: boolean
  /** Present in retained session inventory but absent from the latest partial snapshot. */
  cached?: boolean
  ambiguous: boolean
  /** A live same-application option shown only for explicit instance rebinding. */
  candidate?: boolean
  kind: 'window' | 'child-window' | 'file-manager-group'
  treeLevel: 1 | 2
  parentGroupKey: string | null
  parentRowId: string | null
  groupKey: string | null
  expansionKey?: string | null
  /** Root identity used for root-current or member-exact native requests. */
  rootLive?: LiveWindow | null
  expandable: boolean
  expanded: boolean
  childCount: number
  groupLiveInstanceIds: string[]
}

export type WindowActionsMode = 'single' | 'multi'
export type WindowActionsContext = 'window' | 'child-window' | 'file-manager-group' | 'selection' | 'slot'

export function windowActionsContextFor(
  kind: WindowRow['kind'],
  mode: WindowActionsMode
): Exclude<WindowActionsContext, 'slot'> {
  return mode === 'multi'
    ? 'selection'
    : kind === 'file-manager-group'
      ? 'file-manager-group'
      : kind === 'child-window'
        ? 'child-window'
        : 'window'
}

export interface BuildWindowTreeRowsOptions {
  targets: readonly WindowTarget[]
  slots: readonly WindowSlot[]
  liveWindows: readonly LiveWindow[]
  windowFamilies?: readonly WindowFamily[]
  freshInstanceIds: ReadonlySet<WindowInstanceId>
  freshMemberInstanceIds?: ReadonlySet<WindowInstanceId>
  currentPlatform: WindowPlatform | null
  listLoaded: boolean
  focusedRowId: string | null
  selectedRowIds: readonly string[]
  expandedGroupKeys: ReadonlySet<string>
  recentFileManagerInstanceIds: ReadonlyMap<string, WindowInstanceId>
  searchQuery: string
  rebind: { targetId: string | null; candidateInstanceIds: readonly WindowInstanceId[] }
}

export type WindowTreeProjection<T> =
  | {
      kind: 'window-family'
      source: WindowTreeLeafSource<T>
      children: WindowTreeLeafSource<T>[]
      visibleChildren: WindowTreeLeafSource<T>[]
      expanded: boolean
      level: 1
    }
  | {
      kind: 'file-manager-group'
      groupKey: string
      metadata: FileManagerGroupMetadata
      children: WindowTreeLeafSource<T>[]
      visibleChildren: WindowTreeLeafSource<T>[]
      expanded: boolean
      level: 1
    }

export type VisibleWindowTreeItem<T> =
  | { kind: 'window'; source: WindowTreeLeafSource<T>; level: 1 | 2; parentGroupKey: string | null; parentRowId: string | null; expanded?: boolean }
  | { kind: 'file-manager-group'; projection: Extract<WindowTreeProjection<T>, { kind: 'file-manager-group' }> }

function compareSources<T>(left: WindowTreeLeafSource<T>, right: WindowTreeLeafSource<T>): number {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
  return left.appName.localeCompare(right.appName, undefined, { sensitivity: 'base' })
    || left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })
    || left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
    || left.id.localeCompare(right.id, undefined, { sensitivity: 'base' })
}

/**
 * Build the fixed two-level product tree. Ordinary applications use a real
 * root → real child family. Finder/Explorer alone use a virtual parent → real
 * roots and deliberately omit a third level.
 */
export function projectWindowTree<T>(
  leaves: readonly WindowTreeLeafSource<T>[],
  groupMetadata: readonly FileManagerGroupMetadata[],
  expandedGroupKeys: ReadonlySet<string>,
  searchQuery: string
): WindowTreeProjection<T>[] {
  const keyword = normalizeWindowText(searchQuery)
  const ordinary: WindowTreeProjection<T>[] = []
  const groups = new Map<string, { metadata: FileManagerGroupMetadata; children: WindowTreeLeafSource<T>[] }>()

  for (const metadata of groupMetadata) groups.set(metadata.groupKey, { metadata, children: [] })
  for (const source of [...leaves].sort(compareSources)) {
    const groupKey = fileManagerGroupKey(source.platform, source.appId)
    if (!groupKey) {
      const children = source.children || []
      const rootMatches = !keyword || normalizeWindowText(source.searchText).includes(keyword)
      const matchingChildren = keyword
        ? children.filter((child) => normalizeWindowText(child.searchText).includes(keyword))
        : children
      if (keyword && !rootMatches && !matchingChildren.length) continue
      const expanded = Boolean(children.length && (keyword || (source.familyKey && expandedGroupKeys.has(source.familyKey))))
      ordinary.push({
        kind: 'window-family',
        source,
        children,
        visibleChildren: expanded ? (rootMatches ? children : matchingChildren) : [],
        expanded,
        level: 1
      })
      continue
    }
    const group = groups.get(groupKey) || {
      metadata: {
        groupKey,
        platform: source.platform,
        appId: source.appId,
        appName: source.appName,
        displayName: source.appName || '文件管理器',
        pinned: false,
        searchText: `${source.appName} ${source.appId}`
      },
      children: []
    }
    group.children.push(source)
    groups.set(groupKey, group)
  }

  const grouped: WindowTreeProjection<T>[] = []
  for (const { metadata, children } of groups.values()) {
    const groupMatches = !keyword || normalizeWindowText(metadata.searchText).includes(keyword)
    const matchingChildren = keyword
      ? children.filter((source) => normalizeWindowText(source.searchText).includes(keyword))
      : children
    if (keyword && !groupMatches && !matchingChildren.length) continue
    const expanded = Boolean(keyword || expandedGroupKeys.has(metadata.groupKey))
    grouped.push({
      kind: 'file-manager-group',
      groupKey: metadata.groupKey,
      metadata,
      children,
      visibleChildren: expanded ? (groupMatches ? children : matchingChildren) : [],
      expanded,
      level: 1
    })
  }

  return [...ordinary, ...grouped].sort((left, right) => {
    const leftPinned = left.kind === 'window-family' ? left.source.pinned : left.metadata.pinned
    const rightPinned = right.kind === 'window-family' ? right.source.pinned : right.metadata.pinned
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1
    const leftApp = left.kind === 'window-family' ? left.source.appName : left.metadata.appName
    const rightApp = right.kind === 'window-family' ? right.source.appName : right.metadata.appName
    const leftName = left.kind === 'window-family' ? left.source.displayName : left.metadata.displayName
    const rightName = right.kind === 'window-family' ? right.source.displayName : right.metadata.displayName
    return leftApp.localeCompare(rightApp, undefined, { sensitivity: 'base' })
      || leftName.localeCompare(rightName, undefined, { sensitivity: 'base' })
  })
}

/** The only flattening rule consumed by the page-facing Runtime list. */
export function flattenWindowTree<T>(projection: readonly WindowTreeProjection<T>[]): VisibleWindowTreeItem<T>[] {
  return projection.flatMap((item): VisibleWindowTreeItem<T>[] => item.kind === 'window-family'
    ? [
        { kind: 'window', source: item.source, level: 1, parentGroupKey: null, parentRowId: null, expanded: item.expanded },
        ...item.visibleChildren.map((source): VisibleWindowTreeItem<T> => ({
          kind: 'window',
          source,
          level: 2,
          parentGroupKey: null,
          parentRowId: item.source.id
        }))
      ]
    : [
        { kind: 'file-manager-group', projection: item },
        ...item.visibleChildren.map((source): VisibleWindowTreeItem<T> => ({
          kind: 'window',
          source,
          level: 2,
          parentGroupKey: item.groupKey,
          parentRowId: fileManagerGroupRowId(item.groupKey)
        }))
      ])
}

/**
 * Build the complete page-facing window tree. Runtime supplies state and owns
 * side effects; row identity, filtering and hierarchy stay centralized here.
 */
export function buildWindowTreeRows(options: BuildWindowTreeRowsOptions): WindowRow[] {
  const targetById = new Map(options.targets.map((target) => [target.id, target]))
  const groupTargetByKey = new Map(options.targets.flatMap((target) => target.scope === 'file-manager-group' && target.groupKey
    ? [[target.groupKey, target] as const]
    : []))
  const slotNumbers = (targetId: string) => windowSlotNumbersForTarget(targetId, options.slots, options.currentPlatform)
  const isRetainedTarget = (target: WindowTarget) => target.favorite || target.pinned || slotNumbers(target.id).length > 0
  const makeLeafRow = (
    target: WindowTarget | null,
    live: LiveWindow | null,
    input: { ambiguous?: boolean; id?: string; candidate?: boolean } = {}
  ): WindowRow => {
    const candidate = input.candidate === true
    const id = input.id || (target ? targetWindowRowId(target.id) : liveWindowRowId(live?.instanceId || ''))
    const title = live?.title || target?.lastKnownTitle || ''
    const appName = live?.appName || target?.appName || ''
    return {
      id,
      live,
      target,
      displayName: candidate ? (title || appName || '未命名候选窗口') : (target?.alias || title || appName || '未命名窗口'),
      appName,
      title,
      favorite: candidate ? false : Boolean(target?.favorite),
      pinned: candidate ? false : Boolean(target?.pinned),
      slotNumbers: candidate || !target ? [] : slotNumbers(target.id),
      focused: id === options.focusedRowId,
      selected: !candidate && options.selectedRowIds.includes(id),
      unavailable: Boolean(target && !live),
      cached: Boolean(live && options.listLoaded && !options.freshInstanceIds.has(live.instanceId)),
      ambiguous: input.ambiguous === true,
      candidate,
      kind: 'window',
      treeLevel: 1,
      parentGroupKey: null,
      parentRowId: null,
      groupKey: null,
      expansionKey: null,
      rootLive: live,
      expandable: false,
      expanded: false,
      childCount: 0,
      groupLiveInstanceIds: []
    }
  }
  const rowSearchText = (row: WindowRow) => [
    row.displayName,
    row.title,
    row.appName,
    ...(row.target?.alternateAliases || []),
    ...(row.live && fileManagerGroupKey(row.live.platform, row.live.appId) ? row.live.searchTitles || [] : [])
  ].join(' ')
  const familyByRootId = new Map((options.windowFamilies || []).map((family) => [family.root.instanceId, family]))
  const childRowsFor = (row: WindowRow): WindowRow[] => {
    const root = row.live
    if (!root || row.candidate || fileManagerGroupKey(root.platform, root.appId)) return []
    const family = familyByRootId.get(root.instanceId)
    if (!family) return []
    return family.children.map((child): WindowRow => ({
      id: childWindowRowId(root.instanceId, child.instanceId),
      live: child,
      rootLive: root,
      target: null,
      displayName: child.title || child.appName || '未命名子窗口',
      appName: child.appName,
      title: child.title,
      favorite: false,
      pinned: false,
      slotNumbers: [],
      focused: childWindowRowId(root.instanceId, child.instanceId) === options.focusedRowId,
      selected: false,
      unavailable: false,
      cached: options.listLoaded && !options.freshMemberInstanceIds?.has(child.instanceId),
      ambiguous: false,
      candidate: false,
      kind: 'child-window',
      treeLevel: 2,
      parentGroupKey: null,
      parentRowId: row.id,
      groupKey: null,
      expansionKey: null,
      expandable: false,
      expanded: false,
      childCount: 0,
      groupLiveInstanceIds: []
    }))
  }

  const candidateMode = Boolean(options.rebind.targetId)
  let baseRows: WindowRow[]
  if (candidateMode) {
    const target = targetById.get(options.rebind.targetId!) || null
    const candidateIds = new Set(options.rebind.candidateInstanceIds)
    baseRows = options.liveWindows
      .filter((live) => candidateIds.has(live.instanceId))
      .map((live) => makeLeafRow(target, live, {
        id: candidateWindowRowId(live.instanceId),
        candidate: true
      }))
      .sort(compareWindowRowsByApplication)
  } else {
    const retainedTargets = options.targets.filter((target) => target.scope === 'instance'
      && (!options.currentPlatform || target.platform === options.currentPlatform)
      && isRetainedTarget(target))
    const usedLiveIds = new Set<WindowInstanceId>()
    const savedRows = retainedTargets.map((target) => {
      const resolved = resolveLiveWindowsForTarget(target, options.liveWindows)
      if (resolved.live) usedLiveIds.add(resolved.live.instanceId)
      return makeLeafRow(target, resolved.live, { ambiguous: resolved.candidates.length > 1 })
    })
    const liveRows = options.liveWindows
      .filter((live) => !usedLiveIds.has(live.instanceId))
      .map((live) => makeLeafRow(null, live))
    baseRows = [...savedRows, ...liveRows].sort(compareWindowRowsByApplication)
  }

  const metadataByKey = new Map<string, FileManagerGroupMetadata>()
  if (!candidateMode) {
    for (const target of options.targets) {
      if (target.scope !== 'file-manager-group' || !target.groupKey
        || (options.currentPlatform && target.platform !== options.currentPlatform)
        || !isRetainedTarget(target)) continue
      metadataByKey.set(target.groupKey, {
        groupKey: target.groupKey,
        platform: target.platform,
        appId: target.appId,
        appName: target.appName,
        displayName: target.alias,
        pinned: target.pinned,
        searchText: [target.alias, target.appName, target.appId, ...target.alternateAliases].join(' ')
      })
    }
  }

  const sourceForRow = (row: WindowRow): WindowTreeLeafSource<WindowRow> => ({
    row,
    id: row.id,
    platform: row.live?.platform || row.target!.platform,
    appId: row.live?.appId || row.target!.appId,
    appName: row.appName,
    displayName: row.displayName,
    title: row.title,
    pinned: row.pinned,
    searchText: rowSearchText(row)
  })
  const leaves: WindowTreeLeafSource<WindowRow>[] = baseRows.map((row) => {
    const source = sourceForRow(row)
    const children = childRowsFor(row).map(sourceForRow)
    return {
      ...source,
      familyKey: row.live ? windowFamilyExpansionKey(row.live.instanceId) : null,
      children
    }
  })
  const forcedExpanded = new Set(options.expandedGroupKeys)
  if (candidateMode) {
    for (const leaf of leaves) {
      const groupKey = fileManagerGroupKey(leaf.platform, leaf.appId)
      if (groupKey) forcedExpanded.add(groupKey)
    }
  }
  const projection = projectWindowTree(
    leaves,
    [...metadataByKey.values()],
    forcedExpanded,
    candidateMode ? '' : options.searchQuery
  )

  return flattenWindowTree(projection).map((item): WindowRow => {
    if (item.kind === 'window') {
      const children = item.level === 1 ? item.source.children || [] : []
      return {
        ...item.source.row,
        // Child rows already carry their semantic kind; hierarchy must not
        // reconstruct product identity from presentation depth.
        kind: item.source.row.kind,
        treeLevel: item.level,
        parentGroupKey: item.parentGroupKey,
        parentRowId: item.parentRowId,
        groupKey: item.parentGroupKey,
        expansionKey: item.level === 1 ? item.source.familyKey || null : null,
        expandable: item.level === 1 && children.length > 0,
        expanded: item.level === 1 ? item.expanded === true : false,
        childCount: item.level === 1 ? children.length : 0
      }
    }
    const group = item.projection
    const target = groupTargetByKey.get(group.groupKey) || null
    const children = group.children.map((source) => source.row)
    const liveChildren = children.flatMap((row) => row.live ? [row.live] : [])
    const preferred = chooseFileManagerGroupLanding(liveChildren, {
      lastActiveInstanceId: target?.lastActiveInstanceId,
      recentInstanceId: options.recentFileManagerInstanceIds.get(group.groupKey),
      orderedInstanceIds: liveChildren.map((live) => live.instanceId)
    })
    const id = fileManagerGroupRowId(group.groupKey)
    return {
      id,
      live: null,
      target: candidateMode ? null : target,
      displayName: candidateMode
        ? (group.metadata.appName || '文件管理器候选')
        : (target?.alias || group.metadata.displayName || group.metadata.appName || '文件管理器'),
      appName: group.metadata.appName,
      title: preferred?.title || target?.lastKnownTitle || '',
      favorite: candidateMode ? false : Boolean(target?.favorite),
      pinned: candidateMode ? false : Boolean(target?.pinned),
      slotNumbers: candidateMode || !target ? [] : slotNumbers(target.id),
      focused: id === options.focusedRowId,
      selected: false,
      unavailable: !liveChildren.length,
      cached: Boolean(liveChildren.length && liveChildren.every((live) => !options.freshInstanceIds.has(live.instanceId))),
      ambiguous: false,
      candidate: candidateMode,
      kind: 'file-manager-group',
      treeLevel: 1,
      parentGroupKey: null,
      parentRowId: null,
      groupKey: group.groupKey,
      expansionKey: group.groupKey,
      rootLive: null,
      expandable: true,
      expanded: group.expanded,
      childCount: children.length,
      groupLiveInstanceIds: liveChildren.map((live) => live.instanceId)
    }
  })
}

export function resolveWindowTreeActionTargets<T extends Pick<WindowRow, 'id' | 'kind'>>(
  rows: readonly T[],
  input: { focusedId: string | null; selectedIds: readonly string[]; explicitId?: string | null }
): { mode: WindowActionsMode; context: Exclude<WindowActionsContext, 'slot'>; targets: T[] } {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const primaryId = input.explicitId || input.focusedId
  const primary = primaryId ? byId.get(primaryId) || null : null
  if (primary?.kind === 'file-manager-group') {
    return { mode: 'single', context: 'file-manager-group', targets: [primary] }
  }
  if (primary?.kind === 'child-window') {
    return { mode: 'single', context: 'child-window', targets: [primary] }
  }
  const resolved = resolveDrawerTargets(input)
  const targets = resolved.targetIds.flatMap((id) => {
    const row = byId.get(id)
    return row?.kind === 'window' ? [row] : []
  })
  return {
    mode: resolved.mode,
    context: windowActionsContextFor(targets[0]?.kind || 'window', resolved.mode),
    targets
  }
}

export interface WindowTreeNavigationResult {
  handled: boolean
  focusedId: string | null
  groupKey: string | null
  expanded: boolean | null
}

/** Resolve ArrowLeft/ArrowRight without mutating Runtime state. */
export function resolveWindowTreeNavigation(
  rows: readonly Pick<WindowRow, 'id' | 'kind' | 'groupKey' | 'parentGroupKey' | 'parentRowId' | 'expansionKey' | 'expandable' | 'expanded'>[],
  focusedId: string | null,
  direction: 'expand' | 'collapse'
): WindowTreeNavigationResult {
  const row = rows.find((item) => item.id === focusedId) || null
  if (!row) return { handled: false, focusedId, groupKey: null, expanded: null }
  if (direction === 'collapse') {
    if (row.parentRowId) {
      return { handled: true, focusedId: row.parentRowId, groupKey: null, expanded: null }
    }
    if (row.expandable && row.expansionKey && row.expanded) {
      return { handled: true, focusedId: row.id, groupKey: row.expansionKey, expanded: false }
    }
    return { handled: false, focusedId, groupKey: null, expanded: null }
  }
  if (!row.expandable || !row.expansionKey) {
    return { handled: false, focusedId, groupKey: null, expanded: null }
  }
  if (!row.expanded) return { handled: true, focusedId: row.id, groupKey: row.expansionKey, expanded: true }
  const index = rows.findIndex((item) => item.id === row.id)
  const child = rows.slice(index + 1).find((item) => item.parentRowId === row.id)
  return child
    ? { handled: true, focusedId: child.id, groupKey: null, expanded: null }
    : { handled: false, focusedId, groupKey: null, expanded: null }
}

export function toggleWindowTreeSelection(
  rows: readonly Pick<WindowRow, 'id' | 'kind' | 'groupKey' | 'parentGroupKey' | 'parentRowId'>[],
  input: { focusedId: string | null; selectedIds: readonly string[]; advance?: boolean }
): { focusedId: string | null; selectedIds: string[]; virtualParentBlocked: boolean } {
  const focused = rows.find((row) => row.id === input.focusedId) || null
  const selectableRows = rows.filter((row) => row.kind === 'window')
  const selectableIds = new Set(selectableRows.map((row) => row.id))
  const selectedIds = input.selectedIds.filter((id) => selectableIds.has(id))
  if (focused?.kind === 'file-manager-group') {
    const index = rows.findIndex((row) => row.id === focused.id)
    const child = input.advance === false
      ? null
      : rows.slice(index + 1).find((row) => row.kind === 'window' && row.parentGroupKey === focused.groupKey)
    return { focusedId: child?.id || focused.id, selectedIds, virtualParentBlocked: true }
  }
  if (focused?.kind === 'child-window') {
    return { focusedId: focused.id, selectedIds, virtualParentBlocked: true }
  }
  const next = toggleIdWithAdvance({
    rows: selectableRows,
    focusedId: input.focusedId,
    selectedIds,
    advance: input.advance
  })
  return { ...next, virtualParentBlocked: false }
}

export function resolveVisibleWindowTreeFocus(
  previous: { id: string; parentGroupKey: string | null; parentRowId?: string | null } | null,
  visibleRows: readonly { id: string }[]
): string | null {
  if (previous && visibleRows.some((row) => row.id === previous.id)) return previous.id
  if (previous?.parentRowId && visibleRows.some((row) => row.id === previous.parentRowId)) return previous.parentRowId
  if (previous?.parentGroupKey) {
    const parentId = fileManagerGroupRowId(previous.parentGroupKey)
    if (visibleRows.some((row) => row.id === parentId)) return parentId
  }
  return visibleRows[0]?.id || null
}

/** Shared landing policy for a virtual Finder/Explorer parent. */
export function chooseFileManagerGroupLanding(
  windows: readonly LiveWindow[],
  options: {
    lastActiveInstanceId?: string | null
    recentInstanceId?: string | null
    orderedInstanceIds?: readonly string[]
  } = {}
): LiveWindow | null {
  const byId = new Map(windows.map((window) => [window.instanceId, window]))
  const ordered = options.orderedInstanceIds
    ?.map((id) => byId.get(id) || null)
    .find((window): window is LiveWindow => Boolean(window))
  return windows.find((window) => window.focused)
    || (options.lastActiveInstanceId ? byId.get(options.lastActiveInstanceId) : null)
    || (options.recentInstanceId ? byId.get(options.recentInstanceId) : null)
    || ordered
    || [...windows].sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
      || left.instanceId.localeCompare(right.instanceId))[0]
    || null
}

/**
 * Adopt a bridge-proven root identity for each logical target independently.
 *
 * A native family is projection evidence, not authority to merge persisted
 * user intent. Multiple legacy targets may resolve to the same current root;
 * they remain distinct so aliases, favorites and slot assignments are never
 * rewritten by a refresh. Users can repair an ambiguous legacy assignment
 * explicitly, one slot at a time.
 */
export function reconcileWindowTargetsWithFamilies(
  targets: readonly WindowTarget[],
  slots: readonly WindowSlot[],
  windows: readonly LiveWindow[],
  now = Date.now()
): { targets: WindowTarget[]; slots: WindowSlot[]; changed: boolean } {
  let changed = false
  const adoptionByTargetId = new Map<string, LiveWindow>()
  const adoptionTargetIdsByRoot = new Map<string, string[]>()
  for (const target of targets) {
    if (target.scope !== 'instance') continue
    const live = windows.find((candidate) => {
      if (!windowTargetAppMatches(target, candidate)) return false
      if (target.lastInstanceId) return candidate.memberInstanceIds?.includes(target.lastInstanceId) === true
      return Boolean(target.lastNativeRef && candidate.memberNativeRefs?.includes(target.lastNativeRef))
    })
    if (!live) continue
    adoptionByTargetId.set(target.id, live)
    adoptionTargetIdsByRoot.set(live.instanceId, [...(adoptionTargetIdsByRoot.get(live.instanceId) || []), target.id])
  }
  const nextTargets = targets.map((target) => {
    if (target.scope !== 'instance') return { ...target, alternateAliases: [...target.alternateAliases] }
    const exact = windows.find((candidate) => targetMatchesLiveWindow(target, candidate))
    const proposed = adoptionByTargetId.get(target.id) || null
    // Projection evidence may migrate one legacy member target to its proven
    // root, but two historical targets converging on the same root are a user
    // decision. Preserve both identities and let explicit per-slot recovery
    // choose a destination; never merge or select a survivor here.
    const live = exact || (proposed && adoptionTargetIdsByRoot.get(proposed.instanceId)?.length === 1 ? proposed : null)
    if (!live) return { ...target, alternateAliases: [...target.alternateAliases] }
    if (target.lastInstanceId === live.instanceId && target.lastNativeRef === live.nativeRef
      && target.appId === live.appId && target.appName === live.appName) {
      return { ...target, alternateAliases: [...target.alternateAliases] }
    }
    changed = true
    return {
      ...target,
      appId: live.appId,
      appName: live.appName,
      lastKnownTitle: live.title,
      lastInstanceId: live.instanceId,
      lastNativeRef: live.nativeRef,
      updatedAt: Math.max(target.updatedAt, now),
      alternateAliases: [...target.alternateAliases]
    }
  })
  const nextSlots = slots.map((slot) => ({
    ...slot,
    targetIdByPlatform: { ...slot.targetIdByPlatform }
  }))
  return { targets: nextTargets, slots: nextSlots, changed }
}
