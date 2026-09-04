import type { FeatureRouteContributionV7 } from '../featureModule'
import { disabledOrCurrentRoute, enabledRoute, isFeatureEnabled } from '../featureRouteHelpers'

function codexMainHideToRoute(actionId: string): FeatureRouteContributionV7['toRoute'] {
  return (_match, ctx) => isFeatureEnabled('codex', ctx.configs)
    ? disabledOrCurrentRoute('codex', ctx.configs, ctx.currentTab, {
      actionId,
      preserveCurrentTab: true,
      visibilityOwner: 'mainHide'
    })
    : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId }
}

export const CODEX_ROUTES: readonly FeatureRouteContributionV7[] = [
  {
    code: 'eypc-codex',
    toRoute: (_match, ctx) => enabledRoute('codex', false, ctx.configs)
  },
  { code: 'eypc-codex-toggle', toRoute: codexMainHideToRoute('codex.float.toggle') },
  { code: 'eypc-codex-activate', toRoute: codexMainHideToRoute('codex.float.activate') },
  { code: 'eypc-companion-quick', toRoute: codexMainHideToRoute('codex.quick.activate') },
  { code: 'eypc-codex-input', toRoute: codexMainHideToRoute('codex.input.open') },
  { code: 'eypc-codex-completed-unread', toRoute: codexMainHideToRoute('codex.completed-unread.openFirst') },
  { code: 'eypc-codex-task-previous', toRoute: codexMainHideToRoute('codex.task.previous') },
  { code: 'eypc-codex-task-next', toRoute: codexMainHideToRoute('codex.task.next') },
  { code: 'eypc-companion-archive', toRoute: codexMainHideToRoute('codex.task.archiveFocused') },
  { code: 'eypc-codex-action-runner', toRoute: codexMainHideToRoute('codex.actionRunner.activate') },
  {
    codePattern: /^eypc-codex-action-([1-5])$/,
    toRoute: (match, ctx) => {
      const actionId = `codex.action.run.${match.groups?.[0]}`
      return isFeatureEnabled('codex', ctx.configs)
        ? disabledOrCurrentRoute('codex', ctx.configs, ctx.currentTab, {
          actionId,
          preserveCurrentTab: true,
          visibilityOwner: 'mainHide'
        })
        : { tab: 'settings', focusSearch: false, settingsMaintenanceSection: 'features', actionId }
    }
  }
]
