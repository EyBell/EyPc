import { formatShortcutList, normalizeShortcutId } from '../../domain/shortcuts'
import {
  buildShortcutCommandRows,
  resolveKeybinding,
  type KeybindingContext,
  type KeybindingDefinition,
  type ShortcutCommandRow
} from './keybindingRuntime'
import { resolveLayerStackV7 } from '../command/layerStack'
import type { KeybindingLayerId } from '../command/types'
import type { CommandSurfaceIdV7 } from '../command/types'

export interface KeybindingResolutionV7 {
  readonly binding: KeybindingDefinition | null
  /** Whether the surface should prevent the browser/host default for this key event. */
  readonly consumed: boolean
  /** The modal layer that blocks lower command layers, even when native text editing remains allowed. */
  readonly blockedBy: KeybindingLayerId | null
}

export interface KeybindingIndexV7 {
  readonly revision: number
  readonly bindings: readonly KeybindingDefinition[]
  readonly byCommand: ReadonlyMap<string, readonly KeybindingDefinition[]>
  readonly byShortcut: ReadonlyMap<string, readonly KeybindingDefinition[]>
  readonly labels: ReadonlyMap<string, string>
  readonly labelRecord: Readonly<Record<string, string>>
  resolve(shortcutId: string, context: KeybindingContext, surfaceId?: CommandSurfaceIdV7): KeybindingDefinition | null
  resolveWithBarrier(shortcutId: string, context: KeybindingContext, surfaceId?: CommandSurfaceIdV7): KeybindingResolutionV7
  shortcutsFor(commandId: string): readonly string[]
  labelFor(commandId: string): string
  rows(): readonly ShortcutCommandRow[]
}

function shouldConsumeAtModalBarrier(shortcutId: string, context: KeybindingContext): boolean {
  if (!context.textInputFocused) return true
  const normalized = normalizeShortcutId(shortcutId)
  if (normalized === 'Escape' || normalized === 'Shift+Escape') return true
  // Focused fields and FocusScope retain native editing/navigation. The resolver
  // still terminates at the barrier, so these keys cannot reach a lower feature.
  if (/^[A-Z0-9]$/i.test(normalized)) return false
  if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Space', 'Enter', 'Tab', 'Shift+Tab'].includes(normalized)) return false
  return true
}

function append(
  index: Map<string, KeybindingDefinition[]>,
  key: string,
  binding: KeybindingDefinition
): void {
  const current = index.get(key)
  if (current) current.push(binding)
  else index.set(key, [binding])
}

function readonlyIndex(input: Map<string, KeybindingDefinition[]>): ReadonlyMap<string, readonly KeybindingDefinition[]> {
  return new Map([...input.entries()].map(([key, values]) => [key, Object.freeze([...values])]))
}

export function createKeybindingIndexV7(
  revision: number,
  sourceBindings: readonly KeybindingDefinition[]
): KeybindingIndexV7 {
  const bindings = Object.freeze(sourceBindings.map((binding) => Object.freeze({ ...binding })))
  const commandMutable = new Map<string, KeybindingDefinition[]>()
  const shortcutMutable = new Map<string, KeybindingDefinition[]>()
  for (const binding of bindings) {
    append(commandMutable, binding.actionId, binding)
    append(shortcutMutable, normalizeShortcutId(binding.shortcutId), binding)
  }
  const byCommand = readonlyIndex(commandMutable)
  const byShortcut = readonlyIndex(shortcutMutable)
  const labels = new Map<string, string>()
  for (const [commandId, commandBindings] of byCommand) {
    const shortcutIds = commandBindings
      .filter((binding) => !binding.disabled && binding.source !== 'removed')
      .map((binding) => binding.shortcutId)
      .filter(Boolean)
    labels.set(commandId, formatShortcutList(shortcutIds))
  }
  const labelRecord = Object.freeze(Object.fromEntries(labels))
  let cachedRows: readonly ShortcutCommandRow[] | null = null

  function resolveIndexed(shortcutId: string, context: KeybindingContext, surfaceId: CommandSurfaceIdV7 = 'main'): KeybindingDefinition | null {
    const normalized = normalizeShortcutId(shortcutId)
    const candidates = [
      ...(byShortcut.get(normalized) || []),
      ...(normalized === '*' ? [] : byShortcut.get('*') || [])
    ]
    return resolveKeybinding([...candidates], normalized, context, surfaceId)
  }

  return Object.freeze({
    revision,
    bindings,
    byCommand,
    byShortcut,
    labels,
    labelRecord,
    resolve: resolveIndexed,
    resolveWithBarrier(shortcutId: string, context: KeybindingContext, surfaceId: CommandSurfaceIdV7 = 'main') {
      const stack = resolveLayerStackV7(context)
      const binding = resolveIndexed(shortcutId, context, surfaceId)
      return Object.freeze({
        binding,
        consumed: Boolean(binding) || Boolean(stack.blockingLayer && shouldConsumeAtModalBarrier(shortcutId, context)),
        blockedBy: stack.blockingLayer
      })
    },
    shortcutsFor(commandId: string) {
      return Object.freeze((byCommand.get(commandId) || [])
        .filter((binding) => !binding.disabled && binding.source !== 'removed')
        .map((binding) => binding.shortcutId)
        .filter(Boolean))
    },
    labelFor(commandId: string) {
      return labels.get(commandId) || ''
    },
    rows() {
      if (!cachedRows) cachedRows = Object.freeze(buildShortcutCommandRows([...bindings]))
      return cachedRows
    }
  })
}
