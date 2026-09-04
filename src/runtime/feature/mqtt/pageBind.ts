import { defineAsyncComponent } from 'vue'
import type { FeaturePageBindingV7, FeaturePageHostV7, FeaturePageShellV7 } from '../featureModule'
import type { MqttRuntimeSliceV7 } from '../featureRuntimeSlices'
import type { RuntimeSliceOwnerV7 } from '../../runtimeSlice'

const MqttPage = defineAsyncComponent(() => import('../../../pages/MqttPage.vue'))

export function bindMqttPage(input: {
  runtime: FeaturePageHostV7
  slice: RuntimeSliceOwnerV7<MqttRuntimeSliceV7>
  shell: FeaturePageShellV7
}): FeaturePageBindingV7 {
  const runtime = input.runtime as FeaturePageHostV7 & {
    setMqttSearch: (...args: never[]) => unknown
    focusMqttConfig: (...args: never[]) => unknown
    focusMqttConnectionGroup: (...args: never[]) => unknown
    focusMqttSession: (...args: never[]) => unknown
    focusMqttMessage: (...args: never[]) => unknown
    focusMqttLog: (...args: never[]) => unknown
    updateMqttConfigDraft: (...args: never[]) => unknown
    updateMqttConnectionGroupDraft: (...args: never[]) => unknown
    updateMqttSubscriptionDraft: (...args: never[]) => unknown
    updateMqttFavoriteDraft: (...args: never[]) => unknown
    updateMqttRecordEditDraft: (...args: never[]) => unknown
    updateMqttPublishDraftHistoryEditDraft: (...args: never[]) => unknown
    updateMqttPublishDraft: (...args: never[]) => unknown
  }
  return {
    page: MqttPage,
    props: {
      snapshot: input.slice.snapshot(),
      shiftPreview: input.shell.shiftPreview,
      showShortcutHints: input.shell.shortcutHints
    },
    on: {
      search: runtime.setMqttSearch,
      'focus-config': runtime.focusMqttConfig,
      'focus-connection-group': runtime.focusMqttConnectionGroup,
      'focus-session': runtime.focusMqttSession,
      'focus-message': runtime.focusMqttMessage,
      'focus-log': runtime.focusMqttLog,
      'update-config-draft': runtime.updateMqttConfigDraft,
      'update-connection-group-draft': runtime.updateMqttConnectionGroupDraft,
      'update-subscription-draft': runtime.updateMqttSubscriptionDraft,
      'update-favorite-draft': runtime.updateMqttFavoriteDraft,
      'update-record-edit-draft': runtime.updateMqttRecordEditDraft,
      'update-publish-draft-history-edit-draft': runtime.updateMqttPublishDraftHistoryEditDraft,
      'update-publish-draft': runtime.updateMqttPublishDraft,
      dispatch: runtime.dispatch
    }
  }
}
