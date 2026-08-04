<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Archive, ArchiveRestore, Box, ChevronDown, ChevronRight, Clock3, Folder, Pin, Play, Settings, Square, X } from '@lucide/vue'
import QuickJumpLayer from './components/QuickJumpLayer.vue'
import { assignQuickJumpMarkers, moveQuickJumpActive, resolveQuickJumpQuery, type QuickJumpTarget } from './domain/quickJump'
import { quickJumpHitStackContainsTarget, quickJumpHitTestPoints } from './domain/quickJumpHitTest'
import { codexActionRunCanArchive, formatCodexActionRunTimestamp, type CodexActionLogDeltaV1, type CodexActionRunRecordV1, type CodexActionRunnerActionV1, type CodexActionRunnerSnapshotV1 } from './domain/codexActionRunner'

interface QuickJumpDomTarget extends QuickJumpTarget { element: HTMLElement }

const root = ref<HTMLElement | null>(null)
const snapshot = ref<CodexActionRunnerSnapshotV1 | null>(window.eypcActionRunner?.getSnapshot() || null)
const selectedLaneId = ref(snapshot.value?.selectedLaneId || '')
const expandedRunId = ref('')
const collapsedProjects = ref(new Set<string>())
const collapsedEnvironments = ref(new Set<string>())
const dragProjectKey = ref('')
const quickJump = ref<{ open: boolean; query: string; sourceTargets: QuickJumpDomTarget[]; targets: QuickJumpDomTarget[]; activeTargetId: string | null }>({ open: false, query: '', sourceTargets: [], targets: [], activeTargetId: null })
const resizeCorners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
let disposeSnapshot: (() => void) | null = null
let disposeLog: (() => void) | null = null
let draggingWindow = false
let resizingWindow: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | '' = ''
const newestRunByLane = new Map<string, string>()

const selectedAction = computed(() => {
  for (const project of snapshot.value?.catalog.projects || []) {
    for (const environment of project.environments) {
      const action = environment.actions.find((item) => item.laneId === selectedLaneId.value)
      if (action) return { project, environment, action }
    }
  }
  return null
})

const visibleRuns = computed(() => {
  const archived = snapshot.value?.view === 'archived'
  return (snapshot.value?.runs || [])
    .filter((run) => run.laneId === selectedLaneId.value && Boolean(run.archivedAt) === archived)
    .sort((left, right) => right.startedAt - left.startedAt)
})

const projectOrder = computed(() => (snapshot.value?.catalog.projects || []).map((project) => project.key))
const selectedRuntime = computed(() => selectedAction.value?.project.nodeRuntime)
const runtimeValue = computed(() => selectedRuntime.value?.mode === 'manual' && selectedRuntime.value.selectedCandidateId
  ? `manual:${selectedRuntime.value.selectedCandidateId}`
  : 'auto')
const selectedActionNeedsNode = computed(() => selectedAction.value?.action.risk === 'normal' || selectedAction.value?.action.risk === 'long-running')

function send(actionId: string, args: Record<string, unknown> = {}) {
  return window.eypcActionRunner?.action(actionId, args) === true
}

function selectAction(action: CodexActionRunnerActionV1) {
  selectedLaneId.value = action.laneId
  send('codex.actionRunner.preference.update', { selectedLaneId: action.laneId })
  const latest = (snapshot.value?.runs || []).find((run) => run.laneId === action.laneId && !run.archivedAt)
  expandedRunId.value = latest?.runId || ''
}

function toggleProject(key: string) {
  const next = new Set(collapsedProjects.value)
  next.has(key) ? next.delete(key) : next.add(key)
  collapsedProjects.value = next
}

function toggleEnvironment(key: string) {
  const next = new Set(collapsedEnvironments.value)
  next.has(key) ? next.delete(key) : next.add(key)
  collapsedEnvironments.value = next
}

function runSelected(restartIfRunning = false) {
  if (!selectedAction.value) return
  send('codex.actionRunner.run', { laneId: selectedAction.value.action.laneId, restartIfRunning })
}

