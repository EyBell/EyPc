import { describe, expect, it } from 'vitest'
import {
  codexActionLaneId,
  codexActionRunCanArchive,
  formatCodexActionRunTimestamp,
  resolveCodexActionRunnerPriorityProject,
  sanitizeCodexActionLogTextForProjection
} from '../../src/domain/codexActionRunner'

describe('codexActionRunner domain contract', () => {
  it('builds a stable lane from project, environment and action', () => {
    expect(codexActionLaneId('project/a', 'dev env', 'Git Push')).toBe('project%2Fa:dev%20env:Git%20Push')
    expect(codexActionLaneId('project/a', 'dev env', 'Git Push')).toBe(codexActionLaneId('project/a', 'dev env', 'Git Push'))
  })

  it('allows reversible archive only after execution ends', () => {
    expect(codexActionRunCanArchive('completed')).toBe(true)
    expect(codexActionRunCanArchive('failed')).toBe(true)
    expect(codexActionRunCanArchive('stopped')).toBe(true)
    expect(codexActionRunCanArchive('interrupted')).toBe(true)
    expect(codexActionRunCanArchive('running')).toBe(false)
    expect(codexActionRunCanArchive('stopping')).toBe(false)
    expect(codexActionRunCanArchive('confirm-required')).toBe(false)
  })

  it('sanitizes terminal control data, private paths and common secrets', () => {
    const value = sanitizeCodexActionLogTextForProjection(
      '\u001b[31mFAIL\u001b[0m /Users/demo/project Authorization: Bearer abc token=secret https://user:pass@example.com',
      ['/Users/demo/project']
    )
    expect(value).toContain('FAIL <private-path>')
    expect(value).not.toContain('\u001b')
    expect(value).not.toContain('abc')
    expect(value).not.toContain('secret')
    expect(value).not.toContain('user:pass')
    expect(value).toContain('<redacted>')
  })

  it('uses a compact same-day timestamp and a dated historical timestamp', () => {
    const now = new Date(2026, 6, 31, 18, 0, 0).getTime()
    expect(formatCodexActionRunTimestamp(new Date(2026, 6, 31, 9, 8, 7).getTime(), now)).toBe('09:08:07')
    expect(formatCodexActionRunTimestamp(new Date(2026, 6, 30, 9, 8, 7).getTime(), now)).toBe('2026-07-30 09:08:07')
  })

  it('uses default, local pin, native pin and selected priority without falling through a stale higher target', () => {
    const projects = [
      { key: 'native', kind: 'project' as const, nativePinned: true, nativePinnedOrder: 0 },
      { key: 'selected', kind: 'project' as const, selected: true },
      { key: 'local', kind: 'project' as const }
    ]
    expect(resolveCodexActionRunnerPriorityProject({ defaultProjectKey: 'selected', localProjectKeys: ['local'], projects })?.key).toBe('selected')
    expect(resolveCodexActionRunnerPriorityProject({ defaultProjectKey: 'missing', localProjectKeys: ['local'], projects })).toBeNull()
    expect(resolveCodexActionRunnerPriorityProject({ localProjectKeys: ['local'], projects })?.key).toBe('local')
    expect(resolveCodexActionRunnerPriorityProject({ localProjectKeys: ['missing'], projects })).toBeNull()
    expect(resolveCodexActionRunnerPriorityProject({ projects })?.key).toBe('native')
    expect(resolveCodexActionRunnerPriorityProject({ projects: projects.filter((project) => project.key !== 'native') })?.key).toBe('selected')
  })
})
