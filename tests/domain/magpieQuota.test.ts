import { describe, expect, it } from 'vitest'
import {
  buildMagpieQuotaExpandCards,
  buildMagpieQuotaResetLines,
  formatMagpieQuotaResetInline,
  formatMagpieTokenBalance,
  magpieResetCountdownText,
  magpieResetCompactText,
  resolveCompactQuotaGridPresentation
} from '../../src/domain/magpieQuota'

const SAMPLE = [
  {
    provider: 'codex',
    windows: [{ name: '7 days', remaining: 0, resetsAt: '2026-11-02T14:09:14+08:00' }],
    balance: '68541.61 credits'
  },
  {
    provider: 'grok',
    windows: [{ name: '7 days', remaining: 85, resetsAt: '2026-11-02T05:47:38.911Z' }]
  },
  {
    provider: 'cursor',
    windows: [
      { name: 'Cursor Models', remaining: 93.4, resetsAt: '2026-11-17T05:52:21Z' },
      { name: 'Other Models', remaining: 19.5, resetsAt: '2026-11-17T05:52:21Z' }
    ]
  }
]

describe('magpie quota grid', () => {
  it('shows token balance in the top-left when codex weekly is exhausted', () => {
    const grid = resolveCompactQuotaGridPresentation(SAMPLE, { enabled: true, status: 'ok', updatedAt: 1 })
    expect(grid.cells[0]).toMatchObject({ key: 'token', kind: 'token', text: '6.9W' })
    expect(grid.cells[1]).toMatchObject({ key: 'grok', text: '85' })
    expect(grid.cells[2]).toMatchObject({ key: 'cursor-models', label: 'C', text: '93' })
    expect(grid.cells[3]).toMatchObject({ key: 'cursor-other', label: 'O', text: '20' })
  })

  it('uses a placeholder instead of repeating codex weekly percent', () => {
    const grid = resolveCompactQuotaGridPresentation([
      { provider: 'codex', windows: [{ name: '7 days', remaining: 42 }], balance: '100 credits' },
      ...SAMPLE.slice(1)
    ], { enabled: true, status: 'ok', updatedAt: 1 })
    expect(grid.cells[0]).toMatchObject({ key: 'token', kind: 'placeholder', text: '—' })
  })

  it('formats token balances compactly', () => {
    expect(formatMagpieTokenBalance('68541.61 credits')).toBe('6.9W')
    expect(formatMagpieTokenBalance('12000 credits')).toBe('1.2W')
    expect(formatMagpieTokenBalance('8500 credits')).toBe('8.5k')
    expect(formatMagpieTokenBalance('999 credits')).toBe('999')
  })

  it('builds expanded cards with reset timestamps', () => {
    const cards = buildMagpieQuotaExpandCards(SAMPLE)
    expect(cards.map((card) => card.key)).toEqual([
      'magpie-codex-weekly',
      'magpie-grok-weekly',
      'magpie-cursor-models',
      'magpie-cursor-other'
    ])
    expect(cards[1].resetAt).toBeGreaterThan(0)
    const now = Date.parse('2026-10-27T00:00:00Z')
    expect(magpieResetCountdownText(cards[1].resetAt, now)).toMatch(/重置/)
  })

  it('formats compact countdowns without inventing missing reset times', () => {
    const now = Date.parse('2026-10-27T00:00:00Z')
    expect(magpieResetCompactText(now + 120_000, now)).toBe('2分')
    expect(magpieResetCompactText(now + 3_600_000, now)).toBe('1时')
    expect(magpieResetCompactText(now + 5 * 86_400_000, now)).toBe('5天')
    expect(magpieResetCompactText(null, now)).toBe('—')
    expect(magpieResetCompactText(now - 1, now)).toBe('已重置')
  })

  it('merges cursor into one reset line', () => {
    const lines = buildMagpieQuotaResetLines(SAMPLE)
    expect(lines.map((line) => line.label)).toEqual(['Codex', 'Grok', 'Cursor'])
    expect(lines[2].resetAt).toBeGreaterThan(0)
    const text = formatMagpieQuotaResetInline(lines, Date.parse('2026-10-27T00:00:00Z'))
    expect(text).toContain('Codex')
    expect(text).toContain('Grok')
    expect(text).toContain('Cursor')
    expect(text.split('Cursor').length).toBe(2)
  })
})
