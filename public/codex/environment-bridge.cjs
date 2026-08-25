'use strict'

/**
 * Owns Codex Environment Action end to end: resolving a task/project alias
 * to a trusted `.codex/environments` root and execution cwd, listing the
 * TOML-defined actions there, running one (`runCodexProjectEnvironmentAction`),
 * tracking its session/process lifecycle, and the run-record bookkeeping
 * (`createCodexActionRun`/`finishCodexActionRun`/log buffering) that feeds
 * the Action Runner panel.
 *
 * This is a route-3 (RAW-169) closure rewrite. The condition that gated
 * this domain's earlier "circular dependency" concern turned out not to be
 * a real construction-order cycle: `runCodexProjectEnvironmentAction` only
 * *references* `restartCodexEnvironmentActionAfterExit` inside a child
 * process's `exit` handler, deferred via `queueMicrotask` -- and
 * `restartCodexEnvironmentActionAfterExit`'s own call back into
 * `runCodexProjectEnvironmentAction` only happens later, async, in response
 * to that exit. Both functions simply live in this one closure and call
 * each other directly, the same way `archiveCodexProject` calls
 * `archiveCodexThread` inside `archive-bridge.cjs`.
 *
 * Several pieces of state and functions this domain touches are NOT
 * migrated, because they are genuinely owned by, or shared with, other
 * domains:
 * - `codexEnvironmentActionSessions` (the session Map) is injected by
 *   reference rather than migrated: the entry's own
 *   `shouldDeferCodexActionServerClose` and `codexActionRunnerCatalogProjection`
 *   (Action Runner panel domain) read it directly too.
 * - `codexEnvironmentShuttingDown` cannot be shared by reference (a
 *   primitive, not an object) and is read by the entry's own
 *   `shouldDeferCodexActionServerClose` -- injected as a getter/setter pair
 *   (`isShuttingDown`/`setShuttingDown`) instead of migrating the `let`.
 * - `pushCodexActionRunnerSnapshot` and `flushCodexActionDeferredServerClose`
 *   stay in the entry and are injected as function references: the former
 *   reaches directly into the Action Runner panel's window handle and
 *   preferences (a different domain's state), the latter coordinates with
 *   the App Server connection-lifecycle domain (`closeCodexConnections`).
 *   Composing them here, not reimplementing them, is the same "hot
 *   primitives/shared functions don't migrate" discipline used throughout.
 * - `codexEnvironmentToml`/`codexCommandValidation`/`codexActionAuthorization`/
 *   `codexRunDatabase` are already-extracted route-1 module handles,
 *   injected as-is; this closure never reimplements what they already own.
 * - `resolveCodexEnvironmentTargetCwd` and `codexEnvironmentSessionKey` also
 *   stay in the entry, discovered only while wiring the boundary (not in the
 *   original plan): the entry's `codexActionRunnerCatalogProjection` (Action
 *   Runner panel domain, also stays) calls both directly, to resolve a
 *   catalog project's execution cwd and to key into
 *   `codexEnvironmentActionSessions` per action. Injected as function
 *   dependencies under their original names.
 */

