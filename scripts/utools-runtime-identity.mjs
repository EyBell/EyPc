import crypto from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { relative, resolve } from 'node:path'
import { UTOOLS_PRELOAD_ASSETS, UTOOLS_PRELOAD_MODULE_ASSETS } from './utools-preload-assets.mjs'
import { EYPC_CORE_VERSION, EYPC_CORE_VERSION_LABEL } from './eypc-core-version.mjs'

const require = createRequire(import.meta.url)
const providerManifest = require('../preload/companion/provider-manifest.json')

export const RUNTIME_IDENTITY_REVISION = 'runtime-identity-v2'
export const COMPANION_TASK_KERNEL_REVISION = providerManifest.kernelRevision
export const COMPANION_PROVIDER_REGISTRY_REVISION = providerManifest.revision
export const COMPANION_TASK_TOPOLOGY_REVISION = providerManifest.topologyRevision
export const COMPANION_TASK_PACKAGE_REVISION = providerManifest.snapshotRevision
export const COMPANION_TASK_COMMAND_REVISION = providerManifest.commandRevision
export const COMPANION_TASK_SUBSCRIBE_REVISION = providerManifest.subscribeRevision
export const COMPANION_TASK_ACK_REVISION = providerManifest.ackRevision

function filesBelow(directory) {
  if (!existsSync(directory)) return []
  const result = []
  for (const name of readdirSync(directory).sort()) {
    const file = resolve(directory, name)
    const stats = statSync(file)
    if (stats.isDirectory()) result.push(...filesBelow(file))
    else if (stats.isFile()) result.push(file)
  }
  return result
}

function contentIdentity(root, prefix, files, seed = '') {
  const hash = crypto.createHash('sha256')
  if (seed) {
    hash.update('seed')
    hash.update('\0')
    hash.update(seed)
    hash.update('\0')
  }
  for (const file of [...new Set(files)].sort()) {
    const label = relative(root, file).replaceAll('\\', '/')
    hash.update(label)
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return `${prefix}-${hash.digest('hex').slice(0, 20)}`
}

export function formatEyPcBuildStamp(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)
}

export function withArtifactMetadata(identity, options = {}) {
  const builtAt = options.builtAt ?? new Date()
  const packageVersion = options.packageVersion ?? ''
  return Object.freeze({
    ...identity,
    builtAt: builtAt.toISOString(),
    builtAtLocal: formatEyPcBuildStamp(builtAt),
    packageVersion
  })
}

export function printEyPcBuildSummary(identity, options = {}) {
  const label = options.label ?? 'EyPc build'
  const mode = options.mode ?? 'production'
  const builtAtLocal = identity.builtAtLocal
    || (identity.builtAt ? formatEyPcBuildStamp(new Date(identity.builtAt)) : '-')
  const builtAtIso = identity.builtAt || '-'
  const revisionLine = [
    identity.kernelRevision,
    identity.registryRevision,
    identity.topologyRevision,
    identity.taskPackageRevision,
    identity.commandRevision,
    identity.subscribeRevision,
    identity.ackRevision
  ].join(' / ')
  console.log([
    '',
    `${label} (${mode})`,
    `  core: ${identity.coreVersionLabel || EYPC_CORE_VERSION_LABEL} (${identity.coreVersion || EYPC_CORE_VERSION})`,
    `  package: ${identity.packageVersion || '-'}`,
    `  builtAt: ${builtAtLocal} (${builtAtIso})`,
    `  artifact: ${identity.artifactState}`,
    `  host: ${identity.hostAssetId}`,
    `  renderer: ${identity.rendererAssetId}`,
    `  revisions: ${revisionLine}`,
    ''
  ].join('\n'))
}

export function buildUtoolsRuntimeIdentity(root) {
  const hostFiles = [
    resolve(root, 'public/plugin.json'),
    ...UTOOLS_PRELOAD_ASSETS.map((asset) => resolve(root, asset.canonical)),
    ...UTOOLS_PRELOAD_MODULE_ASSETS.map((asset) => resolve(root, asset.canonical))
  ]
  const rendererFiles = [
    ...filesBelow(resolve(root, 'src')),
    resolve(root, 'index.html'),
    resolve(root, 'float.html'),
    resolve(root, 'action.html'),
    resolve(root, 'vite.config.ts'),
    resolve(root, 'package.json')
  ]
  const hostAssetId = contentIdentity(root, 'host', hostFiles)
  return Object.freeze({
    revision: RUNTIME_IDENTITY_REVISION,
    coreVersion: EYPC_CORE_VERSION,
    coreVersionLabel: EYPC_CORE_VERSION_LABEL,
    hostAssetId,
    // Main/Float embed the expected Host id. Seeding their identity with it
    // makes rendererAssetId identify the actual compiled UI contract, not only
    // the unchanged Renderer source tree around a changed Preload build.
    rendererAssetId: contentIdentity(root, 'renderer', rendererFiles, hostAssetId),
    kernelRevision: COMPANION_TASK_KERNEL_REVISION,
    registryRevision: COMPANION_PROVIDER_REGISTRY_REVISION,
    topologyRevision: COMPANION_TASK_TOPOLOGY_REVISION,
    taskPackageRevision: COMPANION_TASK_PACKAGE_REVISION,
    commandRevision: COMPANION_TASK_COMMAND_REVISION,
    subscribeRevision: COMPANION_TASK_SUBSCRIBE_REVISION,
    ackRevision: COMPANION_TASK_ACK_REVISION,
    artifactState: 'artifact-ready'
  })
}

export function runtimeIdentityCommonJs(identity) {
  return `'use strict'\n\nmodule.exports = Object.freeze(${JSON.stringify(identity, null, 2)})\n`
}
