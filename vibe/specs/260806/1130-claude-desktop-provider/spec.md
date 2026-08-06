# Spec：Claude 桌面端 provider（骨架，Phase 0 前完成细化）

RAW: [raw-requirement.md](raw-requirement.md#L1) · Plan: [plan.md](plan.md#L1)

状态：**P0 采样后已细化**（2026-08-06）。证据→状态映射与去重键见 [sampling.md](sampling.md#L1) 与 [claudeDesktop.ts](../../../../src/domain/claudeDesktop.ts#L1)（事件优先 + 增长脉冲兜底；`audit.session_id === cliSessionId` 为去重键）。仍待定（Phase 3 前）：水球三方额度合并策略、`rate_limit_event` 的 resetsAt 是否并入额度校准——均属 UI/呈现决策，届时出设计偏好回执。

**角标合并（历史定案，已被取代）**：1130/2115 曾定「桌面端会话不产生已完成未读」（无深链、无法证明已读）。**2026-08-06 起被 [2147 unread-authority](../2147-claude-open-in-desktop-app/unread-authority.md#L1) 取代**：EyPc 镜像桌面端 App 的 `epitaxy-unread-v1` 集合；产品合同见 [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L103)。下文若仍写「不产生未读」，一律以 2147 为准。

## 已定原则（从既有铁律继承，不重新发明）

1. 纯域模块（如 `claudeDesktop.ts`）零 import 运行时；I/O 全在 preload 桥。
2. 证据不等于状态；快照缺失不等于删除；初始快照不得压过新事件；hook/事件证据带时效上限；Side Chat/子分支作用域规则原样搬运（铁律 8、RAW-090/112/130 系）。
3. 只读桌面端数据 + `fs.watch`；**绝不写入** `~/Library/Application Support/Claude/`。
4. 仅-Codex 与 仅-CLI-Claude 模式逐字节一致；新 provider 默认关闭。
5. key 命名空间沿用 `<provider>:<id>`（新增 `claude-desktop:` 前缀或复用 `claude:` 待定——涉及去重，见细化项）。
6. 打开：优先 AX 窗口激活（Window Jump 复用），`claude://cowork/new` 不用于"打开已有"；深链缺口修复后切换。

## 数据源映射（已验证）

| 桌面端文件 | 用途 | 对应现有概念 |
| --- | --- | --- |
| `local_<uuid>.json` | 身份/cwd/title/lastActivityAt | inventory |
| `local_<uuid>/audit.jsonl` | 工具调用/权限/文件操作事件流 | hook 队列（活跃度） |
| `remote-session-spaces.json` | 云端会话索引（无状态） | 首版不展示或只读列出（待定） |
| `scheduled-tasks.json` | 计划任务 | 范围外（后续可选） |

## 明确不做

- 额度（桌面端无本地落盘，见 RAW）。
- 写入/注册/修改桌面端任何文件。
- 云端会话的状态推断。
