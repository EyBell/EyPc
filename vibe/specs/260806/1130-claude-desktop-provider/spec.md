# Spec：Claude 桌面端 provider（骨架，Phase 0 前完成细化）

> **Historical evidence only.** 2026-08-07 起，本文件的 `local-agent-mode-sessions`/Cowork 混合库存、audit/mtime 状态推断、跨 CLI 去重/投影和旧打开/未读结论被 [Code-mode 权威重置](../../260807/claude-code-companion-authority-reset/spec.md#L1) revision 4 取代。当前状态是版本门禁 App 日志 + 唯一 Hook + `completedTurns` history、稳定 V2 unread/read-hint、App OAuth 动态额度和 EyPc 虚拟项目；App 元数据/审计观察只能作历史证据，不能恢复为当前需求。

RAW: [raw-requirement.md](raw-requirement.md#L1) · Plan: [plan.md](plan.md#L1)

状态：**历史 P0 采样记录**（2026-08-06）。当时的证据→状态映射与去重键见 [sampling.md](sampling.md#L1)；对应 mixed-desktop 领域模块已在 2026-08-07 权威重置中删除，不能作为当前代码入口。当前实现见 [Code-mode 权威重置](../../260807/claude-code-companion-authority-reset/spec.md#L1)。

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
