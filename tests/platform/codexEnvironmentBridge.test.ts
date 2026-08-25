import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const nodeRequire = createRequire(import.meta.url)
const { createCodexEnvironmentBridge } = nodeRequire(resolve(process.cwd(), 'preload/codex/environment-bridge.cjs')) as {
  createCodexEnvironmentBridge(dependencies: Record<string, unknown>): {
    runCodexProjectEnvironmentAction(input: Record<string, unknown>): Promise<Record<string, unknown>>
    listCodexProjectEnvironments(targetAlias: string): Record<string, unknown>
    listCodexEnvironmentActionSessions(): Array<Record<string, unknown>>
    stopCodexEnvironmentActionSession(input: Record<string, unknown>): Record<string, unknown>
    shutdownCodexEnvironmentActions(): void
    __internal: {
      resolveCodexActionLaunchPlan(validatedCommand: unknown, projectRoot: string, projectKey?: string): Record<string, unknown> | null
      signalCodexEnvironmentSession(session: Record<string, unknown>): void
      issueCodexEnvironmentConfirmToken(...args: unknown[]): string
      consumeCodexEnvironmentConfirmToken(...args: unknown[]): boolean
    }
  }
}
// command-validation.cjs and environment-toml.cjs have no dependencies of
// their own (see their file headers) -- using the real modules here, the same
// way the entry does, gives genuine coverage instead of hand-rolled fakes of
// their parsing/allowlist rules.
const codexCommandValidation = nodeRequire(resolve(process.cwd(), 'preload/codex/command-validation.cjs'))
const codexEnvironmentToml = nodeRequire(resolve(process.cwd(), 'preload/codex/environment-toml.cjs'))
const { createCodexActionAuthorization } = nodeRequire(resolve(process.cwd(), 'preload/codex/action-authorization.cjs'))

/**
 * Covers the parts of the environment/run-lifecycle boundary that are cheap
 * and safe to exercise via plain dependency injection: request validation,
 * launch-plan branching (`__internal.resolveCodexActionLaunchPlan`), process
 * signaling (`__internal.signalCodexEnvironmentSession`), session bookkeeping,
 * and the long-running spawn/session lifecycle with a fake `spawn`. The real
 * Node NVM-resolution and log-redaction algorithms stay entry-owned (injected
 * here as controllable fakes) and are covered where they already were, in
 * `codexActionRuntime.test.ts`'s vm-sandboxed integration suite.
 */

const temporaryRoots: string[] = []
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function baseDependencies(overrides: Record<string, unknown> = {}) {
  return {
    fs: nodeRequire('node:fs'),
    path: nodeRequire('node:path'),
    os: nodeRequire('node:os'),
    process: { ...process, platform: 'darwin' },
    crypto: nodeRequire('node:crypto'),
    spawn: vi.fn(),
    run: vi.fn(async () => ({ ok: true })),
    codexEnvironmentToml,
    codexCommandValidation,
    codexActionAuthorization: createCodexActionAuthorization(),
    codexRunDatabase: { closeCodexActionRunDatabase: vi.fn(), rememberCodexActionRun: vi.fn(), enforceRetentionIfOpen: vi.fn() },
    ensureCodexActionRunDatabase: vi.fn(),
    persistCodexActionRun: vi.fn(),
    codexActionRunMemorySnapshot: vi.fn(() => []),
    codexActionLogStream: vi.fn(() => ({ decoder: { write: () => '', end: () => '' } })),
    codexActionConsumeDecodedLog: vi.fn(),
    codexActionFlushLog: vi.fn(),
    codexActionUsableFile: (candidate: string) => candidate,
    codexActionPackageManagerEntry: vi.fn(() => '/fake/pnpm-entry.cjs'),
    codexActionRuntimeProjection: vi.fn(() => ({
      resolved: { id: 'nvm:v24.14.0', nodePath: '/fake/node', binDir: '/fake/bin' },
      public: { mode: 'auto', state: 'ready', version: 'v24.14.0' }
    })),
    pushCodexActionRunnerSnapshot: vi.fn(),
    flushCodexActionDeferredServerClose: vi.fn(),
    isShuttingDown: vi.fn(() => false),
    setShuttingDown: vi.fn(),
    codexEnvironmentActionSessions: new Map(),
    actionHostRuntimeRevision: 'action-host-v2-exact-argv-target',
    resolveCodexEnvironmentTargetCwd: vi.fn(() => ({ errorCode: 'invalid-request', message: '目标别名无效' })),
    codexEnvironmentSessionKey: (targetId: string, environmentId: string, actionId: string) => `${targetId}\0${environmentId}\0${actionId}`,
    ...overrides
  }
}

