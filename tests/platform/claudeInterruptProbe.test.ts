import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const probeModule = require('../../preload/claude/interrupt-probe.cjs') as {
  createClaudeInterruptProbe(dependencies?: Record<string, unknown>): {
    claudeInterruptedAt(sessionId: string, turnStartedAt: number): number
  }
}

const SESSION_ID = '111b8713-7d26-41ef-9621-152fb988711e'
const TURN_STARTED_AT = Date.parse('2026-09-01T06:20:35.000Z')
const INTERRUPTED_AT = Date.parse('2026-09-01T06:20:38.549Z')

const roots: string[] = []

function projectsRoot(lines: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'eypc-claude-interrupt-'))
  roots.push(root)
  const slug = join(root, '-Users-tester-work-repo')
  mkdirSync(slug, { recursive: true })
  writeFileSync(join(slug, `${SESSION_ID}.jsonl`), `${lines.join('\n')}\n`)
  return root
}

function probe(root: string) {
  return probeModule.createClaudeInterruptProbe({
    fs: require('node:fs'),
    path: require('node:path'),
    projectsRoot: root
  })
}

const interruptLine = JSON.stringify({
  type: 'user',
  timestamp: '2026-09-01T06:20:38.549Z',
  message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] }
})
const promptLine = JSON.stringify({
  type: 'user',
  timestamp: '2026-09-01T06:22:24.000Z',
  message: { role: 'user', content: '继续' }
})
const toolResultLine = JSON.stringify({
  type: 'user',
  timestamp: '2026-09-01T06:20:36.000Z',
  message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] }
})
const attachmentLine = JSON.stringify({ type: 'attachment', timestamp: '2026-09-01T06:20:38.600Z' })

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('claude transcript interrupt probe', () => {
  it('reports the interrupt that closed the open turn, ignoring trailing attachments', () => {
    const root = projectsRoot([toolResultLine, interruptLine, attachmentLine])
    expect(probe(root).claudeInterruptedAt(SESSION_ID, TURN_STARTED_AT)).toBe(INTERRUPTED_AT)
  })

  it('yields no evidence while the turn is still running or after a newer prompt', () => {
    const running = projectsRoot([interruptLine, toolResultLine])
    // The last record is an ordinary tool result — the turn moved on.
    expect(probe(running).claudeInterruptedAt(SESSION_ID, TURN_STARTED_AT)).toBe(0)
    const resumed = projectsRoot([interruptLine, promptLine])
    expect(probe(resumed).claudeInterruptedAt(SESSION_ID, TURN_STARTED_AT)).toBe(0)
    // An interrupt from a PREVIOUS turn never closes the current one.
    const stale = projectsRoot([interruptLine])
    expect(probe(stale).claudeInterruptedAt(SESSION_ID, Date.parse('2026-09-01T06:22:00.000Z'))).toBe(0)
  })

  it('fails open on a missing transcript or root', () => {
    const root = mkdtempSync(join(tmpdir(), 'eypc-claude-interrupt-empty-'))
    roots.push(root)
    expect(probe(root).claudeInterruptedAt(SESSION_ID, TURN_STARTED_AT)).toBe(0)
    expect(probe('/nonexistent/eypc-claude').claudeInterruptedAt(SESSION_ID, TURN_STARTED_AT)).toBe(0)
  })
})
