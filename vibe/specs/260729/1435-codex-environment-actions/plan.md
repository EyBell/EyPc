# Plan: Codex Environment Action 快捷槽

Tool: codex

Date: 2026-07-29

## Approach

- Preload 只读解析 `.codex/environments/*.toml`，host 侧保存 command；Float/Renderer 仅收安全投影。
- `superseded-by-Codex-RAW-114`: Float 不再通过 transient IPC 维护 list/run/session 状态，也不渲染 `float-quota-text` 后的五槽 UI。
- `Ctrl+Shift+1..5` 仍避开抽屉 `Ctrl+1..9`，但只派发既有 Controller action；目标、Environment 选择、风险确认与运行消息由 Controller/Host 单一路径负责。

## Boundaries

- 不调用 Codex 原生 Action API。
- 不回显路径/命令/PID。
- Setup 不进可执行槽；不静默重跑。
