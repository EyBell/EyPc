'use strict'

/**
 * Claude task jump.
 *
 * Claude Code has no deep link, so opening a task is a two-level fallback:
 *
 *  1. Focus the terminal window that owns the session's `claude` process. The
 *     process id comes from a hook event, and the actual focusing is delegated
 *     to the window platform the plugin already ships — this module never
 *     executes native window code itself.
 *  2. Otherwise resume the session in a new terminal via `claude --resume`.
 *
 * Only a confirmed focus is strong enough to be reported as `opened`; a resume
 * is reported as `dispatched`, which the Controller treats as a weaker signal.
 */

const RESUME_TIMEOUT_MS = 8000

function outcome(kind, message, confirmsRead) {
  return {
    outcome: kind,
    confirmsRead: confirmsRead === true,
    message: message || ''
  }
}

function isAliveProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return Boolean(error && error.code === 'EPERM')
  }
}

/**
 * Walks up from the `claude` process to the terminal application that hosts it.
 * A terminal emulator is the first ancestor that is not a shell, so the walk is
 * bounded and stops as soon as it leaves the shell chain.
 */
function resolveTerminalPid(dependencies, pid) {
  const execFileSync = dependencies.execFileSync
  if (typeof execFileSync !== 'function' || !isAliveProcess(pid)) return 0
  const SHELLS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'login', 'node', 'claude'])
  let current = pid
  for (let depth = 0; depth < 8; depth += 1) {
    let output = ''
    try {
      output = String(execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(current)], {
        timeout: 2000,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      })).trim()
    } catch { return 0 }
    if (!output) return 0
    const match = output.match(/^(\d+)\s+(.*)$/)
    if (!match) return 0
    const parentPid = Number(match[1])
    if (!Number.isInteger(parentPid) || parentPid <= 1) return 0
    let parentName = ''
    try {
      parentName = String(execFileSync('ps', ['-o', 'comm=', '-p', String(parentPid)], {
        timeout: 2000,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      })).trim()
    } catch { return 0 }
    const base = parentName.split('/').pop() || ''
    if (base && !SHELLS.has(base.replace(/^-/, ''))) return parentPid
    current = parentPid
  }
  return 0
}

function createOpener(dependencies) {
  const windows = dependencies.windows || null
  const execFile = dependencies.execFile || null

  /** Level 1 — focus the owning terminal window. */
  async function focusTerminal(pid) {
    if (!isAliveProcess(pid)) return outcome('unavailable', '会话进程已结束')
    if (!windows || typeof windows.list !== 'function' || typeof windows.activate !== 'function') {
      return outcome('unavailable', '窗口跳转能力不可用')
    }
    const terminalPid = resolveTerminalPid(dependencies, pid) || pid
    let rows = []
    try {
      const listed = await windows.list()
      rows = Array.isArray(listed) ? listed : (listed && Array.isArray(listed.windows) ? listed.windows : [])
    } catch {
      return outcome('unavailable', '窗口清单读取失败')
    }
    const target = rows.find((row) => row && Number(row.pid) === terminalPid)
    if (!target) return outcome('unavailable', '未找到承载该会话的终端窗口')
    try {
      const result = await windows.activate({ kind: 'root-current', instanceId: target.instanceId, nativeRef: target.nativeRef, pid: terminalPid })
      const ok = result === true || (result && result.outcome === 'ok')
      return ok ? outcome('opened', '', true) : outcome('failed', '终端窗口激活失败')
    } catch {
      return outcome('failed', '终端窗口激活失败')
    }
  }

  /** Level 2 — resume the session in a new terminal. */
  function resumeInTerminal(sessionId, options) {
    const settings = options || {}
    const cliPath = String(settings.cliPath || '').trim()
    const cwd = String(settings.cwd || '').trim()
    if (!cliPath) return Promise.resolve(outcome('unavailable', '未找到 Claude Code CLI'))
    if (typeof execFile !== 'function') return Promise.resolve(outcome('unavailable', '命令派发不可用'))
    const platform = settings.platform || process.platform
    const command = `${JSON.stringify(cliPath)} --resume ${JSON.stringify(sessionId)}`
    const script = cwd ? `cd ${JSON.stringify(cwd)} && ${command}` : command
    return new Promise((resolvePromise) => {
      const done = (value) => resolvePromise(value)
      try {
        if (platform === 'darwin') {
          const applescript = `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(script)}\nend tell`
          execFile('osascript', ['-e', applescript], { timeout: RESUME_TIMEOUT_MS }, (error) => {
            done(error ? outcome('failed', '终端恢复会话失败') : outcome('dispatched', '已在新终端恢复会话'))
          })
          return
        }
        if (platform === 'win32') {
          execFile('cmd', ['/c', 'start', '', 'cmd', '/k', script], { timeout: RESUME_TIMEOUT_MS }, (error) => {
            done(error ? outcome('failed', '终端恢复会话失败') : outcome('dispatched', '已在新终端恢复会话'))
          })
          return
        }
        execFile('x-terminal-emulator', ['-e', 'sh', '-c', script], { timeout: RESUME_TIMEOUT_MS }, (error) => {
          done(error ? outcome('unavailable', '未找到可用终端') : outcome('dispatched', '已在新终端恢复会话'))
        })
      } catch {
        done(outcome('failed', '终端恢复会话失败'))
      }
    })
  }

  async function openTask(sessionId, options) {
    const settings = options || {}
    const focused = await focusTerminal(Number(settings.pid))
    if (focused.outcome === 'opened') return focused
    const resumed = await resumeInTerminal(sessionId, settings)
    if (resumed.outcome === 'dispatched' || resumed.outcome === 'opened') return resumed
    // Report the more informative of the two failures.
    return focused.outcome === 'unavailable' && resumed.outcome !== 'unavailable' ? resumed : focused
  }

  return { focusTerminal, resumeInTerminal, openTask }
}

module.exports = {
  RESUME_TIMEOUT_MS,
  isAliveProcess,
  resolveTerminalPid,
  createOpener
}
