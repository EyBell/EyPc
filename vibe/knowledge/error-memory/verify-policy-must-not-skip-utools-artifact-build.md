---
id: eypc-verify-policy-must-not-skip-utools-artifact-build
status: verified
scope: project
fingerprint: src-or-float-change-only-in-workspace__agent-skips-pnpm-build-citing-no-full-suite-default__user-repacks-stale-dist-and-sees-no-effect
first_seen: 2026-09-04
last_verified: 2026-09-04
review_after: 2027-03-04
evidence:
  - user-corrected
  - vibe/rules/documentation.md
  - vibe/rules/README.md
  - dist/runtime-identity.cjs
tags:
  - utools
  - packaging
  - verification
  - process
  - float-window
---

# 不得用「不全量验证」跳过 uTools 产物构建

## Symptom

改了悬浮窗源码（图钉倾斜），用户按自己的习惯重新打包安装后仍是旧画面。工作区 `src/` 已含新 CSS/内联旋转，当时磁盘 `dist/` 仍是更早一次构建（金色图钉、无 `-45deg`）。

## Wrong Assumption

把 [EYPC-VERIFY-001](../../rules/README.md#L45)「不要默认跑仓库级 `test/typecheck/build/verify`」读成「每轮都不要 `pnpm run build`」。于是实现收尾只跑聚焦单测，等用户点了「构建」才打包。

## Verified Root Cause

两条门禁管的不是同一件事：

- **验证范围**：聚焦测试；仓库级套件要有独立升级触发。禁止默认启动 uTools / serve。
- **产物真值**：[Build And Core Version Sync](../../rules/documentation.md#L49) 与 [EYPC-VERSION-001](../../rules/README.md#L46)：凡改 `src/`、`preload/`、`contracts/`、`public/` 镜像或 Vite 边界的迭代，收尾前必须 `pnpm run build`，再 `--write-current-truth`，并提醒用户重新接入或安装新包。

用户无开发服务、只走打包安装时，Agent 不构建 = 用户只能把旧 `dist` 再打一遍。关悬浮球、重载插件都不能把源码变成果。

## Correct Detection Order

1. 本轮是否改了会进 uTools 的 Renderer/Preload/合同输入。
2. 是则先 `pnpm run build`，再对照 `dist/float.html` / 资源哈希 / `builtAt` 是否新于改动。
3. 再提醒用户安装新包、结束后台、隐藏后再显示悬浮球。
4. 不要用「验证政策禁止全量」来跳过第 2 步。

## Prevention Rule

实现/修复触及生产产物时，**同一轮代跑** `pnpm run build` 与 `node scripts/validate-requirements.mjs --write-current-truth`。`EYPC-VERIFY-001` 仍禁止默认全量测试和擅自开 uTools；它不禁止、也不替代产物构建。Agent 不能替用户点 uTools「打包/安装」；能做的是先把 `dist/` 变成当前源码。

## Latest Applicable Implementation

- 门禁正文：[documentation.md](../../rules/documentation.md#L49)
- 验证政策：[README.md](../../rules/README.md#L45)
- 本次已构建产物：`host-edcd2c98f4eba4fc19c3` / `renderer-5043268b392f3882fb89` · `2026/09/04 10:22:23` · `artifact-ready`

## Alternative Route

- Status: `verified`（2026-09-04，用户确认无开发服务、走打包安装；同轮 `pnpm run build` 已把斜钉打进 `dist/assets/float-*`）。
- Preconditions: 本轮改了会进入 `dist/` 的源。
- Steps: build → write-current-truth → 把四元组交给用户去安装新包并重建悬浮窗。
- Verification: 新 `float-DjWeqlSH.css` / `float-BbtCQpcX.js` 含 `action-pin-glyph` 与 `rotate(-45deg)`；`builtAtLocal` 为 `2026/09/04 10:22:23`。
- Applicability boundary: EyPc 生产/uTools 产物迭代；不含纯文档且不碰 `src/preload/contracts` 的轮次。
- Fallback: 若构建未跑完，收尾必须写明未同步，不得让用户以为重载即可。

## Occurrence History

| 日期 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-09-04 | 用户问为何每轮不自动打包 | 钉图标多轮只改源码+单测 | 用户选 F-1-a 后补 `pnpm run build` | 产物已新；安装与重建悬浮窗仍是宿主步骤 |
