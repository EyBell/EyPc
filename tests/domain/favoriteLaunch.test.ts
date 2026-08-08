import { describe, expect, it } from 'vitest'
import {
  FAVORITE_SEARCH_ITEMS_PER_QUERY_LIMIT,
  FAVORITE_SEARCH_QUERY_LIMIT,
  FAVORITE_SEARCH_HALF_LIFE_MS,
  createFavoriteSlots,
  favoriteFrecency,
  favoriteRunnerFingerprint,
  isFavoriteRunnerTrusted,
  legacyFavoriteRunnerFingerprint,
  normalizeFavoriteRunnerByPlatform,
  pruneFavoriteSearchAffinities,
  recordFavoriteSearchAffinity,
  resolveFavoriteRunner,
  suggestedFavoriteRunner,
  trustFavoriteRunner
} from '../../src/domain/favoriteLaunch'
import { filterFavoriteItems } from '../../src/domain/favorites'
import { normalizeAppState } from '../../src/domain/state'
import type { FavoriteNode, FavoriteRunnerConfig, FavoriteSearchAffinity } from '../../src/domain/types'

const file: FavoriteNode = {
  id: 'script',
  kind: 'file',
  path: '/work/demo/run task.sh',
  name: 'Run task',
  parentId: null,
  tags: [],
  color: '#F2994A',
  sortOrder: 1,
  createdAt: 1,
  updatedAt: 1
}

const runner: FavoriteRunnerConfig = {
  mode: 'background',
  executable: '/bin/sh',
  args: ['{path}', '--cwd={dir}', '--name={name}'],
  cwdMode: 'target-directory'
}

