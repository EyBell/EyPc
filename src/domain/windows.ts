export type WindowPlatform = 'darwin' | 'win32'
export type WindowInstanceId = string
export type WindowTargetScope = 'instance' | 'file-manager-group'

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
  /** Native observations proven to belong to this root window. Session-only. */
  memberInstanceIds?: WindowInstanceId[]
  memberNativeRefs?: string[]
  /** Current native titles used only for search and recognition. */
  searchTitles?: string[]
}

/** Raw bridge evidence. It is never projected directly into Runtime rows. */
export interface NativeWindowObservation extends LiveWindow {
  /** Bridge-only observation fields; normalized away before Runtime projection. */
  rootInstanceId?: WindowInstanceId
  rootNativeRef?: string
  rootPid?: number
}

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

/**
 * Collapse bridge observations to one row per proven native root. The bridge is
 * authoritative for root evidence; this function is deliberately title-blind.
 */
export function coalesceNativeWindowFamilies(windows: readonly NativeWindowObservation[]): LiveWindow[] {
  const families = new Map<string, LiveWindow>()
  for (const observation of windows) {
    const instanceId = observation.rootInstanceId?.trim() || observation.instanceId.trim()
    const nativeRef = observation.rootNativeRef?.trim() || observation.nativeRef.trim()
    const pid = observation.rootPid && observation.rootPid > 0 ? observation.rootPid : observation.pid
    if (!instanceId || !nativeRef) continue
    const memberInstanceIds = uniqueTexts([
      observation.instanceId,
      ...(observation.memberInstanceIds || [])
    ])
    const memberNativeRefs = uniqueTexts([
      observation.nativeRef,
      ...(observation.memberNativeRefs || [])
    ])
    const searchTitles = uniqueTexts([
      observation.title,
      ...(observation.searchTitles || [])
    ])
    const current: LiveWindow = {
      id: instanceId,
      instanceId,
      platform: observation.platform,
      nativeRef,
      appId: observation.appId,
      appName: observation.appName,
      pid,
      title: observation.title || observation.appName,
      minimized: observation.minimized,
      focused: observation.focused,
      memberInstanceIds,
      memberNativeRefs,
      searchTitles
    }
    const existing = families.get(instanceId)
    if (!existing) {
      families.set(instanceId, current)
      continue
    }
    const useObservation = current.focused && !existing.focused
    families.set(instanceId, {
      ...(useObservation ? current : existing),
      id: instanceId,
      instanceId,
      nativeRef,
      pid,
      minimized: existing.minimized && observation.minimized,
      focused: existing.focused || observation.focused,
      memberInstanceIds: uniqueTexts([...(existing.memberInstanceIds || []), ...memberInstanceIds]),
      memberNativeRefs: uniqueTexts([...(existing.memberNativeRefs || []), ...memberNativeRefs]),
      searchTitles: uniqueTexts([...(existing.searchTitles || []), ...searchTitles])
    })
  }
  return [...families.values()]
}

/**
 * Merge a partial root inventory without resurrecting an older standalone row
 * for a member that fresh native evidence has just attached to another root.
 */
export function mergePartialWindowFamilyInventory(previous: readonly LiveWindow[], fresh: readonly LiveWindow[]): LiveWindow[] {
  const merged = fresh.map((window) => ({
    ...window,
    memberInstanceIds: [...(window.memberInstanceIds || [])],
    memberNativeRefs: [...(window.memberNativeRefs || [])],
    searchTitles: [...(window.searchTitles || [])]
  }))
  const retained: LiveWindow[] = []
  const evidence = (window: LiveWindow) => new Set([
    ...[window.instanceId, ...(window.memberInstanceIds || [])].map((value) => `id:${value}`),
    ...[window.nativeRef, ...(window.memberNativeRefs || [])].map((value) => `ref:${value}`)
  ])

  for (const cached of previous) {
    const cachedEvidence = evidence(cached)
    const matchingIndex = merged.findIndex((candidate) => (
      candidate.platform === cached.platform
      && normalizeWindowText(candidate.appId || candidate.appName) === normalizeWindowText(cached.appId || cached.appName)
      && [...evidence(candidate)].some((value) => cachedEvidence.has(value))
    ))
    if (matchingIndex < 0) {
      retained.push(cached)
      continue
    }
    const current = merged[matchingIndex]
    merged[matchingIndex] = {
      ...current,
      memberInstanceIds: uniqueTexts([
        ...(current.memberInstanceIds || []),
        ...(cached.instanceId === current.instanceId ? [] : [cached.instanceId]),
        ...(cached.memberInstanceIds || [])
      ]),
      memberNativeRefs: uniqueTexts([
        ...(current.memberNativeRefs || []),
        ...(cached.nativeRef === current.nativeRef ? [] : [cached.nativeRef]),
        ...(cached.memberNativeRefs || [])
      ]),
      searchTitles: uniqueTexts([...(current.searchTitles || []), cached.title, ...(cached.searchTitles || [])])
    }
  }
  return [...merged, ...retained]
}

export function createWindowSlots(): WindowSlot[] {
  return Array.from({ length: WINDOW_SLOT_COUNT }, (_, index) => ({
    slot: index + 1,
    targetIdByPlatform: {}
  }))
}
