import type { MqttArchiveState, MqttConnectionConfig, MqttConnectionSnapshot, MqttLayoutPrefs, MqttMessageRecord, MqttPublishDraft, MqttPublishTemplate, MqttQos, MqttSessionRecord, MqttState, MqttWorkspaceLayout } from './types'

export const MQTT_ARCHIVE_SESSION_LIMIT = 50
export const MQTT_ARCHIVE_MESSAGE_LIMIT = 500
export const MQTT_PUBLISH_TEMPLATE_LIMIT = 100

const DEFAULT_QOS: MqttQos = 0
const DEFAULT_RECONNECT_PERIOD_MS = 3000
const DEFAULT_CONNECT_TIMEOUT_MS = 10000
const DEFAULT_KEEPALIVE_SEC = 60
const DEFAULT_WEBSOCKET_PORT = '8083'
export const DEFAULT_MQTT_LAYOUT_PREFS: MqttLayoutPrefs = {
  workspaceLayout: 'stack',
  stackReceiveRatio: 0.58,
  splitReceiveRatio: 0.55,
  connectionPanelOpen: true,
  subscriptionPanelOpen: true,
  publishRecordsOpen: false
}
export const MQTT_LAYOUT_RATIO_MIN = 0.28
export const MQTT_LAYOUT_RATIO_MAX = 0.72

export type MqttWebSocketProtocol = 'ws' | 'wss'

export interface MqttWebSocketEndpoint {
  protocol: MqttWebSocketProtocol
  host: string
  port: string
  path: string
  ssl: boolean
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function clampRatio(value: unknown, fallback: number): number {
  const raw = numberValue(value, fallback)
  const clamped = Math.min(MQTT_LAYOUT_RATIO_MAX, Math.max(MQTT_LAYOUT_RATIO_MIN, raw))
  return Math.round(clamped * 1000) / 1000
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => stringValue(item).trim()).filter(Boolean))]
    : []
}

function subscriptionAliases(value: unknown, subscriptions: string[]): Record<string, string> {
  const aliases = record(value)
  const subscriptionSet = new Set(subscriptions)
  const output: Record<string, string> = {}
  for (const topic of subscriptions) {
    const alias = stringValue(aliases[topic]).trim()
    if (alias && subscriptionSet.has(topic)) output[topic] = alias
  }
  return output
}

function qosValue(value: unknown, fallback: MqttQos = DEFAULT_QOS): MqttQos {
  return value === 1 || value === 2 || value === 0 ? value : fallback
}

function nextId(prefix: string, now: number): string {
  return `${prefix}:${now}:${Math.random().toString(16).slice(2, 8)}`
}

function normalizeUrl(value: unknown): string {
  const raw = stringValue(value).trim()
  if (!raw) return ''
  if (raw.startsWith('mqtts://')) return `wss://${raw.slice('mqtts://'.length)}`
  if (raw.startsWith('mqtt://')) return `ws://${raw.slice('mqtt://'.length)}`
  return raw
}

export function parseMqttWebSocketUrl(value: unknown): MqttWebSocketEndpoint {
  const raw = normalizeUrl(value)
  const fallback: MqttWebSocketEndpoint = { protocol: 'ws', host: '', port: '', path: '/', ssl: false }
  if (!raw) return fallback
  try {
    const parsed = new URL(raw)
    const protocol: MqttWebSocketProtocol = parsed.protocol === 'wss:' ? 'wss' : 'ws'
    return {
      protocol,
      host: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname || '/',
      ssl: protocol === 'wss'
    }
  } catch {
    return fallback
  }
}

export function buildMqttWebSocketUrl(input: Partial<MqttWebSocketEndpoint>): string {
  const host = stringValue(input.host).trim()
  if (!host) return ''
  const protocol: MqttWebSocketProtocol = boolValue(input.ssl, false) || input.protocol === 'wss' ? 'wss' : 'ws'
  const rawPort = stringValue(input.port).trim()
  const port = rawPort ? (/^\d+$/.test(rawPort) ? rawPort : '') : DEFAULT_WEBSOCKET_PORT
  const rawPath = stringValue(input.path, '/').trim() || '/'
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  return `${protocol}://${host}${port ? `:${port}` : ''}${path}`
}

