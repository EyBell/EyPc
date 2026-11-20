'use strict'

const SQLITE_BIN_CANDIDATES = Object.freeze([
  '/usr/bin/sqlite3',
  '/opt/homebrew/bin/sqlite3',
  '/usr/local/bin/sqlite3'
])

function resolveSqliteBin(fs, explicit) {
  if (typeof explicit === 'string' && explicit) return explicit
  if (typeof fs?.existsSync !== 'function') return ''
  return SQLITE_BIN_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || ''
}

function querySqliteCli(dependencies, bin, dbPath, sql, limits) {
  const normalized = String(dbPath).replace(/\\/g, '/')
  const prefix = /^[A-Za-z]:\//.test(normalized) ? 'file:///' : 'file:'
  const args = ['-readonly', '-json', `${prefix}${normalized}?mode=ro`, sql]
  const options = { encoding: 'utf8', timeout: limits.timeout, maxBuffer: limits.maxBuffer }
  const parse = (raw) => {
    const rows = JSON.parse(String(raw || '').trim() || '[]')
    if (!Array.isArray(rows)) throw new Error('sqlite-json-invalid')
    return rows
  }
  if (typeof dependencies.execFile !== 'function') {
    return Promise.resolve().then(() => parse(dependencies.execFileSync(bin, args, options)))
  }
  return new Promise((resolve, reject) => {
    dependencies.execFile(bin, args, options, (error, raw) => {
      if (error) { reject(error); return }
      try { resolve(parse(raw)) } catch (parseError) { reject(parseError) }
    })
  })
}

module.exports = { resolveSqliteBin, querySqliteCli }
