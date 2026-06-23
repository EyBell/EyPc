import type { MqttQos } from '../domain/types'

export interface MqttRuntimeClient {
  end(force?: boolean): void
  publish(topic: string, payload: string, options: { qos: MqttQos; retain: boolean }, callback?: (error?: Error | null) => void): void
  subscribe(topic: string | string[], options: { qos: MqttQos }, callback?: (error?: Error | null) => void): void
  unsubscribe?(topic: string | string[], callback?: (error?: Error | null) => void): void
  on(event: 'connect' | 'reconnect' | 'close', listener: () => void): void
  on(event: 'error', listener: (error: Error) => void): void
  on(event: 'message', listener: (topic: string, payload: Uint8Array) => void): void
}

export type MqttConnectFn = (url: string, options: Record<string, unknown>) => MqttRuntimeClient

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export function resolveMqttConnect(moduleValue: unknown): MqttConnectFn {
  const moduleRecord = record(moduleValue)
  if (typeof moduleRecord.connect === 'function') return moduleRecord.connect as MqttConnectFn

  const defaultRecord = record(moduleRecord.default)
  if (typeof defaultRecord.connect === 'function') return defaultRecord.connect as MqttConnectFn

  throw new Error('MQTT client connect export not found')
}