function stopSelected() {
  if (!selectedAction.value) return
  send('codex.actionRunner.stop', { laneId: selectedAction.value.action.laneId })
}

function setArchived(run: CodexActionRunRecordV1, archived: boolean) {
  if (!codexActionRunCanArchive(run.status)) return
  send(archived ? 'codex.actionRunner.run.archive' : 'codex.actionRunner.run.restore', { runId: run.runId })
}

function updateView(view: 'records' | 'archived') {
  send('codex.actionRunner.preference.update', { view })
}

function togglePinned() {
  send('codex.actionRunner.preference.update', { pinned: snapshot.value?.pinned !== true })
}

function updateRuntime(event: Event) {
  if (!selectedAction.value) return
  const value = (event.target as HTMLSelectElement).value
  if (value === 'auto') send('codex.actionRunner.runtime.update', { projectKey: selectedAction.value.project.key, mode: 'auto' })
  else if (value.startsWith('manual:')) send('codex.actionRunner.runtime.update', { projectKey: selectedAction.value.project.key, mode: 'manual', candidateId: value.slice('manual:'.length) })
}

function dropProject(targetKey: string) {
  const sourceKey = dragProjectKey.value
  dragProjectKey.value = ''
  if (!sourceKey || sourceKey === targetKey) return
  const keys = [...projectOrder.value]
  const sourceIndex = keys.indexOf(sourceKey)
  const targetIndex = keys.indexOf(targetKey)
  if (sourceIndex < 0 || targetIndex < 0) return
  keys.splice(targetIndex, 0, keys.splice(sourceIndex, 1)[0])
  send('codex.actionRunner.project.reorder', { projectKeys: keys })
}

function applyLogDelta(delta: CodexActionLogDeltaV1) {
  const run = snapshot.value?.runs.find((item) => item.runId === delta.runId)
  if (!run) return
  const cursor = run.cursor || 0
  if (delta.cursor <= cursor) return
  if (delta.cursor !== cursor + 1) {
    window.eypcActionRunner?.requestSnapshot()
    return
  }
  run.logText += delta.text
  run.cursor = delta.cursor
  run.logBytes = new TextEncoder().encode(run.logText).length
  run.logLines = (run.logText.match(/\n/g) || []).length + (run.logText && !run.logText.endsWith('\n') ? 1 : 0)
}

function headerPointerDown(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button, select, option, input, a')) return
  if (!window.eypcActionRunner?.dragStart(event.screenX, event.screenY)) return
  draggingWindow = true
  event.preventDefault()
}

function resizePointerDown(corner: typeof resizingWindow, event: PointerEvent) {
  if (!corner || event.button !== 0 || !window.eypcActionRunner?.resizeStart(event.screenX, event.screenY, corner)) return
  resizingWindow = corner
  event.preventDefault()
  event.stopPropagation()
}

function onWindowPointerMove(event: PointerEvent) {
  if (draggingWindow) window.eypcActionRunner?.dragMove(event.screenX, event.screenY)
  if (resizingWindow) window.eypcActionRunner?.resizeMove(event.screenX, event.screenY)
}

function endWindowPointerInteraction() {
  if (draggingWindow) window.eypcActionRunner?.dragEnd()
  if (resizingWindow) window.eypcActionRunner?.resizeEnd()
  draggingWindow = false
  resizingWindow = ''
}

function hideRunner() {
  endWindowPointerInteraction()
  window.eypcActionRunner?.hide()
}

function quickJumpLabel(element: HTMLElement) {
  return element.dataset.quickJumpLabel || element.getAttribute('aria-label') || (element.textContent || '').replace(/\s+/g, ' ').trim() || '操作'
}

function quickJumpVisibleRect(element: HTMLElement) {
  const source = element.getBoundingClientRect()
  let left = Math.max(0, source.left)
  let top = Math.max(0, source.top)
  let right = Math.min(window.innerWidth, source.right)
  let bottom = Math.min(window.innerHeight, source.bottom)
  for (let current = element.parentElement; current; current = current.parentElement) {
    const style = window.getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || style.pointerEvents === 'none') return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
    if (!['hidden', 'clip', 'scroll', 'auto'].some((value) => style.overflow === value || style.overflowX === value || style.overflowY === value)) continue
    const rect = current.getBoundingClientRect()
    left = Math.max(left, rect.left); top = Math.max(top, rect.top); right = Math.min(right, rect.right); bottom = Math.min(bottom, rect.bottom)
  }
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

