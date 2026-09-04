import type { ShortcutCommandProfileConfig } from '../../keybinding/commandProfile'

export const CODEX_COMMAND_PROFILES = {
  'codex.float.toggle': { title: '显示/隐藏 Codex 悬浮球', group: 'Codex', layer: 'app', shortcutIds: ['Ctrl+Alt+Q'], when: 'true', weight: 1000, risk: 'data-write', description: '插件窗口激活时立即切换；系统级快捷键请在 uTools 全局功能中绑定。', profileId: 'codex' },
  'codex.float.activate': { title: '进入 Codex 卡片', group: 'Codex', layer: 'app', shortcutIds: ['Ctrl+Alt+Enter'], when: 'true', weight: 1001, description: '显示并展开悬浮卡片，直接进入会话选择和完整操作。', profileId: 'codex' },
  'codex.tab.prev': { title: '上一个 Codex 页签', group: 'Codex', layer: 'codex', shortcutIds: ['ArrowLeft'], when: "tab == 'codex' && !textInputFocused", weight: 140, risk: 'data-write', profileId: 'codex' },
  'codex.tab.next': { title: '下一个 Codex 页签', group: 'Codex', layer: 'codex', shortcutIds: ['ArrowRight'], when: "tab == 'codex' && !textInputFocused", weight: 140, risk: 'data-write', profileId: 'codex' },
  'codex.thread.createFocused': { title: '在当前项目新建会话', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Ctrl+T'], when: "tab == 'codex' && !confirmOpen && !textInputFocused", weight: 160, profileId: 'codex', description: '打开新会话编辑器；优先归属当前高亮会话或项目。' },
  'codex.list.up': { title: '会话焦点上移', group: 'Codex 会话', layer: 'codex', shortcutIds: ['ArrowUp'], when: "tab == 'codex' && (!textInputFocused || activeInputRole == 'codex-search')", weight: 130, profileId: 'codex' },
  'codex.list.down': { title: '会话焦点下移', group: 'Codex 会话', layer: 'codex', shortcutIds: ['ArrowDown'], when: "tab == 'codex' && (!textInputFocused || activeInputRole == 'codex-search')", weight: 130, profileId: 'codex' },
  'codex.selection.toggle': { title: '切换当前项选择', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Space'], when: "tab == 'codex' && !textInputFocused", weight: 130, profileId: 'codex' },
  'codex.task.openFocused': { title: '打开任务或展开项目', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Enter'], when: "tab == 'codex' && (!textInputFocused || activeInputRole == 'codex-search')", weight: 130, profileId: 'codex' },
  'codex.detail.open': { title: '查看当前项详情', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Ctrl+ArrowLeft'], when: "tab == 'codex' && !textInputFocused", weight: 130, profileId: 'codex' },
  'codex.drawer.open': { title: '打开批量与完整操作', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Ctrl+ArrowRight'], when: "tab == 'codex' && !textInputFocused", weight: 130, profileId: 'codex' },
  'codex.task.archiveFocused': { title: '归档选中或当前任务', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Delete'], when: "tab == 'codex' && !textInputFocused", weight: 140, risk: 'destructive', profileId: 'codex' },
  'codex.alias.edit': { title: '编辑当前项别名', group: 'Codex 会话', layer: 'codex', shortcutIds: ['F2'], when: "tab == 'codex' && !textInputFocused", weight: 130, risk: 'data-write', profileId: 'codex' },
  'codex.pin.toggleFocused': { title: '切换当前项 EyPc 置顶', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Ctrl+P'], when: "tab == 'codex' && !textInputFocused", weight: 130, risk: 'data-write', profileId: 'codex' },
  'codex.pin.moveUp': { title: '本地置顶项上移', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Alt+ArrowUp'], when: "tab == 'codex' && !textInputFocused", weight: 130, risk: 'data-write', profileId: 'codex' },
  'codex.pin.moveDown': { title: '本地置顶项下移', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Alt+ArrowDown'], when: "tab == 'codex' && !textInputFocused", weight: 130, risk: 'data-write', profileId: 'codex' },
  // RAW-167 supersedes the former `Ctrl+F` Quick Jump / `Ctrl+Shift+F` search split: `Ctrl+F` is
  // search in every other Tab, so owning it here made the Codex domain the single inconsistent one.
  // Quick Jump keeps `F` / `Shift+F`, which is the only form its original requirement declared.
  'codex.quickJump.openForward': { title: '快捷跳转', group: 'Codex 会话', layer: 'codex', shortcutIds: ['F'], when: "tab == 'codex' && !confirmOpen && !textInputFocused", weight: 160, profileId: 'codex' },
  // Alt 在 Codex 域统一表示「直接打开」：`Alt+数字` 开第 N 条，`Alt+F` 用标记开任意一条。
  'codex.quickJump.openTasks': { title: '快捷跳转并打开会话', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Alt+F'], when: "tab == 'codex' && !confirmOpen && !textInputFocused", weight: 161, profileId: 'codex', description: '标记只落在展示出来的会话行上，按下标记直接打开该会话，而不是只转移高亮。' },
  'codex.search.focus': { title: '聚焦会话搜索', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Ctrl+F', 'Ctrl+Shift+F'], when: "tab == 'codex' && !confirmOpen", weight: 150, profileId: 'codex' },
  'codex.layer.cancel': { title: '取消当前交互层', group: 'Codex 会话', layer: 'codex', shortcutIds: ['Escape'], when: "tab == 'codex'", weight: 150, profileId: 'codex' },
  ...Object.fromEntries(Array.from({ length: 5 }, (_, index) => {
    const slot = index + 1
    return [`codex.action.run.${slot}`, {
      title: `执行 Environment Action 槽 ${slot}`,
      group: 'Codex Actions',
      layer: 'codex',
      shortcutIds: [`Ctrl+Shift+${slot}`],
      when: "tab == 'codex' && !textInputFocused && !confirmOpen",
      weight: 125,
      risk: 'data-write' as const,
      profileId: 'codex' as const,
      description: 'EyPc 等价执行项目 Environment Action（非 Codex 顶栏原生 Action）。'
    }]
  })),
  'codex.quick.activate': { title: '快速任务查看', group: 'Codex 会话', layer: 'app', shortcutIds: ['Ctrl+Alt+K'], when: 'true', weight: 1002, description: '展开悬浮卡片的动态列表并进入筛选模式：直接打字筛选，`Ctrl+1…0` 打开对应编号任务。', profileId: 'codex' },
  // `Ctrl+数字` 在 Codex 域有两种释义，靠 when 分流而不是靠不同 chord：
  // 筛选模式下是「打开第 N 条可见任务」，其余情况下是「执行抽屉第 N 项」。
  // 抽屉打开时抽屉恒胜，两条守卫互斥，因此设置页里同一 chord 的多行语义是诚实的。
  ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1
    return [`codex.quick.open.${slot}`, {
      title: `打开快速任务第 ${slot} 项`,
      group: 'Codex 会话',
      layer: 'codex',
      shortcutIds: [slot === 10 ? 'Ctrl+0' : `Ctrl+${slot}`],
      when: "tab == 'codex' && codexQuickMode && !codexDrawerActive && !confirmOpen && (!textInputFocused || activeInputRole == 'codex-search')",
      weight: 200 - index,
      profileId: 'codex' as const
    }]
  })),
  // `Alt+数字` 是编号行的常驻打开路径：只要展开卡片的任务列表在，就不需要先进筛选模式。
  // 它和 `Ctrl+数字` 指向同一个动作语义，但守卫更宽，所以两者分成两条独立命令而不是共用一条。
  ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1
    return [`codex.task.openIndex.${slot}`, {
      title: `打开列表第 ${slot} 项任务`,
      group: 'Codex 会话',
      layer: 'codex',
      shortcutIds: [slot === 10 ? 'Alt+0' : `Alt+${slot}`],
      when: "tab == 'codex' && !codexDrawerActive && !confirmOpen && (!textInputFocused || activeInputRole == 'codex-search')",
      weight: 190 - index,
      profileId: 'codex' as const
    }]
  })),
  ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`codex.drawer.select.${index + 1}`, { title: `执行操作抽屉第 ${index + 1} 项`, group: 'Codex 会话', layer: 'codex', shortcutIds: [`Ctrl+${index + 1}`], when: "tab == 'codex' && codexDrawerActive && !textInputFocused", weight: 120 - index, profileId: 'codex' as const }]))
} as const satisfies Record<string, ShortcutCommandProfileConfig>
