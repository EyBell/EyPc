import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require_ = createRequire(import.meta.url)
const native = require_(resolve(process.cwd(), 'preload/orca/native-state.cjs')) as {
  collectPinnedTabIds: (session: unknown) => Set<string>
  createNativeStateReader: (dependencies: Record<string, unknown>) => { pinnedTabIds: () => Set<string> }
}

const TAB = '2e625d72-50d4-473d-854d-e6faa62e4039'

describe('Orca native session pin index', () => {
  it('collects only isPinned tab ids and ignores titles', () => {
    const ids = native.collectPinnedTabIds({
      tabsByWorktree: {
        'repo::/tmp': [
          { id: TAB, isPinned: true, title: 'SECRET TITLE', customTitle: 'SECRET' },
          { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', isPinned: false, title: 'other' }
        ]
      },
      unifiedTabs: {
        'repo::/tmp': [{ id: TAB, isPinned: true, label: 'SECRET LABEL' }]
      }
    })
    expect([...ids]).toEqual([TAB])
    expect(JSON.stringify([...ids])).not.toMatch(/SECRET/)
  })

  it('rereads when the session file mtime changes', () => {
    const files: Record<string, { text: string; mtimeMs: number }> = {
      '/tmp/orca/orca-profile-index.json': {
        text: JSON.stringify({ activeProfileId: 'local-default' }),
        mtimeMs: 1
      },
      '/tmp/orca/profiles/local-default/orca-data.json': {
        text: JSON.stringify({ workspaceSession: { tabsByWorktree: { a: [{ id: TAB, isPinned: true }] } } }),
        mtimeMs: 10
      }
    }
    const io = {
      readFileSync: (file: string) => files[file]?.text ?? '',
      statSync: (file: string) => {
        const row = files[file]
        if (!row) throw new Error('missing')
        return { mtimeMs: row.mtimeMs }
      }
    }
    const reader = native.createNativeStateReader({
      fs: io,
      env: { ORCA_USER_DATA_PATH: '/tmp/orca' },
      homedir: '/tmp'
    })
    expect(reader.pinnedTabIds().has(TAB)).toBe(true)
    files['/tmp/orca/profiles/local-default/orca-data.json'] = {
      text: JSON.stringify({ workspaceSession: { tabsByWorktree: { a: [{ id: TAB, isPinned: false }] } } }),
      mtimeMs: 11
    }
    expect(reader.pinnedTabIds().has(TAB)).toBe(false)
  })
})
