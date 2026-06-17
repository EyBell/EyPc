<script setup lang="ts">
import { computed, nextTick, reactive, watch } from 'vue'
import type { AppRuntimeSnapshot } from '../runtime/appRuntime'
import type { PortGroupTarget } from '../domain/types'
import type { SearchHistoryTarget } from '../domain/searchHistory'
import SelectableList from '../components/SelectableList.vue'
import SearchSuggestBox from '../components/SearchSuggestBox.vue'

const props = defineProps<{ snapshot: AppRuntimeSnapshot; shiftPreview?: boolean; showShortcutHints?: boolean }>()
const groupForm = reactive({ name: '', entriesText: '', color: '#00A676', folderId: '' })
let draggingGroupId = ''

watch(() => props.snapshot.portGroupDraft, (draft) => {
  groupForm.name = draft?.name || ''
  groupForm.entriesText = draft?.entriesText || ''
  groupForm.color = draft?.color || '#00A676'
  groupForm.folderId = draft?.folderId || ''
}, { immediate: true })

const emit = defineEmits<{
  search: [value: string]
  groupSearch: [value: string]
  scan: []
  focus: [id: string]
  toggle: [id: string]
  focusGroup: [id: string]
  focusGroupTarget: [target: PortGroupTarget]
  moveGroupToFolder: [groupId: string, folderId: string | null]
  saveGroupDraft: [input: { name: string; entriesText: string; color: string; folderId: string | null }]
  updateGroupDraft: [input: { name?: string; entriesText?: string; color?: string; folderId?: string | null }]
  cancelGroupDraft: []
  dispatch: [actionId: string, args?: Record<string, unknown>]
}>()

