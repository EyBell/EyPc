# MQTT 记录模式与快捷键整合验证

## 已运行

- 2026-06-24 RED：`pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` 失败，覆盖旧 `Ctrl+Shift+L`、旧 `publish-records`、旧跳转条、缺失记录编辑草稿和固定 MQTT 搜索焦点。
- 2026-06-24 PASS：`pnpm exec vitest run tests/runtime/keybinding.test.ts tests/runtime/action.test.ts tests/ui/mqttPage.test.ts` 通过：`3 files / 105 tests`。
- 2026-06-24 PASS：`pnpm run test` 通过：`30 files / 224 tests`。
- 2026-06-24 PASS：`pnpm run typecheck` 通过。
- 2026-06-24 PASS：`pnpm run build` 通过，并完成 `vite build`、`scripts/prepare-utools-runtime.mjs`、`pnpm run validate:utools`。
- 2026-06-24 PASS：`python3 /Users/gdkmjd/work/czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/scripts/audit_code_links.py --root /Users/gdkmjd/work/czzWork/EyBell/EyPc vibe/specs/260624-eypc-mqtt-record-mode-consolidation vibe/specs/PROJECT_STATUS.md vibe/knowledge/ARCHITECTURE.md vibe/knowledge/technical-details.md` 通过：`Code link audit: OK`。

## 未验证

- MQTT live broker 手工 smoke 未执行。
- 宽屏/窄屏浏览器截图 smoke 尚未执行。
