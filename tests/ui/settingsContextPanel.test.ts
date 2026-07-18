// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createInitialState } from '../../src/domain/state'
import SettingsPage from '../../src/pages/SettingsPage.vue'
import { DEFAULT_KEYBINDINGS } from '../../src/runtime/keybinding/keybindingRuntime'

function mountSettings() {
  const state = createInitialState(100)
  return mount(SettingsPage, {
    attachTo: document.body,
    props: {
      actions: [],
      defaultKeybindings: DEFAULT_KEYBINDINGS,
      overrides: [],
      shortcutProfiles: state.settings.shortcutProfiles,
      featureConfigs: state.settings.featureConfigs,
      settings: state.settings,
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
})
