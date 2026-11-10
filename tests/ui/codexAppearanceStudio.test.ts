// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick, reactive } from 'vue'
import CodexAppearanceStudio from '../../src/components/CodexAppearanceStudio.vue'
import { defaultCodexSettings, emptyCodexQuota } from '../../src/domain/codex'
import { emptyClaudeEnvironment, emptyClaudeQuota } from '../../src/domain/claude'
import type { CodexRuntimeView } from '../../src/runtime/codexController'

function snapshot(): CodexRuntimeView {
  const settings = defaultCodexSettings()
  settings.providers.cursor = true
  return { settings, quota: emptyCodexQuota(), claudeQuota: emptyClaudeQuota(), claudeEnvironment: emptyClaudeEnvironment(), taskState: { dynamic: { compactCounts: { input: 1, active: 2, unread: 0 } } } } as unknown as CodexRuntimeView
}

function remoteLimitSnapshot(source = snapshot()): CodexRuntimeView {
  source.settings.providers = { codex: true, claude: false, cursor: false, orca: false }
  source.settings.magpieQuotaAccess = true
  source.quota = { ...emptyCodexQuota('ok'), plan: ' Free ' }
  source.companion = {
    providers: source.settings.providers,
    claudeQuota: source.claudeQuota,
    claudeEnvironment: source.claudeEnvironment,
    magpieQuota: {
      status: 'ok', updatedAt: 1, providers: [{
        provider: 'office/~keys', kind: 'plan',
        windows: [{ name: 'Spend this week', amount: 6.3, limit: 10, unit: 'USD' }]
      }]
    }
  }
  return source
}

const mountedHarnesses: Array<{ unmount: () => void }> = []
afterEach(() => { for (const wrapper of mountedHarnesses.splice(0)) wrapper.unmount() })

async function appearancePage() {
  const { default: CodexPage } = await import('../../src/pages/CodexPage.vue')
  const { emptyCodexEnvironment, emptyCodexConfig, emptyCodexModelCatalog } = await import('../../src/domain/codex')
  const source = reactive({ ...snapshot(), environment: emptyCodexEnvironment(), floatHost: {}, taskSnapshot: { packageRevision: 0 }, config: emptyCodexConfig(), modelCatalog: emptyCodexModelCatalog(), refreshing: false }) as unknown as CodexRuntimeView
  const wrapper = mount(CodexPage, { attachTo: document.body, props: {
    snapshot: source,
    onDispatch: (action: string, args?: { settings?: Partial<typeof source.settings> }) => {
      if (action === 'codex.settings.update' && args?.settings) Object.assign(source.settings, args.settings)
    }
  } })
  mountedHarnesses.push(wrapper)
  await wrapper.get('#codex-config-tab-water').trigger('click')
  return { source, wrapper }
}

async function escapeAppearance(options: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, ...options }))
  await nextTick()
}

function selectedText(select: HTMLSelectElement) {
  return select.selectedOptions[0]?.textContent?.trim() || ''
}

