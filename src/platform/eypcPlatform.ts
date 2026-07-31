import { normalizeAppState } from '../domain/state'
import { normalizeMqttArchiveState } from '../domain/mqtt'
import type { AppState, FavoriteNode, KillRequest, KillResult, MqttArchiveState, MqttStorageStatus, PortProcess } from '../domain/types'
import type { LiveWindow, NativeWindowObservation, WindowActivationRequest, WindowPlatform } from '../domain/windows'
import type {
  CodexActivityDelta,
  CodexBridgeResult,
  CodexEnvironmentPlatform,
  CodexEnvironmentSnapshotV1,
  CodexHostSnapshot,
  CodexNewThreadRequest,
  CodexNewThreadResult,
  CodexProjectArchiveRequest,
  CodexProjectArchiveResult,
  CodexProjectRemoveRequest,
  CodexProjectRemoveResult,
  CodexThreadArchiveRequest,
  CodexThreadArchiveResult,
  CodexThreadOpenResult
} from '../domain/codex'
import type {
  CodexEnvironmentActionRunResult,
  CodexEnvironmentActionSessionProjection,
  CodexEnvironmentListResult
} from '../domain/codexEnvironment'

export type PickedFavoriteKind = Exclude<FavoriteNode['kind'], 'group'>
export type PickedFavorite = Pick<FavoriteNode, 'path' | 'name' | 'parentId' | 'tags' | 'color'> & { kind: PickedFavoriteKind }
export type MqttSecretMap = Record<string, string>
export type FileActionOutcome = 'success' | 'dispatched' | 'revealed-instead' | 'failed'
export type FileErrorCode = 'invalid-path' | 'not-found' | 'permission-denied' | 'no-handler' | 'timeout' | 'unsupported' | 'io-error'
export type FavoritePathStatus = 'available' | 'missing' | 'permission-denied' | 'offline' | 'invalid' | 'unknown'
export type WindowPermissionState = 'granted' | 'required' | 'unknown' | 'unsupported'
export const WINDOW_BRIDGE_REVISION = 'wj21-main-child-window-tree'
export type WindowActivationOutcome = 'activated' | 'not-found' | 'ambiguous' | 'permission-required' | 'focus-denied' | 'unsupported' | 'failed'
export type WindowActivationReasonCode = 'instance-mismatch' | 'member-mismatch' | 'identity-unavailable'
export type WindowOperationTraceStage = 'bridge' | 'target' | 'process' | 'restore' | 'foreground' | 'raise' | 'verify' | 'topmost'
export type WindowOperationTraceOutcome = 'ok' | 'skipped' | 'not-found' | 'ambiguous' | 'failed' | 'denied' | 'unsupported' | 'unavailable'
export type WindowOperationTraceDetail =
  | 'instance-match'
  | 'instance-mismatch'
  | 'identity-unavailable'
  | 'focus-state-mismatch'
  | 'root-family-match'
  | 'ax-cg-id-match'
  | 'ax-focused-root-window'
  | 'error'

/** A bounded, sanitized native-operation trace. It is returned only when a development renderer requests it. */
export interface WindowOperationTraceStep {
  stage: WindowOperationTraceStage
  outcome: WindowOperationTraceOutcome
  detail?: WindowOperationTraceDetail
}

export interface WindowOperationTrace {
  steps: WindowOperationTraceStep[]
}

export interface WindowActivationOptions {
  debugTrace?: boolean
}

export interface FileActionResult {
  outcome: FileActionOutcome
  errorCode?: FileErrorCode
  message?: string
  paths?: string[]
}

export interface SaveTextFileInput {
  suggestedName: string
  text: string
  mimeType?: string
}

export interface SaveTextFileResult {
  outcome: 'saved' | 'cancelled' | 'failed'
  errorCode?: FileErrorCode
  message?: string
}

export interface FileCapabilities {
  open: boolean
  reveal: boolean
  copyPath: boolean
  copyItems: boolean
  pickFiles: boolean
  pickFolders: boolean
  listDirectory: boolean
  inspectPaths: boolean
}

