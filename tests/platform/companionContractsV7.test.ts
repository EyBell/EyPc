import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  CHILD_ACK_STAGES_V7,
  CHILD_SURFACES_V7,
  COMPANION_V7_REVISIONS,
  type ChildEnvelopeV7
} from '../../src/domain/generated/companionContractsV7'

const require = createRequire(import.meta.url)
const contracts = require('../../preload/companion/contracts-v7.cjs')

describe('generated Companion V7 contracts', () => {
  it('keeps TS and CJS child-envelope constants aligned', () => {
    expect(contracts.COMPANION_V7_REVISIONS).toEqual(COMPANION_V7_REVISIONS)
    expect(contracts.CHILD_SURFACES_V7).toEqual([...CHILD_SURFACES_V7])
    expect(contracts.CHILD_ACK_STAGES_V7).toEqual([...CHILD_ACK_STAGES_V7])
  })

  it('round-trips a bounded Action log cursor envelope and rejects a surface mismatch', () => {
    const envelope: ChildEnvelopeV7<{ runId: string; cursor: number }> = contracts.createChildEnvelopeV7({
      runtimeIdentity: 'asset-current',
      surfaceId: 'action',
      channel: 'eypc-action-runner:log-request',
      payloadRevision: 12,
      requestId: 'action:req:12',
      logCursor: 12,
      payload: { runId: 'car_test', cursor: 12 }
    })
    expect(contracts.normalizeChildEnvelopeV7(envelope, {
      surfaceId: 'action',
      channel: 'eypc-action-runner:log-request'
    })).toMatchObject({ logCursor: 12, payload: { runId: 'car_test', cursor: 12 } })
    expect(contracts.normalizeChildEnvelopeV7(envelope, { surfaceId: 'float' })).toBeNull()
  })
})
