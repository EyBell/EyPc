import { describe, expect, it } from 'vitest'
import { buildMqttPayloadPreviewSegments } from '../../src/domain/mqttPayloadPreview'

describe('mqtt payload preview segments', () => {
  it('tokenizes JSON payloads into safe colored preview segments', () => {
    const segments = buildMqttPayloadPreviewSegments('{"deviceNumber":"czz060301","data":[{"key":"3号出肥阀手动启动","value":"1"}]}')

    expect(segments.map((segment) => segment.kind)).toContain('key')
    expect(segments.map((segment) => segment.kind)).toContain('string')
    expect(segments.map((segment) => segment.kind)).toContain('punctuation')
    expect(segments.map((segment) => segment.text).join('')).toContain('"deviceNumber": "czz060301"')
    expect(segments.map((segment) => segment.text).join('')).toContain('"key": "3号出肥阀手动启动"')
  })

  it('keeps invalid JSON as plain text segments without parsing markup', () => {
    const segments = buildMqttPayloadPreviewSegments('<b>raw</b>\nset=1')

    expect(segments).toEqual([
      { kind: 'text', text: '<b>raw</b>' },
      { kind: 'newline', text: '\n' },
      { kind: 'text', text: 'set=1' }
    ])
  })
})
