import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('favorite file bridge source', () => {
  it('splits file and folder multi-selection dialogs and keeps directory reads non-recursive', () => {
    const preload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')

    expect(preload).toContain('async function pickFavoritePaths(kind)')
    expect(preload).toContain("const properties = kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections']")
    expect(preload).not.toContain("properties: ['openFile', 'openDirectory', 'multiSelections']")
    expect(preload).toContain('async function listFavoriteDirectory')
    expect(preload).toContain('withFileTypes: true')
    expect(preload).toContain('pickFavorites: pickFavoritePaths')
    expect(preload).toContain('listDirectory: listFavoriteDirectory')
  })
})
