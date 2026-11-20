import type { CodexActionRunnerQuickJumpBindingV1 } from '../../domain/codexActionRunner'
import {
  keybindingAvailableOnSurfaceV7,
  keybindingExecutionOwnerForSurfaceV7,
  keybindingPriorityV7,
  type KeybindingDefinition
} from './keybindingRuntime'

function isEnabledBinding(binding: KeybindingDefinition): boolean {
  return Boolean(binding.shortcutId) && !binding.disabled && binding.source !== 'removed'
}

export function projectFloatKeybindings(bindings: readonly KeybindingDefinition[]) {
  return bindings
    .filter((binding) => (binding.actionId.startsWith('codex.') || binding.actionId.startsWith('quickJump.'))
      && isEnabledBinding(binding) && keybindingAvailableOnSurfaceV7(binding, 'float'))
    .map((binding) => ({
      actionId: binding.actionId,
      shortcutId: binding.shortcutId,
      layer: binding.layer,
      when: binding.when,
      weight: keybindingPriorityV7(binding),
      executionOwner: keybindingExecutionOwnerForSurfaceV7(binding, 'float')
    }))
}

export function projectActionRunnerQuickJumpBindings(
  bindings: readonly KeybindingDefinition[]
): CodexActionRunnerQuickJumpBindingV1[] {
  return bindings.flatMap((binding) => {
    const { actionId, shortcutId, when } = binding
    if (actionId !== 'quickJump.openForward' && actionId !== 'quickJump.openBackward') return []
    if (!isEnabledBinding(binding) || !keybindingAvailableOnSurfaceV7(binding, 'action')) return []
    return [{ actionId, shortcutId, when, weight: keybindingPriorityV7(binding) }]
  })
}
