// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createQuickJumpRegistryV7, defaultQuickJumpTargetVisibleV7, quickJumpCommandTargetV7 } from '../../src/ui/quickJumpRegistry'

function visible(element: HTMLElement, left: number) {
  element.style.display = 'block'
  element.style.visibility = 'visible'
  element.style.opacity = '1'
  element.style.pointerEvents = 'auto'
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: left, y: 10, left, top: 10, right: left + 40, bottom: 34, width: 40, height: 24, toJSON: () => ({})
  })
}

describe('QuickJumpRegistry V7', () => {
  it('merges explicit registrations with one shared DOM fallback and keeps stable target ids', () => {
    const root = document.createElement('main')
    const explicit = document.createElement('button')
    explicit.textContent = 'Explicit'
    explicit.dataset.quickJumpTarget = ''
    const fallback = document.createElement('button')
    fallback.textContent = 'Fallback'
    fallback.dataset.quickJumpTarget = ''
    root.append(explicit, fallback)
    document.body.append(root)
    visible(explicit, 10)
    visible(fallback, 60)
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: (x: number) => x < 50 ? [explicit, root] : [fallback, root]
    })

    const registry = createQuickJumpRegistryV7({ surfaceId: 'test', root: () => root })
    registry.register(explicit, { id: 'explicit-id', label: '已注册', searchText: 'registered' })
    const targets = registry.collect({ accept: defaultQuickJumpTargetVisibleV7 })

    expect(targets).toHaveLength(2)
    expect(targets[0]).toMatchObject({ id: 'explicit-id', label: '已注册', searchText: 'registered' })
    expect(targets[1].id).toContain('test:')
    expect(targets.map((target) => target.marker)).toEqual(['a', 's'])
  })

  it('keeps semantic identity across label and order changes and replaces registrations safely', () => {
    const root = document.createElement('main')
    const control = document.createElement('button')
    const row = document.createElement('article')
    control.dataset.quickJumpTarget = ''
    root.append(control, row)
    const registry = createQuickJumpRegistryV7({ surfaceId: 'main', root: () => root })
    const args = { kind: 'message', id: 'message-42', targetKind: 'message', targetId: 'message-42', list: 'history' }
    const registration = quickJumpCommandTargetV7({ featureId: 'mqtt', commandId: 'mqtt.record.focus', args, label: 'Original', occurrence: 'history' })
    const dispose = registry.register(row, registration)
    registry.register(row, quickJumpCommandTargetV7({ featureId: 'mqtt', commandId: 'mqtt.record.focus', args, label: 'Updated', occurrence: 'history' }))
    dispose()

    const [fallback, target] = registry.collect({ domOrder: true })
    expect(fallback.element).toBe(control)
    expect(target).toMatchObject({
      id: registration.id,
      label: 'Updated',
      invocation: {
        args,
        intent: {
          commandId: 'mqtt.record.focus',
          source: 'quick-jump',
          target: { featureId: 'mqtt', surfaceId: 'main', kind: 'mqtt-message', key: 'message-42' }
        }
      }
    })
    expect(registry.collect({ domOrder: true, backward: true })[0].id).toBe(registration.id)
    row.remove()
    expect(registry.collect()).toHaveLength(1)
  })
})
