# Claude Companion Provider 融合规范（计划稿）

Tool: claude (Cowork)
Date: 2026-08-05
Status: `planned / awaiting-cli-precondition`
Documentation level: `controlled`
Requirement version: `2026-08-05.1`

Raw source: [raw-requirement.md](raw-requirement.md#L1)

## 第一性目标

一个水球、两个 provider。Codex 与 Claude 的任务在同一浮窗、同一展开卡、同一角标体系中按**状态**汇总呈现；来源只作为行级底部标记与循环分组键存在。跳转由各 provider 自身能力执行，循环框架归 EyPc。

## 0. Provider 接口化架构（2026-08-05 用户补充要求）

- 架构为**两个分离的 provider 模块 + 一个汇总层**：定义统一 `CompanionProvider` 接口（能力探测、任务库存/活动流、额度流、打开动作、生命周期），`codexProvider` 与 `claudeProvider` 各自独立实现，互不引用；Aggregator 只消费接口，Controller/Float 只见汇总投影。
- 每个 provider 可在设置中**独立启用/停用**：二者可分别独占水球，也可同时启用共享水球。停用某 provider 时其任务、角标、额度贡献整体消失，另一 provider 不受影响（provider 隔离，单侧异常只降级单侧）。
- **插件兼容承诺**：仅启用 Codex（含 Claude 模块缺席/未安装 CLI）时，行为与视觉与现行版本完全一致——现有用户升级后零感知。Claude 模块探测不到 CLI 时自动呈"未连接"态，不报错、不占位。
- 该接口即 ARCHITECTURE.md 预留的 provider 替换缝的正式化；未来第三 provider（如 Easy Agent）按同一接口接入。

## 1. 任务模型与身份

- 新增 `CompanionProviderId = 'codex' | 'claude'`。现有 Codex 任务 key 不变（迁移零成本）；Claude 任务 key 为 `claude:<sessionId>` 命名空间，与 Codex key 空间不碰撞。
- EyPc 本地元数据（别名、置顶、隐藏、折叠、read receipts）按带 provider 的 key 存储；Codex 侧存量数据不迁移、不重写。
- Claude 任务库存来源：`~/.claude/projects/<slug>/<sessionId>.jsonl`（冷启动重建 + 增量 tail）+ hooks 事件桥（热路径）。会话归属项目按 slug 还原路径，复用现有项目分组投影。

## 2. 状态映射（Claude → 现有状态机）

| Claude 证据 | 映射状态 |
| --- | --- |
| `UserPromptSubmit` / `PreToolUse` / `PostToolUse` hook | active / running |
| `PermissionRequest` hook | waiting-approval（待审批） |
| `Notification`（等待输入类） | waiting-input（待输入） |
| `Stop` / `StopFailure` hook | 回合完成 / 异常终止；完成产生 completed-unread（EyPc 自管） |
| `SessionEnd`；claude 进程 PID 消失 | 会话结束/停止 |
| `SubagentStart/Stop`、`TaskCreated/TaskCompleted` | 辅助证据（不单独成层） |
| JSONL 尾部结构（冷启动） | 保守推断：最后角色 assistant 且静默 → idle/completed；缺证据 → ongoing |

- Claude 无 Plan-only 概念：Plan-only 独占层仅 Codex 任务参与，Claude 任务不进入该层。
- Claude read-state 完全由 EyPc 自管：成功派发打开动作即写已读；无原生已读集合仲裁负担。漏事件冷恢复以 JSONL 重建为准，宁保守 ongoing 不伪造终态。

## 3. 排布、角标与顺序合同（修订 RAW-146）

- **角标数字**：跨 provider 按状态合并统计（待输入合计、进行中合计、完成未读合计），不分来源。
- **显示序**（列表/展开卡）：沿用现有 pinned-first 稳定序，**不**按 provider 分组。
- **循环序**（上一个/下一个）：在现有分层独占框架（普通待输入/审批 → Plan-only → 时间窗内最近活跃 → 置顶回退）之上，**层内按 provider 分组**：先遍历完游标当前所在 provider 组，再切入另一组；组间相对顺序固定（Codex 组在前，Claude 组在后），组内沿用 pinned-first 稳定序。首尾回绕跨组连续。
- **稳定性合同**：循环进行中，新事件只允许在游标身后或组尾插入投影更新，不得移动游标当前项与其前驱后继的相对顺序（“不出现一会儿上一会儿下”）；游标所在项离层时沿用现有“下一个从首项、上一个从末项”恢复规则。
- **直接打开**（“打开第一条待输入”、compact 动作）：跟随**循环序**首项。RAW-146 的“单一共享顺序”修订为：Controller 与 Float 共享同一**基础比较器**（pinned-first 稳定序），循环序与直接打开在其上附加 provider 分组主键；compact 计数与列表显示继续使用不分组投影。二者由同一 Domain 函数族导出，禁止第二套排序实现。

## 4. 跳转（per-provider self-jump）

- Codex：现行 Host Deep Link 路径不变，成功确认与已读语义不变。
- Claude：打开动作两级——优先聚焦承载该会话的终端窗口（hook 捕获 claude 进程 PID/cwd，复用 Window Jump 平台层 PID+CGWindowID/HWND 精确聚焦能力）；不可聚焦时降级为新开终端 `claude --resume <sessionId>`。成功派发即视为打开确认（弱确认语义，写 EyPc 自管已读）。
- 循环快捷键、角标点击、卡片点击共用同一打开动作出口；失败不改 unread、不写任何 Claude 原生状态。

## 5. 额度展示（随启用组合切换）

- **仅 Codex 启用**：与现行完全一致——liquid=short、ring=weekly、球心百分比=Codex primary（兼容模式，零变化）。
- **仅 Claude 启用**：Claude 独占水球——liquid=Claude 5h、ring=Claude 7d、球心百分比=Claude 5h 剩余。
- **双启用（共享，用户 2026-08-05 拍板）**：外层圆环进度 = Codex（ring=weekly 语义保持；液面 liquid=Codex short 不变）；**球心百分比数字 = Claude**（默认 Claude 5h 剩余；设置可切 5h / 7d / 更紧张者）。Claude 未连接（CLI 缺席/未登录）时百分比回退为 Codex 原样。
- `showPercent` 等外观 token 语义沿用；三种组合共用同一外观持久化，不新增第二套外观体系。
- **展开卡额度区**：按 provider 分区展示——Codex short/weekly 与 Claude 5h/7d 并列，各带复位倒计时；沿用现有 quota 字段可见性配置。
- Claude 额度来源：statusline 落盘文件（官方 `rate_limits` 字段，主）+ `api/oauth/usage`（兜底，未文档化，容错降级）；接入现有 `quotaRefreshSeconds` 调度语义，独立 lane，不与 Codex 额度互相阻塞。
- 凭证（macOS Keychain / credentials 文件）仅运行时读取，不落盘、不入诊断、不进快照。

## 6. 卡片来源标记

- 每任务行仅一个**明显的底部标记位**标识来源（Codex / Claude），复用现有卡片主题 token 体系；不引入行内第二套配色语义，不改变行排序。
- 标记位为静态视觉元素，带 `data-operation-tooltip` 名称来源（遵守 `EYPC-OPERATION-TIP-001`）。

## 7. 只读纪律与隐私

- Claude 原生状态绝对只读；唯一例外：hooks / statusline 注册这一次性安装写入（`~/.claude/settings.json`），执行前需用户行动时确认，且写入为幂等合并、可干净卸载。
- 对话正文、路径、会话 ID 不入诊断；诊断沿用现行匿名聚合计数模式。
- Codex 侧全部现行合同（RAW-116~146 状态机、read 仲裁、隐私）不受影响；claude provider 异常只降级 Claude 面，不得拖垮 Codex 面（provider 隔离）。

## 8. 前置与宿主验收门禁

- 前置：本机安装并登录 Claude Code CLI（用户自办，进行中）；hooks/statusline 注册确认。
- 自动化验证按 `EYPC-VERIFY-001`：Domain/Controller/preload 聚焦测试 + 语义 typecheck + 非运行 build。
- host-acceptance 门禁（用户验收）：hooks 事件实时性、终端聚焦成功率（iTerm/Terminal/IDE 内嵌矩阵）、Keychain 首次授权、statusline 空闲期兜底刷新、双 provider 混合循环与角标一致性。
