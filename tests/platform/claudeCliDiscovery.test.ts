import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * uTools is launched from the Dock, so the preload's `process.env.PATH` is the
 * bare GUI PATH — never the one the user's shell exports. A Claude Code
 * installed with `npm i -g` under nvm therefore matched neither the PATH scan
 * nor any fixed root, was reported as `installed: false`, and the readiness
 * rule turned that into "not installed at all" — which emptied task cards and
 * quota together even though `~/.claude` was perfectly readable.
 */

const require_ = createRequire(import.meta.url)
const environmentModule = require_(resolve(process.cwd(), 'preload/claude/environment.cjs'))

function makeHome() {
  return mkdtempSync(join(tmpdir(), 'eypc-claude-cli-'))
}

function installBinary(directory: string, name = 'claude') {
  mkdirSync(directory, { recursive: true })
  const file = join(directory, name)
  writeFileSync(file, '#!/bin/sh\nexit 0\n')
  return file
}

function deps(home: string, overrides: Record<string, unknown> = {}) {
  return { fs, path, os: { homedir: () => home }, platform: 'darwin', env: { PATH: '' }, ...overrides }
}

describe('CLI discovery reaches Node version managers', () => {
  it('finds a binary under an nvm-managed Node with an empty PATH', () => {
    const home = makeHome()
    const expected = installBinary(join(home, '.nvm', 'versions', 'node', 'v24.14.0', 'bin'))
    expect(environmentModule.locateCli(deps(home))).toBe(expected)
  })

  it('prefers the newest version rather than readdir order', () => {
    const home = makeHome()
    installBinary(join(home, '.nvm', 'versions', 'node', 'v20.9.0', 'bin'))
    const newest = installBinary(join(home, '.nvm', 'versions', 'node', 'v24.14.0', 'bin'))
    installBinary(join(home, '.nvm', 'versions', 'node', 'v9.11.2', 'bin'))
    expect(environmentModule.locateCli(deps(home))).toBe(newest)
  })

  it('orders version directory names numerically, not lexically', () => {
    const sorted = ['v9.11.2', 'v24.14.0', 'v20.9.0'].sort(environmentModule.compareVersionNamesDesc)
    expect(sorted).toEqual(['v24.14.0', 'v20.9.0', 'v9.11.2'])
  })

  it('covers fnm, asdf, nodenv and the global npm/pnpm prefixes', () => {
    const layouts: Array<[string[], string]> = [
      [['.fnm', 'node-versions', 'v22.1.0', 'installation', 'bin'], 'fnm'],
      [['Library', 'Application Support', 'fnm', 'node-versions', 'v22.1.0', 'installation', 'bin'], 'fnm-macos'],
      [['.asdf', 'installs', 'nodejs', '22.1.0', 'bin'], 'asdf'],
      [['.nodenv', 'versions', '22.1.0', 'bin'], 'nodenv'],
      [['.npm-global', 'bin'], 'npm-prefix'],
      [['Library', 'pnpm'], 'pnpm'],
      [['.yarn', 'bin'], 'yarn']
    ]
    for (const [segments, label] of layouts) {
      const home = makeHome()
      const expected = installBinary(join(home, ...segments))
      expect(environmentModule.locateCli(deps(home)), label).toBe(expected)
    }
  })

  it('still prefers PATH and an explicit manual path over discovery', () => {
    const home = makeHome()
    installBinary(join(home, '.nvm', 'versions', 'node', 'v24.14.0', 'bin'))
    const onPath = installBinary(join(home, 'custom', 'bin'))
    expect(environmentModule.locateCli(deps(home, { env: { PATH: join(home, 'custom', 'bin') } }))).toBe(onPath)

    const manual = installBinary(join(home, 'manual'), 'claude')
    expect(environmentModule.locateCli(deps(home, { manualPath: manual }))).toBe(manual)
  })

  it('degrades quietly when no version manager directory exists', () => {
    const home = makeHome()
    expect(environmentModule.versionManagerBinRoots(deps(home))).toEqual([])
    expect(environmentModule.locateCli(deps(home))).toBe('')
  })
})

describe('a readable ~/.claude survives an undiscoverable binary', () => {
  it('reports the data directory as ready and only the binary as missing', () => {
    const home = makeHome()
    mkdirSync(join(home, '.claude', 'projects'), { recursive: true })
    const probe = environmentModule.createEnvironmentProbe(deps(home))
    const snapshot = probe.inspect({})
    expect(snapshot.installed).toBe(false)
    expect(snapshot.homeReady).toBe(true)
    expect(snapshot.authenticated).toBe(true)
  })

  it('accepts a per-call manual path override', () => {
    const home = makeHome()
    mkdirSync(join(home, '.claude', 'projects'), { recursive: true })
    const manual = installBinary(join(home, 'elsewhere'))
    const probe = environmentModule.createEnvironmentProbe(deps(home))
    expect(probe.inspect({}).installed).toBe(false)
    expect(probe.inspect({ manualPath: manual }).installed).toBe(true)
    expect(probe.locateCli({ manualPath: manual })).toBe(manual)
  })
})