describe('unified appearance editor', () => {
  it('shares the remote Magpie limit reading and restores the normal display when another provider is enabled', async () => {
    const source = reactive(remoteLimitSnapshot())
    const wrapper = mount(CodexAppearanceStudio, { props: { snapshot: source, mode: 'water' } })
    mountedHarnesses.push(wrapper)
    const ball = wrapper.get('.appearance-complete .codex-water-ball')
    expect(ball.get('.codex-water-ball__value strong').text()).toBe('37%')
    expect(ball.get('.codex-water-ball__percent-source').text()).toBe('Magpie')
    expect(ball.attributes('style')).toContain('--weekly-ring: 37')
    expect(ball.attributes('data-operation-tooltip')).toContain('上限 10 USD')
    expect(wrapper.get('.appearance-studio-stage').attributes('aria-label')).toContain('上限 10 USD')
    expect(ball.find('.codex-water-ball__liquid').exists()).toBe(false)
    source.settings.providers.cursor = true
    await nextTick()
    expect(wrapper.find('.codex-water-ball__percent-source').exists()).toBe(false)
    expect(wrapper.find('.codex-water-ball__ring').exists()).toBe(false)
    expect(wrapper.get('.appearance-studio-stage').attributes('aria-label')).not.toContain('Magpie')
  })

  it('feeds the remote limit into the configuration page preview and preserves explicit zero agent quota', async () => {
    const { source, wrapper } = await appearancePage()
    remoteLimitSnapshot(source)
    await nextTick()
    expect(wrapper.get('.appearance-complete .codex-water-ball__value strong').text()).toBe('37%')
    expect(wrapper.get('.appearance-complete .codex-water-ball').attributes('data-operation-tooltip')).toContain('Magpie')
    const preview = wrapper.get('.codex-water-appearance-preview')
    expect(preview.attributes('role')).toBe('img')
    expect(preview.attributes('aria-label')).toContain('上限 10 USD')
    source.companion!.magpieQuota!.providers.push({
      provider: 'remote-magpie/grok', windows: [{ name: '7 days', remaining: 0 }]
    })
    await nextTick()
    expect(wrapper.find('.codex-water-ball__percent-source').exists()).toBe(false)
    expect(wrapper.find('.codex-water-ball__ring').exists()).toBe(false)
    expect(preview.attributes('role')).toBeUndefined()
    expect(preview.attributes('aria-label')).not.toContain('Magpie')
  })

  it('shows only the pointed part name and keeps selection after hover ends', async () => {
    const wrapper = mount(CodexAppearanceStudio, { props: { snapshot: snapshot(), mode: 'water' } })
    const select = wrapper.get('[aria-label="选择配置部件"]')
    expect((select.element as HTMLSelectElement).value).toBe('')
    expect(wrapper.get('.appearance-complete').classes()).toEqual(['appearance-complete'])
    await wrapper.get('.appearance-assembly').trigger('click')
    expect(wrapper.findAll('.appearance-layer.selected')).toHaveLength(0)
    expect(wrapper.find('.appearance-part-hint').exists()).toBe(false)
    await wrapper.get('.layer-track .codex-water-ball__ring .track').trigger('pointermove')
    expect(wrapper.get('.appearance-part-hint').text()).toBe('环形轨道 · 示例')
    expect(wrapper.get('.layer-track .appearance-part-key').attributes('aria-label')).toBe('环形轨道，示例')
    expect((select.element as HTMLSelectElement).value).toBe('')
    await wrapper.get('.appearance-studio-stage').trigger('pointerleave')
    expect(wrapper.find('.appearance-part-hint').exists()).toBe(false)
    await select.setValue('ring')
    expect(wrapper.get('.layer-ring').classes()).toContain('selected')
    expect(wrapper.findAll('.appearance-layer.selected')).toHaveLength(1)
    await wrapper.get('.layer-liquid .codex-water-ball__liquid').trigger('click')
    expect((select.element as HTMLSelectElement).value).toBe('liquid')
    expect(wrapper.get('.layer-liquid').classes()).toContain('selected')
    expect(wrapper.get('.layer-ring').classes()).not.toContain('selected')
    wrapper.unmount()
  })
  it('does not select a part after rotating the model', async () => {
    const wrapper = mount(CodexAppearanceStudio, { props: { snapshot: snapshot(), mode: 'water' } })
    const surface = wrapper.get('.appearance-complete .codex-water-ball__surface')
    await surface.trigger('pointerdown', { button: 0, clientX: 10, clientY: 10 })
    await surface.trigger('pointermove', { buttons: 1, clientX: 40, clientY: 10 })
    await surface.trigger('pointerup')
    await surface.trigger('click')
    expect((wrapper.get('[aria-label="选择配置部件"]').element as HTMLSelectElement).value).toBe('')
    wrapper.unmount()
  })
  it('reveals the focused water part name and keeps its selection after blur', async () => {
    const wrapper = mount(CodexAppearanceStudio, { props: { snapshot: snapshot(), mode: 'water' } })
    expect(wrapper.find('.appearance-part-hint').exists()).toBe(false)
    const reading = wrapper.get('.appearance-complete .appearance-part-key[data-part="reading"]')
    expect(reading.attributes('aria-label')).toBe('读数文字')
    await reading.trigger('focusin')
    expect(wrapper.get('.appearance-part-hint').text()).toBe('读数文字')
    await reading.trigger('click')
    expect((wrapper.get('[aria-label="选择配置部件"]').element as HTMLSelectElement).value).toBe('reading')
    await reading.trigger('focusout')
    expect(wrapper.find('.appearance-part-hint').exists()).toBe(false)
    expect(wrapper.get('.appearance-complete').classes()).toContain('selected-reading')
    wrapper.unmount()
  })
  it('shows the pointed name on an assembled model and hides it on leave', async () => {
    const wrapper = mount(CodexAppearanceStudio, { props: { snapshot: snapshot(), mode: 'water' } })
    const surface = wrapper.get('.appearance-complete .codex-water-ball__surface')
    await surface.trigger('pointermove', { clientX: 80, clientY: 90 })
    expect(wrapper.get('.appearance-part-hint').text()).toBe('球体底色')
    await wrapper.get('.appearance-studio-stage').trigger('pointerleave')
    expect(wrapper.find('.appearance-part-hint').exists()).toBe(false)
    wrapper.unmount()
  })
  it('does not replace a real zero reading with a sample when parts are exploded', async () => {
    const source = snapshot()
    const short = { remainingPercent: 0, resetAt: null, windowMinutes: 300 }
    const weekly = { remainingPercent: 0, resetAt: null, windowMinutes: 10080 }
    const quota = emptyCodexQuota('ok')
    source.quota = { ...quota, short, weekly, normal: { ...quota.normal, short, weekly } }
    const wrapper = mount(CodexAppearanceStudio, { props: { snapshot: source, mode: 'water' } })
    await wrapper.get('.appearance-assembly').trigger('click')
    expect(wrapper.get('.layer-liquid .codex-water-ball').attributes('style')).toContain('--water-level: 0%')
    expect(wrapper.get('.layer-ring .codex-water-ball').attributes('style')).toContain('--weekly-ring: 0')
    await wrapper.get('.layer-ring .codex-water-ball__ring .track').trigger('pointermove')
    expect(wrapper.get('.appearance-part-hint').text()).toBe('额度环')
    wrapper.unmount()
  })
  it('marks a real badge and reports parts missing from the current model', async () => {
    const wrapper = mount(CodexAppearanceStudio, { props: { snapshot: snapshot(), mode: 'water' } })
    const select = wrapper.get('[aria-label="选择配置部件"]')
    await select.setValue('active')
    expect(wrapper.get('.appearance-counter.active').classes()).toContain('selected')
    await select.setValue('unread')
    expect(wrapper.find('.appearance-counter.unread').exists()).toBe(false)
    expect(wrapper.get('.appearance-unrepresented').text()).toContain('当前未显示')
    expect(wrapper.findAll('.appearance-counter.selected')).toHaveLength(0)
    wrapper.unmount()
  })
  it('keeps card hover and dropdown selection on the matching part', async () => {
    const wrapper = mount(CodexAppearanceStudio, { props: { snapshot: snapshot(), mode: 'card' } })
    const select = wrapper.get('[aria-label="选择配置部件"]')
    expect(wrapper.findAll('.appearance-card .selected')).toHaveLength(0)
    await wrapper.get('.appearance-card-search').trigger('pointermove')
    expect(wrapper.get('.appearance-part-hint').text()).toBe('次文字')
    await wrapper.get('.appearance-studio-stage').trigger('pointerleave')
    expect(wrapper.find('.appearance-part-hint').exists()).toBe(false)
    await select.setValue('codexQuota')
    expect(wrapper.get('.appearance-card-quota').classes()).toContain('selected')
    expect(wrapper.findAll('.appearance-card .selected')).toHaveLength(1)
    await wrapper.get('.appearance-card-task').trigger('click')
    expect((select.element as HTMLSelectElement).value).toBe('foreground')
    expect(wrapper.get('.appearance-card-quota').classes()).not.toContain('selected')
    await select.setValue('border')
    expect(wrapper.get('.appearance-card-surface').classes()).toContain('selected')
    expect(wrapper.find('.appearance-unrepresented').exists()).toBe(false)
    await wrapper.get('.appearance-border-hit.top').trigger('click')
    expect((select.element as HTMLSelectElement).value).toBe('border')
    await select.setValue('surfaceRaised')
    expect(wrapper.get('.appearance-card').classes()).toContain('selected-raised')
    await select.setValue('focus')
    expect(wrapper.findAll('.appearance-card .selected')).toHaveLength(0)
    expect(wrapper.get('.appearance-unrepresented').text()).toContain('当前未显示')
    await select.setValue('')
    expect(wrapper.find('.appearance-unrepresented').exists()).toBe(false)
    expect(wrapper.findAll('.appearance-card .selected')).toHaveLength(0)
    wrapper.unmount()
  })
  it('uses the actual water component and edits a selected color through the settings action', async () => {
    const source = snapshot(), wrapper = mount(CodexAppearanceStudio, { props: { snapshot: source, mode: 'water' } })
    expect(wrapper.find('.appearance-complete .codex-water-ball').exists()).toBe(true)
    expect(wrapper.get('.appearance-counter.active').text()).toBe('2')
    await wrapper.get('.appearance-assembly').trigger('click')
    expect(wrapper.findAll('.appearance-layer')).toHaveLength(5)
    await wrapper.get('.layer-liquid .codex-water-ball__liquid').trigger('click')
    expect((wrapper.get('[aria-label="选择配置部件"]').element as HTMLSelectElement).value).toBe('liquid')
    await wrapper.get('[aria-label="选择 #3B8FD4"]').trigger('click')
    const event = wrapper.emitted('dispatch')?.at(-1)
    expect(event?.[0]).toBe('codex.settings.update')
    expect((event?.[1] as { settings: { waterAppearance: { inner: { fillColorA: string } } } }).settings.waterAppearance.inner.fillColorA).toBe('#3B8FD4')
    await wrapper.get('.appearance-part-actions button:last-child').trigger('click')
    expect(wrapper.get('.appearance-assembly').text()).toBe('聚合')
    wrapper.unmount()
  })
  it('outlines the hovered part without changing the selection', async () => {
    const wrapper = mount(CodexAppearanceStudio, { props: { snapshot: snapshot(), mode: 'water' } })
    const select = wrapper.get('[aria-label="选择配置部件"]')
    const badge = wrapper.get('.appearance-counter.active')
    await badge.trigger('pointermove')
    expect(badge.classes()).toContain('pointed')
    expect(badge.classes()).not.toContain('selected')
    expect((select.element as HTMLSelectElement).value).toBe('')
    await wrapper.get('.appearance-studio-stage').trigger('pointerleave')
    expect(wrapper.find('.appearance-counter.pointed').exists()).toBe(false)

    await wrapper.get('.appearance-assembly').trigger('click')
    await select.setValue('ring')
    await wrapper.get('.layer-liquid .codex-water-ball__liquid').trigger('pointermove')
    expect(wrapper.get('.layer-ring').classes()).toContain('selected')
    expect(wrapper.get('.layer-ring').classes()).not.toContain('pointed')
    expect(wrapper.get('.layer-liquid').classes()).toContain('pointed')
    expect((select.element as HTMLSelectElement).value).toBe('ring')
    wrapper.unmount()
  })
  it('drops the hover outline while the model is rotating', async () => {
    const wrapper = mount(CodexAppearanceStudio, { props: { snapshot: snapshot(), mode: 'water' } })
    const badge = wrapper.get('.appearance-counter.active')
    await badge.trigger('pointermove')
    expect(badge.classes()).toContain('pointed')
    await badge.trigger('pointerdown', { button: 0, clientX: 10, clientY: 10 })
    await badge.trigger('pointermove', { buttons: 1, clientX: 40, clientY: 10 })
    expect(badge.classes()).not.toContain('pointed')
    wrapper.unmount()
  })
  it('outlines a hovered card part without selecting it', async () => {
    const wrapper = mount(CodexAppearanceStudio, { props: { snapshot: snapshot(), mode: 'card' } })
    const search = wrapper.get('.appearance-card-search')
    await search.trigger('pointermove')
    expect(search.classes()).toContain('pointed')
    expect(search.classes()).not.toContain('selected')
    expect((wrapper.get('[aria-label="选择配置部件"]').element as HTMLSelectElement).value).toBe('')
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
    expect(result.savedThemePresets.find(p => p.id === 'old')?.magpieQuotaGridCursorPrimaryLabel).toBeUndefined()
  })
})

