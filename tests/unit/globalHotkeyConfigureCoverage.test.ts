import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const runtimeSource = readFileSync(resolve(root, 'src/runtime/appRuntime.ts'), 'utf8')
const codexPageSource = readFileSync(resolve(root, 'src/pages/CodexPage.vue'), 'utf8')
const pluginJson = JSON.parse(readFileSync(resolve(root, 'public/plugin.json'), 'utf8')) as {
  features: Array<{ code: string; cmds: string[] }>
}

/** `codex.actionRunner.hotkey.configure` 这类 action id。 */
function registeredConfigureActionIds(): string[] {
  return [...runtimeSource.matchAll(/actions\.register\(\{\s*id:\s*'([A-Za-z0-9.-]*hotkey\.configure)'/g)]
    .map((match) => match[1])
    .sort()
}

/** 传给 `platform.app.configureHotkey(...)` 的标签字面量。 */
function configureHotkeyLabels(): string[] {
  return [...runtimeSource.matchAll(/configureHotkey\?\.\('([^']+)'\)/g)].map((match) => match[1])
}

describe('global hotkey configure coverage', () => {
  it('points every configureHotkey label at a real plugin.json command', () => {
    const commands = new Set(pluginJson.features.flatMap((feature) => feature.cmds))
    const labels = configureHotkeyLabels()
    expect(labels.length).toBeGreaterThan(0)
    // uTools 按 cmd 文案定位全局功能。标签不在 cmds 里，「去设置」按钮就打不开任何东西。
    expect(labels.filter((label) => !commands.has(label))).toEqual([])
  })

  it('renders a dispatch entry for every registered hotkey.configure action', () => {
    const missing = registeredConfigureActionIds().filter((actionId) => {
      if (/^codex\.action\.run\.\d+\.hotkey\.configure$/.test(actionId)) {
        // 五个 Action 槽用模板字符串批量派发。
        return !codexPageSource.includes('codex.action.run.${slot}.hotkey.configure')
      }
      return !codexPageSource.includes(`'${actionId}'`)
    })
    // 注册了动作却没有任何按钮派发它，等于这条快捷键在配置页不存在。
    expect(missing).toEqual([])
  })

  it('lets every hotkey row configure its own feature instead of a neighbouring one', () => {
    const labelFor = (actionId: string) => new RegExp(
      `id: '${actionId.replace(/\./g, '\\.')}'[\\s\\S]*?configureHotkey\\?\\.\\('([^']+)'\\)`
    ).exec(runtimeSource)?.[1] || ''
    const commandsOf = (code: string) => pluginJson.features.find((feature) => feature.code === code)?.cmds || []

    // 「悬浮球开关」行以前派发的是 codex.hotkey.configure，而后者配置的是「直接展开 Codex 卡片」——
    // 行标题和它实际配置的功能错位。现在每行各自配置自己。
    expect(commandsOf('eypc-codex-toggle')).toContain(labelFor('codex.float.toggle.hotkey.configure'))
    expect(commandsOf('eypc-codex-activate')).toContain(labelFor('codex.hotkey.configure'))
    expect(commandsOf('eypc-companion-quick')).toContain(labelFor('codex.quick.hotkey.configure'))
    expect(commandsOf('eypc-companion-archive')).toContain(labelFor('codex.archive.hotkey.configure'))
    expect(commandsOf('eypc-codex-input')).toContain(labelFor('codex.input.hotkey.configure'))
    expect(commandsOf('eypc-codex-completed-unread')).toContain(labelFor('codex.completed-unread.hotkey.configure'))
    expect(commandsOf('eypc-codex-task-previous')).toContain(labelFor('codex.task.previous.hotkey.configure'))
    expect(commandsOf('eypc-codex-task-next')).toContain(labelFor('codex.task.next.hotkey.configure'))
    expect(commandsOf('eypc-codex-action-runner')).toContain(labelFor('codex.actionRunner.hotkey.configure'))
  })

  it('keeps the quick task view reachable from both the manifest and the settings page', () => {
    const quickFeature = pluginJson.features.find((feature) => feature.code === 'eypc-companion-quick')
    expect(quickFeature?.cmds).toContain('快速任务查看')
    expect(configureHotkeyLabels()).toContain('快速任务查看')
    expect(codexPageSource).toContain("'codex.quick.hotkey.configure'")
    expect(codexPageSource).toContain("'codex.quick.activate'")
  })
})
