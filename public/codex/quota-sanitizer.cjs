'use strict'

/**
 * Turns a Codex App Server rate-limit payload and account payload into the
 * shape the status UI reads: a `normal` pool and any `spark` pools, each with
 * a `short` (<=24h) and `weekly` (>24h) window.
 *
 * Pure computation with no host contact. `record`, `percent`, `number` and
 * `timestampMs` are injected on the rollout-evidence precedent — each is
 * among the hotter helpers in the entry (`codexRecord` alone crosses into the
 * low hundreds of call sites), so they stay there rather than move with this
 * module.
 */

const CODEX_QUOTA_SANITIZER_REVISION = 'codex-quota-sanitizer-v1'
const CODEX_QUOTA_IDENTITY_NAMESPACE = 'eypc-companion-quota-identity/v1/codex'

function normalizeCompanionQuotaEmail(value) {
  if (typeof value !== 'string') return ''
  const email = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function companionQuotaEmailDigest(email, digest) {
  const normalized = normalizeCompanionQuotaEmail(email)
  if (!normalized || typeof digest !== 'function') return ''
  const hash = digest(`${CODEX_QUOTA_IDENTITY_NAMESPACE}\n${normalized}`)
  return typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash) ? hash : ''
}

function companionQuotaDisplayLabel(email) {
  const at = email.lastIndexOf('@')
  if (at <= 0 || at !== email.indexOf('@')) return ''
  const local = [...email.slice(0, at)].slice(0, 4).join('')
  let domain = email.slice(at + 1)
  if (domain.toLowerCase().endsWith('.com')) domain = domain.slice(0, -4)
  if (!local || !domain || domain.includes('@') || /\s/.test(domain)) return ''
  const label = `${local}@${domain}`
  return [...label].length <= 258 ? label : ''
}

function sanitizeCodexQuotaAccount(accountResult, digest) {
  const source = accountResult && typeof accountResult === 'object' ? accountResult : null
  const nested = source && source.account && typeof source.account === 'object' ? source.account : null
  const account = nested || source
  const email = normalizeCompanionQuotaEmail(account && account.email)
  const emailDigest = companionQuotaEmailDigest(email, digest)
  if (!emailDigest) return null
  const workspaceName = account && typeof account.workspaceName === 'string' ? account.workspaceName.trim().slice(0, 160) : ''
  return {
    emailDigest,
    label: companionQuotaDisplayLabel(email),
    ...(workspaceName ? { workspaceName } : {})
  }
}

function sanitizeMagpieQuotaIdentity(provider, digest) {
  const email = normalizeCompanionQuotaEmail(provider && provider.user)
  const emailDigest = companionQuotaEmailDigest(email, digest)
  if (!emailDigest) return null
  const workspaceName = provider && typeof provider.workspaceName === 'string' ? provider.workspaceName.trim().slice(0, 160) : ''
  return {
    emailDigest,
    label: companionQuotaDisplayLabel(email),
    ...(workspaceName ? { workspaceName } : {})
  }
}