watch(() => props.snapshot.portGroupDraft?.activeField, (field) => {
  if (!field) return
  void nextTick(() => {
    document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-group-field="${field}"]`)?.focus()
  })
})

function updateDraft(input: { name?: string; entriesText?: string; color?: string; folderId?: string | null }) {
  emit('updateGroupDraft', input)
}

function dispatchPortRowAction(id: string, actionId: string) {
  emit('focus', id)
  emit('dispatch', actionId)
}

function drawerTitle() {
  if (props.snapshot.portDrawer.mode === 'group') return props.snapshot.portDrawer.groupTarget?.kind === 'folder' ? '分组夹动作' : '分组动作'
  if (props.snapshot.portDrawer.mode === 'multi') return `已选 ${props.snapshot.portDrawer.targetIds.length} 个端口`
  return '端口动作'
}

function drawerSubtitle() {
  if (props.snapshot.portDrawer.mode === 'group') {
    const row = props.snapshot.portGroupRows.find((item) => item.target.kind === props.snapshot.portDrawer.groupTarget?.kind && item.target.id === props.snapshot.portDrawer.groupTarget?.id)
    return row ? `${row.name} · ${row.kind === 'folder' ? `${row.childCount} 个分组` : row.entries.join(', ')}` : '当前端口组'
  }
  if (props.snapshot.portDrawer.mode === 'multi') return '批量目标'
  const row = props.snapshot.ports.find((item) => item.id === props.snapshot.portDrawer.targetIds[0])
  return row ? `:${row.port} · PID ${row.pid}` : '当前焦点'
}

function groupEditorTitle() {
  const draft = props.snapshot.portGroupDraft
  if (!draft) return ''
  if (draft.mode === 'create') return '新建端口组'
  if (draft.target?.kind === 'folder') return '重命名分组夹'
  return draft.mode === 'rename' ? '重命名端口组' : '编辑端口组'
}

function detailRows() {
  const row = props.snapshot.portDetailTarget
  if (!row) return []
  return [
    ['端口', `:${row.port}`],
    ['PID', String(row.pid)],
    ['进程', row.command],
    ['地址', row.address],
    ['用户', row.user || '未知'],
    ['协议', row.protocol.toUpperCase()],
    ['状态', row.state]
  ]
}

function groupDetailRows() {
  const row = props.snapshot.portGroupDetailTarget
  if (!row) return []
  return [
    ['类型', row.kind === 'folder' ? '分组夹' : '端口组'],
    ['名称', row.name],
    ['内容', row.kind === 'folder' ? `${row.childCount} 个子分组` : row.entries.join(', ')],
    ['颜色', row.color]
  ]
}

function focusGroupRow(target: PortGroupTarget) {
  emit('focusGroupTarget', target)
}

function openGroupContextMenu(target: PortGroupTarget) {
  emit('focusGroupTarget', target)
  emit('dispatch', 'ports.drawer.open')
}

function dragGroup(target: PortGroupTarget) {
  draggingGroupId = target.kind === 'group' ? target.id : ''
}

function dropGroup(folderId: string | null) {
  if (!draggingGroupId) return
  emit('moveGroupToFolder', draggingGroupId, folderId)
  draggingGroupId = ''
}

function targetArgs(target: PortGroupTarget) {
  return { targetKind: target.kind, targetId: target.id, groupId: target.kind === 'group' ? target.id : undefined }
}

function sameGroupTarget(left: PortGroupTarget | null | undefined, right: PortGroupTarget | null | undefined) {
  return Boolean(left && right && left.kind === right.kind && left.id === right.id)
}

const shiftPreviewRow = computed(() => {
  if (!props.shiftPreview) return null
  const target = props.snapshot.focusedPortGroupTarget?.kind === 'group'
    ? props.snapshot.focusedPortGroupTarget
    : props.snapshot.selectedPortGroupTarget?.kind === 'group' ? props.snapshot.selectedPortGroupTarget : null
  if (!target) return null
  return props.snapshot.portGroupRows.find((row) => row.kind === 'group' && sameGroupTarget(row.target, target)) || null
})

function isShiftPreviewTarget(row: AppRuntimeSnapshot['portGroupRows'][number]) {
  const target = shiftPreviewRow.value?.target || null
  return row.kind === 'group' && sameGroupTarget(row.target, target)
}

function commandLabel(commandId: string, fallback: string) {
  return props.snapshot.commandShortcutLabels[commandId] || fallback
}

function ctrlCommandLabel(commandId: string) {
  if (!props.showShortcutHints) return ''
  return (props.snapshot.commandShortcutLabels[commandId] || '')
    .split(' / ')
    .filter((label) => label.startsWith('c-'))
    .join(' / ')
}

function portSearchStatus() {
  const parts: string[] = []
  if (props.snapshot.selectedPortGroupTarget) parts.push('分组过滤')
  if (props.snapshot.state.portSearch.trim()) parts.push(`${props.snapshot.filteredPorts.length}/${props.snapshot.ports.length}`)
  return parts.join(' · ')
}

function groupSearchStatus() {
  return props.snapshot.portGroupSearch.trim() ? `${props.snapshot.portGroupRows.length} 项` : ''
}

function acceptHistory(payload: { target: SearchHistoryTarget; value: string }) {
  emit('dispatch', 'search.history.accept', payload)
}

function deleteHistory(payload: { target: SearchHistoryTarget; value: string }) {
  emit('dispatch', 'search.history.delete', payload)
}
</script>

<template>
  <section class="page-grid" :class="{ 'groups-collapsed': !props.snapshot.groupSidePanelOpen }">
    <button
      v-if="!props.snapshot.groupSidePanelOpen"
      type="button"
      class="group-panel-toggle group-panel-toggle-collapsed"
      :title="`展开端口组栏 ${commandLabel('ports.groups.togglePanel', 'c-w')}`"
      :aria-label="`展开端口组栏 ${commandLabel('ports.groups.togglePanel', 'c-w')}`"
      @click="emit('dispatch', 'ports.groups.togglePanel')"
    >
      ›
    </button>
    <aside
      v-if="props.snapshot.groupSidePanelOpen"
      class="side-panel"
      :class="{ active: props.snapshot.activePortPane === 'groups' }"
      data-role="port-groups-panel"
      tabindex="-1"
      @dragover.prevent
      @drop="dropGroup(null)"
    >
      <div class="group-search-row">
        <button
          type="button"
          class="group-panel-toggle group-panel-toggle-inline"
          :title="`收起端口组栏 ${commandLabel('ports.groups.togglePanel', 'c-w')}`"
          :aria-label="`收起端口组栏 ${commandLabel('ports.groups.togglePanel', 'c-w')}`"
          @click="emit('dispatch', 'ports.groups.togglePanel')"
        >
          ‹
        </button>
        <SearchSuggestBox
          :model-value="props.snapshot.portGroupSearch"
          role="port-group-search"
          target="ports.groups"
          placeholder="搜索端口组"
          :history-state="props.snapshot.searchHistoryState"
          :status="groupSearchStatus()"
          :shortcut-hint="ctrlCommandLabel('ports.groupSearch.focus')"
          @focus="emit('dispatch', 'ports.groupSearch.focus')"
          @update:model-value="emit('groupSearch', $event)"
          @accept="acceptHistory"
          @delete="deleteHistory"
        />
        <button
          type="button"
          class="add-folder-button"
          title="新增分组夹"
          aria-label="新增分组夹"
          @click="emit('dispatch', 'ports.groupFolder.create')"
        >
          +
        </button>
      </div>
      <div
        v-for="row in props.snapshot.portGroupRows"
        :key="row.rowId"
        class="group-row"
        :class="{
          focused: props.snapshot.focusedPortGroupTarget?.kind === row.target.kind && props.snapshot.focusedPortGroupTarget?.id === row.target.id,
          selected: props.snapshot.selectedPortGroupTarget?.kind === row.target.kind && props.snapshot.selectedPortGroupTarget?.id === row.target.id,
          folder: row.kind === 'folder',
          child: row.depth > 0,
          'shift-preview-target': isShiftPreviewTarget(row)
        }"
        :style="{ '--group-color': row.color, '--depth': row.depth }"
        :draggable="row.kind === 'group'"
        @click="focusGroupRow(row.target)"
        @contextmenu.prevent="openGroupContextMenu(row.target)"
        @dragstart="dragGroup(row.target)"
        @dragover.prevent="row.kind === 'folder'"
        @drop.stop="row.kind === 'folder' ? dropGroup(row.target.id) : undefined"
      >
        <div v-if="row.kind === 'folder'" class="group-row-line folder-row-line">
          <span class="group-main">
            <button
              type="button"
              class="folder-toggle"
              @click.stop="focusGroupRow(row.target); emit('dispatch', row.collapsed ? 'ports.groupTarget.expand' : 'ports.groupTarget.collapse')"
            >
              {{ row.collapsed ? '>' : 'v' }}
            </button>
            <span>{{ row.name }}</span>
          </span>
          <small>{{ row.childCount }} 个组</small>
        </div>
        <template v-else>
          <div class="group-row-line group-item-line">
            <span class="group-main">
              <span>{{ row.name }}</span>
            </span>
            <span class="group-actions">
              <button type="button" @click.stop="focusGroupRow(row.target); emit('dispatch', 'ports.group.apply', targetArgs(row.target))">
                <span>搜索</span>
                <kbd>{{ commandLabel('ports.group.apply', 'cr') }}</kbd>
              </button>
              <button type="button" class="danger" @click.stop="focusGroupRow(row.target); emit('dispatch', 'ports.group.kill.force', targetArgs(row.target))">
                <span>强杀</span>
                <kbd>{{ commandLabel('ports.group.kill.force', 'c-s-cr') }}</kbd>
              </button>
              <button type="button" @click.stop="focusGroupRow(row.target); emit('dispatch', 'ports.drawer.open')">
                <span>更多</span>
                <kbd>{{ commandLabel('ports.drawer.open', 'c-→') }}</kbd>
              </button>
            </span>
          </div>
          <small class="group-rule-line">{{ row.entries.join(', ') }}</small>
        </template>
      </div>
      <p v-if="!props.snapshot.portGroupRows.length" class="empty-note">暂无端口组</p>
      <section v-if="shiftPreviewRow" class="group-preview-editor" aria-label="端口组只读预览">
        <header>
          <span class="color-dot" :style="{ '--node-color': shiftPreviewRow.color }"></span>
          <strong>{{ shiftPreviewRow.name }}</strong>
          <small>只读</small>
        </header>
        <label>
          名称
          <input :value="shiftPreviewRow.name" readonly tabindex="-1" />
        </label>
        <label>
          规则
          <textarea :value="shiftPreviewRow.entries.join('\n')" rows="5" readonly tabindex="-1" />
        </label>
        <label>
          颜色
          <input :value="shiftPreviewRow.color" readonly tabindex="-1" />
        </label>
      </section>
    </aside>
    <section class="main-panel" :class="{ active: props.snapshot.activePortPane === 'results' }">
      <div class="toolbar">
        <SearchSuggestBox
          :model-value="props.snapshot.state.portSearch"
          role="port-search"
          target="ports.processes"
          placeholder="输入端口、PID、进程名 或 node | java"
          :history-state="props.snapshot.searchHistoryState"
          :error="props.snapshot.portSearchError"
          :status="portSearchStatus()"
          :shortcut-hint="ctrlCommandLabel('ports.search.focus')"
          @focus="emit('dispatch', 'ports.search.focus')"
          @update:model-value="emit('search', $event)"
          @accept="acceptHistory"
          @delete="deleteHistory"
        />
      </div>
      <SelectableList
        :items="props.snapshot.filteredPorts"
        :selected-ids="props.snapshot.selectedPortIds"
        :focused-id="props.snapshot.focusedPortId"
        :show-selection="props.snapshot.selectedPortIds.length > 0"
        @focus="emit('focus', $event)"
        @toggle="emit('toggle', $event)"
        @action="dispatchPortRowAction"
      />
    </section>
    <div
      v-if="props.snapshot.portDetail.open"
      class="drawer-overlay drawer-overlay-left"
      role="presentation"
      @click="emit('dispatch', 'ports.detail.close')"
    >
      <aside
        class="port-detail-drawer"
        :class="{ active: props.snapshot.portDetail.active }"
        aria-label="端口详情抽屉"
        @click.stop
      >
        <header class="drawer-header">
          <span>
            <strong>进程详情</strong>
            <small v-if="props.snapshot.portDetailTarget">:{{ props.snapshot.portDetailTarget.port }} · PID {{ props.snapshot.portDetailTarget.pid }}</small>
            <small v-else>当前高亮进程</small>
          </span>
          <button type="button" title="关闭详情" @click="emit('dispatch', 'ports.detail.close')">x</button>
        </header>
        <div v-if="props.snapshot.portDetailTarget" class="detail-list">
          <div v-for="row in detailRows()" :key="row[0]" class="detail-row">
            <span>{{ row[0] }}</span>
            <strong>{{ row[1] }}</strong>
          </div>
        </div>
        <p v-else class="empty-note">没有可展示的端口进程</p>
        <div class="detail-actions">
          <button type="button" @click="emit('dispatch', 'ports.kill.confirm')">终止确认</button>
          <button type="button" class="danger" @click="emit('dispatch', 'ports.kill.force')">强杀</button>
          <button type="button" @click="emit('dispatch', 'ports.group.createFromSelection')">收藏为组</button>
          <button type="button" @click="emit('dispatch', 'ports.drawer.open')">菜单</button>
        </div>
      </aside>
    </div>
    <div
      v-if="props.snapshot.portGroupDetail.open"
      class="drawer-overlay drawer-overlay-left"
      role="presentation"
      @click="emit('dispatch', 'ports.groupDetail.close')"
    >
      <aside
        class="port-detail-drawer"
        :class="{ active: props.snapshot.portGroupDetail.active }"
        aria-label="端口组详情抽屉"
        @click.stop
      >
        <header class="drawer-header">
          <span>
            <strong>{{ props.snapshot.portGroupDetailTarget?.kind === 'folder' ? '分组夹详情' : '分组详情' }}</strong>
            <small>{{ props.snapshot.portGroupDetailTarget?.name || '当前高亮分组' }}</small>
          </span>
          <button type="button" title="关闭详情" @click="emit('dispatch', 'ports.groupDetail.close')">x</button>
        </header>
        <div v-if="props.snapshot.portGroupDetailTarget" class="detail-list">
          <div v-for="row in groupDetailRows()" :key="row[0]" class="detail-row">
            <span>{{ row[0] }}</span>
            <strong>{{ row[1] }}</strong>
          </div>
        </div>
        <p v-else class="empty-note">没有可展示的端口组</p>
        <div class="detail-actions">
          <button type="button" @click="emit('dispatch', 'ports.group.apply', props.snapshot.portGroupDetail.target ? targetArgs(props.snapshot.portGroupDetail.target) : undefined)">搜索</button>
          <button type="button" class="danger" @click="emit('dispatch', 'ports.group.kill.force', props.snapshot.portGroupDetail.target ? targetArgs(props.snapshot.portGroupDetail.target) : undefined)">强杀</button>
          <button type="button" @click="emit('dispatch', 'ports.drawer.open')">更多</button>
          <button type="button" @click="emit('dispatch', 'ports.groupDetail.close')">关闭</button>
        </div>
      </aside>
    </div>
    <div
      v-if="props.snapshot.portDrawer.open"
      class="drawer-overlay drawer-overlay-right"
      role="presentation"
      @click="emit('dispatch', 'ports.drawer.close')"
    >
      <aside
        class="port-action-drawer"
        :class="{ active: props.snapshot.portDrawer.active, multi: props.snapshot.portDrawer.mode === 'multi' }"
        aria-label="端口动作抽屉"
        @click.stop
      >
        <header class="drawer-header">
          <span>
            <strong>{{ drawerTitle() }}</strong>
            <small>{{ drawerSubtitle() }}</small>
          </span>
          <span class="drawer-header-actions">
            <button v-if="!props.snapshot.portDrawer.active" type="button" title="激活抽屉键盘层" @click="emit('dispatch', 'ports.drawer.open')">键盘</button>
            <button type="button" title="关闭抽屉" @click="emit('dispatch', 'ports.drawer.close')">x</button>
          </span>
        </header>
        <div class="drawer-action-list" role="menu">
          <button
            v-for="(item, index) in props.snapshot.portDrawerItems"
            :key="`${item.commandId}:${index}`"
            type="button"
            class="drawer-action"
            :class="{ active: props.snapshot.portDrawer.activeIndex === index, danger: item.risk === 'destructive' }"
            :disabled="!item.enabled"
            role="menuitem"
            @click="emit('dispatch', `ports.drawer.select.${index + 1}`)"
          >
            <span class="drawer-action-icon">{{ item.icon }}</span>
            <span class="drawer-action-copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.description }}</small>
            </span>
            <kbd>{{ item.shortcutLabel || '未绑定' }}</kbd>
          </button>
        </div>
      </aside>
    </div>
    <div v-if="props.snapshot.portGroupDraft" class="modal-backdrop">
      <section class="confirm-layer group-editor" role="dialog" aria-modal="true">
        <h2>{{ groupEditorTitle() }}</h2>
        <label>
          名称
          <input
            v-model="groupForm.name"
            data-role="port-group-editor"
            data-group-field="name"
            @input="updateDraft({ name: groupForm.name })"
          />
        </label>
        <label v-if="props.snapshot.portGroupDraft.mode !== 'rename'">
          规则
          <textarea
            v-model="groupForm.entriesText"
            rows="6"
            data-role="port-group-editor"
            data-group-field="entries"
            placeholder="3000&#10;5173-5175&#10;/node|java/i"
            @input="updateDraft({ entriesText: groupForm.entriesText })"
          />
        </label>
        <label v-if="props.snapshot.portGroupDraft.mode !== 'rename'">
          颜色
          <input
            v-model="groupForm.color"
            data-role="port-group-editor"
            data-group-field="color"
            @input="updateDraft({ color: groupForm.color })"
          />
        </label>
        <label v-if="props.snapshot.portGroupDraft.mode !== 'rename'">
          所在分组夹
          <select
            v-model="groupForm.folderId"
            data-role="port-group-editor"
            data-group-field="folder"
            @change="updateDraft({ folderId: groupForm.folderId || null })"
          >
            <option value="">不放入分组夹</option>
            <option v-for="folder in props.snapshot.state.portGroupFolders" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
          </select>
        </label>
        <div class="confirm-actions">
          <button type="button" @click="emit('cancelGroupDraft')">取消</button>
          <button type="button" @click="emit('saveGroupDraft', { name: groupForm.name, entriesText: groupForm.entriesText, color: groupForm.color, folderId: groupForm.folderId || null })">保存</button>
        </div>
      </section>
    </div>
  </section>
</template>
