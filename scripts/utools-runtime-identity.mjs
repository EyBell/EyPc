import crypto from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { UTOOLS_PRELOAD_ASSETS, UTOOLS_PRELOAD_MODULE_ASSETS } from './utools-preload-assets.mjs'

export const RUNTIME_IDENTITY_REVISION = 'runtime-identity-v1'
export const COMPANION_TASK_KERNEL_REVISION = 'companion-task-kernel-v1'
export const COMPANION_TASK_PACKAGE_REVISION = 'companion-task-package-v1'

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
    hostAssetId,
    // Main/Float embed the expected Host id. Seeding their identity with it
    // makes rendererAssetId identify the actual compiled UI contract, not only
    // the unchanged Renderer source tree around a changed Preload build.
    rendererAssetId: contentIdentity(root, 'renderer', rendererFiles, hostAssetId),
    kernelRevision: COMPANION_TASK_KERNEL_REVISION,
    taskPackageRevision: COMPANION_TASK_PACKAGE_REVISION,
    artifactState: 'artifact-ready'
  })
}

export function runtimeIdentityCommonJs(identity) {
  return `'use strict'\n\nmodule.exports = Object.freeze(${JSON.stringify(identity, null, 2)})\n`
}
