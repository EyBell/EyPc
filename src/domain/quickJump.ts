export interface QuickJumpTargetInput {
  id: string
  label: string
  searchText?: string
}

export interface QuickJumpTarget extends QuickJumpTargetInput {
  marker: string
  displayMarker: string
}

export interface QuickJumpQueryResult<T extends QuickJumpTarget> {
  query: string
  mode: 'idle' | 'marker' | 'search'
  targets: T[]
  activeTargetId: string | null
  exactTargetId: string | null
}

const QUICK_JUMP_KEYS = ['a', 's', 'd', 'g', 'h', 'j', 'k', 'l', 'q', 'w', 'e', 'r', 'u', 'i', 'o', 'p', 'z', 'x', 'c', 'v', 'b', 'n', 'm']

function markerWidth(count: number) {
  let width = 1
  let capacity = QUICK_JUMP_KEYS.length
  while (capacity < count) {
    width += 1
    capacity *= QUICK_JUMP_KEYS.length
  }
  return width
}

function markerFromIndex(index: number, width: number) {
  const parts: string[] = []
  let value = index
  for (let offset = 0; offset < width; offset += 1) {
    parts.unshift(QUICK_JUMP_KEYS[value % QUICK_JUMP_KEYS.length])
    value = Math.floor(value / QUICK_JUMP_KEYS.length)
  }
  return parts.join('')
}

export function normalizeQuickJumpQuery(value: string) {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function targetSearchText(target: QuickJumpTargetInput) {
  return normalizeQuickJumpQuery(`${target.label} ${target.searchText || ''}`)
}

export function assignQuickJumpMarkers<T extends QuickJumpTargetInput>(targets: readonly T[]): Array<T & QuickJumpTarget> {
  const width = markerWidth(targets.length)
  return targets.map((target, index) => {
    const marker = markerFromIndex(index, width)
    return {
      ...target,
      marker,
      displayMarker: marker
    }
  })
}

export function quickJumpDisplayMarker(target: QuickJumpTarget, query: string) {
  const normalizedQuery = normalizeQuickJumpQuery(query)
  if (!normalizedQuery || !target.marker.startsWith(normalizedQuery)) return target.marker
  return target.marker.slice(normalizedQuery.length) || target.marker
}

function withQuickJumpDisplayMarkers<T extends QuickJumpTarget>(targets: readonly T[], query: string): T[] {
  return targets.map((target) => ({
    ...target,
    displayMarker: quickJumpDisplayMarker(target, query)
  }))
}

export function filterQuickJumpTargets<T extends QuickJumpTargetInput>(targets: readonly T[], query: string): Array<T & QuickJumpTarget> {
  const normalizedQuery = normalizeQuickJumpQuery(query)
  const filtered = normalizedQuery
    ? targets.filter((target) => targetSearchText(target).includes(normalizedQuery))
    : [...targets]
  return assignQuickJumpMarkers(filtered)
}

export function resolveQuickJumpQuery<T extends QuickJumpTarget>(targets: readonly T[], query: string): QuickJumpQueryResult<T> {
  const normalizedQuery = normalizeQuickJumpQuery(query)
  if (!normalizedQuery) {
    const visibleTargets = withQuickJumpDisplayMarkers(targets, '')
    return {
      query: '',
      mode: 'idle',
      targets: visibleTargets,
      activeTargetId: visibleTargets[0]?.id || null,
      exactTargetId: null
    }
  }

  const markerMatches = targets.filter((target) => target.marker.startsWith(normalizedQuery))
  if (markerMatches.length) {
    const exactTarget = markerMatches.length === 1 && markerMatches[0].marker === normalizedQuery ? markerMatches[0] : null
    const visibleMatches = withQuickJumpDisplayMarkers(markerMatches, normalizedQuery)
    return {
      query: normalizedQuery,
      mode: 'marker',
      targets: visibleMatches,
      activeTargetId: exactTarget?.id || markerMatches[0]?.id || null,
      exactTargetId: exactTarget?.id || null
    }
  }

  const filtered = filterQuickJumpTargets(targets, normalizedQuery) as T[]
  return {
    query: normalizedQuery,
    mode: 'search',
    targets: filtered,
    activeTargetId: filtered[0]?.id || null,
    exactTargetId: null
  }
}

export function moveQuickJumpActive<T extends QuickJumpTarget>(targets: readonly T[], activeTargetId: string | null, offset: number) {
  if (!targets.length) return null
  const currentIndex = activeTargetId ? targets.findIndex((target) => target.id === activeTargetId) : -1
  const baseIndex = currentIndex >= 0 ? currentIndex : offset < 0 ? 0 : -1
  const nextIndex = (baseIndex + offset + targets.length) % targets.length
  return targets[nextIndex].id
}