export interface FavoritePathInspection {
  path: string
  status: FavoritePathStatus
  kind: 'file' | 'folder' | 'other' | 'unknown'
  exists: boolean
  isSymbolicLink: boolean
  linkTargetKind?: 'file' | 'folder' | 'other' | 'missing' | 'unknown'
  size?: number
  modifiedAt?: number
  errorCode?: FileErrorCode
  error?: string
}

export interface WindowCapability {
  platform: WindowPlatform | 'unsupported'
  bridgeRevision?: string
  supported: boolean
  permission: WindowPermissionState
  canList: boolean
  canActivate: boolean
  canClose?: boolean
  /** Windows-only: keep a third-party top-level window above ordinary windows. */
  canAlwaysOnTop?: boolean
  reason?: string
}

export interface WindowListResult {
  capability: WindowCapability
  /** Raw native observations; Runtime must normalize these through the domain coalescer. */
  windows: NativeWindowObservation[]
  /** Whether this snapshot can authoritatively evict windows absent from the result. */
  completeness?: 'complete' | 'partial'
  message?: string
}

export type WindowCloseOutcome = 'closed' | 'terminated' | 'close-denied' | 'not-found' | 'ambiguous' | 'permission-required' | 'unsupported' | 'failed'

export interface WindowCloseResult {
  outcome: WindowCloseOutcome
  message?: string
}

export interface WindowActivationResult {
  outcome: WindowActivationOutcome
  /** Current bridge-verified identity, returned on success for legacy-state backfill. */
  instanceId?: string
  memberInstanceId?: string
  reasonCode?: WindowActivationReasonCode
  message?: string
  candidates?: LiveWindow[]
  trace?: WindowOperationTrace
}
const STORAGE_KEY = 'eypc/state/v1'
const MQTT_ARCHIVE_STORAGE_KEY = 'eypc/mqtt/archive/v1'
const MQTT_SECRETS_LOCAL_STORAGE_KEY = 'eypc/mqtt/secrets-local/v1'

export interface FavoriteDirectoryEntry {
  kind: Exclude<FavoriteNode['kind'], 'group'>
  name: string
  path: string
  size?: number
  modifiedAt?: number
  isSymbolicLink?: boolean
  linkTargetKind?: 'file' | 'folder' | 'other' | 'missing' | 'unknown'
}

export interface FavoriteDirectoryListResult {
  ok: boolean
  entries: FavoriteDirectoryEntry[]
  error?: string
  errorCode?: FileErrorCode
}

export interface CodexReadOptions {
  includeQuota?: boolean
  includeConfig?: boolean
  includeThreads?: boolean
}

export interface CodexFloatAction {
  actionId: string
  args: Record<string, unknown>
}

export interface CodexFloatWorkspaceDiagnostics {
  supported: boolean
  alwaysOnTop: boolean
  allWorkspaces: boolean
  visibleOnFullScreen: boolean
  checkedAt: number
  errorCode?: string
}

