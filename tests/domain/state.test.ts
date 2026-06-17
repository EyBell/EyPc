import { describe, expect, it } from 'vitest'
import { createInitialState, normalizeAppState } from '../../src/domain/state'

describe('state domain', () => {
  it('creates normalized initial state without built-in port groups', () => {
    const state = createInitialState(100)

    expect(state.version).toBe(1)
    expect(state.activeTab).toBe('ports')
    expect(state.portGroups).toEqual([])
    expect(state.settings.keybindingOverrides).toEqual([])
    expect(state.settings.shortcutProfiles.ports.keybindingOverrides).toEqual([])
  })

  it('drops legacy built-in port groups while preserving user groups', () => {
    const state = normalizeAppState({
      portGroups: [
        { id: 'default:web-dev', name: 'Web 开发', color: '#00A676', entries: ['3000'] },
        { id: 'user:web', name: 'My Web', color: '#2F80ED', entries: ['3000', '/node/i'] }
      ]
    })

    expect(state.portGroups).toEqual([
      { id: 'user:web', name: 'My Web', color: '#2F80ED', entries: ['3000', '/node/i'] }
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
    expect(state.favorites[0]).toMatchObject({ id: 'x', kind: 'file', name: 'a', parentId: null, tags: ['a'] })
    expect(state.settings.keybindingOverrides[0]).toMatchObject({ commandId: 'ports.scan', shortcutId: 'Ctrl+R' })
    expect(state.settings.shortcutProfiles.ports.keybindingOverrides[0]).toMatchObject({ commandId: 'ports.scan', shortcutId: 'Ctrl+R' })
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
})
