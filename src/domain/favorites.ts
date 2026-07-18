import type { FavoriteKind, FavoriteNode, FavoriteTreeNode } from './types'

export interface FavoriteFilter {
  keyword: string
  tags: string[]
  groupId: string | null
}

export interface FavoriteItemFilter {
  keyword: string
  groupId: string | null
}

export type FavoriteTargetKind = Exclude<FavoriteKind, 'group'>

export interface FavoriteAddInput {
  id: string
  kind: FavoriteTargetKind
  path: string
  name?: string
  parentId?: string | null
  tags?: string[]
  color?: string
  now: number
}

export interface FavoriteAddResult {
  nodes: FavoriteNode[]
  node: FavoriteNode
  duplicate: boolean
}

export type FavoriteTreeDropPosition = 'before' | 'inside' | 'after'

export interface FavoriteTreeMoveTarget {
  parentId: string | null
  beforeNodeId: string | null
}

function sortNodes(nodes: FavoriteNode[]): FavoriteNode[] {
  return [...nodes].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

function isFavoriteItem(node: FavoriteNode): boolean {
  return node.kind === 'file' || node.kind === 'folder'
}

export function normalizeFavoritePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  if (/^[\\/]+$/.test(trimmed)) return trimmed.startsWith('\\') ? '\\' : '/'
  if (/^[A-Za-z]:[\\/]$/.test(trimmed)) return trimmed
  const windowsLike = /^[A-Za-z]:[\\/]/.test(trimmed) || /^(?:\\\\|\/\/)/.test(trimmed)
  return windowsLike ? trimmed.replace(/[\\/]+$/, '') : trimmed.replace(/\/+$/, '')
}

export function favoritePathIdentityKey(path: string): string {
  const normalized = normalizeFavoritePath(path)
  if (!normalized) return ''
  const windowsLike = /^[A-Za-z]:[\\/]/.test(normalized) || /^(?:\\\\|\/\/)/.test(normalized)
  if (!windowsLike) return `posix:${normalized}`

  const slashes = normalized.replace(/\//g, '\\')
  const unc = /^\\\\/.test(slashes)
  const body = slashes.replace(/^\\+/, '').replace(/\\+/g, '\\')
  const canonical = unc ? `\\\\${body}` : slashes.replace(/\\+/g, '\\')
  return `windows:${canonical.toLowerCase()}`
}

export function normalizeFavoriteGraph(nodes: FavoriteNode[]): FavoriteNode[] {
  const reservedIds = new Set(nodes.map((node) => node.id))
  const usedIds = new Set<string>()
  const firstIdBySource = new Map<string, string>()
  const normalized = nodes.map((node) => {
    let id = node.id
    if (usedIds.has(id)) {
      let suffix = 2
      do {
        id = `${node.id}~${suffix}`
        suffix += 1
      } while (usedIds.has(id) || reservedIds.has(id))
    }
    usedIds.add(id)
    if (!firstIdBySource.has(node.id)) firstIdBySource.set(node.id, id)
    return { ...node, id, parentId: node.parentId === node.id ? null : node.parentId }
  })

  const validIds = new Set(normalized.map((node) => node.id))
  for (const node of normalized) {
    const parentId = node.parentId ? firstIdBySource.get(node.parentId) || node.parentId : null
    node.parentId = parentId && validIds.has(parentId) && parentId !== node.id ? parentId : null
  }

  const byId = new Map(normalized.map((node) => [node.id, node]))
  const finished = new Set<string>()
  const visit = (node: FavoriteNode, path: string[], indexes: Map<string, number>) => {
    if (finished.has(node.id)) return
    const cycleStart = indexes.get(node.id)
    if (cycleStart !== undefined) {
      for (const id of path.slice(cycleStart)) {
        const cycleNode = byId.get(id)
        if (cycleNode) cycleNode.parentId = null
      }
      return
    }
    indexes.set(node.id, path.length)
    path.push(node.id)
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) visit(parent, path, indexes)
    path.pop()
    indexes.delete(node.id)
    finished.add(node.id)
  }
  for (const node of normalized) visit(node, [], new Map())
  return normalized
}

