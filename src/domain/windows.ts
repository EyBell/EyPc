export type WindowPlatform = 'darwin' | 'win32'
export type WindowInstanceId = string

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
}

export interface WindowTarget {
  id: string
  alias: string
  platform: WindowPlatform
  appId: string
  appName: string
  /** Presentation/search metadata only; never participates in identity matching. */
  lastKnownTitle: string
  /** Last verified native-window instance. Null means explicit rebind is required. */
  lastInstanceId: WindowInstanceId | null
  lastNativeRef: string | null
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
  target: Pick<WindowTarget, 'platform' | 'appId' | 'appName' | 'lastInstanceId' | 'lastNativeRef'>,
  window: Pick<LiveWindow, 'platform' | 'appId' | 'appName' | 'instanceId' | 'nativeRef'>
): boolean {
  if (!windowTargetAppMatches(target, window)) return false
  if (target.lastInstanceId) return target.lastInstanceId === window.instanceId
  // Legacy migration only: the old native reference may be adopted once after
  // the bridge has revalidated its current owner/application.
  return Boolean(target.lastNativeRef && target.lastNativeRef === window.nativeRef)
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

/** Keep one actionable row per opaque native instance; titles never affect membership. */
export function filterIdentifiedLiveWindows<T extends Pick<LiveWindow, 'instanceId'>>(windows: readonly T[]): T[] {
  const seen = new Set<WindowInstanceId>()
  return windows.filter((window) => {
    if (!window.instanceId || seen.has(window.instanceId)) return false
    seen.add(window.instanceId)
    return true
  })
}

export function createWindowSlots(): WindowSlot[] {
  return Array.from({ length: WINDOW_SLOT_COUNT }, (_, index) => ({
    slot: index + 1,
    targetIdByPlatform: {}
  }))
}
