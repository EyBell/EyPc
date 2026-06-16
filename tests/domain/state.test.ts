import { describe, expect, it } from 'vitest'
import { createInitialState, normalizeAppState } from '../../src/domain/state'

describe('state domain', () => {
  it('creates normalized initial state with default groups and commands', () => {
    const state = createInitialState(100)

    expect(state.version).toBe(1)
    expect(state.activeTab).toBe('ports')
    expect(state.portGroups[0]).toMatchObject({ id: 'default:web-dev', entries: ['3000', '5173-5175', '8000-8099'] })
    expect(state.settings.keybindingOverrides).toEqual([])
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
