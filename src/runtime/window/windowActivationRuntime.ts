import type { LiveWindow, WindowActivationRequest } from '../../domain/windows'
import type { WindowActivationReasonCode } from '../../platform/eypcPlatform'

export function createWindowActivationRequest(root: LiveWindow, member: LiveWindow | null = null): WindowActivationRequest {
  return member ? { mode: 'member-exact', root, member } : { mode: 'root-current', root }
}

export function isWindowSpaceFailureReason(reasonCode?: WindowActivationReasonCode): boolean {
  return reasonCode === 'space-unbound'
    || reasonCode === 'space-unbound-multiwindow'
    || reasonCode === 'space-ambiguous'
    || reasonCode === 'space-switch-timeout'
}