export interface EypcPlatformApi {
  storage: {
    getState(): AppState
    setState(state: AppState): boolean
    getMqttArchive(): MqttArchiveState
    setMqttArchive(archive: MqttArchiveState): boolean
    getMqttStorageStatus(): MqttStorageStatus
    getMqttSecrets(): MqttSecretMap
    setMqttSecrets(secrets: MqttSecretMap): boolean
  }
  ports: {
    scan(): Promise<PortProcess[]>
    kill(request: KillRequest): Promise<KillResult>
  }
  windows: {
    capabilities(): Promise<WindowCapability>
    list(): Promise<WindowListResult>
    activate(request: WindowActivationRequest, options?: WindowActivationOptions): Promise<WindowActivationResult>
    /** Sets a real Windows topmost z-order; unsupported on macOS instead of pretending to persist it. */
    alwaysOnTop?(window: LiveWindow, options?: WindowActivationOptions): Promise<WindowActivationResult>
    close?(window: LiveWindow): Promise<WindowCloseResult>
    terminate?(window: LiveWindow): Promise<WindowCloseResult>
    openPermissionSettings?(): Promise<boolean>
  }
  files: {
    capabilities?: FileCapabilities
    open(path: string): Promise<FileActionResult>
    reveal(path: string): Promise<FileActionResult>
    copyPath(path: string): Promise<FileActionResult>
    copyItems?(paths: string[]): Promise<FileActionResult>
    inspectPaths?(paths: string[]): Promise<FavoritePathInspection[]>
    pickFavorite?(): Promise<PickedFavorite | null>
    pickFavorites?(kind: PickedFavoriteKind): Promise<PickedFavorite[]>
    listDirectory(path: string): Promise<FavoriteDirectoryListResult>
    saveTextFile(input: SaveTextFileInput): Promise<SaveTextFileResult>
  }
  clipboard: {
    copyText(text: string): Promise<boolean>
  }
  codex: {
    /** Missing on older long-lived preload instances; the adapter normalizes that case to `legacy`. */
    taskStateRevision?: string
    inspectEnvironment(): Promise<CodexEnvironmentSnapshotV1>
    setLaunchPath?(path: string): Promise<CodexEnvironmentSnapshotV1>
    clearLaunchPath?(): Promise<CodexEnvironmentSnapshotV1>
    readSnapshot(options?: CodexReadOptions): Promise<CodexBridgeResult<CodexHostSnapshot>>
    readActivitySnapshot?(): Promise<CodexBridgeResult<CodexActivityDelta>>
    onActivityChanged?(listener: (delta: CodexActivityDelta) => void): () => void
    openThread(actionAlias: string): Promise<CodexThreadOpenResult>
    createThread?(request: CodexNewThreadRequest): Promise<CodexNewThreadResult>
    openBlank?(): Promise<CodexThreadOpenResult>
    archiveThread?(actionAlias: string, request: CodexThreadArchiveRequest): Promise<CodexThreadArchiveResult>
    archiveProject?(actionAlias: string, request: CodexProjectArchiveRequest): Promise<CodexProjectArchiveResult>
    removeProject?(actionAlias: string, request: CodexProjectRemoveRequest): Promise<CodexProjectRemoveResult>
    listProjectEnvironments?(targetAlias: string): Promise<CodexEnvironmentListResult> | CodexEnvironmentListResult
    runProjectAction?(request: {
      targetAlias: string
      environmentId: string
      actionId: string
      confirmToken?: string
      stopIfRunning?: boolean
    }): Promise<CodexEnvironmentActionRunResult>
    listActionSessions?(): Promise<CodexEnvironmentActionSessionProjection[]> | CodexEnvironmentActionSessionProjection[]
    stopActionSession?(request: {
      projectKey: string
      environmentId: string
      actionId: string
    }): Promise<CodexEnvironmentActionRunResult>
    close(): void
  }
  float: {
    sync(payload: { visible: boolean; snapshot?: unknown; position?: unknown; expandedSizes?: unknown }): boolean
    activate?(payload?: { command?: 'new-thread' }): boolean
    diagnostics?(): CodexFloatWorkspaceDiagnostics
    resetGeometry?(payload?: { position?: unknown; expandedSizes?: unknown }): boolean
    close(): void
    onAction(listener: (action: CodexFloatAction) => void): () => void
  }
  app: {
    hide(): Promise<boolean> | boolean
    show?(): boolean
    configureHotkey?(commandLabel: string): boolean
  }
  getEnterPayload(): { code?: string } | null
  clearEnterPayload(): void
  onEnterPayload?(listener: (payload: { code?: string } | null) => void): () => void
}

export function normalizeFileActionResult(value: unknown, failedErrorCode: FileErrorCode = 'io-error'): FileActionResult {
  if (value && typeof value === 'object' && 'outcome' in value && ['success', 'dispatched', 'revealed-instead', 'failed'].includes(String((value as { outcome?: unknown }).outcome))) {
    return value as FileActionResult
  }
  if (value === true) return { outcome: 'dispatched', message: 'legacy host reported dispatch only' }
  return { outcome: 'failed', errorCode: failedErrorCode }
}

function errorCodeFromUnknown(error: unknown): FileErrorCode {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : ''
  if (code === 'ENOENT') return 'not-found'
  if (code === 'EACCES' || code === 'EPERM') return 'permission-denied'
  if (code === 'ETIMEDOUT') return 'timeout'
  if (code === 'ENOTSUP' || code === 'ENOSYS') return 'unsupported'
  return 'io-error'
}

