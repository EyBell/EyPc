import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('favorites initialization UI', () => {
  it('offers explicit reviewed pick paths without exposing add commands in quick mode', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/FavoritesPage.vue'), 'utf8')
    const quickPage = readFileSync(resolve(process.cwd(), 'src/pages/QuickFavoritesPage.vue'), 'utf8')

    expect(page).toContain('favorite-empty-state')
    expect(page).toContain('选择文件')
    expect(page).toContain('选择文件夹')
    expect(page).toContain('手动添加')
    expect(page).toContain('新建分组')
    expect(page).not.toContain('favorite-add-panel')
    expect(page).toContain("emit('dispatch', 'favorites.target.create')")
    expect(page).toContain("emit('dispatch', 'favorites.pick.files')")
    expect(page).toContain("emit('dispatch', 'favorites.pick.folders')")
    expect(page).toContain("emit('dispatch', 'favorites.pickReview.commit')")
    expect(page).toContain("emit('dispatch', 'favorites.pickReview.cancel')")
    expect(page).toContain('@paste="inferNameFromPath"')

    expect(quickPage).not.toContain('favorites.target.create')
    expect(quickPage).not.toContain('favorites.pick.files')
    expect(quickPage).not.toContain('favorites.pick.folders')
  })
})