function targetVisible(element: HTMLElement) {
  if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return false
  const rect = quickJumpVisibleRect(element)
  if (rect.width < 6 || rect.height < 6) return false
  return quickJumpHitTestPoints(rect).some((point) => quickJumpHitStackContainsTarget(element, document.elementsFromPoint(point.x, point.y)))
}

function collectQuickJumpTargets(backward: boolean) {
  const elements = Array.from((root.value || document.body).querySelectorAll<HTMLElement>('[data-quick-jump-target]')).filter(targetVisible)
  const targets = elements.map((element, index) => ({ id: element.dataset.quickJumpId || `runner:${index}:${quickJumpLabel(element)}`, label: quickJumpLabel(element), searchText: element.dataset.quickJumpSearch || '', element }))
  return assignQuickJumpMarkers(backward ? targets.reverse() : targets)
}

function closeQuickJump() {
  quickJump.value.sourceTargets.forEach((target) => delete target.element.dataset.quickJumpActive)
  quickJump.value = { open: false, query: '', sourceTargets: [], targets: [], activeTargetId: null }
}

function syncQuickJumpActive() {
  quickJump.value.sourceTargets.forEach((target) => delete target.element.dataset.quickJumpActive)
  const target = quickJump.value.targets.find((item) => item.id === quickJump.value.activeTargetId)
  if (!target) return
  target.element.dataset.quickJumpActive = 'true'
  target.element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function openQuickJump(backward: boolean) {
  if (snapshot.value?.catalog.confirmLaneId) return
  const targets = collectQuickJumpTargets(backward)
  if (!targets.length) return
  quickJump.value = { open: true, query: '', sourceTargets: targets, targets, activeTargetId: targets[0]?.id || null }
  syncQuickJumpActive()
}

function activateQuickJumpTarget() {
  const target = quickJump.value.sourceTargets.find((item) => item.id === quickJump.value.activeTargetId)
  closeQuickJump()
  target?.element.focus({ preventScroll: true })
  target?.element.click()
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.matches('input, textarea, select, [contenteditable="true"]') || Boolean(target.closest('input, textarea, select, [contenteditable="true"]')))
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w') {
    event.preventDefault()
    hideRunner()
    return
  }
  if (event.key === 'Escape' && resizingWindow) {
    event.preventDefault()
    window.eypcActionRunner?.resizeCancel()
    resizingWindow = ''
    return
  }
  if (quickJump.value.open) {
    event.preventDefault(); event.stopPropagation()
    if (event.key === 'Escape') closeQuickJump()
    else if (event.key === 'Enter') activateQuickJumpTarget()
    else if (event.key === 'ArrowDown') { quickJump.value.activeTargetId = moveQuickJumpActive(quickJump.value.targets, quickJump.value.activeTargetId, 1); syncQuickJumpActive() }
    else if (event.key === 'ArrowUp') { quickJump.value.activeTargetId = moveQuickJumpActive(quickJump.value.targets, quickJump.value.activeTargetId, -1); syncQuickJumpActive() }
    else {
      const next = event.key === 'Backspace' ? quickJump.value.query.slice(0, -1) : /^[a-z]$/i.test(event.key) ? `${quickJump.value.query}${event.key.toLowerCase()}` : null
      if (next !== null) {
        const result = resolveQuickJumpQuery(quickJump.value.sourceTargets, next)
        quickJump.value = { ...quickJump.value, query: result.query, targets: result.targets, activeTargetId: result.activeTargetId }
        syncQuickJumpActive()
        if (result.exactTargetId) activateQuickJumpTarget()
      }
    }
    return
  }
  if (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget(event.target)) {
    event.preventDefault(); event.stopPropagation(); openQuickJump(event.shiftKey)
  }
}

