import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const pinModule = require('../../preload/codex/pin-bridge.cjs') as {
  CODEX_PINNED_SECTION_ID: string
  codexThreadSectionPinned(row: unknown): boolean | null
  codexThreadNativePinFields(row: unknown, mirror?: Map<string, number>): Record<string, unknown>
  createCodexPinBridge(dependencies: Record<string, unknown>): {
    setCodexThreadPin(input: Record<string, unknown>): Promise<Record<string, any>>
    setCompanionPin(actionAlias: string, request?: Record<string, unknown>): Promise<Record<string, any>>
  }
}

const PINNED = pinModule.CODEX_PINNED_SECTION_ID
const NATIVE_ID = '01a052cb-77fa-7fd3-8acd-cb7e45f659ee'
const EXT_ID = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f'

describe('codex pin lane · reading the Pinned section', () => {
  it('answers pinned only from the app-server section and reports absence as unknown', () => {
    expect(pinModule.codexThreadSectionPinned({ id: NATIVE_ID, section: { id: PINNED, name: 'Pinned' } })).toBe(true)
    expect(pinModule.codexThreadSectionPinned({ id: NATIVE_ID, section: { id: 'other', name: 'Work' } })).toBe(false)
    expect(pinModule.codexThreadSectionPinned({ id: NATIVE_ID, section: null })).toBe(false)
    expect(pinModule.codexThreadSectionPinned({ id: NATIVE_ID })).toBeNull()
  })

  it('prefers the section, then the Host field, and falls back to the global-state mirror only without a section', () => {
    const mirror = new Map([[NATIVE_ID, 3]])
    expect(pinModule.codexThreadNativePinFields({ id: NATIVE_ID, section: { id: PINNED } }, mirror))
      .toEqual({ nativePinned: true, nativePinLane: 'app-server', nativePinnedOrder: 3 })
    // The section outranks a stale mirror entry: the mirror drops archived pins and lags Desktop.
    expect(pinModule.codexThreadNativePinFields({ id: NATIVE_ID, section: null }, mirror))
      .toEqual({ nativePinned: false, nativePinLane: 'app-server' })
    expect(pinModule.codexThreadNativePinFields({ id: NATIVE_ID }, mirror))
      .toEqual({ nativePinned: true, nativePinLane: 'mirror', nativePinnedOrder: 3 })
    expect(pinModule.codexThreadNativePinFields({ id: NATIVE_ID }, new Map()))
      .toEqual({ nativePinned: false, nativePinLane: 'mirror' })
    expect(pinModule.codexThreadNativePinFields({ id: EXT_ID, codexhostExternal: true, codexhostPinned: true }))
      .toEqual({ nativePinned: true, nativePinLane: 'codexhost' })
    // A Host without the field means "no pin lane", never "unpinned".
    expect(pinModule.codexThreadNativePinFields({ id: EXT_ID, codexhostExternal: true }))
      .toEqual({ nativePinned: false, nativePinLane: '' })
  })
})