it('moves display style controls into appearance and keeps shortcuts readable', async () => {
  const { default: CodexPage } = await import('../../src/pages/CodexPage.vue')
  const { emptyCodexEnvironment, emptyCodexConfig, emptyCodexModelCatalog } = await import('../../src/domain/codex')
  const source = { ...snapshot(), environment: emptyCodexEnvironment(), floatHost: {}, taskSnapshot: { packageRevision: 0 }, config: emptyCodexConfig(), modelCatalog: emptyCodexModelCatalog(), refreshing: false } as unknown as CodexRuntimeView
  const wrapper = mount(CodexPage, { props: { snapshot: source } })
  expect(wrapper.find('.codex-hero-actions .codex-style-switch').exists()).toBe(false)
  expect(wrapper.find('.codex-shortcut-stack').exists()).toBe(true)
  expect(wrapper.get('.codex-hotkey-row small').classes()).not.toContain('codex-sr-only')
  await wrapper.get('#codex-config-tab-water').trigger('click')
  expect(wrapper.find('.codex-appearance-title-actions .codex-style-switch').exists()).toBe(false)
  expect(wrapper.find('.codex-appearance-advanced-actions .codex-style-switch').exists()).toBe(true)
  expect(wrapper.find('.codex-theme-toolbar').exists()).toBe(false)
  expect(wrapper.find('[aria-label="选择主题"]').exists()).toBe(true)
  expect(wrapper.find('[aria-label="主题操作"]').exists()).toBe(true)
  expect(wrapper.get('.codex-appearance-advanced summary').text()).toContain('更多选择')
  expect(wrapper.find('.appearance-studio').exists()).toBe(true)
  wrapper.unmount()
})