export function inferFavoriteNameFromPath(path: string): string {
  const normalized = normalizeFavoritePath(path)
  const windowsLike = /^[A-Za-z]:[\\/]/.test(normalized) || /^(?:\\\\|\/\/)/.test(normalized)
  return normalized.split(windowsLike ? /[\\/]/ : /\//).filter(Boolean).pop() || '未命名'
}

function collectAllDescendantIds(nodes: FavoriteNode[], rootId: string): Set<string> {
  const result = new Set<string>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id)
        changed = true
      }
    }
  }
  return result
}

export function buildFavoriteTree(nodes: FavoriteNode[]): FavoriteTreeNode[] {
  const safeNodes = normalizeFavoriteGraph(nodes)
  const byId = new Map(safeNodes.map((node) => [node.id, node]))
  const byParent = new Map<string | null, FavoriteNode[]>()
  for (const node of safeNodes) {
    const parentId = node.parentId && byId.has(node.parentId) ? node.parentId : null
    byParent.set(parentId, [...(byParent.get(parentId) || []), node])
  }

  const visited = new Set<string>()
  const walk = (parentId: string | null, depth: number, ancestors: Set<string>): FavoriteTreeNode[] =>
    sortNodes(byParent.get(parentId) || []).flatMap((node) => {
      if (visited.has(node.id) || ancestors.has(node.id)) return []
      visited.add(node.id)
      const nextAncestors = new Set(ancestors).add(node.id)
      return [{ node, depth, children: walk(node.id, depth + 1, nextAncestors) }]
    })

  const tree = walk(null, 0, new Set())
  for (const node of sortNodes(safeNodes)) {
    if (visited.has(node.id)) continue
    visited.add(node.id)
    tree.push({ node: { ...node, parentId: null }, depth: 0, children: walk(node.id, 1, new Set([node.id])) })
  }
  return tree
}

export function filterFavoriteGroupTree(nodes: FavoriteNode[], keyword: string): FavoriteTreeNode[] {
  const groups = nodes.filter((node) => node.kind === 'group')
  const byId = new Map(groups.map((node) => [node.id, node]))
  const query = keyword.trim().toLowerCase()
  if (!query) return buildFavoriteTree(groups)
  const included = new Set<string>()
  for (const node of groups) {
    const text = [node.name, node.tags.join(' ')].join(' ').toLowerCase()
    if (!text.includes(query)) continue
    let cursor: FavoriteNode | undefined = node
    const visited = new Set<string>()
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id)
      included.add(cursor.id)
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
  }
  return buildFavoriteTree(groups.filter((node) => included.has(node.id)))
}

export function filterFavoriteContainerTree(nodes: FavoriteNode[], keyword: string): FavoriteTreeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const query = keyword.trim().toLowerCase()
  if (!query) return buildFavoriteTree(nodes)
  const included = new Set<string>()
  for (const node of nodes) {
    const text = [node.name, node.path, node.tags.join(' '), node.kind].join(' ').toLowerCase()
    if (!text.includes(query)) continue
    let cursor: FavoriteNode | undefined = node
    const visited = new Set<string>()
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id)
      included.add(cursor.id)
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
  }
  return buildFavoriteTree(nodes.filter((node) => included.has(node.id)))
}

export function flattenFavoriteTree(tree: FavoriteTreeNode[], collapsedIds: string[] = []): FavoriteTreeNode[] {
  const collapsed = new Set(collapsedIds)
  return tree.flatMap((item) => [item, ...(collapsed.has(item.node.id) ? [] : flattenFavoriteTree(item.children, collapsedIds))])
}

export function favoriteVirtualChildren(nodes: FavoriteNode[], parentId: string | null): FavoriteNode[] {
  return sortNodes(nodes.filter((node) => (node.parentId ?? null) === (parentId ?? null)))
}

