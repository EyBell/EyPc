# MQTT Record Time Order Verification

Tool: codex

## RED

- Command: `pnpm exec vitest run tests/domain/mqtt.test.ts --testNamePattern "operation time|publish templates"`.
- Result: failed as expected before implementation because templates were sorted by `updatedAt`, so `['edited', 'old', 'used']` was returned instead of `['used', 'edited', 'old']`.
- Command: `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "orders MQTT message and publish record lists"`.
- Result: failed as expected before implementation because ordinary message rows returned `['old-in', 'new-in']` instead of newest-first `['new-in', 'old-in']`.

## PASS

- Command: `pnpm exec vitest run tests/domain/mqtt.test.ts --testNamePattern "operation time|publish templates"`.
- Result: passed, 2 tests passed.
- Command: `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "orders MQTT message and publish record lists"`.
- Result: passed, 1 test passed.
- Command: `pnpm exec vitest run tests/domain/mqtt.test.ts`.
- Result: passed, 12 tests passed.
- Command: `pnpm exec vitest run tests/runtime/action.test.ts --testNamePattern "MQTT|mqtt"`.
- Result: passed, 26 tests passed.
- Command: `pnpm exec vitest run tests/platform/mqttSqlitePreload.test.ts tests/platform/eypcPlatform.test.ts`.
- Result: passed, 10 tests passed.
- Command: `pnpm exec vitest run tests/ui/mqttPage.test.ts`.
- Result: passed, 1 test passed.

## Project Gates

- Command: `pnpm run test`.
- Result: passed, 30 files passed and 245 tests passed.
- Command: `pnpm run typecheck`.
- Result: passed.
- Command: `pnpm run build`.
- Result: passed. Vite build, `prepare-utools-runtime`, and `validate:utools` completed.
