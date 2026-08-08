'use strict'

const { claudeAppDataRoot } = require('./app-paths.cjs')

const PLAN_USAGE_FILE_NAME = 'plan-usage-history.json'
const PLAN_USAGE_MAX_BYTES = 4 * 1024 * 1024

function percentOf(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, value))
}

function createPlanUsageReader(dependencies) {
  const fs = dependencies.fs
  const path = dependencies.path

  function read() {
    const filePath = path.join(claudeAppDataRoot(dependencies), PLAN_USAGE_FILE_NAME)
    let stat
    try { stat = fs.statSync(filePath) } catch { return null }
    if (!stat.isFile() || stat.size > PLAN_USAGE_MAX_BYTES) return null
    let parsed
    try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
    const samples = parsed && Array.isArray(parsed.samples) ? parsed.samples : null
    if (!samples || !samples.length) return null
    let newest = null
    for (const sample of samples) {
      if (!sample || typeof sample !== 'object') continue
      const at = Number(sample.t)
      if (!Number.isFinite(at) || at <= 0) continue
      if (!newest || at > newest.at) newest = { at, usage: sample.u }
    }
    if (!newest) return null
    const usage = newest.usage && typeof newest.usage === 'object' ? newest.usage : {}
    const fiveHourUsedPercent = percentOf(usage.fh)
    const sevenDayUsedPercent = percentOf(usage.sd)
    if (fiveHourUsedPercent === null && sevenDayUsedPercent === null) return null
    return { at: newest.at, fiveHourUsedPercent, sevenDayUsedPercent }
  }

  return { read }
}

module.exports = { PLAN_USAGE_FILE_NAME, PLAN_USAGE_MAX_BYTES, createPlanUsageReader }