it('saves and renames a theme while retaining existing backup data', async () => {
  const { reactive, nextTick } = await import('vue')
  const { default: CodexPage } = await import('../../src/pages/CodexPage.vue')
  const { emptyCodexEnvironment, emptyCodexConfig, emptyCodexModelCatalog } = await import('../../src/domain/codex')
  const source = reactive({ ...snapshot(), environment: emptyCodexEnvironment(), floatHost: {}, taskSnapshot: { packageRevision: 0 }, config: emptyCodexConfig(), modelCatalog: emptyCodexModelCatalog(), refreshing: false }) as unknown as CodexRuntimeView
  const oldBackup = { id: 'legacy-backup', name: '旧备选', colors: { ...source.settings.colors, water: '#010203' }, waterAppearance: source.settings.waterAppearance, expandedCardAppearance: source.settings.expandedCardAppearance, alternate: true, createdAt: 1, updatedAt: 1 }
  source.settings.savedThemePresets = [oldBackup]
  const wrapper = mount(CodexPage, { props: { snapshot: source } })
  await wrapper.get('#codex-config-tab-water').trigger('click')
  expect(wrapper.find('.appearance-studio').exists()).toBe(true)
  const themeSelect = wrapper.get('[aria-label="选择主题"]')
  const actionTrigger = wrapper.get('[aria-label="主题操作"]')
  await actionTrigger.trigger('click')
  expect(wrapper.find('[data-theme-action="backup"]').exists()).toBe(false)
  await wrapper.get('[data-theme-action="saveAs"]').trigger('click')
  const input = wrapper.get('.codex-theme-name input')
  await input.setValue('方案 A')
  await input.trigger('keydown', { key: 'Enter' })
  let last = wrapper.emitted('dispatch')?.at(-1) as [string, { settings: Partial<typeof source.settings> }]
  expect(last[0]).toBe('codex.settings.update')
  expect(last[1].settings.savedThemePresets?.[0]).toMatchObject({ name: '方案 A', counterColors: source.settings.counterColors })
  expect(last[1].settings.savedThemePresets?.find(item => item.id === 'legacy-backup')).toMatchObject({ name: '旧备选', alternate: true })
  Object.assign(source.settings, last[1].settings); await nextTick()
  const activeBefore = (themeSelect.element as HTMLSelectElement).value
  await actionTrigger.trigger('click')
  await wrapper.get('[data-theme-action="rename"]').trigger('click')
  await wrapper.get('.codex-theme-name input').setValue('新名称')
  await wrapper.get('.codex-theme-name input').trigger('keydown', { key: 'Enter' })
  last = wrapper.emitted('dispatch')?.at(-1) as [string, { settings: Partial<typeof source.settings> }]
  expect(last[1].settings.savedThemePresets?.find(x => x.id === activeBefore.slice('saved:'.length))?.name).toBe('新名称')
  expect(last[1].settings.savedThemePresets?.find(item => item.id === 'legacy-backup')).toMatchObject({ name: '旧备选', alternate: true })
  wrapper.unmount()
})

