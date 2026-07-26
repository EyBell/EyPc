export interface ListSelectionItem {
  id: string
}

export interface ToggleIdWithAdvanceResult {
  selectedIds: string[]
  focusedId: string | null
}

export type DrawerTargetMode = 'single' | 'multi'

export interface ResolveDrawerTargetsResult {
  mode: DrawerTargetMode
  targetIds: string[]
}

function uniqueIds(ids: readonly string[] = []): string[] {
  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))]
}

/** Toggle focused row membership and always advance one row when advance is true. */
export function toggleIdWithAdvance(input: {
  rows: readonly ListSelectionItem[]
  focusedId: string | null | undefined
  selectedIds?: readonly string[]
  advance?: boolean
}): ToggleIdWithAdvanceResult {
  const rows = Array.isArray(input.rows) ? input.rows : []
  const focusedId = String(input.focusedId || '').trim()
  if (!focusedId || !rows.some((row) => row.id === focusedId)) {
    return { selectedIds: uniqueIds(input.selectedIds), focusedId: focusedId || null }
  }
  const selectedIds = uniqueIds(input.selectedIds)
  const nextSelected = selectedIds.includes(focusedId)
    ? selectedIds.filter((id) => id !== focusedId)
    : [...selectedIds, focusedId]
  if (input.advance === false) return { selectedIds: nextSelected, focusedId }
  const currentIndex = rows.findIndex((row) => row.id === focusedId)
  const nextFocus = currentIndex >= 0 && currentIndex < rows.length - 1 ? rows[currentIndex + 1].id : focusedId
  return { selectedIds: nextSelected, focusedId: nextFocus }
}

/** Explicit id always wins as single. Otherwise focused-in-selection yields multi. */
export function resolveDrawerTargets(input: {
  focusedId?: string | null
  selectedIds?: readonly string[]
  explicitId?: string | null
}): ResolveDrawerTargetsResult {
  const explicitId = String(input.explicitId || '').trim()
  if (explicitId) return { mode: 'single', targetIds: [explicitId] }
  const focusedId = String(input.focusedId || '').trim()
  const selectedIds = uniqueIds(input.selectedIds)
  if (focusedId && selectedIds.includes(focusedId) && selectedIds.length) {
    return { mode: 'multi', targetIds: selectedIds }
  }
  if (focusedId) return { mode: 'single', targetIds: [focusedId] }
  if (selectedIds.length) return { mode: 'multi', targetIds: selectedIds }
  return { mode: 'single', targetIds: [] }
}