function nodeMatches(node: FavoriteNode, filter: FavoriteFilter): boolean {
  const keyword = filter.keyword.trim().toLowerCase()
  const text = [node.name, node.path, node.tags.join(' ')].join(' ').toLowerCase()
  const keywordOk = !keyword || text.includes(keyword)
  const tagsOk = filter.tags.length === 0 || filter.tags.every((tag) => node.tags.includes(tag))
  return keywordOk && tagsOk
}

function collectDescendantIds(nodes: FavoriteNode[], rootId: string): Set<string> {
  const result = new Set<string>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id)
        changed = true
      }
    }
  }
  return result
}

function itemMatchScore(node: FavoriteNode, keyword: string): number {
  if (!keyword) return 0
  const name = node.name.toLowerCase()
  const path = node.path.toLowerCase()
  const tags = node.tags.map((tag) => tag.toLowerCase())
  if (name === keyword || path === keyword || tags.includes(keyword)) return 100
  if (name.startsWith(keyword) || path.split(/[\\/]/).pop()?.toLowerCase().startsWith(keyword)) return 80
  if (path.startsWith(keyword)) return 70
  if (name.includes(keyword)) return 60
  if (path.includes(keyword) || tags.some((tag) => tag.includes(keyword))) return 40
  return -1
}

export function filterFavoriteItems(nodes: FavoriteNode[], filter: FavoriteItemFilter): FavoriteNode[] {
  const keyword = filter.keyword.trim().toLowerCase()
  const groupScope = filter.groupId ? collectAllDescendantIds(nodes, filter.groupId) : null
  return nodes
    .filter((node) => isFavoriteItem(node))
    .map((node) => ({ node, score: itemMatchScore(node, keyword) }))
    .filter(({ node, score }) => {
      if (groupScope && (!node.parentId || !groupScope.has(node.parentId))) return false
      return !keyword || score >= 0
    })
    .sort((a, b) => {
      const scoreCompare = b.score - a.score
      if (scoreCompare !== 0) return scoreCompare
      const usageCompare = (b.node.usageCount || 0) - (a.node.usageCount || 0)
      if (usageCompare !== 0) return usageCompare
      const lastUsedCompare = (b.node.lastUsedAt || 0) - (a.node.lastUsedAt || 0)
      if (lastUsedCompare !== 0) return lastUsedCompare
      return a.node.sortOrder - b.node.sortOrder || a.node.createdAt - b.node.createdAt || a.node.id.localeCompare(b.node.id)
    })
    .map(({ node }) => node)
}

export function filterFavoriteTree(nodes: FavoriteNode[], filter: FavoriteFilter): FavoriteTreeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const groupScope = filter.groupId ? collectDescendantIds(nodes, filter.groupId) : null
  const included = new Set<string>()

  for (const node of nodes) {
    if (groupScope && !groupScope.has(node.id)) continue
    const isRootGroup = filter.groupId && node.id === filter.groupId && !filter.keyword && filter.tags.length === 0
    if (!isRootGroup && !nodeMatches(node, filter)) continue
    let cursor: FavoriteNode | undefined = node
    const visited = new Set<string>()
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id)
      included.add(cursor.id)
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
  }

  if (filter.groupId && !included.size) {
    const root = byId.get(filter.groupId)
    if (root) included.add(root.id)
  }

  return buildFavoriteTree(nodes.filter((node) => included.has(node.id)))
}

export function reorderFavoriteNode(nodes: FavoriteNode[], nodeId: string, parentId: string | null, beforeNodeId: string | null): FavoriteNode[] {
  const moving = nodes.find((node) => node.id === nodeId)
  if (!moving || moving.id === parentId) return nodes.map((node) => ({ ...node }))
  const siblings = nodes.filter((node) => node.id !== nodeId && (node.parentId ?? null) === (parentId ?? null))
  const insertIndex = beforeNodeId ? Math.max(0, siblings.findIndex((node) => node.id === beforeNodeId)) : siblings.length
  const ordered = [...siblings.slice(0, insertIndex), { ...moving, parentId }, ...siblings.slice(insertIndex)]
  const orderById = new Map(ordered.map((node, index) => [node.id, index + 1]))
  return nodes.map((node) => {
    if (node.id === nodeId) return { ...node, parentId, sortOrder: orderById.get(node.id) || 1 }
    if ((node.parentId ?? null) === (parentId ?? null) && orderById.has(node.id)) {
      return { ...node, sortOrder: orderById.get(node.id) || node.sortOrder }
    }
    return { ...node }
  }).sort((a, b) => {
    const parentCompare = String(a.parentId || '').localeCompare(String(b.parentId || ''))
    if (parentCompare !== 0) return parentCompare
    return a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  })
}