async function callFileAction(call: (() => Promise<unknown>) | undefined, unsupportedMessage: string): Promise<FileActionResult> {
  if (!call) return { outcome: 'failed', errorCode: 'unsupported', message: unsupportedMessage }
  try {
    return normalizeFileActionResult(await call())
  } catch (error) {
    return {
      outcome: 'failed',
      errorCode: errorCodeFromUnknown(error),
      message: error instanceof Error ? error.message : unsupportedMessage
    }
  }
}

function normalizeSaveTextFileResult(value: unknown): SaveTextFileResult {
  if (value && typeof value === 'object' && 'outcome' in value) {
    const outcome = String((value as { outcome?: unknown }).outcome)
    if (outcome === 'saved' || outcome === 'cancelled' || outcome === 'failed') return value as SaveTextFileResult
  }
  return { outcome: 'failed', errorCode: 'io-error', message: 'save text file failed' }
}

async function callSaveTextFile(call: (() => Promise<unknown>) | undefined): Promise<SaveTextFileResult> {
  if (!call) return { outcome: 'failed', errorCode: 'unsupported', message: 'save text file unavailable' }
  try {
    return normalizeSaveTextFileResult(await call())
  } catch (error) {
    return {
      outcome: 'failed',
      errorCode: errorCodeFromUnknown(error),
      message: error instanceof Error ? error.message : 'save text file failed'
    }
  }
}

function unknownInspection(path: string, errorCode: FileErrorCode = 'unsupported', error = 'path inspection unavailable'): FavoritePathInspection {
  return { path, status: 'unknown', kind: 'unknown', exists: false, isSymbolicLink: false, errorCode, error }
}

function inferLegacyHostPlatform(): CodexEnvironmentPlatform {
  const candidate = typeof window !== 'undefined'
    ? window.navigator as Navigator & { userAgentData?: { platform?: string } }
    : undefined
  const hint = [candidate?.userAgentData?.platform, candidate?.platform, candidate?.userAgent]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  if (/windows?|win32|win64/i.test(hint)) return 'windows'
  if (/macintosh|mac\s?os|macintel|darwin/i.test(hint)) return 'macos'
  return 'unsupported'
}

function legacyHostCodexEnvironment(): CodexEnvironmentSnapshotV1 {
  const platform = inferLegacyHostPlatform()
  return {
    version: 1,
    checking: false,
    platform,
    // The bridge capability is present, but CLI readiness stays unverified until
    // the first App Server round-trip succeeds.
    runtimeState: platform === 'unsupported' ? 'unsupported' : 'missing',
    runtimeSource: 'unknown',
    processState: 'unknown',
    configState: 'unknown',
    connectionState: 'not-checked',
    desktopBridgeState: 'not-checked',
    launchMode: 'legacy-fallback',
    manualLaunchPathState: 'unavailable',
    launchCandidates: [],
    statusFeedMode: 'connector-fallback',
    checkedAt: Date.now()
  }
}

function unsupportedCodexEnvironment(): CodexEnvironmentSnapshotV1 {
  return {
    version: 1,
    checking: false,
    platform: 'unsupported',
    runtimeState: 'unsupported',
    runtimeSource: 'unknown',
    processState: 'unknown',
    configState: 'unknown',
    connectionState: 'not-checked',
    desktopBridgeState: 'not-checked',
    launchMode: 'unknown',
    manualLaunchPathState: 'unavailable',
    launchCandidates: [],
    statusFeedMode: 'unavailable',
    checkedAt: Date.now()
  }
}

function unsupportedWindowCapability(reason = '当前宿主不支持窗口跳转'): WindowCapability {
  return {
    platform: 'unsupported',
    supported: false,
    permission: 'unsupported',
    canList: false,
    canActivate: false,
    canClose: false,
    reason
  }
}

function unsupportedWindowList(reason?: string): WindowListResult {
  return { capability: unsupportedWindowCapability(reason), windows: [], completeness: 'partial', ...(reason ? { message: reason } : {}) }
}

declare global {
  interface Window {
    eypcPlatform?: EypcPlatformApi
  }
}

const memory = {
  state: normalizeAppState(null),
  mqttSecrets: {} as MqttSecretMap,
  enterPayload: null as { code?: string } | null
}