function createCodexEnvironmentBridge(dependencies = {}) {
  const fs = dependencies.fs
  const path = dependencies.path
  const os = dependencies.os
  const process = dependencies.process
  const crypto = dependencies.crypto
  const spawn = dependencies.spawn
  const run = dependencies.run
  const codexEnvironmentToml = dependencies.codexEnvironmentToml
  const codexCommandValidation = dependencies.codexCommandValidation
  const codexActionAuthorization = dependencies.codexActionAuthorization
  const codexRunDatabase = dependencies.codexRunDatabase
  const ensureCodexActionRunDatabase = dependencies.ensureCodexActionRunDatabase
  const persistCodexActionRun = dependencies.persistCodexActionRun
  const codexActionRunMemorySnapshot = dependencies.codexActionRunMemorySnapshot
  const codexActionLogStream = dependencies.codexActionLogStream
  const codexActionConsumeDecodedLog = dependencies.codexActionConsumeDecodedLog
  const codexActionFlushLog = dependencies.codexActionFlushLog
  const codexActionUsableFile = dependencies.codexActionUsableFile
  const codexActionPackageManagerEntry = dependencies.codexActionPackageManagerEntry
  const codexActionRuntimeProjection = dependencies.codexActionRuntimeProjection
  const pushCodexActionRunnerSnapshot = dependencies.pushCodexActionRunnerSnapshot
  const flushCodexActionDeferredServerClose = dependencies.flushCodexActionDeferredServerClose
  const isShuttingDown = dependencies.isShuttingDown
  const setShuttingDown = dependencies.setShuttingDown
  const codexEnvironmentActionSessions = dependencies.codexEnvironmentActionSessions
  const CODEX_ACTION_HOST_RUNTIME_REVISION = dependencies.actionHostRuntimeRevision
  // Both stay owned by the entry, not migrated: `codexActionRunnerCatalogProjection`
  // (Action Runner panel domain, stays in the entry) calls them directly too,
  // to resolve a project's execution cwd and to key into
  // `codexEnvironmentActionSessions` for each catalog action's live state.
  const resolveCodexEnvironmentTargetCwd = dependencies.resolveCodexEnvironmentTargetCwd
  const codexEnvironmentSessionKey = dependencies.codexEnvironmentSessionKey

  if (!fs || !path || !os || !process || !crypto || typeof spawn !== 'function' || typeof run !== 'function'
    || typeof ensureCodexActionRunDatabase !== 'function' || typeof persistCodexActionRun !== 'function' || typeof codexActionRunMemorySnapshot !== 'function'
    || typeof codexActionLogStream !== 'function' || typeof codexActionConsumeDecodedLog !== 'function' || typeof codexActionFlushLog !== 'function'
    || typeof codexActionUsableFile !== 'function' || typeof codexActionPackageManagerEntry !== 'function' || typeof codexActionRuntimeProjection !== 'function'
    || typeof pushCodexActionRunnerSnapshot !== 'function' || typeof flushCodexActionDeferredServerClose !== 'function'
    || typeof isShuttingDown !== 'function' || typeof setShuttingDown !== 'function' || !codexEnvironmentActionSessions
    || !CODEX_ACTION_HOST_RUNTIME_REVISION || typeof resolveCodexEnvironmentTargetCwd !== 'function' || typeof codexEnvironmentSessionKey !== 'function') {
    throw new TypeError('codex environment bridge is missing one or more required dependencies')
  }

  // Not a general TOML parser: accepts only the subset Environment files use,
  // and a load failure means every environment file reads as unparseable
  // rather than partially trusted.
  function codexEnvUnquoteTomlString(raw) {
    return codexEnvironmentToml ? codexEnvironmentToml.codexEnvUnquoteTomlString(raw) : String(raw || '').trim()
  }

  function parseCodexEnvironmentTomlText(text) {
    return codexEnvironmentToml ? codexEnvironmentToml.parseCodexEnvironmentTomlText(text) : null
  }

  function codexEnvironmentActionIdFromName(name, index) {
    const slug = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
    return slug || `action-${index + 1}`
  }

  function tokenizeCodexEnvironmentActionCommandHost(command) {
    return codexCommandValidation ? codexCommandValidation.tokenizeCodexEnvironmentActionCommandHost(command) : null
  }

  function validateCodexEnvironmentActionCommandHost(command) {
    return codexCommandValidation ? codexCommandValidation.validateCodexEnvironmentActionCommandHost(command) : null
  }

  function codexEnvironmentIdFromFileName(fileName) {
    const base = String(fileName || '').replace(/\.toml$/i, '').trim().toLowerCase()
    const slug = base.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    return slug || 'environment'
  }

  function rememberCodexEnvironmentCommands(vaultKey, environments) {
    codexActionAuthorization?.rememberCodexEnvironmentCommands(vaultKey, environments)
  }

  function listCodexProjectEnvironments(targetAlias) {
    const resolved = resolveCodexEnvironmentTargetCwd(targetAlias)
    if (resolved.errorCode) {
      return { outcome: 'failed', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, errorCode: resolved.errorCode, message: resolved.message, environments: [] }
    }
    const envDir = path.join(resolved.configRoot, '.codex', 'environments')
    let entries = []
    try {
      entries = fs.readdirSync(envDir, { withFileTypes: true })
    } catch (thrown) {
      const code = thrown && typeof thrown === 'object' && 'code' in thrown ? String(thrown.code) : ''
      if (code === 'ENOENT') {
        return { outcome: 'ok', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, projectKey: resolved.projectKey, targetId: resolved.targetId, environments: [], message: '未发现 Environment 配置' }
      }
      return { outcome: 'failed', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, errorCode: 'unreadable', message: '无法读取 Environment 配置', environments: [] }
    }
    const environments = []
    const seenEnvironmentIds = new Set()
    for (const entry of entries) {
      if (!entry.isFile() || !/\.toml$/i.test(entry.name)) continue
      let text = ''
      try { text = fs.readFileSync(path.join(envDir, entry.name), 'utf8') } catch { continue }
      const parsed = parseCodexEnvironmentTomlText(text)
      if (!parsed) continue
      const environmentFileFingerprint = crypto.createHash('sha256').update(text).digest('hex')
      const id = codexEnvironmentIdFromFileName(entry.name)
      if (seenEnvironmentIds.has(id)) {
        return { outcome: 'failed', runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION, errorCode: 'environment-id-collision', message: 'Environment 标识冲突，请检查文件名', environments: [] }
      }
      seenEnvironmentIds.add(id)
      const seen = new Set()
      const hostActions = []
      const actions = []
      parsed.actions.forEach((action, index) => {
        let actionId = codexEnvironmentActionIdFromName(action.name, index)
        if (seen.has(actionId)) actionId = `${actionId}-${index + 1}`
        seen.add(actionId)
        const validatedCommand = validateCodexEnvironmentActionCommandHost(action.command)
        if (!validatedCommand) return
        const risk = validatedCommand.risk
        const commandFingerprint = crypto.createHash('sha256').update(String(action.command || '')).digest('hex')
        hostActions.push({ id: actionId, name: action.name, icon: action.icon || 'run', validatedCommand, risk, environmentFileFingerprint, commandFingerprint })
        actions.push({
          id: actionId,
          name: String(action.name || '').trim().slice(0, 80) || `Action ${index + 1}`,
          icon: String(action.icon || 'run').trim().slice(0, 40) || 'run',
          risk,
          displayOnly: false,
          slotEligible: true
        })
      })
      environments.push({
        id,
        name: parsed.name || id,
        setupScriptPresent: Boolean(String(parsed.setupScript || '').trim()),
        actions,
        _hostActions: hostActions
      })
    }
    environments.sort((left, right) => left.id.localeCompare(right.id))
    rememberCodexEnvironmentCommands(resolved.targetId, environments)
    return {
      outcome: 'ok',
      runtimeRevision: CODEX_ACTION_HOST_RUNTIME_REVISION,
      projectKey: resolved.projectKey,
      targetId: resolved.targetId,
      environments: environments.map((item) => ({
        id: item.id,
        name: item.name,
        setupScriptPresent: item.setupScriptPresent,
        actions: item.actions
      }))
    }
  }

  function sanitizeCodexEnvironmentSession(session) {
    if (!session) return null
    return {
      targetAlias: typeof session.targetAlias === 'string' && session.targetAlias ? session.targetAlias : (typeof session.projectKey === 'string' ? session.projectKey : ''),
      targetId: session.targetId,
      projectKey: session.projectKey,
      environmentId: session.environmentId,
      actionId: session.actionId,
      state: session.state,
      startedAt: session.startedAt,
      exitCode: typeof session.exitCode === 'number' ? session.exitCode : undefined,
      message: session.message || ''
    }
  }

  function listCodexEnvironmentActionSessions() {
    return [...codexEnvironmentActionSessions.values()].map(sanitizeCodexEnvironmentSession).filter(Boolean)
  }

  function stopCodexEnvironmentActionSession(input) {
    const requestedTargetId = typeof input?.targetId === 'string' ? input.targetId : ''
    const projectKey = typeof input?.projectKey === 'string' ? input.projectKey : ''
    const targetId = requestedTargetId || projectKey
    const environmentId = typeof input?.environmentId === 'string' ? input.environmentId : ''
    const actionId = typeof input?.actionId === 'string' ? input.actionId : ''
    if (!targetId || !environmentId || !actionId) return { outcome: 'failed', errorCode: 'invalid-request', message: '停止请求无效' }
    const key = codexEnvironmentSessionKey(targetId, environmentId, actionId)
    const session = codexEnvironmentActionSessions.get(key)
    if (!session) return { outcome: 'failed', errorCode: 'not-running', message: '没有运行中的 Action 会话' }
    if (projectKey && session.projectKey !== projectKey) return { outcome: 'failed', errorCode: 'target-mismatch', message: 'Action 目标身份不匹配' }
    if (session.state === 'stopping') return { outcome: 'stopping', session: sanitizeCodexEnvironmentSession(session) }
    session.state = 'stopping'
    session.message = '正在停止 Action'
    if (session.run) {
      session.run.status = 'stopping'
      session.run.message = session.message
      persistCodexActionRun(session.run)
      pushCodexActionRunnerSnapshot(session.message)
    }
    signalCodexEnvironmentSession(session)
    return { outcome: 'stopping', session: sanitizeCodexEnvironmentSession(session) }
  }

  function signalCodexEnvironmentSession(session) {
    try {
      if (process.platform !== 'win32' && typeof session.childPid === 'number') {
        process.kill(-session.childPid, 'SIGTERM')
        return
      }
      if (process.platform === 'win32' && typeof session.childPid === 'number') {
        const systemRoot = typeof process.env.SystemRoot === 'string' && process.env.SystemRoot.trim()
          ? path.win32.resolve(process.env.SystemRoot.trim())
          : 'C:\\Windows'
        const taskkill = /^[A-Za-z]:\\/.test(systemRoot)
          ? path.win32.join(systemRoot, 'System32', 'taskkill.exe')
          : 'C:\\Windows\\System32\\taskkill.exe'
        void run(taskkill, ['/PID', String(session.childPid), '/T']).then((result) => {
          if (!result.ok) {
            try { session.child?.kill?.('SIGTERM') } catch {}
          }
        })
        return
      }
      session.child?.kill?.('SIGTERM')
    } catch {
      try { session.child?.kill?.('SIGTERM') } catch {}
    }
  }

  function issueCodexEnvironmentConfirmToken(targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) {
    return codexActionAuthorization?.issueCodexEnvironmentConfirmToken(targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) || ''
  }

  function consumeCodexEnvironmentConfirmToken(token, targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) {
    return codexActionAuthorization?.consumeCodexEnvironmentConfirmToken(token, targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint) === true
  }

  function shutdownCodexEnvironmentActions() {
    setShuttingDown(true)
    const sessions = [...codexEnvironmentActionSessions.values()]
    for (const session of sessions) {
      session.pendingRestart = null
      if (session.run && (session.run.status === 'running' || session.run.status === 'stopping')) {
        finishCodexActionRun(session.run, 'interrupted', undefined, '宿主进程结束，运行已中断')
      }
    }
    codexEnvironmentActionSessions.clear()
    codexActionAuthorization?.clearCodexActionAuthorization()
    for (const session of sessions) signalCodexEnvironmentSession(session)
    if (codexRunDatabase) codexRunDatabase.closeCodexActionRunDatabase()
  }

  function appendCodexActionRunLog(run, stream, chunk, privatePaths) {
    if (!run || !['stdout', 'stderr', 'system'].includes(stream)) return
    const state = codexActionLogStream(run, stream, privatePaths)
    codexActionConsumeDecodedLog(run, stream, state, state.decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ''))))
  }

  function finalizeCodexActionRunLogs(run) {
    if (!run?._logStreams) {
      codexActionFlushLog(run)
      return
    }
    for (const [stream, state] of run._logStreams) codexActionConsumeDecodedLog(run, stream, state, state.decoder.end(), true)
    codexActionFlushLog(run)
    run._logStreams.clear()
  }

  function createCodexActionRun(input, resolved, hostAction, launch = null) {
    ensureCodexActionRunDatabase()
    const run = {
      version: 1,
      runId: `car_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('base64url')}`,
      laneId: `${encodeURIComponent(resolved.targetId)}:${encodeURIComponent(input.environmentId)}:${encodeURIComponent(input.actionId)}`,
      projectKey: resolved.projectKey,
      projectName: String(input.projectName || resolved.projectKey).slice(0, 120),
      environmentId: input.environmentId,
      environmentName: String(input.environmentName || input.environmentId).slice(0, 120),
      actionId: input.actionId,
      actionName: String(input.actionName || hostAction.name || input.actionId).slice(0, 120),
      risk: hostAction.risk,
      status: 'running',
      startedAt: Date.now(),
      logText: '',
      logBytes: 0,
      logLines: 0,
      message: '正在执行',
      cursor: 0,
      runtimeMode: launch?.runtime?.mode,
      runtimeSource: launch?.runtime?.source,
      runtimeVersion: launch?.runtime?.version,
      runtimeLabel: launch?.runtime?.label
    }
    if (codexRunDatabase) codexRunDatabase.rememberCodexActionRun(run)
    persistCodexActionRun(run)
    return run
  }

  function recordCodexActionRestartFailure(input, result) {
    const now = Date.now()
    const run = {
      version: 1,
      runId: `car_${now.toString(36)}_${crypto.randomBytes(6).toString('base64url')}`,
      laneId: `${encodeURIComponent(String(input.targetId || input.projectKey || ''))}:${encodeURIComponent(String(input.environmentId || ''))}:${encodeURIComponent(String(input.actionId || ''))}`,
      projectKey: String(input.projectKey || '').slice(0, 160),
      projectName: String(input.projectName || input.projectKey || '项目').slice(0, 120),
      environmentId: String(input.environmentId || '').slice(0, 64),
      environmentName: String(input.environmentName || input.environmentId || 'Environment').slice(0, 120),
      actionId: String(input.actionId || '').slice(0, 80),
      actionName: String(input.actionName || input.actionId || 'Serve').slice(0, 120),
      risk: 'long-running',
      status: 'failed',
      startedAt: now,
      endedAt: now,
      logText: '',
      logBytes: 0,
      logLines: 0,
      message: String(result?.message || 'Serve 重新执行前校验失败').slice(0, 240),
      cursor: 0
    }
    if (codexRunDatabase) codexRunDatabase.rememberCodexActionRun(run)
    persistCodexActionRun(run)
    pushCodexActionRunnerSnapshot(run.message)
  }

  // Same membership as `isCodexActionStartAccepted` in
  // src/domain/codexEnvironment.ts, which owns the meaning; a CJS preload cannot
  // import a TS module, so a test holds the two sets in step. Not
  // `outcome !== 'failed'` — `confirm-required` and `rejected` start nothing.
  function codexActionStartAccepted(outcome) {
    return outcome === 'ok' || outcome === 'started' || outcome === 'running' || outcome === 'stopping'
  }

  async function restartCodexEnvironmentActionAfterExit(input) {
    if (isShuttingDown()) return
    const previousRunIds = new Set(codexActionRunMemorySnapshot().map((run) => run.runId))
    const result = await runCodexProjectEnvironmentAction(input)
    const created = codexActionRunMemorySnapshot().some((run) => !previousRunIds.has(run.runId))
    if (!created && !codexActionStartAccepted(result?.outcome)) recordCodexActionRestartFailure(input, result)
  }

  function finishCodexActionRun(run, status, exitCode, message) {
    if (!run) return
    finalizeCodexActionRunLogs(run)
    run.status = status
    run.endedAt = Date.now()
    if (typeof exitCode === 'number') run.exitCode = exitCode
    run.message = message
    persistCodexActionRun(run)
    if (codexRunDatabase) codexRunDatabase.enforceRetentionIfOpen()
    pushCodexActionRunnerSnapshot(message)
  }

  function resolveCodexActionLaunchPlan(validatedCommand, projectRoot, projectKey = '') {
    const verified = validateCodexEnvironmentActionCommandHost(Array.isArray(validatedCommand?.argv) ? validatedCommand.argv.join(' ') : '')
    if (!verified || JSON.stringify(verified) !== JSON.stringify(validatedCommand)) return null
    const name = verified.executable
    const args = verified.argv.slice(1)
    if (name === 'vite' || name === 'npm' || name === 'pnpm' || name === 'yarn') {
      const runtimeResult = codexActionRuntimeProjection(projectKey, projectRoot, true)
      if (!runtimeResult.resolved) return { errorCode: 'node-runtime-unavailable', message: runtimeResult.public.message || 'Node 运行时不可用', runtime: runtimeResult.public }
      const script = name === 'vite'
        ? codexActionUsableFile(path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'))
        : codexActionPackageManagerEntry(runtimeResult.resolved, name)
      if (!script) return { errorCode: 'package-manager-unavailable', message: `所选 Node 未提供 ${name} 入口`, runtime: runtimeResult.public }
      return {
        command: runtimeResult.resolved.nodePath,
        args: [script, ...args],
        binDir: runtimeResult.resolved.binDir,
        runtime: runtimeResult.public
      }
    }
    const home = os.homedir()
    const candidatesByName = {
      git: process.platform === 'win32'
        ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe')]
        : ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git'],
      pnpm: process.platform === 'win32'
        ? [path.join(process.env.LOCALAPPDATA || '', 'pnpm', 'pnpm.exe')]
        : [path.join(home, 'Library', 'pnpm', 'pnpm'), path.join(home, '.local', 'share', 'pnpm', 'pnpm'), '/opt/homebrew/bin/pnpm', '/usr/local/bin/pnpm'],
      yarn: process.platform === 'win32' ? [] : ['/opt/homebrew/bin/yarn', '/usr/local/bin/yarn'],
      bun: process.platform === 'win32' ? [path.join(home, '.bun', 'bin', 'bun.exe')] : [path.join(home, '.bun', 'bin', 'bun'), '/opt/homebrew/bin/bun']
    }
    const command = (candidatesByName[name] || []).map(codexActionUsableFile).find(Boolean)
    return command ? { command, args } : null
  }

  async function runCodexProjectEnvironmentAction(input) {
    const targetAlias = typeof input?.targetAlias === 'string' ? input.targetAlias : ''
    const requestedTargetId = typeof input?.targetId === 'string' ? input.targetId : ''
    const compatibilityProjectKey = typeof input?.projectKey === 'string' ? input.projectKey : ''
    const environmentId = typeof input?.environmentId === 'string' ? input.environmentId.slice(0, 64) : ''
    const actionId = typeof input?.actionId === 'string' ? input.actionId.slice(0, 80) : ''
    const confirmToken = typeof input?.confirmToken === 'string' ? input.confirmToken : ''
    const stopIfRunning = input?.stopIfRunning === true
    const restartIfRunning = input?.restartIfRunning === true
    if (!targetAlias || !environmentId || !actionId) {
      return { outcome: 'failed', errorCode: 'invalid-request', message: 'Action 请求无效' }
    }
    if (actionId === 'setup') {
      return { outcome: 'rejected', errorCode: 'display-only', message: 'Setup 仅展示，不会由 EyPc 执行' }
    }
    const resolved = resolveCodexEnvironmentTargetCwd(targetAlias)
    if (resolved.errorCode) {
      return { outcome: 'failed', errorCode: resolved.errorCode, message: resolved.message }
    }
    if (requestedTargetId && requestedTargetId !== resolved.targetId) {
      return { outcome: 'failed', errorCode: 'target-mismatch', message: 'Action 目标身份不匹配' }
    }
    if (!requestedTargetId && (resolved.kind !== 'project' || compatibilityProjectKey !== resolved.projectKey)) {
      return { outcome: 'failed', errorCode: 'runtime-revision-required', message: 'Action Host 已更新，请重载插件后再试' }
    }
    const latestList = listCodexProjectEnvironments(targetAlias)
    if (latestList.outcome !== 'ok') return latestList
    if (latestList.runtimeRevision !== CODEX_ACTION_HOST_RUNTIME_REVISION || latestList.targetId !== resolved.targetId) {
      return { outcome: 'failed', errorCode: 'target-mismatch', message: 'Action 目标刷新结果不一致' }
    }
    const hostAction = codexActionAuthorization?.findCodexEnvironmentCommand(resolved.targetId, environmentId, actionId)
    if (!hostAction) {
      return { outcome: 'failed', errorCode: 'action-missing', message: '未找到对应 Action，请刷新后重试' }
    }
    if (hostAction.risk === 'display-only') {
      return { outcome: 'rejected', errorCode: 'display-only', message: '该 Action 仅展示，不会执行' }
    }
    if (hostAction.risk !== 'normal' && hostAction.risk !== 'external-write' && hostAction.risk !== 'long-running') {
      return { outcome: 'rejected', errorCode: 'action-not-allowed', message: '该 Action 不在允许列表中' }
    }
    const environmentFileFingerprint = typeof hostAction.environmentFileFingerprint === 'string' ? hostAction.environmentFileFingerprint : ''
    const commandFingerprint = typeof hostAction.commandFingerprint === 'string' ? hostAction.commandFingerprint : ''
    const sessionKey = codexEnvironmentSessionKey(resolved.targetId, environmentId, actionId)
    const existing = codexEnvironmentActionSessions.get(sessionKey)
    if (existing?.state === 'running' && hostAction.risk !== 'long-running') {
      return { outcome: 'running', session: sanitizeCodexEnvironmentSession(existing), message: '该 Action 正在运行，已定位到当前记录' }
    }
    if (existing?.state === 'stopping' && hostAction.risk !== 'long-running') {
      return { outcome: 'stopping', session: sanitizeCodexEnvironmentSession(existing), message: '该 Action 正在停止' }
    }
    if (hostAction.risk === 'long-running') {
      if (existing?.state === 'running') {
        const existingEnvironmentFileFingerprint = typeof existing.environmentFileFingerprint === 'string' ? existing.environmentFileFingerprint : ''
        const existingCommandFingerprint = typeof existing.commandFingerprint === 'string' ? existing.commandFingerprint : ''
        if (restartIfRunning) {
          existing.pendingRestart = { ...input, confirmToken: undefined, restartIfRunning: false }
          return stopCodexEnvironmentActionSession({ targetId: resolved.targetId, projectKey: resolved.projectKey, environmentId, actionId })
        }
        if ((existingEnvironmentFileFingerprint && existingCommandFingerprint) && (existingEnvironmentFileFingerprint !== environmentFileFingerprint || existingCommandFingerprint !== commandFingerprint)) {
          return {
            outcome: 'rejected',
            errorCode: 'session-fingerprint-mismatch',
            message: 'Serve 运行的命令/环境指纹与当前 Action 不一致，请先停止该会话后重试'
          }
        }
        if (stopIfRunning) return stopCodexEnvironmentActionSession({ targetId: resolved.targetId, projectKey: resolved.projectKey, environmentId, actionId })
        return { outcome: 'running', session: sanitizeCodexEnvironmentSession(existing), message: 'Serve 仍在运行；再次确认可停止' }
      }
      if (existing?.state === 'stopping') {
        return {
          outcome: 'stopping',
          session: sanitizeCodexEnvironmentSession(existing),
          message: 'Serve 正在停止；请稍后重试'
        }
      }
    }
    if (hostAction.risk === 'external-write') {
      if (!confirmToken || !consumeCodexEnvironmentConfirmToken(confirmToken, resolved.targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint)) {
        const token = issueCodexEnvironmentConfirmToken(resolved.targetId, environmentId, actionId, environmentFileFingerprint, commandFingerprint)
        return {
          outcome: 'confirm-required',
          errorCode: 'confirm-required',
          message: 'Git Push 会写入远程仓库，请再次确认',
          confirmToken: token,
          risk: 'external-write'
        }
      }
    }
    const launch = resolveCodexActionLaunchPlan(hostAction.validatedCommand, resolved.executionCwd, resolved.projectKey)
    if (!launch || launch.errorCode) return {
      outcome: 'rejected',
      errorCode: launch?.errorCode || 'executable-unavailable',
      message: launch?.message || '未找到受信任的绝对可执行入口'
    }
    const spawnEnvironment = {
      ...process.env,
      PATH: [
        launch.binDir,
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin'
      ].filter(Boolean).join(path.delimiter)
    }
    if (hostAction.risk === 'long-running') {
      const run = createCodexActionRun({ ...input, environmentId, actionId }, resolved, hostAction, launch)
      let child
      try {
        child = spawn(launch.command, launch.args, {
          cwd: resolved.executionCwd,
          env: spawnEnvironment,
          detached: process.platform !== 'win32',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false
        })
      } catch {
        finishCodexActionRun(run, 'failed', undefined, '无法启动 Serve')
        return { outcome: 'failed', errorCode: 'spawn-failed', message: '无法启动 Serve' }
      }
      const session = {
        targetAlias,
        targetId: resolved.targetId,
        projectKey: resolved.projectKey,
        environmentId,
        actionId,
        environmentFileFingerprint,
        commandFingerprint,
        state: 'running',
        startedAt: Date.now(),
        message: 'Serve 已启动',
        run,
        child,
        childPid: typeof child?.pid === 'number' ? child.pid : undefined,
      }
      codexEnvironmentActionSessions.set(sessionKey, session)
      pushCodexActionRunnerSnapshot(session.message)
      child.stdout?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stdout', chunk, [resolved.executionCwd]))
      child.stderr?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stderr', chunk, [resolved.executionCwd]))
      child.on?.('exit', (code) => {
        const current = codexEnvironmentActionSessions.get(sessionKey)
        if (!current || current.child !== child) return
        const wasStopping = current.state === 'stopping'
        const pendingRestart = current.pendingRestart
        current.pendingRestart = null
        current.state = 'idle'
        current.exitCode = typeof code === 'number' ? code : 0
        current.message = code === 0 ? 'Serve 已结束' : `Serve 已退出（${code}）`
        current.child = null
        finishCodexActionRun(run, wasStopping ? 'stopped' : (code === 0 ? 'completed' : 'failed'), typeof code === 'number' ? code : undefined, current.message)
        flushCodexActionDeferredServerClose()
        if (pendingRestart && !isShuttingDown()) queueMicrotask(() => { void restartCodexEnvironmentActionAfterExit(pendingRestart) })
      })
      child.on?.('error', () => {
        const current = codexEnvironmentActionSessions.get(sessionKey)
        if (!current || current.child !== child) return
        current.state = 'idle'
        current.exitCode = undefined
        current.message = 'Serve 启动失败'
        current.child = null
        finishCodexActionRun(run, 'failed', undefined, current.message)
        flushCodexActionDeferredServerClose()
      })
      return { outcome: 'started', session: sanitizeCodexEnvironmentSession(session) }
    }
    const nonLongTimeoutMs = 10 * 60_000
    const result = await new Promise((resolvePromise) => {
      let done = false
      let timedOut = false
      let child
      const run = createCodexActionRun({ ...input, environmentId, actionId }, resolved, hostAction, launch)
      try {
        child = spawn(launch.command, launch.args, {
          cwd: resolved.executionCwd,
          env: spawnEnvironment,
          detached: process.platform !== 'win32',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false
        })
      } catch {
        finishCodexActionRun(run, 'failed', undefined, '命令启动失败')
        resolvePromise({ outcome: 'failed', errorCode: 'spawn-failed', exitCode: undefined, message: '命令启动失败' })
        return
      }
      const session = {
        targetAlias,
        targetId: resolved.targetId,
        projectKey: resolved.projectKey,
        environmentId,
        actionId,
        environmentFileFingerprint,
        commandFingerprint,
        state: 'running',
        startedAt: run.startedAt,
        message: '正在执行',
        run,
        child,
        childPid: typeof child?.pid === 'number' ? child.pid : undefined
      }
      codexEnvironmentActionSessions.set(sessionKey, session)
      pushCodexActionRunnerSnapshot(session.message)
      child.stdout?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stdout', chunk, [resolved.executionCwd]))
      child.stderr?.on?.('data', (chunk) => appendCodexActionRunLog(run, 'stderr', chunk, [resolved.executionCwd]))
      const timeoutId = setTimeout(() => {
        if (done) return
        timedOut = true
        session.state = 'stopping'
        session.message = '执行超时，正在停止'
        run.status = 'stopping'
        run.message = session.message
        persistCodexActionRun(run)
        pushCodexActionRunnerSnapshot(session.message)
        signalCodexEnvironmentSession(session)
      }, nonLongTimeoutMs)
      child.on?.('exit', (code) => {
        if (done) return
        done = true
        clearTimeout(timeoutId)
        const exitCode = typeof code === 'number' ? code : 0
        const explicitlyStopped = session.state === 'stopping' && !timedOut
        const status = timedOut ? 'failed' : explicitlyStopped ? 'stopped' : exitCode === 0 ? 'completed' : 'failed'
        const message = timedOut ? '命令执行超时并已停止' : explicitlyStopped ? '已停止' : exitCode === 0 ? '已完成' : `命令退出（${exitCode}）`
        session.state = 'idle'
        session.child = null
        session.exitCode = exitCode
        session.message = message
        finishCodexActionRun(run, status, exitCode, message)
        flushCodexActionDeferredServerClose()
        resolvePromise({
          outcome: status === 'completed' ? 'ok' : 'failed',
          errorCode: timedOut ? 'command-timeout' : status === 'stopped' ? 'stopped' : exitCode === 0 ? undefined : 'command-exit',
          exitCode,
          message
        })
      })
      child.on?.('error', () => {
        if (done) return
        done = true
        clearTimeout(timeoutId)
        session.state = 'idle'
        session.child = null
        finishCodexActionRun(run, 'failed', undefined, '命令启动失败')
        flushCodexActionDeferredServerClose()
        resolvePromise({ outcome: 'failed', errorCode: 'spawn-error', exitCode: undefined, message: '命令启动失败' })
      })
    })
    return result
  }

  return {
    runCodexProjectEnvironmentAction,
    listCodexProjectEnvironments,
    listCodexEnvironmentActionSessions,
    stopCodexEnvironmentActionSession,
    shutdownCodexEnvironmentActions,
    // Test-only escape hatch, mirrors float-bridge.cjs's `__internal` -- exposes
    // helpers that have real branching logic of their own but no public
    // method, so unit tests can exercise them directly instead of driving
    // the full `runCodexProjectEnvironmentAction` spawn pipeline.
    __internal: {
      resolveCodexActionLaunchPlan,
      signalCodexEnvironmentSession,
      issueCodexEnvironmentConfirmToken,
      consumeCodexEnvironmentConfirmToken
    }
  }
}

module.exports = {
  createCodexEnvironmentBridge
}
