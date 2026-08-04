import type { WindowInstanceId } from './windows'

export type WindowRebindState =
  | { phase: 'idle' }
  | {
      phase: 'confirming'
      targetId: string
      candidateInstanceIds: WindowInstanceId[]
      restoreFocusRowId: string
      /** Only a slot-originated recovery may replace that one slot mapping. */
      slotNumber: number | null
    }

export type WindowRebindView =
  | { phase: 'idle'; targetId: null; candidateInstanceIds: [] }
  | { phase: 'confirming'; targetId: string; candidateInstanceIds: WindowInstanceId[] }

export type WindowRebindEvent =
  | {
      type: 'begin'
      targetId: string
      candidateInstanceIds: WindowInstanceId[]
      restoreFocusRowId: string
      slotNumber?: number | null
    }
  | {
      type: 'inventory'
      completeness: 'complete' | 'partial'
      freshCandidateInstanceIds: WindowInstanceId[]
      retainedInstanceIds: WindowInstanceId[]
      focusedCandidateInstanceId: WindowInstanceId | null
    }
  | { type: 'cancel' }
  | { type: 'confirmed'; targetId: string }
  | { type: 'target-missing' }

export interface WindowRebindEffects {
  /** Inventory absence requests an exact native probe; it never clears by itself. */
  probeStaleBindingTargetId: string | null
  focusCandidateInstanceId: WindowInstanceId | null
  restoreFocusRowId: string | null
}

export interface WindowRebindTransition {
  state: WindowRebindState
  effects: WindowRebindEffects
}

export type WindowInteractionPolicy = 'always' | 'browse' | 'rebind'

const NO_EFFECTS: WindowRebindEffects = {
  probeStaleBindingTargetId: null,
  focusCandidateInstanceId: null,
  restoreFocusRowId: null
}

function uniqueInstanceIds(ids: WindowInstanceId[]): WindowInstanceId[] {
  return Array.from(new Set(ids.filter(Boolean)))
}

export function createWindowRebindState(): WindowRebindState {
  return { phase: 'idle' }
}

export function windowRebindView(state: WindowRebindState): WindowRebindView {
  if (state.phase === 'idle') return { phase: 'idle', targetId: null, candidateInstanceIds: [] }
  return {
    phase: 'confirming',
    targetId: state.targetId,
    candidateInstanceIds: [...state.candidateInstanceIds]
  }
}

export function windowInteractionAllowed(state: WindowRebindState, policy: WindowInteractionPolicy): boolean {
  if (policy === 'always') return true
  return policy === 'browse' ? state.phase === 'idle' : state.phase === 'confirming'
}

export function transitionWindowRebind(state: WindowRebindState, event: WindowRebindEvent): WindowRebindTransition {
  if (event.type === 'begin') {
    const candidateInstanceIds = uniqueInstanceIds(event.candidateInstanceIds)
    return {
      state: {
        phase: 'confirming',
        targetId: event.targetId,
        candidateInstanceIds,
        restoreFocusRowId: event.restoreFocusRowId,
        slotNumber: Number.isInteger(event.slotNumber) ? Math.trunc(Number(event.slotNumber)) : null
      },
      effects: {
        ...NO_EFFECTS,
        focusCandidateInstanceId: candidateInstanceIds[0] || null
      }
    }
  }

  if (state.phase === 'idle') return { state, effects: NO_EFFECTS }

  if (event.type === 'cancel') {
    return {
      state: createWindowRebindState(),
      effects: { ...NO_EFFECTS, restoreFocusRowId: state.restoreFocusRowId }
    }
  }

  if (event.type === 'target-missing') {
    return { state: createWindowRebindState(), effects: NO_EFFECTS }
  }

  if (event.type === 'confirmed') {
    return event.targetId === state.targetId
      ? { state: createWindowRebindState(), effects: NO_EFFECTS }
      : { state, effects: NO_EFFECTS }
  }

  const freshCandidateInstanceIds = uniqueInstanceIds(event.freshCandidateInstanceIds)
  const retainedInstanceIds = new Set(event.retainedInstanceIds)
  const candidateInstanceIds = event.completeness === 'complete'
    ? freshCandidateInstanceIds
    : uniqueInstanceIds([
        ...state.candidateInstanceIds.filter((id) => retainedInstanceIds.has(id)),
        ...freshCandidateInstanceIds
      ])
  const shouldFocusCandidate = candidateInstanceIds.length > 0
    && (!state.candidateInstanceIds.length || !event.focusedCandidateInstanceId || !candidateInstanceIds.includes(event.focusedCandidateInstanceId))

  return {
    state: { ...state, candidateInstanceIds },
    effects: {
      probeStaleBindingTargetId: event.completeness === 'complete' && candidateInstanceIds.length === 0 ? state.targetId : null,
      focusCandidateInstanceId: shouldFocusCandidate ? candidateInstanceIds[0] : null,
      restoreFocusRowId: null
    }
  }
}
