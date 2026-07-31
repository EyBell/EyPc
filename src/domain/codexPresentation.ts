import type {
  CodexCompactField,
  CodexQuotaBucket,
  CodexQuotaFamily,
  CodexQuotaPool,
  CodexQuotaSnapshotV1,
  CodexTaskCard,
  ConversationSnapshotV1
} from './codex'
import {
  CODEX_DEFAULT_DYNAMIC_TASK_WINDOW_HOURS,
  CODEX_MAX_DYNAMIC_TASK_WINDOW_HOURS,
  CODEX_MIN_DYNAMIC_TASK_WINDOW_HOURS,
  CODEX_TASK_STATE_REVISION,
  emptyConversationSnapshot,
  normalizeCodexQuota
} from './codex'
import { highestSparkQuotaPool } from './codexNewThread'

export interface CodexQuotaReading {
  kind: 'short' | 'weekly'
  family: CodexQuotaFamily
  label: '5h' | 'Weekly' | 'Spark' | 'Spark Weekly'
  longLabel: '5 小时限额' | '周限额' | 'Spark 额度' | 'Spark 周额度'
  bucket: CodexQuotaBucket
  limitName: string
}

export interface CodexCompactPresentation {
  primary: CodexQuotaReading | null
  secondary: CodexQuotaReading | null
  showTasks: boolean
  taskCounts: CodexCompactTaskCounts
  /** Compatibility alias of taskCounts.active. */
  ongoingCount: number
  unknownCount: number
  attentionCount: number
  /** Compatibility alias of taskCounts.unread. */
  pendingCount: number
  state: 'ready' | 'loading' | 'stale' | 'error' | 'empty'
  stateLabel: string
  ariaLabel: string
}

export interface CodexPresentationInput {
  quota: CodexQuotaSnapshotV1
  compactFields: readonly CodexCompactField[]
  conversationInboxEnabled: boolean
  taskCounts: CodexCompactTaskCounts
}

export interface CodexCompactTaskCounts {
  input: number
  active: number
  unread: number
}

export interface CodexDynamicStatusGroups {
  input: CodexTaskCard[]
  active: CodexTaskCard[]
  stopped: CodexTaskCard[]
  unread: CodexTaskCard[]
  completed: CodexTaskCard[]
}

export interface CodexDynamicStatusProjection {
  tasks: CodexTaskCard[]
  groups: CodexDynamicStatusGroups
  compactCounts: CodexCompactTaskCounts
  /** Earliest time-only transition of this projection; owned and scheduled by the Controller. */
  nextTransitionAt: number | null
}

export type CodexTaskStateCompatibility = 'current' | 'degraded'

/**
 * Atomic task-state package published by the Controller. Every task surface
 * consumes this object instead of independently filtering conversations.
 */
export interface CodexTaskStatePackageV1 {
  version: 1
  semanticRevision: string
  sourceRevision: string
  compatibility: CodexTaskStateCompatibility
  compatibilityMessage: string
  conversations: ConversationSnapshotV1
  dynamic: CodexDynamicStatusProjection
  generatedAt: number
}

export const CODEX_TASK_STATE_DEGRADED_MESSAGE = 'Codex 任务状态桥版本较旧，状态已保留；建议在 uTools 中重新加载 EyPc 插件'

export const CODEX_DYNAMIC_TASK_WINDOW_MS = CODEX_DEFAULT_DYNAMIC_TASK_WINDOW_HOURS * 60 * 60 * 1000

type CodexDynamicConversationSource = Pick<
  ConversationSnapshotV1,
  'ongoing' | 'stopped' | 'completedUnread' | 'completed' | 'hidden' | 'inputRequired'
>

function taskActivityAt(task: CodexTaskCard): number {
  return Math.max(task.lastTurnStartedAt || 0, task.lastTurnCompletedAt || 0)
}

function isDynamicActiveTask(task: CodexTaskCard): boolean {
  return task.bucket === 'ongoing'
    && (task.activityState === 'active' || task.activityState === 'waiting-approval' || task.activityState === 'ongoing')
}

function emptyDynamicStatusProjection(): CodexDynamicStatusProjection {
  const groups: CodexDynamicStatusGroups = { input: [], active: [], stopped: [], unread: [], completed: [] }
  return { tasks: [], groups, compactCounts: { input: 0, active: 0, unread: 0 }, nextTransitionAt: null }
}