function normalizeMqttSecrets(value: unknown): MqttSecretMap {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const candidate = source.version === 1 && source.secrets && typeof source.secrets === 'object'
    ? source.secrets as Record<string, unknown>
    : source
  return Object.fromEntries(
    Object.entries(candidate)
      .map(([key, secret]) => [key.trim(), secret] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0]) && typeof entry[1] === 'string' && entry[1].length > 0)
  )
}

function readFallbackState(): AppState {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return normalizeAppState(JSON.parse(raw))
    } catch {}
  }
  return memory.state
}

function readFallbackMqttArchive(): MqttArchiveState {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(MQTT_ARCHIVE_STORAGE_KEY)
      if (raw) return normalizeMqttArchiveState(JSON.parse(raw))
    } catch {}
  }
  return normalizeMqttArchiveState(null)
}

function readFallbackMqttSecrets(): MqttSecretMap {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(MQTT_SECRETS_LOCAL_STORAGE_KEY)
      if (raw) return normalizeMqttSecrets(JSON.parse(raw))
    } catch {}
  }
  return { ...memory.mqttSecrets }
}

function writeFallbackState(state: AppState): boolean {
  const normalized = normalizeAppState(state)
  memory.state = normalized
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
      return true
    } catch {}
  }
  return true
}

function writeFallbackMqttArchive(archive: MqttArchiveState): boolean {
  const normalized = normalizeMqttArchiveState(archive)
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(MQTT_ARCHIVE_STORAGE_KEY, JSON.stringify(normalized))
      return true
    } catch {}
  }
  return true
}

function fallbackMqttStorageStatus(): MqttStorageStatus {
  return {
    mode: 'browser-localStorage',
    sqliteAvailable: false,
    migratedLegacyArchive: false
  }
}

function writeFallbackMqttSecrets(secrets: MqttSecretMap): boolean {
  const normalized = normalizeMqttSecrets(secrets)
  memory.mqttSecrets = normalized
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(MQTT_SECRETS_LOCAL_STORAGE_KEY, JSON.stringify({ version: 1, secrets: normalized }))
      return true
    } catch {}
  }
  return true
}

async function scanViaDevApi(): Promise<PortProcess[]> {
  if (typeof fetch !== 'function') return []
  try {
    const response = await fetch('/__eypc__/ports/scan')
    if (!response.ok) return []
    const payload = await response.json() as { ports?: unknown }
    return Array.isArray(payload.ports) ? payload.ports.filter((item): item is PortProcess => {
      const source = item as Partial<PortProcess>
      return typeof source.id === 'string' && typeof source.pid === 'number' && typeof source.port === 'number' && typeof source.command === 'string'
    }) : []
  } catch {
    return []
  }
}

