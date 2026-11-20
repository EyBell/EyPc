// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import ActionApp from '../../src/ActionApp.vue'
import type { CodexActionRunnerSnapshotV1 } from '../../src/domain/codexActionRunner'
import { assignQuickJumpMarkers } from '../../src/domain/quickJump'

describe('Action Runner UI contract', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/ActionApp.vue'), 'utf8')
  const preload = readFileSync(resolve(process.cwd(), 'preload/action.js'), 'utf8')
  const hostPreload = readFileSync(resolve(process.cwd(), 'preload/index.js'), 'utf8')
  const floatPreload = readFileSync(resolve(process.cwd(), 'preload/float.js'), 'utf8')

  it('keeps the project tree and selected Action history in the independent child', () => {
    expect(source).toContain('class="project-tree"')
    expect(source).toContain('project.environments.length === 1')
    expect(source).toContain('class="run-list"')
    expect(source).toContain('expandedRunId === run.runId')
    expect(source).toContain('codexActionRunCanArchive(run.status)')
    expect(source).toContain('previousNewest !== latest.runId')
    expect(source).toContain('expandedRunId.value = latest.runId')
  })

  it('does not assign f as a Quick Jump marker', () => {
    const targets = assignQuickJumpMarkers(Array.from({ length: 100 }, (_, index) => ({ id: String(index), label: String(index) })))
    expect(targets.every((target) => !target.marker.includes('f'))).toBe(true)
  })

  it('uses synced Runner bindings, honors editor and confirmation guards, and keeps Ctrl/Cmd+W', async () => {
    const initial: CodexActionRunnerSnapshotV1 = {
      version: 1,
      catalog: { version: 1, projects: [], generatedAt: 0 },
      runs: [],
      selectedLaneId: '',
      view: 'records',
      pinned: false,
      loading: false,
      generatedAt: 0
    }
    const bridge = {
      getSnapshot: () => initial,
      onSnapshot: vi.fn((_listener: (snapshot: CodexActionRunnerSnapshotV1) => void) => () => undefined),
      onLog: vi.fn(() => () => undefined),
      requestSnapshot: vi.fn(() => true),
      hide: vi.fn(() => true)
    }
    vi.stubGlobal('eypcActionRunner', bridge)
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 20, bottom: 52, left: 20, right: 100, width: 80, height: 32, x: 20, y: 20, toJSON: () => ({})
    })
    const wrapper = mount(ActionApp, {
      attachTo: document.body,
      global: { stubs: { QuickJumpLayer: true } }
    })
    const root = wrapper.get('.action-runner')
    const layer = () => wrapper.findComponent({ name: 'QuickJumpLayer' })
    const publish = bridge.onSnapshot.mock.calls[0][0]
    try {
      await root.trigger('keydown', { key: 'f', code: 'KeyF' })
      const forward = layer().props('targets').map((target: { label: string }) => target.label)
      expect(forward.length).toBeGreaterThan(1)
      await root.trigger('keydown', { key: 'Escape' })
      await root.trigger('keydown', { key: 'F', code: 'KeyF', shiftKey: true })
      expect(layer().props('targets').map((target: { label: string }) => target.label)).toEqual([...forward].reverse())
      await root.trigger('keydown', { key: 'Escape' })

      const quickJumpBindings = [
        { actionId: 'quickJump.openForward', shortcutId: 'Alt+J', when: 'global', weight: 200 },
        { actionId: 'quickJump.openBackward', shortcutId: 'Alt+K', when: 'false', weight: 100 }
      ] as const
      publish({ ...initial, quickJumpBindings })
      await root.trigger('keydown', { key: 'f', code: 'KeyF' })
      await root.trigger('keydown', { key: 'k', code: 'KeyK', altKey: true })
      expect(layer().exists()).toBe(false)
      await root.trigger('keydown', { key: 'j', code: 'KeyJ', altKey: true })
      expect(layer().exists()).toBe(true)
      publish({ ...initial, quickJumpBindings, catalog: { ...initial.catalog, confirmLaneId: 'confirming' } })
      await root.trigger('keydown', { key: 'j', code: 'KeyJ', altKey: true })
      expect(layer().exists()).toBe(false)
      await root.trigger('keydown', { key: 'w', code: 'KeyW', metaKey: true })
      expect(bridge.hide).toHaveBeenCalledTimes(1)

      publish({ ...initial, quickJumpBindings })
      const editor = document.createElement('div')
      editor.setAttribute('contenteditable', 'plaintext-only')
      root.element.append(editor)
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', altKey: true, bubbles: true }))
      await wrapper.vm.$nextTick()
      expect(layer().exists()).toBe(false)
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', ctrlKey: true, bubbles: true }))
      expect(bridge.hide).toHaveBeenCalledTimes(2)

      publish({ ...initial, quickJumpBindings: [] })
      await root.trigger('keydown', { key: 'f', code: 'KeyF' })
      await root.trigger('keydown', { key: 'j', code: 'KeyJ', altKey: true })
      expect(layer().exists()).toBe(false)
    } finally {
      wrapper.unmount()
      rect.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('keeps child IPC constrained to snapshots, sanitized deltas and Runtime Actions', () => {
    expect(preload).toContain("snapshot: 'eypc-action-runner:snapshot'")
    expect(preload).toContain("log: 'eypc-action-runner:log'")
    expect(preload).toContain("logRequest: 'eypc-action-runner:log-request'")
    expect(preload).toContain("action: 'eypc-action-runner:action'")
    expect(preload).toContain("snapshotRequest: 'eypc-action-runner:snapshot-request'")
    expect(preload).toContain("hide: 'eypc-action-runner:hide'")
    expect(preload).not.toContain('runProjectAction')
    expect(floatPreload).not.toContain('environmentRun')
    expect(floatPreload).not.toContain('environmentSession')
  })

  it('uses explicit window controls, project runtime selection and cursor resynchronization', () => {
    expect(source).toContain('aria-label="隐藏 Action Runner"')
    expect(source).toContain('class="resize-handle"')
    expect(source).toContain('codex.actionRunner.runtime.update')
    expect(source).toContain('选择当前项目的 Node 运行时')
    expect(source).toContain('delta.cursor !== cursor + 1')
    expect(source).toContain('requestLog(run.runId, cursor)')
    expect(source).toContain('delta.reset === true')
    expect(source).toContain("snapshot?.message || snapshot?.catalog.message")
    expect(source).toContain("snapshot?.loading ? '正在刷新 Action 目标…'")
  })

  it('keeps complete logs off repeated Action snapshots and hydrates them by cursor', () => {
    const snapshotProjection = hostPreload.slice(
      hostPreload.indexOf('function pushCodexActionRunnerSnapshot'),
      hostPreload.indexOf('function codexActionRunnerDevelopmentEntry')
    )
    expect(snapshotProjection).not.toContain('logText: run.logText')
    expect(snapshotProjection).toContain("logText: ''")
    expect(hostPreload).toContain("logRequest: 'eypc-action-runner:log-request'")
    expect(hostPreload).toContain('reset: true')
  })
})
