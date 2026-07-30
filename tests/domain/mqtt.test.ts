import { describe, expect, it } from 'vitest'
import {
  appendMqttMessage,
  buildMqttWebSocketUrl,
  createMqttConnectionConfig,
  createMqttSession,
  DEFAULT_MQTT_TOPIC_COLORS,
  createMqttClientId,
  mqttConnectOptionsFromConfig,
  mqttEndpointHostPortLabel,
  mqttTopicVisualForMessage,
  deleteMqttPublishDraftHistory,
  normalizeMqttArchiveState,
  normalizeMqttTopicColor,
  normalizeMqttState,
  parseMqttWebSocketUrl,
  deleteMqttPublishTemplate,
  matchMqttTopicFilter,
  renameMqttPublishDraftHistory,
  renameMqttRecord,
  renameMqttPublishTemplate,
  saveMqttPublishDraftHistory,
  saveMqttPublishTemplate,
  toMqttPublishDraft,
  updateMqttPublishDraftHistory
} from '../../src/domain/mqtt'
import { buildMqttMergedJsonExport, mqttMergedJsonFileName, stringifyMqttMergedJsonExport, stringifyMqttPayloadsCopy, stringifyMqttTopicsCopy, type MqttMergedExportSource } from '../../src/domain/mqttExport'

