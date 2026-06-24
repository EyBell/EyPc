import { describe, expect, it } from 'vitest'
import {
  appendMqttMessage,
  buildMqttWebSocketUrl,
  createMqttConnectionConfig,
  createMqttSession,
  mqttConnectOptionsFromConfig,
  normalizeMqttArchiveState,
  normalizeMqttState,
  parseMqttWebSocketUrl,
  deleteMqttPublishTemplate,
  matchMqttTopicFilter,
  renameMqttRecord,
  renameMqttPublishTemplate,
  saveMqttPublishTemplate,
  toMqttPublishDraft
} from '../../src/domain/mqtt'

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
        publishTopic: ' out ',
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
      subscriptions: ['a/#', 'b/+'],
      subscriptionAliases: {
        'a/#': '状态汇总'
      },
      publishTopic: 'out',
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
      qos: 2,
      retain: true,
      syncRecords: false,
      createdAt: 100,
      updatedAt: 100
    }])
    expect(JSON.stringify(archive)).not.toContain('secret')
    expect(JSON.stringify(archive)).not.toContain('token')
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
      title: 'demo/out',
      note: 'latest',
      topic: 'demo/out',
      payload: 'hello',
      qos: 0,
      retain: true,
      createdAt: 100,
      updatedAt: 100
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

    archive = renameMqttPublishTemplate(archive, saved!.id, { title: 'Status Check', note: 'manual' }, 300)
    expect(archive.publishTemplates.find((item) => item.id === saved!.id)).toMatchObject({ title: 'Status Check', note: 'manual', updatedAt: 300 })

    archive = deleteMqttPublishTemplate(archive, saved!.id)
    expect(archive.publishTemplates.some((item) => item.id === saved!.id)).toBe(false)
  })
})
