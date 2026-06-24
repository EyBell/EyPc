export type MqttPayloadPreviewSegmentKind =
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'punctuation'
  | 'text'
  | 'newline'

export interface MqttPayloadPreviewSegment {
  kind: MqttPayloadPreviewSegmentKind
  text: string
}

const STRING_TOKEN = /"(?:\\.|[^"\\])*"/y
const NUMBER_TOKEN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y

export function buildMqttPayloadPreviewSegments(payload: string): MqttPayloadPreviewSegment[] {
  const formatted = formatJsonPayload(payload)
  if (formatted === null) return plainTextSegments(payload)
  return tokenizeJsonPreview(formatted)
}

function formatJsonPayload(payload: string): string | null {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2)
  } catch {
    return null
  }
}

function plainTextSegments(payload: string): MqttPayloadPreviewSegment[] {
  const lines = payload.split('\n')
  return lines.flatMap((line, index) => {
    const segments: MqttPayloadPreviewSegment[] = [{ kind: 'text', text: line }]
    if (index < lines.length - 1) segments.push({ kind: 'newline', text: '\n' })
    return segments
  })
}

function tokenizeJsonPreview(input: string): MqttPayloadPreviewSegment[] {
  const segments: MqttPayloadPreviewSegment[] = []
  let index = 0
  while (index < input.length) {
    const char = input[index]
    if (char === '\n') {
      segments.push({ kind: 'newline', text: '\n' })
      index += 1
      continue
    }
    if (/\s/.test(char)) {
      const next = consumeWhile(input, index, (value) => value !== '\n' && /\s/.test(value))
      segments.push({ kind: 'text', text: input.slice(index, next) })
      index = next
      continue
    }
    if ('{}[],:'.includes(char)) {
      segments.push({ kind: 'punctuation', text: char })
      index += 1
      continue
    }

    STRING_TOKEN.lastIndex = index
    const stringMatch = STRING_TOKEN.exec(input)
    if (stringMatch) {
      const text = stringMatch[0]
      segments.push({ kind: isJsonKey(input, STRING_TOKEN.lastIndex) ? 'key' : 'string', text })
      index = STRING_TOKEN.lastIndex
      continue
    }

    NUMBER_TOKEN.lastIndex = index
    const numberMatch = NUMBER_TOKEN.exec(input)
    if (numberMatch) {
      segments.push({ kind: 'number', text: numberMatch[0] })
      index = NUMBER_TOKEN.lastIndex
      continue
    }

    const keyword = ['true', 'false', 'null'].find((item) => input.startsWith(item, index))
    if (keyword) {
      segments.push({ kind: keyword === 'null' ? 'null' : 'boolean', text: keyword })
      index += keyword.length
      continue
    }

    segments.push({ kind: 'text', text: char })
    index += 1
  }
  return segments
}

function isJsonKey(input: string, afterStringIndex: number): boolean {
  let index = afterStringIndex
  while (index < input.length && input[index] !== '\n' && /\s/.test(input[index])) index += 1
  return input[index] === ':'
}

function consumeWhile(input: string, start: number, predicate: (value: string) => boolean): number {
  let index = start
  while (index < input.length && predicate(input[index])) index += 1
  return index
}
