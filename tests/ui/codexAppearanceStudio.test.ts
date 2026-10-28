// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CodexAppearanceStudio from '../../src/components/CodexAppearanceStudio.vue'
import { defaultCodexSettings, emptyCodexQuota } from '../../src/domain/codex'
import { emptyClaudeEnvironment, emptyClaudeQuota } from '../../src/domain/claude'
import type { CodexRuntimeView } from '../../src/runtime/codexController'

function snapshot(): CodexRuntimeView {
  const settings = defaultCodexSettings()
  settings.providers.cursor = true
  return { settings, quota: emptyCodexQuota(), claudeQuota: emptyClaudeQuota(), claudeEnvironment: emptyClaudeEnvironment(), taskState: { dynamic: { compactCounts: { input: 1, active: 2, unread: 0 } } } } as unknown as CodexRuntimeView
}

describe('unified appearance editor', () => {
  it('uses the actual water component and edits a selected color through the settings action', async () => {
    const source = snapshot(), wrapper = mount(CodexAppearanceStudio, { props: { snapshot: source, mode: 'water' } })
    expect(wrapper.find('.appearance-complete .codex-water-ball').exists()).toBe(true)
    expect(wrapper.get('.appearance-counter.active').text()).toBe('2')
    await wrapper.get('.appearance-assembly').trigger('click')
    expect(wrapper.findAll('.appearance-layer')).toHaveLength(5)
    await wrapper.get('.layer-liquid .appearance-layer-label').trigger('click')
    expect((wrapper.get('[aria-label="选择配置部件"]').element as HTMLSelectElement).value).toBe('liquid')
    await wrapper.get('[aria-label="选择 #3B8FD4"]').trigger('click')
    const event = wrapper.emitted('dispatch')?.at(-1)
    expect(event?.[0]).toBe('codex.settings.update')
    expect((event?.[1] as { settings: { waterAppearance: { inner: { fillColorA: string } } } }).settings.waterAppearance.inner.fillColorA).toBe('#3B8FD4')
    await wrapper.get('.appearance-part-actions button:last-child').trigger('click')
    expect(wrapper.get('.appearance-assembly').text()).toBe('聚合')
    wrapper.unmount()
  })
  it('keeps Cursor theme color read-only and uses enabled sources', async () => {
    const source = snapshot(), wrapper = mount(CodexAppearanceStudio, { props: { snapshot: source, mode: 'card' } })
    const selector = wrapper.get('[aria-label="选择配置部件"]')
    expect(selector.text()).toContain('Cursor 额度（只读）')
    expect(selector.text()).not.toContain('Claude 额度')
    await selector.setValue('cursorQuota')
    expect(wrapper.get('.appearance-readonly').text()).toContain('只读')
    expect(wrapper.get('[aria-label="色相"]').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('dispatch')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('appearance theme persistence in configuration', () => {
  it('normalizes saved counter colors and the backup marker without changing old presets', async () => {
    const { normalizeCodexSettings } = await import('../../src/domain/codex')
    const settings = defaultCodexSettings()
    const base = { id: 'theme-1', name: '测试', colors: settings.colors, waterAppearance: settings.waterAppearance, expandedCardAppearance: settings.expandedCardAppearance, createdAt: 1, updatedAt: 2 }
    const result = normalizeCodexSettings({ ...settings, savedThemePresets: [{ ...base, counterColors: { input: '#ABCDEF', active: '#112233', unread: '#445566' }, alternate: true }, { ...base, id: 'old', name: '旧方案' }] })
    expect(result.savedThemePresets.find(p => p.id === 'theme-1')).toMatchObject({ alternate: true, counterColors: { input: '#ABCDEF', active: '#112233', unread: '#445566' } })
    expect(result.savedThemePresets.find(p => p.id === 'old')?.counterColors).toBeUndefined()
  })
})

it('renders unified configuration and creates a backup without switching the selected scheme', async () => {
  const { reactive, nextTick } = await import('vue')
  const { default: CodexPage } = await import('../../src/pages/CodexPage.vue')
  const { emptyCodexEnvironment, emptyCodexConfig, emptyCodexModelCatalog } = await import('../../src/domain/codex')
  const source = reactive({ ...snapshot(), environment: emptyCodexEnvironment(), floatHost: {}, taskSnapshot: { packageRevision: 0 }, config: emptyCodexConfig(), modelCatalog: emptyCodexModelCatalog(), refreshing: false }) as unknown as CodexRuntimeView
  const wrapper = mount(CodexPage, { props: { snapshot: source } })
  await wrapper.get('#codex-config-tab-water').trigger('click')
  expect(wrapper.find('.appearance-studio').exists()).toBe(true)
  const input = wrapper.get('.codex-theme-name input')
  await input.setValue('方案 A')
  await wrapper.findAll('.codex-theme-toolbar button').find(b => b.text() === '另存为')!.trigger('click')
  let last = wrapper.emitted('dispatch')?.at(-1) as [string, { settings: Partial<typeof source.settings> }]
  expect(last[0]).toBe('codex.settings.update')
  expect(last[1].settings.savedThemePresets?.[0]).toMatchObject({ name: '方案 A', counterColors: source.settings.counterColors })
  Object.assign(source.settings, last[1].settings); await nextTick()
  const select = wrapper.get('.codex-theme-toolbar select')
  const activeBefore = (select.element as HTMLSelectElement).value
  await input.setValue('备选 B')
  await wrapper.findAll('.codex-theme-toolbar button').find(b => b.text() === '保存备选')!.trigger('click')
  last = wrapper.emitted('dispatch')?.at(-1) as [string, { settings: Partial<typeof source.settings> }]
  expect(last[1].settings.savedThemePresets?.[0]).toMatchObject({ name: '备选 B', alternate: true })
  Object.assign(source.settings, last[1].settings); await nextTick()
  expect((select.element as HTMLSelectElement).value).toBe(activeBefore)
  await input.setValue('新名称')
  await wrapper.findAll('.codex-theme-toolbar button').find(b => b.text() === '重命名')!.trigger('click')
  last = wrapper.emitted('dispatch')?.at(-1) as [string, { settings: Partial<typeof source.settings> }]
  expect(last[1].settings.savedThemePresets?.find(x => x.id === activeBefore.slice('saved:'.length))?.name).toBe('新名称')
  wrapper.unmount()
})
