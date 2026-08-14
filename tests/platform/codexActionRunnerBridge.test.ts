import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Codex Action Runner host bridge contract', () => {
  const source = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
  // These are security and safety assertions about the launch and log paths, so
  // they follow the code rather than being relaxed when a block is extracted
  // under RAW-169. Reading the whole `preload/codex/` group keeps "the
  // supervisor's reachable source" accurate as further blocks move out, instead
  // of naming each new module here after it has already broken the run.
  const codexModules = readdirSync(resolve(process.cwd(), 'preload/codex'))
    .filter((name) => name.endsWith('.cjs'))
    .map((name) => readFileSync(join(resolve(process.cwd(), 'preload/codex'), name), 'utf8'))
    .join('\n')
  // A missing anchor must fail here and say so. `indexOf` returning -1 makes
  // `slice` collapse the region to a single character, and every assertion
  // below then fails against an unrelated diff — an anchor that moved out under
  // RAW-169 costs eight misleading failures instead of one clear one.
  const region = (marker: string) => {
    const at = source.indexOf(marker)
    if (at < 0) throw new Error(`supervisor anchor not found in preload/index.js: ${marker}`)
    return at
  }
  const supervisor = source.slice(
    region("const CODEX_ACTION_HOST_RUNTIME_REVISION = 'action-host-v2-exact-argv-target'"),
    region('window.eypcPlatform =')
  ) + codexModules

  it('uses one registered Environment root for configuration and preserves exact task execution cwd', () => {
    expect(supervisor).toContain("fs.statSync(path.join(root, '.codex', 'environments')).isDirectory()")
    expect(supervisor).toContain("roots.length !== 1")
    expect(supervisor).toContain('const executionCwd = codexNormalizeNativeRoot(entry.cwd)')
    expect(supervisor).toContain("const target = { configRoot: roots[0], executionCwd, projectKey: project.key, kind: 'task' }")
    expect(supervisor).toContain("const target = { configRoot: roots[0], executionCwd: roots[0], projectKey: project.key, kind: 'project' }")
    expect(supervisor).toContain('targetId: codexEnvironmentTargetId(target)')
  })

  it('rereads TOML and launches only a resolved absolute plan without a shell', () => {
    expect(supervisor).toContain('const latestList = listCodexProjectEnvironments(targetAlias)')
    expect(supervisor).toContain('validateCodexEnvironmentActionCommandHost(action.command)')
    expect(supervisor).toContain('resolveCodexActionLaunchPlan(hostAction.validatedCommand, resolved.executionCwd, resolved.projectKey)')
    expect(supervisor).toContain('path.isAbsolute(candidate)')
    expect(supervisor).toContain('codexActionNvmRoots()')
    expect(supervisor).toContain("codexActionReadNvmAlias(root, 'default')")
    expect(supervisor).toContain('runtimeByProject')
    expect(supervisor).toContain('shell: false')
    expect(supervisor).not.toContain('shell: true')
    expect(supervisor).not.toContain('zsh -lc')
    expect(supervisor).not.toContain('cmd /c')
    expect(supervisor).not.toContain('unsafeShell')
    expect(supervisor).not.toMatch(/\^\\s\*\(pnpm\|npm\|yarn\|bun\)/)
  })

  it('keeps SIGTERM-only lifecycle, sanitized logs and bounded SQLite history', () => {
    expect(supervisor).toContain("process.kill(-session.childPid, 'SIGTERM')")
    expect(supervisor).not.toContain('SIGKILL')
    expect(supervisor).toContain("['/PID', String(session.childPid), '/T']")
    expect(supervisor).not.toContain("'/F'")
    expect(supervisor).toContain("'codex-action-runs.sqlite'")
    expect(supervisor).toContain('30 * 24 * 60 * 60_000')
    expect(supervisor).toContain('100 * 1024 * 1024')
    expect(supervisor).toContain('sanitizeCodexActionLogText')
    expect(supervisor).toContain("require('node:string_decoder')")
    expect(supervisor).toContain('finalizeCodexActionRunLogs(run)')
    expect(supervisor).toContain("stdio: ['ignore', 'pipe', 'pipe']")
    const createRun = supervisor.slice(supervisor.indexOf('function createCodexActionRun'), supervisor.indexOf('function recordCodexActionRestartFailure'))
    expect(createRun).not.toContain('pushCodexActionRunnerSnapshot')
    const execution = supervisor.slice(supervisor.indexOf('async function runCodexProjectEnvironmentAction'), supervisor.indexOf('function codexActionRunnerCatalogProjection'))
    expect(execution.indexOf('codexEnvironmentActionSessions.set(sessionKey, session)')).toBeLessThan(execution.indexOf('pushCodexActionRunnerSnapshot(session.message)'))
  })

  it('validates the Runner IPC sender and does not expose raw execution fields in snapshots', () => {
    expect(supervisor).toContain('validCodexActionRunnerSender(event)')
    expect(supervisor).toContain('expected === actual')
    expect(supervisor).toContain('frame: false')
    expect(supervisor).toContain('CODEX_ACTION_RUNNER_CHANNELS.hide')
    expect(supervisor).not.toMatch(/runs:\s*codexActionRunMemory[^\n]+(?:command|cwd|childPid|process\.env)/)
  })

  it('separates background hiding from real host shutdown and clears Action authority on kill', () => {
    expect(source).toContain('globalThis.utools.onPluginOut((isKill) =>')
    expect(source).toContain('shutdownCodexEnvironmentActions()')
    expect(supervisor).toContain("finishCodexActionRun(session.run, 'interrupted'")
    expect(supervisor).toContain('session.pendingRestart = null')
    expect(supervisor).toContain('codexEnvironmentActionSessions.clear()')
    expect(supervisor).toContain('codexActionAuthorization?.clearCodexActionAuthorization()')
    expect(supervisor).toContain('commandVault.clear()')
    expect(supervisor).toContain('confirmTokens.clear()')
    expect(supervisor).toContain('codexActionRunnerCatalog?.loading === true')
    expect(supervisor).toContain('flushCodexActionDeferredServerClose()')
  })

  it('uses a controlled absolute Windows taskkill tree stop without force escalation', () => {
    expect(supervisor).toContain("path.win32.join(systemRoot, 'System32', 'taskkill.exe')")
    expect(supervisor).toContain("run(taskkill, ['/PID', String(session.childPid), '/T'])")
    expect(supervisor).not.toContain("run('taskkill', ['/PID', String(session.childPid), '/T'])")
    expect(supervisor).not.toContain("String(session.childPid), '/T', '/F'")
  })

  it('uses runtime revision and targetId across list, run, stop, session and confirmation boundaries', () => {
    expect(supervisor).toContain('CODEX_ACTION_HOST_RUNTIME_REVISION')
    expect(supervisor).toContain('targetId: resolved.targetId')
    expect(supervisor).toContain('codexEnvironmentSessionKey(targetId, environmentId, actionId)')
    expect(supervisor).toContain('consumeCodexEnvironmentConfirmToken(confirmToken, resolved.targetId')
    expect(supervisor).toContain("errorCode: 'target-mismatch'")
  })
})
