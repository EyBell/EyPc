export const SEARCH_HISTORY_LIMIT = 30

export type SearchHistoryTarget = 'ports.processes' | 'ports.groups' | 'favorites.files'

export interface SearchHistories {
  ports: {
    processes: string[]
    groups: string[]
  }
  favorites: {
    files: string[]
  }
}

export function emptySearchHistories(): SearchHistories {
  return {
    ports: {
      processes: [],
      groups: []
    },
    favorites: {
      files: []
    }
  }
}

export function normalizeSearchHistoryList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const output: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const normalized = item.trim()
    if (!normalized || output.includes(normalized)) continue
    output.push(normalized)
    if (output.length >= SEARCH_HISTORY_LIMIT) break
  }
  return output
}

export function recordSearchHistory(history: string[], keyword: string): string[] {
  const value = keyword.trim()
  if (!value) return history.slice(0, SEARCH_HISTORY_LIMIT)
  return [value, ...history.filter((item) => item !== value)].slice(0, SEARCH_HISTORY_LIMIT)
}

export function filterSearchHistoryItems(history: string[], keyword: string): string[] {
  const query = keyword.trim().toLowerCase()
  if (!query) return [...history]
  return history.filter((item) => item.toLowerCase().includes(query))
}

export function removeSearchHistoryItem(history: string[], index: number): string[] {
  if (index < 0 || index >= history.length) return history
  return history.filter((_, itemIndex) => itemIndex !== index)
}

export function acceptSearchHistorySelection(history: string[], activeIndex: number, currentValue: string): { value: string; history: string[] } {
  const selected = activeIndex >= 0 && activeIndex < history.length ? history[activeIndex] : ''
  const value = (selected || currentValue).trim()
  return {
    value,
    history: selected ? history : recordSearchHistory(history, value)
  }
}

export function historyForTarget(histories: SearchHistories, target: SearchHistoryTarget): string[] {
  if (target === 'ports.processes') return histories.ports.processes
  if (target === 'ports.groups') return histories.ports.groups
  return histories.favorites.files
}

export function updateHistoryForTarget(histories: SearchHistories, target: SearchHistoryTarget, history: string[]): SearchHistories {
  if (target === 'ports.processes') return { ...histories, ports: { ...histories.ports, processes: history } }
  if (target === 'ports.groups') return { ...histories, ports: { ...histories.ports, groups: history } }
  return { ...histories, favorites: { ...histories.favorites, files: history } }
}