function createCodexQuotaSanitizer(dependencies = {}) {
  const record = dependencies.record
  const percent = dependencies.percent
  const number = dependencies.number
  const timestampMs = dependencies.timestampMs
  const digest = dependencies.digest
  if (typeof record !== 'function' || typeof percent !== 'function' || typeof number !== 'function' || typeof timestampMs !== 'function') {
    throw new TypeError('codex quota sanitizer requires record, percent, number and timestampMs')
  }

  function sanitizeCodexQuotaWindow(value) {
    const source = record(value)
    if (!Object.keys(source).length || typeof source.usedPercent !== 'number') return null
    return {
      remainingPercent: percent(100 - source.usedPercent),
      resetAt: timestampMs(source.resetsAt) || null,
      windowMinutes: number(source.windowDurationMins) || null
    }
  }

  function sanitizeCodexQuota(rateResult, accountResult) {
    const rateSource = record(rateResult)
    const byLimit = record(rateSource.rateLimitsByLimitId)
    const pools = Object.entries(byLimit).flatMap(([key, value]) => {
      const source = record(value)
      const limitId = typeof source.limitId === 'string' && source.limitId ? source.limitId.slice(0, 120) : String(key || '').slice(0, 120)
      if (!limitId) return []
      const limitName = typeof source.limitName === 'string' && source.limitName ? source.limitName.slice(0, 160) : limitId
      const family = /spark/i.test(`${limitId} ${limitName}`) || limitId === 'codex_bengalfox' ? 'spark' : 'normal'
      const windows = [sanitizeCodexQuotaWindow(source.primary), sanitizeCodexQuotaWindow(source.secondary)].filter(Boolean)
        .sort((left, right) => (left.windowMinutes || Number.MAX_SAFE_INTEGER) - (right.windowMinutes || Number.MAX_SAFE_INTEGER))
      return [{
        limitId,
        limitName,
        family,
        short: windows.find((window) => window.windowMinutes && window.windowMinutes <= 24 * 60) || null,
        weekly: [...windows].reverse().find((window) => window.windowMinutes && window.windowMinutes > 24 * 60) || null,
        planType: typeof source.planType === 'string' ? source.planType : ''
      }]
    })
    if (!pools.length && Object.keys(record(rateSource.rateLimits)).length) {
      const source = record(rateSource.rateLimits)
      const windows = [sanitizeCodexQuotaWindow(source.primary), sanitizeCodexQuotaWindow(source.secondary)].filter(Boolean)
        .sort((left, right) => (left.windowMinutes || Number.MAX_SAFE_INTEGER) - (right.windowMinutes || Number.MAX_SAFE_INTEGER))
      pools.push({
        limitId: 'codex',
        limitName: 'Codex',
        family: 'normal',
        short: windows.find((window) => window.windowMinutes && window.windowMinutes <= 24 * 60) || null,
        weekly: [...windows].reverse().find((window) => window.windowMinutes && window.windowMinutes > 24 * 60) || null,
        planType: typeof source.planType === 'string' ? source.planType : ''
      })
    }
    const selected = pools.find((pool) => pool.limitId === 'codex') || pools.find((pool) => pool.family === 'normal') || {
      limitId: 'codex', limitName: 'Codex', family: 'normal', short: null, weekly: null, planType: ''
    }
    const normal = { limitId: selected.limitId, limitName: selected.limitName, family: 'normal', short: selected.short, weekly: selected.weekly }
    const spark = pools.filter((pool) => pool.family === 'spark').map((pool) => ({
      limitId: pool.limitId,
      limitName: pool.limitName,
      family: 'spark',
      short: pool.short,
      weekly: pool.weekly
    })).sort((left, right) => Math.max(right.short?.remainingPercent ?? -1, right.weekly?.remainingPercent ?? -1)
      - Math.max(left.short?.remainingPercent ?? -1, left.weekly?.remainingPercent ?? -1) || left.limitId.localeCompare(right.limitId))
    const account = record(record(accountResult).account)
    const plan = typeof selected.planType === 'string' && selected.planType
      ? selected.planType
      : typeof account.planType === 'string'
        ? account.planType
        : ''
    return { plan: plan.slice(0, 64), short: normal.short, weekly: normal.weekly, normal, spark }
  }

  return {
    revision: CODEX_QUOTA_SANITIZER_REVISION,
    sanitizeCodexQuotaWindow,
    sanitizeCodexQuota,
    sanitizeCodexQuotaAccount: (accountResult) => sanitizeCodexQuotaAccount(accountResult, digest),
    sanitizeMagpieQuotaIdentity: (provider) => sanitizeMagpieQuotaIdentity(provider, digest)
  }
}

module.exports = {
  CODEX_QUOTA_SANITIZER_REVISION,
  createCodexQuotaSanitizer
}
