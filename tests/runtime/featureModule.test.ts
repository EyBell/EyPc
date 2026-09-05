import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FEATURE_CONFIGS, FEATURE_MODULE_IDS } from '../../src/domain/types'
import type { FeatureActionHostV7 } from '../../src/runtime/feature/featureActionHost'
import { FEATURES } from '../../src/runtime/feature/featureRegistry'
import { FEATURE_MODULES_V7, featureModuleV7 } from '../../src/runtime/feature/featureModules'

describe('FeatureModule V7', () => {
  it('declares one contributing module for every functional tab', () => {
    expect(FEATURE_MODULES_V7.map((module) => module.id)).toEqual([
      'ports', 'mqtt', 'favorites', 'windows', 'codex', 'settings'
    ])
    expect(FEATURES.map((feature) => feature.id)).toEqual(FEATURE_MODULES_V7.map((module) => module.id))
    expect(featureModuleV7('ports').lifecycle.backgroundPolicy).toBe('visible-only')
    expect(featureModuleV7('mqtt').lifecycle.backgroundPolicy).toBe('connected-only')
    expect(featureModuleV7('codex').lifecycle.backgroundPolicy).toBe('entry-enabled')
    expect(featureModuleV7('mqtt').commands.length).toBeGreaterThan(0)
    expect(featureModuleV7('mqtt').commands.every((command) => command.actionId.startsWith('mqtt.') || command.profileId === 'mqtt')).toBe(true)
    expect(featureModuleV7('ports').routes.length).toBeGreaterThan(0)
    expect(featureModuleV7('settings').alwaysEnabled).toBe(true)
    expect(typeof featureModuleV7('ports').bindPage).toBe('function')
    expect(typeof featureModuleV7('ports').registerActions).toBe('function')
    expect(typeof featureModuleV7('settings').registerActions).toBe('function')
    expect(typeof featureModuleV7('mqtt').shouldSubscribe).toBe('function')
    expect(readFileSync(resolve(process.cwd(), 'src/runtime/appRuntime.ts'), 'utf8')).toContain('module.registerActions(featureActionHost)')
    expect(readFileSync(resolve(process.cwd(), 'src/runtime/feature/ports/actions.ts'), 'utf8')).toContain("id: 'ports.scan'")
    expect(featureModuleV7('favorites').menuKinds).toContain('drawer')
    expect(featureModuleV7('codex').diagnosticDomains).toContain('companion.kernel')
    expect(featureModuleV7('ports').helpGuideId).toBe('ports')
    expect(new Set(DEFAULT_FEATURE_CONFIGS.map((item) => item.id))).toEqual(new Set(FEATURE_MODULE_IDS))
    expect(DEFAULT_FEATURE_CONFIGS.map((item) => item.sortOrder)).toEqual([1, 2, 3, 4, 5, 6])
    const settingsPage = readFileSync(resolve(process.cwd(), 'src/pages/SettingsPage.vue'), 'utf8')
    expect(settingsPage).toContain("type ShortcutScopeId = 'all' | ShortcutProfileId")
    expect(settingsPage).toContain('return row.profileId === id')
    expect(settingsPage).not.toContain("if (id === 'ports') return row.profileId === 'ports'")
  })

  it('prevents pages and TabShell from depending on the complete AppRuntimeSnapshot contract', () => {
    const files = [
      'src/pages/PortsPage.vue',
      'src/pages/MqttPage.vue',
      'src/pages/FavoritesPage.vue',
      'src/pages/QuickFavoritesPage.vue',
      'src/pages/WindowsPage.vue',
      'src/components/TabShell.vue',
      'src/components/CommandHints.vue'
    ]
    for (const file of files) {
      expect(readFileSync(resolve(process.cwd(), file), 'utf8'), file).not.toContain('AppRuntimeSnapshot')
    }
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    expect(app).toContain('FEATURE_MODULES_V7.map((module) => [module.id, module.createSlice(featureSliceSource)])')
    expect(app).toContain('module.shouldSubscribe')
    expect(app).toContain('.bindPage(')
    expect(app).toContain('runtime.subscribeDomain(\'shell\'')
    expect(app).toContain('select: selectTabShellRuntimeSliceV7')
    expect(app).toContain('synchronizeFeatureSliceSubscriptions')
    expect(app).toContain('featureSlices[id].stop()')
    expect(app).not.toContain('runtime.subscribe(() =>')
    expect(app).not.toContain('<template #ports>')
    expect(readFileSync(resolve(process.cwd(), 'src/components/TabShell.vue'), 'utf8')).not.toContain('name="ports"')

    const runtime = readFileSync(resolve(process.cwd(), 'src/runtime/appRuntime.ts'), 'utf8')
    expect(runtime).toContain("if (domain === state.activeTab) notifyDomains('shell', domain)")
    expect(runtime).not.toContain("notifyDomains('shell', domain)\n  }")
  })

  it('moves setTab mqtt/windows/codex side effects onto optional onTabEnter', () => {
    expect(typeof featureModuleV7('mqtt').onTabEnter).toBe('function')
    expect(typeof featureModuleV7('windows').onTabEnter).toBe('function')
    expect(typeof featureModuleV7('codex').onTabEnter).toBe('function')
    expect(featureModuleV7('ports').onTabEnter).toBeUndefined()
    expect(featureModuleV7('favorites').onTabEnter).toBeUndefined()
    expect(featureModuleV7('settings').onTabEnter).toBeUndefined()

    const ensureMqttArchiveLoaded = vi.fn()
    const refreshWindows = vi.fn()
    const syncActivation = vi.fn()
    const host = { ensureMqttArchiveLoaded, refreshWindows, codexController: { syncActivation } } as unknown as FeatureActionHostV7

    featureModuleV7('mqtt').onTabEnter?.('mqtt', {}, host)
    featureModuleV7('mqtt').onTabEnter?.('ports', {}, host)
    expect(ensureMqttArchiveLoaded).toHaveBeenCalledTimes(1)

    featureModuleV7('windows').onTabEnter?.('windows', {}, host)
    featureModuleV7('windows').onTabEnter?.('windows', { refreshWindows: true }, host)
    expect(refreshWindows).toHaveBeenCalledTimes(1)

    featureModuleV7('codex').onTabEnter?.('codex', {}, host)
    featureModuleV7('codex').onTabEnter?.('ports', {}, host)
    expect(syncActivation.mock.calls).toEqual([[true], [false]])

    const runtime = readFileSync(resolve(process.cwd(), 'src/runtime/appRuntime.ts'), 'utf8')
    expect(runtime).toContain('module.onTabEnter?.(state.activeTab, options, featureActionHost)')
    expect(runtime).not.toContain("if (state.activeTab === 'mqtt') ensureMqttArchiveLoaded()")
    expect(runtime).not.toContain("if (state.activeTab === 'windows' && options.refreshWindows === true) void refreshWindows()")
    expect(runtime).not.toContain("codexController.syncActivation(state.activeTab === 'codex')")
  })

  it('moves global search.focus tab branches onto optional focusSearch', () => {
    expect(typeof featureModuleV7('ports').focusSearch).toBe('function')
    expect(typeof featureModuleV7('mqtt').focusSearch).toBe('function')
    expect(typeof featureModuleV7('favorites').focusSearch).toBe('function')
    expect(featureModuleV7('windows').focusSearch).toBeUndefined()
    expect(featureModuleV7('codex').focusSearch).toBeUndefined()
    expect(featureModuleV7('settings').focusSearch).toBeUndefined()

    const focusPortSearch = vi.fn(() => true)
    const focusFavoriteSearch = vi.fn(() => true)
    const notify = vi.fn()
    const host = {
      focusPortSearch,
      focusFavoriteSearch,
      notify,
      searchFocusTarget: 'ports',
      searchFocusRequestId: 0
    } as unknown as FeatureActionHostV7

    expect(featureModuleV7('ports').focusSearch?.(host)).toBe(true)
    expect(focusPortSearch).toHaveBeenCalledTimes(1)

    expect(featureModuleV7('mqtt').focusSearch?.(host)).toBe(true)
    expect(host.searchFocusTarget).toBe('mqtt')
    expect(host.searchFocusRequestId).toBe(1)
    expect(notify).toHaveBeenCalledTimes(1)

    expect(featureModuleV7('favorites').focusSearch?.(host)).toBe(true)
    expect(focusFavoriteSearch).toHaveBeenCalledTimes(1)

    const runtime = readFileSync(resolve(process.cwd(), 'src/runtime/appRuntime.ts'), 'utf8')
    expect(runtime).toContain('featureModuleV7(state.activeTab).focusSearch?.(featureActionHost)')
    expect(runtime).not.toContain("} else if (state.activeTab === 'mqtt') {")
    expect(runtime).not.toContain("} else if (state.activeTab === 'favorites') {")
  })

  it('moves ports/windows shell DOM focus watches and CommandHints copy onto optional module contributions', () => {
    expect(featureModuleV7('ports').shellDomFocusWatches?.length).toBe(2)
    expect(featureModuleV7('windows').shellDomFocusWatches?.length).toBe(2)
    expect(featureModuleV7('mqtt').shellDomFocusWatches).toBeUndefined()
    expect(featureModuleV7('favorites').shellDomFocusWatches).toBeUndefined()
    expect(featureModuleV7('codex').shellDomFocusWatches).toBeUndefined()
    expect(featureModuleV7('settings').shellDomFocusWatches).toBeUndefined()
    expect(typeof featureModuleV7('ports').commandHints).toBe('function')
    expect(typeof featureModuleV7('mqtt').commandHints).toBe('function')
    expect(typeof featureModuleV7('favorites').commandHints).toBe('function')
    expect(featureModuleV7('windows').commandHints).toBeUndefined()
    expect(featureModuleV7('codex').commandHints).toBeUndefined()
    expect(featureModuleV7('settings').commandHints).toBeUndefined()

    const defaultLabel = (commandId: string, fallback: string) => commandId
    expect(featureModuleV7('ports').commandHints?.({ defaultLabel, modifierHint: 'hint', favoriteQuickMode: false })).toContain('端口默认')
    expect(featureModuleV7('mqtt').commandHints?.({ defaultLabel, modifierHint: 'hint', favoriteQuickMode: false })).toContain('MQTT 默认')
    expect(featureModuleV7('favorites').commandHints?.({ defaultLabel, modifierHint: 'hint', favoriteQuickMode: true })).toContain('快速收藏')
    expect(featureModuleV7('favorites').commandHints?.({ defaultLabel, modifierHint: 'hint', favoriteQuickMode: false })).toContain('收藏默认')

    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    expect(app).toContain('module.shellDomFocusWatches')
    expect(app).not.toContain('watch(() => snapshot.value.groupPanelFocusRequestId')
    expect(app).not.toContain('watch(() => snapshot.value.listFocusRequestId')
    expect(app).not.toContain('watch(() => snapshot.value.windowFocusRequestId')
    expect(app).not.toContain('watch(() => snapshot.value.windowActionsFocusRequestId')

    const hints = readFileSync(resolve(process.cwd(), 'src/components/CommandHints.vue'), 'utf8')
    expect(hints).toContain('commandHints?.({')
    expect(hints).not.toContain("snapshot.state.activeTab === 'ports'")
    expect(hints).not.toContain("snapshot.state.activeTab === 'favorites'")
  })

  it('routes ports page events only through dispatch', () => {
    const bind = readFileSync(resolve(process.cwd(), 'src/runtime/feature/ports/pageBind.ts'), 'utf8')
    const page = readFileSync(resolve(process.cwd(), 'src/pages/PortsPage.vue'), 'utf8')
    expect(bind).toMatch(/on:\s*\{\s*dispatch\b/)
    expect(bind).not.toContain('search: runtime.setPortSearch')
    expect(bind).not.toContain("'group-search'")
    expect(bind).toContain("actionId === 'ports.search.set'")
    expect(bind).toContain('runtime.setPortSearch')
    expect(page).toContain('dispatch: [actionId: string, args?: Record<string, unknown>]')
    expect(page).not.toContain('search: [value: string]')
    expect(page).not.toContain("emit('search'")
    expect(page).not.toContain("emit('focusGroupTarget'")
    expect(page).not.toContain("emit('cancelGroupDraft')")
  })

  it('routes mqtt page events only through dispatch', () => {
    const bind = readFileSync(resolve(process.cwd(), 'src/runtime/feature/mqtt/pageBind.ts'), 'utf8')
    const page = readFileSync(resolve(process.cwd(), 'src/pages/MqttPage.vue'), 'utf8')
    expect(bind).toMatch(/on:\s*\{\s*dispatch\b/)
    expect(bind).not.toContain('search: runtime.setMqttSearch')
    expect(bind).not.toContain("'focus-config'")
    expect(bind).toContain("actionId === 'mqtt.search.set'")
    expect(bind).toContain('runtime.setMqttSearch')
    expect(page).toContain('dispatch: [actionId: string, args?: Record<string, unknown>]')
    expect(page).not.toContain('search: [value: string]')
    expect(page).not.toContain("emit('search'")
    expect(page).not.toContain("emit('focusConfig'")
    expect(page).not.toContain("emit('updateConfigDraft'")
  })

  it('routes favorites and quick-favorites page events only through dispatch', () => {
    const bind = readFileSync(resolve(process.cwd(), 'src/runtime/feature/favorites/pageBind.ts'), 'utf8')
    const page = readFileSync(resolve(process.cwd(), 'src/pages/FavoritesPage.vue'), 'utf8')
    const quickPage = readFileSync(resolve(process.cwd(), 'src/pages/QuickFavoritesPage.vue'), 'utf8')
    expect(bind).toMatch(/on:\s*\{\s*dispatch\b/)
    expect(bind).not.toContain('search: runtime.setFavoriteSearch')
    expect(bind).not.toContain("'group-search'")
    expect(bind).not.toContain('add: runtime.addFavorite')
    expect(bind).toContain("actionId === 'favorites.search.set'")
    expect(bind).toContain('runtime.setFavoriteSearch')
    expect(bind).toContain("actionId === 'favorites.draft.save'")
    expect(bind).not.toContain("actionId === 'favorites.save'")
    expect(page).toContain('dispatch: [actionId: string, args?: Record<string, unknown>]')
    expect(page).not.toContain('search: [value: string]')
    expect(page).not.toContain("emit('search'")
    expect(page).not.toContain("emit('focusGroup'")
    expect(page).not.toContain("emit('saveFavoriteDraft'")
    expect(page).toContain("emit('dispatch', 'favorites.reorder'")
    expect(quickPage).toContain('dispatch: [actionId: string, args?: Record<string, unknown>]')
    expect(quickPage).not.toContain('search: [value: string]')
    expect(quickPage).not.toContain("emit('search'")
    expect(quickPage).not.toContain("emit('focus'")
  })

  it('routes windows page events only through dispatch', () => {
    const bind = readFileSync(resolve(process.cwd(), 'src/runtime/feature/windows/pageBind.ts'), 'utf8')
    const page = readFileSync(resolve(process.cwd(), 'src/pages/WindowsPage.vue'), 'utf8')
    expect(bind).toMatch(/on:\s*\{\s*dispatch\b/)
    expect(bind).not.toContain('search: runtime.setWindowSearch')
    expect(bind).not.toContain("'update-draft'")
    expect(bind).toContain("actionId === 'windows.search.set'")
    expect(bind).toContain('runtime.setWindowSearch')
    expect(bind).toContain("actionId === 'windows.draft.cancel'")
    expect(bind).not.toContain("actionId === 'windows.editor.cancel'")
    expect(page).toContain('dispatch: [actionId: string, args?: Record<string, unknown>]')
    expect(page).not.toContain('search: [value: string]')
    expect(page).not.toContain("emit('search'")
    expect(page).not.toContain("emit('focus'")
    expect(page).not.toContain("emit('cancelDraft'")
  })

  it('routes settings page events only through dispatch', () => {
    const bind = readFileSync(resolve(process.cwd(), 'src/runtime/feature/settings/pageBind.ts'), 'utf8')
    const page = readFileSync(resolve(process.cwd(), 'src/pages/SettingsPage.vue'), 'utf8')
    expect(bind).toMatch(/on:\s*\{\s*dispatch\b/)
    expect(bind).not.toContain("'update-keybinding'")
    expect(bind).not.toContain("'update-settings-path'")
    expect(bind).toContain("actionId === 'settings.path.set'")
    expect(bind).toContain('runtime.setSettingsPath')
    expect(bind).toContain("actionId === 'settings.shortcutProfiles.save'")
    expect(page).toContain('dispatch: [actionId: string, args?: Record<string, unknown>]')
    expect(page).not.toContain('updateKeybinding: [payload: KeybindingUpdatePayload]')
    expect(page).not.toContain("emit('updateSettingsPath'")
    expect(page).not.toContain("emit('saveShortcutProfiles'")
    expect(page).toContain("emit('dispatch', 'tool.preview.hover.update'")
  })

  it('keeps FeaturePageHostV7 dispatch-only without a Record funnel', () => {
    const abi = readFileSync(resolve(process.cwd(), 'src/runtime/feature/featureModule.ts'), 'utf8')
    expect(abi).toContain('export type FeaturePageHostV7 = {')
    expect(abi).not.toContain('} & Record<string, unknown>')
    expect(abi).toContain('dispatch: (actionId: string, args?: Record<string, unknown>) => unknown')
    expect(abi).toMatch(/on:\s*\{\s*dispatch: \(actionId: string, args\?: Record<string, unknown>\) => unknown\s*\}/)
  })
})
