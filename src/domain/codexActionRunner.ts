import type { CodexEnvironmentActionRisk } from './codexEnvironment'

export type CodexActionRunStatus = 'confirm-required' | 'running' | 'stopping' | 'completed' | 'failed' | 'stopped' | 'interrupted'
export type CodexActionRunnerView = 'records' | 'archived'
export type CodexActionNodeRuntimeMode = 'auto' | 'manual'
export type CodexActionNodeRuntimeSource = 'nvm' | 'system'

export interface CodexActionNodeRuntimeCandidateV1 {
  id: string
  label: string
  version: string
  source: CodexActionNodeRuntimeSource
}

export interface CodexActionNodeRuntimeProjectionV1 {
  mode: CodexActionNodeRuntimeMode
  state: 'ready' | 'unavailable' | 'invalid-project-version'
  selectedCandidateId?: string
  resolvedCandidateId?: string
  label?: string
  version?: string
  source?: CodexActionNodeRuntimeSource
  hintSource?: '.nvmrc' | '.node-version'
  candidates: CodexActionNodeRuntimeCandidateV1[]
  message?: string
}

export interface CodexActionRunnerActionV1 {
  id: string
  laneId: string
  name: string
  icon: string
  risk: CodexEnvironmentActionRisk
  state: 'idle' | 'running' | 'stopping' | 'confirm-required'
}

export interface CodexActionRunnerEnvironmentV1 {
  id: string
  name: string
  actions: CodexActionRunnerActionV1[]
}

export interface CodexActionRunnerProjectV1 {
  key: string
  name: string
  pinSource?: 'local' | 'native'
  /** Host-only while syncing the catalog; stripped before the child snapshot. */
  targetAlias?: string
  /** Host-only execution identity; stripped before the child snapshot. */
  targetId?: string
  nodeRuntime?: CodexActionNodeRuntimeProjectionV1
  environments: CodexActionRunnerEnvironmentV1[]
}

export interface CodexActionRunnerCatalogV1 {
  version: 1
  projects: CodexActionRunnerProjectV1[]
  selectedLaneId?: string
  confirmLaneId?: string
  capabilities?: string[]
  loading?: boolean
  message?: string
  generatedAt: number
}

export interface CodexActionRunRecordV1 {
  version: 1
  runId: string
  laneId: string
  projectKey: string
  projectName: string
  environmentId: string
  environmentName: string
  actionId: string
  actionName: string
  risk: CodexEnvironmentActionRisk
  status: CodexActionRunStatus
  startedAt: number
  endedAt?: number
  exitCode?: number
  archivedAt?: number
  logText: string
  logBytes: number
  logLines: number
  message?: string
  cursor?: number
  runtimeMode?: CodexActionNodeRuntimeMode
  runtimeSource?: CodexActionNodeRuntimeSource
  runtimeVersion?: string
  runtimeLabel?: string
}

export interface CodexActionLogDeltaV1 {
  version: 1
  runId: string
  cursor: number
  stream: 'stdout' | 'stderr' | 'system'
  text: string
  receivedAt: number
}

export interface CodexActionRunnerSnapshotV1 {
  version: 1
  catalog: CodexActionRunnerCatalogV1
  runs: CodexActionRunRecordV1[]
  selectedLaneId: string
  view: CodexActionRunnerView
  pinned: boolean
  capabilities?: string[]
  loading: boolean
  message?: string
  generatedAt: number
}

export interface CodexActionRunnerActionEvent {
  actionId: string
  args: Record<string, unknown>
}

export interface CodexActionRunnerProjectCandidate {
  key: string
  kind: 'project' | 'chats'
  nativePinned?: boolean
  nativePinnedOrder?: number
  nativeOrder?: number
  selected?: boolean
}

export function resolveCodexActionRunnerPriorityProject<T extends CodexActionRunnerProjectCandidate>(input: {
  defaultProjectKey?: string
  localProjectKeys?: string[]
  projects: T[]
}): T | null {
  const projects = input.projects.filter((project) => project.kind === 'project')
  const byKey = new Map(projects.map((project) => [project.key, project]))
  if (input.defaultProjectKey) return byKey.get(input.defaultProjectKey) || null
  const localProjectKey = input.localProjectKeys?.[0]
  if (localProjectKey) return byKey.get(localProjectKey) || null
  return projects.filter((project) => project.nativePinned).sort((left, right) => (left.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER) - (right.nativePinnedOrder ?? Number.MAX_SAFE_INTEGER))[0]
    || projects.find((project) => project.selected)
    || projects.slice().sort((left, right) => (left.nativeOrder ?? Number.MAX_SAFE_INTEGER) - (right.nativeOrder ?? Number.MAX_SAFE_INTEGER))[0]
    || null
}

export function codexActionLaneId(projectKey: string, environmentId: string, actionId: string) {
  return [projectKey, environmentId, actionId].map((value) => encodeURIComponent(value)).join(':')
}

export function codexActionRunCanArchive(status: CodexActionRunStatus) {
  return status === 'completed' || status === 'failed' || status === 'stopped' || status === 'interrupted'
}

export function formatCodexActionRunTimestamp(timestamp: number, now = Date.now()) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '—'
  const value = new Date(timestamp)
  const current = new Date(now)
  const sameDay = value.getFullYear() === current.getFullYear()
    && value.getMonth() === current.getMonth()
    && value.getDate() === current.getDate()
  const pad = (part: number) => String(part).padStart(2, '0')
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  return sameDay ? time : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${time}`
}

export function sanitizeCodexActionLogTextForProjection(text: string, privatePaths: string[] = []) {
  let value = String(text || '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]|\u001B[@-_]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  for (const privatePath of [...privatePaths].filter(Boolean).sort((left, right) => right.length - left.length)) {
    value = value.split(privatePath).join('<private-path>')
  }
  value = value
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s'"`]+/gi, '$1<redacted>')
    .replace(/((?:token|password|passwd|secret|api[_-]?key)\s*[:=]\s*)[^\s'"`]+/gi, '$1<redacted>')
    .replace(/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, '$1<redacted>@')
  return value.slice(0, 32 * 1024)
}
