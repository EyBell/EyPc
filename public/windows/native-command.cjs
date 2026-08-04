'use strict'

function createNativeWindowCommandRunner(options = {}) {
  const execFile = options.execFile
  const defaultTimeoutMs = Math.max(1, Math.trunc(Number(options.timeoutMs) || 5_000))
  const defaultOutputLimit = Math.max(1024, Math.trunc(Number(options.outputLimit) || 1024 * 1024))
  if (typeof execFile !== 'function') throw new TypeError('execFile is required')

  return function runNativeWindowCommand(command, args, commandOptions = {}) {
    const timeout = Math.max(1, Math.trunc(Number(commandOptions.timeoutMs) || defaultTimeoutMs))
    const maxBuffer = Math.max(1024, Math.trunc(Number(commandOptions.outputLimit) || defaultOutputLimit))
    const env = commandOptions.environment && typeof commandOptions.environment === 'object'
      ? { ...process.env, ...commandOptions.environment }
      : process.env
    return new Promise((resolve) => {
      execFile(command, Array.isArray(args) ? args : [], {
        timeout,
        maxBuffer,
        windowsHide: true,
        env
      }, (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          error: error ? String(error.message || error) : ''
        })
      })
    })
  }
}

module.exports = { createNativeWindowCommandRunner }
