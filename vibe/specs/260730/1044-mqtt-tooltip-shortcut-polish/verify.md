# Verify

Tool: codex
Date: 2026-07-30

## Automated

未代跑。契约已写入：

- `tests/ui/mqttPage.test.ts` — 图标/title/抽屉 kbd fallback
- `tests/runtime/keybinding.test.ts` — 新默认绑定与 options/log/repeatSend rows
- `tests/runtime/action.test.ts` — config 抽屉删除 command；消息抽屉 shortcutLabel 以 `c-N` 开头

建议用户侧：`pnpm exec vitest run tests/ui/mqttPage.test.ts tests/runtime/keybinding.test.ts tests/runtime/action.test.ts`

## Manual / User-owned

- MQTT Tab 悬停区分预览/详情/快捷操作/别名/完整编辑/发送选项
- 快捷操作抽屉 `kbd` 以 `c-1…9` 为主，无大量「未绑定」
- `Ctrl+Shift+Enter` / `Ctrl+Shift+L` / `Ctrl+Shift+O` 在对应焦点下可用

**Status:** 未校验，待用户验收
