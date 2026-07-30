# Verify

Tool: codex
Date: 2026-07-30

## Automated

局部已跑：`tests/ui/operationTooltip.test.ts` 7/7 通过（含 native title 快捷键解析）。

`tests/ui/mqttPage.test.ts` 仍有与本次无关的 CSS 契约漂移断言未全部绿；本次已把按钮提示断言改为 `commandTooltip` / `plainTooltip`。

另：`tests/runtime/keybinding.test.ts`、`tests/runtime/action.test.ts` 未在本轮复跑。

## Manual / User-owned

- MQTT Tab 悬停图标应出现产品 Tooltip（文案 + 快捷键 kbd），无需按住 Ctrl
- 预览/详情/快捷操作/别名/完整编辑/发送选项文案可区分
- 快捷操作抽屉 `kbd` 以 `c-1…9` 为主
- `Ctrl+Shift+Enter` / `Ctrl+Shift+L` / `Ctrl+Shift+O` 在对应焦点下可用

**Status:** 未校验，待用户验收（请刷新/重载插件后再试悬停）