function defaultClientId(now: number): string {
  return `eypc_${now.toString(36)}_${Math.random().toString(16).slice(2, 8)}`
}

function timestampValue(value: unknown, fallback: number): number {
  const next = numberValue(value, fallback)
  return next >= 0 ? Math.trunc(next) : fallback
}

export function matchMqttTopicFilter(topicValue: string, filterValue: string): boolean {
  const topic = topicValue.trim()
  const filter = filterValue.trim()
  if (!filter) return false
  if (filter === '#') return true
  const topicLevels = topic.split('/')
  const filterLevels = filter.split('/')
  for (let index = 0; index < filterLevels.length; index += 1) {
    const part = filterLevels[index]
    if (part === '#') return index === filterLevels.length - 1
    if (topicLevels[index] === undefined) return false
    if (part !== '+' && part !== topicLevels[index]) return false
  }
  return topicLevels.length === filterLevels.length
}

export function createMqttConnectionConfig(input: Partial<MqttConnectionConfig> & Record<string, unknown> = {}, now = Date.now()): MqttConnectionConfig {
  const source = record(input)
  const id = stringValue(source.id).trim() || nextId('mqtt-config', now)
  const url = normalizeUrl(source.url)
  const name = stringValue(source.name).trim() || url || 'MQTT 连接'
  const subscriptions = strings(source.subscriptions)
  return {
    id,
    name,
    url,
    clientId: stringValue(source.clientId).trim() || defaultClientId(now),
    username: stringValue(source.username).trim(),
    subscriptions,
    subscriptionAliases: subscriptionAliases(source.subscriptionAliases, subscriptions),
    publishTopic: stringValue(source.publishTopic).trim(),
    qos: qosValue(source.qos),
    retain: boolValue(source.retain, false),
    autoReconnect: boolValue(source.autoReconnect, true),
    reconnectPeriodMs: clamp(numberValue(source.reconnectPeriodMs, DEFAULT_RECONNECT_PERIOD_MS), 500, 60_000),
    connectTimeoutMs: clamp(numberValue(source.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS), 3000, 60_000),
    keepaliveSec: clamp(numberValue(source.keepaliveSec, DEFAULT_KEEPALIVE_SEC), 0, 300),
    clean: boolValue(source.clean, true),
    reconnectOnConnackError: boolValue(source.reconnectOnConnackError, false),
    resubscribeOnReconnect: boolValue(source.resubscribeOnReconnect, true),
    syncRecords: boolValue(source.syncRecords, true),
    sortOrder: Math.max(1, Math.trunc(numberValue(source.sortOrder, 1))),
    createdAt: timestampValue(source.createdAt, now),
    updatedAt: timestampValue(source.updatedAt, now)
  }
}

export function normalizeMqttState(value: unknown, now = Date.now()): MqttState {
  const source = record(value)
  const layoutPrefs = normalizeMqttLayoutPrefs(source.layoutPrefs)
  const configs = Array.isArray(source.configs)
    ? source.configs
      .map((item) => createMqttConnectionConfig(item as Record<string, unknown>, now))
      .filter((item) => item.id && (item.url || item.name))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item, index) => ({ ...item, sortOrder: index + 1 }))
    : []
  const activeConfigId = stringValue(source.activeConfigId).trim()
  return {
    configs,
    activeConfigId: activeConfigId && configs.some((item) => item.id === activeConfigId)
      ? activeConfigId
      : configs[0]?.id || null,
    layoutPrefs
  }
}

