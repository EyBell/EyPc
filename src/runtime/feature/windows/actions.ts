import type { FeatureActionHostV7 } from '../featureActionHost'

export function registerWindowsActions(host: FeatureActionHostV7): void {
  const { register, activateWindowRow, activateWindowSlot, activationAttemptFor, assignWindowSlot, beginWindowDraft, cancelWindowDraft, clearWindowActivationDiagnostics, clearWindowCandidates, clearWindowOperationTraces, clearWindowSelection, clearWindowSlot, closeWindowActions, closeWindowRows, configureWindowSlotHotkey, copyWindowHandle, favoriteWindowRows, finishWindowActivation, focusWindowSlot, moveWindowDraftField, navigateFocusedWindowTree, notify, openWindowActions, openWindowSlotActions, refreshWindows, saveWindowDraft, setWindowAlwaysOnTop, setWindowGroupExpanded, toggleWindowFavorite, toggleWindowPins, whenWindowInteraction } = host
    register({ id: 'windows.refresh', title: '刷新窗口列表', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+R', when: (ctx) => whenWindowInteraction(ctx, 'always'), run: () => { void refreshWindows({ clearSearch: true }); return true } })
    register({ id: 'windows.search.focus', title: '聚焦窗口搜索', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+F', when: (ctx) => whenWindowInteraction(ctx, 'browse'), run: () => { host.searchFocusTarget = 'windows'; host.searchFocusRequestId += 1; notify(); return true } })
    register({ id: 'windows.activate', title: '展开并前置当前窗口', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 98, shortcut: 'Enter', when: (ctx) => whenWindowInteraction(ctx, 'always', { outsideEditor: true }), run: (_ctx, args) => {
      void activateWindowRow(typeof args?.rowId === 'string' ? args.rowId : undefined).catch(() => {
        finishWindowActivation(activationAttemptFor('manual'), 'activate', 'activation-failed', 'blocking')
      })
      return true
    } })
    register({ id: 'windows.actions.open', title: '打开窗口操作面板', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 98, shortcut: 'Ctrl+ArrowRight', when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }), run: (_ctx, args) => openWindowActions(typeof args?.rowId === 'string' ? args.rowId : undefined) })
    register({ id: 'windows.actions.close', title: '返回窗口列表', group: '窗口跳转', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => whenWindowInteraction(ctx, 'always') && ctx.layerIds.includes('window-actions'), run: () => closeWindowActions() })
    register({ id: 'windows.tree.expand', title: '展开主窗口或进入首个子节点', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'ArrowRight', when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }) && !ctx.layerIds.includes('window-actions'), run: () => navigateFocusedWindowTree('expand') })
    register({ id: 'windows.tree.collapse', title: '返回父节点或收起主窗口', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'ArrowLeft', when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }) && !ctx.layerIds.includes('window-actions'), run: () => navigateFocusedWindowTree('collapse') })
    register({ id: 'windows.tree.toggle', title: '切换窗口树节点展开状态', group: '窗口跳转', risk: 'normal', scope: 'row', priority: 99, when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }), run: (_ctx, args) => setWindowGroupExpanded(typeof args?.rowId === 'string' ? args.rowId : undefined, typeof args?.expanded === 'boolean' ? args.expanded : undefined) })
    register({ id: 'windows.layer.toggle', title: '切换窗口列表与操作层', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 97, shortcut: 'Tab', when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }), run: () => host.windowActionsOpen ? closeWindowActions() : openWindowActions() })
    register({ id: 'windows.layer.togglePrev', title: '反向切换窗口列表与操作层', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 97, shortcut: 'Shift+Tab', when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }), run: () => host.windowActionsOpen ? closeWindowActions() : openWindowActions() })
    register({ id: 'windows.favorite.toggle', title: '收藏或取消收藏窗口', group: '窗口跳转', risk: 'data-write', scope: 'tab', priority: 96, when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }), run: (_ctx, args) => {
      if (typeof args?.rowId === 'string' || host.windowActionsMode === 'single' || host.selectedWindowIds.length <= 1) {
        return toggleWindowFavorite(typeof args?.rowId === 'string' ? args.rowId : undefined)
      }
      return favoriteWindowRows()
    } })
    register({ id: 'windows.alwaysOnTop', title: '页面置顶', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 97, when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }), run: (_ctx, args) => {
      void setWindowAlwaysOnTop(typeof args?.rowId === 'string' ? args.rowId : undefined).catch(() => {
        finishWindowActivation(activationAttemptFor('manual', null, 'always-on-top'), 'topmost', 'topmost-failed', 'blocking')
      })
      return true
    } })
    register({ id: 'windows.pin.toggle', title: '切换窗口列表置顶', group: '窗口跳转', risk: 'data-write', scope: 'tab', priority: 96, when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }), run: (_ctx, args) => toggleWindowPins(typeof args?.rowId === 'string' ? args.rowId : undefined) })
    register({ id: 'windows.close', title: '关闭窗口', group: '窗口跳转', risk: 'data-write', scope: 'tab', priority: 97, shortcut: 'Ctrl+Delete', when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }), run: (_ctx, args) => { void closeWindowRows(typeof args?.rowId === 'string' ? args.rowId : undefined, false); return true } })
    register({ id: 'windows.close.force', title: '强制关闭窗口', group: '窗口跳转', risk: 'destructive', scope: 'tab', priority: 97, when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }), run: (_ctx, args) => { void closeWindowRows(typeof args?.rowId === 'string' ? args.rowId : undefined, true); return true } })
    register({ id: 'windows.selection.clear', title: '清空窗口多选', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 95, when: (ctx) => whenWindowInteraction(ctx, 'browse'), run: () => clearWindowSelection() })
    register({ id: 'windows.rename', title: '编辑窗口别名', group: '窗口跳转', risk: 'data-write', scope: 'tab', priority: 96, shortcut: 'Shift+F2', when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }), run: (_ctx, args) => beginWindowDraft('rename', typeof args?.rowId === 'string' ? args.rowId : undefined) })
    register({ id: 'windows.edit', title: '编辑窗口目标', group: '窗口跳转', risk: 'data-write', scope: 'tab', priority: 96, shortcut: 'F2', when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }), run: (_ctx, args) => beginWindowDraft('edit', typeof args?.rowId === 'string' ? args.rowId : undefined) })
    register({ id: 'windows.editor.save', title: '保存窗口目标', group: '窗口跳转', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => whenWindowInteraction(ctx, 'always') && ctx.layerIds.includes('window-editor'), run: () => saveWindowDraft() })
    register({ id: 'windows.editor.cancel', title: '取消窗口编辑', group: '窗口跳转', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Escape', when: (ctx) => whenWindowInteraction(ctx, 'always') && ctx.layerIds.includes('window-editor'), run: () => cancelWindowDraft() })
    register({ id: 'windows.editor.nextField', title: '窗口编辑下一个字段', group: '窗口跳转', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => whenWindowInteraction(ctx, 'always') && ctx.layerIds.includes('window-editor'), run: () => moveWindowDraftField(1) })
    register({ id: 'windows.editor.prevField', title: '窗口编辑上一个字段', group: '窗口跳转', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => whenWindowInteraction(ctx, 'always') && ctx.layerIds.includes('window-editor'), run: () => moveWindowDraftField(-1) })
    register({ id: 'windows.slot.activate', title: '跳转窗口槽位', group: '窗口跳转', risk: 'normal', scope: 'global', priority: 101, when: () => true, run: (_ctx, args) => {
      const slot = Math.trunc(Number(args?.slot))
      if (slot < 1 || slot > 10) return false
      void activateWindowSlot(slot).catch(() => {
        finishWindowActivation(activationAttemptFor('slot', slot), 'activate', 'activation-failed', 'blocking')
      })
      return true
    } })
    register({ id: 'windows.activation.diagnostics.clear', title: '清空本次窗口激活诊断', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 94, when: (ctx) => whenWindowInteraction(ctx, 'browse'), run: () => clearWindowActivationDiagnostics() })
    register({ id: 'windows.operation.traces.clear', title: '清空开发窗口操作追踪', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 94, when: (ctx) => whenWindowInteraction(ctx, 'browse') && host.windowOperationTraceEnabled, run: () => clearWindowOperationTraces() })
    register({ id: 'windows.slot.assign', title: '分配窗口槽位', group: '窗口跳转', risk: 'data-write', scope: 'row', priority: 96, when: (ctx) => whenWindowInteraction(ctx, 'browse'), run: (_ctx, args) => assignWindowSlot(Math.trunc(Number(args?.slot)), typeof args?.rowId === 'string' ? args.rowId : undefined) })
    for (let slot = 1; slot <= 10; slot += 1) {
      register({
        id: `windows.slot.assign.${slot}`,
        title: `分配窗口到槽 ${slot}`,
        group: '窗口跳转',
        risk: 'data-write',
        scope: 'row',
        priority: 95,
        shortcut: slot === 10 ? 'Ctrl+0' : `Ctrl+${slot}`,
        when: (ctx) => whenWindowInteraction(ctx, 'browse', { outsideEditor: true }),
        run: () => assignWindowSlot(slot)
      })
    }
    register({ id: 'windows.slot.clear', title: '清除窗口槽关联', group: '窗口跳转', risk: 'data-write', scope: 'row', priority: 96, when: (ctx) => whenWindowInteraction(ctx, 'browse'), run: (_ctx, args) => clearWindowSlot(Math.trunc(Number(args?.slot))) })
    register({ id: 'windows.slot.focus', title: '聚焦窗口槽目标', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 96, when: (ctx) => whenWindowInteraction(ctx, 'browse'), run: (_ctx, args) => focusWindowSlot(Math.trunc(Number(args?.slot))) })
    register({ id: 'windows.slot.actions.open', title: '打开窗口槽操作面板', group: '窗口跳转', risk: 'normal', scope: 'row', priority: 97, when: (ctx) => whenWindowInteraction(ctx, 'browse'), run: (_ctx, args) => openWindowSlotActions(Math.trunc(Number(args?.slot))) })
    register({ id: 'windows.slot.configure', title: '配置窗口槽全局快捷键', group: '窗口跳转', risk: 'normal', scope: 'row', priority: 96, when: (ctx) => whenWindowInteraction(ctx, 'browse'), run: (_ctx, args) => configureWindowSlotHotkey(Math.trunc(Number(args?.slot))) })
    register({ id: 'windows.hwnd.copy', title: '复制 Windows HWND', group: '窗口跳转', risk: 'normal', scope: 'row', priority: 96, when: (ctx) => whenWindowInteraction(ctx, 'browse'), run: (_ctx, args) => { void copyWindowHandle(typeof args?.rowId === 'string' ? args.rowId : undefined); return true } })
    register({ id: 'windows.permission.settings', title: '打开 macOS 辅助功能设置', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 96, when: (ctx) => whenWindowInteraction(ctx, 'always'), run: () => { void host.platform.windows.openPermissionSettings?.(); return true } })
    register({ id: 'windows.candidates.clear', title: '退出窗口候选筛选', group: '窗口跳转', risk: 'normal', scope: 'tab', priority: 96, when: (ctx) => whenWindowInteraction(ctx, 'rebind'), run: () => clearWindowCandidates() })
}