async function killViaDevApi(request: KillRequest): Promise<KillResult> {
  if (typeof fetch !== 'function') return { ok: false, ...request, error: 'dev kill api unavailable' }
  try {
    const response = await fetch('/__eypc__/ports/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    const payload = await response.json() as Partial<KillResult>
    return {
      ok: Boolean(response.ok && payload.ok),
      pid: Number(payload.pid ?? request.pid),
      port: Number(payload.port ?? request.port),
      force: Boolean(payload.force ?? request.force),
      error: typeof payload.error === 'string' ? payload.error : response.ok ? undefined : 'dev kill api failed'
    }
  } catch (error) {
    return { ok: false, ...request, error: error instanceof Error ? error.message : 'dev kill api failed' }
  }
}

type BrowserPickedFile = Pick<File, 'name'> & {
  path?: string
  webkitRelativePath?: string
}

function pathTail(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

function normalizeBrowserPickedFile(file: BrowserPickedFile, kind: PickedFavoriteKind): PickedFavorite | null {
  const relativePath = typeof file.webkitRelativePath === 'string' ? file.webkitRelativePath.trim() : ''
  const explicitPath = typeof file.path === 'string' ? file.path.trim() : ''
  const folderRoot = relativePath.split(/[\\/]/).filter(Boolean)[0] || ''
  const path = kind === 'folder'
    ? folderRoot || explicitPath.replace(/[\\/][^\\/]*$/, '') || file.name
    : explicitPath || relativePath || file.name
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) return null
  const name = kind === 'folder' ? folderRoot || pathTail(normalizedPath) : file.name || pathTail(normalizedPath)
  return {
    kind,
    path: normalizedPath,
    name,
    parentId: null,
    tags: [],
    color: kind === 'folder' ? '#2F80ED' : '#F2994A'
  }
}

function normalizeBrowserPickedFiles(files: ArrayLike<BrowserPickedFile>, kind: PickedFavoriteKind): PickedFavorite[] {
  const seen = new Set<string>()
  return Array.from(files)
    .map((file) => normalizeBrowserPickedFile(file, kind))
    .filter((item): item is PickedFavorite => {
      if (!item) return false
      const key = `${item.kind}:${item.path}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

async function pickFavoritesViaBrowserInput(kind: PickedFavoriteKind): Promise<PickedFavorite[]> {
  if (typeof document === 'undefined' || !document.body) return []
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.style.display = 'none'
    if (kind === 'folder') {
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
    }

    const cleanup = () => {
      input.remove()
    }
    const finish = () => {
      const picked = input.files ? normalizeBrowserPickedFiles(input.files, kind) : []
      cleanup()
      resolve(picked)
    }
    const cancel = () => {
      cleanup()
      resolve([])
    }

    input.addEventListener('change', finish, { once: true })
    input.addEventListener('cancel', cancel, { once: true })
    document.body.appendChild(input)

    try {
      input.click()
    } catch {
      cancel()
    }
  })
}

async function saveTextFileViaBrowser(input: SaveTextFileInput): Promise<SaveTextFileResult> {
  if (typeof document === 'undefined' || !document.body || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return { outcome: 'failed', errorCode: 'unsupported', message: 'browser download unavailable' }
  }
  const suggestedName = input.suggestedName.trim() || 'mqtt-export.json'
  try {
    const objectUrl = URL.createObjectURL(new Blob([input.text], { type: input.mimeType || 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = suggestedName
    anchor.hidden = true
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    return { outcome: 'saved' }
  } catch (error) {
    return {
      outcome: 'failed',
      errorCode: errorCodeFromUnknown(error),
      message: error instanceof Error ? error.message : 'browser download failed'
    }
  }
}

export function getPlatform(): EypcPlatformApi {
  if (typeof window !== 'undefined' && window.eypcPlatform) {
    const hostFiles = window.eypcPlatform.files
    const hostClipboard = window.eypcPlatform.clipboard
    const hostStorage = window.eypcPlatform.storage
    const hostCodex = window.eypcPlatform.codex
    const hostFloat = window.eypcPlatform.float
    const hostWindows = window.eypcPlatform.windows
    const hostCapabilities: FileCapabilities = hostFiles.capabilities || {
      open: typeof hostFiles.open === 'function',
      reveal: typeof hostFiles.reveal === 'function',
      copyPath: typeof hostFiles.copyPath === 'function',
      copyItems: typeof hostFiles.copyItems === 'function',
      pickFiles: typeof hostFiles.pickFavorites === 'function' || typeof hostFiles.pickFavorite === 'function',
      pickFolders: typeof hostFiles.pickFavorites === 'function',
      listDirectory: typeof hostFiles.listDirectory === 'function',
      inspectPaths: typeof hostFiles.inspectPaths === 'function'
    }
    return {
      ...window.eypcPlatform,
      windows: {
        capabilities: hostWindows?.capabilities || (async () => unsupportedWindowCapability('当前 preload 未提供窗口能力')),
        list: hostWindows?.list || (async () => unsupportedWindowList('当前 preload 未提供窗口能力')),
        activate: hostWindows?.activate || (async () => ({ outcome: 'unsupported', message: '当前 preload 未提供窗口激活能力' })),
        alwaysOnTop: hostWindows?.alwaysOnTop || (async () => ({ outcome: 'unsupported', message: '当前 preload 未提供页面置顶能力' })),
        close: hostWindows?.close || (async () => ({ outcome: 'unsupported', message: '当前 preload 未提供窗口关闭能力' })),
        terminate: hostWindows?.terminate || (async () => ({ outcome: 'unsupported', message: '当前 preload 未提供窗口强杀能力' })),
        openPermissionSettings: hostWindows?.openPermissionSettings
      },
      storage: {
        getState: hostStorage.getState || readFallbackState,
        setState: hostStorage.setState || writeFallbackState,
        getMqttArchive: hostStorage.getMqttArchive || readFallbackMqttArchive,
        setMqttArchive: hostStorage.setMqttArchive || writeFallbackMqttArchive,
        getMqttStorageStatus: hostStorage.getMqttStorageStatus || fallbackMqttStorageStatus,
        getMqttSecrets: hostStorage.getMqttSecrets || readFallbackMqttSecrets,
        setMqttSecrets: hostStorage.setMqttSecrets || writeFallbackMqttSecrets
      },
      files: {
        capabilities: hostCapabilities,
        open: (path) => callFileAction(hostFiles.open ? () => hostFiles.open(path) : undefined, 'open unavailable'),
        reveal: (path) => callFileAction(hostFiles.reveal ? () => hostFiles.reveal(path) : undefined, 'reveal unavailable'),
        copyPath: (path) => callFileAction(hostFiles.copyPath ? () => hostFiles.copyPath(path) : undefined, 'copy path unavailable'),
        copyItems: (paths) => callFileAction(hostFiles.copyItems ? () => hostFiles.copyItems!(paths) : undefined, 'copy items unavailable'),
        inspectPaths: hostFiles.inspectPaths || (async (paths) => paths.map((path) => unknownInspection(path))),
        pickFavorite: hostFiles.pickFavorite,
        pickFavorites: hostFiles.pickFavorites || (async () => {
          const picked = await hostFiles.pickFavorite?.()
          return picked ? [picked] : []
        }),
        listDirectory: hostFiles.listDirectory || (async () => ({ ok: false, entries: [], error: 'directory listing unavailable', errorCode: 'unsupported' })),
        saveTextFile: (input) => callSaveTextFile(hostFiles.saveTextFile ? () => hostFiles.saveTextFile(input) : undefined)
      },
      clipboard: {
        copyText: hostClipboard?.copyText || (async () => false)
      },
      codex: {
        taskStateRevision: typeof hostCodex?.readSnapshot === 'function'
          ? typeof hostCodex.taskStateRevision === 'string' && hostCodex.taskStateRevision
            ? hostCodex.taskStateRevision
            : 'legacy'
          : undefined,
        // uTools can keep a previous preload alive while loading a newer renderer.
        // Treat an existing snapshot bridge as positive capability evidence instead
        // of misreporting the desktop host as an unsupported browser.
        inspectEnvironment: hostCodex?.inspectEnvironment || (async () => typeof hostCodex?.readSnapshot === 'function'
          ? legacyHostCodexEnvironment()
          : unsupportedCodexEnvironment()),
        setLaunchPath: hostCodex?.setLaunchPath,
        clearLaunchPath: hostCodex?.clearLaunchPath,
        readSnapshot: hostCodex?.readSnapshot || (async () => ({ ok: false, error: { code: 'unsupported', message: 'Codex App Server unavailable in this host' }, receivedAt: Date.now() })),
        readActivitySnapshot: hostCodex?.readActivitySnapshot,
        onActivityChanged: hostCodex?.onActivityChanged,
        openThread: hostCodex?.openThread || (async () => ({ outcome: 'failed', errorCode: 'unsupported', message: 'Codex thread open unavailable' })),
        createThread: hostCodex?.createThread,
        openBlank: hostCodex?.openBlank,
        archiveThread: hostCodex?.archiveThread,
        archiveProject: hostCodex?.archiveProject,
        removeProject: hostCodex?.removeProject,
        listProjectEnvironments: hostCodex?.listProjectEnvironments,
        runProjectAction: hostCodex?.runProjectAction,
        listActionSessions: hostCodex?.listActionSessions,
        stopActionSession: hostCodex?.stopActionSession,
        close: hostCodex?.close || (() => undefined)
      },
      float: {
        sync: hostFloat?.sync || (() => false),
        activate: hostFloat?.activate,
        diagnostics: hostFloat?.diagnostics,
        resetGeometry: hostFloat?.resetGeometry,
        close: hostFloat?.close || (() => undefined),
        onAction: hostFloat?.onAction || (() => () => undefined)
      },
      app: window.eypcPlatform.app || { hide: async () => false }
    }
  }
  return {
    storage: {
      getState: readFallbackState,
      setState: writeFallbackState,
      getMqttArchive: readFallbackMqttArchive,
      setMqttArchive: writeFallbackMqttArchive,
      getMqttStorageStatus: fallbackMqttStorageStatus,
      getMqttSecrets: readFallbackMqttSecrets,
      setMqttSecrets: writeFallbackMqttSecrets
    },
    ports: {
      scan: scanViaDevApi,
      kill: killViaDevApi
    },
    windows: {
      capabilities: async () => unsupportedWindowCapability('浏览器预览不提供系统窗口能力'),
      list: async () => unsupportedWindowList('浏览器预览不提供系统窗口能力'),
      activate: async () => ({ outcome: 'unsupported', message: '浏览器预览不提供系统窗口激活能力' }),
      alwaysOnTop: async () => ({ outcome: 'unsupported', message: '浏览器预览不提供页面置顶能力' }),
      close: async () => ({ outcome: 'unsupported', message: '浏览器预览不提供系统窗口关闭能力' }),
      terminate: async () => ({ outcome: 'unsupported', message: '浏览器预览不提供系统窗口强杀能力' })
    },
    files: {
      capabilities: {
        open: false,
        reveal: false,
        copyPath: typeof navigator !== 'undefined' && Boolean(navigator.clipboard),
        copyItems: false,
        pickFiles: typeof document !== 'undefined',
        pickFolders: typeof document !== 'undefined',
        listDirectory: false,
        inspectPaths: false
      },
      open: async () => ({ outcome: 'failed', errorCode: 'unsupported', message: 'open unavailable in browser' }),
      reveal: async () => ({ outcome: 'failed', errorCode: 'unsupported', message: 'reveal unavailable in browser' }),
      copyPath: async (path) => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(path)
            return { outcome: 'success' }
          } catch (error) {
            return { outcome: 'failed', errorCode: errorCodeFromUnknown(error), message: error instanceof Error ? error.message : 'copy path failed' }
          }
        }
        return { outcome: 'failed', errorCode: 'unsupported', message: 'copy path unavailable in browser' }
      },
      copyItems: async () => ({ outcome: 'failed', errorCode: 'unsupported', message: 'copy items unavailable in browser' }),
      inspectPaths: async (paths) => paths.map((path) => unknownInspection(path)),
      pickFavorites: pickFavoritesViaBrowserInput,
      listDirectory: async () => ({ ok: false, entries: [], error: 'directory listing unavailable', errorCode: 'unsupported' }),
      saveTextFile: saveTextFileViaBrowser
    },
    clipboard: {
      copyText: async (text) => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(text)
          return true
        }
        return false
      }
    },
    codex: {
      inspectEnvironment: async () => unsupportedCodexEnvironment(),
      setLaunchPath: undefined,
      clearLaunchPath: undefined,
      readSnapshot: async () => ({ ok: false, error: { code: 'unsupported', message: 'Codex App Server unavailable in browser' }, receivedAt: Date.now() }),
      readActivitySnapshot: undefined,
      onActivityChanged: undefined,
      openThread: async () => ({ outcome: 'failed', errorCode: 'unsupported', message: 'Codex thread open unavailable in browser' }),
      createThread: undefined,
      openBlank: undefined,
      archiveThread: undefined,
      archiveProject: undefined,
      removeProject: undefined,
      listProjectEnvironments: undefined,
      runProjectAction: undefined,
      listActionSessions: undefined,
      stopActionSession: undefined,
      close: () => undefined
    },
    float: {
      sync: () => false,
      activate: () => false,
      diagnostics: () => ({ supported: false, alwaysOnTop: false, allWorkspaces: false, visibleOnFullScreen: false, checkedAt: 0, errorCode: 'unsupported' }),
      resetGeometry: () => false,
      close: () => undefined,
      onAction: () => () => undefined
    },
    app: {
      hide: async () => false
    },
    getEnterPayload: () => memory.enterPayload,
    clearEnterPayload: () => {
      memory.enterPayload = null
    }
  }
}
