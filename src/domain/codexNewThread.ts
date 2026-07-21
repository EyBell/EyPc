import {
  emptyCodexModelCatalog,
  normalizeCodexQuota,
  type CodexModelCatalogEntry,
  type CodexModelCatalogSnapshotV1,
  type CodexQuotaBucket,
  type CodexQuotaPool,
  type CodexQuotaSnapshotV1,
  type CodexResolvedNewThreadModel
} from './codex'

const MODEL_ID = /^[A-Za-z0-9._:-]{1,120}$/

export function isSparkModelId(value: string): boolean {
  return /(?:^|[-_.])spark(?:$|[-_.])/i.test(value)
}

export function normalizeCodexModelCatalog(value: unknown): CodexModelCatalogSnapshotV1 {
  if (!value || typeof value !== 'object') return emptyCodexModelCatalog()
  const source = value as Record<string, unknown>
  const rows = Array.isArray(source.models) ? source.models : []
  const seen = new Set<string>()
  const models = rows.flatMap((value): CodexModelCatalogEntry[] => {
    if (!value || typeof value !== 'object') return []
    const row = value as Record<string, unknown>
    const id = typeof row.id === 'string' && MODEL_ID.test(row.id) ? row.id : ''
    if (!id || seen.has(id)) return []
    seen.add(id)
    return [{
      id,
      displayName: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName.trim().slice(0, 160) : id,
      description: typeof row.description === 'string' ? row.description.trim().slice(0, 240) : '',
      family: row.family === 'spark' || isSparkModelId(id) ? 'spark' : 'normal',
      isDefault: row.isDefault === true,
      supportsText: row.supportsText !== false
    }]
  }).filter((model) => model.supportsText).slice(0, 80)
  const status = source.status === 'ok' || source.status === 'stale' || source.status === 'error' ? source.status : models.length ? 'ok' : 'idle'
  return {
    version: 1,
    status,
    models,
    fingerprint: typeof source.fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(source.fingerprint) ? source.fingerprint.toLowerCase() : '',
    updatedAt: typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt) && source.updatedAt > 0 ? source.updatedAt : 0,
    ...(typeof source.errorCode === 'string' ? { errorCode: source.errorCode.slice(0, 80) } : {})
  }
}

function positive(bucket: CodexQuotaBucket | null): bucket is CodexQuotaBucket {
  return Boolean(bucket && bucket.remainingPercent > 0)
}

export function quotaPoolRemaining(pool: CodexQuotaPool): number {
  return Math.max(pool.short?.remainingPercent ?? -1, pool.weekly?.remainingPercent ?? -1, 0)
}

export function highestSparkQuotaPool(quotaValue: CodexQuotaSnapshotV1): CodexQuotaPool | null {
  const quota = normalizeCodexQuota(quotaValue)
  return [...quota.spark]
    .filter((pool) => positive(pool.short) || positive(pool.weekly))
    .sort((left, right) => quotaPoolRemaining(right) - quotaPoolRemaining(left)
      || (left.short?.resetAt || Number.MAX_SAFE_INTEGER) - (right.short?.resetAt || Number.MAX_SAFE_INTEGER)
      || left.limitId.localeCompare(right.limitId))[0] || null
}

export function quotaBucketForPool(pool: CodexQuotaPool): { bucket: CodexQuotaBucket | null; label: string } {
  if (positive(pool.short)) return { bucket: pool.short, label: pool.family === 'spark' ? 'Spark 5 小时额度' : '普通 5 小时额度' }
  if (positive(pool.weekly)) return { bucket: pool.weekly, label: pool.family === 'spark' ? 'Spark 周额度' : '普通周额度' }
  if (pool.short) return { bucket: pool.short, label: pool.family === 'spark' ? 'Spark 5 小时额度' : '普通 5 小时额度' }
  if (pool.weekly) return { bucket: pool.weekly, label: pool.family === 'spark' ? 'Spark 周额度' : '普通周额度' }
  return { bucket: null, label: pool.family === 'spark' ? 'Spark 额度未返回' : '普通额度未返回' }
}

