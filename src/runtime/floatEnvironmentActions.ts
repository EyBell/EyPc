import {
  buildCodexEnvironmentActionSlots,
  buildCodexEnvironmentProjectCandidates,
  resolveCodexEnvironmentActionTarget,
  type CodexEnvironmentActionRunResult,
  type CodexEnvironmentActionSessionProjection,
  type CodexEnvironmentActionSlot,
  type CodexEnvironmentProjection,
  type CodexEnvironmentProjectCandidate
} from '../domain/codexEnvironment'
import type { CodexProjectCard, CodexTaskCard, ConversationSnapshotV2 } from '../domain/codex'

export type FloatEnvironmentPickerMode = 'project' | 'environment' | null

export interface FloatEnvironmentActionState {
  environments: CodexEnvironmentProjection[]
  selectedEnvironmentId: string
  rememberedEnvironmentByProject: Record<string, string>
  sessions: CodexEnvironmentActionSessionProjection[]
  pendingSlotIndex: number | null
  pendingConfirmToken: string
  pickerMode: FloatEnvironmentPickerMode
  pickerIndex: number
  binderTargetAlias: string
  binderProjectKey: string
  binderProjectName: string
  loading: boolean
  message: string
}

export function createFloatEnvironmentActionState(): FloatEnvironmentActionState {
  return {
    environments: [],
    selectedEnvironmentId: '',
    rememberedEnvironmentByProject: {},
    sessions: [],
    pendingSlotIndex: null,
    pendingConfirmToken: '',
    pickerMode: null,
    pickerIndex: 0,
    binderTargetAlias: '',
    binderProjectKey: '',
    binderProjectName: '',
    loading: false,
    message: ''
  }
}

export function resolveFloatActionTargetAlias(input: {
  selectedTasks: CodexTaskCard[]
  focusedTask?: CodexTaskCard | null
  focusedProject?: CodexProjectCard | null
  defaultProjectKey?: string
  projectsTabProject?: CodexProjectCard | null
  projects: CodexProjectCard[]
}): { projectKey: string; projectName: string; targetAlias: string; kind: 'task' | 'project' } | null {
  const base = resolveCodexEnvironmentActionTarget({
    selectedTasks: input.selectedTasks,
    focusedTask: input.focusedTask,
    focusedProject: input.focusedProject,
    defaultProjectKey: input.defaultProjectKey,
    projectsTabProject: input.projectsTabProject,
    projects: input.projects
  })
  if (!base) return null
  const project = input.projects.find((item) => item.key === base.projectKey)
  const targetAlias = base.kind === 'project'
    ? project?.actionAlias || base.targetAlias
    : base.targetAlias
  if (!targetAlias) return null
  return { ...base, targetAlias }
}

export function floatEnvironmentProjectCandidates(conversations: ConversationSnapshotV2 | null | undefined): CodexEnvironmentProjectCandidate[] {
  if (!conversations) return []
  const pinnedProjects = (conversations.projectSections.find((section) => section.id === 'pinned')?.entries || [])
    .filter((entry): entry is { kind: 'project'; project: CodexProjectCard; pinSource?: 'native' | 'local' } => entry.kind === 'project')
    .map((entry) => entry.project)
  return buildCodexEnvironmentProjectCandidates({
    pinnedProjects,
    projects: conversations.projects
  })
}

export function floatEnvironmentSlots(
  environment: CodexEnvironmentProjection | null | undefined,
  sessions: CodexEnvironmentActionSessionProjection[],
  targetAlias: string
): CodexEnvironmentActionSlot[] {
  const sessionStates: Record<string, 'idle' | 'running' | 'stopping'> = {}
  for (const session of sessions) {
    if (session.targetAlias !== targetAlias) continue
    sessionStates[session.actionId] = session.state
  }
  return buildCodexEnvironmentActionSlots(environment, sessionStates)
}

export function selectEnvironmentForProject(
  state: FloatEnvironmentActionState,
  projectKey: string,
  environments: CodexEnvironmentProjection[]
): string {
  const remembered = state.rememberedEnvironmentByProject[projectKey]
  if (remembered && environments.some((item) => item.id === remembered)) return remembered
  return environments[0]?.id || ''
}

export function summarizeEnvironmentRunResult(result: CodexEnvironmentActionRunResult): string {
  if (result.message) return result.message
  if (result.outcome === 'ok') return 'Action 已完成'
  if (result.outcome === 'started') return 'Serve 已启动'
  if (result.outcome === 'running') return 'Serve 运行中'
  if (result.outcome === 'stopping') return '正在停止 Serve'
  if (result.outcome === 'confirm-required') return '需要再次确认后才会执行'
  if (result.outcome === 'rejected') return '该 Action 不可执行'
  return 'Action 执行失败'
}
