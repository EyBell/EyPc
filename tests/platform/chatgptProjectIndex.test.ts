import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const indexModule = require('../../preload/codex/chatgpt-project-index.cjs') as {
  CHATGPT_PROJECT_INDEX_MAX_AGE_MS: number
  CHATGPT_PROJECT_INDEX_LIMIT: number
  createChatgptProjectIndex(dependencies?: Record<string, unknown>): {
    parseSidebarProjects(source: unknown): Array<{ id: string; key: string; name: string; kind: string }>
    parseCatalogBindings(rows: unknown): Array<{ threadId: string; projectId: string; recencyMs: number }>
    projectForThread(threadId: string): { id: string; key: string; name: string } | null
    admitIntoScan(input: Record<string, unknown>): Promise<string[]>
    appendProjectCards(projects: Array<Record<string, unknown>>, alias: (project: Record<string, unknown>) => string): Array<Record<string, unknown>>
  }
}

const THREAD_A = '11111111-1111-4111-8111-111111111111'
const THREAD_B = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = 'g-p-abcdef1234567890'
const crypto = require('node:crypto')

function validThreadId(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function stateText() {
  return JSON.stringify({
    'electron-persisted-atom-state': {
      'chatgpt-sidebar-state-v1-account': JSON.stringify({
        account: {
          projects: [
            { id: PROJECT_ID, name: 'New Project', updatedAt: '2026-10-02T08:00:00.000Z' },
            { id: 'local-abc', name: 'EyPc' }
          ]
        }
      })
    }
  })
}

function indexFor(rows: Array<Record<string, unknown>>, readTurns?: (threadId: string) => Promise<unknown>) {
  return indexModule.createChatgptProjectIndex({
    crypto,
    validThreadId,
    readStateText: () => stateText(),
    queryCatalog: () => rows,
    readTurns,
    record: () => {}
  })
}

describe('chatgpt project index', () => {
  it('reads Projects separately from Workspace rows', () => {
    const index = indexFor([])
    const projects = index.parseSidebarProjects(JSON.parse(JSON.parse(stateText())['electron-persisted-atom-state']['chatgpt-sidebar-state-v1-account']))
    expect(projects.map((project) => project.name)).toEqual(['New Project'])
    expect(projects[0].kind).toBe('chatgpt')
    expect(projects[0].key).toMatch(/^[a-f0-9]{32}$/)
    const bindings = index.parseCatalogBindings([
      { hostKind: 'chatgpt', threadId: THREAD_A, projectId: PROJECT_ID, recencyMs: 1_700_000_000_000 },
      { hostKind: 'local', threadId: THREAD_B, projectId: PROJECT_ID, recencyMs: 1_700_000_000_000 },
      { hostKind: 'chatgpt', threadId: THREAD_B, projectId: 'local-1', recencyMs: 1_700_000_000_000 }
    ])
    expect(bindings.map((binding) => binding.threadId)).toEqual([THREAD_A])
  })

  it('admits a recent Projects thread only after a real turn', async () => {
    const now = Date.now()
    const index = indexFor([
      { hostKind: 'chatgpt', threadId: THREAD_A, projectId: PROJECT_ID, recencyMs: now - 60_000 },
      { hostKind: 'chatgpt', threadId: THREAD_B, projectId: PROJECT_ID, recencyMs: now - indexModule.CHATGPT_PROJECT_INDEX_MAX_AGE_MS - 1000 }
    ], async (threadId) => threadId === THREAD_A
      ? { data: [{ status: 'completed', startedAt: now - 50_000, completedAt: now - 10_000 }] }
      : { data: [] })
    const assignments = new Map<string, { reason: string }>([[THREAD_B, { reason: 'assignment' }]])
    const publicRows: Array<{ id: string }> = []
    const turns = { latest: new Map() }
    const admitted = await index.admitIntoScan({ rows: [], assignments, publicRows, turns, nowMs: now })
    expect(admitted).toEqual([THREAD_A])
    expect(assignments.get(THREAD_A)?.reason).toBe('chatgpt-project')
    expect(publicRows.map((row) => row.id)).toEqual([THREAD_A])
    expect(turns.latest.get(THREAD_A)?.status).toBe('completed')
    expect(assignments.get(THREAD_B)?.reason).toBe('assignment')
  })

  it('keeps a Projects card out of the Workspace remove kind', () => {
    const index = indexFor([])
    const seen: Array<Record<string, unknown>> = []
    const projects = index.appendProjectCards([{ key: 'workspace', name: 'EyPc', kind: 'project', nativeOrder: 1 }], (project) => {
      seen.push(project)
      return 'cp_testalias0000000001'
    })
    expect(seen.map((project) => project.kind)).toEqual(['chatgpt'])
    expect(projects.map((project) => project.name)).toEqual(['EyPc', 'New Project'])
    expect(index.projectForThread(THREAD_A)).toBeNull()
  })
  it('does not admit a bound thread without a verified turn or override Workspace ownership', async () => {
    const now = Date.now()
    const readTurns = async () => ({ data: [] })
    const index = indexFor([
      { hostKind: 'chatgpt', threadId: THREAD_A, projectId: PROJECT_ID, recencyMs: now },
      { hostKind: 'chatgpt', threadId: THREAD_B, projectId: PROJECT_ID, recencyMs: now }
    ], readTurns)
    const workspace = { reason: 'assignment' }
    const assignments = new Map([[THREAD_B, workspace]])
    const publicRows: Array<{ id: string }> = []
    const turns = { latest: new Map() }
    expect(await index.admitIntoScan({ assignments, publicRows, turns, nowMs: now })).toEqual([])
    expect(assignments.get(THREAD_B)).toBe(workspace)
    expect(assignments.has(THREAD_A)).toBe(false)
    expect(publicRows).toEqual([])
    expect(turns.latest.size).toBe(0)
  })

  it('keeps the ordinary inventory usable when the catalog is unavailable', async () => {
    const index = indexModule.createChatgptProjectIndex({
      crypto, validThreadId, readStateText: () => stateText(),
      queryCatalog: () => { throw new Error('catalog unavailable') },
      readTurns: async () => { throw new Error('must not request an unbound thread') }, record: () => {}
    })
    const assignments = new Map([[THREAD_A, { reason: 'assignment' }]])
    const publicRows = [{ id: THREAD_A }]
    const turns = { latest: new Map() }
    expect(await index.admitIntoScan({ assignments, publicRows, turns })).toEqual([])
    expect(publicRows).toEqual([{ id: THREAD_A }])
    expect(assignments.size).toBe(1)
  })

})
