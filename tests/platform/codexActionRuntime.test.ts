import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'

const nodeRequire = createRequire(import.meta.url)
const temporaryRoots: string[] = []

interface ActionRuntimeTestApi {
  runtime(projectKey: string, projectRoot: string, force?: boolean): {
    public: { mode: string; state: string; version?: string; source?: string; message?: string }
    resolved: { id: string; nodePath: string } | null
  }
  validate(command: string): { argv: string[]; risk: string } | null
  parseToml(text: string): { version: number } | null
  targetId(kind: 'project' | 'task', projectKey: string, executionCwd: string): string
  confirmIsolation(firstTargetId: string, secondTargetId: string): boolean
  targetKeyIsolation(firstTargetId: string, secondTargetId: string): { laneSeparated: boolean; sessionSeparated: boolean }
  lifecycle(isKill: boolean): { sessions: number; vault: number; tokens: number; runStatus: string; signals: Array<[number, string]>; deferredClose: boolean }
  preflightHide(): { deferredDuringPreflight: boolean; deferredAfterPreflight: boolean }
  setManual(projectKey: string, candidateId: string): void
  projectLog(chunks: Array<string | Buffer>, privatePaths: string[]): { text: string; cursor: number }
  retentionScenario(): string[]
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eypc-action-runtime-'))
  temporaryRoots.push(root)
  const home = join(root, 'home')
  const nvmRoot = join(home, '.nvm')
  const versionRoot = join(nvmRoot, 'versions', 'node', 'v24.14.0')
  const binDir = join(versionRoot, 'bin')
  const pnpmEntry = join(versionRoot, 'lib', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  const projectRoot = join(root, 'project')
  mkdirSync(binDir, { recursive: true })
  mkdirSync(dirname(pnpmEntry), { recursive: true })
  mkdirSync(join(nvmRoot, 'alias'), { recursive: true })
  mkdirSync(projectRoot, { recursive: true })
  symlinkSync(process.execPath, join(binDir, 'node'))
  writeFileSync(pnpmEntry, '#!/usr/bin/env node\n', 'utf8')
  symlinkSync('../lib/node_modules/pnpm/bin/pnpm.cjs', join(binDir, 'pnpm'))
  writeFileSync(join(nvmRoot, 'alias', 'default'), 'v24.14.0\n', 'utf8')
  return { home, projectRoot, pnpmEntry }
}

function loadApi(home: string): ActionRuntimeTestApi {
  const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
  let pluginOutListener: (isKill: boolean) => void = () => undefined
  const processSignals: Array<[number, string]> = []
  const processMock = {
    platform: 'darwin',
    arch: 'arm64',
    env: { NVM_DIR: join(home, '.nvm'), PATH: '' },
    execPath: '/Applications/uTools.app/Contents/MacOS/uTools',
    cwd: () => '/host/eypc',
    kill: (pid: number, signal: string) => { processSignals.push([pid, signal]); return true },
    versions: process.versions
  }
  const sandbox: Record<string, any> = {
    window: {},
    Buffer,
    process: processMock,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    TextEncoder,
    TextDecoder,
    URL,
    utools: {
      getPath: () => join(home, 'user-data'),
      dbStorage: { getItem: () => null, setItem: () => true },
      onPluginOut: (listener: (isKill: boolean) => void) => { pluginOutListener = listener }
    },
    __emitPluginOut: (isKill: boolean) => pluginOutListener(isKill),
    __processSignals: processSignals,
    require(name: string) {
      if (name === 'electron') return { ipcRenderer: { on() {} } }
      if (name === 'node:os') return { ...nodeRequire('node:os'), homedir: () => home }
      // The entry loads its own module groups by relative path. This shim
      // stands in for the module system, so it has to resolve those the way
      // the real one does — from `preload/`, not from this test file.
      if (name.startsWith('.')) return nodeRequire(resolve(process.cwd(), 'preload', name))
      return nodeRequire(name)
    }
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(`${preload}\n
    globalThis.__actionRuntimeTest = {
      runtime: (projectKey, projectRoot, force) => codexActionRuntimeProjection(projectKey, projectRoot, force),
      // validateCodexEnvironmentActionCommandHost/parseCodexEnvironmentTomlText
      // moved into preload/codex/environment-bridge.cjs under RAW-169 as
      // delegate stubs; the module handles they delegated to
      // (codexCommandValidation/codexEnvironmentToml) stayed in the entry and
      // are called directly here, unchanged.
      validate: (command) => codexCommandValidation ? codexCommandValidation.validateCodexEnvironmentActionCommandHost(command) : null,
      parseToml: (text) => codexEnvironmentToml ? codexEnvironmentToml.parseCodexEnvironmentTomlText(text) : null,
      // codexEnvironmentTargetId/codexEnvironmentSessionKey stayed in the
      // entry (codexActionRunnerCatalogProjection calls both directly too).
      targetId: (kind, projectKey, executionCwd) => codexEnvironmentTargetId({ kind, projectKey, executionCwd }),
      // issueCodexEnvironmentConfirmToken/consumeCodexEnvironmentConfirmToken
      // moved into the bridge as delegate stubs; codexActionAuthorization
      // (the module handle they delegated to) stayed in the entry.
      confirmIsolation: (firstTargetId, secondTargetId) => {
        const token = codexActionAuthorization.issueCodexEnvironmentConfirmToken(firstTargetId, 'environment', 'git-push', 'file', 'command')
        return codexActionAuthorization.consumeCodexEnvironmentConfirmToken(token, secondTargetId, 'environment', 'git-push', 'file', 'command')
      },
      targetKeyIsolation: (firstTargetId, secondTargetId) => {
        const firstSessionKey = codexEnvironmentSessionKey(firstTargetId, 'environment', 'serve')
        const secondSessionKey = codexEnvironmentSessionKey(secondTargetId, 'environment', 'serve')
        const firstLane = encodeURIComponent(firstTargetId) + ':environment:serve'
        const secondLane = encodeURIComponent(secondTargetId) + ':environment:serve'
        codexEnvironmentActionSessions.set(firstSessionKey, { targetId: firstTargetId })
        return {
          laneSeparated: firstLane !== secondLane,
          sessionSeparated: !codexEnvironmentActionSessions.has(secondSessionKey)
        }
      },
      lifecycle: (isKill) => {
        const originalPersist = persistCodexActionRun
        persistCodexActionRun = () => {}
        const run = {
          runId: 'lifecycle-run', laneId: 'target:environment:serve', projectKey: 'project', projectName: 'Project',
          environmentId: 'environment', environmentName: 'Environment', actionId: 'serve', actionName: 'Serve', risk: 'long-running',
          status: 'running', startedAt: Date.now(), logText: '', logBytes: 0, logLines: 0, message: 'running', cursor: 0
        }
        codexEnvironmentActionSessions.set(codexEnvironmentSessionKey('target', 'environment', 'serve'), {
          targetAlias: 'cp_test', targetId: 'target', projectKey: 'project', environmentId: 'environment', actionId: 'serve',
          state: 'running', startedAt: Date.now(), run, childPid: 321, child: { kill: (signal) => globalThis.__processSignals.push([321, signal]) },
          pendingRestart: { targetId: 'target' }
        })
        // The vault and the confirm tokens moved into
        // preload/codex/action-authorization.cjs under RAW-169. Seeding and
        // reading through the boundary asks the stronger question the counts
        // were standing in for: is this action still authorized?
        codexActionAuthorization.rememberCodexEnvironmentCommands('target', [
          { id: 'environment', _hostActions: [{ id: 'serve', command: 'pnpm serve' }] }
        ])
        const confirmToken = codexActionAuthorization.issueCodexEnvironmentConfirmToken('target', 'environment', 'serve', 'ff', 'cf')
        globalThis.__emitPluginOut(isKill)
        persistCodexActionRun = originalPersist
        return {
          sessions: codexEnvironmentActionSessions.size,
          vault: codexActionAuthorization.findCodexEnvironmentCommand('target', 'environment', 'serve') ? 1 : 0,
          tokens: codexActionAuthorization.consumeCodexEnvironmentConfirmToken(confirmToken, 'target', 'environment', 'serve', 'ff', 'cf') ? 1 : 0,
          runStatus: run.status,
          signals: globalThis.__processSignals.slice(),
          deferredClose: codexActionDeferredServerClose
        }
      },
      preflightHide: () => {
        codexActionRunnerCatalog = { version: 1, projects: [], loading: true, generatedAt: Date.now() }
        globalThis.__emitPluginOut(false)
        const deferredDuringPreflight = codexActionDeferredServerClose
        syncCodexActionRunnerCatalog({ version: 1, projects: [], loading: false, generatedAt: Date.now() })
        return { deferredDuringPreflight, deferredAfterPreflight: codexActionDeferredServerClose }
      },
      setManual: (projectKey, candidateId) => {
        codexActionRunnerPreference.runtimeByProject = { [projectKey]: { mode: 'manual', candidateId } }
      },
      // appendCodexActionRunLog/finalizeCodexActionRunLogs moved into
      // preload/codex/environment-bridge.cjs under RAW-169, as thin wrappers
      // over these three functions -- which stayed in the entry as delegate
      // stubs to preload/codex/log-stream.cjs (the actual redaction
      // algorithm, injected into the bridge rather than migrated). Calling
      // them directly here, replicating the wrapper's own decoder-finalize
      // sequence, exercises that same algorithm.
      projectLog: (chunks, privatePaths) => {
        const originalPersist = persistCodexActionRun
        persistCodexActionRun = () => {}
        const run = { runId: 'test-run', logText: '', logBytes: 0, logLines: 0, cursor: 0 }
        const states = new Map()
        for (const chunk of chunks) {
          const state = codexActionLogStream(run, 'stdout', privatePaths)
          states.set('stdout', state)
          codexActionConsumeDecodedLog(run, 'stdout', state, state.decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ''))))
        }
        for (const [stream, state] of states) codexActionConsumeDecodedLog(run, stream, state, state.decoder.end(), true)
        codexActionFlushLog(run)
        persistCodexActionRun = originalPersist
        return { text: run.logText, cursor: run.cursor }
      },
      retentionScenario: () => {
        const database = ensureCodexActionRunDatabase()
        const insert = database.prepare('INSERT INTO action_runs (run_id, lane_id, project_key, project_name, environment_id, environment_name, action_id, action_name, risk, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        insert.run('expired', 'lane', 'project', 'Project', 'env', 'Environment', 'build', 'Build', 'normal', 'completed', Date.now() - 31 * 24 * 60 * 60_000)
        insert.run('fresh', 'lane', 'project', 'Project', 'env', 'Environment', 'build', 'Build', 'normal', 'completed', Date.now())
        database.close()
        // The handle, its ready flag and the run memory moved into
        // preload/codex/run-database.cjs under RAW-169. Resetting through the
        // named operation exercises the same path production uses instead of
        // reaching for bindings the entry no longer owns.
        codexRunDatabase.closeCodexActionRunDatabase()
        ensureCodexActionRunDatabase()
        return codexActionRunMemorySnapshot().map((run) => run.runId)
      }
    }
  `, sandbox, { filename: 'preload.js' })
  return sandbox.__actionRuntimeTest as ActionRuntimeTestApi
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Codex Action macOS Node runtime', () => {
  // Launch-plan resolution (resolveCodexActionLaunchPlan) moved into
  // preload/codex/environment-bridge.cjs under RAW-169 and is covered there
  // via dependency injection (tests/platform/codexEnvironmentBridge.test.ts,
  // __internal.resolveCodexActionLaunchPlan); this NVM-detection assertion
  // stays here since codexActionRuntimeProjection itself stayed in the entry.
  it('resolves the NVM default Node for a project through the real fixture filesystem', () => {
    const { home, projectRoot } = fixture()
    const api = loadApi(home)
    const runtime = api.runtime('project', projectRoot, true)
    expect(runtime.public).toMatchObject({ mode: 'auto', state: 'ready', version: 'v24.14.0', source: 'nvm' })
  })

  it('fails closed for an unavailable project version but permits an explicit verified manual override', () => {
    const { home, projectRoot } = fixture()
    writeFileSync(join(projectRoot, '.nvmrc'), '# project node\nv22.22.1\n', 'utf8')
    const api = loadApi(home)
    expect(api.runtime('project', projectRoot, true).public).toMatchObject({ state: 'invalid-project-version' })

    const candidate = api.runtime('project', projectRoot, true).resolved
    expect(candidate).toBeNull()
    api.setManual('project', 'nvm:v24.14.0')
    expect(api.runtime('project', projectRoot, true).public).toMatchObject({ mode: 'manual', state: 'ready', version: 'v24.14.0' })
  })

  it('redacts secrets, paths, ANSI and UTF-8 safely across arbitrary stream chunks', () => {
    const { home, projectRoot } = fixture()
    const api = loadApi(home)
    const utf8 = Buffer.from('完成✓\n')
    const output = api.projectLog([
      '\u001b[3',
      '1mFAIL\u001b[0m api_',
      'key=visible-secret\n',
      projectRoot.slice(0, 8),
      `${projectRoot.slice(8)} token=second-secret\n`,
      utf8.subarray(0, utf8.length - 2),
      utf8.subarray(utf8.length - 2)
    ], [projectRoot])
    expect(output.text).toContain('FAIL')
    expect(output.text).toContain('<private-path>')
    expect(output.text).toContain('完成✓')
    expect(output.text).not.toContain('\u001b')
    expect(output.text).not.toContain('visible-secret')
    expect(output.text).not.toContain('second-secret')
    expect(output.text).not.toContain(projectRoot)
    expect(output.cursor).toBeGreaterThan(0)
    expect(homedir()).not.toBe(home)
  })

  it('removes expired rows before rebuilding the in-memory history', () => {
    const { home } = fixture()
    const api = loadApi(home)
    expect(api.retentionScenario()).toEqual(['fresh'])
  })

  it('keeps Host validation identical to the exact argv allowlist and strict TOML version contract', () => {
    const { home } = fixture()
    const api = loadApi(home)
    expect(api.validate('git push')).toMatchObject({ argv: ['git', 'push'], risk: 'external-write' })
    for (const command of ['git push origin main', 'git push --force', 'pnpm run build $(id)', 'pnpm run build &', 'vite build --config x']) {
      expect(api.validate(command), command).toBeNull()
    }
    expect(api.parseToml('version = 1\nname = "ok"')).toMatchObject({ version: 1 })
    for (const version of ['"1"', '1.0', '1e0', '01']) {
      expect(api.parseToml(`version = ${version}\nname = "bad"`), version).toBeNull()
    }
  })

  it('preserves project lanes while isolating task worktrees and confirmation tokens by targetId', () => {
    const { home, projectRoot } = fixture()
    const api = loadApi(home)
    expect(api.targetId('project', 'project-key', projectRoot)).toBe('project-key')
    const first = api.targetId('task', 'project-key', join(projectRoot, 'worktree-a'))
    const second = api.targetId('task', 'project-key', join(projectRoot, 'worktree-b'))
    expect(first).not.toBe(second)
    expect(first).toMatch(/^cat_/)
    expect(api.targetKeyIsolation(first, second)).toEqual({ laneSeparated: true, sessionSeparated: true })
    expect(api.confirmIsolation(first, second)).toBe(false)
  })

  // Covered via dependency injection in codexEnvironmentBridge.test.ts
  // ("rejects when the supplied targetId does not match the resolved Host
  // target") now that runCodexProjectEnvironmentAction lives in the bridge
  // and no longer accepts the monkey-patched resolveCodexEnvironmentTargetCwd
  // this test used to reassign.

  it('keeps sessions alive on background hide but interrupts, clears and signals them on real process exit', () => {
    const background = loadApi(fixture().home).lifecycle(false)
    expect(background).toMatchObject({ sessions: 1, vault: 1, tokens: 1, runStatus: 'running', signals: [], deferredClose: false })

    const killed = loadApi(fixture().home).lifecycle(true)
    expect(killed).toMatchObject({ sessions: 0, vault: 0, tokens: 0, runStatus: 'interrupted', deferredClose: false })
    expect(killed.signals).toContainEqual([-321, 'SIGTERM'])
  })

  it('does not request an alias-clearing server close when mainHide hides during Action preflight', () => {
    expect(loadApi(fixture().home).preflightHide()).toEqual({ deferredDuringPreflight: false, deferredAfterPreflight: false })
  })

  // Covered via dependency injection in codexEnvironmentBridge.test.ts
  // ("shells out to taskkill on win32 and falls back to child.kill on
  // failure") now that signalCodexEnvironmentSession lives in the bridge and
  // is reachable there through __internal.
})
