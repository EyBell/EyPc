import fs from 'node:fs'
import { normalizeClaudeQuota, claudePrimaryQuotaWindow, mergeClaudePlanUsage, emptyClaudeQuota } from './claude-domain.js'

// 只返回额度窗口，不输出状态栏缓存中的其余内容。
export function readClaudeStatusline(path, now = Date.now(), planSample = null) {
  try {
    const cache = JSON.parse(fs.readFileSync(path, 'utf8'))
    if (cache?.version !== 1 || !cache.rate_limits || typeof cache.rate_limits !== 'object') throw new Error('cache unavailable')
    const updatedAt = Number(cache.updatedAt) || 0
    const quota = mergeClaudePlanUsage(normalizeClaudeQuota(cache.rate_limits, { updatedAt, now }),planSample,now)
    const window = claudePrimaryQuotaWindow(quota)
    if (!window) return { status: 'unavailable' }
    const newestAt = Number(window.updatedAt) || updatedAt
    const stale = window.freshness !== 'fresh' || !newestAt || newestAt > now || now - newestAt > 30 * 60 * 1000
    return { status: stale ? 'stale' : 'fresh', updatedAt:newestAt, source:window.source, primary: stale ? null : window.remainingPercent,
      weekly: !stale && quota.weekly?.freshness === 'fresh' ? quota.weekly.remainingPercent : null,
      resetAt: stale ? null : window.resetAt }
  } catch {
    const quota=mergeClaudePlanUsage(emptyClaudeQuota(),planSample,now)
    const window=claudePrimaryQuotaWindow(quota)
    return window ? { status:'stale', updatedAt:window.updatedAt, source:window.source, primary:null, weekly:null, resetAt:null } : { status:'unavailable' }
  }
}
