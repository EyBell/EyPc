import { describe, expect, it } from 'vitest'
import {
  acceptSearchHistorySelection,
  filterSearchHistoryItems,
  recordSearchHistory,
  removeSearchHistoryItem
} from '../../src/domain/searchHistory'

describe('search history domain', () => {
  it('records trimmed unique search histories with a fixed limit', () => {
    let history: string[] = []
    for (let index = 0; index < 35; index += 1) {
      history = recordSearchHistory(history, ` port-${index} `)
    }
    history = recordSearchHistory(history, 'port-20')

    expect(history).toHaveLength(30)
    expect(history[0]).toBe('port-20')
    expect(history.filter((item) => item === 'port-20')).toHaveLength(1)
    expect(history.includes('port-0')).toBe(false)
  })

  it('filters, accepts, and removes highlighted history items', () => {
    const history = ['node', 'vite', 'java', 'node-api']

    expect(filterSearchHistoryItems(history, 'no')).toEqual(['node', 'node-api'])
    expect(acceptSearchHistorySelection(history, 1, 'ignored')).toEqual({ value: 'vite', history })
    expect(acceptSearchHistorySelection(history, -1, ' redis ')).toEqual({
      value: 'redis',
      history: ['redis', 'node', 'vite', 'java', 'node-api']
    })
    expect(removeSearchHistoryItem(history, 2)).toEqual(['node', 'vite', 'node-api'])
  })
})
