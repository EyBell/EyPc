import { describe, expect, it } from 'vitest'
import { createMqttConnectionConfig } from '../../src/domain/mqtt'
import {
  buildMqttConnectionTreeRows,
  deleteMqttConnectionGroup,
  isValidMqttConnectionGroupParent,
  moveMqttConnectionTreeTarget,
  mqttConnectionTreeMoveTarget
} from '../../src/domain/mqttConnectionTree'
import type { MqttConnectionGroup } from '../../src/domain/types'

const groups: MqttConnectionGroup[] = [
  { id: 'prod', name: '生产', color: '#00A676', parentId: null, sortOrder: 1, createdAt: 1, updatedAt: 1 },
  { id: 'line-a', name: 'A 线', color: '#2F80ED', parentId: 'prod', sortOrder: 1, createdAt: 2, updatedAt: 2 },
  { id: 'ops', name: '运维', color: '#F2994A', parentId: null, sortOrder: 2, createdAt: 3, updatedAt: 3 }
]

const configs = [
  createMqttConnectionConfig({ id: 'root', name: 'Root', url: 'ws://root.example:8083/', sortOrder: 1 }, 100),
  createMqttConnectionConfig({ id: 'plc-a', name: 'PLC A', url: 'ws://a.example:8083/', groupId: 'line-a', sortOrder: 1 }, 101),
  createMqttConnectionConfig({ id: 'ops-a', name: 'Ops A', url: 'ws://ops.example:8083/', groupId: 'ops', sortOrder: 1 }, 102)
]

describe('MQTT connection tree domain', () => {
  it('builds visible group and config rows with hierarchy and collapse state', () => {
    expect(buildMqttConnectionTreeRows(configs, groups).map((row) => [row.kind, row.id, row.depth])).toEqual([
      ['group', 'prod', 0],
      ['group', 'line-a', 1],
      ['config', 'plc-a', 2],
      ['group', 'ops', 0],
      ['config', 'ops-a', 1],
      ['config', 'root', 0]
    ])

    const collapsed = buildMqttConnectionTreeRows(configs, groups, ['prod'])
    expect(collapsed.map((row) => [row.kind, row.id, row.depth, row.collapsed, row.childCount])).toEqual([
      ['group', 'prod', 0, true, 1],
      ['group', 'ops', 0, false, 1],
      ['config', 'ops-a', 1, false, 0],
      ['config', 'root', 0, false, 0]
    ])
  })

  it('moves configs and groups through tree drop targets without mutating inputs', () => {
    const insideTarget = mqttConnectionTreeMoveTarget(configs, groups, { kind: 'config', id: 'root' }, { kind: 'group', id: 'line-a' }, 'inside')
    expect(insideTarget).toEqual({ parentGroupId: 'line-a', beforeTarget: null })

    const insideMove = moveMqttConnectionTreeTarget(configs, groups, { kind: 'config', id: 'root' }, insideTarget!.parentGroupId, insideTarget!.beforeTarget)
    expect(configs.find((config) => config.id === 'root')?.groupId).toBeNull()
    expect(insideMove.configs.filter((config) => config.groupId === 'line-a').map((config) => config.id)).toEqual(['plc-a', 'root'])

    const beforeTarget = mqttConnectionTreeMoveTarget(insideMove.configs, groups, { kind: 'config', id: 'root' }, { kind: 'config', id: 'plc-a' }, 'before')
    expect(beforeTarget).toEqual({ parentGroupId: 'line-a', beforeTarget: { kind: 'config', id: 'plc-a' } })
    const beforeMove = moveMqttConnectionTreeTarget(insideMove.configs, groups, { kind: 'config', id: 'root' }, beforeTarget!.parentGroupId, beforeTarget!.beforeTarget)
    expect(beforeMove.configs.filter((config) => config.groupId === 'line-a').map((config) => config.id)).toEqual(['root', 'plc-a'])

    const groupMove = mqttConnectionTreeMoveTarget(beforeMove.configs, groups, { kind: 'group', id: 'ops' }, { kind: 'group', id: 'line-a' }, 'before')
    expect(groupMove).toEqual({ parentGroupId: 'prod', beforeTarget: { kind: 'group', id: 'line-a' } })
  })

  it('rejects group cycles and promotes direct children when deleting a group', () => {
    expect(isValidMqttConnectionGroupParent(groups, 'prod', 'line-a')).toBe(false)
    expect(mqttConnectionTreeMoveTarget(configs, groups, { kind: 'group', id: 'prod' }, { kind: 'group', id: 'line-a' }, 'inside')).toBeNull()

    const deleted = deleteMqttConnectionGroup(configs, groups, 'prod')
    expect(deleted.groups.map((group) => [group.id, group.parentId])).toEqual([
      ['line-a', null],
      ['ops', null]
    ])
    expect(deleted.configs.find((config) => config.id === 'plc-a')?.groupId).toBe('line-a')
  })
})
