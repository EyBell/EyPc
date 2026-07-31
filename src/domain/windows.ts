export type WindowPlatform = 'darwin' | 'win32'
export type WindowInstanceId = string
export type WindowTargetScope = 'instance' | 'file-manager-group'
export type WindowRelationship = 'root' | 'child'
export type WindowRelationEvidence = 'root-self' | 'win32-root-owner' | 'macos-ax-top-level'

export interface LiveWindow {
  id: string
  /** Opaque identity for one currently existing native window instance. */
  instanceId: WindowInstanceId
  platform: WindowPlatform
  nativeRef: string
  appId: string
  appName: string
  pid: number
  title: string
  minimized: boolean
  focused: boolean
  /** Session-only native-family relationship. Persisted targets always point at the root. */
  relationship?: WindowRelationship
  rootInstanceId?: WindowInstanceId
  rootNativeRef?: string
  relationEvidence?: WindowRelationEvidence
  userVisible?: boolean
  canActivate?: boolean
  canClose?: boolean
  /** Native observations proven to belong to this root window. Session-only. */
  memberInstanceIds?: WindowInstanceId[]
  memberNativeRefs?: string[]
  /** Current native titles used only for search and recognition. */
  searchTitles?: string[]
}

/** Raw bridge evidence. It is never projected directly into Runtime rows. */
export interface NativeWindowObservation extends LiveWindow {
  /** Bridge-only root-process evidence; normalized away before Runtime projection. */
  rootPid?: number
}

/** One independently operable main window plus its proven, session-only native children. */
export interface WindowFamily {
  root: LiveWindow
  children: LiveWindow[]
}

export type WindowActivationRequest =
  | { mode: 'root-current'; root: LiveWindow }
  | { mode: 'member-exact'; root: LiveWindow; member: LiveWindow }

export interface WindowTarget {
  id: string
  alias: string
  scope: WindowTargetScope
  platform: WindowPlatform
  appId: string
  appName: string
  /** Presentation/search metadata only; never participates in identity matching. */
  lastKnownTitle: string
  /** Last verified native-window instance. Null means explicit rebind is required. */
  lastInstanceId: WindowInstanceId | null
  lastNativeRef: string | null
  /** Stable application aggregate identity; set only for Finder/Explorer virtual parents. */
  groupKey: string | null
  /** Preferred landing window for a file-manager group; never becomes group identity. */
  lastActiveInstanceId: WindowInstanceId | null
  /** Lossless legacy-merge aliases used only for search. */
  alternateAliases: string[]
  favorite: boolean
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export interface WindowSlot {
  slot: number
  targetIdByPlatform: Partial<Record<WindowPlatform, string>>
}

export const WINDOW_SLOT_COUNT = 10

export function normalizeWindowText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function compareWindowRowsByApplication<T extends { pinned: boolean; appName: string; displayName: string; title: string; id: string }>(left: T, right: T): number {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
  return left.appName.localeCompare(right.appName, undefined, { sensitivity: 'base' })
    || left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })
    || left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
    || left.id.localeCompare(right.id, undefined, { sensitivity: 'base' })
}

export function liveWindowIdentity(window: Pick<LiveWindow, 'instanceId'>): WindowInstanceId {
  return window.instanceId
}

export function targetMatchesLiveWindow(
  target: Pick<WindowTarget, 'scope' | 'platform' | 'appId' | 'appName' | 'lastInstanceId' | 'lastNativeRef'>,
  window: Pick<LiveWindow, 'platform' | 'appId' | 'appName' | 'instanceId' | 'nativeRef' | 'memberInstanceIds' | 'memberNativeRefs'>
): boolean {
  if (target.scope !== 'instance') return false
  if (!windowTargetAppMatches(target, window)) return false
  if (target.lastInstanceId) {
    return target.lastInstanceId === window.instanceId
      || Boolean(window.memberInstanceIds?.includes(target.lastInstanceId))
  }
  // Legacy migration only: the old native reference may be adopted once after
  // the bridge has revalidated its current owner/application.
  return Boolean(target.lastNativeRef && (
    target.lastNativeRef === window.nativeRef
    || window.memberNativeRefs?.includes(target.lastNativeRef)
  ))
}

export function windowTargetAppMatches(
  target: Pick<WindowTarget, 'platform' | 'appId' | 'appName'>,
  window: Pick<LiveWindow, 'platform' | 'appId' | 'appName'>
): boolean {
  if (target.platform !== window.platform) return false
  const targetApp = normalizeWindowText(target.appId || target.appName)
  const liveApp = normalizeWindowText(window.appId || window.appName)
  return Boolean(targetApp && targetApp === liveApp)
}

export interface WindowTargetResolution {
  live: LiveWindow | null
  candidates: LiveWindow[]
}

