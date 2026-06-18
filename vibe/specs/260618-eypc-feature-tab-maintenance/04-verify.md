# 功能 Tab 维护配置 Verify

## 自动验证

- `pnpm exec vitest run tests/domain/state.test.ts tests/integration/featureRouting.test.ts tests/runtime/action.test.ts tests/ui/settingsLayout.test.ts tests/ui/searchShortcutHints.test.ts tests/runtime/keybinding.test.ts`
  - Result: PASS, 6 files / 78 tests.
- `pnpm run typecheck`
  - Result: PASS.
- `pnpm run test`
  - Result: PASS, 17 files / 116 tests.
- `pnpm run build`
  - Result: PASS. Build completed, runtime assets prepared, bundled `validate:utools` passed.
- `pnpm run validate:utools`
  - Result: PASS.
- `python3 /Users/gdkmjd/work/czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/scripts/audit_code_links.py --root /Users/gdkmjd/work/czzWork/EyBell/EyPc vibe/specs/260618-eypc-feature-tab-maintenance vibe/specs/PROJECT_STATUS.md vibe/knowledge/ARCHITECTURE.md`
  - Result: PASS.

## 手动检查

- Local dev server: `127.0.0.1:8092` already had a Node listener; no process was killed or restarted.
- 待浏览器/插件界面确认：默认仅显示端口与设置 Tab；设置维护页可启用收藏、排序并保存。
