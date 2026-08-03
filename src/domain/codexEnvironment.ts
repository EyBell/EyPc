/** Codex local-environment Action projections and pure helpers (EyPc-equivalent execution, not native App Actions). */

export type CodexEnvironmentActionRisk = 'normal' | 'external-write' | 'long-running' | 'display-only'

export const CODEX_ACTION_HOST_RUNTIME_REVISION = 'action-host-v2-exact-argv-target'

export type CodexValidatedEnvironmentActionCommand =
  | {
      family: 'package-script'
      executable: 'pnpm' | 'npm' | 'yarn' | 'bun'
      task: 'build' | 'serve'
      argv: [string, 'run', 'build' | 'serve']
      risk: 'normal' | 'long-running'
    }
  | {
      family: 'vite'
      executable: 'vite'
      task: 'build' | 'serve'
      argv: ['vite', 'build' | 'serve']
      risk: 'normal' | 'long-running'
    }
  | {
      family: 'git-push'
      executable: 'git'
      task: 'push'
      argv: ['git', 'push']
      risk: 'external-write'
    }

export interface CodexEnvironmentActionProjection {
  id: string
  name: string
  icon: string
  risk: CodexEnvironmentActionRisk
  displayOnly: boolean
  slotEligible: boolean
}

export interface CodexEnvironmentProjection {
  id: string
  name: string
  setupScriptPresent: boolean
  actions: CodexEnvironmentActionProjection[]
}

export interface CodexEnvironmentListResult {
  outcome: 'ok' | 'failed'
  errorCode?: string
  message?: string
  runtimeRevision?: string
  projectKey?: string
  targetId?: string
  environments: CodexEnvironmentProjection[]
}

export interface CodexEnvironmentActionSessionProjection {
  targetAlias: string
  targetId: string
  projectKey: string
  environmentId: string
  actionId: string
  state: 'idle' | 'running' | 'stopping'
  startedAt: number
  exitCode?: number
  message?: string
}

export interface CodexEnvironmentActionRunResult {
  outcome: 'ok' | 'started' | 'running' | 'stopping' | 'confirm-required' | 'rejected' | 'failed'
  errorCode?: string
  message?: string
  exitCode?: number
  confirmToken?: string
  risk?: CodexEnvironmentActionRisk
  session?: CodexEnvironmentActionSessionProjection | null
}

export interface CodexEnvironmentActionSlot {
  index: number
  action: CodexEnvironmentActionProjection | null
  sessionState: 'idle' | 'running' | 'stopping'
}

export interface CodexEnvironmentProjectCandidate {
  projectKey: string
  projectName: string
  actionAlias?: string
  source: 'pinned' | 'recent'
  lastQuestionAt: number
}

export interface CodexParsedEnvironmentToml {
  version: number
  name: string
  setupScript: string
  actions: Array<{ name: string; icon: string; command: string }>
}

const ACTION_SLOT_COUNT = 5
const CODEX_ACTION_PACKAGE_MANAGERS = new Set(['pnpm', 'npm', 'yarn', 'bun'])

