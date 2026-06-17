<script setup lang="ts">
import { nextTick, reactive, watch } from 'vue'
import type { AppRuntimeSnapshot } from '../runtime/appRuntime'
import SelectableList from '../components/SelectableList.vue'

const props = defineProps<{ snapshot: AppRuntimeSnapshot }>()
const groupForm = reactive({ name: '', entriesText: '', color: '#00A676' })

watch(() => props.snapshot.portGroupDraft, (draft) => {
  groupForm.name = draft?.name || ''
  groupForm.entriesText = draft?.entriesText || ''
  groupForm.color = draft?.color || '#00A676'
}, { immediate: true })

const emit = defineEmits<{
  search: [value: string]
  groupSearch: [value: string]
  scan: []
  focus: [id: string]
  toggle: [id: string]
  focusGroup: [id: string]
  saveGroupDraft: [input: { name: string; entriesText: string; color: string }]
  updateGroupDraft: [input: { name?: string; entriesText?: string; color?: string }]
  cancelGroupDraft: []
  dispatch: [actionId: string, args?: Record<string, unknown>]
}>()

watch(() => props.snapshot.portGroupDraft?.activeField, (field) => {
  if (!field) return
  void nextTick(() => {
    document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-group-field="${field}"]`)?.focus()
  })
})

function updateDraft(input: { name?: string; entriesText?: string; color?: string }) {
  emit('updateGroupDraft', input)
}

function dispatchPortRowAction(id: string, actionId: string) {
  emit('focus', id)
  emit('dispatch', actionId)
}

function drawerTitle() {
  if (props.snapshot.portDrawer.mode === 'group') return '分组动作'
  if (props.snapshot.portDrawer.mode === 'multi') return `已选 ${props.snapshot.portDrawer.targetIds.length} 个端口`
  return '端口动作'
}

function drawerSubtitle() {
  if (props.snapshot.portDrawer.mode === 'group') return '当前端口组'
  if (props.snapshot.portDrawer.mode === 'multi') return '批量目标'
  const row = props.snapshot.ports.find((item) => item.id === props.snapshot.portDrawer.targetIds[0])
  return row ? `:${row.port} · PID ${row.pid}` : '当前焦点'
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
</script>

<template>
  <section class="page-grid">
    <aside class="side-panel" :class="{ active: props.snapshot.activePortPane === 'groups' }">
      <div class="panel-header">
        <h2>端口组</h2>
        <span class="header-actions">
          <button type="button" @click="emit('dispatch', 'ports.group.create')">新建</button>
          <button type="button" @click="emit('dispatch', 'ports.group.createFromSelection')">收藏选中</button>
        </span>
      </div>
      <p class="pane-meta">
        <span>示例：3000 · 5173-5175 · /node|java/i</span>
      </p>
      <input
        data-role="port-group-search"
        class="pane-search"
        :value="props.snapshot.portGroupSearch"
        placeholder="搜索端口组"
        @focus="emit('dispatch', 'ports.pane.groups')"
        @input="emit('groupSearch', ($event.target as HTMLInputElement).value)"
      />
      <div
        v-for="group in props.snapshot.filteredPortGroups"
        :key="group.id"
        class="group-row"
        :class="{ focused: props.snapshot.focusedPortGroupId === group.id, selected: props.snapshot.selectedPortGroupId === group.id }"
        :style="{ '--group-color': group.color }"
        @click="emit('focusGroup', group.id)"
      >
        <span>{{ group.name }}</span>
        <small>{{ group.entries.join(', ') }}</small>
        <span class="group-actions">
          <button type="button" @click.stop="emit('focusGroup', group.id); emit('dispatch', 'ports.group.apply')">应用</button>
          <button type="button" @click.stop="emit('focusGroup', group.id); emit('dispatch', 'ports.group.rename')">重命名</button>
          <button type="button" @click.stop="emit('focusGroup', group.id); emit('dispatch', 'ports.group.edit')">规则</button>
          <button type="button" @click.stop="emit('focusGroup', group.id); emit('dispatch', 'ports.group.kill.confirm')">终止</button>
          <button type="button" class="danger" @click.stop="emit('focusGroup', group.id); emit('dispatch', 'ports.group.kill.force')">强杀</button>
          <button type="button" @click.stop="emit('focusGroup', group.id); emit('dispatch', 'ports.drawer.open')">...</button>
        </span>
      </div>
      <p v-if="!props.snapshot.filteredPortGroups.length" class="empty-note">暂无端口组</p>
    </aside>
    <section class="main-panel" :class="{ active: props.snapshot.activePortPane === 'results' }">
      <div class="toolbar">
        <div class="query-summary">
          <strong>端口查询</strong>
          <input
            data-role="primary-search"
            :value="props.snapshot.state.portSearch"
            placeholder="输入端口、PID、进程名或 /node|java/i"
            @focus="emit('dispatch', 'ports.pane.results')"
            @input="emit('search', ($event.target as HTMLInputElement).value)"
          />
          <small v-if="props.snapshot.selectedPortGroupId">已应用分组过滤</small>
          <small v-if="props.snapshot.portSearchError" class="field-error">{{ props.snapshot.portSearchError }}</small>
        </div>
        <div class="toolbar-actions">
          <button type="button" @click="emit('dispatch', 'search.focus')">聚焦</button>
          <button type="button" @click="emit('scan')">扫描</button>
          <button type="button" @click="emit('dispatch', 'ports.detail.open')">详情</button>
          <button type="button" @click="emit('dispatch', 'ports.kill.confirm')">终止</button>
          <button type="button" class="danger" @click="emit('dispatch', 'ports.kill.force')">强杀</button>
        </div>
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
        <h2>{{ props.snapshot.portGroupDraft.mode === 'create' ? '新建端口组' : props.snapshot.portGroupDraft.mode === 'rename' ? '重命名端口组' : '编辑端口组' }}</h2>
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
        <p class="pane-meta">每行一条规则：端口、端口区间或 JavaScript 正则表达式。</p>
        <div class="confirm-actions">
          <button type="button" @click="emit('cancelGroupDraft')">取消</button>
          <button type="button" @click="emit('saveGroupDraft', { name: groupForm.name, entriesText: groupForm.entriesText, color: groupForm.color })">保存</button>
        </div>
      </section>
    </div>
  </section>
</template>
