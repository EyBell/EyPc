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
  it('keeps fixed quadrants when token remains after weekly exhaustion', () => {
    const grid = resolveCompactQuotaGridPresentation(SAMPLE, { enabled: true, status: 'ok', updatedAt: 1 })
    expect(grid.layout).toBe('rows')
    expect(grid.rows.map((row) => row.id)).toEqual(['top', 'bottom'])
    expect(grid.rows[0].slots).toEqual(['token', 'grok'])
    expect(grid.rows[1].slots).toEqual(['cursor-models', 'cursor-other'])
    expect(grid.cells.map((cell) => cell.key)).toEqual(['token', 'grok', 'cursor-models', 'cursor-other'])
    expect(grid.cells[0]).toMatchObject({ key: 'token', kind: 'token', text: '6.9W' })
  })

  it('centres the surviving bottom cell when the top row collapses', () => {
    const grid = resolveCompactQuotaGridPresentation([
      { provider: 'codex', windows: [{ name: '7 days', remaining: 0 }] },
      { provider: 'grok', windows: [{ name: '7 days', remaining: 0 }] },
      {
        provider: 'cursor',
        windows: [
          { name: 'Cursor Models', remaining: 0 },
          { name: 'Other Models', remaining: 19.5 }
        ]
      }
    ], { enabled: true, status: 'ok', updatedAt: 1 })
    expect(grid.layout).toBe('one')
    expect(grid.rows).toHaveLength(1)
    expect(grid.rows[0]).toMatchObject({ id: 'bottom', slots: ['cursor-other'] })
    expect(grid.cells[0]).toMatchObject({ key: 'cursor-other', label: 'A', text: '20' })
  })

  it('accepts custom cursor grid labels', () => {
    const grid = resolveCompactQuotaGridPresentation(SAMPLE, {
      enabled: true,
      status: 'ok',
      updatedAt: 1,
      labels: { cursorModels: 'M', cursorOther: 'X' }
    })
    expect(grid.rows[1].cells[0]).toMatchObject({ label: 'M' })
    expect(grid.rows[1].cells[1]).toMatchObject({ label: 'X' })
  })

  it('omits token when codex weekly remaining is still available and keeps bottom row intact', () => {
    const grid = resolveCompactQuotaGridPresentation([
      { provider: 'codex', windows: [{ name: '7 days', remaining: 42 }], balance: '100 credits' },
      ...SAMPLE.slice(1)
    ], { enabled: true, status: 'ok', updatedAt: 1 })
    expect(grid.layout).toBe('rows')
    expect(grid.rows[0].slots).toEqual(['grok'])
    expect(grid.rows[1].slots).toEqual(['cursor-models', 'cursor-other'])
    expect(grid.cells.some((cell) => cell.key === 'token')).toBe(false)
  })

  it('omits token when weekly is exhausted without a positive balance', () => {
    const grid = resolveCompactQuotaGridPresentation([
      { provider: 'codex', windows: [{ name: '7 days', remaining: 0 }], balance: '0 credits' },
      ...SAMPLE.slice(1)
    ], { enabled: true, status: 'ok', updatedAt: 1 })
    expect(grid.rows[0].slots).toEqual(['grok'])
    expect(grid.cells.some((cell) => cell.key === 'token')).toBe(false)
  })

  it('shows token when the weekly window is missing and balance remains', () => {
    const grid = resolveCompactQuotaGridPresentation([
      { provider: 'codex', balance: '68541.61 credits', windows: [] },
      ...SAMPLE.slice(1)
    ], { enabled: true, status: 'ok', updatedAt: 1 })
    expect(grid.layout).toBe('rows')
    expect(grid.rows[0].slots).toEqual(['token', 'grok'])
    expect(grid.cells[0]).toMatchObject({ key: 'token', kind: 'token', text: '6.9W' })
  })

  it('drops an empty row instead of inventing placeholder cells', () => {
    const grid = resolveCompactQuotaGridPresentation([
      { provider: 'codex', windows: [{ name: '7 days', remaining: 0 }], balance: '12000 credits' },
      { provider: 'grok', windows: [{ name: '7 days', remaining: 0 }] },
      {
        provider: 'cursor',
        windows: [
          { name: 'Cursor Models', remaining: 55 },
          { name: 'Other Models', remaining: 0 }
        ]
      }
    ], { enabled: true, status: 'ok', updatedAt: 1 })
    expect(grid.layout).toBe('rows')
    expect(grid.rows.map((row) => row.slots)).toEqual([['token'], ['cursor-models']])
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


const enabled = { enabled: true, status: 'ok' as const, updatedAt: 1 }

describe('remote magpie quota', () => {
  const mixed = [
    { provider: 'codex', windows: [{ name: '7 days', remaining: 80, resetsAt: '2026-11-01T00:00:00Z' }], balance: '99999 credits' },
    { provider: 'grok', windows: [{ name: '7 days', remaining: 11, resetsAt: '2026-11-01T00:00:00Z' }] },
    {
      provider: 'cursor',
      windows: [
        { name: 'Cursor Models', remaining: 11, resetsAt: '2026-11-01T00:00:00Z' },
        { name: 'Other Models', remaining: 11, resetsAt: '2026-11-01T00:00:00Z' }
      ]
    },
    { provider: 'remote-magpie/codex', plan: 'free', windows: [{ name: '30 days', remaining: 100, resetsAt: '2026-12-01T00:00:00Z' }] },
    {
      provider: 'remote-magpie/codex',
      plan: 'promax',
      windows: [{ name: '7 days', remaining: 0, resetsAt: '2026-11-04T00:00:00Z' }],
      balance: '12000 credits'
    },
    { provider: 'remote-magpie/grok', windows: [{ name: '7 days', remaining: 85, resetsAt: '2026-11-09T00:00:00Z' }] },
    {
      provider: 'remote-magpie/cursor',
      windows: [
        { name: 'Cursor Models', remaining: 70.157, resetsAt: '2026-11-17T05:52:21Z' },
        { name: 'Other Models', remaining: 0, resetsAt: '2026-11-17T05:52:21Z' },
        { name: 'Grok Bot', remaining: 84 },
        { name: 'Free usage', remaining: 100 },
        { name: 'Total', remaining: 67 }
      ]
    },
    { provider: 'remote-magpie/kimi-work', windows: [{ name: '7 days', remaining: 90 }] },
    { provider: 'remote-magpie/opencode-go', windows: [{ name: '7 days', remaining: 83 }] },
    { provider: 'remote-magpie/deepseek', balance: '¥32.96', windows: [] }
  ]

  it('uses remote rows for the grid, expanded cards and reset lines', () => {
    const grid = resolveCompactQuotaGridPresentation(mixed, enabled)
    expect(grid.cells.map((cell) => [cell.key, cell.text])).toEqual([
      ['token', '1.2W'],
      ['grok', '85'],
      ['cursor-models', '70']
    ])
    const cards = buildMagpieQuotaExpandCards(mixed)
    expect(cards.map((card) => card.key)).toEqual([
      'magpie-codex-weekly',
      'magpie-grok-weekly',
      'magpie-cursor-models',
      'magpie-cursor-other'
    ])
    expect(cards[0]).toMatchObject({ valueText: '1.2W', resetAt: Date.parse('2026-11-04T00:00:00Z') })
    expect(cards[1].resetAt).toBe(Date.parse('2026-11-09T00:00:00Z'))
    const lines = buildMagpieQuotaResetLines(mixed)
    expect(lines.map((line) => line.resetAt)).toEqual([
      Date.parse('2026-11-04T00:00:00Z'),
      Date.parse('2026-11-09T00:00:00Z'),
      Date.parse('2026-11-17T05:52:21Z')
    ])
  })

  it('hides token while another paid codex account still has weekly quota', () => {
    const providers = [
      { provider: 'remote-magpie/codex', plan: 'promax', windows: [{ name: '7 days', remaining: 0, resetsAt: '2026-11-04T00:00:00Z' }], balance: '12000 credits' },
      { provider: 'remote-magpie/codex', plan: 'plus', windows: [{ name: '7 days', remaining: 40, resetsAt: '2026-11-08T00:00:00Z' }] }
    ]
    const grid = resolveCompactQuotaGridPresentation(providers, enabled)
    expect(grid.cells.some((cell) => cell.key === 'token')).toBe(false)
    expect(buildMagpieQuotaExpandCards(providers)[0]).toMatchObject({
      valueText: '40',
      resetAt: Date.parse('2026-11-08T00:00:00Z')
    })
  })

  it('rotates among paid codex accounts by last, promax, remaining, then list order', () => {
    const withLast = [
      { provider: 'remote-magpie/codex', plan: 'plus', windows: [{ name: '7 days', remaining: 90 }] },
      { provider: 'remote-magpie/codex', plan: 'promax', windows: [{ name: '7 days', remaining: 10 }] },
      { provider: 'remote-magpie/codex', plan: 'plus', last: true, windows: [{ name: '7 days', remaining: 15 }] }
    ]
    expect(buildMagpieQuotaExpandCards(withLast)[0].valueText).toBe('15')

    const promaxFirst = [
      { provider: 'remote-magpie/codex', plan: 'plus', windows: [{ name: '7 days', remaining: 90 }] },
      { provider: 'remote-magpie/codex', plan: ' ProMax ', windows: [{ name: '7 days', remaining: 10 }] }
    ]
    expect(buildMagpieQuotaExpandCards(promaxFirst)[0].valueText).toBe('10')

    const higherRemaining = [
      { provider: 'remote-magpie/codex', plan: 'plus', windows: [{ name: '7 days', remaining: 20 }] },
      { provider: 'remote-magpie/codex', plan: 'team', windows: [{ name: '7 days', remaining: 80 }] }
    ]
    expect(buildMagpieQuotaExpandCards(higherRemaining)[0].valueText).toBe('80')

    const earlierRow = [
      { provider: 'remote-magpie/codex', plan: 'plus', windows: [{ name: '7 days', remaining: 40, resetsAt: '2026-11-05T00:00:00Z' }] },
      { provider: 'remote-magpie/codex', plan: 'team', windows: [{ name: '7 days', remaining: 40, resetsAt: '2026-11-06T00:00:00Z' }] }
    ]
    expect(buildMagpieQuotaResetLines(earlierRow)[0].resetAt).toBe(Date.parse('2026-11-05T00:00:00Z'))
  })

  it('uses the promax balance before a last-marked balance after every weekly window is exhausted', () => {
    const providers = [
      { provider: 'remote-magpie/codex', plan: 'plus', last: true, windows: [{ name: '7 days', remaining: 0 }], balance: '8500 credits' },
      { provider: 'remote-magpie/codex', plan: 'promax', windows: [{ name: '7 days', remaining: 0 }], balance: '12000 credits' }
    ]
    const grid = resolveCompactQuotaGridPresentation(providers, enabled)
    expect(grid.cells[0]).toMatchObject({ key: 'token', text: '1.2W' })
  })

  it('ignores a free account and still shows an unlabeled paid balance', () => {
    const onlyFree = [
      { provider: 'remote-magpie/codex', plan: ' Free ', windows: [{ name: '7 days', remaining: 100 }], balance: '12000 credits' }
    ]
    expect(resolveCompactQuotaGridPresentation(onlyFree, enabled).cells).toEqual([])

    const unlabeled = [
      { provider: 'remote-magpie/codex', windows: [{ name: '7 days', remaining: 0 }], balance: '12000 credits' }
    ]
    expect(resolveCompactQuotaGridPresentation(unlabeled, enabled).cells[0]).toMatchObject({ key: 'token', text: '1.2W' })
  })

  it('uses a positive local row without taking a later remote grok or cursor row', () => {
    const grokOnly = [
      { provider: 'codex', windows: [{ name: '7 days', remaining: 0 }], balance: '12000 credits' },
      { provider: 'remote-magpie/grok', windows: [{ name: '7 days', remaining: 0 }] },
      { provider: 'remote-magpie/grok', windows: [{ name: '7 days', remaining: 70 }] }
    ]
    const grokGrid = resolveCompactQuotaGridPresentation(grokOnly, enabled)
    expect(grokGrid.cells).toEqual([expect.objectContaining({ key: 'token', text: '1.2W' })])
    expect(buildMagpieQuotaExpandCards(grokOnly).map((card) => [card.key, card.valueText])).toEqual([
      ['magpie-codex-weekly', '1.2W'],
      ['magpie-grok-weekly', '0']
    ])

    const cursorRows = [
      {
        provider: 'remote-magpie/cursor',
        windows: [
          { name: 'Cursor Models', remaining: 0 },
          { name: 'Other Models', remaining: 12.4 }
        ]
      },
      {
        provider: 'remote-magpie/cursor',
        windows: [
          { name: 'Cursor Models', remaining: 90 },
          { name: 'Other Models', remaining: 90 }
        ]
      }
    ]
    expect(resolveCompactQuotaGridPresentation(cursorRows, enabled).cells).toEqual([
      expect.objectContaining({ key: 'cursor-other', text: '12' })
    ])
  })

  it('does not turn a non-numeric window into zero', () => {
    const providers = [
      { provider: 'remote-magpie/grok', windows: [{ name: '7 days', remaining: Number.NaN }] }
    ]
    expect(resolveCompactQuotaGridPresentation(providers, enabled).cells).toEqual([])
    expect(buildMagpieQuotaExpandCards(providers)).toEqual([])
  })
})