describe('mqtt domain', () => {
  it('normalizes connection configs with safe defaults and clamped connection options', () => {
    const state = normalizeMqttState({
      configs: [{
        id: 'dev',
        name: '',
        url: ' mqtt://localhost:1883 ',
        clientId: '',
        username: ' demo ',
        password: 'secret',
        token: 'token',
        subscriptions: [' a/# ', '', 'a/#', 'b/+'],
        subscriptionAliases: {
          'a/#': '状态汇总',
          'b/+': ' ',
          'missing/#': '已删除'
        },
        subscriptionColors: {
          'a/#': '#111111',
          'b/+': 'bad-color',
          'missing/#': '#222222'
        },
        publishTopic: ' out ',
        publishTopics: [' out ', 'out/alt', '', 'out'],
        qos: 9,
        retain: true,
        autoReconnect: false,
        reconnectPeriodMs: 20,
        connectTimeoutMs: 200,
        keepaliveSec: 999,
        clean: false,
        reconnectOnConnackError: true,
        resubscribeOnReconnect: false,
        syncRecords: false,
        sortOrder: 4,
        createdAt: -1,
        updatedAt: -1
      }]
    }, 100)

    expect(state.activeConfigId).toBe('dev')
    expect(state.configs).toEqual([{
      id: 'dev',
      name: 'ws://localhost:1883',
      url: 'ws://localhost:1883',
      clientId: expect.stringMatching(/^eypc_/),
      username: 'demo',
      groupId: null,
      subscriptions: ['a/#', 'b/+'],
      subscriptionAliases: {
        'a/#': '状态汇总'
      },
      subscriptionColors: {
        'a/#': '#111111',
        'b/+': DEFAULT_MQTT_TOPIC_COLORS[1]
      },
      publishTopic: 'out',
      publishTopics: ['out', 'out/alt'],
      qos: 0,
      retain: true,
      autoReconnect: false,
      reconnectPeriodMs: 500,
      connectTimeoutMs: 3000,
      keepaliveSec: 300,
      clean: false,
      reconnectOnConnackError: true,
      resubscribeOnReconnect: false,
      syncRecords: false,
      sortOrder: 1,
      createdAt: 100,
      updatedAt: 100
    }])
    expect(JSON.stringify(state)).not.toContain('secret')
    expect(JSON.stringify(state)).not.toContain('token')
  })

  it('creates MQTT client ids with the shared eypc prefix format', () => {
    expect(createMqttClientId(100)).toMatch(/^eypc_2s_[0-9a-f]{6}$/)
  })

  it('normalizes MQTT view preferences and prunes per-connection topic filters', () => {
    const state = normalizeMqttState({
      activeConfigId: 'dev',
      configs: [
        { id: 'dev', name: 'Dev', url: 'ws://localhost:8083/mqtt', subscriptions: ['plc/+/status', 'plc/+/cmd'] },
        { id: 'other', name: 'Other', url: 'ws://other:8083/mqtt', subscriptions: ['other/#'] }
      ],
      viewPrefs: {
        infoFilter: 'favorites',
        activeSubscriptionTopicsByConfigId: {
          dev: ['plc/+/cmd', 'missing/#', 'plc/+/cmd'],
          other: ['other/#'],
          stale: ['stale/#']
        }
      }
    }, 100)

    expect(state.viewPrefs).toEqual({
      infoFilter: 'favorites',
      activeSubscriptionTopicsByConfigId: {
        dev: ['plc/+/cmd'],
        other: ['other/#']
      }
    })
    expect(normalizeMqttState({ viewPrefs: { infoFilter: 'bad' } }, 100).viewPrefs).toEqual({
      infoFilter: 'incoming',
      activeSubscriptionTopicsByConfigId: {}
    })
  })

  it('builds MQTT.js connect options from persisted config and session-only secret', () => {
    const config = createMqttConnectionConfig({
      id: 'dev',
      name: 'Dev',
      url: 'wss://broker.example/mqtt',
      clientId: 'client-a',
      username: 'user-a',
      autoReconnect: true,
      reconnectPeriodMs: 2500,
      connectTimeoutMs: 9000,
      keepaliveSec: 30,
      clean: true,
      reconnectOnConnackError: true,
      resubscribeOnReconnect: true
    }, 100)

    expect(mqttConnectOptionsFromConfig(config, 'session-secret')).toEqual({
      clientId: 'client-a',
      username: 'user-a',
      password: 'session-secret',
      clean: true,
      reconnectPeriod: 2500,
      connectTimeout: 9000,
      keepalive: 30,
      reconnectOnConnackError: true,
      resubscribe: true
    })

    expect(mqttConnectOptionsFromConfig({ ...config, autoReconnect: false }, '')).toMatchObject({
      reconnectPeriod: 0
    })
  })

  it('parses and assembles websocket endpoint fields for config editing', () => {
    expect(parseMqttWebSocketUrl('wss://ainongyun.net:8083/mqtt')).toEqual({
      protocol: 'wss',
      host: 'ainongyun.net',
      port: '8083',
      path: '/mqtt',
      ssl: true
    })

    expect(buildMqttWebSocketUrl({
      protocol: 'ws',
      host: 'ainongyun.net',
      port: '8083',
      path: '/'
    })).toBe('ws://ainongyun.net:8083/')

    expect(buildMqttWebSocketUrl({
      protocol: 'ws',
      host: 'ainongyun.net',
      port: '',
      path: 'mqtt',
      ssl: true
    })).toBe('wss://ainongyun.net:8083/mqtt')

    expect(mqttEndpointHostPortLabel('wss://broker.example:8083/mqtt')).toBe('broker.example:8083')
    expect(mqttEndpointHostPortLabel('ws://localhost/mqtt')).toBe('localhost')
    expect(mqttEndpointHostPortLabel('broker.example:1883')).toBe('broker.example:1883')
  })

  it('normalizes MQTT layout preferences separately from shared tool preview preferences', () => {
    expect(normalizeMqttState(null, 100).layoutPrefs).toMatchObject({
      workspaceLayout: 'stack',
      stackReceiveRatio: 0.58,
      splitReceiveRatio: 0.55,
      connectionPanelOpen: true,
      subscriptionPanelOpen: true,
      publishRecordsOpen: false
    })

    expect(normalizeMqttState({
      layoutPrefs: {
        workspaceLayout: 'split',
        stackReceiveRatio: 0.9,
        splitReceiveRatio: 0.1,
        connectionPanelOpen: false,
        subscriptionPanelOpen: false,
        publishRecordsOpen: true,
        hoverPreviewEnabled: true
      }
    }, 100).layoutPrefs).toMatchObject({
      workspaceLayout: 'split',
      stackReceiveRatio: 0.72,
      splitReceiveRatio: 0.28,
      connectionPanelOpen: false,
      subscriptionPanelOpen: false,
      publishRecordsOpen: true
    })
  })

  it('normalizes MQTT connection groups, hierarchy, and per-connection group references', () => {
    const state = normalizeMqttState({
      connectionGroups: [
        { id: 'root', name: ' Root ', color: '#111111', parentId: null, sortOrder: 2, createdAt: 1, updatedAt: 1 },
        { id: 'child', name: 'Child', color: 'bad', parentId: 'root', sortOrder: 1, createdAt: 2, updatedAt: 2 },
        { id: 'cycle', name: 'Cycle', color: '#222222', parentId: 'cycle', sortOrder: 3, createdAt: 3, updatedAt: 3 },
        { id: 'invalid-parent', name: 'Invalid', color: '#333333', parentId: 'missing', sortOrder: 4, createdAt: 4, updatedAt: 4 },
        { id: '', name: 'Dropped', color: '#444444', parentId: null, sortOrder: 5 }
      ],
      configs: [
        { id: 'a', name: 'A', url: 'ws://a.example:8083/', groupId: 'child', sortOrder: 1 },
        { id: 'b', name: 'B', url: 'ws://b.example:8083/', groupId: 'missing', sortOrder: 2 }
      ],
      layoutPrefs: {
        collapsedConnectionGroupIds: ['child', 'missing']
      }
    }, 100)

    expect(state.connectionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      parentId: group.parentId,
      color: group.color,
      sortOrder: group.sortOrder
    }))).toEqual([
      { id: 'root', name: 'Root', parentId: null, color: '#111111', sortOrder: 1 },
      { id: 'child', name: 'Child', parentId: 'root', color: '#2F80ED', sortOrder: 1 },
      { id: 'cycle', name: 'Cycle', parentId: null, color: '#222222', sortOrder: 2 },
      { id: 'invalid-parent', name: 'Invalid', parentId: null, color: '#333333', sortOrder: 3 }
    ])
    expect(state.configs.map((config) => [config.id, config.groupId, config.sortOrder])).toEqual([
      ['b', null, 1],
      ['a', 'child', 1]
    ])
    expect(state.layoutPrefs.collapsedConnectionGroupIds).toEqual(['child'])
  })

  it('normalizes MQTT connection snapshots in archive without secrets', () => {
    const archive = normalizeMqttArchiveState({
      version: 1,
      connectionSnapshots: [{
        id: 'dev',
        name: ' Dev ',
        url: 'mqtt://localhost:1883',
        clientId: 'client-a',
        username: 'user-a',
        password: 'secret',
        token: 'token',
        publishTopic: ' out ',
        publishTopics: [' out ', 'alt/out', 'out'],
        qos: 2,
        retain: true,
        syncRecords: false,
        createdAt: -1,
        updatedAt: -1
      }],
      sessions: [],
      publishTemplates: []
    }, 100)

    expect(archive.connectionSnapshots).toEqual([{
      id: 'dev',
      name: 'Dev',
      url: 'ws://localhost:1883',
      clientId: 'client-a',
      username: 'user-a',
      publishTopic: 'out',
      publishTopics: ['out', 'alt/out'],
      qos: 2,
      retain: true,
      syncRecords: false,
      createdAt: 100,
      updatedAt: 100
    }])
    expect(JSON.stringify(archive)).not.toContain('secret')
    expect(JSON.stringify(archive)).not.toContain('token')
  })

  it('normalizes and manages MQTT publish draft history with dedupe and template promotion', () => {
    let archive = normalizeMqttArchiveState({
      publishDraftHistory: [
        { id: 'old', connectionId: 'dev', title: 'Old', topic: ' out ', payload: 'same', qos: 9, retain: true, source: 'overwrite', createdAt: 1, updatedAt: 2 },
        { id: 'dup', connectionId: 'dev', title: 'Dup', topic: 'out', payload: 'same', qos: 1, retain: false, source: 'manual', createdAt: 3, updatedAt: 5 },
        { id: 'other', connectionId: 'other', topic: 'out', payload: 'same', qos: 0, retain: false, source: 'manual', createdAt: 4, updatedAt: 4 }
      ]
    }, 10)

    expect(archive.publishDraftHistory).toEqual([
      expect.objectContaining({ id: 'dup', connectionId: 'dev', title: 'Dup', topic: 'out', payload: 'same', qos: 1, retain: false, source: 'manual', updatedAt: 5 }),
      expect.objectContaining({ id: 'other', connectionId: 'other', topic: 'out', payload: 'same', updatedAt: 4 })
    ])

    archive = saveMqttPublishDraftHistory(archive, {
      connectionId: 'dev',
      title: 'Manual',
      topic: ' out ',
      payload: 'same',
      qos: 2,
      retain: true,
      source: 'manual'
    }, 20)
    expect(archive.publishDraftHistory).toHaveLength(2)
    expect(archive.publishDraftHistory[0]).toMatchObject({
      id: 'dup',
      title: 'Manual',
      topic: 'out',
      payload: 'same',
      qos: 2,
      retain: true,
      source: 'manual',
      createdAt: 3,
      updatedAt: 20
    })

    const historyId = archive.publishDraftHistory[0].id
    archive = renameMqttPublishDraftHistory(archive, historyId, { title: 'Renamed', note: 'keep' }, 30)
    expect(archive.publishDraftHistory[0]).toMatchObject({ title: 'Renamed', note: 'keep', updatedAt: 30 })

    archive = updateMqttPublishDraftHistory(archive, historyId, {
      title: 'Edited',
      topic: ' edited/topic ',
      payload: 'edited-payload',
      qos: 1,
      retain: false
    }, 35)
    expect(archive.publishDraftHistory[0]).toMatchObject({
      id: historyId,
      title: 'Edited',
      topic: 'edited/topic',
      payload: 'edited-payload',
      qos: 1,
      retain: false,
      updatedAt: 35
    })

    archive = saveMqttPublishTemplate(archive, {
      connectionId: 'dev',
      title: 'Favorite',
      topic: archive.publishDraftHistory[0].topic,
      payload: archive.publishDraftHistory[0].payload,
      qos: archive.publishDraftHistory[0].qos,
      retain: archive.publishDraftHistory[0].retain
    }, 40)
    archive = saveMqttPublishTemplate(archive, {
      connectionId: 'dev',
      title: 'Favorite Updated',
      topic: 'edited/topic',
      payload: 'edited-payload',
      qos: 0,
      retain: false
    }, 50)
    expect(archive.publishTemplates).toHaveLength(1)
    expect(archive.publishTemplates[0]).toMatchObject({ title: 'Favorite Updated', topic: 'edited/topic', payload: 'edited-payload', qos: 0, retain: false, updatedAt: 50 })

    archive = deleteMqttPublishDraftHistory(archive, historyId)
    expect(archive.publishDraftHistory.map((item) => item.id)).toEqual(['other'])
  })

  it('archives messages by session, trims retention, renames metadata, and prepares resend drafts', () => {
    let archive = normalizeMqttArchiveState({ sessions: [] }, 100)
    const session = createMqttSession('dev', 100)
    archive = normalizeMqttArchiveState({ sessions: [session] }, 100)

    for (let index = 0; index < 505; index += 1) {
      archive = appendMqttMessage(archive, {
        id: `msg-${index}`,
        connectionId: 'dev',
        sessionId: session.id,
        direction: index % 2 ? 'incoming' : 'outgoing',
        topic: `demo/${index}`,
        payload: `payload-${index}`,
        qos: 1,
        retain: false,
        timestamp: 100 + index
      })
    }

    expect(archive.sessions).toHaveLength(1)
    expect(archive.sessions[0].messages).toHaveLength(500)
    expect(archive.sessions[0].messages[0].id).toBe('msg-5')

    archive = renameMqttRecord(archive, { kind: 'message', id: 'msg-504' }, { title: 'Latest', note: 'keep raw payload' })
    const latest = archive.sessions[0].messages.at(-1)
    expect(latest).toMatchObject({
      id: 'msg-504',
      title: 'Latest',
      note: 'keep raw payload',
      topic: 'demo/504',
      payload: 'payload-504'
    })
    expect(toMqttPublishDraft(latest!)).toEqual({
      topic: 'demo/504',
      payload: 'payload-504',
      qos: 1,
      retain: false
    })
  })

  it('matches MQTT topic filters with exact, single-level, and multi-level wildcards', () => {
    expect(matchMqttTopicFilter('plc/czz060301/status', 'plc/czz060301/status')).toBe(true)
    expect(matchMqttTopicFilter('plc/czz060301/status', 'plc/+/status')).toBe(true)
    expect(matchMqttTopicFilter('plc/czz060301/status', 'plc/#')).toBe(true)
    expect(matchMqttTopicFilter('plc/czz060301/status', '#')).toBe(true)
    expect(matchMqttTopicFilter('plc/czz060301/status', 'plc/+/set')).toBe(false)
    expect(matchMqttTopicFilter('plc/czz060301/status', 'plc/+')).toBe(false)
  })

  it('normalizes MQTT topic colors and resolves the best subscription visual match', () => {
    expect(normalizeMqttTopicColor('#111111')).toBe('#111111')
    expect(normalizeMqttTopicColor('#ABCDEF')).toBe('#ABCDEF')
    expect(normalizeMqttTopicColor(' #abcdef ')).toBe('#abcdef')
    expect(normalizeMqttTopicColor('red', 2)).toBe(DEFAULT_MQTT_TOPIC_COLORS[2])

    const config = createMqttConnectionConfig({
      id: 'dev',
      name: 'Dev',
      url: 'ws://broker.example:8083/',
      subscriptions: ['plc/#', 'plc/+/status', 'plc/czz060301/status'],
      subscriptionAliases: {
        'plc/#': '全部 PLC',
        'plc/+/status': '状态汇总',
        'plc/czz060301/status': '手动状态'
      },
      subscriptionColors: {
        'plc/#': '#111111',
        'plc/+/status': '#222222',
        'plc/czz060301/status': '#333333'
      }
    }, 100)

    expect(mqttTopicVisualForMessage('plc/czz060301/status', config)).toEqual({
      topic: 'plc/czz060301/status',
      alias: '手动状态',
      color: '#333333'
    })
    expect(mqttTopicVisualForMessage('plc/other/status', config)).toEqual({
      topic: 'plc/+/status',
      alias: '状态汇总',
      color: '#222222'
    })
    expect(mqttTopicVisualForMessage('other/status', config)).toEqual({
      topic: null,
      alias: '',
      color: DEFAULT_MQTT_TOPIC_COLORS[0]
    })
  })

  it('normalizes, renames, deletes, and applies MQTT publish templates', () => {
    let archive = normalizeMqttArchiveState({
      version: 1,
      sessions: [],
      publishTemplates: [{
        id: 'tpl-a',
        connectionId: 'dev',
        title: '',
        note: ' latest ',
        topic: ' demo/out ',
        payload: 'hello',
        qos: 9,
        retain: true,
        createdAt: -1,
        updatedAt: -1
      }]
    }, 100)

    expect(archive.publishTemplates).toEqual([{
      id: 'tpl-a',
      connectionId: 'dev',
      title: '',
      note: 'latest',
      topic: 'demo/out',
      payload: 'hello',
      qos: 0,
      retain: true,
      createdAt: 100,
      updatedAt: 100,
      operatedAt: 100
    }])

    archive = saveMqttPublishTemplate(archive, {
      connectionId: 'dev',
      title: 'Status',
      topic: 'plc/status',
      payload: '{"ok":true}',
      qos: 1,
      retain: false
    }, 200)
    const saved = archive.publishTemplates.find((item) => item.title === 'Status')
    expect(saved).toMatchObject({ connectionId: 'dev', topic: 'plc/status', payload: '{"ok":true}', qos: 1 })
    expect(toMqttPublishDraft(saved!)).toEqual({ topic: 'plc/status', payload: '{"ok":true}', qos: 1, retain: false })

    archive = saveMqttPublishTemplate(archive, {
      connectionId: 'dev',
      title: '',
      topic: 'plc/no-alias',
      payload: 'empty-title'
    }, 250)
    expect(archive.publishTemplates.find((item) => item.topic === 'plc/no-alias')).toMatchObject({ title: '' })

    archive = renameMqttPublishTemplate(archive, saved!.id, { title: 'Status Check', note: 'manual' }, 300)
    expect(archive.publishTemplates.find((item) => item.id === saved!.id)).toMatchObject({ title: 'Status Check', note: 'manual', updatedAt: 300 })

    archive = deleteMqttPublishTemplate(archive, saved!.id)
    expect(archive.publishTemplates.some((item) => item.id === saved!.id)).toBe(false)
  })

  it('sorts MQTT publish templates by latest operation time with updatedAt fallback', () => {
    const archive = normalizeMqttArchiveState({
      publishTemplates: [
        { id: 'old', connectionId: 'dev', title: 'Old', topic: 'plc/old', payload: 'old', qos: 0, retain: false, createdAt: 1, updatedAt: 30 },
        { id: 'used', connectionId: 'dev', title: 'Used', topic: 'plc/used', payload: 'used', qos: 0, retain: false, createdAt: 2, updatedAt: 10, operatedAt: 50 },
        { id: 'edited', connectionId: 'dev', title: 'Edited', topic: 'plc/edited', payload: 'edited', qos: 0, retain: false, createdAt: 3, updatedAt: 40 }
      ]
    }, 100)

    expect(archive.publishTemplates.map((item) => item.id)).toEqual(['used', 'edited', 'old'])
    expect(archive.publishTemplates[0]).toMatchObject({ id: 'used', operatedAt: 50 })
    expect(archive.publishTemplates[1]).toMatchObject({ id: 'edited', operatedAt: 40 })
  })

  it('builds a lossless merged JSON export for selected MQTT records', () => {
    const records: MqttMergedExportSource[] = [
      {
        id: 'incoming-1',
        connectionId: 'dev',
        sessionId: 'session-1',
        direction: 'incoming' as const,
        topic: 'plc/status',
        payload: '{"ok":true,"value":12}',
        qos: 1 as const,
        retain: false,
        timestamp: 1_000,
        title: 'Status',
        note: 'diagnostic'
      },
      {
        id: 'template-1',
        connectionId: 'dev',
        title: 'Reset',
        topic: 'plc/reset',
        payload: 'reset=1',
        qos: 0 as const,
        retain: true,
        createdAt: 1_100,
        updatedAt: 1_200,
        operatedAt: 1_300
      }
    ]

    expect(buildMqttMergedJsonExport(records, 2_000)).toEqual({
      schema: 'eypc-mqtt-merged-export/v1',
      exportedAt: '1970-01-01T00:00:02.000Z',
      count: 2,
      records: [
        {
          kind: 'message',
          direction: 'incoming',
          topic: 'plc/status',
          payload: '{"ok":true,"value":12}',
          payloadFormat: 'json',
          payloadJson: { ok: true, value: 12 },
          qos: 1,
          retain: false,
          occurredAt: '1970-01-01T00:00:01.000Z',
          title: 'Status',
          note: 'diagnostic'
        },
        {
          kind: 'template',
          topic: 'plc/reset',
          payload: 'reset=1',
          payloadFormat: 'text',
          qos: 0,
          retain: true,
          occurredAt: '1970-01-01T00:00:01.300Z',
          title: 'Reset'
        }
      ]
    })
    expect(stringifyMqttMergedJsonExport(records, 2_000)).toMatch(/\n$/)
    expect(stringifyMqttTopicsCopy(records)).toBe('plc/status\nplc/reset')
    expect(stringifyMqttPayloadsCopy(records)).toBe('{"ok":true,"value":12}\n\nreset=1')
    expect(mqttMergedJsonFileName(2_000)).toBe('mqtt-merged-1970-01-01T00-00-02Z.json')
  })
})
