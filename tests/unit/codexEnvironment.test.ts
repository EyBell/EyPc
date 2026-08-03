import { describe, expect, it } from 'vitest'
import {
  CODEX_ACTION_HOST_RUNTIME_REVISION,
  buildCodexEnvironmentActionSlots,
  buildCodexEnvironmentProjectCandidates,
  classifyCodexEnvironmentActionRisk,
  parseCodexEnvironmentToml,
  projectCodexEnvironmentFromParsed,
  resolveCodexEnvironmentActionTarget,
  validateCodexEnvironmentActionCommand
} from '../../src/domain/codexEnvironment'

describe('codexEnvironment TOML subset', () => {
  it('parses EyPc environment.toml shape', () => {
    const parsed = parseCodexEnvironmentToml(`
version = 1
name = "EyPc"

[setup]
script = "pnpm install --frozen-lockfile"

[[actions]]
name = "Build"
icon = "run"
command = "pnpm run build"

[[actions]]
name = "Serve"
icon = "run"
command = "pnpm run serve"

[[actions]]
name = "Git Push"
icon = "run"
command = "git push"
`)
    expect(parsed).toMatchObject({
      version: 1,
      name: 'EyPc',
      setupScript: 'pnpm install --frozen-lockfile'
    })
    expect(parsed?.actions.map((item) => item.name)).toEqual(['Build', 'Serve', 'Git Push'])
  })

  it('returns null for empty garbage', () => {
    expect(parseCodexEnvironmentToml('')).toBeNull()
    expect(parseCodexEnvironmentToml('# only comment')).toBeNull()
  })

  it('does not treat # inside quoted strings as comments and rejects unknown version', () => {
    const parsed = parseCodexEnvironmentToml(`
version = 1
name = "Demo"

[[actions]]
name = "Build"
command = 'echo hi # not comment'
` )
    expect(parsed).not.toBeNull()
    expect(parsed?.actions[0]?.command).toContain('# not comment')

    expect(parseCodexEnvironmentToml(`
version = 2
name = "X"
`)).toBeNull()
  })

  it('accepts only the raw bare integer version token 1', () => {
    expect(CODEX_ACTION_HOST_RUNTIME_REVISION).toMatch(/^action-host-v\d+-/)
    for (const version of ['"1"', "'1'", '1.0', '1e0', '01']) {
      expect(parseCodexEnvironmentToml(`
version = ${version}
name = "Rejected"
`), version).toBeNull()
    }
  })
})

describe('codexEnvironment structured Action command allowlist', () => {
  it('accepts only complete package-script, Vite and Git Push argv shapes', () => {
    for (const manager of ['pnpm', 'npm', 'yarn', 'bun']) {
      expect(validateCodexEnvironmentActionCommand(`${manager} run build`)).toEqual({
        family: 'package-script',
        executable: manager,
        task: 'build',
        argv: [manager, 'run', 'build'],
        risk: 'normal'
      })
      expect(validateCodexEnvironmentActionCommand(`${manager} run serve`)).toMatchObject({
        family: 'package-script',
        executable: manager,
        task: 'serve',
        risk: 'long-running'
      })
    }
    expect(validateCodexEnvironmentActionCommand('vite build')).toMatchObject({ family: 'vite', task: 'build', risk: 'normal' })
    expect(validateCodexEnvironmentActionCommand('vite serve')).toMatchObject({ family: 'vite', task: 'serve', risk: 'long-running' })
    expect(validateCodexEnvironmentActionCommand('git push')).toEqual({
      family: 'git-push',
      executable: 'git',
      task: 'push',
      argv: ['git', 'push'],
      risk: 'external-write'
    })
  })

  it('rejects shell syntax, flags, refs and every extra token', () => {
    const rejected = [
      'pnpm run build $(whoami)',
      'pnpm run build &',
      'pnpm run build | tee output.log',
      'pnpm\nrun build',
      'pnpm run build --',
      'pnpm run build extra',
      'vite build --config hostile.ts',
      'vite serve --host',
      'git push origin main',
      'git push --force',
      'git push --force-with-lease'
    ]
    for (const command of rejected) expect(validateCodexEnvironmentActionCommand(command), command).toBeNull()
  })
})

