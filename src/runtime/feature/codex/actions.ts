import { CODEX_MANUAL_PHASE_VALUES, type CodexFloatPosition, type CodexManualPhaseValue, type CodexSettings } from '../../../domain/codex'
import type { FeatureActionHostV7 } from '../featureActionHost'

export function registerCodexActions(host: FeatureActionHostV7): void {
  const { register, registerHandler, isTabEnabled, setMessage, setTab } = host
    // Registering the Claude bridge writes into the user's own Claude settings
    // file, so it is modelled as a confirmed data-write action rather than a
    // silent side effect of enabling the provider.
    register({
      id: 'codex.claude.register',
      title: '注册 Claude 事件钩子',
      group: 'Codex',
      risk: 'data-write',
      scope: 'global',
      priority: 97,
      when: () => true,
      run: (_ctx, args) => {
        const register = (args as { register?: boolean } | undefined)?.register !== false
        const statusline = (args as { statusline?: boolean } | undefined)?.statusline !== false
        void host.codexController.setClaudeRegistration(register, { statusline })
        return true
      }
    })
    register({
      id: 'codex.cursor.register',
      title: '注册 Cursor 事件钩子',
      group: 'Codex',
      risk: 'data-write',
      scope: 'global',
      priority: 96,
      when: () => true,
      run: (_ctx, args) => {
        const register = (args as { register?: boolean } | undefined)?.register !== false
        void host.codexController.setCursorRegistration(register)
        return true
      }
    })
    register({ id: 'codex.inspect-environment', title: '检测 Codex 连接环境', group: 'Codex', risk: 'normal', scope: 'global', priority: 99, when: () => true, run: () => { void host.codexController.inspectEnvironment(); return true } })
    register({ id: 'codex.set-launch-path', title: '设置 Codex CLI 位置', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const value = args?.path
      if (typeof value !== 'string' || !value.trim()) return false
      void host.codexController.setLaunchPath(value)
      return true
    } })
    register({ id: 'codex.pick-launch-path', title: '从磁盘选择 Codex CLI', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: () => {
      void (async () => {
        const picked = await host.platform.files.pickFavorite?.()
        if (!picked) return
        await host.codexController.setLaunchPath(picked.path)
      })()
      return true
    } })
    register({ id: 'codex.clear-launch-path', title: '恢复 Codex CLI 自动发现', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: () => { void host.codexController.clearLaunchPath(); return true } })
    register({ id: 'codex.set-codexhost-path', title: '设置 codexhost 命令位置', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const value = args?.path
      if (typeof value !== 'string' || !value.trim()) return false
      void host.codexController.setCodexhostPath(value)
      return true
    } })
    register({ id: 'codex.pick-codexhost-path', title: '从磁盘选择 codexhost 命令', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: () => {
      void (async () => {
        const picked = await host.platform.files.pickFavorite?.()
        if (!picked) return
        await host.codexController.setCodexhostPath(picked.path)
      })()
      return true
    } })
    register({ id: 'codex.clear-codexhost-path', title: '恢复 codexhost 自动查找', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: () => { void host.codexController.clearCodexhostPath(); return true } })
    register({ id: 'codex.settings.open', title: '打开 Codex 配置', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: () => { setTab('codex'); return true } })
    register({ id: 'codex.quickJump.activate', title: '执行 Quick Jump 目标', group: 'Codex', risk: 'normal', scope: 'global', priority: 1, when: () => true, run: () => true })
    registerHandler({ commandId: 'codex.thread.createFocused', scope: 'global', priority: 99, when: () => true, run: () => {
      const enabled = host.state.codex.settings.floatEnabled || host.codexController.updateSettings({ floatEnabled: true })
      if (!enabled) return false
      queueMicrotask(() => host.platform.float.activate?.({ command: 'new-thread' }))
      return true
    } })
    register({ id: 'codex.settings.update', title: '更新 Codex 悬浮球配置', group: 'Codex', risk: 'data-write', scope: 'global', priority: 98, when: () => true, run: (_ctx, args) => {
      const source = args?.settings && typeof args.settings === 'object' ? args.settings : args
      return host.codexController.updateSettings((source || {}) as Partial<CodexSettings>)
    } })
    register({ id: 'codex.task.open', title: '打开 Codex 任务', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const source = args?.source === 'manual-quick-jump' || args?.source === 'card-click' || args?.source === 'manual-row-open'
        ? args.source
        : 'manual-row-open'
      void host.codexController.openThread(key, source, typeof args?.operationId === 'string' ? args.operationId : undefined)
      return Boolean(key)
    } })
    register({ id: 'codex.input.open', title: '打开 Codex 待输入任务', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: (_ctx, args) => host.codexController.openFirstInput(typeof args?.operationId === 'string' ? args.operationId : undefined, args?.source === 'local-shortcut' ? 'local-shortcut' : 'attention-shortcut') })
    register({ id: 'codex.completed-unread.openFirst', title: '依次打开 Codex 已完成未读任务', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: (_ctx, args) => host.codexController.openFirstCompletedUnread(typeof args?.operationId === 'string' ? args.operationId : undefined, args?.source === 'local-shortcut' ? 'local-shortcut' : 'attention-shortcut') })
    register({ id: 'codex.task.previous', title: '上一个 Codex 任务', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: (_ctx, args) => host.codexController.cycleTask(-1, typeof args?.operationId === 'string' ? args.operationId : undefined, args?.source === 'local-shortcut' ? 'local-shortcut' : 'global-shortcut') })
    register({ id: 'codex.task.next', title: '下一个 Codex 任务', group: 'Codex', risk: 'normal', scope: 'global', priority: 98, when: () => true, run: (_ctx, args) => host.codexController.cycleTask(1, typeof args?.operationId === 'string' ? args.operationId : undefined, args?.source === 'local-shortcut' ? 'local-shortcut' : 'global-shortcut') })
    registerHandler({ commandId: 'codex.task.archiveFocused', scope: 'global', priority: 98, when: () => true, run: (_ctx, args) => host.codexController.archiveFocusedTask(typeof args?.operationId === 'string' ? args.operationId : undefined) })
    register({ id: 'codex.task.focus', title: '同步 Companion 聚焦任务', group: 'Codex', risk: 'normal', scope: 'global', priority: 1, when: () => true, run: (_ctx, args) => host.codexController.setFocusedTask(
      typeof args?.key === 'string' ? args.key : '',
      typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt) ? args.revisionAt : undefined
    ) })
    register({ id: 'codex.task.hide', title: '隐藏 Codex 任务到 Companion 已隐藏区', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const revisionAt = typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt)
        ? args.revisionAt
        : typeof args?.updatedAt === 'number' && Number.isFinite(args.updatedAt) ? args.updatedAt : undefined
      return key && revisionAt !== undefined ? host.codexController.hide(key, revisionAt) : false
    } })
    register({ id: 'codex.task.manualPhase', title: '手动指定状态未知的 Companion 任务状态', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      // An empty phase is the documented clear signal, so it is a valid value
      // rather than a missing one; only an unrecognized string is rejected.
      const phase = args?.phase === '' || CODEX_MANUAL_PHASE_VALUES.includes(args?.phase as CodexManualPhaseValue)
        ? args?.phase as CodexManualPhaseValue | ''
        : undefined
      return key && phase !== undefined ? host.codexController.setManualPhase(key, phase) : false
    } })
    register({ id: 'codex.task.dismiss', title: '隐藏 Codex 任务到 Companion 已隐藏区', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const revisionAt = typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt)
        ? args.revisionAt
        : typeof args?.updatedAt === 'number' && Number.isFinite(args.updatedAt) ? args.updatedAt : undefined
      return key && revisionAt !== undefined ? host.codexController.hide(key, revisionAt) : false
    } })
    register({ id: 'codex.task.restore', title: '从 Companion 已隐藏区释放 Codex 任务', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const revisionAt = typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt)
        ? args.revisionAt
        : typeof args?.updatedAt === 'number' && Number.isFinite(args.updatedAt) ? args.updatedAt : undefined
      const kind = args?.kind === 'task' || args?.kind === 'activity' || args?.kind === 'pending' ? args.kind : undefined
      return key && revisionAt !== undefined && kind ? host.codexController.restore(key, revisionAt, kind) : false
    } })
    register({ id: 'codex.task.pausePlan', title: '暂停 Codex Plan', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const revisionAt = typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt) ? args.revisionAt : undefined
      if (!key || revisionAt === undefined) return false
      void host.codexController.pausePlan(key, revisionAt)
      return true
    } })
    register({ id: 'codex.task.resumePlan', title: '恢复 Codex Plan', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const revisionAt = typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt) ? args.revisionAt : undefined
      if (!key || revisionAt === undefined) return false
      void host.codexController.resumePlan(key, revisionAt)
      return true
    } })
    register({ id: 'codex.task.executePlan', title: '执行 Codex 原 Plan', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const revisionAt = typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt) ? args.revisionAt : undefined
      if (!key || revisionAt === undefined) return false
      void host.codexController.executePlan(key, revisionAt)
      return true
    } })
    for (const [actionId, paused] of [['codex.tasks.pausePlan', true], ['codex.tasks.resumePlan', false]] as const) {
      register({ id: actionId, title: paused ? '批量暂停 Codex Plan' : '批量恢复 Codex Plan', group: 'Codex', risk: 'data-write', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
        const items = Array.isArray(args?.items) ? args.items.flatMap((value) => {
          if (!value || typeof value !== 'object') return []
          const item = value as Record<string, unknown>
          return typeof item.key === 'string' && typeof item.revisionAt === 'number' && Number.isFinite(item.revisionAt)
            ? [{ key: item.key, revisionAt: item.revisionAt }]
            : []
        }) : []
        if (!items.length) return false
        for (const item of items) {
          void (paused
            ? host.codexController.pausePlan(item.key, item.revisionAt, 'batch-pause')
            : host.codexController.resumePlan(item.key, item.revisionAt, 'batch-resume'))
        }
        return true
      } })
    }
    register({ id: 'codex.archive.confirmation', title: '记录 Codex 归档确认阶段', group: 'Codex', risk: 'normal', scope: 'global', priority: 1, when: () => true, run: (_ctx, args) => {
      const stage = args?.stage === 'created' || args?.stage === 'confirmed' || args?.stage === 'expired' ? args.stage : ''
      const operationId = typeof args?.operationId === 'string' ? args.operationId : ''
      const source = typeof args?.source === 'string' ? args.source : 'archive-button'
      if (!stage || !operationId) return false
      host.platform.diagnostics?.record({
        level: stage === 'expired' ? 'error' : 'info',
        scope: 'archive-transaction',
        event: `archive-confirmation-${stage}`,
        outcome: stage,
        operationId,
        source,
        provider: 'codex'
      })
      return true
    } })
    register({ id: 'codex.task.archive', title: '归档 Codex 任务', group: 'Codex', risk: 'destructive', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const revisionAt = typeof args?.revisionAt === 'number' && Number.isFinite(args.revisionAt)
        ? args.revisionAt
        : typeof args?.updatedAt === 'number' && Number.isFinite(args.updatedAt) ? args.updatedAt : undefined
      if (!key || revisionAt === undefined) return false
      void host.codexController.archive(
        key,
        revisionAt,
        'card',
        typeof args?.operationId === 'string' ? args.operationId : undefined,
        args?.confirmationRecorded === true
      )
      return true
    } })
    register({ id: 'codex.tasks.archive', title: '批量归档 Codex 任务', group: 'Codex', risk: 'destructive', scope: 'global', priority: 97, when: () => true, run: (_ctx, args) => {
      const items = Array.isArray(args?.items) ? args.items.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const item = value as Record<string, unknown>
        return typeof item.key === 'string' && typeof item.revisionAt === 'number' && Number.isFinite(item.revisionAt)
          ? [{ key: item.key, revisionAt: item.revisionAt }]
          : []
      }) : []
      if (!items.length) return false
      const operationId = typeof args?.operationId === 'string' ? args.operationId : undefined
      if (items.length === 1 && args?.source === 'archive-button') {
        void host.codexController.archive(items[0].key, items[0].revisionAt, 'card', operationId, args?.confirmationRecorded === true)
      } else {
        void host.codexController.archiveMany(items, operationId, args?.confirmationRecorded === true)
      }
      return true
    } })
    register({ id: 'codex.tab.set', title: '切换 Codex 会话页签', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      const tab = typeof args?.tab === 'string' ? args.tab : ''
      return host.codexController.setTaskTab(tab as 'all' | 'input' | 'ongoing' | 'completed' | 'hidden' | 'projects')
    } })
    registerHandler({ commandId: 'codex.tab.prev', scope: 'global', priority: 96, when: () => true, run: () => {
      const tabs = ['ongoing', 'completed', 'hidden', 'projects'] as const
      const current = tabs.includes(host.state.codex.lastTaskTab as typeof tabs[number]) ? host.state.codex.lastTaskTab as typeof tabs[number] : 'ongoing'
      return host.codexController.setTaskTab(tabs[(tabs.indexOf(current) - 1 + tabs.length) % tabs.length])
    } })
    registerHandler({ commandId: 'codex.tab.next', scope: 'global', priority: 96, when: () => true, run: () => {
      const tabs = ['ongoing', 'completed', 'hidden', 'projects'] as const
      const current = tabs.includes(host.state.codex.lastTaskTab as typeof tabs[number]) ? host.state.codex.lastTaskTab as typeof tabs[number] : 'ongoing'
      return host.codexController.setTaskTab(tabs[(tabs.indexOf(current) + 1) % tabs.length])
    } })
    register({ id: 'codex.project.collapse', title: '折叠或展开 Codex 项目', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      return typeof args?.key === 'string' && typeof args?.collapsed === 'boolean'
        ? host.codexController.setProjectCollapsed(args.key, args.collapsed)
        : false
    } })
    register({ id: 'codex.alias.set', title: '设置 Codex 本地别名', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      const kind = args?.kind === 'task' || args?.kind === 'project' ? args.kind : ''
      return kind && typeof args?.key === 'string' && typeof args?.alias === 'string'
        ? host.codexController.setAlias(kind, args.key, args.alias)
        : false
    } })
    register({ id: 'codex.pin.toggle', title: '切换 Codex 本地置顶', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      const kind = args?.kind === 'task' || args?.kind === 'project' ? args.kind : ''
      return kind && typeof args?.key === 'string' ? host.codexController.toggleLocalPin(kind, args.key) : false
    } })
    register({ id: 'codex.pin.move', title: '调整 Codex 本地置顶顺序', group: 'Codex', risk: 'data-write', scope: 'global', priority: 96, when: () => true, run: (_ctx, args) => {
      const kind = args?.kind === 'task' || args?.kind === 'project' ? args.kind : ''
      const direction = args?.direction === -1 || args?.direction === 1 ? args.direction : 0
      return kind && direction && typeof args?.key === 'string' ? host.codexController.moveLocalPin(kind, args.key, direction) : false
    } })
    register({ id: 'codex.project.hide', title: '隐藏 Codex 项目分组', group: 'Codex', risk: 'data-write', scope: 'global', priority: 95, when: () => true, run: (_ctx, args) => typeof args?.key === 'string' ? host.codexController.hideProject(args.key) : false })
    register({ id: 'codex.project.show', title: '恢复 Codex 项目分组', group: 'Codex', risk: 'data-write', scope: 'global', priority: 95, when: () => true, run: (_ctx, args) => typeof args?.key === 'string' ? host.codexController.showProject(args.key) : false })
    register({ id: 'codex.project.remove', title: '从 Codex 侧栏移除项目', group: 'Codex', risk: 'destructive', scope: 'global', priority: 95, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const actionAlias = typeof args?.actionAlias === 'string' ? args.actionAlias : ''
      const sourceFingerprint = typeof args?.sourceFingerprint === 'string' ? args.sourceFingerprint : ''
      if (!key || !actionAlias || !sourceFingerprint) return false
      void host.codexController.removeProject(key, actionAlias, sourceFingerprint)
      return true
    } })
    register({ id: 'codex.project.archive', title: '归档 Codex 项目全部已完成任务', group: 'Codex', risk: 'destructive', scope: 'global', priority: 95, when: () => true, run: (_ctx, args) => {
      const key = typeof args?.key === 'string' ? args.key : ''
      const actionAlias = typeof args?.actionAlias === 'string' ? args.actionAlias : ''
      if (!key || !actionAlias) return false
      void host.codexController.archiveProject(
        key,
        actionAlias,
        typeof args?.operationId === 'string' ? args.operationId : undefined,
        args?.confirmationRecorded === true
      )
      return true
    } })
    register({ id: 'codex.float.position.save', title: '保存 Codex 悬浮球位置', group: 'Codex', risk: 'data-write', scope: 'global', priority: 92, when: () => true, run: (_ctx, args) => {
      const position = args?.position
      return position && typeof position === 'object' ? host.codexController.updateSettings({ position: position as CodexFloatPosition }) : false
    } })
    register({ id: 'codex.float.geometry.save', title: '保存 Codex 展开尺寸与位置', group: 'Codex', risk: 'data-write', scope: 'global', priority: 92, when: () => true, run: (_ctx, args) => {
      const position = args?.position
      const expandedSize = args?.expandedSize
      return position && typeof position === 'object' && expandedSize && typeof expandedSize === 'object'
        ? host.codexController.saveGeometry(position as CodexFloatPosition, expandedSize as { displayId?: string; width: number; height: number; updatedAt?: number })
        : false
    } })
    // A quota reading is also its own refresh trigger (RAW-201): the float's chips dispatch this.
    register({ id: 'codex.quota.refresh', title: '立即刷新额度读数', group: 'Codex', risk: 'normal', scope: 'global', priority: 90, when: () => true, run: () => { void host.codexController.refreshQuota(); return true } })
    register({ id: 'codex.float.position.reset', title: '重置 Codex 悬浮球位置', group: 'Codex', risk: 'data-write', scope: 'global', priority: 91, when: () => true, run: () => host.codexController.resetPosition() })
    register({ id: 'codex.float.size.reset', title: '恢复 Codex 自适应展开尺寸', group: 'Codex', risk: 'data-write', scope: 'global', priority: 91, when: () => true, run: (_ctx, args) => host.codexController.resetExpandedSize(typeof args?.displayId === 'string' ? args.displayId : undefined) })
    registerHandler({ commandId: 'codex.float.toggle', scope: 'global', priority: 1000, when: () => true, run: (_ctx, args) => {
      if (!isTabEnabled('codex')) {
        setMessage('请先在总设置中启用 Codex Companion')
        return false
      }
      const now = Date.now()
      const source = args?.source === 'utools-feature' ? 'utools-feature' : args?.source === 'in-app-shortcut' ? 'in-app-shortcut' : 'runtime'
      if (host.lastCodexFloatToggleSource && source !== host.lastCodexFloatToggleSource && now - host.lastCodexFloatToggleAt < 300) {
        host.lastCodexFloatToggleAt = 0
        host.lastCodexFloatToggleSource = ''
        return true
      }
      host.lastCodexFloatToggleAt = now
      host.lastCodexFloatToggleSource = source
      return host.codexController.updateSettings({ floatEnabled: !host.state.codex.settings.floatEnabled })
    } })
    registerHandler({ commandId: 'codex.float.activate', scope: 'global', priority: 1001, when: () => true, run: () => {
      if (!isTabEnabled('codex')) {
        setMessage('请先在总设置中启用 Codex Companion')
        return false
      }
      const enabled = host.state.codex.settings.floatEnabled || host.codexController.updateSettings({ floatEnabled: true })
      if (!enabled) return false
      queueMicrotask(() => host.platform.float.activate?.())
      return true
    } })
    registerHandler({ commandId: 'codex.quick.activate', scope: 'global', priority: 1002, when: () => true, run: () => {
      if (!isTabEnabled('codex')) {
        setMessage('请先在总设置中启用 Codex Companion')
        return false
      }
      const enabled = host.state.codex.settings.floatEnabled || host.codexController.updateSettings({ floatEnabled: true })
      if (!enabled) return false
      queueMicrotask(() => host.platform.float.activate?.({ command: 'quick' }))
      return true
    } })
    register({ id: 'codex.float.hide', title: '隐藏 Codex 悬浮球', group: 'Codex', risk: 'data-write', scope: 'global', priority: 90, when: () => true, run: () => host.codexController.updateSettings({ floatEnabled: false }) })
    register({ id: 'codex.actionRunner.activate', title: '打开 Codex Action 执行工作台', group: 'Codex', risk: 'normal', scope: 'global', priority: 1000, when: () => true, run: (_ctx, args) => {
      void host.codexController.activateActionRunner(typeof args?.laneId === 'string' ? args.laneId : '')
      return true
    } })
    register({ id: 'codex.actionRunner.run', title: '执行 Runner Action', group: 'Codex', risk: 'data-write', scope: 'global', priority: 999, when: () => true, run: (_ctx, args) => {
      if (typeof args?.laneId !== 'string') return false
      void host.codexController.runActionRunnerLane(args.laneId, args.restartIfRunning === true)
      return true
    } })
    register({ id: 'codex.actionRunner.stop', title: '停止 Runner Action', group: 'Codex', risk: 'data-write', scope: 'global', priority: 999, when: () => true, run: (_ctx, args) => {
      if (typeof args?.laneId !== 'string') return false
      void host.codexController.stopActionRunnerLane(args.laneId)
      return true
    } })
    register({ id: 'codex.actionRunner.run.archive', title: '归档 Action 执行记录', group: 'Codex', risk: 'data-write', scope: 'global', priority: 998, when: () => true, run: (_ctx, args) => {
      if (typeof args?.runId !== 'string') return false
      void host.codexController.setActionRunnerRunArchived(args.runId, true)
      return true
    } })
    register({ id: 'codex.actionRunner.run.restore', title: '恢复 Action 执行记录', group: 'Codex', risk: 'data-write', scope: 'global', priority: 998, when: () => true, run: (_ctx, args) => {
      if (typeof args?.runId !== 'string') return false
      void host.codexController.setActionRunnerRunArchived(args.runId, false)
      return true
    } })
    register({ id: 'codex.actionRunner.preference.update', title: '更新 Action Runner 窗口偏好', group: 'Codex', risk: 'data-write', scope: 'global', priority: 997, when: () => true, run: (_ctx, args) => host.codexController.updateActionRunnerPreference({ pinned: typeof args?.pinned === 'boolean' ? args.pinned : undefined, view: args?.view === 'records' || args?.view === 'archived' ? args.view : undefined, selectedLaneId: typeof args?.selectedLaneId === 'string' ? args.selectedLaneId : undefined }) })
    register({ id: 'codex.actionRunner.runtime.update', title: '更新 Action Runner 项目 Node', group: 'Codex', risk: 'data-write', scope: 'global', priority: 997, when: () => true, run: (_ctx, args) => {
      if (typeof args?.projectKey !== 'string' || (args?.mode !== 'auto' && args?.mode !== 'manual')) return false
      return host.codexController.updateActionRunnerPreference({
        runtime: {
          projectKey: args.projectKey,
          mode: args.mode,
          candidateId: typeof args?.candidateId === 'string' ? args.candidateId : undefined
        }
      })
    } })
    register({ id: 'codex.actionRunner.project.reorder', title: '调整 Action Runner 项目顺序', group: 'Codex', risk: 'data-write', scope: 'global', priority: 997, when: () => true, run: (_ctx, args) => host.codexController.reorderActionRunnerProjects(Array.isArray(args?.projectKeys) ? args.projectKeys.filter((key): key is string => typeof key === 'string') : []) })
    register({ id: 'codex.actionRunner.hotkey.configure', title: '配置 Action Runner 全局快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 997, when: () => true, run: () => {
      const opened = host.platform.app.configureHotkey?.('打开 Action 执行工作台') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“打开 Action 执行工作台”绑定快捷键')
      return opened
    } })
    // 每一行配置它自己：这条对应「直接展开卡片」，悬浮球开关另有 codex.float.toggle.hotkey.configure。
    // 旧行为把本动作放在「悬浮球开关」行上，标题与它实际配置的功能是错位的。
    register({ id: 'codex.hotkey.configure', title: '配置进入 Codex 卡片快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = host.platform.app.configureHotkey?.('直接展开 Codex 卡片') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“直接展开 Codex 卡片”绑定快捷键')
      return opened
    } })
    register({ id: 'codex.float.toggle.hotkey.configure', title: '配置悬浮球开关快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = host.platform.app.configureHotkey?.('切换 Codex 悬浮球') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“切换 Codex 悬浮球”绑定快捷键')
      return opened
    } })
    register({ id: 'codex.archive.hotkey.configure', title: '配置归档当前任务快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = host.platform.app.configureHotkey?.('归档当前 Companion 任务') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“归档当前 Companion 任务”绑定快捷键')
      return opened
    } })
    register({ id: 'codex.quick.hotkey.configure', title: '配置快速任务查看快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = host.platform.app.configureHotkey?.('快速任务查看') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“快速任务查看”绑定快捷键')
      return opened
    } })
    register({ id: 'codex.input.hotkey.configure', title: '配置 Codex 待输入快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = host.platform.app.configureHotkey?.('打开 Codex 待输入任务') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“打开 Codex 待输入任务”绑定快捷键')
      return opened
    } })
    register({ id: 'codex.completed-unread.hotkey.configure', title: '配置 Codex 已完成未读快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = host.platform.app.configureHotkey?.('依次打开 Codex 已完成未读任务') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“依次打开 Codex 已完成未读任务”绑定快捷键')
      return opened
    } })
    register({ id: 'codex.task.previous.hotkey.configure', title: '配置上一个 Codex 任务快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = host.platform.app.configureHotkey?.('上一个 Codex 任务') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“上一个 Codex 任务”绑定快捷键')
      return opened
    } })
    register({ id: 'codex.task.next.hotkey.configure', title: '配置下一个 Codex 任务快捷键', group: 'Codex', risk: 'normal', scope: 'global', priority: 89, when: () => true, run: () => {
      const opened = host.platform.app.configureHotkey?.('下一个 Codex 任务') === true
      if (!opened) setMessage('请在 uTools 设置 → 全局功能中，为“下一个 Codex 任务”绑定快捷键')
      return opened
    } })
    for (let slot = 1; slot <= 5; slot += 1) {
      const slotIndex = slot - 1
      const label = `Codex Action 槽 ${slot}`
      registerHandler({
        commandId: `codex.action.run.${slot}`,
        scope: 'global',
        priority: 88,
        when: () => true,
        run: () => {
          void host.codexController.runEnvironmentActionSlot(slotIndex)
          return true
        }
      })
      register({
        id: `codex.action.run.${slot}.hotkey.configure`,
        title: `配置 Codex Action 槽 ${slot} 快捷键`,
        group: 'Codex',
        risk: 'normal',
        scope: 'global',
        priority: 89,
        when: () => true,
        run: () => {
          const opened = host.platform.app.configureHotkey?.(label) === true
          if (!opened) setMessage(`请在 uTools 设置 → 全局功能中，为“${label}”绑定快捷键`)
          return opened
        }
      })
    }
}
