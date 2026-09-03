'use strict'

/**
 * Codex desktop launch for the open-readiness step: how a closed Codex is
 * started before a task deep link is dispatched, and whether that start goes
 * through CodexHost.
 *
 * Why CodexHost matters here: CodexHost takes the Desktop over at launch time
 * only -- `codexhost launch` opens the app with `CODEX_CLI_PATH` pointing at
 * the codexhost shim and the `CODEXHOST_*` runtime environment. A Desktop
 * cold-started by a deep link or the Dock runs without the Host, its
 * extra processes never appear, and a later `codexhost launch` refuses to
 * attach. The lane therefore launches through CodexHost first, waits for the
 * Desktop process and the Host descriptor, and only then lets the deep link
 * go. Whether the running Desktop was launched that way is read from its
 * process environment.
 *
 * The `codexhost` CLI location cannot come from the running Host (there is
 * none when we need to launch), so it is resolved from a manual preference,
 * the path last observed on a Host rendezvous, the environment, well-known
 * install locations and PATH -- the launch-path-preference precedent.
 *
 * `fs`/`os`/`path`/`process`/`execFile`/`spawn` are injected on the
 * node-runtime precedent; `utools` and `storageKey` on the launch-path
 * precedent (the vm sandbox resolves `globalThis.utools` to a different
 * realm). Diagnostics never carry paths, pids or tokens.
 */

const CODEX_DESKTOP_LAUNCH_REVISION = 'codex-desktop-launch-v1'
const CODEX_DESKTOP_BUNDLE_ID = 'com.openai.codex'
const CODEX_DESKTOP_EXECUTABLES = ['Codex', 'ChatGPT']
const CODEXHOST_DESCRIPTOR_FILE = 'desktop-runtime-v1.json'
/** Environment the launcher injects into a Desktop it manages (desktop_launch.rs). */
const CODEXHOST_MANAGED_ENV_PATTERN = /(?:^|\s)(?:CODEXHOST_LAUNCHER_PID=\d+|CODEX_CLI_PATH=\S*codexhost)/
const CODEXHOST_DETECTION_TTL_MS = 5_000
const CODEXHOST_READY_TIMEOUT_MS = 40_000
const CODEXHOST_STDERR_LIMIT = 4096
const OPEN_COMMAND_TIMEOUT_MS = 10_000
const CODEXHOST_SOURCE_LABELS = {
  manual: '手动指定的位置',
  observed: '上次会合点观察到的位置',
  configured: '环境变量指定位置',
  local: '用户目录默认位置',
  homebrew: 'Homebrew 默认位置',
  cargo: 'Cargo 默认位置',
  volta: 'Volta 默认位置',
  bun: 'Bun 默认位置',
  nvm: 'NVM 版本目录',
  app: '应用包内',
  path: '系统 PATH',
  unknown: '未识别位置'
}

function firstLine(text) {
  const line = String(text || '').split(/\r?\n/).map((item) => item.trim()).find(Boolean) || ''
  return line.replace(/^codexhost launcher:\s*/i, '').slice(0, 160)
}

