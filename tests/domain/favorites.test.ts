import { describe, expect, it } from 'vitest'
import {
  buildFavoriteTree,
  filterFavoriteTree,
  flattenFavoriteTree,
  reorderFavoriteNode
} from '../../src/domain/favorites'
import type { FavoriteNode } from '../../src/domain/types'

const nodes: FavoriteNode[] = [
  { id: 'g1', kind: 'group', path: '', name: 'Projects', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
  { id: 'f1', kind: 'folder', path: '/work/app', name: 'App Folder', parentId: 'g1', tags: ['code'], color: '#2F80ED', sortOrder: 1, createdAt: 2, updatedAt: 2 },
  { id: 'f2', kind: 'file', path: '/work/app/README.md', name: 'README', parentId: 'f1', tags: ['docs'], color: '#F2994A', sortOrder: 1, createdAt: 3, updatedAt: 3 },
  { id: 'f3', kind: 'file', path: '/tmp/log.txt', name: 'Log', parentId: null, tags: ['ops'], color: '#EB5757', sortOrder: 2, createdAt: 4, updatedAt: 4 }
]

describe('favorites domain', () => {
  it('builds and flattens tree preserving depth', () => {
    const tree = buildFavoriteTree(nodes)

    expect(tree).toHaveLength(2)
    expect(tree[0].node.id).toBe('g1')
    expect(tree[0].children[0].node.id).toBe('f1')
    expect(flattenFavoriteTree(tree).map((item) => [item.node.id, item.depth])).toEqual([
      ['g1', 0],
      ['f1', 1],
      ['f2', 2],
      ['f3', 0]
    ])
  })

  it('filters by search, tags, group, and keeps parent chain', () => {
    const bySearch = filterFavoriteTree(nodes, { keyword: 'readme', tags: [], groupId: null })
    expect(flattenFavoriteTree(bySearch).map((item) => item.node.id)).toEqual(['g1', 'f1', 'f2'])

    const byTag = filterFavoriteTree(nodes, { keyword: '', tags: ['ops'], groupId: null })
    expect(flattenFavoriteTree(byTag).map((item) => item.node.id)).toEqual(['f3'])

    const byGroup = filterFavoriteTree(nodes, { keyword: '', tags: [], groupId: 'g1' })
    expect(flattenFavoriteTree(byGroup).map((item) => item.node.id)).toEqual(['g1', 'f1', 'f2'])
  })

  it('reorders node under a target parent without mutating original list', () => {
    const reordered = reorderFavoriteNode(nodes, 'f3', 'g1', 'f1')

    expect(nodes.find((node) => node.id === 'f3')?.parentId).toBeNull()
    expect(reordered.find((node) => node.id === 'f3')?.parentId).toBe('g1')
    expect(reordered.filter((node) => node.parentId === 'g1').map((node) => node.id)).toEqual(['f3', 'f1'])
  })
})