it('remembers more-selection open state across remounts', async () => {
  const { default: CodexPage } = await import('../../src/pages/CodexPage.vue')
  const { emptyCodexEnvironment, emptyCodexConfig, emptyCodexModelCatalog } = await import('../../src/domain/codex')
  localStorage.removeItem('eypc.codex.appearance-advanced-open')
  const source = { ...snapshot(), environment: emptyCodexEnvironment(), floatHost: {}, taskSnapshot: { packageRevision: 0 }, config: emptyCodexConfig(), modelCatalog: emptyCodexModelCatalog(), refreshing: false } as unknown as CodexRuntimeView
  const first = mount(CodexPage, { props: { snapshot: source } })
  await first.get('#codex-config-tab-water').trigger('click')
  expect(first.get('.codex-appearance-advanced').attributes('open')).toBeUndefined()
  const details = first.get('.codex-appearance-advanced')
  ;(details.element as HTMLDetailsElement).open = true
  await details.trigger('toggle')
  expect(localStorage.getItem('eypc.codex.appearance-advanced-open')).toBe('1')
  first.unmount()
  const second = mount(CodexPage, { props: { snapshot: source } })
  await second.get('#codex-config-tab-water').trigger('click')
  expect(second.get('.codex-appearance-advanced').attributes('open')).toBeDefined()
  second.unmount()
  localStorage.removeItem('eypc.codex.appearance-advanced-open')
})

