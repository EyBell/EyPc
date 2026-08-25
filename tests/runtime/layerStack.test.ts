import { describe, expect, it } from 'vitest'
import { resolveLayerStackV7 } from '../../src/runtime/command/layerStack'

describe('LayerStack V7', () => {
  it('derives the stack from runtime facts without storing a second mutable layer state', () => {
    const stack = resolveLayerStackV7({
      tab: 'favorites',
      activeInputRole: 'favorite-search',
      favoriteRunPromptOpen: true,
      favoriteDrawerOpen: true,
      favoriteDrawerActive: true
    })

    expect(stack.ids).toEqual(expect.arrayContaining([
      'app',
      'favorites-run-prompt',
      'favorites-drawer',
      'favorites-search',
      'favorites',
      'global'
    ]))
    expect(stack.top).toBe('favorites-run-prompt')
    expect(stack.topInteractive).toBe('favorites-run-prompt')
    expect(stack.modal).toBe('favorites-run-prompt')
    expect(stack.blockingLayer).toBe('favorites-run-prompt')
    expect(stack.interactiveIds).toEqual(['app', 'favorites-run-prompt'])
  })

  it('keeps explicit surface layers additive with tab and global layers', () => {
    const stack = resolveLayerStackV7({ tab: 'codex', activeLayers: ['codex-quick-jump'] })
    expect(stack.ids).toEqual(expect.arrayContaining(['app', 'codex-quick-jump', 'codex', 'global']))
    expect(stack.interactiveIds).toEqual(stack.ids)
    expect(stack.topInteractive).toBe('codex-quick-jump')
  })

  it('keeps a nested modal editor and its parent transaction interactive', () => {
    const stack = resolveLayerStackV7({
      tab: 'mqtt',
      activeInputRole: 'mqtt-config-subscription-editor'
    })

    expect(stack.modal).toBe('mqtt-config-subscription-editor')
    expect(stack.topInteractive).toBe('mqtt-config-subscription-editor')
    expect(stack.interactiveIds).toContain('mqtt-editor')
    expect(stack.interactiveIds).toContain('mqtt-config-subscription-editor')
    expect(stack.interactiveIds).not.toContain('mqtt')
    expect(stack.interactiveIds).not.toContain('global')
  })
})