export function ordinaryQuotaExhausted(quotaValue: CodexQuotaSnapshotV1): boolean {
  const quota = normalizeCodexQuota(quotaValue)
  return [quota.normal.short, quota.normal.weekly].some((bucket) => bucket !== null && bucket.remainingPercent === 0)
}

function manualRequired(reason: 'spark-unavailable' | 'catalog-empty'): CodexResolvedNewThreadModel {
  return {
    status: 'manual-required',
    modelId: '',
    modelName: '',
    family: reason === 'spark-unavailable' ? 'spark' : 'normal',
    reason,
    quota: null,
    quotaLabel: reason === 'spark-unavailable' ? '普通额度已用完，Spark 当前不可用' : '模型目录暂不可用'
  }
}

export function resolveCodexNewThreadModel(input: {
  quota: CodexQuotaSnapshotV1
  modelCatalog: CodexModelCatalogSnapshotV1
  preferredModelId?: string
}): CodexResolvedNewThreadModel {
  const quota = normalizeCodexQuota(input.quota)
  const catalog = normalizeCodexModelCatalog(input.modelCatalog)
  if (!catalog.models.length) return manualRequired('catalog-empty')

  if (ordinaryQuotaExhausted(quota)) {
    const sparkQuota = highestSparkQuotaPool(quota)
    const sparkModels = catalog.models.filter((model) => model.family === 'spark')
    const model = sparkModels.find((item) => item.id === 'gpt-5.3-codex-spark') || sparkModels.find((item) => item.isDefault) || sparkModels[0]
    if (!sparkQuota || !model) return manualRequired('spark-unavailable')
    const reading = quotaBucketForPool(sparkQuota)
    return {
      status: 'ready',
      modelId: model.id,
      modelName: model.displayName,
      family: 'spark',
      reason: 'quota-spark',
      quota: reading.bucket,
      quotaLabel: reading.label
    }
  }

  const normalModels = catalog.models.filter((model) => model.family === 'normal')
  const preferred = normalModels.find((model) => model.id === input.preferredModelId)
  const model = preferred || normalModels.find((item) => item.isDefault) || normalModels[0]
  if (!model) return manualRequired('catalog-empty')
  const reading = quotaBucketForPool(quota.normal)
  return {
    status: 'ready',
    modelId: model.id,
    modelName: model.displayName,
    family: 'normal',
    reason: preferred ? 'preferred-normal' : model.isDefault ? 'default-normal' : 'first-normal',
    quota: reading.bucket,
    quotaLabel: reading.label
  }
}

export function resolveManualCodexModel(input: {
  modelId: string
  quota: CodexQuotaSnapshotV1
  modelCatalog: CodexModelCatalogSnapshotV1
}): CodexResolvedNewThreadModel | null {
  const catalog = normalizeCodexModelCatalog(input.modelCatalog)
  const model = catalog.models.find((item) => item.id === input.modelId)
  if (!model) return null
  const quota = normalizeCodexQuota(input.quota)
  const pool = model.family === 'spark' ? highestSparkQuotaPool(quota) : quota.normal
  const reading = pool ? quotaBucketForPool(pool) : { bucket: null, label: '对应额度未返回' }
  return {
    status: 'ready',
    modelId: model.id,
    modelName: model.displayName,
    family: model.family,
    reason: 'manual-selection',
    quota: reading.bucket,
    quotaLabel: reading.label
  }
}

export function codexModelReasonLabel(model: CodexResolvedNewThreadModel): string {
  if (model.reason === 'preferred-normal') return '普通额度可用，采用配置的首选模型'
  if (model.reason === 'default-normal') return '普通额度可用，采用目录默认模型'
  if (model.reason === 'first-normal') return '普通额度可用，采用首个可用的非 Spark 模型'
  if (model.reason === 'quota-spark') return '普通额度窗口已用完，自动切换到最高可用 Spark'
  if (model.reason === 'manual-selection') return '仅对本次会话使用手动选择的模型'
  if (model.reason === 'spark-unavailable') return '普通额度已用完，但 Spark 模型或额度不可用'
  return '模型目录暂不可用，请刷新或手动选择'
}
