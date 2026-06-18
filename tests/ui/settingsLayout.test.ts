import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('settings layout', () => {
  it('uses scoped settings sub tabs and passes app settings for maintenance display', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    const settingsPage = readFileSync(resolve(process.cwd(), 'src/pages/SettingsPage.vue'), 'utf8')

    expect(settingsPage).toContain("type SettingsTabId = 'shortcuts' | 'maintenance'")
    expect(settingsPage).toContain('settingsTabId')
    expect(settingsPage).toContain('settings-sub-tabs')
    expect(settingsPage).toContain("id: 'maintenance', label: '维护'")
    expect(app).toContain(':settings="snapshot.state.settings"')
  })

  it('keeps shortcuts in a single-column compact worktable without the old right inspector', () => {
    const settingsPage = readFileSync(resolve(process.cwd(), 'src/pages/SettingsPage.vue'), 'utf8')
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')

    expect(settingsPage).toContain('shortcut-strip')
    expect(settingsPage).toContain('shortcut-compact-row')
    expect(settingsPage).not.toContain('shortcut-inspector')
    expect(css).toMatch(/\.shortcut-settings-layout \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s)
    expect(css).toMatch(/\.shortcut-compact-row \{[^}]*grid-template-columns:/s)
    expect(css).not.toContain('.shortcut-inspector')
  })

  it('moves layer and storage configuration into the maintenance tab', () => {
    const settingsPage = readFileSync(resolve(process.cwd(), 'src/pages/SettingsPage.vue'), 'utf8')

    expect(settingsPage).toContain('settings-maintenance')
    expect(settingsPage).toContain('层级优先级')
    expect(settingsPage).toContain('保留键与接管层')
    expect(settingsPage).toContain('当前存储')
    expect(settingsPage).toContain('SQLite')
    expect(settingsPage).toContain('props.settings.preferSqlite')
  })
})
