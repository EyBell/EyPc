import { describe, expect, it } from 'vitest'
import {
  buildPortGroupTargets,
  flattenPortGroupTargets,
  dedupePortProcesses,
  filterPortProcesses,
  matchPortGroupTargetProcesses,
  matchPortGroupProcesses,
  movePortGroupToFolder,
  parseLsofListeningTcp,
  parseNetstatListeningTcp,
  recordSearchHistory,
  shouldProcessMatchVerifiedPort
} from '../../src/domain/ports'

describe('port domain', () => {
  it('parses lsof listening tcp output', () => {
    const rows = parseLsofListeningTcp(`COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    1234 gdkmjd 22u IPv4 0xabcd      0t0  TCP *:8092 (LISTEN)
python  2345 gdkmjd 11u IPv6 0xbcde      0t0  TCP [::1]:5173 (LISTEN)
`)

    expect(rows).toEqual([
      expect.objectContaining({ command: 'node', pid: 1234, port: 8092, protocol: 'tcp', state: 'LISTEN' }),
      expect.objectContaining({ command: 'python', pid: 2345, port: 5173, protocol: 'tcp', state: 'LISTEN' })
    ])
  })

  it('parses windows netstat output and attaches process names', () => {
    const rows = parseNetstatListeningTcp(
      `  TCP    0.0.0.0:3000     0.0.0.0:0      LISTENING       4321
  TCP    [::]:8080        [::]:0         LISTENING       8765
`,
      { 4321: 'node.exe', 8765: 'java.exe' }
    )

    expect(rows.map((row) => ({ pid: row.pid, port: row.port, command: row.command }))).toEqual([
      { pid: 4321, port: 3000, command: 'node.exe' },
      { pid: 8765, port: 8080, command: 'java.exe' }
    ])
  })

  it('filters by contains and regex without losing results on invalid regex', () => {
    const rows = [
      { id: '1', pid: 1, port: 3000, command: 'node', address: '127.0.0.1', protocol: 'tcp' as const, state: 'LISTEN' as const },
      { id: '2', pid: 2, port: 5432, command: 'postgres', address: '127.0.0.1', protocol: 'tcp' as const, state: 'LISTEN' as const }
    ]

    expect(filterPortProcesses(rows, 'node').items.map((row) => row.pid)).toEqual([1])
    expect(filterPortProcesses(rows, '/^post/i').items.map((row) => row.pid)).toEqual([2])
    const invalid = filterPortProcesses(rows, '/[/')
    expect(invalid.items).toHaveLength(2)
    expect(invalid.error).toContain('Invalid regular expression')
  })

  it('sorts port search results by match strength and supports auto regex', () => {
    const rows = [
      { id: '3', pid: 3, port: 13000, command: 'worker-3000', address: '127.0.0.1:13000', protocol: 'tcp' as const, state: 'LISTEN' as const },
      { id: '2', pid: 2, port: 3001, command: 'vite', address: '127.0.0.1:3001', protocol: 'tcp' as const, state: 'LISTEN' as const },
      { id: '1', pid: 1, port: 3000, command: 'node', address: '127.0.0.1:3000', protocol: 'tcp' as const, state: 'LISTEN' as const },
      { id: '4', pid: 4, port: 8080, command: 'java', address: '127.0.0.1:8080', protocol: 'tcp' as const, state: 'LISTEN' as const }
    ]

    expect(filterPortProcesses(rows, '3000').items.map((row) => row.id)).toEqual(['1', '3'])
    expect(filterPortProcesses(rows, '300').items.map((row) => row.id)).toEqual(['1', '2', '3'])
    expect(filterPortProcesses(rows, 'node|java').items.map((row) => row.id)).toEqual(['1', '4'])
  })

  it('filters a macOS lsof IPv6 listener by port number', () => {
    const rows = parseLsofListeningTcp(`COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    87822 gdkmjd 18u IPv6 0xabcd      0t0  TCP [::1]:8081 (LISTEN)
`)

    expect(filterPortProcesses(rows, '8081').items).toEqual([
      expect.objectContaining({ pid: 87822, port: 8081, command: 'node' })
    ])
  })

  it('dedupes duplicate listeners by pid, port, and protocol while preserving addresses', () => {
    const rows = parseLsofListeningTcp(`COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
rapportd    641 gdkmjd   10u  IPv4 0xf89c      0t0  TCP *:49152 (LISTEN)
rapportd    641 gdkmjd   11u  IPv6 0x1043      0t0  TCP *:49152 (LISTEN)
node      13511 gdkmjd   15u  IPv4 0x83a9      0t0  TCP 127.0.0.1:18789 (LISTEN)
node      13511 gdkmjd   16u  IPv6 0xd301      0t0  TCP [::1]:18789 (LISTEN)
`)

    expect(rows).toHaveLength(2)
    expect(rows).toEqual([
      expect.objectContaining({ id: '641:49152:tcp', pid: 641, port: 49152, address: '*:49152' }),
      expect.objectContaining({ id: '13511:18789:tcp', pid: 13511, port: 18789, address: '127.0.0.1:18789 · [::1]:18789' })
    ])
  })

  it('dedupes arbitrary scan rows without expanding search matches', () => {
    const rows = dedupePortProcesses([
      { id: 'a', pid: 1, port: 8092, command: 'node', address: '127.0.0.1:8092', protocol: 'tcp' as const, state: 'LISTEN' as const },
      { id: 'b', pid: 1, port: 8092, command: 'node', address: '[::1]:8092', protocol: 'tcp' as const, state: 'LISTEN' as const },
      { id: 'c', pid: 2, port: 18789, command: 'node', address: '[::1]:18789', protocol: 'tcp' as const, state: 'LISTEN' as const }
    ])

    expect(rows.map((row) => ({ id: row.id, address: row.address }))).toEqual([
      { id: '1:8092:tcp', address: '127.0.0.1:8092 · [::1]:8092' },
      { id: '2:18789:tcp', address: '[::1]:18789' }
    ])
    expect(filterPortProcesses(rows, '809').items.map((row) => row.id)).toEqual(['1:8092:tcp'])
  })

  it('keeps recent search history deduped and capped', () => {
    let history: string[] = []
    for (let i = 0; i < 35; i += 1) {
      history = recordSearchHistory(history, `port-${i}`)
    }
    history = recordSearchHistory(history, 'port-20')

    expect(history).toHaveLength(30)
    expect(history[0]).toBe('port-20')
    expect(history.filter((item) => item === 'port-20')).toHaveLength(1)
    expect(history.includes('port-0')).toBe(false)
  })

  it('expands port groups and verifies selected pid still owns target port', () => {
    expect(buildPortGroupTargets({ id: 'dev', name: 'Dev', color: '#00a676', entries: ['3000', '5173-5175', 'bad'], folderId: null, sortOrder: 1 })).toEqual([
      3000,
      5173,
      5174,
      5175
    ])

    expect(shouldProcessMatchVerifiedPort({ pid: 9, port: 5173 }, [{ pid: 9, port: 5173 }, { pid: 9, port: 5174 }])).toBe(true)
    expect(shouldProcessMatchVerifiedPort({ pid: 9, port: 3000 }, [{ pid: 9, port: 5173 }])).toBe(false)
  })

  it('matches port groups by port, range, and regex over full process text', () => {
    const rows = [
      { id: 'node', pid: 11, port: 3000, command: 'node', address: '*:3000', user: 'dev', protocol: 'tcp' as const, state: 'LISTEN' as const },
      { id: 'vite', pid: 12, port: 5174, command: 'vite', address: '*:5174', user: 'dev', protocol: 'tcp' as const, state: 'LISTEN' as const },
      { id: 'java', pid: 13, port: 9000, command: 'java', address: '*:9000', user: 'svc', protocol: 'tcp' as const, state: 'LISTEN' as const }
    ]

    expect(matchPortGroupProcesses(rows, { id: 'dev', name: 'Dev', color: '#00A676', entries: ['3000', '5173-5175', '/java|svc/i'], folderId: null, sortOrder: 1 }).map((row) => row.id)).toEqual([
      'node',
      'vite',
      'java'
    ])
  })

  it('flattens searchable group folders and hides collapsed child groups', () => {
    const folders = [
      { id: 'dev', name: 'Dev Folder', color: '#00A676', sortOrder: 1 },
      { id: 'ops', name: 'Ops Folder', color: '#2F80ED', sortOrder: 2 }
    ]
    const groups = [
      { id: 'web', name: 'Web', color: '#00A676', entries: ['3000'], folderId: 'dev', sortOrder: 1 },
      { id: 'api', name: 'Api', color: '#2F80ED', entries: ['9000'], folderId: 'dev', sortOrder: 2 },
      { id: 'root', name: 'Root', color: '#D64545', entries: ['7000'], folderId: null, sortOrder: 3 }
    ]

    expect(flattenPortGroupTargets(groups, folders, ['dev'], '').map((row) => row.rowId)).toEqual([
      'folder:dev',
      'folder:ops',
      'group:root'
    ])

    expect(flattenPortGroupTargets(groups, folders, ['dev'], 'api').map((row) => row.rowId)).toEqual([
      'folder:dev',
      'group:api'
    ])
  })

  it('matches a folder target by the union of child group rules and moves groups into folders', () => {
    const folders = [{ id: 'dev', name: 'Dev Folder', color: '#00A676', sortOrder: 1 }]
    const groups = [
      { id: 'web', name: 'Web', color: '#00A676', entries: ['3000'], folderId: 'dev', sortOrder: 1 },
      { id: 'api', name: 'Api', color: '#2F80ED', entries: ['9000'], folderId: 'dev', sortOrder: 2 },
      { id: 'root', name: 'Root', color: '#D64545', entries: ['7000'], folderId: null, sortOrder: 3 }
    ]
    const rows = [
      { id: 'node', pid: 11, port: 3000, command: 'node', address: '*:3000', protocol: 'tcp' as const, state: 'LISTEN' as const },
      { id: 'api', pid: 12, port: 9000, command: 'api', address: '*:9000', protocol: 'tcp' as const, state: 'LISTEN' as const },
      { id: 'root', pid: 13, port: 7000, command: 'root', address: '*:7000', protocol: 'tcp' as const, state: 'LISTEN' as const }
    ]

    expect(matchPortGroupTargetProcesses(rows, { kind: 'folder', id: 'dev' }, groups, folders).map((row) => row.id)).toEqual([
      'node',
      'api'
    ])

    expect(movePortGroupToFolder(groups, 'root', 'dev').find((group) => group.id === 'root')).toMatchObject({
      folderId: 'dev',
      sortOrder: 3
    })
  })
})