function tokenizeCodexEnvironmentActionCommand(command: string): string[] | null {
  if (typeof command !== 'string' || !command.trim() || /[\r\n]/.test(command)) return null
  const result: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false
  for (const ch of command) {
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (quote) {
      if (ch === '\\' && quote === '"') {
        escaped = true
        continue
      }
      if (ch === quote) {
        quote = null
        continue
      }
      current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (/\s/.test(ch)) {
      if (current) {
        result.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (quote || escaped) return null
  if (current) result.push(current)
  return result
}

export function validateCodexEnvironmentActionCommand(command: string): CodexValidatedEnvironmentActionCommand | null {
  const argv = tokenizeCodexEnvironmentActionCommand(command)
  if (!argv) return null
  if (argv.length === 3 && CODEX_ACTION_PACKAGE_MANAGERS.has(argv[0]!) && argv[1] === 'run' && (argv[2] === 'build' || argv[2] === 'serve')) {
    const executable = argv[0] as 'pnpm' | 'npm' | 'yarn' | 'bun'
    const task = argv[2] as 'build' | 'serve'
    return {
      family: 'package-script',
      executable,
      task,
      argv: [executable, 'run', task],
      risk: task === 'serve' ? 'long-running' : 'normal'
    }
  }
  if (argv.length === 2 && argv[0] === 'vite' && (argv[1] === 'build' || argv[1] === 'serve')) {
    const task = argv[1]
    return {
      family: 'vite',
      executable: 'vite',
      task,
      argv: ['vite', task],
      risk: task === 'serve' ? 'long-running' : 'normal'
    }
  }
  if (argv.length === 2 && argv[0] === 'git' && argv[1] === 'push') {
    return { family: 'git-push', executable: 'git', task: 'push', argv: ['git', 'push'], risk: 'external-write' }
  }
  return null
}

export function codexEnvironmentActionSlotCount(): number {
  return ACTION_SLOT_COUNT
}

export function classifyCodexEnvironmentActionRisk(name: string, command: string): CodexEnvironmentActionRisk {
  void name
  return validateCodexEnvironmentActionCommand(command)?.risk || 'display-only'
}

export function actionIdFromName(name: string, index: number): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return slug || `action-${index + 1}`
}

export function projectCodexEnvironmentActions(
  actions: Array<{ name: string; icon: string; command: string }>
): CodexEnvironmentActionProjection[] {
  const seen = new Set<string>()
  return actions.flatMap((action, index) => {
    const validated = validateCodexEnvironmentActionCommand(action.command)
    if (!validated) return []
    let id = actionIdFromName(action.name, index)
    if (seen.has(id)) id = `${id}-${index + 1}`
    seen.add(id)
    return [{
      id,
      name: action.name.trim().slice(0, 80) || `Action ${index + 1}`,
      icon: (action.icon || 'run').trim().slice(0, 40) || 'run',
      risk: validated.risk,
      displayOnly: false,
      slotEligible: true
    }]
  })
}

export function buildCodexEnvironmentActionSlots(
  environment: CodexEnvironmentProjection | null | undefined,
  sessionStates: Record<string, 'idle' | 'running' | 'stopping'> = {}
): CodexEnvironmentActionSlot[] {
  const eligible = (environment?.actions || []).filter((action) => action.slotEligible && !action.displayOnly).slice(0, ACTION_SLOT_COUNT)
  return Array.from({ length: ACTION_SLOT_COUNT }, (_, index) => {
    const action = eligible[index] || null
    const sessionState = action ? (sessionStates[action.id] || 'idle') : 'idle'
    return { index, action, sessionState }
  })
}

function unquoteTomlString(raw: string): string {
  const value = raw.trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const body = value.slice(1, -1)
    return body.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return value
}

/**
 * Minimal TOML subset for Codex local environment files:
 * version, name, [setup].script, [[actions]] name/icon/command.
 */
export function parseCodexEnvironmentToml(text: string): CodexParsedEnvironmentToml | null {
  if (typeof text !== 'string' || !text.trim()) return null
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  let section: 'root' | 'setup' | 'action' = 'root'
  let version = 0
  let versionPresent = false
  let name = ''
  let setupScript = ''
  const actions: Array<{ name: string; icon: string; command: string }> = []
  let currentAction: { name: string; icon: string; command: string } | null = null
  let parseError = false

  const stripTomlComment = (rawLine: string) => {
    let inSingle = false
    let inDouble = false
    let escaped = false
    for (let i = 0; i < rawLine.length; i += 1) {
      const ch = rawLine[i]!
      if (escaped) {
        escaped = false
        continue
      }
      if (inDouble && ch === '\\') {
        escaped = true
        continue
      }
      if (!inDouble && ch === '\'') {
        inSingle = !inSingle
        continue
      }
      if (!inSingle && ch === '"') {
        inDouble = !inDouble
        continue
      }
      if (ch === '#' && !inSingle && !inDouble) return rawLine.slice(0, i)
    }
    return rawLine
  }

  const flushAction = () => {
    if (!currentAction) return
    if (currentAction.name && currentAction.command) actions.push({ ...currentAction })
    else parseError = true
    currentAction = null
  }

  if (text.includes('"""') || text.includes("'''")) return null
  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim()
    if (!line) continue
    if (line === '[setup]') {
      flushAction()
      section = 'setup'
      continue
    }
    if (line === '[[actions]]') {
      flushAction()
      section = 'action'
      currentAction = { name: '', icon: 'run', command: '' }
      continue
    }
    if (line.startsWith('[')) {
      flushAction()
      section = 'root'
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const rawValue = line.slice(eq + 1).trim()
    const value = unquoteTomlString(rawValue)
    if (section === 'root') {
      if (key === 'version') {
        versionPresent = true
        if (rawValue !== '1') parseError = true
        version = rawValue === '1' ? 1 : NaN
      }
      else if (key === 'name') name = value.slice(0, 120)
    } else if (section === 'setup') {
      if (key === 'script') setupScript = value.slice(0, 4_000)
    } else if (section === 'action' && currentAction) {
      if (key === 'name') currentAction.name = value.slice(0, 80)
      else if (key === 'icon') currentAction.icon = value.slice(0, 40) || 'run'
      else if (key === 'command') currentAction.command = value.slice(0, 4_000)
    }
  }
  flushAction()
  if (!name && !actions.length && !setupScript) return null
  if (parseError) return null
  if (!versionPresent || version !== 1) return null
  return {
    version: 1,
    name: name || 'Environment',
    setupScript,
    actions
  }
}

export function environmentIdFromFileName(fileName: string): string {
  const base = fileName.replace(/\.toml$/i, '').trim().toLowerCase()
  const slug = base.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return slug || 'environment'
}

export function projectCodexEnvironmentFromParsed(
  id: string,
  parsed: CodexParsedEnvironmentToml
): CodexEnvironmentProjection {
  return {
    id,
    name: parsed.name || id,
    setupScriptPresent: Boolean(parsed.setupScript.trim()),
    actions: projectCodexEnvironmentActions(parsed.actions)
  }
}

export function buildCodexEnvironmentProjectCandidates(input: {
  pinnedProjects: Array<{ key: string; name: string; actionAlias?: string; kind: 'project' | 'chats' }>
  projects: Array<{ key: string; name: string; actionAlias?: string; kind: 'project' | 'chats'; tasks: Array<{ lastQuestionAt?: number }> }>
}): CodexEnvironmentProjectCandidate[] {
  const result: CodexEnvironmentProjectCandidate[] = []
  const seen = new Set<string>()
  for (const project of input.pinnedProjects) {
    if (project.kind === 'chats' || seen.has(project.key)) continue
    seen.add(project.key)
    const live = input.projects.find((item) => item.key === project.key)
    const lastQuestionAt = Math.max(0, ...(live?.tasks || []).map((task) => task.lastQuestionAt || 0))
    result.push({
      projectKey: project.key,
      projectName: project.name,
      actionAlias: project.actionAlias || live?.actionAlias,
      source: 'pinned',
      lastQuestionAt
    })
  }
  const recent = input.projects
    .filter((project) => project.kind !== 'chats' && !seen.has(project.key))
    .map((project) => {
      const lastQuestionAt = Math.max(0, ...project.tasks.map((task) => task.lastQuestionAt || 0))
      return {
        projectKey: project.key,
        projectName: project.name,
        actionAlias: project.actionAlias,
        source: 'recent' as const,
        lastQuestionAt
      }
    })
    .filter((item) => item.lastQuestionAt > 0)
    .sort((left, right) => right.lastQuestionAt - left.lastQuestionAt || left.projectName.localeCompare(right.projectName))
  for (const item of recent) {
    if (seen.has(item.projectKey)) continue
    seen.add(item.projectKey)
    result.push(item)
  }
  return result
}

export function resolveCodexEnvironmentActionTarget(input: {
  selectedTasks: Array<{ key: string; projectKey: string; actionAlias?: string; projectName: string }>
  focusedTask?: { key: string; projectKey: string; actionAlias?: string; projectName: string } | null
  focusedProject?: { key: string; name: string; actionAlias?: string; kind: 'project' | 'chats' } | null
  defaultProjectKey?: string
  projectsTabProject?: { key: string; name: string; actionAlias?: string; kind: 'project' | 'chats' } | null
  projects?: Array<{ key: string; name: string; actionAlias?: string; kind: 'project' | 'chats' }>
}): { kind: 'task' | 'project'; projectKey: string; projectName: string; targetAlias: string } | null {
  const selected = input.selectedTasks[0]
  if (selected?.projectKey && selected.actionAlias) {
    return {
      kind: 'task',
      projectKey: selected.projectKey,
      projectName: selected.projectName,
      targetAlias: selected.actionAlias
    }
  }
  if (input.focusedTask?.projectKey && input.focusedTask.actionAlias) {
    return {
      kind: 'task',
      projectKey: input.focusedTask.projectKey,
      projectName: input.focusedTask.projectName,
      targetAlias: input.focusedTask.actionAlias
    }
  }
  if (input.focusedProject && input.focusedProject.kind !== 'chats' && input.focusedProject.actionAlias) {
    return {
      kind: 'project',
      projectKey: input.focusedProject.key,
      projectName: input.focusedProject.name,
      targetAlias: input.focusedProject.actionAlias
    }
  }
  const defaultKey = typeof input.defaultProjectKey === 'string' ? input.defaultProjectKey.trim() : ''
  if (defaultKey) {
    const configured = (input.projects || []).find((item) => item.key === defaultKey && item.kind === 'project' && item.actionAlias)
    if (configured?.actionAlias) {
      return {
        kind: 'project',
        projectKey: configured.key,
        projectName: configured.name,
        targetAlias: configured.actionAlias
      }
    }
  }
  const tabProject = input.projectsTabProject
  if (tabProject && tabProject.kind !== 'chats' && tabProject.actionAlias) {
    return {
      kind: 'project',
      projectKey: tabProject.key,
      projectName: tabProject.name,
      targetAlias: tabProject.actionAlias
    }
  }
  return null
}
