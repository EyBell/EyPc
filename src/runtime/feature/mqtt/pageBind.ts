import { defineAsyncComponent } from 'vue'
import type { MqttPublishDraft } from '../../../domain/types'
import type {
  MqttConfigDraft,
  MqttConnectionGroupDraft,
  MqttPublishDraftHistoryEditDraft,
  MqttRecordEditDraft,
  MqttSubscriptionEditorDraft
} from '../../appRuntime'
import type { FeaturePageBindingV7, FeaturePageHostV7, FeaturePageShellV7 } from '../featureModule'
import type { MqttRuntimeSliceV7 } from '../featureRuntimeSlices'
import type { RuntimeSliceOwnerV7 } from '../../runtimeSlice'

const MqttPage = defineAsyncComponent(() => import('../../../pages/MqttPage.vue'))

function stringArg(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key]
  return typeof value === 'string' ? value : undefined
}

export function bindMqttPage(input: {
  runtime: FeaturePageHostV7
  slice: RuntimeSliceOwnerV7<MqttRuntimeSliceV7>
  shell: FeaturePageShellV7
}): FeaturePageBindingV7 {
  const runtime = input.runtime as FeaturePageHostV7 & {
    setMqttSearch: (query: string) => unknown
    focusMqttConfig: (id: string) => unknown
    focusMqttConnectionGroup: (id: string) => unknown
    focusMqttSession: (id: string) => unknown
    focusMqttLog: (id: string) => unknown
    updateMqttConfigDraft: (input: Partial<Omit<MqttConfigDraft, 'mode' | 'targetId' | 'activeField'>>) => unknown
    updateMqttConnectionGroupDraft: (input: Partial<Omit<MqttConnectionGroupDraft, 'mode' | 'targetId'>>) => unknown
    updateMqttSubscriptionDraft: (input: Partial<Omit<MqttSubscriptionEditorDraft, 'connectionId'>>) => unknown
    updateMqttRecordEditDraft: (input: Partial<Omit<MqttRecordEditDraft, 'mode' | 'targetKind' | 'targetId'>>) => unknown
    updateMqttPublishDraftHistoryEditDraft: (input: Partial<Pick<MqttPublishDraftHistoryEditDraft, 'title' | 'note' | 'topic' | 'payload' | 'activeField'>>) => unknown
    updateMqttPublishDraft: (input: Partial<MqttPublishDraft>) => unknown
  }
  const dispatch = (actionId: string, args?: Record<string, unknown>) => {
    if (actionId === 'mqtt.search.set') {
      runtime.setMqttSearch(stringArg(args, 'query') ?? '')
      return
    }
    if (actionId === 'mqtt.config.focus') {
      const id = stringArg(args, 'id')
      if (id) runtime.focusMqttConfig(id)
      return
    }
    if (actionId === 'mqtt.connectionGroup.focus') {
      const id = stringArg(args, 'id')
      if (id) runtime.focusMqttConnectionGroup(id)
      return
    }
    if (actionId === 'mqtt.session.focus') {
      const id = stringArg(args, 'id')
      if (id) runtime.focusMqttSession(id)
      return
    }
    if (actionId === 'mqtt.log.focus') {
      const id = stringArg(args, 'id')
      if (id) runtime.focusMqttLog(id)
      return
    }
    if (actionId === 'mqtt.config.draft.update') {
      runtime.updateMqttConfigDraft((args ?? {}) as Partial<Omit<MqttConfigDraft, 'mode' | 'targetId' | 'activeField'>>)
      return
    }
    if (actionId === 'mqtt.connectionGroup.draft.update') {
      runtime.updateMqttConnectionGroupDraft((args ?? {}) as Partial<Omit<MqttConnectionGroupDraft, 'mode' | 'targetId'>>)
      return
    }
    if (actionId === 'mqtt.subscription.draft.update') {
      runtime.updateMqttSubscriptionDraft((args ?? {}) as Partial<Omit<MqttSubscriptionEditorDraft, 'connectionId'>>)
      return
    }
    if (actionId === 'mqtt.record.edit.draft.update') {
      runtime.updateMqttRecordEditDraft((args ?? {}) as Partial<Omit<MqttRecordEditDraft, 'mode' | 'targetKind' | 'targetId'>>)
      return
    }
    if (actionId === 'mqtt.publish.draft.history.edit.update') {
      runtime.updateMqttPublishDraftHistoryEditDraft((args ?? {}) as Partial<Pick<MqttPublishDraftHistoryEditDraft, 'title' | 'note' | 'topic' | 'payload' | 'activeField'>>)
      return
    }
    if (actionId === 'mqtt.publish.draft.update') {
      runtime.updateMqttPublishDraft((args ?? {}) as Partial<MqttPublishDraft>)
      return
    }
    return runtime.dispatch(actionId, args)
  }
  return {
    page: MqttPage,
    props: {
      snapshot: input.slice.snapshot(),
      shiftPreview: input.shell.shiftPreview,
      showShortcutHints: input.shell.shortcutHints
    },
    on: {
      dispatch
    }
  }
}