export function normalizeMqttLayoutPrefs(value: unknown): MqttLayoutPrefs {
  const source = record(value)
  const workspaceLayout: MqttWorkspaceLayout = source.workspaceLayout === 'split' ? 'split' : 'stack'
  return {
    workspaceLayout,
    stackReceiveRatio: clampRatio(source.stackReceiveRatio, DEFAULT_MQTT_LAYOUT_PREFS.stackReceiveRatio),
    splitReceiveRatio: clampRatio(source.splitReceiveRatio, DEFAULT_MQTT_LAYOUT_PREFS.splitReceiveRatio),
    connectionPanelOpen: boolValue(source.connectionPanelOpen, DEFAULT_MQTT_LAYOUT_PREFS.connectionPanelOpen),
    subscriptionPanelOpen: boolValue(source.subscriptionPanelOpen, DEFAULT_MQTT_LAYOUT_PREFS.subscriptionPanelOpen),
    publishRecordsOpen: boolValue(source.publishRecordsOpen, DEFAULT_MQTT_LAYOUT_PREFS.publishRecordsOpen)
  }
}

export function createMqttSession(connectionId: string, now = Date.now()): MqttSessionRecord {
  return {
    id: nextId('mqtt-session', now),
    connectionId,
    title: new Date(now).toLocaleString(),
    startedAt: now,
    messages: []
  }
}

function normalizeMessage(value: unknown, fallbackConnectionId: string, fallbackSessionId: string, now: number): MqttMessageRecord | null {
  const source = record(value)
  const topic = stringValue(source.topic).trim()
  const payload = stringValue(source.payload)
  const id = stringValue(source.id).trim() || nextId('mqtt-message', now)
  const direction = source.direction === 'incoming' || source.direction === 'outgoing' || source.direction === 'event' ? source.direction : 'event'
  if (!id) return null
  return {
    id,
    connectionId: stringValue(source.connectionId).trim() || fallbackConnectionId,
    sessionId: stringValue(source.sessionId).trim() || fallbackSessionId,
    direction,
    topic,
    payload,
    qos: qosValue(source.qos),
    retain: boolValue(source.retain, false),
    timestamp: Math.max(0, Math.trunc(numberValue(source.timestamp, now))),
    ...(stringValue(source.title).trim() ? { title: stringValue(source.title).trim() } : {}),
    ...(stringValue(source.note).trim() ? { note: stringValue(source.note).trim() } : {})
  }
}

function normalizeSession(value: unknown, now: number): MqttSessionRecord | null {
  const source = record(value)
  const id = stringValue(source.id).trim()
  const connectionId = stringValue(source.connectionId).trim()
  if (!id || !connectionId) return null
  const messages = Array.isArray(source.messages)
    ? source.messages
      .map((item) => normalizeMessage(item, connectionId, id, now))
      .filter((item): item is MqttMessageRecord => Boolean(item))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MQTT_ARCHIVE_MESSAGE_LIMIT)
    : []
  return {
    id,
    connectionId,
    title: stringValue(source.title).trim() || new Date(numberValue(source.startedAt, now)).toLocaleString(),
    ...(stringValue(source.note).trim() ? { note: stringValue(source.note).trim() } : {}),
    startedAt: Math.max(0, Math.trunc(numberValue(source.startedAt, now))),
    ...(numberValue(source.endedAt, 0) > 0 ? { endedAt: Math.trunc(numberValue(source.endedAt, 0)) } : {}),
    messages
  }
}

function normalizePublishTemplate(value: unknown, now: number): MqttPublishTemplate | null {
  const source = record(value)
  const id = stringValue(source.id).trim() || nextId('mqtt-template', now)
  const connectionId = stringValue(source.connectionId).trim()
  const topic = stringValue(source.topic).trim()
  if (!id || !connectionId || !topic) return null
  const title = stringValue(source.title).trim() || topic
  return {
    id,
    connectionId,
    title,
    ...(stringValue(source.note).trim() ? { note: stringValue(source.note).trim() } : {}),
    topic,
    payload: stringValue(source.payload),
    qos: qosValue(source.qos),
    retain: boolValue(source.retain, false),
    createdAt: timestampValue(source.createdAt, now),
    updatedAt: timestampValue(source.updatedAt, now)
  }
}

