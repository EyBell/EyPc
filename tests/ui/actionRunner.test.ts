import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
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

  it('opens F/Shift+F markers without assigning f as a marker', () => {
    expect(source).toContain("command === 'quickJump.openForward'")
    expect(source).toContain("command === 'quickJump.openBackward'")
    expect(source).toContain("executionOwnerFor(descriptor.id, 'action')")
    const targets = assignQuickJumpMarkers(Array.from({ length: 100 }, (_, index) => ({ id: String(index), label: String(index) })))
    expect(targets.every((target) => !target.marker.includes('f'))).toBe(true)
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
