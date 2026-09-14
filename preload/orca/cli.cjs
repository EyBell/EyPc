'use strict'

/**
 * Resolve and invoke the Orca CLI. Linux must never fall through to the GNOME
 * screen reader at `/usr/bin/orca`. Conversation bodies are never requested.
 */

const ORCA_CLI_REVISION = 'orca-cli-v1'
const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_MAX_BUFFER = 8 * 1024 * 1024
const LINUX_SCREEN_READER = '/usr/bin/orca'

function textOf(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveOrcaExecutable(dependencies = {}) {
  const env = dependencies.env && typeof dependencies.env === 'object' ? dependencies.env : {}
  const override = textOf(env.ORCA_CLI_COMMAND)
  if (override) return override
  const platform = textOf(dependencies.platform) || (typeof process === 'object' && process.platform) || ''
  const which = typeof dependencies.which === 'function' ? dependencies.which : null
  if (typeof which === 'function') {
    const found = textOf(which('orca'))
    if (found && !(platform === 'linux' && found === LINUX_SCREEN_READER)) return found
  }
  const fs = dependencies.fs
  const candidates = platform === 'darwin'
    ? ['/opt/homebrew/bin/orca', '/usr/local/bin/orca']
    : platform === 'linux'
      ? ['/usr/local/bin/orca', '/opt/orca/bin/orca']
      : []
  if (fs && typeof fs.existsSync === 'function') {
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }
  }
  if (platform === 'linux') return ''
  return 'orca'
}

function parseEnvelope(raw) {
  const text = String(raw || '').trim()
  if (!text) return { ok: false, error: { code: 'empty', message: 'Orca CLI 无输出' } }
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: { code: 'invalid-json', message: 'Orca CLI 输出不是对象' } }
    }
    return parsed
  } catch {
    return { ok: false, error: { code: 'invalid-json', message: '无法解析 Orca CLI JSON' } }
  }
}

function createOrcaCli(dependencies = {}) {
  const execFile = dependencies.execFile
  const timeoutMs = Number(dependencies.timeoutMs) > 0 ? Math.trunc(Number(dependencies.timeoutMs)) : DEFAULT_TIMEOUT_MS
  const executable = resolveOrcaExecutable(dependencies)

  function run(args, options = {}) {
    if (!executable) {
      return Promise.resolve({ ok: false, error: { code: 'missing-cli', message: '未找到 Orca CLI' } })
    }
    if (typeof execFile !== 'function') {
      return Promise.resolve({ ok: false, error: { code: 'exec-unavailable', message: '无法调用 Orca CLI' } })
    }
    const argv = Array.isArray(args) ? args.filter((value) => typeof value === 'string') : []
    return new Promise((resolve) => {
      try {
        execFile(executable, argv, {
          timeout: Number(options.timeoutMs) > 0 ? Math.trunc(Number(options.timeoutMs)) : timeoutMs,
          maxBuffer: DEFAULT_MAX_BUFFER,
          encoding: 'utf8'
        }, (error, stdout, stderr) => {
          const envelope = parseEnvelope(stdout)
          if (envelope.ok === true) {
            resolve(envelope)
            return
          }
          if (error && envelope.error && envelope.error.code) {
            resolve(envelope)
            return
          }
          resolve({
            ok: false,
            error: envelope.error && envelope.error.code
              ? envelope.error
              : {
                  code: error && error.killed ? 'timeout' : (error ? 'exec-failed' : (envelope.error && envelope.error.code) || 'failed'),
                  message: textOf(envelope.error && envelope.error.message)
                    || textOf(stderr)
                    || (error && error.message ? String(error.message) : 'Orca CLI 调用失败')
                }
          })
        })
      } catch (error) {
        resolve({
          ok: false,
          error: { code: 'exec-failed', message: error && error.message ? String(error.message) : 'Orca CLI 调用失败' }
        })
      }
    })
  }

  return {
    revision: ORCA_CLI_REVISION,
    executable,
    available: Boolean(executable),
    run,
    json(args, options) {
      const argv = Array.isArray(args) ? [...args] : []
      if (!argv.includes('--json')) argv.push('--json')
      return run(argv, options)
    }
  }
}

module.exports = {
  ORCA_CLI_REVISION,
  LINUX_SCREEN_READER,
  resolveOrcaExecutable,
  parseEnvelope,
  createOrcaCli
}
