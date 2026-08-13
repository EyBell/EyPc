---
id: eypc-req-codex-raw-052
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-052
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-RAW-039-local-remove-and-RAW-048-row-actions"
supersedes:
  - eypc-req-codex-raw-044
---

# RAW-052 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

会话行左键直接打开，只有左侧状态/选择槽点击或当前高亮项 `Space` 才切换选择；`Space` 新增选择后自动下移。任务行固定常显 `顶 / 隐（显）/ 归（确）/ +`，项目行固定常显 `顶 / 移（确）/ 隐（显）/ +`，每槽 `30px`、禁用保位、无宽度动画。状态槽和四个短字符按钮使用子窗自有、完全不透明的 `200ms` 说明层且不得设置原生 `title`；完整动作仍由右键/`Ctrl+→` 抽屉提供。项目“隐/显”只控制项目页分组，所属任务继续出现在其他任务页签和计数中；持久化 `hiddenProjectKeys`，升级时丢弃旧 `removedProjectKeys/removedProjectAbsentKeys` 而不自动修改 Codex。项目“移”必须真正模拟当前 Codex 桌面端 Remove：Renderer 只提交短期项目 alias 与 `sourceFingerprint`；Host 在 Codex Desktop 仍运行时返回 `codex-running` 并零写入，只从主 `.codex-global-state.json` 的 `local-projects/project-order/pinned-project-ids` 移除项目并在需要时清空 `selected-project`，保留 assignments、会话、目录和未知字段；主文件/`.bak` 同步临时写入、原子替换、双重重读核验，失败回滚并返回 `stale-source/unsupported-schema/write-failed`，成功返回 `verified`。Chats 不可移除。成功后清理该项目的 EyPc 隐藏/折叠/本地置顶/别名元数据。Quick Jump 普通标记统一深色底、白色粗体与白描边，当前标记黄色底、深色字与深描边，删除粉紫交替。未说明的视觉细节沿用项目现有权威，不重复确认；本项目开发验收由用户负责，Agent 只更新测试契约，不运行测试、类型、构建、uTools、截图、真实预检、归档或项目移除，交付固定为“未校验，待用户验收”。
