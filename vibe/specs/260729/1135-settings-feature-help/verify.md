# Verify: Settings feature help (MD)

Tool: codex

Status: `未校验，待用户验收`

## Implemented

- 六份用户 MD：ports / mqtt / favorites / windows / codex / settings。
- `getFeatureHelp` + `marked` 安全渲染。
- 设置 → 功能开关行「说明」→ `FeatureHelpDialog`。
- 文档规则 `EYPC-FEATURE-HELP-001`：新增 `AppTabId` / `FEATURES` 与用户可见行为变更必须同步 `src/help/guides/{id}.md`；`requiredFeatureHelpIds` / `missingFeatureHelpIds` 与 [featureHelpCoverage.test.ts](../../../../tests/unit/featureHelpCoverage.test.ts#L1) 覆盖契约。

## Local static check

- `pnpm exec vue-tsc --noEmit`：通过（实现时本地一次；非正式验收门禁）。
- 功能帮助覆盖单测：已添加，**未执行**（项目默认用户验收）。

## Not run / user-owned

- Vitest / production build / `validate:utools`
- 真实 uTools 打开设置页点击六份说明
- 420 窄宽弹层滚动与焦点回归
- Escape / backdrop 关闭与焦点恢复手测

## Content checklist (for user review)

- [ ] MQTT 说明含连接分组与 `Ctrl+G` / `Ctrl+N` 作用域提示
- [ ] Favorites 强调不删磁盘文件；默认关闭
- [ ] Windows / Codex 说明存在且平台边界合理
- [ ] Settings 含 Quick Jump `F` / 左右抽屉总览
- [ ] 六个按钮均可打开；MD 标题/列表/表格可读
- [ ] 规则文档 Feature Help Guides 与 `EYPC-FEATURE-HELP-001` 可追溯
