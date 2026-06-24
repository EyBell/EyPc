import { describe, expect, it } from 'vitest'
import { buildMqttInlinePayloadPreviewSegments, buildMqttPayloadPreviewSegments } from '../../src/domain/mqttPayloadPreview'

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

  it('builds a compact single-line JSON snippet with preview token kinds', () => {
    const segments = buildMqttInlinePayloadPreviewSegments('{"code":"200","data":{"msg":"ok","value":12}}', 96)
    const text = segments.map((segment) => segment.text).join('')

    expect(text).toContain('"code"')
    expect(text).toContain('"value"')
    expect(text).not.toContain('\n')
    expect(segments.map((segment) => segment.kind)).toContain('key')
    expect(segments.map((segment) => segment.kind)).toContain('number')
  })

  it('compacts plain text snippets without multiline row growth', () => {
    const segments = buildMqttInlinePayloadPreviewSegments('line one\nline two\tline three', 96)

    expect(segments).toEqual([{ kind: 'text', text: 'line one line two line three' }])
  })

  it('returns an explicit empty inline payload label', () => {
    expect(buildMqttInlinePayloadPreviewSegments('   ')).toEqual([{ kind: 'text', text: '(empty payload)' }])
  })

  it('truncates inline payload snippets at the requested character budget', () => {
    const text = buildMqttInlinePayloadPreviewSegments('abcdefghijklmnopqrstuvwxyz', 12)
      .map((segment) => segment.text)
      .join('')

    expect(text).toBe('abcdefghijkl…')
  })
})
