import { describe, expect, it } from 'vitest'
import { buildActionMenuModelV7 } from '../../src/runtime/action/actionMenu'

describe('ActionMenuModel V7', () => {
  it('projects button, context-menu, More, and drawer invocations through one resolver', () => {
    const invocations = [
      { commandId: 'task.open', args: { taskKey: 'anonymous:1' } },
      { commandId: 'task.archive', title: '归档', args: { taskKey: 'anonymous:1' } }
    ]
    const resolver = {
      command(commandId: string) {
        return commandId === 'task.open'
          ? { title: '打开', description: '打开当前任务', icon: 'external-link', risk: 'normal' as const, available: true }
          : { title: '归档任务', description: '从活动列表移除', icon: 'archive', risk: 'destructive' as const, available: false }
      },
      shortcutLabel: (commandId: string) => commandId === 'task.open' ? 'cr' : ''
    }

    const menu = buildActionMenuModelV7(invocations, resolver)
    expect(menu[0]).toMatchObject({ commandId: 'task.open', title: '打开', shortcutLabel: 'cr', enabled: true, args: { taskKey: 'anonymous:1' } })
    expect(menu[1]).toMatchObject({ commandId: 'task.archive', title: '归档', risk: 'destructive', enabled: false })
  })

  it('carries one immutable navigation intent through the shared menu item', () => {
    const [item] = buildActionMenuModelV7([{
      commandId: 'favorites.open',
      args: { favoriteId: 'f1' },
      target: { featureId: 'favorites', surfaceId: 'main', kind: 'favorite', key: 'f1' },
      source: 'context-menu' as const,
      disposition: 'open' as const
    }], {
      command: () => ({ title: '打开', risk: 'normal', available: true }),
      shortcutLabel: () => 'Enter'
    })
    expect(item.navigationIntent).toMatchObject({
      revision: 'navigation-intent-v7',
      commandId: 'favorites.open',
      source: 'context-menu',
      disposition: 'open',
      target: { key: 'f1' }
    })
    expect(Object.isFrozen(item.navigationIntent)).toBe(true)
  })
})
