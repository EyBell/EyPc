import { describe, expect, it } from 'vitest'
import { createNavigationIntentV7, featureTargetRefForCommandV7 } from '../../src/runtime/navigation/navigationIntent'

describe('FeatureTargetRefV7 and NavigationIntentV7', () => {
  it('normalizes a public record target without carrying private aliases', () => {
    const target = featureTargetRefForCommandV7({
      commandId: 'mqtt.record.edit',
      featureId: 'mqtt',
      args: { recordId: 'message-42', targetAlias: 'private-host-alias' }
    })
    expect(target).toEqual({ featureId: 'mqtt', surfaceId: 'main', kind: 'record', key: 'message-42' })
    expect(JSON.stringify(target)).not.toContain('private-host-alias')
  })

  it('keeps exact production target ids for targetId and multi-selection argument shapes', () => {
    expect(featureTargetRefForCommandV7({
      commandId: 'mqtt.config.edit',
      featureId: 'mqtt',
      args: { targetKind: 'config', targetId: 'dev-a' }
    })).toEqual({ featureId: 'mqtt', surfaceId: 'main', kind: 'mqtt-config', key: 'dev-a' })

    expect(featureTargetRefForCommandV7({
      commandId: 'favorites.copyItems',
      featureId: 'favorites',
      args: { favoriteIds: ['f2', 'f1'] }
    })).toEqual({ featureId: 'favorites', surfaceId: 'main', kind: 'favorite', key: 'f2', keys: ['f2', 'f1'] })

    expect(featureTargetRefForCommandV7({
      commandId: 'mqtt.connectionGroup.create',
      featureId: 'mqtt',
      args: { groupId: 'parent-group', parentId: 'parent-group', targetKind: 'connection-group' }
    })).toEqual({ featureId: 'mqtt', surfaceId: 'main', kind: 'mqtt-connection-group', key: 'parent-group' })
  })

  it('creates one immutable intent for button, menu, shortcut and QuickJump consumers', () => {
    const intent = createNavigationIntentV7({
      commandId: 'codex.task.open',
      target: { featureId: 'codex', surfaceId: 'float', kind: 'task', key: 'public-task-key' },
      source: 'quick-jump',
      disposition: 'open'
    })
    expect(intent).toMatchObject({ revision: 'navigation-intent-v7', source: 'quick-jump', disposition: 'open' })
    expect(Object.isFrozen(intent)).toBe(true)
    expect(Object.isFrozen(intent.target)).toBe(true)
  })
})
