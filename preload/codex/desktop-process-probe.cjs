'use strict'

/**
 * Detects whether the Codex/ChatGPT desktop process is currently running.
 * `codexProbeExactProcess` matches one executable exactly via `pgrep -x` (a
 * hit means present, an exit code equal to the platform's "no match" code
 * means absent -- any other failure is a real error and propagates);
 * `codexDesktopIsRunning` layers the per-platform strategy on top: `pgrep`
 * on macOS/Linux, a `tasklist.exe` scan on Windows.
 *
 * `execFile`, `process` and `run` (the entry's shared subprocess helper) are
 * injected rather than reached for: `run` alone has dozens of call sites
 * elsewhere in the entry, so a load failure here must not reach it, and
 * `process` must be injected explicitly -- read from the global it resolves
 * to a different object inside a vm sandbox than the one the entry sees.
 */

const CODEX_DESKTOP_PROCESS_PROBE_REVISION = 'codex-desktop-process-probe-v1'

function createCodexDesktopProcessProbe(dependencies = {}) {
  const execFile = dependencies.execFile
  const process = dependencies.process
  const run = dependencies.run
  const record = dependencies.record
  if (typeof execFile !== 'function' || typeof run !== 'function' || typeof record !== 'function' || !process) {
    throw new TypeError('codex desktop process probe requires execFile, process, run and record')
  }

  function codexProbeExactProcess(command, args, noMatchCode = 1) {
    return new Promise((resolve, reject) => {
      execFile(command, args, { windowsHide: true, timeout: 3_000 }, (error, stdout) => {
        if (!error) {
          resolve(Boolean(String(stdout || '').trim()))
          return
        }
        const code = record(error).code
        if (code === noMatchCode || String(code) === String(noMatchCode)) {
          resolve(false)
          return
        }
        reject(error)
      })
    })
  }

  async function codexDesktopIsRunning() {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      for (const executable of ['Codex', 'ChatGPT']) {
        if (await codexProbeExactProcess('/usr/bin/pgrep', ['-x', executable])) return true
      }
      return false
    }
    if (process.platform === 'win32') {
      const systemRoot = process.env.SystemRoot || 'C:\\Windows'
      const result = await run(`${systemRoot}\\System32\\tasklist.exe`, ['/NH', '/FO', 'CSV'])
      if (!result.ok && !result.stdout) throw new Error(result.error || 'Codex desktop process check failed')
      return /"(?:ChatGPT|Codex)\.exe"/i.test(result.stdout)
    }
    throw new Error('Codex desktop process check is unsupported')
  }

  return {
    revision: CODEX_DESKTOP_PROCESS_PROBE_REVISION,
    codexProbeExactProcess,
    codexDesktopIsRunning
  }
}

module.exports = {
  CODEX_DESKTOP_PROCESS_PROBE_REVISION,
  createCodexDesktopProcessProbe
}
