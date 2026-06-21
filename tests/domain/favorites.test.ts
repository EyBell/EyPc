import { describe, expect, it } from 'vitest'
import {
  buildFavoriteTree,
  deleteFavoriteMetadata,
  filterFavoriteTree,
  filterFavoriteItems,
  filterFavoriteGroupTree,
  filterFavoriteContainerTree,
  favoriteTreeMoveTarget,
  favoriteVirtualChildren,
  flattenFavoriteTree,
  isValidFavoriteParent,
  addFavoriteNode,
  inferFavoriteNameFromPath,
  normalizeFavoritePath,
  moveFavoriteNode,
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

  it('resolves tree drop targets for moving inside, above, and below a node', () => {
    const data: FavoriteNode[] = [
      { id: 'a', kind: 'folder', path: '/a', name: 'A', parentId: null, tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'b', kind: 'folder', path: '/b', name: 'B', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 2, updatedAt: 2 },
      { id: 'c', kind: 'file', path: '/c.md', name: 'C', parentId: null, tags: [], color: '#F2994A', sortOrder: 3, createdAt: 3, updatedAt: 3 },
      { id: 'b-child', kind: 'file', path: '/b/child.md', name: 'B Child', parentId: 'b', tags: [], color: '#F2994A', sortOrder: 1, createdAt: 4, updatedAt: 4 }
    ]

    expect(favoriteTreeMoveTarget(data, 'c', 'b', 'inside')).toEqual({ parentId: 'b', beforeNodeId: null })
    expect(moveFavoriteNode(data, 'c', 'b', null).filter((node) => node.parentId === 'b').map((node) => node.id)).toEqual(['b-child', 'c'])

    expect(favoriteTreeMoveTarget(data, 'c', 'b', 'before')).toEqual({ parentId: null, beforeNodeId: 'b' })
    expect(moveFavoriteNode(data, 'c', null, 'b').filter((node) => node.parentId === null).map((node) => node.id)).toEqual(['a', 'c', 'b'])

    expect(favoriteTreeMoveTarget(data, 'a', 'b', 'after')).toEqual({ parentId: null, beforeNodeId: 'c' })
    expect(moveFavoriteNode(data, 'a', null, 'c').filter((node) => node.parentId === null).map((node) => node.id)).toEqual(['b', 'a', 'c'])

    expect(favoriteTreeMoveTarget(data, 'b', 'b-child', 'inside')).toBeNull()
    expect(favoriteTreeMoveTarget(data, 'b', 'b', 'before')).toBeNull()
  })

  it('projects virtual group tree separately from file and folder targets', () => {
    const data: FavoriteNode[] = [
      ...nodes,
      { id: 'g2', kind: 'group', path: '', name: 'Docs', parentId: 'g1', tags: [], color: '#6B7280', sortOrder: 2, createdAt: 5, updatedAt: 5 }
    ]

    expect(flattenFavoriteTree(filterFavoriteGroupTree(data, '')).map((item) => [item.node.id, item.depth])).toEqual([
      ['g1', 0],
      ['g2', 1]
    ])
    expect(filterFavoriteItems(data, { keyword: '', groupId: 'g1' }).map((item) => item.id)).toEqual(['f1', 'f2'])
  })

  it('sorts favorite search by match strength and usage recency', () => {
    const data: FavoriteNode[] = [
      { id: 'old', kind: 'folder', path: '/work/app-old', name: 'App Old', parentId: null, tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 1, updatedAt: 1, usageCount: 20, lastUsedAt: 10 },
      { id: 'exact', kind: 'folder', path: '/work/app', name: 'app', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 2, updatedAt: 2, usageCount: 1, lastUsedAt: 20 },
      { id: 'recent', kind: 'file', path: '/work/docs/app-notes.md', name: 'App Notes', parentId: null, tags: [], color: '#F2994A', sortOrder: 3, createdAt: 3, updatedAt: 3, usageCount: 20, lastUsedAt: 30 }
    ]

    expect(filterFavoriteItems(data, { keyword: 'app', groupId: null }).map((item) => item.id)).toEqual(['exact', 'recent', 'old'])
  })

  it('prevents moving a group into itself or a descendant group', () => {
    const data: FavoriteNode[] = [
      { id: 'root', kind: 'group', path: '', name: 'Root', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'child', kind: 'group', path: '', name: 'Child', parentId: 'root', tags: [], color: '#00A676', sortOrder: 1, createdAt: 2, updatedAt: 2 },
      { id: 'leaf', kind: 'file', path: '/tmp/a.txt', name: 'A', parentId: 'child', tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 3, updatedAt: 3 }
    ]

    expect(isValidFavoriteParent(data, 'root', 'root')).toBe(false)
    expect(isValidFavoriteParent(data, 'root', 'child')).toBe(false)
    expect(isValidFavoriteParent(data, 'leaf', 'child')).toBe(true)
    expect(moveFavoriteNode(data, 'root', 'child', null)).toEqual(data)
  })

  it('lets files and folders act as virtual parents while blocking descendant cycles', () => {
    const data: FavoriteNode[] = [
      { id: 'file-parent', kind: 'file', path: '/tmp/parent.md', name: 'Parent File', parentId: null, tags: [], color: '#F2994A', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'folder-child', kind: 'folder', path: '/tmp/child-folder', name: 'Child Folder', parentId: 'file-parent', tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 2, updatedAt: 2 },
      { id: 'file-leaf', kind: 'file', path: '/tmp/leaf.md', name: 'Leaf', parentId: 'folder-child', tags: [], color: '#F2994A', sortOrder: 1, createdAt: 3, updatedAt: 3 }
    ]

    expect(flattenFavoriteTree(filterFavoriteContainerTree(data, '')).map((row) => [row.node.id, row.depth])).toEqual([
      ['file-parent', 0],
      ['folder-child', 1],
      ['file-leaf', 2]
    ])
    expect(favoriteVirtualChildren(data, 'file-parent').map((item) => item.id)).toEqual(['folder-child'])
    expect(isValidFavoriteParent(data, 'file-parent', 'file-leaf')).toBe(false)
    expect(isValidFavoriteParent(data, 'file-leaf', 'file-parent')).toBe(true)
    expect(moveFavoriteNode(data, 'file-parent', 'file-leaf', null)).toEqual(data)
  })

  it('deletes only plugin metadata and cascades virtual group descendants', () => {
    const data: FavoriteNode[] = [
      { id: 'root', kind: 'group', path: '', name: 'Root', parentId: null, tags: [], color: '#00A676', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      { id: 'child', kind: 'group', path: '', name: 'Child', parentId: 'root', tags: [], color: '#00A676', sortOrder: 1, createdAt: 2, updatedAt: 2 },
      { id: 'leaf', kind: 'file', path: '/tmp/a.txt', name: 'A', parentId: 'child', tags: [], color: '#2F80ED', sortOrder: 1, createdAt: 3, updatedAt: 3 },
      { id: 'sibling', kind: 'folder', path: '/tmp/b', name: 'B', parentId: null, tags: [], color: '#2F80ED', sortOrder: 2, createdAt: 4, updatedAt: 4 }
    ]

    expect(deleteFavoriteMetadata(data, ['root']).map((item) => item.id)).toEqual(['sibling'])
    expect(deleteFavoriteMetadata(data, ['leaf']).map((item) => item.id)).toEqual(['root', 'child', 'sibling'])
  })

  it('adds explicit favorite targets with inferred names and valid parent groups', () => {
    const result = addFavoriteNode(nodes, {
      id: 'new',
      kind: 'folder',
      path: '/work/new-app/',
      name: '',
      parentId: 'g1',
      tags: ['code'],
      color: '#2F80ED',
      now: 10
    })

    expect(result.duplicate).toBe(false)
    expect(result.node).toMatchObject({
      id: 'new',
      kind: 'folder',
      path: '/work/new-app',
      name: 'new-app',
      parentId: 'g1',
      tags: ['code'],
      color: '#2F80ED',
      sortOrder: nodes.length + 1,
      createdAt: 10,
      updatedAt: 10
    })
    expect(result.nodes.at(-1)).toEqual(result.node)
  })

  it('adds targets under any existing favorite parent', () => {
    const result = addFavoriteNode(nodes, {
      id: 'new',
      kind: 'file',
      path: '/work/new-app/notes.md',
      name: '',
      parentId: 'f1',
      tags: [],
      color: '#F2994A',
      now: 10
    })

    expect(result.node.parentId).toBe('f1')
    expect(result.node.name).toBe('notes.md')
  })

  it('focuses an existing target instead of adding duplicate kind and path', () => {
    const result = addFavoriteNode(nodes, {
      id: 'new',
      kind: 'folder',
      path: '/work/app/',
      name: 'Different name',
      parentId: null,
      tags: [],
      color: '#2F80ED',
      now: 10
    })

    expect(result.duplicate).toBe(true)
    expect(result.node.id).toBe('f1')
    expect(result.nodes).toHaveLength(nodes.length)
    expect(result.nodes.find((item) => item.id === 'f1')?.name).toBe('App Folder')
  })

  it('normalizes pasted paths without losing root paths', () => {
    expect(normalizeFavoritePath('  /tmp/demo/  ')).toBe('/tmp/demo')
    expect(normalizeFavoritePath('/')).toBe('/')
    expect(normalizeFavoritePath('C:\\work\\app\\')).toBe('C:\\work\\app')
    expect(inferFavoriteNameFromPath('/work/app/README.md')).toBe('README.md')
    expect(inferFavoriteNameFromPath('/')).toBe('未命名')
  })
})
