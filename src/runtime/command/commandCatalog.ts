import type { CommandDescriptorV7, CommandExecutionOwner, CommandId, CommandSurfaceIdV7 } from './types'

export interface CommandCatalogV7 {
  readonly revision: number
  all(): readonly CommandDescriptorV7[]
  get(commandId: CommandId): CommandDescriptorV7 | null
  require(commandId: CommandId): CommandDescriptorV7
  executionOwnerFor(commandId: CommandId, surfaceId: CommandSurfaceIdV7): CommandExecutionOwner
}

function normalizedDescriptor(input: CommandDescriptorV7): CommandDescriptorV7 {
  return Object.freeze({
    ...input,
    surfaceExecutionOwners: input.surfaceExecutionOwners
      ? Object.freeze({ ...input.surfaceExecutionOwners })
      : undefined,
    defaultBindings: Object.freeze(input.defaultBindings.map((binding) => Object.freeze({
      ...binding,
      shortcutIds: Object.freeze([...binding.shortcutIds])
    })))
  })
}

export function createCommandCatalogV7(
  descriptors: readonly CommandDescriptorV7[],
  revision = 1
): CommandCatalogV7 {
  const byId = new Map<CommandId, CommandDescriptorV7>()
  for (const input of descriptors) {
    if (!input.id.trim()) throw new Error('Command id must not be empty')
    if (byId.has(input.id)) throw new Error(`Duplicate command descriptor: ${input.id}`)
    byId.set(input.id, normalizedDescriptor(input))
  }
  const ordered = Object.freeze([...byId.values()].sort((left, right) =>
    left.group.localeCompare(right.group) || left.id.localeCompare(right.id)
  ))
  return Object.freeze({
    revision,
    all: () => ordered,
    get: (commandId: CommandId) => byId.get(commandId) || null,
    require(commandId: CommandId) {
      const descriptor = byId.get(commandId)
      if (!descriptor) throw new Error(`Unknown command descriptor: ${commandId}`)
      return descriptor
    },
    executionOwnerFor(commandId: CommandId, surfaceId: CommandSurfaceIdV7) {
      const descriptor = byId.get(commandId)
      if (!descriptor) throw new Error(`Unknown command descriptor: ${commandId}`)
      return descriptor.surfaceExecutionOwners?.[surfaceId] || descriptor.executionOwner
    }
  })
}
