# Global Quick Jump Verification

Tool: codex

## Red

- `CI=true pnpm run test -- --run tests/domain/quickJump.test.ts tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/ui/quickJump.test.ts`：本机 `pnpm` 首次安装阶段触发 esbuild build-script approval，未作为最终证据使用。
- `./node_modules/.bin/vitest run tests/domain/quickJump.test.ts tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/ui/quickJump.test.ts`：按 TDD 预期失败，暴露缺失 [../../../src/domain/quickJump.ts](../../../src/domain/quickJump.ts#L1)、缺失 App 浮层接入、缺失 `F` 默认快捷键、`role="textbox"` 未识别为编辑区。
- `./node_modules/.bin/vitest run tests/domain/quickJump.test.ts tests/ui/quickJump.test.ts`：按 TDD 预期失败，暴露多字母 marker 前缀输入后没有 `displayMarker` 剩余字母，且 [../../../src/components/QuickJumpLayer.vue](../../../src/components/QuickJumpLayer.vue#L1) 仍显示完整 marker。
- `./node_modules/.bin/vitest run tests/domain/quickJumpLayout.test.ts tests/ui/quickJump.test.ts`：按 TDD 预期失败，暴露缺失 [../../../src/domain/quickJumpLayout.ts](../../../src/domain/quickJumpLayout.ts#L1)、浮层仍用单点中心定位、且 App 未扫描可聚焦文本控件和语义命令目标。

## Pass

- `./node_modules/.bin/vitest run tests/domain/quickJump.test.ts tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/ui/quickJump.test.ts`：通过，4 个文件 / 45 个测试。
- `./node_modules/.bin/vue-tsc --noEmit`：通过。
- `./node_modules/.bin/vitest run`：通过，32 个文件 / 260 个测试。
- `./node_modules/.bin/vite build`：通过。
- `node scripts/validate-utools-runtime.mjs`：通过。
- `node scripts/prepare-utools-runtime.mjs && node scripts/validate-utools-runtime.mjs`：通过。
- `./node_modules/.bin/vitest run tests/ui/quickJump.test.ts`：目标中心基础上轻微上移、红紫主题透明彩色字样式、编辑区内部图标按钮可标记回归通过，1 个文件 / 3 个测试。
- `./node_modules/.bin/vue-tsc --noEmit`：中心定位调整后仍通过。
- `./node_modules/.bin/vitest run tests/ui/quickJump.test.ts tests/ui/mqttPage.test.ts`：行级记录目标和隐藏/裁剪按钮过滤回归通过，2 个文件 / 5 个测试。
- `./node_modules/.bin/vitest run tests/domain/quickJump.test.ts tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/ui/quickJump.test.ts tests/ui/mqttPage.test.ts`：Quick Jump 目标回归通过，5 个文件 / 48 个测试。
- `./node_modules/.bin/vitest run tests/ui/quickJump.test.ts tests/ui/mqttPage.test.ts`：行级 item 标记贴近标题右侧、标记视口夹取和不裁剪文本回归通过，2 个文件 / 6 个测试。
- `./node_modules/.bin/vitest run tests/domain/quickJump.test.ts tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/ui/quickJump.test.ts tests/ui/mqttPage.test.ts`：Quick Jump 标题锚点和目标过滤回归通过，5 个文件 / 49 个测试。
- `./node_modules/.bin/vue-tsc --noEmit`：标题锚点和浮层夹取类型检查通过。
- `./node_modules/.bin/vitest run tests/domain/quickJump.test.ts tests/ui/quickJump.test.ts`：多字母 marker 前缀消除回归通过，2 个文件 / 11 个测试。
- `./node_modules/.bin/vitest run tests/domain/quickJump.test.ts tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/ui/quickJump.test.ts tests/ui/mqttPage.test.ts`：Quick Jump 多字母前缀、编辑区、快捷键和 MQTT 目标回归通过，5 个文件 / 51 个测试。
- `./node_modules/.bin/vue-tsc --noEmit`：多字母 marker 前缀消除类型检查通过。
- `./node_modules/.bin/vitest run tests/domain/quickJumpLayout.test.ts tests/ui/quickJump.test.ts`：大目标内部空位、标记碰撞避让、视口夹取和文本控件覆盖回归通过，2 个文件 / 9 个测试。
- `./node_modules/.bin/vitest run tests/domain/quickJump.test.ts tests/domain/quickJumpLayout.test.ts tests/runtime/keyboardEvent.test.ts tests/runtime/keybinding.test.ts tests/ui/quickJump.test.ts tests/ui/mqttPage.test.ts`：Quick Jump 前缀、布局、编辑区、快捷键和 MQTT 目标回归通过，6 个文件 / 54 个测试。
- `./node_modules/.bin/vitest run`：通过，33 个文件 / 269 个测试；Node SQLite experimental warning 不影响退出码。
- `./node_modules/.bin/vite build`：通过。
- `python3 /Users/gdkmjd/work/czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/scripts/audit_code_links.py --root /Users/gdkmjd/work/czzWork/EyBell/EyPc vibe/specs/260626-eypc-global-quick-jump vibe/specs/PROJECT_STATUS.md vibe/knowledge/technical-details.md vibe/knowledge/developer-soul.md`：通过，`Code link audit: OK`。
- `node scripts/prepare-utools-runtime.mjs && node scripts/validate-utools-runtime.mjs`：通过，`uTools runtime assets prepared`，`uTools runtime validation passed`。

## Notes

- 最终验证使用本地 `node_modules/.bin` 命令，避免 `pnpm` 对 esbuild 构建脚本审批提示影响自动化证据。
- 本次未执行真实 uTools 宿主手动操作；覆盖范围为单元测试、类型检查、生产构建和 uTools runtime 文件校验。
