import type { FeatureShellDomFocusWatchV7 } from '../featureModule'

export const portsShellDomFocusWatches: readonly FeatureShellDomFocusWatchV7[] = [
  {
    requestId: (snapshot) => snapshot.groupPanelFocusRequestId,
    apply(snapshot) {
      if (snapshot.state.activeTab !== 'ports' || !snapshot.groupSidePanelOpen || snapshot.activePortPane !== 'groups') return
      document.querySelector<HTMLElement>('[data-role="port-groups-panel"]')?.focus()
    }
  },
  {
    requestId: (snapshot) => snapshot.listFocusRequestId,
    apply(snapshot) {
      if (snapshot.state.activeTab !== 'ports') return
      const role = snapshot.listFocusTarget === 'groups' ? 'port-groups-panel' : 'port-results-list'
      document.querySelector<HTMLElement>(`[data-role="${role}"]`)?.focus()
    }
  }
]
