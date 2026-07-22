import type {
  CodexCompactField,
  CodexQuotaBucket,
  CodexQuotaFamily,
  CodexQuotaPool,
  CodexQuotaSnapshotV1,
  ConversationSnapshotV1
} from './codex'
import { normalizeCodexQuota } from './codex'
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
  /** Visible ongoing count: Desktop live active plus raw interrupted projected as ongoing. */
  ongoingCount: number
  unknownCount: number
  attentionCount: number
  pendingCount: number
  state: 'ready' | 'loading' | 'stale' | 'error' | 'empty'
  stateLabel: string
  ariaLabel: string
}

export interface CodexPresentationInput {
  quota: CodexQuotaSnapshotV1
  compactFields: readonly CodexCompactField[]
  conversationInboxEnabled: boolean
  conversations: Pick<ConversationSnapshotV1, 'ongoingCount' | 'unknownCount' | 'attentionCount' | 'pendingCount'>
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
  const ongoingCount = showTasks ? input.conversations.ongoingCount : 0
  const unknownCount = showTasks ? input.conversations.unknownCount : 0
  const attentionCount = showTasks ? input.conversations.attentionCount : 0
  const pendingCount = showTasks ? input.conversations.pendingCount : 0
  const inProgressCount = ongoingCount + attentionCount
  const state = quotaState(input.quota, primary !== null)
  const quotaDescription = primary
    ? `${primary.longLabel}剩余 ${primary.bucket.remainingPercent}%${secondary ? `，${secondary.longLabel}剩余 ${secondary.bucket.remainingPercent}%` : ''}`
    : state.stateLabel
  const taskParts = showTasks
    ? [
        inProgressCount ? `${inProgressCount} 个进行中或等待操作` : '',
        unknownCount ? `${unknownCount} 个状态未知` : '',
        pendingCount ? `${pendingCount} 个待查看` : ''
      ].filter(Boolean)
    : []
  const taskDescription = taskParts.length ? `，${taskParts.join('，')}` : ''
  return {
    primary,
    secondary,
    showTasks,
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
