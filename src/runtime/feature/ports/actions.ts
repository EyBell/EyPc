import type { FeatureActionHostV7 } from '../featureActionHost'

export function registerPortsActions(host: FeatureActionHostV7): void {
  const { register, applyFocusedGroup, blurSearchFocus, clearPortSelection, closePortDetail, closePortDrawer, closePortGroupDetail, confirmKill, confirmKillGroup, createGroupFromSelection, createPortGroupFolder, currentPortGroupSelection, deleteFocusedGroup, executePortDrawerItem, focusFocusedGroupMatches, focusPortGroupSearch, focusPortPane, focusPortSearch, folderFromTarget, groupFromTarget, killPortTargets, killPorts, movePortDrawer, movePortGroupDraftField, notify, openFolderRenameDraft, openGroupDraft, openPortDetail, openPortDrawer, openPortGroupDetail, resetPortWorkspace, savePortGroupDraft, scanPorts, targetFromArgs, toggleFocusedGroupFolder, toggleGroupPanel, togglePortPane } = host
    register({ id: 'ports.scan', title: '刷新端口', group: '端口', risk: 'normal', scope: 'tab', priority: 100, shortcut: 'Ctrl+R', when: (ctx) => ctx.tab === 'ports', run: () => { void scanPorts(); return true } })
    register({ id: 'ports.groups.togglePanel', title: '展开/收起端口组栏', group: '端口', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+Shift+W', when: (ctx) => ctx.tab === 'ports', run: () => toggleGroupPanel() })
    register({ id: 'ports.search.focus', title: '聚焦端口搜索', group: '端口', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+F', when: (ctx) => ctx.tab === 'ports', run: () => focusPortSearch() })
    register({ id: 'ports.groupSearch.focus', title: '聚焦端口组搜索', group: '端口', risk: 'normal', scope: 'tab', priority: 99, shortcut: 'Ctrl+Shift+F', when: (ctx) => ctx.tab === 'ports', run: () => focusPortGroupSearch() })
    register({ id: 'ports.search.blur', title: '退出端口搜索焦点', group: '端口', risk: 'normal', scope: 'layer', priority: 99, shortcut: 'Escape', when: (ctx) => ctx.tab === 'ports', run: () => blurSearchFocus() })
    register({ id: 'ports.kill.confirm', title: '终止选中进程', group: '端口', risk: 'data-write', scope: 'tab', priority: 100, shortcut: 'Delete', when: (ctx) => ctx.tab === 'ports', run: () => { confirmKill(); return true } })
    register({ id: 'ports.kill.force', title: '强杀选中进程', group: '端口', risk: 'destructive', scope: 'tab', priority: 100, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.tab === 'ports', run: () => { void killPorts(true); return true } })
    register({ id: 'ports.killGroup.confirm', title: '终止端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { confirmKillGroup(targetFromArgs(args)); return true } })
    register({ id: 'ports.killGroup.force', title: '强杀端口组', group: '端口', risk: 'destructive', scope: 'tab', priority: 90, when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { void killPortTargets(currentPortGroupSelection(targetFromArgs(args)), true, '组内端口当前无监听进程'); return true } })
    register({ id: 'ports.pane.toggleNext', title: '切换端口栏', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Tab', when: (ctx) => ctx.tab === 'ports', run: () => togglePortPane() })
    register({ id: 'ports.pane.togglePrev', title: '反向切换端口栏', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Shift+Tab', when: (ctx) => ctx.tab === 'ports', run: () => togglePortPane() })
    register({ id: 'ports.pane.groups', title: '聚焦端口组栏', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Alt+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: () => { focusPortPane('groups'); notify(); return true } })
    register({ id: 'ports.pane.results', title: '聚焦端口结果栏', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Alt+ArrowRight', when: (ctx) => ctx.tab === 'ports', run: () => { focusPortPane('results'); notify(); return true } })
    register({ id: 'ports.group.apply', title: '应用端口组过滤', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => applyFocusedGroup(targetFromArgs(args)) })
    register({ id: 'ports.group.focusMatches', title: '聚焦组内端口', group: '端口', risk: 'normal', scope: 'tab', priority: 95, shortcut: 'Ctrl+Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => focusFocusedGroupMatches(targetFromArgs(args)) })
    register({ id: 'ports.group.kill.confirm', title: '终止当前端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 94, shortcut: 'Shift+Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { confirmKillGroup(targetFromArgs(args)); return true } })
    register({ id: 'ports.group.kill.force', title: '强杀当前端口组', group: '端口', risk: 'destructive', scope: 'tab', priority: 94, shortcut: 'Ctrl+Shift+Enter', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => { void killPortTargets(currentPortGroupSelection(targetFromArgs(args)), true, '组内端口当前无监听进程'); return true } })
    register({ id: 'ports.group.createFromSelection', title: '选中端口收藏为组', group: '端口', risk: 'data-write', scope: 'tab', priority: 93, shortcut: 'Ctrl+G', when: (ctx) => ctx.tab === 'ports', run: () => createGroupFromSelection() })
    register({ id: 'ports.group.create', title: '新建端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, when: (ctx) => ctx.tab === 'ports', run: () => { openGroupDraft(null); return true } })
    register({ id: 'ports.groupFolder.create', title: '新增分组夹', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'Ctrl+T', when: (ctx) => ctx.tab === 'ports', run: () => createPortGroupFolder() })
    register({ id: 'ports.group.rename', title: '重命名端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'Shift+F2', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => {
      const target = targetFromArgs(args)
      const folder = folderFromTarget(target)
      if (folder) {
        openFolderRenameDraft(folder)
        return true
      }
      const group = groupFromTarget(target)
      if (!group) return false
      openGroupDraft(group, 'rename')
      return true
    } })
    register({ id: 'ports.group.moveFolder', title: '变更端口组分组夹', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'Ctrl+F2', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => {
      const group = groupFromTarget(targetFromArgs(args))
      if (!group) return false
      openGroupDraft(group, 'move-folder')
      return true
    } })
    register({ id: 'ports.group.edit', title: '编辑端口组', group: '端口', risk: 'data-write', scope: 'tab', priority: 92, shortcut: 'F2', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => {
      const target = targetFromArgs(args)
      const folder = folderFromTarget(target)
      if (folder) {
        openFolderRenameDraft(folder)
        return true
      }
      const group = groupFromTarget(target)
      if (!group) return false
      openGroupDraft(group, 'edit')
      return true
    } })
    register({ id: 'ports.group.save', title: '保存端口组编辑', group: '端口', risk: 'data-write', scope: 'layer', priority: 100, shortcut: 'Ctrl+S', when: (ctx) => ctx.layerIds.includes('port-group-editor'), run: () => savePortGroupDraft(host.portGroupDraft || { name: '', entriesText: '', color: '#00A676', folderId: null }) })
    register({ id: 'ports.group.edit.nextField', title: '编辑层下一个字段', group: '端口', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Tab', when: (ctx) => ctx.layerIds.includes('port-group-editor'), run: () => movePortGroupDraftField(1) })
    register({ id: 'ports.group.edit.prevField', title: '编辑层上一个字段', group: '端口', risk: 'normal', scope: 'layer', priority: 100, shortcut: 'Shift+Tab', when: (ctx) => ctx.layerIds.includes('port-group-editor'), run: () => movePortGroupDraftField(-1) })
    register({ id: 'ports.group.delete', title: '删除端口组/夹', group: '端口', risk: 'data-write', scope: 'tab', priority: 91, shortcut: 'Delete', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => deleteFocusedGroup(false, targetFromArgs(args)) })
    register({ id: 'ports.group.delete.force', title: '强制删除端口组/夹', group: '端口', risk: 'destructive', scope: 'tab', priority: 91, shortcut: 'Ctrl+Delete', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => deleteFocusedGroup(true, targetFromArgs(args)) })
    register({ id: 'ports.groupTarget.toggle', title: '折叠/展开端口组夹', description: '折叠或展开当前高亮分组夹。', icon: 'toggle', group: '端口', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'ports', run: () => toggleFocusedGroupFolder() })
    register({ id: 'ports.groupTarget.collapse', title: '折叠端口组夹', description: '折叠当前高亮分组夹。', icon: 'left', group: '端口', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'ports', run: () => toggleFocusedGroupFolder(false) })
    register({ id: 'ports.groupTarget.expand', title: '展开端口组夹', description: '展开当前高亮分组夹。', icon: 'right', group: '端口', risk: 'normal', scope: 'tab', priority: 91, when: (ctx) => ctx.tab === 'ports', run: () => toggleFocusedGroupFolder(true) })
    register({ id: 'ports.groupDetail.open', title: '打开端口组详情抽屉', description: '展示当前分组或分组夹的规则和快捷操作。', icon: 'detail', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => openPortGroupDetail(args) })
    register({ id: 'ports.groupDetail.close', title: '关闭端口组详情抽屉', description: '关闭左侧端口组详情抽屉。', icon: 'close', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => closePortGroupDetail() })
    register({ id: 'ports.drawer.open', title: '打开端口动作抽屉', description: '展示当前端口、选中端口或端口组的可执行动作。', icon: 'drawer', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowRight', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => openPortDrawer(args) })
    register({ id: 'ports.drawer.close', title: '关闭端口动作抽屉', description: '关闭右侧动作抽屉。', icon: 'close', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => closePortDrawer() })
    register({ id: 'ports.detail.open', title: '打开端口详情抽屉', description: '展示当前高亮进程的端口、PID、命令和快捷操作。', icon: 'detail', group: '端口', risk: 'normal', scope: 'tab', priority: 96, shortcut: 'Ctrl+ArrowLeft', when: (ctx) => ctx.tab === 'ports', run: (_ctx, args) => openPortDetail(args) })
    register({ id: 'ports.detail.close', title: '关闭端口详情抽屉', description: '关闭左侧进程详情抽屉。', icon: 'close', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => closePortDetail() })
    register({ id: 'ports.drawer.next', title: '抽屉内下移', description: '移动到下一个抽屉动作。', icon: 'down', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => movePortDrawer(1) })
    register({ id: 'ports.drawer.prev', title: '抽屉内上移', description: '移动到上一个抽屉动作。', icon: 'up', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => movePortDrawer(-1) })
    register({ id: 'ports.drawer.select', title: '执行抽屉当前动作', description: '执行右侧抽屉中当前高亮的动作。', icon: 'enter', group: '端口', risk: 'normal', scope: 'layer', priority: 96, when: (ctx) => ctx.tab === 'ports', run: () => executePortDrawerItem() })
    register({ id: 'ports.selection.clear', title: '清空端口多选', description: '清空当前端口多选并关闭多选抽屉。', icon: 'clear', group: '端口', risk: 'normal', scope: 'tab', priority: 95, when: (ctx) => ctx.tab === 'ports', run: () => clearPortSelection() })
    for (let index = 1; index <= 9; index += 1) {
      register({
        id: `ports.drawer.select.${index}`,
        title: `执行抽屉第 ${index} 个动作`,
        description: '执行右侧抽屉中的指定序号动作。',
        icon: 'number',
        group: '端口',
        risk: 'normal',
        scope: 'layer',
        priority: 90 - index,
        shortcut: `Ctrl+${index}`,
        when: (ctx) => ctx.tab === 'ports',
        run: () => executePortDrawerItem(index - 1)
      })
      register({
        id: `ports.drawer.action.${index}`,
        title: `直接执行第 ${index} 个端口动作`,
        description: '不打开抽屉，直接执行当前端口上下文的指定动作。',
        icon: 'number',
        group: '端口',
        risk: 'normal',
        scope: 'tab',
        priority: 80 - index,
        shortcut: `Ctrl+Alt+${index}`,
        when: (ctx) => ctx.tab === 'ports',
        run: () => executePortDrawerItem(index - 1, true)
      })
    }
    register({ id: 'ports.workspace.reset', title: '重置端口工作区', group: '端口', risk: 'normal', scope: 'tab', priority: 90, shortcut: 'Escape', when: (ctx) => ctx.tab === 'ports', run: () => { resetPortWorkspace(); return true } })
}
