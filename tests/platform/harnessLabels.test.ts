import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require_ = createRequire(import.meta.url)
const labels = require_(resolve(process.cwd(), 'preload/companion/harness-labels.cjs')) as {
  harnessLabel: (id: unknown) => string
  HARNESS_LABELS: Record<string, string>
}
const discovery = require_(resolve(process.cwd(), 'preload/codex/codexhost-discovery.cjs')) as {
  codexhostHarnessLabel: (id: unknown) => string
}

describe('global harness title abbreviations', () => {
  it('is the single table CodexHost and Orca both read', () => {
    expect(labels.harnessLabel('grok')).toBe('gr')
    expect(labels.harnessLabel('claude')).toBe('cc')
    expect(labels.harnessLabel('claude-code')).toBe('cc')
    expect(labels.harnessLabel('cursor')).toBe('cs')
    expect(labels.harnessLabel('devin')).toBe('dv')
    expect(discovery.codexhostHarnessLabel('grok')).toBe(labels.harnessLabel('grok'))
    expect(discovery.codexhostHarnessLabel('claude-code')).toBe(labels.harnessLabel('claude-code'))
  })

  it('does not invent letters for an unknown host such as Paseo', () => {
    expect(labels.harnessLabel('paseo')).toBe('paseo')
    expect(Object.prototype.hasOwnProperty.call(labels.HARNESS_LABELS, 'paseo')).toBe(false)
  })
})