describe('favorite launch domain', () => {
  it('migrates old state to ten platform-isolated empty file slots', () => {
    const state = normalizeAppState({ favorites: [file] })

    expect(state.favoriteSlots).toEqual(createFavoriteSlots())
    expect(state.favoriteSlots).toHaveLength(10)
    expect(state.favoriteSearchAffinities).toEqual([])
  })

  it('invalidates trust when platform, target path, target name, or runner fields change', () => {
    const trusted = trustFavoriteRunner(file, 'darwin', runner, 100)

    expect(isFavoriteRunnerTrusted(file, 'darwin', trusted)).toBe(true)
    expect(isFavoriteRunnerTrusted(file, 'linux', trusted)).toBe(false)
    expect(isFavoriteRunnerTrusted({ ...file, path: '/work/other.sh' }, 'darwin', trusted)).toBe(false)
    // This fixture expands `{name}` into argv, so the name is still part of what was trusted.
    expect(isFavoriteRunnerTrusted({ ...file, name: 'Other' }, 'darwin', trusted)).toBe(false)
    expect(isFavoriteRunnerTrusted(file, 'darwin', { ...trusted, args: ['{path}', '--changed'] })).toBe(false)
  })

  it('keeps trust across a rename when no runner field expands the favorite name', () => {
    const plain: FavoriteRunnerConfig = { mode: 'background', executable: '/bin/sh', args: ['{path}'], cwdMode: 'target-directory' }
    const trusted = trustFavoriteRunner(file, 'darwin', plain, 100)

    expect(isFavoriteRunnerTrusted(file, 'darwin', trusted)).toBe(true)
    expect(isFavoriteRunnerTrusted({ ...file, name: 'Renamed' }, 'darwin', trusted)).toBe(true)
    // Everything else still revokes trust.
    expect(isFavoriteRunnerTrusted({ ...file, path: '/work/other.sh' }, 'darwin', trusted)).toBe(false)
    expect(isFavoriteRunnerTrusted(file, 'linux', trusted)).toBe(false)
    expect(isFavoriteRunnerTrusted(file, 'darwin', { ...trusted, executable: '/bin/zsh' })).toBe(false)

    const customCwd: FavoriteRunnerConfig = { ...plain, cwdMode: 'custom', cwd: '/logs/{name}' }
    const trustedCustomCwd = trustFavoriteRunner(file, 'darwin', customCwd, 100)
    expect(isFavoriteRunnerTrusted({ ...file, name: 'Renamed' }, 'darwin', trustedCustomCwd)).toBe(false)
  })

  it('upgrades a legacy name-bound fingerprint in place instead of dropping stored trust', () => {
    const plain: FavoriteRunnerConfig = { mode: 'background', executable: '/bin/sh', args: ['{path}'], cwdMode: 'target-directory' }
    const legacyFingerprint = legacyFavoriteRunnerFingerprint(file, 'darwin', plain)
    const stored = { ...plain, trustedAt: 100, trustedFingerprint: legacyFingerprint }

    const state = normalizeAppState({ favorites: [{ ...file, runnerByPlatform: { darwin: stored } }] })
    const upgraded = state.favorites[0].runnerByPlatform?.darwin

    expect(upgraded?.trustedAt).toBe(100)
    expect(upgraded?.trustedFingerprint).toBe(favoriteRunnerFingerprint(file, 'darwin', plain))
    expect(upgraded?.trustedFingerprint).not.toBe(legacyFingerprint)
    expect(isFavoriteRunnerTrusted({ ...file, name: 'Renamed' }, 'darwin', upgraded)).toBe(true)
  })

  it('never upgrades a fingerprint that no longer matches the stored target', () => {
    const plain: FavoriteRunnerConfig = { mode: 'background', executable: '/bin/sh', args: ['{path}'], cwdMode: 'target-directory' }
    const stored = { ...plain, trustedAt: 100, trustedFingerprint: 'fnv1a64:deadbeefdeadbeef' }

    const state = normalizeAppState({ favorites: [{ ...file, runnerByPlatform: { darwin: stored } }] })
    const kept = state.favorites[0].runnerByPlatform?.darwin

    expect(kept?.trustedFingerprint).toBe('fnv1a64:deadbeefdeadbeef')
    expect(isFavoriteRunnerTrusted(file, 'darwin', kept)).toBe(false)
  })

  it('resolves only structured placeholders without parsing a raw command line', () => {
    expect(resolveFavoriteRunner(file, runner)).toEqual({
      executable: '/bin/sh',
      args: ['/work/demo/run task.sh', '--cwd=/work/demo', '--name=Run task'],
      cwd: '/work/demo',
      mode: 'background'
    })
    expect(resolveFavoriteRunner(file, { ...runner, executable: '' })).toBeNull()
    expect(resolveFavoriteRunner(file, { ...runner, args: ['bad\0arg'] })).toBeNull()
    expect(resolveFavoriteRunner(file, { ...runner, executable: './run.sh' }, 'linux')).toBeNull()
    expect(resolveFavoriteRunner(file, { ...runner, cwdMode: 'custom', cwd: 'relative/work' }, 'linux')).toBeNull()
    expect(resolveFavoriteRunner({ ...file, path: 'C:\\run.cmd' }, { ...runner, executable: 'C:\\run.cmd' }, 'win32')).toBeNull()
    expect(resolveFavoriteRunner({ ...file, path: 'C:\\run.cmd' }, { ...runner, executable: 'cmd.exe' }, 'win32')).toMatchObject({ cwd: 'C:\\' })
    expect(resolveFavoriteRunner({ ...file, kind: 'folder', path: 'C:\\' }, { ...runner, executable: 'cmd.exe' }, 'win32')).toMatchObject({ cwd: 'C:\\' })
    expect(resolveFavoriteRunner({ ...file, path: '/work/{name}/run.sh', name: '{dir}' }, runner, 'linux')).toMatchObject({
      args: ['/work/{name}/run.sh', '--cwd=/work/{name}', '--name={dir}']
    })
  })

  it('preserves malformed runner metadata for repair while keeping it non-executable', () => {
    const normalized = normalizeFavoriteRunnerByPlatform({
      darwin: { mode: 'unknown', executable: '', args: ['{path}'], cwdMode: 'custom', cwd: '' }
    })

    expect(normalized?.darwin).toMatchObject({ executable: '', args: ['{path}'], cwdMode: 'custom', cwd: '' })
    expect(resolveFavoriteRunner(file, normalized!.darwin!)).toBeNull()
    expect(isFavoriteRunnerTrusted(file, 'darwin', normalized?.darwin)).toBe(false)
    expect(resolveFavoriteRunner(file, { ...runner, args: ['safe', 42] } as unknown as FavoriteRunnerConfig)).toBeNull()
    expect(resolveFavoriteRunner(file, { ...runner, args: Array.from({ length: 65 }, () => 'arg') })).toBeNull()
  })

  it('suggests explicit script interpreters without granting trust or bypassing policy', () => {
    expect(suggestedFavoriteRunner('C:\\work\\run.cmd', 'win32')).toEqual({
      mode: 'background',
      executable: 'cmd.exe',
      args: ['/d', '/s', '/c', 'call', '{path}'],
      cwdMode: 'target-directory'
    })
    const powershell = suggestedFavoriteRunner('C:\\work\\run.ps1', 'win32')
    expect(powershell).toMatchObject({ executable: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-File', '{path}'] })
    expect(powershell).not.toHaveProperty('trustedAt')
    expect(JSON.stringify(powershell)).not.toContain('Bypass')
  })

  it('uses a 30-day half-life for global and query-specific successful use', () => {
    expect(favoriteFrecency(8, 1_000, 1_000)).toBe(8)
    expect(favoriteFrecency(8, 1_000, 1_000 + FAVORITE_SEARCH_HALF_LIFE_MS)).toBeCloseTo(4)

    const once = recordFavoriteSearchAffinity([], '  Demo   Script ', file.id, 1_000)
    const twice = recordFavoriteSearchAffinity(once, 'demo script', file.id, 2_000)
    expect(twice).toEqual([{ query: 'demo script', favoriteId: file.id, usageCount: 2, lastUsedAt: 2_000 }])
  })

  it('bounds query learning to 50 LRU queries and 10 favorites per query', () => {
    const records: FavoriteSearchAffinity[] = []
    for (let queryIndex = 0; queryIndex <= FAVORITE_SEARCH_QUERY_LIMIT; queryIndex += 1) {
      for (let itemIndex = 0; itemIndex <= FAVORITE_SEARCH_ITEMS_PER_QUERY_LIMIT; itemIndex += 1) {
        records.push({
          query: `query-${queryIndex}`,
          favoriteId: `favorite-${itemIndex}`,
          usageCount: 1,
          lastUsedAt: queryIndex * 100 + itemIndex + 1
        })
      }
    }

    const pruned = pruneFavoriteSearchAffinities(records)
    expect(new Set(pruned.map((item) => item.query))).toHaveLength(FAVORITE_SEARCH_QUERY_LIMIT)
    expect(pruned.filter((item) => item.query === `query-${FAVORITE_SEARCH_QUERY_LIMIT}`)).toHaveLength(FAVORITE_SEARCH_ITEMS_PER_QUERY_LIMIT)
    expect(pruned.some((item) => item.query === 'query-0')).toBe(false)
  })

  it('keeps text match tiers first, then query affinity, global frecency, and manual order', () => {
    const now = 10_000
    const favorites: FavoriteNode[] = [
      { ...file, id: 'manual-first', name: 'Demo alpha', sortOrder: 1, usageCount: 1, lastUsedAt: now },
      { ...file, id: 'global', name: 'Demo beta', sortOrder: 2, usageCount: 8, lastUsedAt: now },
      { ...file, id: 'query', name: 'Demo gamma', sortOrder: 3, usageCount: 2, lastUsedAt: now },
      { ...file, id: 'exact', name: 'demo', sortOrder: 4, usageCount: 1, lastUsedAt: 1 }
    ]
    const affinities = [{ query: 'demo', favoriteId: 'query', usageCount: 20, lastUsedAt: now }]

    expect(filterFavoriteItems(favorites, { keyword: 'demo', groupId: null, affinities, now }).map((item) => item.id)).toEqual([
      'exact',
      'query',
      'global',
      'manual-first'
    ])
    expect(filterFavoriteItems(favorites, { keyword: '', groupId: null, affinities, now }).map((item) => item.id)[0]).toBe('global')

    const prefixPeers: FavoriteNode[] = [
      { ...file, id: 'name-prefix', name: 'Demo by name', path: '/work/name', sortOrder: 1 },
      { ...file, id: 'path-prefix', name: 'Other', path: 'demo/by-path', sortOrder: 2 }
    ]
    expect(filterFavoriteItems(prefixPeers, {
      keyword: 'demo',
      groupId: null,
      affinities: [{ query: 'demo', favoriteId: 'path-prefix', usageCount: 2, lastUsedAt: now }],
      now
    }).map((item) => item.id)).toEqual(['path-prefix', 'name-prefix'])
  })
})
