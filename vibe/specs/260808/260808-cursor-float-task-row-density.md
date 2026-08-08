# Float 任务行密度与悬浮立体块

- Baseline: 2026-08-08；范围：Companion 展开卡任务行 / 项目行视觉密度；状态：applied
- Scope: CSS-only in [float.css](../../../src/styles/float.css#L1)；不改交互契约、PRD、help guide

## 原始实现摘要（基线）

- 右侧「顶/隐/归/+」固定动作条宽 `102px`（4×24px），行右内边距与 `.task-open` gap 叠加后左侧标题/元信息偏挤。
- 后置 hover 规则将行悬浮阴影归零，立体抬起被取消；键盘 `.highlighted` 仍保留阴影。

## 相对基线的累计改动

1. 压缩动作条与行左右间距：按钮 `20×20`，动作条 `86px`，项目行 `padding-right: 95px` / `right: 2px`，任务行 `padding-right: 2px`、`gap: 3px`，`.task-open` `gap: 3px`、`padding: 3px 2px 3px 4px`；窄容器覆盖同步为 `95px` / `3px`。见 [float.css](../../../src/styles/float.css#L811)、[float.css](../../../src/styles/float.css#L851)、[float.css](../../../src/styles/float.css#L990)。
2. 恢复行悬浮立体块：focus 边框 + focus 色混背景 + `box-shadow: 0 5px 12px …` + `translateY(-1px)`；去掉 hover 归零；`.highlighted` / `:focus-visible` 同族抬起。见 [float.css](../../../src/styles/float.css#L815)、[float.css](../../../src/styles/float.css#L1120)。
3. `prefers-reduced-motion` 仍强制 `transform: none`；selected / provider tint hover 叠层保留。

## 影响与风险

- 左侧文案约多出 20–25px；短字按钮仍常显，触控粗指针下命中区略小但仍可点。
- 无 domain / runtime / 模板变更；help guide 无用户操作语义变化。

## 明确非目标

- 不改按钮文案、确认态、快捷键、drawer、Quick Jump
- 不隐藏或 hover 才展开动作条
- 不改 inbox / Tab / 搜索区整体布局

## 测试清单

- 正常流：任务行 / 项目行右侧按钮可读可点；标题截断减轻
- 边缘：窄容器（≤320 / ≤350）动作条与文案仍不重叠
- 权限：N/A
- 并发：N/A
- 回归：selected / highlighted / provider tint / reduced-motion 仍生效
- 验证命令：`pnpm exec vitest run tests/ui/codexCompanion.test.ts`
