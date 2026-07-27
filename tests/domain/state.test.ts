import { describe, expect, it } from 'vitest'
import { createInitialState, normalizeAppState } from '../../src/domain/state'

describe('state domain', () => {
  it('creates normalized initial state without built-in port groups', () => {
    const state = createInitialState(100)

    expect(state.version).toBe(1)
    expect(state.activeTab).toBe('ports')
    expect(state.portGroups).toEqual([])
    expect(state.portGroupFolders).toEqual([])
    expect(state.collapsedPortGroupFolderIds).toEqual([])
    expect(state.settings.keybindingOverrides).toEqual([])
    expect(state.settings.shortcutProfiles.ports.keybindingOverrides).toEqual([])
    expect(state.settings.toolPreviewPrefs).toEqual({
      hoverPreviewEnabled: false,
      hoverPreviewDelayMs: 500
    })
    expect(state.settings.featureConfigs).toEqual([
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'favorites', enabled: false, sortOrder: 2 },
      { id: 'mqtt', enabled: true, sortOrder: 3 },
      { id: 'windows', enabled: false, sortOrder: 4 },
      { id: 'codex', enabled: true, sortOrder: 5 },
      { id: 'settings', enabled: true, sortOrder: 6 }
    ])
    expect(state.settings.shortcutProfiles.mqtt.keybindingOverrides).toEqual([])
    expect(state.mqtt.configs).toEqual([])
  })

  it('normalizes feature visibility configs and keeps settings enabled', () => {
    const state = normalizeAppState({
      activeTab: 'favorites',
      settings: {
        featureConfigs: [
          { id: 'settings', enabled: false, sortOrder: 1 },
          { id: 'unknown', enabled: true, sortOrder: 2 },
          { id: 'ports', enabled: false, sortOrder: 1 }
        ]
      }
    })

    expect(state.activeTab).toBe('settings')
    expect(state.settings.featureConfigs).toEqual([
      { id: 'settings', enabled: true, sortOrder: 1 },
      { id: 'ports', enabled: false, sortOrder: 2 },
      { id: 'mqtt', enabled: true, sortOrder: 3 },
      { id: 'favorites', enabled: false, sortOrder: 4 },
      { id: 'windows', enabled: false, sortOrder: 5 },
      { id: 'codex', enabled: true, sortOrder: 6 }
    ])
  })

  it('normalizes shared tool preview preferences with legacy MQTT hover migration', () => {
    expect(normalizeAppState({
      settings: {
        toolPreviewPrefs: {
          hoverPreviewEnabled: true,
          hoverPreviewDelayMs: 1200
        }
      }
    }).settings.toolPreviewPrefs).toEqual({
      hoverPreviewEnabled: true,
      hoverPreviewDelayMs: 1200
    })

    expect(normalizeAppState({
      settings: {
        toolPreviewPrefs: {
          hoverPreviewEnabled: true,
          hoverPreviewDelayMs: -1
        }
      }
    }).settings.toolPreviewPrefs).toEqual({
      hoverPreviewEnabled: true,
      hoverPreviewDelayMs: 500
    })

    expect(normalizeAppState({
      mqtt: {
        layoutPrefs: {
          hoverPreviewEnabled: true,
          hoverPreviewDelayMs: 900
        }
      }
    }).settings.toolPreviewPrefs).toEqual({
      hoverPreviewEnabled: true,
      hoverPreviewDelayMs: 900
    })
  })

  it('drops legacy built-in port groups while preserving user groups', () => {
    const state = normalizeAppState({
      portGroups: [
        { id: 'default:web-dev', name: 'Web 开发', color: '#00A676', entries: ['3000'] },
        { id: 'user:web', name: 'My Web', color: '#2F80ED', entries: ['3000', '/node/i'] }
      ]
    })

    expect(state.portGroups).toEqual([
      { id: 'user:web', name: 'My Web', color: '#2F80ED', entries: ['3000', '/node/i'], folderId: null, sortOrder: 1 }
    ])
  })

  it('normalizes port group folders and clears invalid group folder references', () => {
    const state = normalizeAppState({
      portGroupFolders: [
        { id: 'dev', name: 'Dev', color: '#00A676', sortOrder: 2 },
        { id: '', name: 'Bad', color: '#D64545', sortOrder: 1 }
      ],
      collapsedPortGroupFolderIds: ['dev', 'missing', 'dev'],
      portGroups: [
        { id: 'web', name: 'Web', color: '#00A676', entries: ['3000'], folderId: 'dev', sortOrder: 9 },
        { id: 'api', name: 'Api', color: '#2F80ED', entries: ['9000'], folderId: 'missing' },
        { id: 'root', name: 'Root', color: '#D64545', entries: ['7000'] }
      ]
    }, 100)

    expect(state.portGroupFolders).toEqual([
      { id: 'dev', name: 'Dev', color: '#00A676', sortOrder: 2 }
    ])
    expect(state.collapsedPortGroupFolderIds).toEqual(['dev'])
    expect(state.portGroups).toEqual([
      { id: 'web', name: 'Web', color: '#00A676', entries: ['3000'], folderId: 'dev', sortOrder: 9 },
      { id: 'api', name: 'Api', color: '#2F80ED', entries: ['9000'], folderId: null, sortOrder: 2 },
      { id: 'root', name: 'Root', color: '#D64545', entries: ['7000'], folderId: null, sortOrder: 3 }
    ])
  })

  it('normalizes unknown persisted data safely', () => {
    const state = normalizeAppState({
      activeTab: 'unknown',
      portSearchHistory: ['  node ', '', 'node'],
      favorites: [{ id: 'x', kind: 'file', path: '/tmp/a', name: '', tags: ['a', 1], color: '', sortOrder: -1 }],
      settings: { keybindingOverrides: [{ commandId: 'ports.scan', shortcutId: 'Ctrl+R', disabled: false }] }
    })

    expect(state.activeTab).toBe('ports')
    expect(state.portSearchHistory).toEqual(['node'])
    expect(state.searchHistories.ports.processes).toEqual(['node'])
    expect(state.searchHistories.ports.groups).toEqual([])
    expect(state.searchHistories.favorites.files).toEqual([])
    expect(state.favorites[0]).toMatchObject({ id: 'x', kind: 'file', name: 'a', parentId: null, tags: ['a'] })
    expect(state.settings.keybindingOverrides[0]).toMatchObject({ commandId: 'ports.scan', shortcutId: 'Ctrl+R' })
    expect(state.settings.shortcutProfiles.ports.keybindingOverrides[0]).toMatchObject({ commandId: 'ports.scan', shortcutId: 'Ctrl+R' })
  })

  it('recovers malformed favorite graphs without changing the app state version', () => {
    const state = normalizeAppState({
      favorites: [
        { id: 'same', kind: 'group', name: 'First', parentId: 'same' },
        { id: 'same', kind: 'file', path: '/tmp/second', name: 'Second', parentId: 'missing' },
        { id: 'a', kind: 'group', name: 'A', parentId: 'b' },
        { id: 'b', kind: 'folder', path: '/tmp/b', name: 'B', parentId: 'a' }
      ]
    }, 10)

    expect(state.version).toBe(1)
    expect(state.favorites.map((item) => item.id)).toEqual(['same', 'same~2', 'a', 'b'])
    expect(state.favorites.every((item) => item.parentId === null)).toBe(true)
  })

  it('keeps collapsed favorite container ids only for existing favorite nodes', () => {
    const state = normalizeAppState({
      favorites: [
        { id: 'g1', kind: 'group', path: '', name: 'Group', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
        { id: 'f1', kind: 'folder', path: '/tmp/demo', name: 'Demo', parentId: 'g1', tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 2, updatedAt: 2 }
      ],
      collapsedFavoriteGroupIds: ['g1', 'f1', 'missing']
    }, 10)

    expect(state.collapsedFavoriteGroupIds).toEqual(['g1', 'f1'])
  })

  it('normalizes structured search histories by partition and preserves legacy compatibility fields', () => {
    const state = normalizeAppState({
      searchHistories: {
        ports: {
          processes: ['  node ', 'vite', 'node'],
          groups: ['  dev ', '', 'ops']
        },
        favorites: {
          files: [' docs ', 'docs', 'repo']
        }
      }
    }, 100)

    expect(state.searchHistories).toEqual({
      ports: {
        processes: ['node', 'vite'],
        groups: ['dev', 'ops']
      },
      favorites: {
        files: ['docs', 'repo']
      }
    })
    expect(state.portSearchHistory).toEqual(['node', 'vite'])
    expect(state.favoriteSearchHistory).toEqual(['docs', 'repo'])
  })

  it('normalizes command-level shortcut override shape while preserving legacy shortcutId', () => {
    const state = normalizeAppState({
      settings: {
        keybindingOverrides: [
          { commandId: 'ports.scan', shortcutIds: ['ctrl+r', 'Alt+R'], enabled: true, when: "tab == 'ports'" },
          { commandId: 'search.focus', shortcutId: 'Ctrl+F', disabled: true }
        ]
      }
    })

    expect(state.settings.keybindingOverrides.find((item) => item.commandId === 'ports.scan')).toMatchObject({
      commandId: 'ports.scan',
      shortcutId: 'Ctrl+R',
      shortcutIds: ['Ctrl+R', 'Alt+R'],
      enabled: true,
      when: "tab == 'ports'"
    })
    expect(state.settings.keybindingOverrides.find((item) => item.commandId === 'search.focus')).toMatchObject({
      commandId: 'search.focus',
      shortcutId: 'Ctrl+F',
      shortcutIds: ['Ctrl+F'],
      enabled: false,
      disabled: true
    })
    expect(state.settings.shortcutProfiles.ports.keybindingOverrides[0]).toMatchObject({ commandId: 'ports.scan' })
    expect(state.settings.shortcutProfiles.global.keybindingOverrides[0]).toMatchObject({ commandId: 'search.focus' })
  })

  it('normalizes shortcut profile maps and keeps a legacy aggregate', () => {
    const state = normalizeAppState({
      settings: {
        shortcutProfiles: {
          global: { keybindingOverrides: [{ commandId: 'search.focus', shortcutIds: ['Ctrl+P'] }], updatedAt: 10 },
          ports: { keybindingOverrides: [{ commandId: 'ports.scan', shortcutIds: ['Alt+R'] }], updatedAt: 11 },
          favorites: { keybindingOverrides: [{ commandId: 'favorites.open', shortcutIds: ['Ctrl+O'] }], updatedAt: 12 }
        }
      }
    })

    expect(state.settings.shortcutProfiles.global).toMatchObject({ updatedAt: 10 })
    expect(state.settings.shortcutProfiles.ports.keybindingOverrides[0]).toMatchObject({ commandId: 'ports.scan', shortcutIds: ['Alt+R'] })
    expect(state.settings.shortcutProfiles.favorites.keybindingOverrides[0]).toMatchObject({ commandId: 'favorites.open', shortcutIds: ['Ctrl+O'] })
    expect(state.settings.keybindingOverrides.map((item) => item.commandId)).toEqual(['search.focus', 'ports.scan', 'favorites.open'])
  })

  it('persists only valid window targets and keeps slot mappings separate by platform', () => {
    const state = normalizeAppState({
      windowTargets: [
        { id: 'mac-browser', alias: '工作浏览器', platform: 'darwin', appId: 'com.google.Chrome', appName: 'Google Chrome', titleLocator: '项目面板', lastNativeRef: '901:1:12', favorite: true, pinned: true, createdAt: 10, updatedAt: 11 },
        { id: 'win-browser', alias: '', platform: 'win32', appId: 'chrome.exe', appName: 'Google Chrome', titleLocator: '项目面板', lastNativeRef: '123456', favorite: false, createdAt: 12, updatedAt: 13 },
        { id: 'invalid', platform: 'win32', appId: 'chrome.exe', titleLocator: '' },
        { id: 'mac-browser', platform: 'darwin', appId: 'duplicate', titleLocator: 'duplicate' }
      ],
      windowSlots: [
        { slot: 1, targetIdByPlatform: { darwin: 'mac-browser', win32: 'win-browser' } },
        { slot: 2, targetIdByPlatform: { darwin: 'missing' } },
        { slot: 3, targetIdByPlatform: { darwin: 'win-browser' } },
        { slot: 11, targetIdByPlatform: { win32: 'win-browser' } }
      ]
    }, 100)

    expect(state.windowTargets).toEqual([
      expect.objectContaining({ id: 'mac-browser', alias: '工作浏览器', platform: 'darwin', favorite: true, pinned: true }),
      expect.objectContaining({ id: 'win-browser', alias: '项目面板', platform: 'win32', favorite: false, pinned: false })
    ])
    expect(state.windowSlots).toHaveLength(10)
    expect(state.windowSlots[0]).toEqual({ slot: 1, targetIdByPlatform: { darwin: 'mac-browser', win32: 'win-browser' } })
    expect(state.windowSlots[1]).toEqual({ slot: 2, targetIdByPlatform: {} })
    expect(state.windowSlots[2]).toEqual({ slot: 3, targetIdByPlatform: {} })
  })
})