/** Resolve one logical target without title inference or sole-candidate shortcuts. */
export function resolveLiveWindowsForTarget(
  target: WindowTarget,
  windows: readonly LiveWindow[],
  options: {
    freshOnly?: boolean
    freshInstanceIds?: ReadonlySet<WindowInstanceId>
    inventoryCompleteness?: 'complete' | 'partial' | null
  } = {}
): WindowTargetResolution {
  if (target.scope !== 'instance') return { live: null, candidates: [] }
  const samePlatform = windows.filter((live) => live.platform === target.platform
    && (!options.freshOnly || options.freshInstanceIds?.has(live.instanceId)))
  const exact = samePlatform.find((live) => targetMatchesLiveWindow(target, live)) || null
  if (exact) return { live: exact, candidates: [exact] }
  if (options.freshOnly && options.inventoryCompleteness !== 'complete') return { live: null, candidates: [] }
  return {
    live: null,
    candidates: samePlatform.filter((live) => windowTargetAppMatches(target, live))
  }
}

/** The one persisted-slot lookup used by row projection and Runtime actions. */
export function windowSlotNumbersForTarget(
  targetId: string,
  slots: readonly WindowSlot[],
  platform: WindowPlatform | null
): number[] {
  return slots
    .filter((slot) => platform
      ? slot.targetIdByPlatform[platform] === targetId
      : Object.values(slot.targetIdByPlatform).includes(targetId))
    .map((slot) => slot.slot)
}

/** Keep one actionable row per opaque native instance; titles never affect membership. */
export function filterIdentifiedLiveWindows<T extends Pick<LiveWindow, 'instanceId'>>(windows: readonly T[]): T[] {
  const seen = new Set<WindowInstanceId>()
  return windows.filter((window) => {
    if (!window.instanceId || seen.has(window.instanceId)) return false
    seen.add(window.instanceId)
    return true
  })
}

function uniqueTexts(values: readonly unknown[]): string[] {
  return [...new Set(values.flatMap((value) => typeof value === 'string' && value.trim() ? [value.trim()] : []))]
}

function observationRootPid(observation: NativeWindowObservation, relationship: WindowRelationship): number {
  const rootPid = Math.trunc(Number(observation.rootPid))
  if (rootPid > 0) return rootPid
  return relationship === 'root' ? observation.pid : 0
}

/**
 * Build one family per proven native root. The bridge is authoritative for the
 * relationship evidence; this function is deliberately title-blind.
 */
export function coalesceNativeWindowFamilies(windows: readonly NativeWindowObservation[]): WindowFamily[] {
  const observationsByRoot = new Map<string, NativeWindowObservation[]>()
  for (const observation of windows) {
    const rootInstanceId = observation.rootInstanceId?.trim() || observation.instanceId.trim()
    const rootNativeRef = observation.rootNativeRef?.trim() || observation.nativeRef.trim()
    if (!rootInstanceId || !rootNativeRef || observation.userVisible === false || observation.canActivate === false) continue
    const relationship = observation.relationship || 'root'
    const rootPid = observationRootPid(observation, relationship)
    if (rootPid <= 0) continue
    const expectedChildEvidence: WindowRelationEvidence = observation.platform === 'win32' ? 'win32-root-owner' : 'macos-ax-top-level'
    if (relationship === 'root' && (rootPid !== observation.pid || rootInstanceId !== observation.instanceId || rootNativeRef !== observation.nativeRef || (observation.relationEvidence || 'root-self') !== 'root-self')) continue
    if (relationship === 'child' && (rootInstanceId === observation.instanceId || rootNativeRef === observation.nativeRef || observation.relationEvidence !== expectedChildEvidence)) continue
    const group = observationsByRoot.get(rootInstanceId) || []
    group.push({ ...observation, rootInstanceId, rootNativeRef, rootPid })
    observationsByRoot.set(rootInstanceId, group)
  }

  const families: WindowFamily[] = []
  for (const [rootInstanceId, observations] of observationsByRoot) {
    const rootObservation = observations.find((observation) => observation.instanceId === rootInstanceId
      && (observation.relationship || 'root') === 'root')
    // A child without an independently admitted root is not a product window.
    if (!rootObservation) continue
    const rootNativeRef = rootObservation.rootNativeRef?.trim() || rootObservation.nativeRef.trim()
    const rootPid = observationRootPid(rootObservation, 'root')
    const rootApp = normalizeWindowText(rootObservation.appId || rootObservation.appName)
    const familyObservations = observations.filter((observation) => observation.platform === rootObservation.platform
      && observationRootPid(observation, observation.relationship || 'root') === rootPid
      && normalizeWindowText(observation.appId || observation.appName) === rootApp)
    const children = filterIdentifiedLiveWindows(familyObservations
      .filter((observation) => observation.instanceId !== rootInstanceId
        && observation.relationship === 'child')
      .map((observation): LiveWindow => ({
        id: observation.instanceId,
        instanceId: observation.instanceId,
        platform: observation.platform,
        nativeRef: observation.nativeRef,
        appId: observation.appId,
        appName: observation.appName,
        pid: observation.pid,
        title: observation.title || observation.appName,
        minimized: observation.minimized,
        focused: observation.focused,
        relationship: 'child',
        rootInstanceId,
        rootNativeRef,
        relationEvidence: observation.relationEvidence,
        userVisible: true,
        canActivate: observation.canActivate !== false,
        canClose: observation.canClose === true,
        searchTitles: uniqueTexts([observation.title, ...(observation.searchTitles || [])])
      })))
      .sort((left, right) => Number(right.focused) - Number(left.focused)
        || left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
        || left.instanceId.localeCompare(right.instanceId))
    const memberInstanceIds = uniqueTexts([
      rootInstanceId,
      ...familyObservations.map((observation) => observation.instanceId)
    ])
    const memberNativeRefs = uniqueTexts([
      rootNativeRef,
      ...familyObservations.map((observation) => observation.nativeRef)
    ])
    const searchTitles = uniqueTexts(familyObservations.flatMap((observation) => [observation.title, ...(observation.searchTitles || [])]))
    const root: LiveWindow = {
      id: rootInstanceId,
      instanceId: rootInstanceId,
      platform: rootObservation.platform,
      nativeRef: rootNativeRef,
      appId: rootObservation.appId,
      appName: rootObservation.appName,
      pid: rootPid,
      title: rootObservation.title || rootObservation.appName,
      minimized: rootObservation.minimized,
      focused: familyObservations.some((observation) => observation.focused),
      relationship: 'root',
      rootInstanceId,
      rootNativeRef,
      relationEvidence: rootObservation.relationEvidence || 'root-self',
      userVisible: true,
      canActivate: true,
      canClose: rootObservation.canClose !== false,
      memberInstanceIds,
      memberNativeRefs,
      searchTitles
    }
    families.push({ root, children })
  }
  return families
}