function normalizeConnectionSnapshot(value: unknown, now: number): MqttConnectionSnapshot | null {
  const source = record(value)
  const id = stringValue(source.id).trim()
  if (!id) return null
  const url = normalizeUrl(source.url)
  const name = stringValue(source.name).trim() || url || 'MQTT 连接'
  return {
    id,
    name,
    url,
    clientId: stringValue(source.clientId).trim(),
    username: stringValue(source.username).trim(),
    publishTopic: stringValue(source.publishTopic).trim(),
    qos: qosValue(source.qos),
    retain: boolValue(source.retain, false),
    syncRecords: boolValue(source.syncRecords, true),
    createdAt: timestampValue(source.createdAt, now),
    updatedAt: timestampValue(source.updatedAt, now)
  }
}

export function createMqttConnectionSnapshot(config: MqttConnectionConfig): MqttConnectionSnapshot {
  return {
    id: config.id,
    name: config.name,
    url: config.url,
    clientId: config.clientId,
    username: config.username,
    publishTopic: config.publishTopic,
    qos: config.qos,
    retain: config.retain,
    syncRecords: config.syncRecords,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt
  }
}

export function normalizeMqttArchiveState(value: unknown, now = Date.now()): MqttArchiveState {
  const source = record(value)
  const connectionSnapshots = Array.isArray(source.connectionSnapshots)
    ? source.connectionSnapshots
      .map((item) => normalizeConnectionSnapshot(item, now))
      .filter((item): item is MqttConnectionSnapshot => Boolean(item))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    : []
  const sessions = Array.isArray(source.sessions)
    ? source.sessions
      .map((item) => normalizeSession(item, now))
      .filter((item): item is MqttSessionRecord => Boolean(item))
    : []
  const byConnection = new Map<string, MqttSessionRecord[]>()
  for (const session of sessions) {
    const current = byConnection.get(session.connectionId) || []
    current.push(session)
    byConnection.set(session.connectionId, current)
  }
  const trimmed = [...byConnection.values()].flatMap((items) =>
    items.sort((a, b) => b.startedAt - a.startedAt).slice(0, MQTT_ARCHIVE_SESSION_LIMIT)
  )
  const publishTemplates = Array.isArray(source.publishTemplates)
    ? source.publishTemplates
      .map((item) => normalizePublishTemplate(item, now))
      .filter((item): item is MqttPublishTemplate => Boolean(item))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MQTT_PUBLISH_TEMPLATE_LIMIT)
    : []
  return {
    version: 1,
    connectionSnapshots,
    sessions: trimmed.sort((a, b) => b.startedAt - a.startedAt),
    publishTemplates
  }
}

export function appendMqttMessage(archive: MqttArchiveState, input: MqttMessageRecord): MqttArchiveState {
  const next = normalizeMqttArchiveState(archive)
  const sessionIndex = next.sessions.findIndex((item) => item.id === input.sessionId)
  if (sessionIndex < 0) {
    next.sessions.unshift({
      id: input.sessionId,
      connectionId: input.connectionId,
      title: new Date(input.timestamp).toLocaleString(),
      startedAt: input.timestamp,
      messages: []
    })
  }
  const target = next.sessions.find((item) => item.id === input.sessionId)!
  target.messages = [...target.messages, input].sort((a, b) => a.timestamp - b.timestamp).slice(-MQTT_ARCHIVE_MESSAGE_LIMIT)
  return normalizeMqttArchiveState(next)
}

export type MqttRecordTarget =
  | { kind: 'session'; id: string }
  | { kind: 'message'; id: string }

export function renameMqttRecord(archive: MqttArchiveState, target: MqttRecordTarget, input: { title?: string; note?: string }): MqttArchiveState {
  const title = stringValue(input.title).trim()
  const note = stringValue(input.note).trim()
  const next = normalizeMqttArchiveState(archive)
  for (const session of next.sessions) {
    if (target.kind === 'session' && session.id === target.id) {
      if (title) session.title = title
      if (note) session.note = note
    }
    if (target.kind === 'message') {
      const message = session.messages.find((item) => item.id === target.id)
      if (message) {
        if (title) message.title = title
        if (note) message.note = note
      }
    }
  }
  return next
}