function dynamicTaskWindowMs(hours: number): number {
  const normalizedHours = Number.isFinite(hours)
    ? Math.min(CODEX_MAX_DYNAMIC_TASK_WINDOW_HOURS, Math.max(CODEX_MIN_DYNAMIC_TASK_WINDOW_HOURS, Math.round(hours)))
    : CODEX_DEFAULT_DYNAMIC_TASK_WINDOW_HOURS
  return normalizedHours * 60 * 60 * 1000
}

/**
 * Projects the already-stabilized Controller snapshot into the visible dynamic
 * status groups and compact counters. This layer is intentionally stateless:
 * communication jitter and completion hysteresis stay owned by the Controller.
 */
export function projectCodexDynamicStatus(
  conversations: CodexDynamicConversationSource | null | undefined,
  now = Date.now(),
  windowHours = CODEX_DEFAULT_DYNAMIC_TASK_WINDOW_HOURS
): CodexDynamicStatusProjection {
  if (!conversations) return emptyDynamicStatusProjection()
  const effectiveNow = Number.isFinite(now) ? now : Date.now()
  const windowMs = dynamicTaskWindowMs(windowHours)
  const windowStart = effectiveNow - windowMs
  const recent = [
    ...conversations.ongoing,
    ...(conversations.stopped || []),
    ...conversations.completedUnread,
    ...conversations.completed
  ].filter((task) => !task.isHidden && taskActivityAt(task) >= windowStart)
  const recentOngoing = recent.filter((task) => task.bucket === 'ongoing')
  const groups: CodexDynamicStatusGroups = {
    input: recentOngoing.filter((task) => task.activityState === 'waiting-input'),
    active: recentOngoing.filter(isDynamicActiveTask),
    stopped: recent.filter((task) => task.bucket === 'stopped'),
    unread: recent.filter((task) => task.bucket === 'completed-unread'),
    completed: recent.filter((task) => task.bucket === 'completed')
  }
  const tasks = [groups.input, groups.active, groups.stopped, groups.unread, groups.completed].flat()
  const nextTransitionAt = recent.length
    ? Math.min(...recent.map((task) => taskActivityAt(task) + windowMs + 1))
    : null
  return {
    tasks,
    groups,
    compactCounts: {
      input: conversations.inputRequired.length,
      active: groups.active.length,
      unread: conversations.completedUnread.length
        + conversations.hidden.filter((task) => task.bucket === 'completed-unread').length
    },
    nextTransitionAt
  }
}

export function buildCodexTaskStatePackage(
  conversations: ConversationSnapshotV1,
  options: { sourceRevision?: string; now?: number; dynamicTaskWindowHours?: number } = {}
): CodexTaskStatePackageV1 {
  const now = Number.isFinite(options.now) ? options.now! : Date.now()
  const sourceRevision = options.sourceRevision || 'legacy'
  const compatibility = sourceRevision === CODEX_TASK_STATE_REVISION ? 'current' : 'degraded'
  return {
    version: 1,
    semanticRevision: CODEX_TASK_STATE_REVISION,
    sourceRevision,
    compatibility,
    compatibilityMessage: compatibility === 'degraded' ? CODEX_TASK_STATE_DEGRADED_MESSAGE : '',
    conversations,
    dynamic: projectCodexDynamicStatus(conversations, now, options.dynamicTaskWindowHours),
    generatedAt: now
  }
}

function isTaskStatePackage(value: CodexTaskStatePackageV1 | null | undefined): value is CodexTaskStatePackageV1 {
  return value?.version === 1
    && typeof value.semanticRevision === 'string'
    && typeof value.sourceRevision === 'string'
    && Boolean(value.conversations)
    && Boolean(value.dynamic)
}

/**
 * One-release mixed-runtime adapter. A legacy Controller snapshot is converted
 * into the same atomic package without discarding its task data. Current
 * Controller snapshots pass through unchanged.
 */
export function normalizeCodexTaskStatePackage(
  value: CodexTaskStatePackageV1 | null | undefined,
  fallbackConversations?: ConversationSnapshotV1 | null,
  fallbackSourceRevision?: string,
  now = Date.now()
): CodexTaskStatePackageV1 {
  if (isTaskStatePackage(value)) {
    const compatible = value.semanticRevision === CODEX_TASK_STATE_REVISION
      && value.sourceRevision === CODEX_TASK_STATE_REVISION
      && value.compatibility === 'current'
    if (compatible || value.compatibility === 'degraded') return value
    return {
      ...value,
      compatibility: 'degraded',
      compatibilityMessage: CODEX_TASK_STATE_DEGRADED_MESSAGE
    }
  }
  return buildCodexTaskStatePackage(fallbackConversations || emptyConversationSnapshot(), {
    sourceRevision: fallbackSourceRevision === CODEX_TASK_STATE_REVISION
      ? 'legacy-controller'
      : fallbackSourceRevision || 'legacy',
    now
  })
}

