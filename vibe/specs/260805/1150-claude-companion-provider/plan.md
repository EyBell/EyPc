# Claude Companion Provider 实施计划

Tool: claude (Cowork)
Date: 2026-08-05
Status: `planned / awaiting-cli-precondition`

Spec: [spec.md](spec.md#L1) · Tasks: [tasks.md](tasks.md#L1)

## 分阶段计划

### Phase 0 — 前置（用户自办，阻塞后续）
- 本机安装并登录 Claude Code CLI；EyPc 侧确认 `~/.claude` 出现、版本可探测。
- 确认 hooks / statusline 注册方案（写 `~/.claude/settings.json`，行动时确认，幂等合并、可卸载）。

### Phase 1 — Provider 接口抽象（纯 Domain，不改行为）
- 定义 `CompanionProvider` 接口与 `CompanionProviderId`；任务 key 命名空间规范（Codex 存量 key 不变，Claude 用 `claude:<sessionId>`）。
- 顺序合同重构：抽出共享基础比较器（pinned-first 稳定序），导出**显示序**（不分组）与**循环序**（层内 provider 分组、组间 Codex→Claude、稳定单调）两个投影；直接打开跟随循环序（修订 RAW-146 合同并更新其回归测试）。
- 角标聚合改为跨 provider 按状态合并。
- 验收：现有全部 Codex 测试在"仅 Codex 启用"下不变绿→绿（兼容承诺的自动化证明）。

### Phase 2 — Claude preload 桥（新模块，与 Codex 桥并列）
- 环境探测：CLI 路径/版本/登录态/`~/.claude` 结构。
- hooks 安装器 + 事件桥：hook 脚本落 EyPc 自有目录，事件经本地队列文件/socket 进 preload watcher；捕获 session_id/cwd/进程 PID。
- 库存读取：JSONL 冷启动重建 + 增量 tail；`~/.claude/tasks/` 任务列表补充证据。
- 额度适配：statusline 落盘主源 + oauth/usage 兜底（容错降级）+ Keychain/credentials 读取；接入 `quotaRefreshSeconds` 语义的独立 lane。
- 打开动作：PID→终端窗口聚焦（复用 preload/windows 平台能力）→ 降级 `claude --resume` 新终端；成功派发即确认。
- 镜像纪律：canonical preload 与 public 镜像同步（沿用 `EYPC-UTOOLS-HOST-001` 静态核验流程）。

### Phase 3 — Controller 汇总层
- Aggregator 消费两个 provider 流，产出单一原子包（含 provider 字段）；启用/停用开关与单侧降级隔离；Claude read-state 自管（成功打开写已读）。
- 循环游标切换到新循环序；直接打开、compact 动作对齐。

### Phase 4 — UI 与设置
- 卡片行底部 provider 标记位（带 `data-operation-tooltip`，遵守 `EYPC-OPERATION-TIP-001`）。
- 水球三态额度映射（仅 Codex / 仅 Claude / 共享：ring=Codex、球心%=Claude，未连接回退原样）。
- 展开卡额度区 provider 分区；设置页 Claude 区块（启用开关、刷新周期、hooks 状态、诊断聚合计数）。
- 按 `EYPC-FEATURE-HELP-001` 更新 Codex 功能说明 guide（融合后的双 provider 说明）。

### Phase 5 — 验证与文档同步
- 自动化：新增 Domain/Controller/preload 聚焦测试 + 语义 typecheck + 非运行 build（`EYPC-VERIFY-001`）。
- 宿主验收门禁（用户）：hooks 实时性、终端聚焦矩阵、Keychain 授权、空闲期额度兜底、双 provider 混合循环/角标一致性、三态水球视觉。
- 文档同步（doc impact）：PROJECT_STATUS、ARCHITECTURE（provider 接口正式化）、PRODUCT_REQUIREMENTS、vibe/rules README trace 行、Codex Companion spec 的 RAW-146 顺序合同修订记录。

## 影响面声明

- 触及：`src/domain/`（顺序/聚合/新 provider 契约）、`src/runtime/codexController.ts`（汇总层化）、`preload/index.js` + 新 claude 桥模块（含 public 镜像）、`FloatApp.vue`/`CodexWaterBall.vue`/`CodexPage.vue`、featureRegistry 帮助 guide。
- 不触及：Codex 状态机语义（RAW-116~146 除顺序合同修订外）、MQTT/端口/收藏/Window Jump 各面、Codex 原生状态只读纪律。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| RAW-146 顺序合同修订引入回归 | Phase 1 先行、纯 Domain、双投影同源导出 + 全量现有测试兼容验证 |
| 终端聚焦成功率不确定 | 两级降级（聚焦→resume 新终端）；列宿主验收矩阵 |
| oauth/usage 未文档化接口变动 | statusline 为主源；兜底失败仅降级为 stale 展示，不报错刷屏 |
| hooks 漏事件 | JSONL 冷重建 + PID 存活探测兜底；宁保守 ongoing |
| 双 provider 互相拖累 | 接口隔离 + 单侧降级合同 + 独立 lane |