function createCodexDesktopLaunch(dependencies = {}) {
  const fs = dependencies.fs || require('node:fs')
  const os = dependencies.os || require('node:os')
  const pathApi = dependencies.path || require('node:path')
  const host = dependencies.process || process
  const execFile = dependencies.execFile
  const spawn = dependencies.spawn
  const utools = dependencies.utools || null
  const storageKey = dependencies.storageKey
  const now = typeof dependencies.now === 'function' ? dependencies.now : Date.now
  const setTimer = typeof dependencies.setTimeout === 'function' ? dependencies.setTimeout : setTimeout
  const clearTimer = typeof dependencies.clearTimeout === 'function' ? dependencies.clearTimeout : clearTimeout
  const record = typeof dependencies.record === 'function' ? dependencies.record : () => {}
  const probeExactProcess = dependencies.probeExactProcess
  const run = dependencies.run
  const desktopIpcEndpoint = typeof dependencies.desktopIpcEndpoint === 'function' ? dependencies.desktopIpcEndpoint : () => ''
  if (typeof storageKey !== 'string' || !storageKey) {
    throw new TypeError('codex desktop launch requires storageKey')
  }
  /** { at, mode } for desktopLaunchMode(); a few seconds is enough between polls. */
  let desktopModeCache = null

  function note(level, outcome, details) {
    try {
      record({ level, scope: 'task-action', event: 'codex-desktop-launch', outcome, provider: 'codex', details: details || {} })
    } catch {}
  }

  function isFile(pathValue) {
    try { return fs.statSync(pathValue).isFile() } catch { return false }
  }

  function normalizeManualPath(value) {
    const candidate = typeof value === 'string' ? value.trim() : ''
    if (!candidate || candidate.length > 4096 || candidate.includes('\u0000')) return ''
    if (!pathApi.isAbsolute(candidate)) return ''
    return pathApi.normalize(candidate)
  }

  function readPreference() {
    try {
      if (!utools || !utools.dbStorage) return { version: 1 }
      const saved = utools.dbStorage.getItem(storageKey)
      if (!saved || typeof saved !== 'object') return { version: 1 }
      return {
        version: 1,
        ...(normalizeManualPath(saved.path) ? { path: normalizeManualPath(saved.path) } : {}),
        ...(normalizeManualPath(saved.observedPath) ? { observedPath: normalizeManualPath(saved.observedPath) } : {}),
        ...(Number.isFinite(Number(saved.observedAt)) && Number(saved.observedAt) > 0 ? { observedAt: Math.trunc(Number(saved.observedAt)) } : {})
      }
    } catch {
      return { version: 1 }
    }
  }

  function writePreference(value) {
    try {
      if (!utools || !utools.dbStorage) return false
      utools.dbStorage.setItem(storageKey, value)
      return true
    } catch {
      return false
    }
  }

  /** Remembers the CLI path a Host rendezvous exposed; a manual path always wins over it. */
  function rememberObservedCliPath(cliPath) {
    const observed = normalizeManualPath(cliPath)
    if (!observed) return false
    const preference = readPreference()
    if (preference.observedPath === observed) return false
    return writePreference({ ...preference, version: 1, observedPath: observed, observedAt: now() })
  }

  function readCodexhostPathPreference() {
    return readPreference()
  }

  function writeCodexhostManualPath(value) {
    const manual = normalizeManualPath(value)
    if (!manual) return ''
    const preference = readPreference()
    writePreference({ ...preference, version: 1, path: manual })
    return manual
  }

  function clearCodexhostManualPath() {
    const preference = readPreference()
    delete preference.path
    return writePreference({ ...preference, version: 1 })
  }

  function homeDirectory() {
    try { return os.homedir() } catch { return '' }
  }

  function pathDirectories() {
    const env = host.env || {}
    const key = Object.keys(env).find((name) => name.toLowerCase() === 'path')
    const value = key && typeof env[key] === 'string' ? env[key] : ''
    return value.split(pathApi.delimiter).filter(Boolean)
  }

  function nvmBinDirectories(home) {
    try {
      const root = pathApi.join(home, '.nvm', 'versions', 'node')
      return fs.readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry && typeof entry.isDirectory === 'function' && entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .map((version) => pathApi.join(root, version, 'bin'))
    } catch {
      return []
    }
  }

  function wellKnownDirectories() {
    const home = homeDirectory()
    if (!home) return []
    return [
      { directory: pathApi.join(home, '.local', 'bin'), source: 'local' },
      { directory: '/opt/homebrew/bin', source: 'homebrew' },
      { directory: '/usr/local/bin', source: 'homebrew' },
      { directory: pathApi.join(home, '.cargo', 'bin'), source: 'cargo' },
      { directory: pathApi.join(home, '.volta', 'bin'), source: 'volta' },
      { directory: pathApi.join(home, '.bun', 'bin'), source: 'bun' },
      ...nvmBinDirectories(home).map((directory) => ({ directory, source: 'nvm' }))
    ]
  }

  /**
   * `{ path, source, state }` for the codexhost CLI, or `{ path: '', ... }`
   * when nothing usable exists. A manual path that is not a file blocks the
   * search, the same way the Codex CLI preference does.
   */
  function resolveCodexhostCliPath() {
    const preference = readPreference()
    if (preference.path) {
      return isFile(preference.path)
        ? { path: preference.path, source: 'manual', state: 'manual-valid' }
        : { path: '', source: 'manual', state: 'manual-invalid' }
    }
    if (host.platform !== 'darwin' && host.platform !== 'linux') {
      return { path: '', source: 'unknown', state: 'unavailable' }
    }
    if (preference.observedPath && isFile(preference.observedPath)) {
      return { path: preference.observedPath, source: 'observed', state: 'observed' }
    }
    const env = host.env || {}
    const candidates = []
    if (typeof env.CODEXHOST_CLI_PATH === 'string' && env.CODEXHOST_CLI_PATH.trim()) {
      candidates.push({ path: env.CODEXHOST_CLI_PATH.trim(), source: 'configured' })
    }
    for (const entry of wellKnownDirectories()) candidates.push({ path: pathApi.join(entry.directory, 'codexhost'), source: entry.source })
    for (const directory of pathDirectories()) candidates.push({ path: pathApi.join(directory, 'codexhost'), source: 'path' })
    for (const candidate of candidates) {
      if (!candidate.path || !pathApi.isAbsolute(candidate.path)) continue
      if (isFile(candidate.path)) return { path: candidate.path, source: candidate.source, state: 'discovered' }
    }
    return { path: '', source: 'unknown', state: 'missing' }
  }

  async function desktopProcessIds() {
    if (typeof run !== 'function') return []
    const pids = []
    for (const executable of CODEX_DESKTOP_EXECUTABLES) {
      const result = await run('/usr/bin/pgrep', ['-x', executable])
      for (const line of String(result?.stdout || '').split(/\r?\n/)) {
        const pid = Number(line.trim())
        if (Number.isInteger(pid) && pid > 0) pids.push(pid)
      }
    }
    return pids
  }

  /**
   * `managed` when the running Desktop carries the launcher's environment,
   * `plain` when it runs without it, `closed` when there is no Desktop.
   */
  async function desktopLaunchMode() {
    if (host.platform !== 'darwin' && host.platform !== 'linux') return 'unknown'
    if (desktopModeCache && now() - desktopModeCache.at < CODEXHOST_DETECTION_TTL_MS) return desktopModeCache.mode
    let mode = 'unknown'
    try {
      const pids = await desktopProcessIds()
      if (pids.length === 0) mode = 'closed'
      else {
        mode = 'plain'
        for (const pid of pids) {
          const result = await run('ps', ['eww', '-p', String(pid), '-o', 'command='])
          if (CODEXHOST_MANAGED_ENV_PATTERN.test(String(result?.stdout || ''))) {
            mode = 'managed'
            break
          }
        }
      }
    } catch {
      mode = 'unknown'
    }
    desktopModeCache = { at: now(), mode }
    return mode
  }

  function descriptorPath() {
    if (host.platform !== 'darwin') return ''
    const home = homeDirectory()
    return home ? pathApi.join(home, 'Library', 'Application Support', 'codexhost', CODEXHOST_DESCRIPTOR_FILE) : ''
  }

  /** The Host descriptor exists and the launcher it names is alive. */
  function hostReady() {
    const file = descriptorPath()
    if (!file) return false
    try {
      const descriptor = JSON.parse(String(fs.readFileSync(file, 'utf8')))
      const pid = Number(descriptor && descriptor.launcher_pid)
      if (!Number.isInteger(pid) || pid <= 0) return false
      host.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  function hostRuntimeState() {
    if (host.platform !== 'darwin') return 'unknown'
    return hostReady() ? 'running' : 'not-running'
  }

  async function detectCodexhost() {
    return { desktop: await desktopLaunchMode(), cli: resolveCodexhostCliPath(), descriptor: hostReady() }
  }

  function modeFrom(readSettings) {
    try {
      const settings = readSettings()
      const mode = settings && typeof settings === 'object' ? settings.codexhostLaunch : undefined
      return mode === 'on' || mode === 'off' ? mode : 'auto'
    } catch {
      return 'auto'
    }
  }

  function effectiveFor(mode, detection) {
    if (mode === 'on') return true
    if (mode === 'off') return false
    return Boolean(detection.cli.path) || detection.descriptor || detection.desktop === 'managed'
  }

  async function probeDesktop() {
    if (host.platform === 'darwin' || host.platform === 'linux') {
      if (typeof probeExactProcess !== 'function') return 'unknown'
      for (const executable of CODEX_DESKTOP_EXECUTABLES) {
        if (await probeExactProcess('/usr/bin/pgrep', ['-x', executable])) return 'running'
      }
      // A closed Desktop outdates any cached launch-mode verdict at once.
      desktopModeCache = null
      return 'closed'
    }
    if (host.platform === 'win32') {
      if (typeof run !== 'function') return 'unknown'
      const systemRoot = host.env && typeof host.env.SystemRoot === 'string' ? host.env.SystemRoot : 'C:\\Windows'
      const result = await run(`${systemRoot}\\System32\\tasklist.exe`, ['/NH', '/FO', 'CSV'])
      if (!result || (!result.ok && !result.stdout)) return 'unknown'
      return /"(?:ChatGPT|Codex)\.exe"/i.test(String(result.stdout || '')) ? 'running' : 'closed'
    }
    return 'unknown'
  }

  /** The Desktop's own app-server socket is the sign it can take a thread deep link. */
  function settleDesktop() {
    const endpoint = desktopIpcEndpoint()
    if (!endpoint) return true
    try { return fs.existsSync(endpoint) } catch { return false }
  }

  function openApp(args) {
    return new Promise((resolve) => {
      if (typeof execFile !== 'function') {
        resolve(false)
        return
      }
      try {
        execFile('open', args, { timeout: OPEN_COMMAND_TIMEOUT_MS }, (error) => resolve(!error))
      } catch {
        resolve(false)
      }
    })
  }

  async function launchNative() {
    if (host.platform !== 'darwin') return { ok: false, code: 'unsupported', launcher: 'unsupported' }
    if (await openApp(['-b', CODEX_DESKTOP_BUNDLE_ID])) return { ok: true, launcher: 'open-b' }
    for (const name of CODEX_DESKTOP_EXECUTABLES) {
      if (await openApp(['-a', name])) return { ok: true, launcher: 'open-a' }
    }
    return { ok: false, code: 'launch-failed', launcher: 'open-b', message: '无法启动 Codex，未跳转' }
  }

  function augmentedPath() {
    const directories = wellKnownDirectories().map((entry) => entry.directory)
    const existing = pathDirectories()
    return [...directories, ...existing].filter((directory, index, list) => list.indexOf(directory) === index).join(pathApi.delimiter)
  }

  function launchEnvironment() {
    return { ...(host.env || {}), PATH: augmentedPath(), CODEXHOST_REFUSE_RUNNING_DESKTOP: '1' }
  }

  /**
   * Detached `codexhost launch`. The launcher prints one `ready` line and keeps
   * supervising, so success is that line (or a clean exit); a non-zero exit
   * carries the launcher's own refusal on stderr.
   */
  function spawnCodexhostLaunch(cliPath) {
    return new Promise((resolve) => {
      if (typeof spawn !== 'function') {
        resolve({ ok: false, code: 'launch-failed', launcher: 'codexhost', message: '无法启动 codexhost，未跳转' })
        return
      }
      let settled = false
      let stdout = ''
      let stderr = ''
      let child = null
      let timer = null
      const finish = (value) => {
        if (settled) return
        settled = true
        if (timer) clearTimer(timer)
        try { child?.stdout?.destroy() } catch {}
        try { child?.stderr?.destroy() } catch {}
        resolve(value)
      }
      try {
        child = spawn(cliPath, ['launch'], {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: launchEnvironment(),
          windowsHide: true
        })
      } catch {
        finish({ ok: false, code: 'launch-failed', launcher: 'codexhost', message: '无法启动 codexhost，未跳转' })
        return
      }
      timer = setTimer(() => finish({ ok: true, launcher: 'codexhost' }), CODEXHOST_READY_TIMEOUT_MS)
      child.on('error', () => finish({ ok: false, code: 'launch-failed', launcher: 'codexhost', message: '无法启动 codexhost，未跳转' }))
      child.stdout?.on('data', (chunk) => {
        stdout = (stdout + String(chunk)).slice(-CODEXHOST_STDERR_LIMIT)
        if (/(?:^|\n)ready\r?\n/.test(stdout)) finish({ ok: true, launcher: 'codexhost' })
      })
      child.stderr?.on('data', (chunk) => {
        stderr = (stderr + String(chunk)).slice(0, CODEXHOST_STDERR_LIMIT)
      })
      child.on('exit', (code) => {
        if (code === 0) {
          finish({ ok: true, launcher: 'codexhost' })
          return
        }
        const reason = firstLine(stderr)
        finish({
          ok: false,
          code: 'codexhost-launch-refused',
          launcher: 'codexhost',
          message: reason ? `CodexHost 拒绝启动：${reason}` : 'CodexHost 拒绝启动，未跳转'
        })
      })
      try { child.unref() } catch {}
    })
  }

  /**
   * Launch through CodexHost. Never called while a Desktop process exists: the
   * launcher would force-stop it. Without a resolvable CLI nothing is started:
   * a plain `open -b` would give a Desktop the Host can no longer attach to.
   */
  async function launchViaCodexhost() {
    if (host.platform !== 'darwin') return { ok: false, code: 'unsupported', launcher: 'unsupported' }
    if (await probeDesktop() === 'running') return { ok: false, code: 'desktop-present', launcher: 'codexhost' }
    const cli = resolveCodexhostCliPath()
    if (cli.path) {
      note('info', 'codexhost-launch', { cliSource: cli.source })
      return spawnCodexhostLaunch(cli.path)
    }
    note('warn', 'codexhost-cli-missing', { cliState: cli.state })
    return {
      ok: false,
      code: 'codexhost-cli-missing',
      launcher: 'codexhost',
      message: '未找到 codexhost 命令，未启动 Codex；请在「运行」页填写 codexhost 位置或关闭「通过 CodexHost 打开 Codex」'
    }
  }

  async function inspect(readSettings) {
    const mode = modeFrom(readSettings)
    const detection = await detectCodexhost()
    return {
      mode,
      effective: effectiveFor(mode, detection),
      desktop: detection.desktop,
      cliState: detection.cli.state,
      cliSource: detection.cli.source,
      runtimeState: hostRuntimeState()
    }
  }

  /** The readiness strategy for Codex, reading the mode at each launch. */
  function strategy(readSettings) {
    const effective = async () => effectiveFor(modeFrom(readSettings), await detectCodexhost())
    return {
      label: 'Codex',
      probe: probeDesktop,
      launch: async () => ((await effective()) ? launchViaCodexhost() : launchNative()),
      settle: async () => ((await effective()) ? hostReady() && settleDesktop() : settleDesktop())
    }
  }

  return {
    revision: CODEX_DESKTOP_LAUNCH_REVISION,
    probeDesktop,
    settleDesktop,
    desktopLaunchMode,
    detectCodexhost,
    hostReady,
    hostRuntimeState,
    resolveCodexhostCliPath,
    rememberObservedCliPath,
    readCodexhostPathPreference,
    writeCodexhostManualPath,
    clearCodexhostManualPath,
    launchNative,
    launchViaCodexhost,
    inspect,
    strategy
  }
}

module.exports = {
  CODEX_DESKTOP_LAUNCH_REVISION,
  CODEX_DESKTOP_BUNDLE_ID,
  CODEX_DESKTOP_EXECUTABLES,
  CODEXHOST_READY_TIMEOUT_MS,
  CODEXHOST_SOURCE_LABELS,
  createCodexDesktopLaunch
}
