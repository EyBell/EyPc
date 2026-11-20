// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialState } from '../../src/domain/state'
import SettingsPage from '../../src/pages/SettingsPage.vue'
import type { RuntimeDiagnosticsSnapshotV3 } from '../../src/platform/eypcPlatform'

function runtimeDiagnostics(): RuntimeDiagnosticsSnapshotV3 {
  return {
    revision: 'eypc-runtime-diagnostics-v3', status: 'ok', updatedAt: 1, sessionId: 'test', processId: 1,
    settings: { enabled: true, level: 'info', userConfigured: true, defaultsRevision: 3 }, directory: '/tmp/eypc-diagnostics', activeFile: '',
    totals: { events: 1, filtered: 0, debug: 0, info: 1, error: 0, slow: 0, writeFailures: 0 },
    storage: { fileCount: 1, totalBytes: 10, maxFileBytes: 100, maxTotalBytes: 1000, retentionDays: 14 }, recent: []
  }
}

function mountSettings(maintenance = false) {
  const state = createInitialState(100)
  return mount(SettingsPage, {
    attachTo: document.body,
    props: {
      overrides: [],
      ...(maintenance ? { initialMaintenanceSection: 'commands' as const } : {}),
      shortcutProfiles: state.settings.shortcutProfiles,
      featureConfigs: state.settings.featureConfigs,
      settings: state.settings,
      runtimeDiagnostics: runtimeDiagnostics(),
      mqttStorageStatus: {
        mode: 'browser-localStorage',
        sqliteAvailable: false,
        migratedLegacyArchive: false
      }
    }
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('settings command context panels', () => {
  it('opens left detail and right actions from a focused command row', async () => {
    const wrapper = mountSettings()
    const row = wrapper.find<HTMLElement>('.shortcut-compact-row:not(.shortcut-row-head)')
    await row.trigger('keydown', { key: 'ArrowLeft', ctrlKey: true })
    expect(wrapper.find('.settings-context-panel[aria-label="快捷键命令详情"]').exists()).toBe(true)

    await wrapper.find('.settings-context-panel button[aria-label="关闭详情"]').trigger('keydown', { key: 'ArrowRight', ctrlKey: true })
    expect(wrapper.find('.settings-context-panel[aria-label="快捷键命令操作"]').exists()).toBe(true)

    await wrapper.find('.settings-context-panel button[aria-label="关闭菜单"]').trigger('keydown', { key: 'ArrowLeft', ctrlKey: true })
    expect(wrapper.find('.settings-context-panel[aria-label="快捷键命令详情"]').exists()).toBe(true)

    await wrapper.find('.settings-context-panel button[aria-label="关闭详情"]').trigger('click')
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    expect(document.activeElement).toBe(row.element)

    await row.trigger('keydown', { key: 'ArrowRight', ctrlKey: true })
    expect(wrapper.find('.settings-context-panel[aria-label="快捷键命令操作"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps Ctrl+Left native when an editable search field owns focus', async () => {
    const wrapper = mountSettings()
    const search = wrapper.find<HTMLInputElement>('[data-role="settings-shortcut-search"]')
    search.element.focus()
    await search.trigger('keydown', { key: 'ArrowLeft', ctrlKey: true })

    expect(wrapper.find('.settings-context-panel').exists()).toBe(false)
    expect(document.activeElement).toBe(search.element)
    wrapper.unmount()
  })

  it('opens the action panel from the command row context menu', async () => {
    const wrapper = mountSettings()
    const row = wrapper.find('.shortcut-compact-row:not(.shortcut-row-head)')
    await row.trigger('contextmenu')

    expect(wrapper.find('.settings-context-panel[aria-label="快捷键命令操作"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('switches maintenance command panels with Cmd or Ctrl and restores the originating row on Escape', async () => {
    const wrapper = mountSettings(true)
    const row = wrapper.find<HTMLElement>('.maintenance-command-table [data-command-id]')
    const commandId = row.attributes('data-command-id')
    row.element.focus()

    await row.trigger('keydown', { key: 'ArrowLeft', metaKey: true })
    const detail = wrapper.find('.settings-context-panel[aria-label="快捷键命令详情"]')
    expect(detail.exists()).toBe(true)
    expect(detail.text()).toContain(commandId)

    await detail.get('button[aria-label="关闭详情"]').trigger('keydown', { key: 'ArrowRight', ctrlKey: true })
    const actions = wrapper.find('.settings-context-panel[aria-label="快捷键命令操作"]')
    expect(actions.exists()).toBe(true)
    expect(actions.text()).toContain(commandId)
    await actions.get('button[aria-label="关闭菜单"]').trigger('keydown', { key: 'Escape' })
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

    expect(wrapper.find('.settings-context-panel').exists()).toBe(false)
    expect(document.activeElement).toBe(row.element)
    wrapper.unmount()
  })

  it('keeps shortcut search filters and draft save gestures on the shortcuts subpage', async () => {
    vi.stubGlobal('confirm', () => true)
    const wrapper = mountSettings()
    await wrapper.get('[data-role="settings-shortcut-search"]').setValue('app.hide')
    const shortcutRow = wrapper.get('[data-command-id="app.hide"]')
    await shortcutRow.get('button[aria-label="禁用"]').trigger('click')
    await wrapper.get('.settings-sub-tabs button:last-child').trigger('click')
    await wrapper.get('.maintenance-section-nav button:nth-child(5)').trigger('click')

    const maintenanceRow = wrapper.find('.maintenance-command-table [data-command-id]')
    expect(maintenanceRow.exists()).toBe(true)
    const search = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })
    const save = new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true })
    maintenanceRow.element.dispatchEvent(search)
    maintenanceRow.element.dispatchEvent(save)
    expect(search.defaultPrevented).toBe(false)
    expect(save.defaultPrevented).toBe(false)
    expect(wrapper.emitted('dispatch')).not.toContainEqual(['settings.shortcutProfiles.save', expect.anything()])

    await wrapper.get('.settings-sub-tabs button:first-child').trigger('click')
    const shortcutSearch = wrapper.get<HTMLInputElement>('[data-role="settings-shortcut-search"]')
    expect(shortcutSearch.element.value).toBe('app.hide')
    await shortcutSearch.trigger('keydown', { key: 's', metaKey: true })
    expect(wrapper.emitted('dispatch')).toContainEqual(['settings.shortcutProfiles.save', expect.anything()])
    wrapper.unmount()
  })
})
