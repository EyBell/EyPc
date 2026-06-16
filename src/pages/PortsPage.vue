<script setup lang="ts">
import type { AppRuntimeSnapshot } from '../runtime/appRuntime'
import SearchBox from '../components/SearchBox.vue'
import SelectableList from '../components/SelectableList.vue'
import { buildPortGroupTargets } from '../domain/ports'

const props = defineProps<{ snapshot: AppRuntimeSnapshot }>()
const emit = defineEmits<{
  search: [value: string]
  scan: []
  focus: [id: string]
  toggle: [id: string]
  dispatch: [actionId: string]
}>()
</script>

<template>
  <section class="page-grid">
    <aside class="side-panel">
      <div class="panel-header">
        <h2>端口组</h2>
        <button type="button" @click="emit('scan')">刷新</button>
      </div>
      <button
        v-for="group in props.snapshot.state.portGroups"
        :key="group.id"
        type="button"
        class="group-row"
        :style="{ '--group-color': group.color }"
      >
        <span>{{ group.name }}</span>
        <small>{{ buildPortGroupTargets(group).join(', ') }}</small>
      </button>
    </aside>
    <section class="main-panel">
      <div class="toolbar">
        <SearchBox
          :model-value="props.snapshot.state.portSearch"
          placeholder="搜索端口、PID、进程名；支持 /node|java/i"
          :error="props.snapshot.portSearchError"
          :history="props.snapshot.state.portSearchHistory"
          @update:model-value="emit('search', $event)"
        />
        <div class="toolbar-actions">
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
  </section>
</template>