describe('codexEnvironment risk and slots', () => {
  it('classifies push/serve/build', () => {
    expect(classifyCodexEnvironmentActionRisk('Git Push', 'git push')).toBe('external-write')
    expect(classifyCodexEnvironmentActionRisk('Serve', 'pnpm run serve')).toBe('long-running')
    expect(classifyCodexEnvironmentActionRisk('Build', 'pnpm run build')).toBe('normal')
  })

  it('projects five slots and keeps setup out of executable actions', () => {
    const parsed = parseCodexEnvironmentToml(`
version = 1
name = "Demo"
[setup]
script = "echo setup"
[[actions]]
name = "Build"
command = "pnpm run build"
[[actions]]
name = "Serve"
command = "pnpm run serve"
[[actions]]
name = "Git Push"
command = "git push"
`)!
    const environment = projectCodexEnvironmentFromParsed('environment', parsed)
    expect(environment.setupScriptPresent).toBe(true)
    expect(environment.actions.every((action) => action.id !== 'setup')).toBe(true)
    const slots = buildCodexEnvironmentActionSlots(environment, { serve: 'running' })
    expect(slots).toHaveLength(5)
    expect(slots[0].action?.name).toBe('Build')
    expect(slots[1].sessionState).toBe('running')
    expect(slots[3].action).toBeNull()
  })
})

describe('codexEnvironment target and candidates', () => {
  it('prefers selected task then focused project', () => {
    expect(resolveCodexEnvironmentActionTarget({
      selectedTasks: [{ key: 't1', projectKey: 'p1', actionAlias: 'ct_aaaaaaaaaaaaaaaaaa', projectName: 'A' }],
      focusedTask: { key: 't2', projectKey: 'p2', actionAlias: 'ct_bbbbbbbbbbbbbbbbbb', projectName: 'B' },
      focusedProject: { key: 'p3', name: 'C', actionAlias: 'cp_cccccccccccccccccc', kind: 'project' }
    })).toMatchObject({ projectKey: 'p1', kind: 'task' })

    expect(resolveCodexEnvironmentActionTarget({
      selectedTasks: [],
      focusedTask: null,
      focusedProject: { key: 'p3', name: 'C', actionAlias: 'cp_cccccccccccccccccc', kind: 'project' }
    })).toMatchObject({ projectKey: 'p3', kind: 'project' })

    expect(resolveCodexEnvironmentActionTarget({
      selectedTasks: [],
      focusedProject: { key: 'chats', name: 'Chats', actionAlias: 'cp_dddddddddddddddddd', kind: 'chats' }
    })).toBeNull()
  })

  it('uses configured default before projects-tab fallback', () => {
    const projects = [
      { key: 'defaulthash00000000000000000001', name: 'Default', actionAlias: 'cp_eeeeeeeeeeeeeeeeee', kind: 'project' as const },
      { key: 'tabhash000000000000000000000002', name: 'Tab', actionAlias: 'cp_ffffffffffffffffff', kind: 'project' as const }
    ]
    expect(resolveCodexEnvironmentActionTarget({
      selectedTasks: [],
      defaultProjectKey: 'defaulthash00000000000000000001',
      projectsTabProject: projects[1],
      projects
    })).toMatchObject({ projectKey: 'defaulthash00000000000000000001', kind: 'project' })

    expect(resolveCodexEnvironmentActionTarget({
      selectedTasks: [],
      defaultProjectKey: '',
      projectsTabProject: projects[1],
      projects
    })).toMatchObject({ projectKey: 'tabhash000000000000000000000002', kind: 'project' })
  })

  it('lists pinned projects before recent', () => {
    const candidates = buildCodexEnvironmentProjectCandidates({
      pinnedProjects: [
        { key: 'pin', name: 'Pinned', actionAlias: 'cp_eeeeeeeeeeeeeeeeee', kind: 'project' },
        { key: 'chats', name: 'Chats', kind: 'chats' }
      ],
      projects: [
        { key: 'pin', name: 'Pinned', actionAlias: 'cp_eeeeeeeeeeeeeeeeee', kind: 'project', tasks: [{ lastQuestionAt: 10 }] },
        { key: 'recent', name: 'Recent', actionAlias: 'cp_ffffffffffffffffff', kind: 'project', tasks: [{ lastQuestionAt: 50 }] },
        { key: 'old', name: 'Old', actionAlias: 'cp_gggggggggggggggggg', kind: 'project', tasks: [] }
      ]
    })
    expect(candidates.map((item) => item.projectKey)).toEqual(['pin', 'recent'])
    expect(candidates[0].source).toBe('pinned')
    expect(candidates[1].source).toBe('recent')
  })
})

describe('codexEnvironment host contract notes', () => {
  it('marks push as confirm-gated and setup as non-slot', () => {
    expect(classifyCodexEnvironmentActionRisk('Git Push', 'git push')).toBe('external-write')
    const parsed = parseCodexEnvironmentToml(`
version = 1
name = "X"
[setup]
script = "pnpm install"
[[actions]]
name = "Build"
command = "pnpm run build"
`)!
    const environment = projectCodexEnvironmentFromParsed('environment', parsed)
    expect(environment.setupScriptPresent).toBe(true)
    expect(environment.actions.some((action) => action.id === 'setup')).toBe(false)
    // Host runProjectAction rejects actionId === 'setup' and external-write without confirmToken.
  })
})
