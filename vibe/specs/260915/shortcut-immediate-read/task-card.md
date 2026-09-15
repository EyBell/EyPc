# 快捷打开立即已读：实现与验证

1. 目标：四 Provider 的快捷打开在成功派发后立即反馈本轮已读，降低等待；保持真实状态与迟到回执隔离。用户需求见 [RAW-221](raw-requirement.md#L11)，冲突决定见 [设计](spec.md#L1)。
2. 实现：新增 `preload/companion/shortcut-read.cjs`，Kernel navigation 的 openTarget 统一捕获/核对/提交；仅 public root 投影清 unread，Provider 节点保留。覆盖全局、局部、未读入口、上一下一和快速跳转；不扩大到普通卡片/自动恢复。
3. 保护：失败不清、进行中不转完成；旧同轮数据和 metadata-only 刷新不闪回；新轮次、原生布尔变化、子成员变化、任务删除重建、初始化代际或关闭使旧记录失效。快捷来源不会再经过旧的 Claude native-read fallback，避免迟到确认误清新轮次。
4. 性能：本地记录只驻内存；已读投影无存储写、无新增 Provider 扫描、无新定时器。既有打开应用/派发过程本身仍可能耗时，不能称为零耗时。原有临时冻结追踪保留，并增加 `shortcut-local-read` 接受事件。
5. VerificationImpactTrace：Shortcut → navigation → actions receipt → Kernel public-root projection → counts/selectors/UI；异步结果与新轮次、任务实例、成员/原生布尔变化竞争。由新增模块/Kernel 输入变化升级到类型检查、构建和产物校验。
6. 聚焦回归：shortcutReadReceipts、companionTaskKernel、companionNavigationBridge、codexCompanion 共 4 套件 211/211。覆盖四 Provider、不额外触发 preflight、旧快照、新轮次、失败、迟到原生成功、成员变化、移除/重建、重置、自动恢复排除及各快捷入口。最初运行时并行导航测试在更新中出现失败；同目录最终集成回归已全部通过，未覆盖或撤回并行导航/Orca 实现。
7. 构建：合同、vue-tsc、生产构建、uTools 产物、需求/来源锚点校验通过；92 对已跟踪镜像校验，新增 freeze-trace 与 shortcut-read 的 source/public/dist 逐字节一致。入口预算保持已有失败：14,761 对 14,679，超 82 行；本轮未增加 preload/index.js 行数，也未放宽门禁。未跑全仓测试。
8. 工作区产物：EyPc V7，`host-0f2f731bf53e95875d86 / renderer-e8d47a2a95408bba843c`；builtAt `2026-09-15T07:35:50.098Z`（北京时间 `2026/09/15 15:35:50`）。生成包包含当时工作区并行 Claude/Orca/导航改动，不将它们归为本次实现。
9. 状态：`focused-automated-verified / artifact-ready / host-not-retested`。未启动/启用/重载插件，未替换安装包，未提交/推送。之前的主线程卡顿尚未实机归因，不能凭本次快路径回归宣告「不会再卡死」。后续按 [卡顿归因判据](../../260914/plugin-startup-freeze/yesterday-audit.md#L43) 实测。
