/**
 * The platform's "command" modifier, accepted from either physical key.
 *
 * macOS users reach for Command and everyone else for Control, and the browser
 * reports the two as separate flags. Accepting both — rather than branching on a
 * detected platform — is what keeps one muscle memory working everywhere: a
 * macOS user on an external PC keyboard, a remote session that rewrites
 * modifiers, and a host whose platform probe is wrong all still get the gesture.
 * Branching would turn each of those into a silently dead control.
 *
 * The Float rows already spell this out inline; this is the named owner so a new
 * gesture cannot accidentally ship as Control-only.
 */
export interface CommandModifierEventLike {
  ctrlKey?: boolean
  metaKey?: boolean
}

export function hasCommandModifier(event: CommandModifierEventLike | null | undefined): boolean {
  return Boolean(event?.ctrlKey || event?.metaKey)
}

/** Product wording for the gesture, so hints never hard-code one platform's key. */
export const COMMAND_MODIFIER_LABEL = 'Cmd/Ctrl'
