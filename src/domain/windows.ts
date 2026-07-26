export type WindowPlatform = 'darwin' | 'win32'

export interface LiveWindow {
  id: string
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
  titleLocator: string
  lastNativeRef: string | null
  favorite: boolean
  createdAt: number
  updatedAt: number
}

export interface WindowSlot {
  slot: number
  targetIdByPlatform: Partial<Record<WindowPlatform, string>>
}

export const WINDOW_SLOT_COUNT = 10

/** Exact normalized titles that are host/IME chrome, not jump targets. */
const HOST_SHELL_TITLES = new Set([
  'program manager',
  'default ime',
  'msctfime ui',
  'gdi+ window',
  'olemainthreadwndname',
  'cicerouiwndframe',
  'cicero ui wnd frame'
])

export function normalizeWindowText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function liveWindowIdentity(window: Pick<LiveWindow, 'platform' | 'nativeRef'>): string {
  return `${window.platform}:${window.nativeRef}`
}

export function targetMatchesLiveWindow(target: Pick<WindowTarget, 'platform' | 'appId' | 'appName' | 'titleLocator'>, window: Pick<LiveWindow, 'platform' | 'appId' | 'appName' | 'title'>): boolean {
  if (target.platform !== window.platform) return false
  const targetApp = normalizeWindowText(target.appId || target.appName)
  const liveApp = normalizeWindowText(window.appId || window.appName)
  const targetTitle = normalizeWindowText(target.titleLocator)
  return Boolean(targetApp && targetTitle && targetApp === liveApp && targetTitle === normalizeWindowText(window.title))
}

export function isChromiumFamilyApp(window: Pick<LiveWindow, 'appId' | 'appName'>): boolean {
  const text = normalizeWindowText(`${window.appId} ${window.appName}`)
  return /(?:^|[^a-z0-9.])(?:microsoft edge|google chrome|chromium|brave browser|brave|vivaldi|opera|arc)(?:[^a-z0-9.]|$)/.test(` ${text} `)
    || text.includes('com.microsoft.edgemac')
    || text.includes('com.google.chrome')
    || text.includes('com.brave.browser')
}

/** Jumpable live windows exclude empty titles, host chrome, and Chromium AX shells titled exactly "Window". */
export function isJumpableLiveWindow(window: Pick<LiveWindow, 'appId' | 'appName' | 'title'>): boolean {
  const title = normalizeWindowText(window.title)
  if (!title) return false
  if (HOST_SHELL_TITLES.has(title)) return false
  // Only Chromium uses the AX placeholder "Window"; do not drop title==appName (real New Tab / app-named windows).
  if (title === 'window' && isChromiumFamilyApp(window)) return false
  return true
}

export function filterJumpableLiveWindows<T extends Pick<LiveWindow, 'appId' | 'appName' | 'title'>>(windows: readonly T[]): T[] {
  return windows.filter((window) => isJumpableLiveWindow(window))
}

export function createWindowSlots(): WindowSlot[] {
  return Array.from({ length: WINDOW_SLOT_COUNT }, (_, index) => ({
    slot: index + 1,
    targetIdByPlatform: {}
  }))
}
