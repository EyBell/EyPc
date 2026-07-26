export interface RecordListItem {
  id: string
}

export interface RecordListSelectionState {
  activeIndex: number
  selectedIds: string[]
}

export interface RecordListDeleteAnchor {
  anchorIndex: number
  preferItemId: string | null
  selectedIds: string[]
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(Math.max(Math.trunc(index), 0), length - 1)
}

function uniqueIds(ids: readonly string[] = []): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

function lastIndexOfIds(rows: readonly RecordListItem[], ids: Set<string>): number {
  let index = -1
  rows.forEach((row, rowIndex) => {
    if (ids.has(row.id)) index = rowIndex
  })
  return index
}

function retainedIdNearAnchor(rows: readonly RecordListItem[], deletedIds: Set<string>, anchorIndex: number): string | null {
  const start = clampIndex(anchorIndex, rows.length)
  for (let index = start; index < rows.length; index += 1) {
    const id = rows[index]?.id
    if (id && !deletedIds.has(id)) return id
  }
  for (let index = start - 1; index >= 0; index -= 1) {
    const id = rows[index]?.id
    if (id && !deletedIds.has(id)) return id
  }
  return null
}

export function toggleRecordListSelection(input: {
  rows: readonly RecordListItem[]
  activeIndex: number
  selectedIds?: readonly string[]
}): RecordListSelectionState {
  const rows = Array.isArray(input.rows) ? input.rows : []
  const activeIndex = clampIndex(input.activeIndex, rows.length)
  const current = rows[activeIndex]
  if (!current) return { activeIndex: 0, selectedIds: [] }
  const selectedIds = uniqueIds(input.selectedIds)
  const nextSelected = selectedIds.includes(current.id)
    ? selectedIds.filter((id) => id !== current.id)
    : [...selectedIds, current.id]
  // Workbench List Taste: always advance after Space toggle (select or deselect).
  return {
    activeIndex: clampIndex(activeIndex + 1, rows.length),
    selectedIds: nextSelected
  }
}

export function computeRecordListDeleteAnchor(input: {
  rows: readonly RecordListItem[]
  activeIndex: number
  selectedIds?: readonly string[]
  deleteIds?: readonly string[]
}): RecordListDeleteAnchor {
  const rows = Array.isArray(input.rows) ? input.rows : []
  const deleteIds = new Set(uniqueIds(input.deleteIds))
  const selectedIds = uniqueIds(input.selectedIds).filter((id) => !deleteIds.has(id))
  const activeIndex = clampIndex(input.activeIndex, rows.length)
  const bottomDeletedIndex = lastIndexOfIds(rows, deleteIds)
  const anchorIndex = bottomDeletedIndex >= 0 ? bottomDeletedIndex : activeIndex
  return {
    anchorIndex,
    preferItemId: retainedIdNearAnchor(rows, deleteIds, anchorIndex),
    selectedIds
  }
}

export function applyRecordListDeleteRecovery(
  rows: readonly RecordListItem[],
  anchor: Pick<RecordListDeleteAnchor, 'anchorIndex' | 'preferItemId'>
): { activeIndex: number; activeId: string | null } {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return { activeIndex: 0, activeId: null }
  let activeIndex = clampIndex(anchor.anchorIndex, list.length)
  if (anchor.preferItemId) {
    const preferredIndex = list.findIndex((row) => row.id === anchor.preferItemId)
    if (preferredIndex >= 0) activeIndex = preferredIndex
  }
  return {
    activeIndex,
    activeId: list[activeIndex]?.id || null
  }
}
