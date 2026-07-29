# RAW: Codex Environment Action 快捷槽

Tool: codex

Date: 2026-07-29

## Request

在 Codex 悬浮展开面板额度 Time 下方增加固定 5 个 Action 全局快捷键卡槽：读取项目 `.codex/environments/*.toml`，由 EyPc 在准确项目 cwd 等价执行命令（非 Codex App 顶栏原生 Action）。

## Confirmed scope

1. 目标：选中/聚焦任务或项目优先；可选配置 Action 默认项目；不配置则回退悬浮卡「项目」Tab 最近焦点；再否则以置顶/最近项目为候选。
2. 多 Environment：默认第一个，键盘可选；Setup 只展示不执行；Git Push 二次确认；Serve 管理长驻会话。
3. 项目 Tab 切换与候选层共存；路径/命令不进入 Renderer。

## Acceptance intent

- Time 下可见 5 槽；`Ctrl+Shift+1..5` 可触发。
- 置顶项目自动进入候选；无目标时键盘可选项目。
- 多 env 时弹出选择层；单 env 静默。
- Push 无确认被拒绝；Setup 不可执行；Serve 可启停状态可见。

## 2026-07-29 User Correction

- `superseded-by-Codex-RAW-114`: 展开 Codex 浮窗不再显示 Actions/Environment 五槽、项目/Environment 选择层或 Setup 提示；原“Time 下可见 5 槽”验收项失效。
- 五个 uTools 全局 Action 功能、Controller 统一目标选择、Host TOML 读取/等价执行、Setup 禁止、Serve 会话与 Git Push 二次确认继续有效。Float 若收到卡内 `Ctrl+Shift+1…5` 命令，只转发同一 Controller action，不维护独立执行状态。
