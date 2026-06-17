<script setup lang="ts">
import { reactive, watch } from 'vue'
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
  cancelGroupDraft: []
  dispatch: [actionId: string, args?: Record<string, unknown>]
}>()
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
          <button type="button" @click="emit('dispatch', 'ports.kill.confirm')">终止</button>
          <button type="button" class="danger" @click="emit('dispatch', 'ports.kill.force')">强杀</button>
        </div>
      </div>
      <SelectableList
        :items="props.snapshot.filteredPorts"
        :selected-ids="props.snapshot.selectedPortIds"
        :focused-id="props.snapshot.focusedPortId"
        @focus="emit('focus', $event)"
        @toggle="emit('toggle', $event)"
      />
    </section>
    <div v-if="props.snapshot.portGroupDraft" class="modal-backdrop">
      <section class="confirm-layer group-editor" role="dialog" aria-modal="true">
        <h2>{{ props.snapshot.portGroupDraft.mode === 'create' ? '新建端口组' : '编辑端口组' }}</h2>
        <label>
          名称
          <input v-model="groupForm.name" />
        </label>
        <label>
          规则
          <textarea v-model="groupForm.entriesText" rows="6" placeholder="3000&#10;5173-5175&#10;/node|java/i" />
        </label>
        <label>
          颜色
          <input v-model="groupForm.color" />
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
