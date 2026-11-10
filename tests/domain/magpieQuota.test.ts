import { describe, expect, it } from 'vitest'
import {
  buildMagpieQuotaExpandCards,
  buildMagpieQuotaResetLines,
  formatMagpieQuotaResetInline,
  formatMagpieTokenBalance,
  hasMagpieAgentQuota,
  magpieResetCountdownText,
  magpieResetCompactText,
  resolveCompactQuotaGridPresentation,
  resolveMagpieRemoteLimit,
  type MagpieQuotaProvider,
  type MagpieQuotaWindow
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

function remoteLimitCard(
  windows: MagpieQuotaWindow[] = [{
    name: 'Daily tokens',
    remaining: 67.49,
    amount: 123.4,
    limit: 1000,
    unit: 'tokens',
    resetsAt: '2026-11-11T00:00:00Z'
  }],
  patch: Partial<MagpieQuotaProvider> = {}
): MagpieQuotaProvider {
  return { provider: 'remote-magpie/~keys', kind: 'plan', windows, ...patch }
}

describe('magpie remote key limits', () => {
  it('keeps the explicit unrounded remaining value ahead of the amount calculation', () => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard()], enabled)).toEqual({
      remainingPercent: 67.49,
      used: 123.4,
      limit: 1000,
      unit: 'tokens',
      name: 'Daily tokens',
      resetAt: Date.parse('2026-11-11T00:00:00Z'),
      stale: false
    })
  })

  it.each(['tokens', 'USD'])('accepts an explicit %s percentage without inventing missing amounts', (unit) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard([{ name: 'Daily', remaining: 23.456, unit }])]))
      .toEqual({
        remainingPercent: 23.456,
        used: null,
        limit: null,
        unit,
        name: 'Daily',
        resetAt: null,
        stale: false
      })
  })

  it.each([
    [{ amount: 0 }, { used: 0, limit: null }],
    [{ limit: 200 }, { used: null, limit: 200 }]
  ])('retains independently supplied amount fields alongside an explicit percentage: %j', (patch, expected) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Daily', remaining: 50, unit: 'tokens', ...patch }
    ])])).toMatchObject({ remainingPercent: 50, ...expected })
  })

  it.each(['tokens', 'USD'])('calculates an unrounded %s percentage from a finite amount and total', (unit) => {
    const reading = resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Daily', amount: 123.4, limit: 200, unit }
    ])])
    expect(reading).toMatchObject({ used: 123.4, limit: 200, unit })
    expect(reading?.remainingPercent).toBeCloseTo(38.3, 10)
  })

  it.each([0, 100])('keeps a real explicit %s percent endpoint', (remaining) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Daily', remaining, unit: 'tokens' }
    ])])?.remainingPercent).toBe(remaining)
  })

  it.each([
    [0, 100],
    [200, 0],
    [250, 0]
  ])('calculates the exhausted or unused boundary for amount %s', (amount, expected) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Daily', amount, limit: 200, unit: 'tokens' }
    ])])?.remainingPercent).toBe(expected)
  })

  it.each([
    { remaining: Number.NaN },
    { remaining: Number.POSITIVE_INFINITY },
    { remaining: Number.NEGATIVE_INFINITY },
    { remaining: -0.01 },
    { remaining: 100.01 },
    { remaining: '50' },
    { remaining: null },
    { remaining: false },
    { amount: Number.NaN },
    { amount: Number.POSITIVE_INFINITY },
    { amount: Number.NEGATIVE_INFINITY },
    { amount: -1 },
    { amount: '100' },
    { amount: null },
    { limit: Number.NaN },
    { limit: Number.POSITIVE_INFINITY },
    { limit: Number.NEGATIVE_INFINITY },
    { limit: -1 },
    { limit: 0 },
    { limit: '200' },
    { limit: null }
  ])('rejects a supplied invalid numeric field without using another calculation: %j', (patch) => {
    const window = {
      name: 'Daily',
      remaining: 50,
      amount: 100,
      limit: 200,
      unit: 'tokens',
      ...patch
    } as unknown as MagpieQuotaWindow
    expect(resolveMagpieRemoteLimit([remoteLimitCard([window])])).toBeNull()
  })

  it.each([
    {},
    { amount: 0 },
    { limit: 200 },
    { used: 100, limit: 200 }
  ])('does not calculate a percentage from incomplete amount and total fields: %j', (patch) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Daily', unit: 'tokens', ...patch }
    ], { balance: '12000 credits' })])).toBeNull()
  })

  it.each([undefined, '', 'usd', 'credits', 'requests', 'CNY'])('rejects unsupported unit %s', (unit) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Daily', remaining: 50, amount: 100, limit: 200, unit }
    ])])).toBeNull()
  })

  it('skips unlimited, text and invalid windows while still selecting a usable window', () => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Unlimited', remaining: 0, amount: 200, limit: 200, unit: 'tokens', unlimited: true },
      { name: 'Text', remaining: 0, amount: 200, limit: 200, unit: 'USD', text: true },
      { name: 'Invalid', remaining: 0, amount: -1, limit: 200, unit: 'tokens' },
      { name: 'Daily', remaining: 82.45, amount: 35.1, limit: 200, unit: 'tokens', unlimited: false, text: false }
    ])])).toMatchObject({ name: 'Daily', remainingPercent: 82.45 })
  })

  it.each([
    { unlimited: true },
    { text: true }
  ])('does not turn a lone unlimited or text window into a limit: %j', (patch) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Daily', remaining: 50, unit: 'tokens', ...patch }
    ])])).toBeNull()
  })

  it('selects the lowest unrounded remaining value before display rounding', () => {
    const reading = resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Daily', remaining: 40.49, unit: 'tokens', resetsAt: '2026-11-11T00:00:00Z' },
      { name: 'Monthly', remaining: 40.41, unit: 'USD', resetsAt: '2026-12-01T00:00:00Z' }
    ])])
    expect(reading).toMatchObject({
      name: 'Monthly',
      remainingPercent: 40.41,
      unit: 'USD',
      resetAt: Date.parse('2026-12-01T00:00:00Z')
    })
  })

  it('compares calculated and explicit windows on the same remaining percentage scale', () => {
    const reading = resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Daily tokens', remaining: 40, unit: 'tokens' },
      { name: 'Monthly spend', amount: 80, limit: 100, unit: 'USD' }
    ])])
    expect(reading).toMatchObject({ name: 'Monthly spend', used: 80, limit: 100, unit: 'USD' })
    expect(reading?.remainingPercent).toBeCloseTo(20, 10)
  })

  it('keeps API order for an exact tie without preferring a unit or reset time', () => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'First', remaining: 40.25, unit: 'USD' },
      { name: 'Second', remaining: 40.25, unit: 'tokens', resetsAt: '2026-11-11T00:00:00Z' }
    ])])).toMatchObject({ name: 'First', unit: 'USD', resetAt: null })
  })

  it.each([
    { providers: undefined },
    { providers: null },
    { providers: [] }
  ])('returns no limit for absent providers: $providers', ({ providers }) => {
    expect(resolveMagpieRemoteLimit(providers)).toBeNull()
  })

  it.each(['~keys', 'remote-magpie/~keys-extra', 'remote-magpie/~keys/codex', 'remote-magpie/codex'])(
    'requires the exact remote key-card suffix rather than %s',
    (provider) => {
      expect(resolveMagpieRemoteLimit([remoteLimitCard(undefined, { provider })])).toBeNull()
    }
  )

  it('accepts a unique key card beside unrelated providers', () => {
    expect(resolveMagpieRemoteLimit([
      { provider: 'remote-magpie/deepseek', kind: 'plan', balance: '20 credits' },
      remoteLimitCard(undefined, { provider: 'another-gateway/~keys' })
    ])).toMatchObject({ remainingPercent: 67.49 })
  })

  it.each([undefined, 'balance', 'quota'])('requires kind plan rather than %s', (kind) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard(undefined, { kind })])).toBeNull()
  })

  it.each([
    {},
    { provider: 'another-gateway/~keys' },
    { kind: 'balance', windows: [] }
  ])('rejects multiple key cards even when a second card has no usable limit: %j', (patch) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard(), remoteLimitCard(undefined, patch)])).toBeNull()
  })

  it.each([
    { windows: undefined },
    { windows: [] }
  ])('does not derive a percentage from balance alone: $windows', ({ windows }) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard([], { windows, balance: '12000 credits' })])).toBeNull()
  })

  it.each(['idle', 'loading', 'error'] as const)('rejects snapshot status %s despite usable cached fields', (status) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard()], { status, updatedAt: 1 })).toBeNull()
  })

  it.each([
    ['ok', false],
    ['stale', true]
  ] as const)('marks snapshot status %s with the matching freshness', (status, stale) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard()], { status, updatedAt: 1 })).toMatchObject({ stale })
  })

  it.each([undefined, '', 'invalid-date'])('rejects a card error without a valid asOf: %s', (asOf) => {
    expect(resolveMagpieRemoteLimit([
      remoteLimitCard(undefined, { error: 'temporarily unavailable', asOf })
    ], enabled)).toBeNull()
  })

  it.each([undefined, 'temporarily unavailable'])('marks valid retained asOf data stale with error %s', (error) => {
    expect(resolveMagpieRemoteLimit([
      remoteLimitCard(undefined, { error, asOf: '2026-11-10T00:00:00Z' })
    ], enabled)).toMatchObject({ remainingPercent: 67.49, used: 123.4, limit: 1000, stale: true })
  })

  it('does not let error plus asOf rescue an invalid window', () => {
    expect(resolveMagpieRemoteLimit([
      remoteLimitCard([{ name: 'Daily', remaining: Number.NaN, unit: 'tokens' }], {
        error: 'temporarily unavailable',
        asOf: '2026-11-10T00:00:00Z'
      })
    ], enabled)).toBeNull()
  })

  it.each([undefined, null, 'invalid-date'])('keeps an unavailable reset time null: %s', (resetsAt) => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Daily', remaining: 50, unit: 'tokens', resetsAt }
    ])], { status: 'ok', updatedAt: Date.parse('2026-11-10T00:00:00Z') })).toMatchObject({ resetAt: null })
  })

  it('recovers after an error and ambiguity without retaining a previous key reading', () => {
    expect(resolveMagpieRemoteLimit([remoteLimitCard()], enabled)?.remainingPercent).toBe(67.49)
    expect(resolveMagpieRemoteLimit([remoteLimitCard()], { status: 'error' })).toBeNull()
    expect(resolveMagpieRemoteLimit([remoteLimitCard(), remoteLimitCard()])).toBeNull()
    expect(resolveMagpieRemoteLimit([remoteLimitCard([
      { name: 'Recovered', remaining: 0, unit: 'USD' }
    ])], enabled)).toMatchObject({ name: 'Recovered', remainingPercent: 0, stale: false })
  })
})