watch(() => snapshot.value?.selectedLaneId, (laneId) => { if (laneId) selectedLaneId.value = laneId })
watch([selectedLaneId, visibleRuns], () => {
  const running = visibleRuns.value.find((run) => run.status === 'running' || run.status === 'stopping')
  const latest = running || visibleRuns.value[0]
  const previousNewest = newestRunByLane.get(selectedLaneId.value)
  if (latest && previousNewest !== latest.runId) {
    newestRunByLane.set(selectedLaneId.value, latest.runId)
    expandedRunId.value = latest.runId
  } else if (!visibleRuns.value.some((run) => run.runId === expandedRunId.value)) {
    expandedRunId.value = latest?.runId || ''
  }
}, { immediate: true })

onMounted(() => {
  disposeSnapshot = window.eypcActionRunner?.onSnapshot((value) => { snapshot.value = value }) || null
  disposeLog = window.eypcActionRunner?.onLog(applyLogDelta) || null
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('pointermove', onWindowPointerMove, true)
  window.addEventListener('pointerup', endWindowPointerInteraction, true)
  window.addEventListener('pointercancel', endWindowPointerInteraction, true)
  window.addEventListener('blur', endWindowPointerInteraction)
  nextTick(() => root.value?.focus())
})

onUnmounted(() => {
  disposeSnapshot?.(); disposeLog?.(); window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('pointermove', onWindowPointerMove, true)
  window.removeEventListener('pointerup', endWindowPointerInteraction, true)
  window.removeEventListener('pointercancel', endWindowPointerInteraction, true)
  window.removeEventListener('blur', endWindowPointerInteraction)
})
</script>

