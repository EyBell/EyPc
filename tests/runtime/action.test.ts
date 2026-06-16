import { describe, expect, it } from 'vitest'
import { createActionRuntime } from '../../src/runtime/action/actionRuntime'
import { createInitialState } from '../../src/domain/state'
import { createAppRuntime } from '../../src/runtime/appRuntime'

describe('action runtime', () => {
  it('dispatches runnable action and captures write snapshots', () => {
    const snapshots: string[] = []
    const runtime = createActionRuntime({ captureSnapshot: () => 'before', commitSnapshot: (value) => snapshots.push(String(value)) })
    let called = false
    runtime.register({
      id: 'ports.kill.force',
      title: '强杀进程',
      group: '端口',
      risk: 'destructive',
      scope: 'tab',
      priority: 100,
      when: (context) => context.tab === 'ports',
      run: () => {
        called = true
        return true
      }
    })

    expect(runtime.dispatch({ actionId: 'ports.kill.force', context: { tab: 'ports', selectedIds: ['p:1:3000'], layerIds: [] } })).toMatchObject({
      handled: true,
      actionId: 'ports.kill.force'
    })
    expect(called).toBe(true)
    expect(snapshots).toEqual(['before'])
  })
})

describe('app runtime', () => {
  it('records favorite search history and reorders favorites through runtime', () => {
    const state = createInitialState(100)
    state.favorites = [
      { id: 'g1', kind: 'group', path: '', name: 'Group', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'f1', kind: 'folder', path: '/a', name: 'A', parentId: 'g1', tags: ['docs'], color: '#2F80ED', sortOrder: 1, createdAt: 2, updatedAt: 2 },
      { id: 'f2', kind: 'folder', path: '/b', name: 'B', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 3, updatedAt: 3 }
    ]
    const runtime = createAppRuntime(state)

    runtime.setFavoriteSearch('docs')
    runtime.setFavoriteSearch('code')
    runtime.setFavoriteSearch('docs')
    runtime.reorderFavorite('f2', 'g1', 'f1')

    const snapshot = runtime.snapshot()
    expect(snapshot.state.favoriteSearchHistory).toEqual(['docs', 'code'])
    expect(snapshot.state.favorites.find((item) => item.id === 'f2')?.parentId).toBe('g1')
    expect(snapshot.favoriteRows.map((item) => item.node.id)).toEqual(['g1', 'f1'])
  })
})