describe('magpie agent quota availability', () => {
  const supportedWindows = [
    ['codex', '7 days'],
    ['remote-magpie/codex', '7 days'],
    ['grok', '7 days'],
    ['remote-magpie/grok', '7 days'],
    ['cursor', 'Cursor Models'],
    ['cursor', 'Other Models'],
    ['remote-magpie/cursor', 'Cursor Models'],
    ['remote-magpie/cursor', 'Other Models']
  ]

  it.each(supportedWindows)('recognizes positive and exhausted raw %s / %s readings', (provider, name) => {
    for (const remaining of [0, 50.25]) {
      expect(hasMagpieAgentQuota([{ provider, windows: [{ name, remaining }] }])).toBe(true)
    }
  })

  it.each(['codex', 'remote-magpie/codex'])('recognizes a %s token balance including zero without a window', (provider) => {
    for (const balance of ['0 credits', '12000 credits']) {
      expect(hasMagpieAgentQuota([{ provider, balance, windows: [] }])).toBe(true)
    }
  })

  it('recognizes raw remote free Codex readings that the grid deliberately omits', () => {
    const providers = [
      { provider: 'remote-magpie/codex', plan: 'free', windows: [{ name: '7 days', remaining: 0 }] }
    ]
    expect(resolveCompactQuotaGridPresentation(providers, enabled).cells).toEqual([])
    expect(hasMagpieAgentQuota(providers)).toBe(true)
  })

  it('recognizes a raw later row even when the selected grid row has no visible cells', () => {
    const providers = [
      { provider: 'remote-magpie/grok', windows: [] },
      { provider: 'remote-magpie/grok', windows: [{ name: '7 days', remaining: 0 }] }
    ]
    expect(resolveCompactQuotaGridPresentation(providers, enabled).cells).toEqual([])
    expect(hasMagpieAgentQuota(providers)).toBe(true)
  })

  it('recognizes positive Codex weekly quota despite having no Codex percentage cell', () => {
    const providers = [{ provider: 'codex', windows: [{ name: '7 days', remaining: 80 }] }]
    expect(resolveCompactQuotaGridPresentation(providers, enabled).cells).toEqual([])
    expect(hasMagpieAgentQuota(providers)).toBe(true)
  })

  it.each([
    { providers: undefined },
    { providers: null },
    { providers: [] }
  ])('rejects absent agent providers: $providers', ({ providers }) => {
    expect(hasMagpieAgentQuota(providers)).toBe(false)
  })

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '50', null])(
    'rejects a nonnumeric supported-window reading: %s',
    (remaining) => {
      expect(hasMagpieAgentQuota([
        { provider: 'grok', windows: [{ name: '7 days', remaining } as unknown as MagpieQuotaWindow] }
      ])).toBe(false)
    }
  )

  it.each([
    { provider: 'codex', windows: [{ name: '30 days', remaining: 100 }] },
    { provider: 'remote-magpie/codex', windows: [{ name: '5 hours', remaining: 100 }] },
    { provider: 'grok', windows: [{ name: '1 day', remaining: 100 }] },
    { provider: 'remote-magpie/grok', balance: '12000 credits', windows: [] },
    { provider: 'cursor', windows: [{ name: 'Total', remaining: 100 }] },
    { provider: 'remote-magpie/cursor', windows: [{ name: 'Grok Bot', remaining: 100 }, { name: 'Free usage', remaining: 100 }] },
    { provider: 'remote-magpie/deepseek', balance: '12000 credits', windows: [{ name: '7 days', remaining: 100 }] },
    { provider: 'codex', balance: 'unavailable', windows: [] },
    remoteLimitCard()
  ])('ignores unsupported providers, windows and invalid balances: %j', (provider) => {
    expect(hasMagpieAgentQuota([provider])).toBe(false)
  })

  it('recomputes availability as real zero appears, disappears and recovers', () => {
    expect(hasMagpieAgentQuota([])).toBe(false)
    expect(hasMagpieAgentQuota([{ provider: 'cursor', windows: [{ name: 'Other Models', remaining: 0 }] }])).toBe(true)
    expect(hasMagpieAgentQuota([{ provider: 'cursor', windows: [] }])).toBe(false)
    expect(hasMagpieAgentQuota([{ provider: 'codex', balance: '0 credits' }])).toBe(true)
  })
})
