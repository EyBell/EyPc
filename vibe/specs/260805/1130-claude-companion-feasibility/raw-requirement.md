# RAW：Claude 版悬浮水球可行性调研

Tool: claude (Cowork)
Date: 2026-08-05
Documentation level: `standard`

## 用户原始诉求（2026-08-05）

1. 按项目 AI 规则完成初始化（vibe-rules-bootstrap）。
2. 了解 EyPc 项目核心逻辑，特别是 Codex 悬浮水球（Codex Companion Float）的实现逻辑。
3. 通过本机核验：Claude（用户口述 "cloud"）如何实现一个类似悬浮水球的功能——先联网调研业务逻辑是否可行，再本机实操核验。
4. 调研本身立为一个任务；若可行，再增加实现任务。

## 用户决策（同日确认）

- 调研文档同时记录两条路线：
  - 路线 A：监控 Claude Code CLI —— 实现任务按此方向立项。
  - 路线 B：监控 Claude Cowork 桌面任务 —— 标记为待观察，不立项。

## 本机前置事实

- 本机（kmmac）用户主目录下无 `~/.claude`（Claude Code CLI 未安装）；存在 `~/.codex`（Codex Companion 当前数据源）。
- `~/Library/Application Support` 属受保护位置，本会话无法读取 Cowork 桌面本地状态。

## 关联

- 调研结论与立项方案：[spec.md](spec.md#L1)
- Codex Companion 现行规范：[../../260718/1148-codex-quota-float/spec.md](../../260718/1148-codex-quota-float/spec.md#L1)
