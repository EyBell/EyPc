import { describe, expect, it } from 'vitest'
import { createInitialState, normalizeAppState } from '../../src/domain/state'

describe('state domain', () => {
  it('creates normalized initial state without built-in port groups', () => {
    const state = createInitialState(100)

    expect(state.version).toBe(1)
    expect(state.activeTab).toBe('ports')
    expect(state.portGroups).toEqual([])
    expect(state.settings.keybindingOverrides).toEqual([])
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
  })
})