function reading(pool: CodexQuotaPool, kind: CodexQuotaReading['kind'], bucket: CodexQuotaBucket | null): CodexQuotaReading | null {
  if (!bucket) return null
  if (pool.family === 'spark') {
    return kind === 'short'
      ? { family: 'spark', kind, label: 'Spark', longLabel: 'Spark 额度', bucket, limitName: pool.limitName }
      : { family: 'spark', kind, label: 'Spark Weekly', longLabel: 'Spark 周额度', bucket, limitName: pool.limitName }
  }
  return kind === 'short'
    ? { family: 'normal', kind, label: '5h', longLabel: '5 小时限额', bucket, limitName: pool.limitName }
    : { family: 'normal', kind, label: 'Weekly', longLabel: '周限额', bucket, limitName: pool.limitName }
}

function quotaState(quota: CodexQuotaSnapshotV1, hasReading: boolean): Pick<CodexCompactPresentation, 'state' | 'stateLabel'> {
  if (quota.status === 'loading') return { state: 'loading', stateLabel: '读取中' }
  if (quota.status === 'error') return { state: 'error', stateLabel: '读取失败' }
  if (quota.status === 'stale') return { state: 'stale', stateLabel: hasReading ? '上次数据' : '未连接' }
  if (!hasReading) return { state: 'empty', stateLabel: quota.status === 'idle' ? '未连接' : '暂无额度' }
  return { state: 'ready', stateLabel: '' }
}

export function buildCodexCompactPresentation(input: CodexPresentationInput): CodexCompactPresentation {
  const quota = normalizeCodexQuota(input.quota)
  let primary: CodexQuotaReading | null = null
  let secondary: CodexQuotaReading | null = null
  if (quota.normal.short && quota.normal.short.remainingPercent > 0) {
    primary = reading(quota.normal, 'short', quota.normal.short)
    secondary = reading(quota.normal, 'weekly', quota.normal.weekly)
  } else if (quota.normal.weekly && quota.normal.weekly.remainingPercent > 0) {
    primary = reading(quota.normal, 'weekly', quota.normal.weekly)
  } else {
    const spark = highestSparkQuotaPool(quota)
    if (spark?.short && spark.short.remainingPercent > 0) {
      primary = reading(spark, 'short', spark.short)
      secondary = reading(spark, 'weekly', spark.weekly)
    } else if (spark?.weekly && spark.weekly.remainingPercent > 0) {
      primary = reading(spark, 'weekly', spark.weekly)
    } else {
      primary = reading(quota.normal, 'short', quota.normal.short) || reading(quota.normal, 'weekly', quota.normal.weekly)
      secondary = primary?.kind === 'short' ? reading(quota.normal, 'weekly', quota.normal.weekly) : null
    }
  }
  const showTasks = input.conversationInboxEnabled && input.compactFields.includes('tasks')
  const taskCounts = showTasks
    ? {
        input: Math.max(0, input.taskCounts.input),
        active: Math.max(0, input.taskCounts.active),
        unread: Math.max(0, input.taskCounts.unread)
      }
    : { input: 0, active: 0, unread: 0 }
  const ongoingCount = taskCounts.active
  const unknownCount = 0
  const attentionCount = 0
  const pendingCount = taskCounts.unread
  const state = quotaState(input.quota, primary !== null)
  const quotaDescription = primary
    ? `${primary.longLabel}剩余 ${primary.bucket.remainingPercent}%${secondary ? `，${secondary.longLabel}剩余 ${secondary.bucket.remainingPercent}%` : ''}`
    : state.stateLabel
  const taskParts = showTasks
    ? [
        taskCounts.input ? `${taskCounts.input} 个待输入` : '',
        taskCounts.active ? `${taskCounts.active} 个进行中` : '',
        taskCounts.unread ? `${taskCounts.unread} 个已完成未读` : ''
      ].filter(Boolean)
    : []
  const taskDescription = taskParts.length ? `，${taskParts.join('，')}` : ''
  return {
    primary,
    secondary,
    showTasks,
    taskCounts,
    ongoingCount,
    unknownCount,
    attentionCount,
    pendingCount,
    ...state,
    ariaLabel: `Codex ${quotaDescription}${taskDescription}`
  }
}

export function codexBadgeText(value: number): string {
  return value > 99 ? '99+' : String(Math.max(0, value))
}
