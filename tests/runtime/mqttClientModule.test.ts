import { describe, expect, it } from 'vitest'
import { resolveMqttConnect } from '../../src/runtime/mqttClientModule'

describe('mqtt client module resolver', () => {
  it('accepts the Vite browser default-only mqtt module shape', () => {
    const connect = () => ({})

    expect(resolveMqttConnect({ default: { connect } })).toBe(connect)
  })

  it('accepts the Node named mqtt module shape', () => {
    const connect = () => ({})

    expect(resolveMqttConnect({ connect })).toBe(connect)
  })

  it('throws an actionable error when the mqtt module has no connect export', () => {
    expect(() => resolveMqttConnect({ default: {} })).toThrow('MQTT client connect export not found')
  })
})
