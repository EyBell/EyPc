import type { ShortcutProfileId } from '../../domain/types'
import type { CommandExecutionOwner, CommandSurfaceExecutionOwnersV7, KeybindingLayerId } from '../command/types'

export interface ShortcutCommandProfileConfig {
  title: string
  group: string
  layer: KeybindingLayerId
  shortcutIds: readonly string[]
  when: string
  weight: number
  risk?: 'normal' | 'data-write' | 'destructive'
  description?: string
  internal?: boolean
  profileId?: ShortcutProfileId
  executionOwner?: CommandExecutionOwner
  surfaceExecutionOwners?: CommandSurfaceExecutionOwnersV7
}

export interface ShortcutCommandProfile extends ShortcutCommandProfileConfig {
  actionId: string
  shortcutIds: string[]
}

export function commandProfilesFromRecord(
  record: { readonly [actionId: string]: ShortcutCommandProfileConfig }
): ShortcutCommandProfile[] {
  return Object.entries(record).map(([actionId, profile]) => ({
    actionId,
    ...profile,
    shortcutIds: [...profile.shortcutIds]
  }))
}