describe('appearance toolbar and edit-session behavior', () => {
  it('shows the active built-in theme name even when it is outside the four common presets', async () => {
    const { source, wrapper } = await appearancePage()
    const { CODEX_THEME_PRESETS } = await import('../../src/domain/codexAppearance')
    const seaSalt = CODEX_THEME_PRESETS.find(item => item.id === 'sea-salt')!
    Object.assign(source.settings, { colors: seaSalt.colors, waterAppearance: seaSalt.waterAppearance, expandedCardAppearance: seaSalt.expandedCardAppearance })
    await nextTick()
    expect(selectedText(wrapper.get('[aria-label="选择主题"]').element as HTMLSelectElement)).toBe('海盐')
  })

  it('retains the complete selected theme name in the selector hint', async () => {
    const { source, wrapper } = await appearancePage()
    const name = '外观主题完整名称'.repeat(4)
    source.settings.savedThemePresets = [{ id: 'long-theme', name, colors: source.settings.colors, waterAppearance: source.settings.waterAppearance, expandedCardAppearance: source.settings.expandedCardAppearance, createdAt: 1, updatedAt: 1 }]
    await nextTick()
    const select = wrapper.get('[aria-label="选择主题"]')
    await select.setValue('saved:long-theme')
    expect(select.attributes('title')).toBe(name)
    expect(selectedText(select.element as HTMLSelectElement)).toBe(name)
  })

  it('places controls in the preview and keeps part names in the selector only', async () => {
    const { wrapper } = await appearancePage()
    expect(wrapper.get('.appearance-studio-stage .appearance-studio-tabs').text()).toContain('水球')
    const selector = wrapper.get('[aria-label="选择配置部件"]')
    expect(selectedText(selector.element as HTMLSelectElement)).toBe('选择')
    await selector.setValue('liquid')
    expect(selectedText(selector.element as HTMLSelectElement)).toBe('液体')
    expect(wrapper.get('.appearance-studio-editor').text()).toContain('液体配色')
    expect(wrapper.find('.appearance-color-heading').exists()).toBe(false)
    await wrapper.get('.appearance-assembly').trigger('click')
    await wrapper.get('.layer-ring .codex-water-ball__ring .value').trigger('click')
    expect(selectedText(selector.element as HTMLSelectElement)).toBe('额度环')
    expect(wrapper.get('.layer-ring').classes()).toContain('selected')
    expect(wrapper.find('.codex-appearance-advanced-title [aria-label="外观配置说明"]').exists()).toBe(true)
    const styleSwitch = wrapper.get('.codex-appearance-advanced-actions .codex-style-switch')
    expect(styleSwitch.text()).toContain('水球')
    expect(styleSwitch.text()).toContain('卡片')
    expect(styleSwitch.text()).toContain('贴边线')
  })

  it('opens on hover, keeps a typed name after leaving, and respects composition Enter', async () => {
    const { source, wrapper } = await appearancePage()
    await wrapper.get('.appearance-theme-actions').trigger('pointerenter')
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    await wrapper.get('[data-theme-action="saveAs"]').trigger('pointerenter')
    const input = wrapper.get('.appearance-theme-naming input')
    await input.setValue('悬停主题')
    await wrapper.get('.appearance-theme-actions').trigger('pointerleave')
    await new Promise(resolve => setTimeout(resolve, 220))
    expect((input.element as HTMLInputElement).value).toBe('悬停主题')
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(source.settings.savedThemePresets).toHaveLength(0)
    await escapeAppearance({ isComposing: true })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await input.trigger('keydown', { key: 'Enter' })
    expect(source.settings.savedThemePresets[0].name).toBe('悬停主题')
    expect(wrapper.find('.appearance-theme-naming').exists()).toBe(false)
  })

  it('uses Enter only for the focused action and updates a selected saved theme directly', async () => {
    const { source, wrapper } = await appearancePage()
    await wrapper.get('[aria-label="选择配置部件"]').setValue('base')
    await wrapper.get('[aria-label="选择 #3B8FD4"]').trigger('click')
    const selector = wrapper.get('[aria-label="选择主题"]')
    expect(selectedText(selector.element as HTMLSelectElement)).toContain('已修改')
    await wrapper.get('[aria-label="十六进制颜色"]').trigger('keydown', { key: 'Enter' })
    expect(source.settings.savedThemePresets).toHaveLength(0)
    await wrapper.get('[aria-label="主题操作"]').trigger('click')
    await wrapper.get('[data-theme-action="saveAs"]').trigger('keydown', { key: 'Enter' })
    await wrapper.get('.appearance-theme-naming input').setValue('我的主题')
    await wrapper.get('.appearance-theme-naming input').trigger('keydown', { key: 'Enter' })
    expect(selectedText(selector.element as HTMLSelectElement)).toBe('我的主题')
    const id = source.settings.savedThemePresets[0].id
    await wrapper.get('[aria-label="选择 #E85A4F"]').trigger('click')
    expect(selectedText(selector.element as HTMLSelectElement)).toBe('我的主题 · 已修改')
    await wrapper.get('[aria-label="主题操作"]').trigger('click')
    await wrapper.get('[data-theme-action="save"]').trigger('keydown', { key: 'Enter' })
    expect(source.settings.savedThemePresets).toHaveLength(1)
    expect(source.settings.savedThemePresets[0]).toMatchObject({ id, name: '我的主题', colors: { water: '#E85A4F' } })
    expect(selectedText(selector.element as HTMLSelectElement)).toBe('我的主题')
  })

  it('unwinds name, menu and edit session with Escape and preserves unrelated external changes', async () => {
    const { source, wrapper } = await appearancePage()
    const originalWater = source.settings.colors.water
    await wrapper.get('[aria-label="选择配置部件"]').setValue('base')
    await wrapper.get('[aria-label="选择 #3B8FD4"]').trigger('click')
    source.settings.colors = { ...source.settings.colors, warning: '#654321' }
    await nextTick()
    await wrapper.get('[aria-label="主题操作"]').trigger('click')
    await wrapper.get('[data-theme-action="saveAs"]').trigger('click')
    await wrapper.get('.appearance-theme-naming input').setValue('尚未保存')
    await escapeAppearance()
    expect(wrapper.get('[role="dialog"]').text()).toContain('主题名称有未保存修改')
    await wrapper.findAll('[role="dialog"] button').find(button => button.text() === '继续编辑')!.trigger('click')
    expect((wrapper.get('.appearance-theme-naming input').element as HTMLInputElement).value).toBe('尚未保存')
    await escapeAppearance()
    await wrapper.findAll('[role="dialog"] button').find(button => button.text() === '放弃名称')!.trigger('click')
    expect(wrapper.find('.appearance-theme-naming').exists()).toBe(false)
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    await escapeAppearance()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    await escapeAppearance()
    expect(wrapper.get('[role="dialog"]').text()).toContain('本次外观有修改')
    await wrapper.findAll('[role="dialog"] button').find(button => button.text() === '恢复修改')!.trigger('click')
    expect(source.settings.colors.water).toBe(originalWater)
    expect(source.settings.colors.warning).toBe('#654321')
    expect((wrapper.get('[aria-label="选择配置部件"]').element as HTMLSelectElement).value).toBe('')
  })

  it('asks before switching and can save the current edits under a name first', async () => {
    const { source, wrapper } = await appearancePage()
    await wrapper.get('[aria-label="选择配置部件"]').setValue('base')
    await wrapper.get('[aria-label="选择 #3B8FD4"]').trigger('click')
    const selector = wrapper.get('[aria-label="选择主题"]')
    const before = (selector.element as HTMLSelectElement).value
    await selector.setValue('builtin:graphite')
    expect(wrapper.get('[role="dialog"]').text()).toContain('切换前处理当前外观')
    await wrapper.findAll('[role="dialog"] button').find(button => button.text() === '继续编辑')!.trigger('click')
    expect((selector.element as HTMLSelectElement).value).toBe(before)
    expect(source.settings.colors.water).toBe('#3B8FD4')
    await selector.setValue('builtin:graphite')
    await wrapper.findAll('[role="dialog"] button').find(button => button.text() === '保存')!.trigger('click')
    await wrapper.get('.appearance-theme-naming input').setValue('切换前')
    await wrapper.get('.appearance-theme-naming input').trigger('keydown', { key: 'Enter' })
    expect(source.settings.savedThemePresets[0]).toMatchObject({ name: '切换前', colors: { water: '#3B8FD4' } })
    expect((selector.element as HTMLSelectElement).value).toBe('builtin:graphite')
    expect(selectedText(selector.element as HTMLSelectElement)).toBe('石墨')
    expect(source.settings.colors.water).toBe('#18212B')
  })

  it('does not switch themes or overwrite a conflicting external value during restore', async () => {
    const { source, wrapper } = await appearancePage()
    await wrapper.get('[aria-label="选择配置部件"]').setValue('base')
    await wrapper.get('[aria-label="选择 #3B8FD4"]').trigger('click')
    const selector = wrapper.get('[aria-label="选择主题"]')
    const before = (selector.element as HTMLSelectElement).value
    source.settings.colors = { ...source.settings.colors, water: '#ABCDEF' }
    await nextTick()
    await selector.setValue('builtin:graphite')
    await wrapper.findAll('[role="dialog"] button').find(button => button.text() === '放弃并切换')!.trigger('click')
    expect(source.settings.colors.water).toBe('#ABCDEF')
    expect((selector.element as HTMLSelectElement).value).toBe(before)
    expect(wrapper.get('[role="alert"]').text()).toContain('已保留这些外部值')
  })

  it('can discard part edits and apply the requested theme', async () => {
    const { source, wrapper } = await appearancePage()
    await wrapper.get('[aria-label="选择配置部件"]').setValue('base')
    await wrapper.get('[aria-label="选择 #3B8FD4"]').trigger('click')
    await wrapper.get('[aria-label="选择主题"]').setValue('builtin:graphite')
    await wrapper.findAll('[role="dialog"] button').find(button => button.text() === '放弃并切换')!.trigger('click')
    expect(source.settings.colors.water).toBe('#18212B')
    expect(selectedText(wrapper.get('[aria-label="选择主题"]').element as HTMLSelectElement)).toBe('石墨')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await escapeAppearance()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('uses the selected theme as the new baseline for subsequent changes', async () => {
    const { source, wrapper } = await appearancePage()
    await wrapper.get('[aria-label="选择主题"]').setValue('builtin:graphite')
    await wrapper.get('[aria-label="选择配置部件"]').setValue('base')
    await wrapper.get('[aria-label="选择 #E85A4F"]').trigger('click')
    await escapeAppearance()
    await wrapper.findAll('[role="dialog"] button').find(button => button.text() === '恢复修改')!.trigger('click')
    expect(source.settings.colors.water).toBe('#18212B')
    expect(selectedText(wrapper.get('[aria-label="选择主题"]').element as HTMLSelectElement)).toBe('石墨')
  })

  it('saves Magpie grid labels with newly saved themes and keeps old presets compatible', async () => {
    const { source, wrapper } = await appearancePage()
    source.settings.magpieQuotaAccess = true
    await nextTick()
    await wrapper.get('[aria-label="选择配置部件"]').setValue('cursorGrid')
    await wrapper.get('.appearance-studio-editor input[maxlength="4"]').setValue('Q')
    await wrapper.get('.appearance-studio-editor input[maxlength="4"]').trigger('change')
    await wrapper.get('[aria-label="主题操作"]').trigger('click')
    await wrapper.get('[data-theme-action="saveAs"]').trigger('click')
    await wrapper.get('.appearance-theme-naming input').setValue('标签主题')
    await wrapper.get('.appearance-theme-naming input').trigger('keydown', { key: 'Enter' })
    const { normalizeCodexSettings } = await import('../../src/domain/codex')
    const normalized = normalizeCodexSettings(source.settings)
    expect(normalized.savedThemePresets[0].magpieQuotaGridCursorPrimaryLabel).toBe('Q')
    expect(normalized.savedThemePresets[0].magpieQuotaGridCursorSecondaryLabel).toBe(source.settings.magpieQuotaGridCursorSecondaryLabel)
    source.settings.magpieQuotaGridCursorPrimaryLabel = 'Z'
    await nextTick()
    await wrapper.get('[aria-label="选择主题"]').setValue('builtin:graphite')
    await wrapper.get('[aria-label="选择主题"]').setValue(`saved:${normalized.savedThemePresets[0].id}`)
    expect(source.settings.magpieQuotaGridCursorPrimaryLabel).toBe('Q')
  })
})
