# Claude 完成事件跨来源轮次关联

状态：实现、聚焦自动回归、生产构建通过；artifact-ready，真实宿主未验收。

## 问题

用户确认两个 Claude Code 任务均已完成；EyPc 浮窗仍列于进行中，其中一条带两个子任务。只读来源投影中父任务均为 completed，子任务均 inactive；宿主身份与此前构建匹配。App 与 Hook 对同一任务记录的 Turn 开始时间不同，须验证切换来源时是否被 Kernel 当作旧 Turn 拒绝。

## VerificationImpactTrace

| 项 | 范围 |
| --- | --- |
| 修改面 | Claude Provider 完成事件的轮次关联，preload 镜像 |
| 影响链 | App/Hook → correlateCodeSessions → Provider evidence → Kernel → Float 包 |
| 验证 | 真实模块的脱敏回放覆盖无子任务、两个已停止子任务与下一轮；Claude bridge 聚焦回归 |
| 构建 | preload 是宿主产物输入，需生产构建与当前真值同步 |
| 不运行 | 全仓测试、真实宿主控制/重载；本轮无此授权 |
| Git 交付 | 用户已明确授权提交并推送本次相关修复；保留无关配置、技能删除及本地运行身份 |

## 实现与结果

App 的 send-message 起点早于 Hook Turn 起点；来源选择器切回 App completed 后，Kernel 按旧 Turn 拒绝它。修复位于 `projectedState`：App exact-terminal 与唯一 Hook 同相位且 Hook Stop 被 App 终态覆盖时，保留较晚 Hook 起点。无唯一关联、Hook 仍活跃或无可用 Stop 时不合并；不修改共享 Kernel 因果门，不增加超时推断。

| 检查 | 结果 |
| --- | --- |
| Provider → production Host → Kernel 回放 | 无子任务与两个子任务均先失败（仍 running），修复后完成且 liveCount=0；后续真实新 Turn 可进入 running |
| 边界 | 唯一匹配停止才合并；活 Hook、无效停止顺序、非精确 App、歧义关联不借用起点 |
| 聚焦套件 | Claude Bridge、App State、Safety 与 AppServer Host Bridge：304 项通过 |
| 文档 | 用户帮助同步；复用现有 phase-cache 排错记录，补跨来源起点漏检与回放证据 |
| 真实宿主 | 未控制、重启或加载新包；截图是修复前证据 |

实现：[code-sessions.cjs](../../../../preload/claude/code-sessions.cjs#L301)。回放：[Host bridge test](../../../../tests/platform/codexAppServerBridge.test.ts#L1703)。

产物：EyPc V7，`host-f61f16dec0c48c947364 / renderer-6f025f7528c18e6b14af`，北京时间 `2026/09/10 21:43:29`（`2026-09-10T13:43:29.622Z`）。生产构建含类型、合同和 uTools 产物校验均通过。入口：[dist/plugin.json](../../../../dist/plugin.json#L1)。须加载新产物后才能进行真实浮窗验收。
