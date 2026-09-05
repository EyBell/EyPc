import type { FeatureShellDomFocusWatchV7 } from '../featureModule'

export const windowsShellDomFocusWatches: readonly FeatureShellDomFocusWatchV7[] = [
  {
    requestId: (snapshot) => snapshot.windowFocusRequestId,
    apply(snapshot) {
      if (snapshot.state.activeTab !== 'windows') return
      const draft = snapshot.windowDraft
      if (draft) {
        document.querySelector<HTMLElement>(`[data-role="window-editor"] [data-field="${draft.activeField}"]`)?.focus()
        return
      }
      // List navigation always owns the keyboard; action-panel focus uses windowActionsFocusRequestId.
      const list = document.querySelector<HTMLElement>('[data-role="window-list"]')
      list?.focus()
      const focusedId = snapshot.focusedWindowId
      if (!focusedId) return
      const row = document.getElementById(`window-row-${encodeURIComponent(focusedId).replace(/%/g, '_')}`)
      row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  },
  {
    requestId: (snapshot) => snapshot.windowActionsFocusRequestId,
    apply(snapshot) {
      if (snapshot.state.activeTab !== 'windows' || !snapshot.windowActionsOpen || snapshot.windowDraft) return
      document.querySelector<HTMLElement>('[data-role="window-actions"] button:not([disabled])')?.focus()
    }
  }
]
