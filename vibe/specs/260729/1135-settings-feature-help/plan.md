# Plan: Settings feature help (MD)

Tool: codex

## Approach

1. 核验 PRD 相对源码漂移后撰写 `src/help/guides/*.md`。
2. Vite `import.meta.glob('*.md', { query: '?raw', eager: true })` 构建期嵌入。
3. `marked` 安全渲染（转义 raw HTML，仅允许 http/https/mailto 链接）。
4. `FeatureHelpDialog` + 功能开关行「说明」按钮。

## Delivery files

- [src/help/guides/](../../../../src/help/guides/)
- [src/help/markdown.ts](../../../../src/help/markdown.ts#L1)
- [src/components/FeatureHelpDialog.vue](../../../../src/components/FeatureHelpDialog.vue#L1)
- [src/pages/SettingsPage.vue](../../../../src/pages/SettingsPage.vue#L1)
- [src/styles/app.css](../../../../src/styles/app.css#L1)
- Rules: [documentation.md Feature Help Guides](../../../rules/documentation.md#feature-help-guides-required) · `EYPC-FEATURE-HELP-001` in [rules/README.md](../../../rules/README.md#L1)
- Coverage contract: [tests/unit/featureHelpCoverage.test.ts](../../../../tests/unit/featureHelpCoverage.test.ts#L1)

## PRD corrections applied in user guides

| Topic | PRD / storefront | User guide authority |
| --- | --- | --- |
| MQTT 连接树分组 | PRD MQTT 节缺失；`utools-插件说明.md` 亦缺失 | 以 `MqttPage` + `260627-eypc-mqtt-connection-tree` 为准写入 |
| 窗口跳转 / Codex | 商店说明缺失 | 以 1527 / 1148 Spec + 页面为准写入 |
| Codex prev/next 池 | 部分 UI title 文案含已完成未读 | 用户说明按 PROJECT_STATUS / Spec：普通池为待输入 + 近六小时进行中，已完成未读单独动作 |
| Favorites 默认关闭 | registry `enabled: false` | 用户说明写明默认关闭 |
| 通用 Quick Jump / 左右抽屉 | Shared Interaction Surfaces | 写入设置篇，其它篇交叉引用 |

本任务**不回写** PRODUCT_REQUIREMENTS；仅保证用户 MD 与代码一致。
