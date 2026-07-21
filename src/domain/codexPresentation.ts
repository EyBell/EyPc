import type {
  CodexCompactField,
  CodexQuotaBucket,
  CodexQuotaSnapshotV1,
  ConversationSnapshotV1
} from './codex'

export interface CodexQuotaReading {
  kind: 'short' | 'weekly'
  label: '5h' | 'Weekly'
  longLabel: '5 小时限额' | '周限额'
  bucket: CodexQuotaBucket
}

export interface CodexCompactPresentation {
  primary: CodexQuotaReading | null
  secondary: CodexQuotaReading | null
  showTasks: boolean
  /** Exact active count reported by the connected provider. */
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

function reading(kind: CodexQuotaReading['kind'], bucket: CodexQuotaBucket | null): CodexQuotaReading | null {
  if (!bucket) return null
  return kind === 'short'
    ? { kind, label: '5h', longLabel: '5 小时限额', bucket }
    : { kind, label: 'Weekly', longLabel: '周限额', bucket }
}

function quotaState(quota: CodexQuotaSnapshotV1, hasReading: boolean): Pick<CodexCompactPresentation, 'state' | 'stateLabel'> {
  if (quota.status === 'loading') return { state: 'loading', stateLabel: '读取中' }
  if (quota.status === 'error') return { state: 'error', stateLabel: '读取失败' }
  if (quota.status === 'stale') return { state: 'stale', stateLabel: hasReading ? '上次数据' : '未连接' }
  if (!hasReading) return { state: 'empty', stateLabel: quota.status === 'idle' ? '未连接' : '暂无额度' }
  return { state: 'ready', stateLabel: '' }
}

export function buildCodexCompactPresentation(input: CodexPresentationInput): CodexCompactPresentation {
  const readings = [reading('short', input.quota.short), reading('weekly', input.quota.weekly)]
    .filter((item): item is CodexQuotaReading => item !== null)
    .sort((left, right) => {
      const leftReset = left.bucket.resetAt || Number.MAX_SAFE_INTEGER
      const rightReset = right.bucket.resetAt || Number.MAX_SAFE_INTEGER
      if (leftReset !== rightReset) return leftReset - rightReset
      return (left.bucket.windowMinutes || Number.MAX_SAFE_INTEGER) - (right.bucket.windowMinutes || Number.MAX_SAFE_INTEGER)
    })
  const primary = readings[0] || null
  const secondary = readings[1] || null
  const showTasks = input.conversationInboxEnabled && input.compactFields.includes('tasks')
  const ongoingCount = showTasks ? input.conversations.ongoingCount : 0
  const unknownCount = showTasks ? input.conversations.unknownCount : 0
  const attentionCount = showTasks ? input.conversations.attentionCount : 0
  const pendingCount = showTasks ? input.conversations.pendingCount : 0
  const state = quotaState(input.quota, primary !== null)
  const quotaDescription = primary
    ? `${primary.longLabel}剩余 ${primary.bucket.remainingPercent}%${secondary ? `，${secondary.longLabel}剩余 ${secondary.bucket.remainingPercent}%` : ''}`
    : state.stateLabel
  const taskParts = showTasks
    ? [
        ongoingCount ? `${ongoingCount} 个进行中或等待操作` : '',
        unknownCount ? `${unknownCount} 个状态未知` : '',
        attentionCount ? `${attentionCount} 个需关注` : '',
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
