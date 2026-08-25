import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

export const UTOOLS_PRELOAD_ASSETS = Object.freeze([
  { id: 'main', canonical: 'preload/index.js', public: 'public/preload.js', dist: 'preload.js' },
  { id: 'float', canonical: 'preload/float.js', public: 'public/float-preload.js', dist: 'float-preload.js' },
  { id: 'action', canonical: 'preload/action.js', public: 'public/action-preload.js', dist: 'action-preload.js' },
  { id: 'diagnostics', canonical: 'preload/diagnostics.cjs', public: 'public/diagnostics.cjs', dist: 'diagnostics.cjs' },
  { id: 'timing-policy', canonical: 'preload/timing-policy.cjs', public: 'public/timing-policy.cjs', dist: 'timing-policy.cjs' },
  { id: 'task-phase', canonical: 'preload/task-phase.cjs', public: 'public/task-phase.cjs', dist: 'task-phase.cjs' }
])

/**
 * Preload module groups mirrored verbatim into public/ and dist/. Each group is
 * a self-contained subsystem the main preload loads through a guarded require,
 * so a group can be added without touching the sync, prepare or validate steps.
 */
export const UTOOLS_PRELOAD_MODULE_GROUPS = Object.freeze([
  {
    id: 'codex',
    directory: 'codex',
    files: ['action-authorization.cjs', 'action-runtime-projection.cjs', 'archive-bridge.cjs', 'command-validation.cjs', 'desktop-activity-aggregation.cjs', 'desktop-activity-resolution.cjs', 'desktop-ipc-endpoint.cjs', 'desktop-process-probe.cjs', 'desktop-request-projection.cjs', 'desktop-shadow.cjs', 'environment-bridge.cjs', 'environment-toml.cjs', 'float-bridge.cjs', 'float-window-size.cjs', 'inventory-thread-topology.cjs', 'inventory-turn-fields.cjs', 'launch-path-preference.cjs', 'native-registry.cjs', 'native-state-paths.cjs', 'node-runtime.cjs', 'log-redaction.cjs', 'log-stream.cjs', 'launch-plan.cjs', 'proxy-discovery.cjs', 'quota-sanitizer.cjs', 'rollout-evidence.cjs', 'rollout-runtime-state.cjs', 'run-database.cjs', 'runner-bounds.cjs', 'waiting-evidence.cjs']
  },
  {
    id: 'companion',
    directory: 'companion',
    files: ['provider-manifest.json', 'provider-registry.cjs', 'contracts-v7.cjs', 'evidence-adapter-v7.cjs', 'task-topology.cjs', 'branch-causality.cjs', 'open-handoff.cjs', 'navigation.cjs', 'task-actions.cjs', 'task-kernel.cjs']
  },
  {
    id: 'windows',
    directory: 'windows',
    files: ['index.cjs', 'native-command.cjs', 'session-cache.cjs', 'macos.cjs', 'macos-space.cjs', 'win32.cjs']
  },
  {
    id: 'claude',
    directory: 'claude',
    files: [
      'index.cjs',
      'archive.cjs',
      'app-paths.cjs',
      'app-state.cjs',
      'code-sessions.cjs',
      'unread.cjs',
      'plan-usage.cjs',
      'settings.cjs',
      'events.cjs',
      'scripts.cjs',
      'environment.cjs',
      'open.cjs',
      'quota.cjs'
    ]
  },
  {
    id: 'cursor',
    directory: 'cursor',
    files: [
      'index.cjs',
      'inventory.cjs',
      'settings.cjs',
      'scripts.cjs',
      'events.cjs',
      'open.cjs',
      'archive.cjs'
    ]
  }
])

export const UTOOLS_PRELOAD_MODULE_ASSETS = Object.freeze(
  UTOOLS_PRELOAD_MODULE_GROUPS.flatMap((group) => group.files.map((file) => ({
    group: group.id,
    canonical: `preload/${group.directory}/${file}`,
    public: `public/${group.directory}/${file}`,
    dist: `${group.directory}/${file}`
  })))
)

export function syncUtoolsPreloads(root, target) {
  if (target !== 'public' && target !== 'dist') throw new Error(`unsupported preload target: ${target}`)
  for (const asset of UTOOLS_PRELOAD_ASSETS) {
    const destination = target === 'public'
      ? resolve(root, asset.public)
      : resolve(root, 'dist', asset.dist)
    copyFileSync(resolve(root, asset.canonical), destination)
  }
  for (const group of UTOOLS_PRELOAD_MODULE_GROUPS) {
    const directory = resolve(root, target, group.directory)
    if (!existsSync(directory)) continue
    const expected = new Set(group.files)
    for (const file of readdirSync(directory)) {
      if (file.endsWith('.cjs') && !expected.has(file)) rmSync(resolve(directory, file), { force: true })
    }
  }
  for (const asset of UTOOLS_PRELOAD_MODULE_ASSETS) {
    const destination = target === 'public'
      ? resolve(root, asset.public)
      : resolve(root, 'dist', asset.dist)
    const directory = resolve(destination, '..')
    mkdirSync(directory, { recursive: true })
    copyFileSync(resolve(root, asset.canonical), destination)
  }
}
