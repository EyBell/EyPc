import { mqttPublishTemplateOperationTime } from './mqtt'
import type { MqttMessageRecord, MqttPublishTemplate } from './types'

export type MqttMergedExportSource = MqttMessageRecord | MqttPublishTemplate

export interface MqttMergedExportRecord {
  kind: 'message' | 'template'
  topic: string
  payload: string
  payloadFormat: 'json' | 'text'
  payloadJson?: unknown
  qos: MqttMessageRecord['qos']
  retain: boolean
  occurredAt: string
  direction?: MqttMessageRecord['direction']
  title?: string
  note?: string
}

export interface MqttMergedJsonExport {
  schema: 'eypc-mqtt-merged-export/v1'
  exportedAt: string
  count: number
  records: MqttMergedExportRecord[]
}

function parsedPayload(payload: string): { format: 'json'; value: unknown } | { format: 'text' } {
  try {
    return { format: 'json', value: JSON.parse(payload) }
  } catch {
    return { format: 'text' }
  }
}

function optionalText(value: string | undefined) {
  const text = value?.trim()
  return text ? text : null
}

function exportRecord(record: MqttMergedExportSource): MqttMergedExportRecord {
  const message = 'direction' in record
  const parsed = parsedPayload(record.payload)
  const title = optionalText(record.title)
  const note = optionalText(record.note)
  const occurredAt = message ? record.timestamp : mqttPublishTemplateOperationTime(record)
  return {
    kind: message ? 'message' : 'template',
    topic: record.topic,
    payload: record.payload,
    payloadFormat: parsed.format,
    ...(parsed.format === 'json' ? { payloadJson: parsed.value } : {}),
    qos: record.qos,
    retain: record.retain,
    occurredAt: new Date(occurredAt).toISOString(),
    ...(message ? { direction: record.direction } : {}),
    ...(title ? { title } : {}),
    ...(note ? { note } : {})
  }
}

export function buildMqttMergedJsonExport(records: MqttMergedExportSource[], now = Date.now()): MqttMergedJsonExport {
  return {
    schema: 'eypc-mqtt-merged-export/v1',
    exportedAt: new Date(now).toISOString(),
    count: records.length,
    records: records.map(exportRecord)
  }
}

export function stringifyMqttMergedJsonExport(records: MqttMergedExportSource[], now = Date.now()) {
  return `${JSON.stringify(buildMqttMergedJsonExport(records, now), null, 2)}\n`
}

export function stringifyMqttTopicsCopy(records: MqttMergedExportSource[]) {
  return records.map((record) => record.topic).join('\n')
}

export function stringifyMqttPayloadsCopy(records: MqttMergedExportSource[]) {
  return records.map((record) => record.payload).join('\n\n')
}

export function mqttMergedJsonFileName(now = Date.now()) {
  const stamp = new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-')
  return `mqtt-merged-${stamp}.json`
}