export function updateMqttRecord(
  archive: MqttArchiveState,
  target: MqttRecordTarget,
  input: Partial<Pick<MqttMessageRecord, 'title' | 'note' | 'topic' | 'payload' | 'qos' | 'retain'>>
): MqttArchiveState {
  const next = normalizeMqttArchiveState(archive)
  if (target.kind !== 'message') return next
  for (const session of next.sessions) {
    const message = session.messages.find((item) => item.id === target.id)
    if (!message) continue
    if (typeof input.title === 'string') {
      const title = input.title.trim()
      if (title) message.title = title
      else delete message.title
    }
    if (typeof input.note === 'string') {
      const note = input.note.trim()
      if (note) message.note = note
      else delete message.note
    }
    if (typeof input.topic === 'string') message.topic = input.topic.trim()
    if (typeof input.payload === 'string') message.payload = input.payload
    if (input.qos === 0 || input.qos === 1 || input.qos === 2) message.qos = input.qos
    if (typeof input.retain === 'boolean') message.retain = input.retain
  }
  return normalizeMqttArchiveState(next)
}

export function deleteMqttRecord(archive: MqttArchiveState, target: MqttRecordTarget): MqttArchiveState {
  const next = normalizeMqttArchiveState(archive)
  if (target.kind === 'session') return { ...next, sessions: next.sessions.filter((item) => item.id !== target.id) }
  return {
    ...next,
    sessions: next.sessions.map((session) => ({
      ...session,
      messages: session.messages.filter((item) => item.id !== target.id)
    }))
  }
}

export function saveMqttPublishTemplate(archive: MqttArchiveState, input: Partial<MqttPublishTemplate> & Pick<MqttPublishTemplate, 'connectionId' | 'topic' | 'payload'>, now = Date.now()): MqttArchiveState {
  const next = normalizeMqttArchiveState(archive, now)
  const existing = input.id ? next.publishTemplates.find((item) => item.id === input.id) : null
  const candidate = normalizePublishTemplate({
    ...existing,
    ...input,
    id: input.id || existing?.id || nextId('mqtt-template', now),
    title: stringValue(input.title).trim() || existing?.title || input.topic,
    qos: input.qos ?? existing?.qos ?? DEFAULT_QOS,
    retain: input.retain ?? existing?.retain ?? false,
    createdAt: existing?.createdAt || input.createdAt || now,
    updatedAt: now
  }, now)
  if (!candidate) return next
  return normalizeMqttArchiveState({
    ...next,
    publishTemplates: [candidate, ...next.publishTemplates.filter((item) => item.id !== candidate.id)]
  }, now)
}

export function renameMqttPublishTemplate(archive: MqttArchiveState, id: string, input: { title?: string; note?: string }, now = Date.now()): MqttArchiveState {
  const title = stringValue(input.title).trim()
  const note = stringValue(input.note).trim()
  const next = normalizeMqttArchiveState(archive, now)
  return normalizeMqttArchiveState({
    ...next,
    publishTemplates: next.publishTemplates.map((item) => item.id === id
      ? {
          ...item,
          ...(title ? { title } : {}),
          ...(note ? { note } : {}),
          updatedAt: now
        }
      : item)
  }, now)
}

export function deleteMqttPublishTemplate(archive: MqttArchiveState, id: string): MqttArchiveState {
  const next = normalizeMqttArchiveState(archive)
  return {
    ...next,
    publishTemplates: next.publishTemplates.filter((item) => item.id !== id)
  }
}

export function toMqttPublishDraft(record: Pick<MqttMessageRecord | MqttPublishTemplate, 'topic' | 'payload' | 'qos' | 'retain'>): MqttPublishDraft {
  return {
    topic: record.topic,
    payload: record.payload,
    qos: record.qos,
    retain: record.retain
  }
}

export function mqttConnectOptionsFromConfig(config: MqttConnectionConfig, password = '') {
  return {
    clientId: config.clientId,
    username: config.username || undefined,
    ...(password ? { password } : {}),
    clean: config.clean,
    reconnectPeriod: config.autoReconnect ? config.reconnectPeriodMs : 0,
    connectTimeout: config.connectTimeoutMs,
    keepalive: config.keepaliveSec,
    reconnectOnConnackError: config.reconnectOnConnackError,
    resubscribe: config.resubscribeOnReconnect
  }
}
