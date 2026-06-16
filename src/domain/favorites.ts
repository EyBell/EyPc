import type { FavoriteNode, FavoriteTreeNode } from './types'

export interface FavoriteFilter {
  keyword: string
  tags: string[]
  groupId: string | null
}

function sortNodes(nodes: FavoriteNode[]): FavoriteNode[] {
  return [...nodes].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export function buildFavoriteTree(nodes: FavoriteNode[]): FavoriteTreeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const byParent = new Map<string | null, FavoriteNode[]>()
  for (const node of nodes) {
    const parentId = node.parentId && byId.has(node.parentId) ? node.parentId : null
    byParent.set(parentId, [...(byParent.get(parentId) || []), node])
  }

  const walk = (parentId: string | null, depth: number): FavoriteTreeNode[] =>
    sortNodes(byParent.get(parentId) || []).map((node) => ({
      node,
      depth,
      children: walk(node.id, depth + 1)
    }))

  return walk(null, 0)
}

export function flattenFavoriteTree(tree: FavoriteTreeNode[], collapsedIds: string[] = []): FavoriteTreeNode[] {
  const collapsed = new Set(collapsedIds)
  return tree.flatMap((item) => [item, ...(collapsed.has(item.node.id) ? [] : flattenFavoriteTree(item.children, collapsedIds))])
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

export function filterFavoriteTree(nodes: FavoriteNode[], filter: FavoriteFilter): FavoriteTreeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const groupScope = filter.groupId ? collectDescendantIds(nodes, filter.groupId) : null
  const included = new Set<string>()

  for (const node of nodes) {
    if (groupScope && !groupScope.has(node.id)) continue
    const isRootGroup = filter.groupId && node.id === filter.groupId && !filter.keyword && filter.tags.length === 0
    if (!isRootGroup && !nodeMatches(node, filter)) continue
    let cursor: FavoriteNode | undefined = node
    while (cursor) {
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
