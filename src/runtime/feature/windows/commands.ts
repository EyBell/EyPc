import type { ShortcutCommandProfileConfig } from '../../keybinding/commandProfile'

export const WINDOWS_COMMAND_PROFILES = {
  'windows.refresh': { title: '刷新窗口列表', group: '窗口跳转', layer: 'windows', shortcutIds: ['Ctrl+R'], when: "tab == 'windows' && !windowEditorOpen", weight: 150, profileId: 'windows' },
  'windows.search.focus': { title: '聚焦窗口搜索', group: '窗口跳转', layer: 'windows', shortcutIds: ['Ctrl+F'], when: "tab == 'windows' && !confirmOpen && !windowEditorOpen", weight: 151, profileId: 'windows' },
  'windows.list.up': { title: '窗口列表上移', group: '窗口跳转', layer: 'windows', shortcutIds: ['ArrowUp', 'Ctrl+K'], when: "tab == 'windows' && !windowEditorOpen && (!textInputFocused || activeInputRole == 'window-search')", weight: 220, profileId: 'windows' },
  'windows.list.down': { title: '窗口列表下移', group: '窗口跳转', layer: 'windows', shortcutIds: ['ArrowDown', 'Ctrl+J'], when: "tab == 'windows' && !windowEditorOpen && (!textInputFocused || activeInputRole == 'window-search')", weight: 220, profileId: 'windows' },
  'windows.list.pageUp': { title: '窗口列表上翻页', group: '窗口跳转', layer: 'windows', shortcutIds: ['Alt+U'], when: "tab == 'windows' && !windowEditorOpen && !textInputFocused", weight: 220, profileId: 'windows' },
  'windows.list.pageDown': { title: '窗口列表下翻页', group: '窗口跳转', layer: 'windows', shortcutIds: ['Alt+E'], when: "tab == 'windows' && !windowEditorOpen && !textInputFocused", weight: 220, profileId: 'windows' },
  'windows.activate': { title: '激活主窗口或指定子窗口', group: '窗口跳转', layer: 'windows', shortcutIds: ['Enter'], when: "tab == 'windows' && !windowEditorOpen && !windowActionsOpen && (!textInputFocused || activeInputRole == 'window-search')", weight: 150, profileId: 'windows' },
  'windows.tree.expand': { title: '展开主窗口或进入首个子节点', group: '窗口跳转', layer: 'windows', shortcutIds: ['ArrowRight'], when: "tab == 'windows' && !windowEditorOpen && !windowActionsOpen && (!textInputFocused || activeInputRole == 'window-search')", weight: 152, profileId: 'windows' },
  'windows.tree.collapse': { title: '返回父节点或收起主窗口', group: '窗口跳转', layer: 'windows', shortcutIds: ['ArrowLeft'], when: "tab == 'windows' && !windowEditorOpen && !windowActionsOpen && (!textInputFocused || activeInputRole == 'window-search')", weight: 152, profileId: 'windows' },
  'windows.actions.open': { title: '打开窗口操作面板', group: '窗口跳转', layer: 'windows', shortcutIds: ['Ctrl+ArrowRight'], when: "tab == 'windows' && !windowEditorOpen && (!textInputFocused || activeInputRole == 'window-search')", weight: 150, profileId: 'windows' },
  'windows.actions.close': { title: '返回窗口列表', group: '窗口跳转', layer: 'window-actions', shortcutIds: ['ArrowLeft', 'Ctrl+ArrowLeft', 'Escape'], when: "tab == 'windows' && windowActionsOpen", weight: 430, profileId: 'windows' },
  'windows.layer.toggle': { title: '切换窗口列表与操作层', group: '窗口跳转', layer: 'windows', shortcutIds: ['Tab'], when: "tab == 'windows' && !windowEditorOpen && (!textInputFocused || activeInputRole == 'window-search')", weight: 145, profileId: 'windows' },
  'windows.layer.togglePrev': { title: '反向切换窗口列表与操作层', group: '窗口跳转', layer: 'windows', shortcutIds: ['Shift+Tab'], when: "tab == 'windows' && !windowEditorOpen && (!textInputFocused || activeInputRole == 'window-search')", weight: 145, profileId: 'windows' },
  'windows.favorite.toggle': { title: '收藏或取消收藏窗口', group: '窗口跳转', layer: 'windows', shortcutIds: [], when: "tab == 'windows' && !windowEditorOpen && !textInputFocused", weight: 150, risk: 'data-write', profileId: 'windows' },
  'windows.pin.toggle': { title: '置顶或取消置顶窗口', group: '窗口跳转', layer: 'windows', shortcutIds: [], when: "tab == 'windows' && !windowEditorOpen && !textInputFocused", weight: 150, risk: 'data-write', profileId: 'windows' },
  'windows.close': { title: '关闭窗口', group: '窗口跳转', layer: 'windows', shortcutIds: ['Ctrl+Delete', 'Ctrl+Backspace'], when: "tab == 'windows' && !windowEditorOpen && (!textInputFocused || activeInputRole == 'window-search')", weight: 160, risk: 'data-write', profileId: 'windows' },
  'windows.close.force': { title: '强制关闭窗口', group: '窗口跳转', layer: 'windows', shortcutIds: [], when: "tab == 'windows' && !windowEditorOpen", weight: 159, risk: 'destructive', profileId: 'windows' },
  'windows.rename': { title: '编辑窗口别名', group: '窗口跳转', layer: 'windows', shortcutIds: ['Shift+F2'], when: "tab == 'windows' && !windowEditorOpen && !textInputFocused", weight: 150, risk: 'data-write', profileId: 'windows' },
  'windows.edit': { title: '编辑窗口目标', group: '窗口跳转', layer: 'windows', shortcutIds: ['F2'], when: "tab == 'windows' && !windowEditorOpen && !textInputFocused", weight: 150, risk: 'data-write', profileId: 'windows' },
  'windows.editor.save': { title: '保存窗口目标', group: '窗口跳转', layer: 'window-editor', shortcutIds: ['Ctrl+S', 'Enter'], when: "tab == 'windows' && activeInputRole == 'window-editor'", weight: 460, risk: 'data-write', profileId: 'windows' },
  'windows.editor.cancel': { title: '取消窗口编辑', group: '窗口跳转', layer: 'window-editor', shortcutIds: ['Escape'], when: "tab == 'windows' && activeInputRole == 'window-editor'", weight: 460, profileId: 'windows' },
  'windows.editor.nextField': { title: '窗口编辑下一个字段', group: '窗口跳转', layer: 'window-editor', shortcutIds: ['Tab'], when: "tab == 'windows' && activeInputRole == 'window-editor'", weight: 460, profileId: 'windows' },
  'windows.editor.prevField': { title: '窗口编辑上一个字段', group: '窗口跳转', layer: 'window-editor', shortcutIds: ['Shift+Tab'], when: "tab == 'windows' && activeInputRole == 'window-editor'", weight: 460, profileId: 'windows' },
  'windows.candidates.clear': { title: '退出窗口候选筛选', group: '窗口跳转', layer: 'windows', shortcutIds: ['Escape'], when: "tab == 'windows' && !windowEditorOpen && !windowActionsOpen", weight: 145, profileId: 'windows' },
  ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1
    const chord = slot === 10 ? 'Ctrl+0' : `Ctrl+${slot}`
    return [`windows.slot.assign.${slot}`, {
      title: `分配窗口到槽 ${slot}`,
      group: '窗口跳转',
      layer: 'windows',
      shortcutIds: [chord],
      when: "tab == 'windows' && !windowEditorOpen && (!textInputFocused || activeInputRole == 'window-search')",
      weight: 158,
      risk: 'data-write' as const,
      profileId: 'windows' as const
    }]
  }))
} as const satisfies Record<string, ShortcutCommandProfileConfig>
