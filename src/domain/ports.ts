import type { PortGroup, PortProcess } from './types'

export interface PortFilterResult {
  items: PortProcess[]
  error: string | null
}

const HISTORY_LIMIT = 30

function createPortProcess(input: Omit<PortProcess, 'id'>): PortProcess {
  return {
    ...input,
    id: `${input.pid}:${input.port}:${input.protocol}`
  }
}

function parsePortFromAddress(value: string): number | null {
  const match = value.match(/:(\d+)(?:\s|\)|$)/)
  if (!match) return null
  const port = Number(match[1])
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null
}

export function parseLsofListeningTcp(output: string): PortProcess[] {
  return String(output || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split(/\s+/)
      if (parts.length < 9 || !line.includes('(LISTEN)')) return []
      const command = parts[0]
      const pid = Number(parts[1])
      const user = parts[2]
      const name = parts.slice(8).join(' ')
      const port = parsePortFromAddress(name)
      if (!Number.isInteger(pid) || !port) return []
      return [createPortProcess({ pid, port, command, user, address: name.replace(/\s*\(LISTEN\)\s*$/, ''), protocol: 'tcp', state: 'LISTEN' })]
    })
}

export function parseNetstatListeningTcp(output: string, processNames: Record<number, string> = {}): PortProcess[] {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^TCP\s+/i.test(line) && /\bLISTENING\b/i.test(line))
    .flatMap((line) => {
      const parts = line.split(/\s+/)
      const localAddress = parts[1] || ''
      const pid = Number(parts[parts.length - 1])
      const port = parsePortFromAddress(localAddress)
      if (!Number.isInteger(pid) || !port) return []
      return [createPortProcess({ pid, port, command: processNames[pid] || `pid-${pid}`, address: localAddress, protocol: 'tcp', state: 'LISTEN' })]
    })
}

function parseRegexQuery(raw: string): RegExp | null {
  const match = raw.match(/^\/(.+)\/([gimsuy]*)$/)
  if (!match) return null
  return new RegExp(match[1], match[2].replace('g', ''))
}

function searchablePortText(item: PortProcess): string {
  return [item.pid, item.port, item.command, item.address, item.user || '', item.protocol, item.state].join(' ').toLowerCase()
}

function searchablePortFields(item: PortProcess): string[] {
  return [String(item.pid), String(item.port), item.command, item.address, item.user || '', item.protocol, item.state]
}

export function filterPortProcesses(items: PortProcess[], keyword: string): PortFilterResult {
  const query = keyword.trim()
  if (!query) return { items: [...items], error: null }
  try {
    const regex = parseRegexQuery(query)
    if (regex) {
      return { items: items.filter((item) => searchablePortFields(item).some((field) => regex.test(field))), error: null }
    }
  } catch (error) {
    return { items: [...items], error: error instanceof Error ? error.message : 'Invalid regular expression' }
  }
  const needle = query.toLowerCase()
  return { items: items.filter((item) => searchablePortText(item).includes(needle)), error: null }
}

export function recordSearchHistory(history: string[], keyword: string): string[] {
  const value = keyword.trim()
  if (!value) return history.slice(0, HISTORY_LIMIT)
  return [value, ...history.filter((item) => item !== value)].slice(0, HISTORY_LIMIT)
}

export function buildPortGroupTargets(group: PortGroup): number[] {
  const ports = new Set<number>()
  for (const entry of group.entries) {
    const value = String(entry).trim()
    const range = value.match(/^(\d+)\s*-\s*(\d+)$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (start > 0 && end >= start && end <= 65535) {
        for (let port = start; port <= end; port += 1) ports.add(port)
      }
      continue
    }
    const port = Number(value)
    if (Number.isInteger(port) && port > 0 && port <= 65535) ports.add(port)
  }
  return [...ports].sort((a, b) => a - b)
}

export function shouldProcessMatchVerifiedPort(target: { pid: number; port: number }, current: Array<{ pid: number; port: number }>): boolean {
  return current.some((item) => item.pid === target.pid && item.port === target.port)
}