describe('codex pin lane · outbound write', () => {
  function harness(options: {
    sectionAfterWrite?: string | null | 'absent'
    moveError?: unknown
    codexhost?: Record<string, unknown>
  } = {}) {
    const rpc: Array<{ method: string; params: Record<string, any> }> = []
    const diagnostics: Array<Record<string, any>> = []
    let current: string | null = null
    const requestCodexRpc = vi.fn(async (method: string, params: Record<string, any>) => {
      rpc.push({ method, params })
      if (method === 'thread/section/move') {
        if (options.moveError) throw options.moveError
        current = params.sectionId
        return {}
      }
      if (method === 'thread/metadata/update') {
        current = params.isPinned ? PINNED : null
        return { thread: { id: params.threadId } }
      }
      if (method === 'thread/read') {
        const section = options.sectionAfterWrite === undefined ? current : options.sectionAfterWrite
        return section === 'absent'
          ? { thread: { id: params.threadId } }
          : { thread: { id: params.threadId, section: section ? { id: section, name: 'Pinned' } : null } }
      }
      throw new Error(`unexpected ${method}`)
    })
    const threadActions = new Map([
      ['ct_native_alias_000000001', { threadId: NATIVE_ID, key: 'codex:native', expiresAt: Number.MAX_SAFE_INTEGER }],
      ['ct_ext_alias_000000000001', { threadId: EXT_ID, key: 'codex:ext', expiresAt: Number.MAX_SAFE_INTEGER }],
      ['ct_stale_alias_00000000001', { threadId: NATIVE_ID, key: 'codex:stale', expiresAt: 1 }]
    ])
    const verified: Array<[string, boolean, string]> = []
    const bridge = pinModule.createCodexPinBridge({
      requestCodexRpc,
      record: (entry: Record<string, any>) => diagnostics.push(entry),
      threadActions,
      codexhostDiscovery: {
        isExternalThreadId: (id: string) => id === EXT_ID,
        codexhostPinThread: vi.fn(async (id: string, pinned: boolean) => ({ ok: true, threadId: id, pinned })),
        codexhostPinState: vi.fn(async () => ({ ok: true, pinned: true })),
        ...(options.codexhost || {})
      },
      onProviderPinVerified: (threadId: string, pinned: boolean, lane: string) => verified.push([threadId, pinned, lane])
    })
    return { bridge, rpc, diagnostics, verified, requestCodexRpc }
  }

  it('moves the thread into the Pinned section, reads it back and reports the verified value', async () => {
    const { bridge, rpc, diagnostics, verified } = harness()
    await expect(bridge.setCompanionPin('ct_native_alias_000000001', { pinned: true, source: 'task-pin' })).resolves.toMatchObject({
      outcome: 'completed',
      providerPin: true,
      method: 'thread/section/move'
    })
    expect(rpc.map((call) => call.method)).toEqual(['thread/section/move', 'thread/read'])
    expect(rpc[0].params).toEqual({ threadId: NATIVE_ID, sectionId: PINNED, beforeThreadId: null })
    expect(verified).toEqual([[NATIVE_ID, true, 'app-server']])
    expect(diagnostics.map((entry) => [entry.scope, entry.event, entry.outcome])).toEqual([
      ['pin-transaction', 'pin-intent', 'started'],
      ['pin-transaction', 'pin-provider-write', 'completed'],
      ['pin-transaction', 'pin-server-verify', 'verified']
    ])
    expect(diagnostics.every((entry) => entry.taskRef === 'codex:native' && entry.lane === 'app-server')).toBe(true)

    await expect(bridge.setCompanionPin('ct_native_alias_000000001', { pinned: false })).resolves.toMatchObject({ outcome: 'completed', providerPin: false })
    expect(rpc[2].params).toEqual({ threadId: NATIVE_ID, sectionId: null, beforeThreadId: null })
  })

  it('falls back to thread/metadata/update when the section method is unknown to this app-server', async () => {
    const { bridge, rpc } = harness({ moveError: Object.assign(new Error('Method not found'), { rpcCode: -32601 }) })
    await expect(bridge.setCompanionPin('ct_native_alias_000000001', { pinned: true })).resolves.toMatchObject({
      outcome: 'completed',
      method: 'thread/metadata/update'
    })
    expect(rpc.map((call) => call.method)).toEqual(['thread/section/move', 'thread/metadata/update', 'thread/read'])
    expect(rpc[1].params).toEqual({ threadId: NATIVE_ID, isPinned: true })
  })

  it('keeps the write unconfirmed when the read-back disagrees or cannot answer', async () => {
    const mismatch = harness({ sectionAfterWrite: null })
    await expect(mismatch.bridge.setCompanionPin('ct_native_alias_000000001', { pinned: true })).resolves.toMatchObject({
      outcome: 'failed',
      errorCode: 'section-mismatch',
      providerPin: false
    })
    expect(mismatch.verified).toEqual([])

    const silent = harness({ sectionAfterWrite: 'absent' })
    await expect(silent.bridge.setCompanionPin('ct_native_alias_000000001', { pinned: true })).resolves.toMatchObject({
      outcome: 'indeterminate',
      errorCode: 'section-unavailable'
    })
    expect(silent.verified).toEqual([])

    const failing = harness({ moveError: Object.assign(new Error('boom'), { rpcCode: -32000 }) })
    await expect(failing.bridge.setCompanionPin('ct_native_alias_000000001', { pinned: true })).resolves.toMatchObject({
      outcome: 'failed',
      errorCode: 'rpc--32000'
    })
    expect(failing.rpc.map((call) => call.method)).toEqual(['thread/section/move'])
  })

  it('routes extra-process ids through the Host CLI lane and rejects an expired alias', async () => {
    const { bridge, rpc, verified, diagnostics } = harness()
    await expect(bridge.setCompanionPin('ct_ext_alias_000000000001', { pinned: true })).resolves.toMatchObject({
      outcome: 'completed',
      providerPin: true,
      method: 'codexhost thread pin'
    })
    expect(rpc).toEqual([])
    expect(verified).toEqual([[EXT_ID, true, 'codexhost']])
    expect(diagnostics.every((entry) => entry.lane === 'codexhost')).toBe(true)

    await expect(bridge.setCompanionPin('ct_stale_alias_00000000001', { pinned: true })).resolves.toMatchObject({
      outcome: 'failed',
      errorCode: 'expired-alias'
    })
    await expect(bridge.setCompanionPin('ct_unknown', { pinned: true })).resolves.toMatchObject({ outcome: 'failed', errorCode: 'expired-alias' })
  })

  it('reports a Host without the pin verb as unsupported instead of touching the app-server', async () => {
    const { bridge, rpc } = harness({ codexhost: { codexhostPinThread: undefined } })
    await expect(bridge.setCompanionPin('ct_ext_alias_000000000001', { pinned: true })).resolves.toMatchObject({
      outcome: 'failed',
      errorCode: 'unsupported'
    })
    expect(rpc).toEqual([])
  })
})
