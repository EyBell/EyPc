import { defineAsyncComponent } from 'vue'
import type { PortGroupTarget } from '../../../domain/types'
import type { FeaturePageBindingV7, FeaturePageHostV7, FeaturePageShellV7 } from '../featureModule'
import type { PortsRuntimeSliceV7 } from '../featureRuntimeSlices'
import type { RuntimeSliceOwnerV7 } from '../../runtimeSlice'

const PortsPage = defineAsyncComponent(() => import('../../../pages/PortsPage.vue'))

function stringArg(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key]
  return typeof value === 'string' ? value : undefined
}

function portGroupTargetFromArgs(args?: Record<string, unknown>): PortGroupTarget | null {
  const kind = args?.targetKind
  const id = args?.targetId
  if ((kind === 'group' || kind === 'folder') && typeof id === 'string') return { kind, id }
  return null
}

export function bindPortsPage(input: {
  runtime: FeaturePageHostV7
  slice: RuntimeSliceOwnerV7<PortsRuntimeSliceV7>
  shell: FeaturePageShellV7
}): FeaturePageBindingV7 {
  const runtime = input.runtime as FeaturePageHostV7 & {
    setPortSearch: (query: string) => void
    setPortGroupSearch: (query: string) => void
    focusPort: (id: string) => unknown
    togglePortSelection: (id: string) => unknown
    focusPortGroupTarget: (target: PortGroupTarget) => unknown
    movePortGroupToFolder: (groupId: string, folderId: string | null) => unknown
    updatePortGroupDraft: (input: Partial<{ name: string; entriesText: string; color: string; folderId: string | null }>) => unknown
    savePortGroupDraft: (input: { name: string; entriesText: string; color: string; folderId?: string | null }) => unknown
    cancelPortGroupDraft: () => unknown
  }
  const dispatch = (actionId: string, args?: Record<string, unknown>) => {
    if (actionId === 'ports.search.set') {
      runtime.setPortSearch(stringArg(args, 'query') ?? '')
      return
    }
    if (actionId === 'ports.groupSearch.set') {
      runtime.setPortGroupSearch(stringArg(args, 'query') ?? '')
      return
    }
    if (actionId === 'ports.port.focus') {
      const portId = stringArg(args, 'portId')
      if (portId) runtime.focusPort(portId)
      return
    }
    if (actionId === 'ports.port.toggle') {
      const portId = stringArg(args, 'portId')
      if (portId) runtime.togglePortSelection(portId)
      return
    }
    if (actionId === 'ports.groupTarget.focus') {
      const target = portGroupTargetFromArgs(args)
      if (target) runtime.focusPortGroupTarget(target)
      return
    }
    if (actionId === 'ports.group.moveToFolder') {
      const groupId = stringArg(args, 'groupId')
      if (!groupId) return
      const folderId = args?.folderId
      runtime.movePortGroupToFolder(groupId, folderId === null || folderId === undefined ? null : typeof folderId === 'string' ? folderId : null)
      return
    }
    if (actionId === 'ports.group.draft.update') {
      const input: Partial<{ name: string; entriesText: string; color: string; folderId: string | null }> = {}
      if (typeof args?.name === 'string') input.name = args.name
      if (typeof args?.entriesText === 'string') input.entriesText = args.entriesText
      if (typeof args?.color === 'string') input.color = args.color
      if (args?.folderId === null) input.folderId = null
      else if (typeof args?.folderId === 'string') input.folderId = args.folderId
      runtime.updatePortGroupDraft(input)
      return
    }
    if (actionId === 'ports.group.draft.save') {
      runtime.savePortGroupDraft({
        name: stringArg(args, 'name') ?? '',
        entriesText: stringArg(args, 'entriesText') ?? '',
        color: stringArg(args, 'color') ?? '',
        folderId: args?.folderId === null || args?.folderId === undefined ? null : stringArg(args, 'folderId') ?? null
      })
      return
    }
    if (actionId === 'ports.group.draft.cancel') {
      runtime.cancelPortGroupDraft()
      return
    }
    return runtime.dispatch(actionId, args)
  }
  return {
    page: PortsPage,
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
