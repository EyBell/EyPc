import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../src/domain/state'
import { createAppRuntime } from '../../src/runtime/appRuntime'

type Listener = (...args: unknown[]) => void

interface FakeMqttClient {
  listeners: Map<string, Listener[]>
  ended: boolean
  on(event: string, listener: Listener): void
  emit(event: string, ...args: unknown[]): void
  end(): void
  publish(): void
  subscribe(): void
}

function createFakeMqttClient(): FakeMqttClient {
  const listeners = new Map<string, Listener[]>()
  let ended = false

  return {
    listeners,
    get ended() { return ended },
    set ended(value: boolean) { ended = value },
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) || []), listener])
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) || []) listener(...args)
    },
    end() {
      ended = true
    },
    publish() {},
    subscribe() {}
  }
}

function installPlatform() {
  const state = createInitialState(100)
  const platform = {
    storage: {
      getState: () => state,
      setState: () => true,
      getMqttArchive: () => ({ version: 1 as const, sessions: [] }),
      setMqttArchive: () => true
    },
    ports: { scan: async () => [], kill: async () => ({ ok: false, error: 'unused' }) },
    files: {
      open: async () => true,
      reveal: async () => true,
      copyPath: async () => true,
      pickFavorite: async () => null,
      pickFavorites: async () => [],
      listDirectory: async () => ({ ok: false, entries: [], error: 'unused' })
    },
    app: { hide: async () => true },
    getEnterPayload: () => null,
    clearEnterPayload: () => undefined
  }
  globalThis.window = { eypcPlatform: platform } as unknown as Window & typeof globalThis
  return state
}

describe('mqtt connection logs', () => {
  it('keeps connection errors visible after close overwrites the status', async () => {
    const state = installPlatform()
    const clientRef: { current: FakeMqttClient | null } = { current: null }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state, {
      mqttModuleLoader: async () => ({
        default: {
          connect: () => {
            clientRef.current = createFakeMqttClient()
            return clientRef.current
          }
        }
      })
    })

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'Agro-Plc',
      protocol: 'ws',
      host: 'ainongyun.net',
      port: '8083',
      path: '/',
      clientId: 'mqttx_test'
    })
    runtime.dispatch('mqtt.config.save')
    runtime.dispatch('mqtt.connection.connect')
    for (let index = 0; index < 10 && !clientRef.current; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    const client = clientRef.current
    expect(client).not.toBeNull()
    if (!client) throw new Error('fake MQTT client was not created')
    expect([...new Set(client.listeners.keys())]).toEqual(['connect', 'reconnect', 'close', 'error', 'message'])
    client.emit('error', new Error('WebSocket close before CONNACK'))
    for (const listener of client.listeners.get('close') || []) listener()

    expect(runtime.snapshot().mqttConnectionStatus.state).toBe('disconnected')
    expect(runtime.snapshot().mqttLogs.map((item) => item.message)).toEqual([
      '连接未建立',
      '连接关闭',
      '连接错误',
      '开始连接'
    ])
    expect(runtime.snapshot().mqttLogs[0].detail).toContain('端口')
    expect(runtime.snapshot().mqttLogs[2].detail).toContain('WebSocket close before CONNACK')
  })

  it('selects log details and clears single, current-connection, and all log records', async () => {
    const state = installPlatform()
    const clientRef: { current: FakeMqttClient | null } = { current: null }
    state.settings.featureConfigs = [
      { id: 'ports', enabled: true, sortOrder: 1 },
      { id: 'mqtt', enabled: true, sortOrder: 2 },
      { id: 'favorites', enabled: false, sortOrder: 3 },
      { id: 'settings', enabled: true, sortOrder: 4 }
    ]
    const runtime = createAppRuntime(state, {
      mqttModuleLoader: async () => ({
        default: {
          connect: () => {
            clientRef.current = createFakeMqttClient()
            return clientRef.current
          }
        }
      })
    })

    runtime.setTab('mqtt')
    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'Agro-A',
      protocol: 'ws',
      host: 'broker-a.example',
      port: '8083',
      path: '/',
      clientId: 'mqttx_a'
    })
    runtime.dispatch('mqtt.config.save')
    const firstConfigId = runtime.snapshot().state.mqtt.activeConfigId
    runtime.dispatch('mqtt.connection.connect')
    for (let index = 0; index < 10 && !clientRef.current; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    clientRef.current?.emit('error', new Error('first broker refused'))

    runtime.dispatch('mqtt.config.create')
    runtime.updateMqttConfigDraft({
      name: 'Agro-B',
      protocol: 'ws',
      host: 'broker-b.example',
      port: '8084',
      path: '/',
      clientId: 'mqttx_b'
    })
    runtime.dispatch('mqtt.config.save')
    const secondConfigId = runtime.snapshot().state.mqtt.activeConfigId
    runtime.dispatch('mqtt.connection.disconnect')

    expect(new Set(runtime.snapshot().mqttLogs.map((item) => item.connectionId))).toEqual(new Set([firstConfigId, secondConfigId]))
    const selectedLog = runtime.snapshot().mqttLogs.find((item) => item.connectionId === secondConfigId)
    expect(selectedLog).toBeTruthy()
    if (!selectedLog) throw new Error('expected second config log')

    runtime.focusMqttLog(selectedLog.id)
    expect(runtime.snapshot().mqttSelectedRecord).toEqual({ kind: 'log', id: selectedLog.id })
    expect(runtime.snapshot().mqttSelectedLog).toMatchObject({
      id: selectedLog.id,
      message: selectedLog.message,
      detail: selectedLog.detail
    })

    expect(runtime.dispatch('mqtt.record.delete').handled).toBe(true)
    expect(runtime.snapshot().mqttLogs.some((item) => item.id === selectedLog.id)).toBe(false)
    expect(runtime.snapshot().mqttSelectedLog).toBeNull()

    runtime.dispatch('mqtt.connection.disconnect')
    const logDeleteTarget = runtime.snapshot().mqttLogs.find((item) => item.connectionId === secondConfigId)
    expect(logDeleteTarget).toBeTruthy()
    if (!logDeleteTarget) throw new Error('expected second config log for direct log deletion')
    runtime.focusMqttLog(logDeleteTarget.id)
    expect(runtime.dispatch('mqtt.log.delete').handled).toBe(true)
    expect(runtime.snapshot().mqttLogs.some((item) => item.id === logDeleteTarget.id)).toBe(false)

    runtime.dispatch('mqtt.connection.disconnect')
    expect(runtime.snapshot().mqttLogs.some((item) => item.connectionId === secondConfigId)).toBe(true)
    expect(runtime.dispatch('mqtt.log.clearCurrentConfig').handled).toBe(true)
    expect(runtime.snapshot().mqttLogs.some((item) => item.connectionId === secondConfigId)).toBe(false)
    expect(runtime.snapshot().mqttLogs.some((item) => item.connectionId === firstConfigId)).toBe(true)

    expect(runtime.dispatch('mqtt.log.clearAll').handled).toBe(true)
    expect(runtime.snapshot().mqttLogs).toEqual([])
  })
})