<template>
  <main ref="root" class="action-runner" tabindex="-1">
    <header class="runner-header" @pointerdown="headerPointerDown">
      <div>
        <p class="eyebrow">CODEX ENVIRONMENT</p>
        <h1>Action Runner</h1>
      </div>
      <div class="header-actions">
        <button type="button" :aria-pressed="snapshot?.pinned" :aria-label="snapshot?.pinned ? '取消窗口置顶' : '窗口置顶'" data-quick-jump-target @click="togglePinned"><Pin :size="15" aria-hidden="true" /></button>
        <button type="button" aria-label="配置 uTools 全局快捷键" data-quick-jump-target @click="send('codex.actionRunner.hotkey.configure')"><Settings :size="15" aria-hidden="true" /></button>
        <button type="button" aria-label="隐藏 Action Runner" data-quick-jump-target @click="hideRunner"><X :size="16" aria-hidden="true" /></button>
      </div>
    </header>

    <section class="runner-grid">
      <nav class="project-tree" aria-label="项目与 Action">
        <div v-if="!snapshot?.catalog.projects.length" class="empty-state">{{ snapshot?.loading ? '正在刷新 Action 目标…' : snapshot?.catalog.message || '没有可用的 Environment Action' }}</div>
        <section
          v-for="project in snapshot?.catalog.projects || []"
          :key="project.key"
          class="tree-project"
          :draggable="project.pinSource === 'local'"
          @dragstart="dragProjectKey = project.key"
          @dragover.prevent
          @drop.prevent="dropProject(project.key)"
        >
          <button type="button" class="tree-heading" :aria-expanded="!collapsedProjects.has(project.key)" :aria-label="`${collapsedProjects.has(project.key) ? '展开' : '折叠'}项目 ${project.name}`" data-quick-jump-target @click="toggleProject(project.key)">
            <ChevronRight v-if="collapsedProjects.has(project.key)" :size="14" aria-hidden="true" />
            <ChevronDown v-else :size="14" aria-hidden="true" />
            <Folder :size="14" aria-hidden="true" />
            <span>{{ project.name }}</span>
            <small v-if="project.pinSource">{{ project.pinSource === 'local' ? '本地置顶' : 'Codex 置顶' }}</small>
          </button>
          <div v-if="!collapsedProjects.has(project.key)" class="tree-children">
            <template v-if="project.environments.length === 1">
              <button v-for="action in project.environments[0].actions" :key="action.laneId" type="button" class="tree-action" :class="{ selected: selectedLaneId === action.laneId }" :aria-current="selectedLaneId === action.laneId ? 'true' : undefined" :data-quick-jump-id="action.laneId" :data-quick-jump-label="`${project.name} ${action.name}`" data-quick-jump-target @click="selectAction(action)">
                <Box :size="13" aria-hidden="true" /><span>{{ action.name }}</span><i :class="`state-${action.state}`" aria-hidden="true" />
              </button>
            </template>
            <section v-for="environment in project.environments" v-else :key="environment.id" class="tree-environment">
              <button type="button" class="environment-heading" :aria-expanded="!collapsedEnvironments.has(`${project.key}:${environment.id}`)" :aria-label="`${collapsedEnvironments.has(`${project.key}:${environment.id}`) ? '展开' : '折叠'}环境 ${environment.name}`" data-quick-jump-target @click="toggleEnvironment(`${project.key}:${environment.id}`)">
                <ChevronRight v-if="collapsedEnvironments.has(`${project.key}:${environment.id}`)" :size="13" aria-hidden="true" /><ChevronDown v-else :size="13" aria-hidden="true" /><span>{{ environment.name }}</span>
              </button>
              <div v-if="!collapsedEnvironments.has(`${project.key}:${environment.id}`)">
                <button v-for="action in environment.actions" :key="action.laneId" type="button" class="tree-action nested" :class="{ selected: selectedLaneId === action.laneId }" :aria-current="selectedLaneId === action.laneId ? 'true' : undefined" :data-quick-jump-id="action.laneId" :data-quick-jump-label="`${project.name} ${environment.name} ${action.name}`" data-quick-jump-target @click="selectAction(action)">
                  <Box :size="13" aria-hidden="true" /><span>{{ action.name }}</span><i :class="`state-${action.state}`" aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>
        </section>
      </nav>

      <article class="run-workspace">
        <div v-if="selectedAction" class="action-toolbar">
          <div>
            <p>{{ selectedAction.project.name }} <span>/</span> {{ selectedAction.environment.name }}</p>
            <h2>{{ selectedAction.action.name }}</h2>
            <p v-if="selectedActionNeedsNode" class="runtime-status" :class="{ invalid: selectedRuntime?.state !== 'ready' }">
              {{ selectedRuntime?.state === 'ready' ? selectedRuntime.label : selectedRuntime?.message || 'Node 运行时信息不可用，请重载插件' }}
            </p>
            <p v-else class="runtime-status">系统 Git · 不使用 Node</p>
          </div>
          <div class="action-buttons">
            <label v-if="selectedActionNeedsNode && selectedRuntime" class="runtime-picker">
              <span>项目 Node</span>
              <select :value="runtimeValue" aria-label="选择当前项目的 Node 运行时" data-quick-jump-target @change="updateRuntime">
                <option value="auto">自动检测</option>
                <option v-for="candidate in selectedRuntime.candidates" :key="candidate.id" :value="`manual:${candidate.id}`">{{ candidate.label }}</option>
              </select>
            </label>
            <button v-if="selectedAction.action.state === 'running' || selectedAction.action.state === 'stopping'" type="button" :disabled="selectedAction.action.state === 'stopping'" data-quick-jump-target :aria-label="`停止 ${selectedAction.action.name}`" @click="stopSelected"><Square :size="14" aria-hidden="true" />{{ selectedAction.action.state === 'stopping' ? '停止中' : '停止' }}</button>
            <button v-if="selectedAction.action.state === 'running' && selectedAction.action.risk === 'long-running'" type="button" class="primary" data-quick-jump-target :aria-label="`停止当前记录并重新执行 ${selectedAction.action.name}`" @click="runSelected(true)"><Play :size="14" aria-hidden="true" />重新执行</button>
            <button v-if="selectedAction.action.state !== 'running' && selectedAction.action.state !== 'stopping'" type="button" class="primary" :disabled="selectedActionNeedsNode && selectedRuntime?.state !== 'ready'" data-quick-jump-target :aria-label="`${selectedAction.action.state === 'confirm-required' ? '确认' : '执行'} ${selectedAction.action.name}`" @click="runSelected()"><Play :size="14" aria-hidden="true" />{{ selectedAction.action.state === 'confirm-required' ? '确认执行' : '执行' }}</button>
          </div>
        </div>

        <div class="view-tabs" role="tablist" aria-label="执行记录视图">
          <button type="button" role="tab" :aria-selected="snapshot?.view === 'records'" data-quick-jump-target @click="updateView('records')">执行记录</button>
          <button type="button" role="tab" :aria-selected="snapshot?.view === 'archived'" data-quick-jump-target @click="updateView('archived')">已归档</button>
        </div>

        <section class="run-list" aria-live="polite">
          <div v-if="!selectedAction" class="empty-state">{{ snapshot?.loading ? '正在刷新 Action 目标…' : snapshot?.catalog.message || '从左侧选择一个 Action' }}</div>
          <div v-else-if="!visibleRuns.length" class="empty-state">{{ snapshot?.view === 'archived' ? '这个 Action 暂无归档记录' : '尚未执行，点击“执行”开始' }}</div>
          <article v-for="(run, index) in visibleRuns" :key="run.runId" class="run-card" :class="{ expanded: expandedRunId === run.runId }">
            <button type="button" class="run-summary" :aria-expanded="expandedRunId === run.runId" :data-quick-jump-label="`${expandedRunId === run.runId ? '收起' : '展开'} ${run.actionName} ${formatCodexActionRunTimestamp(run.startedAt)}`" data-quick-jump-target @click="expandedRunId = expandedRunId === run.runId ? '' : run.runId">
              <ChevronDown v-if="expandedRunId === run.runId" :size="14" aria-hidden="true" /><ChevronRight v-else :size="14" aria-hidden="true" />
              <span class="run-status" :class="`status-${run.status}`">{{ run.status }}</span>
              <strong>#{{ visibleRuns.length - index }} · {{ run.actionName }}</strong>
              <span class="run-attribution">{{ run.projectName }} / {{ run.environmentName }}</span>
              <time :datetime="new Date(run.startedAt).toISOString()"><Clock3 :size="12" aria-hidden="true" />{{ formatCodexActionRunTimestamp(run.startedAt) }}</time>
            </button>
            <div v-if="expandedRunId === run.runId" class="run-detail">
              <div class="run-meta"><span>{{ run.message || run.status }}<template v-if="run.runtimeLabel"> · {{ run.runtimeLabel }}{{ run.runtimeMode === 'manual' ? '（手动）' : '' }}</template></span><span>{{ run.logLines }} 行 · {{ Math.ceil(run.logBytes / 1024) }} KB</span></div>
              <pre tabindex="0" :aria-label="`${run.actionName} 执行输出`">{{ run.logText || '（暂无输出）' }}</pre>
              <div class="run-actions">
                <button v-if="!run.archivedAt" type="button" :disabled="!codexActionRunCanArchive(run.status)" data-quick-jump-target :aria-label="`归档 ${run.actionName} 的这次执行`" @click="setArchived(run, true)"><Archive :size="13" aria-hidden="true" />归档</button>
                <button v-else type="button" data-quick-jump-target :aria-label="`恢复 ${run.actionName} 的这次执行`" @click="setArchived(run, false)"><ArchiveRestore :size="13" aria-hidden="true" />恢复</button>
              </div>
            </div>
          </article>
        </section>
      </article>
    </section>

    <footer class="runner-footer">
      <span>{{ snapshot?.message || snapshot?.catalog.message || 'F 快速跳转 · Shift+F 反向' }}</span>
      <span>{{ visibleRuns.length }} 条记录</span>
    </footer>
    <button v-for="corner in resizeCorners" :key="corner" type="button" class="resize-handle" :class="corner" :aria-label="`从${corner}调整窗口大小`" tabindex="-1" @pointerdown="resizePointerDown(corner, $event)" />
    <QuickJumpLayer v-if="quickJump.open" :targets="quickJump.targets" :active-target-id="quickJump.activeTargetId" />
  </main>
</template>