export function windowFamilyRoots(families: readonly WindowFamily[]): LiveWindow[] {
  return families.map((family) => family.root)
}

/**
 * Merge a partial family inventory without treating an absent child as closed.
 * Positive fresh relationship evidence still prevents a former root/member
 * from being retained as a second standalone family.
 */
export function mergePartialWindowFamilyInventory(previous: readonly WindowFamily[], fresh: readonly WindowFamily[]): WindowFamily[] {
  const cloneFamily = (family: WindowFamily): WindowFamily => ({
    root: {
      ...family.root,
      memberInstanceIds: [...(family.root.memberInstanceIds || [])],
      memberNativeRefs: [...(family.root.memberNativeRefs || [])],
      searchTitles: [...(family.root.searchTitles || [])]
    },
    children: family.children.map((child) => ({ ...child, searchTitles: [...(child.searchTitles || [])] }))
  })
  const merged = fresh.map(cloneFamily)
  const evidence = (family: WindowFamily) => new Set([
    ...[family.root.instanceId, ...(family.root.memberInstanceIds || []), ...family.children.map((child) => child.instanceId)].map((value) => `id:${value}`),
    ...[family.root.nativeRef, ...(family.root.memberNativeRefs || []), ...family.children.map((child) => child.nativeRef)].map((value) => `ref:${value}`)
  ])

  for (const cached of previous) {
    const cachedEvidence = evidence(cached)
    const matchingIndex = merged.findIndex((candidate) => candidate.root.platform === cached.root.platform
      && normalizeWindowText(candidate.root.appId || candidate.root.appName) === normalizeWindowText(cached.root.appId || cached.root.appName)
      && [...evidence(candidate)].some((value) => cachedEvidence.has(value)))
    if (matchingIndex < 0) {
      merged.push(cloneFamily(cached))
      continue
    }
    const current = merged[matchingIndex]
    const currentChildIds = new Set(current.children.map((child) => child.instanceId))
    const retainedChildren = cached.children.filter((child) => child.instanceId !== current.root.instanceId && !currentChildIds.has(child.instanceId))
    const children = [...current.children, ...retainedChildren]
    merged[matchingIndex] = {
      root: {
        ...current.root,
        memberInstanceIds: uniqueTexts([
          ...(current.root.memberInstanceIds || []),
          ...children.map((child) => child.instanceId)
        ]),
        memberNativeRefs: uniqueTexts([
          ...(current.root.memberNativeRefs || []),
          ...children.map((child) => child.nativeRef)
        ]),
        searchTitles: uniqueTexts([
          ...(current.root.searchTitles || []),
          ...children.flatMap((child) => [child.title, ...(child.searchTitles || [])])
        ])
      },
      children
    }
  }
  return merged
}

export function createWindowSlots(): WindowSlot[] {
  return Array.from({ length: WINDOW_SLOT_COUNT }, (_, index) => ({
    slot: index + 1,
    targetIdByPlatform: {}
  }))
}
