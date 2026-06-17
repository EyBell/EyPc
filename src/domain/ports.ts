import type { PortGroup, PortGroupFolder, PortGroupTarget, PortProcess } from './types'
export { recordSearchHistory } from './searchHistory'

export interface PortFilterResult {
  items: PortProcess[]
  error: string | null
}

export interface PortGroupTreeRow {
  rowId: string
  target: PortGroupTarget
  kind: PortGroupTarget['kind']
  name: string
  color: string
  entries: string[]
  depth: number
  collapsed: boolean
  childCount: number
  group: PortGroup | null
  folder: PortGroupFolder | null
}

function createPortProcess(input: Omit<PortProcess, 'id'>): PortProcess {
  return {
    ...input,
    id: `${input.pid}:${input.port}:${input.protocol}`
  }
}

export function dedupePortProcesses(items: PortProcess[]): PortProcess[] {
  const byKey = new Map<string, PortProcess>()
  for (const item of items) {
    const key = `${item.pid}:${item.port}:${item.protocol}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...item, id: key })
      continue
    }
    const addresses = [...new Set([...existing.address.split(' · '), item.address].map((value) => value.trim()).filter(Boolean))]
    byKey.set(key, {
      ...existing,
      command: existing.command || item.command,
      user: existing.user || item.user,
      state: existing.state || item.state,
      address: addresses.join(' · ')
    })
  }
  return [...byKey.values()]
}

function parsePortFromAddress(value: string): number | null {
  const match = value.match(/:(\d+)(?:\s|\)|$)/)
  if (!match) return null
  const port = Number(match[1])
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null
}

export function parseLsofListeningTcp(output: string): PortProcess[] {
  const rows = String(output || '')
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
  return dedupePortProcesses(rows)
}

export function parseNetstatListeningTcp(output: string, processNames: Record<number, string> = {}): PortProcess[] {
  const rows = String(output || '')
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
  return dedupePortProcesses(rows)
}

function parseRegexQuery(raw: string): RegExp | null {
  const match = raw.match(/^\/(.+)\/([gimsuy]*)$/)
  if (!match) return null
  return new RegExp(match[1], match[2].replace('g', ''))
}

function parseAutoRegexQuery(raw: string): RegExp | null {
  if (!/[|()[\]{}+*?\\^$]/.test(raw)) return null
  return new RegExp(raw, 'i')
}

function searchablePortText(item: PortProcess): string {
  return [item.pid, item.port, item.command, item.address, item.user || '', item.protocol, item.state].join(' ').toLowerCase()
}

function searchablePortFields(item: PortProcess): string[] {
  return [String(item.pid), String(item.port), item.command, item.address, item.user || '', item.protocol, item.state]
}

function bestTextScore(item: PortProcess, query: string, regex: RegExp | null): number {
  const needle = query.toLowerCase()
  const fields = searchablePortFields(item)
  const lowerFields = fields.map((field) => field.toLowerCase())
  if (lowerFields.some((field) => field === needle)) return 1000
  if (lowerFields.some((field) => field.startsWith(needle))) return 800
  if (searchablePortText(item).includes(needle)) return 600
  if (regex && fields.some((field) => {
    regex.lastIndex = 0
    return regex.test(field)
  })) return 400
  return 0
}

function regexScore(item: PortProcess, regex: RegExp): number {
  return searchablePortFields(item).some((field) => {
    regex.lastIndex = 0
    return regex.test(field)
  }) ? 400 : 0
}

export function filterPortProcesses(items: PortProcess[], keyword: string): PortFilterResult {
  const query = keyword.trim()
  if (!query) return { items: [...items], error: null }
  try {
    const regex = parseRegexQuery(query)
    const autoRegex = regex ? null : parseAutoRegexQuery(query)
    const scored = items
      .map((item, index) => ({ item, index, score: regex ? regexScore(item, regex) : bestTextScore(item, query, autoRegex) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.item.port - b.item.port || a.item.pid - b.item.pid || a.index - b.index)
    return { items: scored.map((row) => row.item), error: null }
  } catch (error) {
    return { items: [...items], error: error instanceof Error ? error.message : 'Invalid regular expression' }
  }
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

function portGroupRegexes(group: PortGroup): RegExp[] {
  return group.entries.flatMap((entry) => {
    try {
      const regex = parseRegexQuery(String(entry).trim())
      return regex ? [regex] : []
    } catch {
      return []
    }
  })
}

export function matchPortGroupProcesses(items: PortProcess[], group: PortGroup): PortProcess[] {
  const targetPorts = new Set(buildPortGroupTargets(group))
  const regexes = portGroupRegexes(group)
  return items.filter((item) => {
    if (targetPorts.has(item.port)) return true
    const fields = searchablePortFields(item)
    return regexes.some((regex) => fields.some((field) => {
      regex.lastIndex = 0
      return regex.test(field)
    }))
  })
}

function sortedFolders(folders: PortGroupFolder[]): PortGroupFolder[] {
  return [...folders].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

function sortedGroups(groups: PortGroup[]): PortGroup[] {
  return [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

function groupMatchesKeyword(group: PortGroup, query: string): boolean {
  if (!query) return true
  return [group.name, group.id, group.entries.join(' ')].join(' ').toLowerCase().includes(query)
}

function folderMatchesKeyword(folder: PortGroupFolder, children: PortGroup[], query: string): boolean {
  if (!query) return true
  const folderText = [folder.name, folder.id].join(' ').toLowerCase()
  return folderText.includes(query) || children.some((group) => groupMatchesKeyword(group, query))
}

function rowForFolder(folder: PortGroupFolder, childCount: number, collapsed: boolean): PortGroupTreeRow {
  return {
    rowId: `folder:${folder.id}`,
    target: { kind: 'folder', id: folder.id },
    kind: 'folder',
    name: folder.name,
    color: folder.color,
    entries: [],
    depth: 0,
    collapsed,
    childCount,
    group: null,
    folder
  }
}

function rowForGroup(group: PortGroup, depth: number): PortGroupTreeRow {
  return {
    rowId: `group:${group.id}`,
    target: { kind: 'group', id: group.id },
    kind: 'group',
    name: group.name,
    color: group.color,
    entries: group.entries,
    depth,
    collapsed: false,
    childCount: 0,
    group,
    folder: null
  }
}

export function flattenPortGroupTargets(
  groups: PortGroup[],
  folders: PortGroupFolder[],
  collapsedFolderIds: string[] = [],
  keyword = ''
): PortGroupTreeRow[] {
  const query = keyword.trim().toLowerCase()
  const collapsed = new Set(collapsedFolderIds)
  const rows: PortGroupTreeRow[] = []
  const groupsByFolder = new Map<string | null, PortGroup[]>()
  for (const group of sortedGroups(groups)) {
    const folderId = group.folderId || null
    if (!groupsByFolder.has(folderId)) groupsByFolder.set(folderId, [])
    groupsByFolder.get(folderId)!.push(group)
  }

  for (const folder of sortedFolders(folders)) {
    const children = groupsByFolder.get(folder.id) || []
    if (!folderMatchesKeyword(folder, children, query)) continue
    const matchingChildren = children.filter((group) => groupMatchesKeyword(group, query))
    const folderCollapsed = collapsed.has(folder.id) && !query
    rows.push(rowForFolder(folder, children.length, folderCollapsed))
    if (!folderCollapsed) {
      for (const group of query ? matchingChildren : children) rows.push(rowForGroup(group, 1))
    } else if (query) {
      for (const group of matchingChildren) rows.push(rowForGroup(group, 1))
    }
  }

  const rootGroups = groupsByFolder.get(null) || []
  for (const group of rootGroups) {
    if (groupMatchesKeyword(group, query)) rows.push(rowForGroup(group, 0))
  }
  return rows
}

export function portGroupTargetEntries(target: PortGroupTarget, groups: PortGroup[], folders: PortGroupFolder[]): string[] {
  if (target.kind === 'group') {
    return groups.find((group) => group.id === target.id)?.entries || []
  }
  if (!folders.some((folder) => folder.id === target.id)) return []
  return groups
    .filter((group) => group.folderId === target.id)
    .flatMap((group) => group.entries)
}

export function matchPortGroupTargetProcesses(
  items: PortProcess[],
  target: PortGroupTarget,
  groups: PortGroup[],
  folders: PortGroupFolder[]
): PortProcess[] {
  const entries = portGroupTargetEntries(target, groups, folders)
  if (!entries.length) return []
  return matchPortGroupProcesses(items, {
    id: `${target.kind}:${target.id}`,
    name: target.id,
    color: '#00A676',
    entries,
    folderId: null,
    sortOrder: 0
  })
}

export function movePortGroupToFolder(groups: PortGroup[], groupId: string, folderId: string | null): PortGroup[] {
  return groups.map((group) => group.id === groupId ? { ...group, folderId } : group)
}

export function shouldProcessMatchVerifiedPort(target: { pid: number; port: number }, current: Array<{ pid: number; port: number }>): boolean {
  return current.some((item) => item.pid === target.pid && item.port === target.port)
}