export function isValidFavoriteParent(nodes: FavoriteNode[], nodeId: string, parentId: string | null): boolean {
  if (!parentId) return true
  const parent = nodes.find((node) => node.id === parentId)
  if (!parent) return false
  if (nodeId === parentId) return false
  if (!nodeId) return true
  return !collectAllDescendantIds(nodes, nodeId).has(parentId)
}

export function moveFavoriteNode(nodes: FavoriteNode[], nodeId: string, parentId: string | null, beforeNodeId: string | null): FavoriteNode[] {
  if (!isValidFavoriteParent(nodes, nodeId, parentId)) return nodes.map((node) => ({ ...node }))
  return reorderFavoriteNode(nodes, nodeId, parentId, beforeNodeId)
}

export function favoriteTreeMoveTarget(nodes: FavoriteNode[], nodeId: string, targetId: string, position: FavoriteTreeDropPosition): FavoriteTreeMoveTarget | null {
  if (nodeId === targetId) return null
  const target = nodes.find((node) => node.id === targetId)
  if (!target) return null

  if (position === 'inside') {
    return isValidFavoriteParent(nodes, nodeId, target.id)
      ? { parentId: target.id, beforeNodeId: null }
      : null
  }

  const parentId = target.parentId ?? null
  if (!isValidFavoriteParent(nodes, nodeId, parentId)) return null
  if (position === 'before') return { parentId, beforeNodeId: target.id }

  const siblings = favoriteVirtualChildren(nodes, parentId).filter((node) => node.id !== nodeId)
  const targetIndex = siblings.findIndex((node) => node.id === target.id)
  if (targetIndex < 0) return null
  return {
    parentId,
    beforeNodeId: siblings[targetIndex + 1]?.id || null
  }
}

export function addFavoriteNode(nodes: FavoriteNode[], input: FavoriteAddInput): FavoriteAddResult {
  const path = input.path.trim()
  const pathKey = favoritePathIdentityKey(path)
  const duplicate = nodes.find((node) => isFavoriteItem(node) && node.kind === input.kind && favoritePathIdentityKey(node.path) === pathKey)
  if (duplicate) {
    return {
      nodes: nodes.map((node) => ({ ...node })),
      node: { ...duplicate },
      duplicate: true
    }
  }

  const parentId = input.parentId && isValidFavoriteParent(nodes, '', input.parentId) ? input.parentId : null
  const node: FavoriteNode = {
    id: input.id,
    kind: input.kind,
    path,
    name: input.name?.trim() || inferFavoriteNameFromPath(path),
    parentId,
    tags: input.tags || [],
    color: input.color || '#6B7280',
    sortOrder: nodes.length + 1,
    createdAt: input.now,
    updatedAt: input.now
  }
  return {
    nodes: [...nodes.map((item) => ({ ...item })), node],
    node,
    duplicate: false
  }
}

export function deleteFavoriteMetadata(nodes: FavoriteNode[], ids: string[]): FavoriteNode[] {
  const requested = new Set(ids)
  const deleting = new Set<string>()
  for (const id of requested) {
    const node = nodes.find((item) => item.id === id)
    if (!node) continue
    for (const descendantId of collectAllDescendantIds(nodes, id)) deleting.add(descendantId)
  }
  return nodes.filter((node) => !deleting.has(node.id)).map((node) => ({ ...node }))
}

export function favoriteParentOptions(nodes: FavoriteNode[], excludeId: string | null = null): FavoriteNode[] {
  return sortNodes(nodes.filter((node) => !excludeId || isValidFavoriteParent(nodes, excludeId, node.id)))
}