function environmentsDir() {
  const root = mkdtempSync(join(tmpdir(), 'eypc-env-bridge-'))
  temporaryRoots.push(root)
  const envDir = join(root, '.codex', 'environments')
  mkdirSync(envDir, { recursive: true })
  return { root, envDir }
}

describe('createCodexEnvironmentBridge', () => {
  it('throws when constructed without its required dependencies', () => {
    expect(() => createCodexEnvironmentBridge({})).toThrow()
  })

  describe('listCodexProjectEnvironments', () => {
    it('passes through the resolver failure shape unchanged', () => {
      const bridge = createCodexEnvironmentBridge(baseDependencies())
      const result = bridge.listCodexProjectEnvironments('not-an-alias')
      expect(result).toMatchObject({ outcome: 'failed', errorCode: 'invalid-request', environments: [] })
    })

    it('parses a real .codex/environments TOML file and remembers its commands for authorization', () => {
      const { envDir } = environmentsDir()
      writeFileSync(join(envDir, 'dev.toml'), [
        'version = 1',
        'name = "Dev"',
        '[[actions]]',
        'name = "Build"',
        'command = "pnpm run build"'
      ].join('\n'), 'utf8')
      const codexActionAuthorization = createCodexActionAuthorization()
      const resolveCodexEnvironmentTargetCwd = vi.fn(() => ({
        configRoot: envDir.replace(/\/\.codex\/environments$/, ''),
        executionCwd: envDir.replace(/\/\.codex\/environments$/, ''),
        projectKey: 'project-key',
        targetId: 'project-key',
        kind: 'project'
      }))
      const bridge = createCodexEnvironmentBridge(baseDependencies({ codexActionAuthorization, resolveCodexEnvironmentTargetCwd }))
      const result = bridge.listCodexProjectEnvironments('cp_test')
      expect(result.outcome).toBe('ok')
      expect(result.environments).toMatchObject([{ id: 'dev', name: 'Dev', actions: [{ id: 'build', name: 'Build' }] }])
      expect(codexActionAuthorization.findCodexEnvironmentCommand('project-key', 'dev', 'build')).toMatchObject({ risk: 'normal' })
    })

    it('reports an empty environment list without error when the directory does not exist', () => {
      const { root } = environmentsDir()
      const resolveCodexEnvironmentTargetCwd = vi.fn(() => ({
        configRoot: join(root, 'no-environments-here'),
        executionCwd: root,
        projectKey: 'project-key',
        targetId: 'project-key',
        kind: 'project'
      }))
      const bridge = createCodexEnvironmentBridge(baseDependencies({ resolveCodexEnvironmentTargetCwd }))
      const result = bridge.listCodexProjectEnvironments('cp_test')
      expect(result).toMatchObject({ outcome: 'ok', environments: [] })
    })
  })

  describe('runCodexProjectEnvironmentAction', () => {
    it('rejects a request missing targetAlias/environmentId/actionId', async () => {
      const bridge = createCodexEnvironmentBridge(baseDependencies())
      const result = await bridge.runCodexProjectEnvironmentAction({})
      expect(result).toMatchObject({ outcome: 'failed', errorCode: 'invalid-request' })
    })

    it('rejects the reserved "setup" action id as display-only', async () => {
      const bridge = createCodexEnvironmentBridge(baseDependencies())
      const result = await bridge.runCodexProjectEnvironmentAction({ targetAlias: 'cp_test', environmentId: 'dev', actionId: 'setup' })
      expect(result).toMatchObject({ outcome: 'rejected', errorCode: 'display-only' })
    })

    it('rejects when the supplied targetId does not match the resolved Host target', async () => {
      const resolveCodexEnvironmentTargetCwd = vi.fn(() => ({
        configRoot: '/config', executionCwd: '/worktree', projectKey: 'project', targetId: 'expected-target', kind: 'task'
      }))
      const bridge = createCodexEnvironmentBridge(baseDependencies({ resolveCodexEnvironmentTargetCwd }))
      const result = await bridge.runCodexProjectEnvironmentAction({
        targetAlias: 'ct_test', targetId: 'wrong-target', projectKey: 'project', environmentId: 'dev', actionId: 'build'
      })
      expect(result).toMatchObject({ outcome: 'failed', errorCode: 'target-mismatch' })
    })

    it('fails with action-missing when the action was never remembered from a listing', async () => {
      const { envDir } = environmentsDir()
      const configRoot = envDir.replace(/\/\.codex\/environments$/, '')
      writeFileSync(join(envDir, 'dev.toml'), 'version = 1\nname = "Dev"\n', 'utf8')
      const resolveCodexEnvironmentTargetCwd = vi.fn(() => ({
        configRoot, executionCwd: configRoot, projectKey: 'project-key', targetId: 'project-key', kind: 'project'
      }))
      const bridge = createCodexEnvironmentBridge(baseDependencies({ resolveCodexEnvironmentTargetCwd }))
      const result = await bridge.runCodexProjectEnvironmentAction({
        targetAlias: 'cp_test', projectKey: 'project-key', environmentId: 'dev', actionId: 'build'
      })
      expect(result).toMatchObject({ outcome: 'failed', errorCode: 'action-missing' })
    })

    it('spawns a long-running action through the injected runtime and tracks its session', async () => {
      const { envDir } = environmentsDir()
      const configRoot = envDir.replace(/\/\.codex\/environments$/, '')
      writeFileSync(join(envDir, 'dev.toml'), [
        'version = 1', 'name = "Dev"', '[[actions]]', 'name = "Serve"', 'command = "pnpm run serve"'
      ].join('\n'), 'utf8')
      const codexActionAuthorization = createCodexActionAuthorization()
      const resolveCodexEnvironmentTargetCwd = vi.fn(() => ({
        configRoot, executionCwd: configRoot, projectKey: 'project-key', targetId: 'project-key', kind: 'project'
      }))
      const fakeChild = { pid: 555, stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn() }
      const spawn = vi.fn((_command: string, _args: string[]) => fakeChild)
      const codexEnvironmentActionSessions = new Map()
      const bridge = createCodexEnvironmentBridge(baseDependencies({
        codexActionAuthorization, resolveCodexEnvironmentTargetCwd, spawn, codexEnvironmentActionSessions
      }))
      // Seed the vault the same way a real listing call would.
      expect(bridge.listCodexProjectEnvironments('cp_test').outcome).toBe('ok')
      const result = await bridge.runCodexProjectEnvironmentAction({
        targetAlias: 'cp_test', projectKey: 'project-key', environmentId: 'dev', actionId: 'serve'
      })
      expect(result).toMatchObject({ outcome: 'started', session: { state: 'running' } })
      expect(spawn).toHaveBeenCalledTimes(1)
      expect(spawn.mock.calls[0]?.[0]).toBe('/fake/node')
      expect(spawn.mock.calls[0]?.[1]).toEqual(['/fake/pnpm-entry.cjs', 'run', 'serve'])
      expect(codexEnvironmentActionSessions.size).toBe(1)
    })

    it('requires a confirm token for external-write actions, then accepts the issued one', async () => {
      const { envDir } = environmentsDir()
      const configRoot = envDir.replace(/\/\.codex\/environments$/, '')
      writeFileSync(join(envDir, 'dev.toml'), [
        'version = 1', 'name = "Dev"', '[[actions]]', 'name = "Push"', 'command = "git push"'
      ].join('\n'), 'utf8')
      const codexActionAuthorization = createCodexActionAuthorization()
      const resolveCodexEnvironmentTargetCwd = vi.fn(() => ({
        configRoot, executionCwd: configRoot, projectKey: 'project-key', targetId: 'project-key', kind: 'project'
      }))
      // The non-long-running path awaits the child's `exit` event before its
      // promise resolves, so the fake child must fire one -- otherwise the
      // real 10-minute host timeout leaves the test hanging.
      const spawn = vi.fn(() => ({
        pid: 1,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: (event: string, handler: (code: number) => void) => { if (event === 'exit') queueMicrotask(() => handler(0)) }
      }))
      const codexActionUsableFile = (candidate: string) => candidate
      const bridge = createCodexEnvironmentBridge(baseDependencies({
        codexActionAuthorization, resolveCodexEnvironmentTargetCwd, spawn, codexActionUsableFile
      }))
      expect(bridge.listCodexProjectEnvironments('cp_test').outcome).toBe('ok')
      const first = await bridge.runCodexProjectEnvironmentAction({
        targetAlias: 'cp_test', projectKey: 'project-key', environmentId: 'dev', actionId: 'push'
      })
      expect(first).toMatchObject({ outcome: 'confirm-required', errorCode: 'confirm-required' })
      const token = first.confirmToken as string
      expect(token).toBeTruthy()
      const second = await bridge.runCodexProjectEnvironmentAction({
        targetAlias: 'cp_test', projectKey: 'project-key', environmentId: 'dev', actionId: 'push', confirmToken: token
      })
      expect(second.outcome).not.toBe('confirm-required')
    })
  })

  describe('stopCodexEnvironmentActionSession / listCodexEnvironmentActionSessions', () => {
    it('reports not-running for an unknown session and stopping for a tracked one', () => {
      const codexEnvironmentActionSessions = new Map([
        ['target\0dev\0serve', { targetId: 'target', projectKey: 'target', environmentId: 'dev', actionId: 'serve', state: 'running', startedAt: 1, message: '', child: { kill: vi.fn() }, childPid: 42 }]
      ])
      const bridge = createCodexEnvironmentBridge(baseDependencies({ codexEnvironmentActionSessions }))
      expect(bridge.stopCodexEnvironmentActionSession({ targetId: 'missing', environmentId: 'dev', actionId: 'serve' }))
        .toMatchObject({ outcome: 'failed', errorCode: 'not-running' })
      const result = bridge.stopCodexEnvironmentActionSession({ targetId: 'target', environmentId: 'dev', actionId: 'serve' })
      expect(result).toMatchObject({ outcome: 'stopping', session: { state: 'stopping' } })
      expect(bridge.listCodexEnvironmentActionSessions()).toMatchObject([{ state: 'stopping' }])
    })
  })

  describe('shutdownCodexEnvironmentActions', () => {
    it('marks the bridge as shutting down, clears sessions and signals live children', () => {
      const setShuttingDown = vi.fn()
      const kill = vi.fn()
      const codexEnvironmentActionSessions = new Map([
        ['t\0dev\0serve', { state: 'running', childPid: 99, child: { kill }, run: { status: 'running' } }]
      ])
      const codexRunDatabase = { closeCodexActionRunDatabase: vi.fn(), rememberCodexActionRun: vi.fn(), enforceRetentionIfOpen: vi.fn() }
      const bridge = createCodexEnvironmentBridge(baseDependencies({ setShuttingDown, codexEnvironmentActionSessions, codexRunDatabase }))
      bridge.shutdownCodexEnvironmentActions()
      expect(setShuttingDown).toHaveBeenCalledWith(true)
      expect(codexEnvironmentActionSessions.size).toBe(0)
      expect(codexRunDatabase.closeCodexActionRunDatabase).toHaveBeenCalled()
    })
  })

  describe('__internal.resolveCodexActionLaunchPlan', () => {
    it('resolves vite/pnpm/npm/yarn through the injected Node runtime projection', () => {
      const bridge = createCodexEnvironmentBridge(baseDependencies())
      const validated = codexCommandValidation.validateCodexEnvironmentActionCommandHost('pnpm run build')
      const plan = bridge.__internal.resolveCodexActionLaunchPlan(validated, '/project')
      expect(plan).toMatchObject({ command: '/fake/node', args: ['/fake/pnpm-entry.cjs', 'run', 'build'] })
    })

    it('reports node-runtime-unavailable when the injected projection has no resolved candidate', () => {
      const codexActionRuntimeProjection = vi.fn(() => ({ resolved: null, public: { mode: 'auto', state: 'unavailable', message: '未检测到可用的 NVM 或系统 Node' } }))
      const bridge = createCodexEnvironmentBridge(baseDependencies({ codexActionRuntimeProjection }))
      const validated = codexCommandValidation.validateCodexEnvironmentActionCommandHost('pnpm run build')
      const plan = bridge.__internal.resolveCodexActionLaunchPlan(validated, '/project')
      expect(plan).toMatchObject({ errorCode: 'node-runtime-unavailable' })
    })

    it('falls back to a native binary candidate for git, outside the NVM projection', () => {
      const bridge = createCodexEnvironmentBridge(baseDependencies())
      const validated = codexCommandValidation.validateCodexEnvironmentActionCommandHost('git push')
      const plan = bridge.__internal.resolveCodexActionLaunchPlan(validated, '/project')
      expect(plan).toMatchObject({ args: ['push'] })
      expect(typeof plan?.command).toBe('string')
    })
  })

  describe('__internal.signalCodexEnvironmentSession', () => {
    it('sends SIGTERM to the negated process group on POSIX', () => {
      const kill = vi.fn()
      const process = { platform: 'darwin', kill, env: {} }
      const bridge = createCodexEnvironmentBridge(baseDependencies({ process }))
      bridge.__internal.signalCodexEnvironmentSession({ childPid: 777, child: { kill: vi.fn() } })
      expect(kill).toHaveBeenCalledWith(-777, 'SIGTERM')
    })

    it('shells out to taskkill on win32 and falls back to child.kill on failure', async () => {
      const fallback = vi.fn()
      const run = vi.fn(async () => ({ ok: false }))
      const process = { platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, kill: vi.fn() }
      const bridge = createCodexEnvironmentBridge(baseDependencies({ process, run }))
      bridge.__internal.signalCodexEnvironmentSession({ childPid: 432, child: { kill: fallback } })
      await Promise.resolve()
      await Promise.resolve()
      expect(run).toHaveBeenCalledWith('C:\\Windows\\System32\\taskkill.exe', ['/PID', '432', '/T'])
      expect(fallback).toHaveBeenCalledWith('SIGTERM')
    })
  })

  describe('__internal confirm-token wiring', () => {
    it('delegates issue/consume through the injected codexActionAuthorization', () => {
      const codexActionAuthorization = createCodexActionAuthorization()
      const bridge = createCodexEnvironmentBridge(baseDependencies({ codexActionAuthorization }))
      const token = bridge.__internal.issueCodexEnvironmentConfirmToken('target', 'dev', 'push', 'ff', 'cf')
      expect(token).toBeTruthy()
      expect(bridge.__internal.consumeCodexEnvironmentConfirmToken(token, 'target', 'dev', 'push', 'ff', 'cf')).toBe(true)
      expect(bridge.__internal.consumeCodexEnvironmentConfirmToken(token, 'target', 'dev', 'push', 'ff', 'cf')).toBe(false)
    })
  })
})
