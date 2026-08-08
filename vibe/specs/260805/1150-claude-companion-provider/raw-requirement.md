# RAW：Claude CLI 模块融合进 Codex 水球（claude-companion-provider）

Tool: claude (Cowork)
Date: 2026-08-05
Documentation level: `controlled`（计划阶段先产出 raw/spec/plan/tasks；verify 随实现建立）

Feasibility source: [../1130-claude-companion-feasibility/spec.md](../1130-claude-companion-feasibility/spec.md#L1)

## 用户原始诉求（2026-08-05，语音转写整理）

新增一个完整抽取的 Claude CLI 模块，融合到现有 Codex 水球中。任务上可区分来源（Codex / Claude），但展示形式做汇总融合；跳转按各自 provider 自身逻辑执行。核心要求：

1. **核心排布与角标**：任务排布和角标数字，核心以状态为准（跨 provider 按状态合并，不按来源分列统计）。
2. **跳转逻辑**：跳转根据 EyPc 插件本身的循环逻辑执行（沿用现有前后任务循环框架）。
3. **排列分布**：
   - (a) “上一个/下一个”任务循环，层内优先按 Codex / Claude 分组遍历；
   - (b) 循环时避免“一会儿上、一会儿下”（顺序必须稳定、单调，不因新事件在游标附近重排）。
4. **卡片内部展示**：每行只需一个明显的**底部来源标记位**；列表显示顺序**不**按 Codex/Claude 分组。

## 当轮追问决策（同日用户确认）

- **水球收起态额度映射**：外层圆环进度表示 Codex，球心百分比数字表示 Claude。
- **直接打开动作顺序（历史决策）**：当时要求“打开第一条待输入”等直接动作跟随 provider 分组循环序；RAW-149 已明确取代两个专用 attention 入口，当前改为跨 Provider 状态时间倒序与持久化未打开进度。通用“上一个/下一个”仍保留本任务确定的循环序。

## 补充诉求（2026-08-05 同日追加）

- 未连接/未启用 Claude 时，球心百分比保持原样（现行 Codex 语义），做到**插件兼容效果**：老用户零感知。
- 水球配置中 Codex 与 Claude **各自可选择是否启用**：可单独独占水球，也可共享水球。
- 架构必须设计为**两个分离的 provider 模块 + 一个汇总层**，以类似接口的形式组织（统一 provider 接口，聚合层消费接口）。

## 术语与前置

- 用户术语：**cloud = Claude**（全局约定，已入项目记忆）。
- 前置条件（用户自办，进行中）：本机安装并登录 Claude Code CLI。
- 前置确认（实现时）：hooks / statusline 注册需写 `~/.claude/settings.json`，属一次性安装写入，写前向用户确认。

## 关联

- 行为规范：[spec.md](spec.md#L1)
- 实施计划：[plan.md](plan.md#L1)
- 任务分解：[tasks.md](tasks.md#L1)
- Codex Companion 现行规范（融合基线）：[../../260718/1148-codex-quota-float/spec.md](../../260718/1148-codex-quota-float/spec.md#L1)
