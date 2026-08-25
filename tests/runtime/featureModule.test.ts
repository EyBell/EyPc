import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FEATURE_MODULES_V7, featureModuleV7 } from '../../src/runtime/feature/featureModules'

describe('FeatureModule V7', () => {
  it('declares one lifecycle policy for every functional tab', () => {
    expect(FEATURE_MODULES_V7.map((module) => module.id)).toEqual([
      'ports', 'mqtt', 'favorites', 'windows', 'codex', 'settings'
    ])
    expect(featureModuleV7('ports').lifecycle.backgroundPolicy).toBe('visible-only')
    expect(featureModuleV7('mqtt').lifecycle.backgroundPolicy).toBe('connected-only')
    expect(featureModuleV7('codex').lifecycle.backgroundPolicy).toBe('entry-enabled')
    expect(featureModuleV7('mqtt').commands.length).toBeGreaterThan(0)
    expect(featureModuleV7('favorites').menuKinds).toContain('drawer')
    expect(featureModuleV7('codex').diagnosticDomains).toContain('companion.kernel')
    expect(featureModuleV7('ports').helpGuideId).toBe('ports')
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
    expect(app).toContain("featureModuleV7(id).createSlice")
    expect(app).toContain("runtime.subscribeDomain('shell'")
    expect(app).toContain('select: selectTabShellRuntimeSliceV7')
    expect(app).toContain('synchronizeFeatureSliceSubscriptions')
    expect(app).toContain('slice.stop()')
    expect(app).not.toContain('runtime.subscribe(() =>')

    const runtime = readFileSync(resolve(process.cwd(), 'src/runtime/appRuntime.ts'), 'utf8')
    expect(runtime).toContain("if (domain === state.activeTab) notifyDomains('shell', domain)")
    expect(runtime).not.toContain("notifyDomains('shell', domain)\n  }")
  })
})
