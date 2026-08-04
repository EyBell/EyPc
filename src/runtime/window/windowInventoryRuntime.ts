import { mergePartialWindowFamilyInventory, windowFamilyRoots, type WindowFamily, type WindowInstanceId } from '../../domain/windows'

export interface WindowInventoryRuntimeState {
  families: WindowFamily[]
  roots: ReturnType<typeof windowFamilyRoots>
  freshRootIds: Set<WindowInstanceId>
  freshMemberIds: Set<WindowInstanceId>
  completeness: 'complete' | 'partial'
}

/**
 * The one Runtime inventory transition. A partial native projection only adds
 * or refreshes evidence; it can never evict an off-Space family.
 */
export function applyWindowInventoryUpdate(
  previousFamilies: readonly WindowFamily[],
  freshFamilies: readonly WindowFamily[],
  completeness: 'complete' | 'partial'
): WindowInventoryRuntimeState {
  const families = completeness === 'partial'
    ? mergePartialWindowFamilyInventory(previousFamilies, freshFamilies)
    : freshFamilies.map((family) => ({
        root: { ...family.root },
        children: family.children.map((child) => ({ ...child }))
      }))
  return {
    families,
    roots: windowFamilyRoots(families),
    freshRootIds: new Set(freshFamilies.map((family) => family.root.instanceId)),
    freshMemberIds: new Set(freshFamilies.flatMap((family) => family.children.map((child) => child.instanceId))),
    completeness
  }
}

export function normalizeWindowInventoryCompleteness(value: unknown): 'complete' | 'partial' {
  return value === 'partial' ? 'partial' : 'complete'
}
