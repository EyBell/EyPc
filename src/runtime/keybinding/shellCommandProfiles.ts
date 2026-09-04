import type { ShortcutCommandProfileConfig } from './commandProfile'

export const SHELL_COMMAND_PROFILES = {
  'app.hide': { title: '隐藏插件窗口', group: '全局', layer: 'app', shortcutIds: ['Shift+Escape'], when: 'true', weight: 1000 },
  'action.runner.hide': { title: '隐藏 Action Runner', group: 'Codex Actions', layer: 'app', shortcutIds: ['Ctrl+W'], when: 'true', weight: 1003, internal: true, executionOwner: 'action-local' },
  'confirm.cancel': { title: '关闭确认弹窗', group: '全局', layer: 'confirm', shortcutIds: ['Escape'], when: 'confirmOpen', weight: 400 },
  'confirm.accept': { title: '确认当前弹窗', group: '全局', layer: 'confirm', shortcutIds: ['Enter'], when: 'confirmOpen', weight: 400, risk: 'data-write' },
  'tab.next': { title: '下一个主 Tab', group: '全局', layer: 'global', shortcutIds: ['Tab'], when: "tab != 'ports' && !textInputFocused", weight: 100 },
  'tab.prev': { title: '上一个主 Tab', group: '全局', layer: 'global', shortcutIds: ['Shift+Tab'], when: "tab != 'ports' && !textInputFocused", weight: 100 },
  'search.focus': { title: '聚焦搜索', group: '全局', layer: 'global', shortcutIds: ['Ctrl+F'], when: '!confirmOpen', weight: 100 },
  'settings.open': { title: '打开设置', group: '全局', layer: 'global', shortcutIds: ['Ctrl+Alt+S'], when: '!confirmOpen', weight: 100 },
  'quickJump.openForward': { title: '快捷跳转', group: '全局', layer: 'global', shortcutIds: ['F'], when: '!confirmOpen && !textInputFocused', weight: 120 },
  'quickJump.openBackward': { title: '反向快捷跳转', group: '全局', layer: 'global', shortcutIds: ['Shift+F'], when: '!confirmOpen && !textInputFocused', weight: 120 },
  'list.up': { title: '列表上移', group: '全局', layer: 'global', shortcutIds: ['ArrowUp', 'Ctrl+K'], when: '!mqttPreviewOpen && !windowEditorOpen && (!windowActionsOpen || tab == "windows") && (!textInputFocused || activeInputRole == "port-search" || activeInputRole == "port-group-search" || activeInputRole == "mqtt-search" || activeInputRole == "favorite-search" || activeInputRole == "favorite-group-search" || activeInputRole == "window-search")', weight: 100 },
  'list.down': { title: '列表下移', group: '全局', layer: 'global', shortcutIds: ['ArrowDown', 'Ctrl+J'], when: '!mqttPreviewOpen && !windowEditorOpen && (!windowActionsOpen || tab == "windows") && (!textInputFocused || activeInputRole == "port-search" || activeInputRole == "port-group-search" || activeInputRole == "mqtt-search" || activeInputRole == "favorite-search" || activeInputRole == "favorite-group-search" || activeInputRole == "window-search")', weight: 100 },
  'list.pageUp': { title: '列表上翻页', group: '全局', layer: 'global', shortcutIds: ['Alt+U'], when: '!textInputFocused && !windowEditorOpen && (!windowActionsOpen || tab == "windows")', weight: 100 },
  'list.pageDown': { title: '列表下翻页', group: '全局', layer: 'global', shortcutIds: ['Alt+E'], when: '!textInputFocused && !windowEditorOpen && (!windowActionsOpen || tab == "windows")', weight: 100 },
  'list.toggleSelection': { title: '切换选择', group: '全局', layer: 'global', shortcutIds: ['Space'], when: '(!textInputFocused || activeInputRole == "port-search" || activeInputRole == "window-search") && !windowEditorOpen', weight: 100 }
} as const satisfies Record<string, ShortcutCommandProfileConfig>
