---
id: eypc-utools-window-target-auto-rebind-after-restart
status: superseded
scope: project
fingerprint: persisted-window-slot-native-ref-expires-after-restart__title-similarity-auto-rebinds-wrong-sibling
first_seen: 2026-07-29
last_verified: 2026-09-04
review_after: 2027-08-13
evidence:
  - src/domain/windows.ts
  - src/domain/state.ts
  - src/runtime/appRuntime.ts
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - windows
  - persistence
  - rebind
---

# Automatic Restart Rebinding (Historical; Superseded by WJ-19)

## Historical Failure

WJ-17 曾尝试用应用、标题历史、相似度和领先分数，在进程/窗口实例更换后自动恢复一个逻辑槽位。浏览器和 IDE 的多个相似兄弟窗口证明该推断不能安全代表用户意图；标题变化也不等于窗口身份变化。

## Current Prevention Rule

`WindowTarget` 是插件逻辑目标，`lastInstanceId` 只代表一次 OS 窗口生命周期。标题历史、相似度和任意同应用兄弟替换仍禁止。WJ-19 之后，多窗口或多条记录必须显式确认。

[RAW-208](../../specs/260904/window-unique-app-rebind/raw-requirement.md#L1) 收窄唯一候选禁令：同应用持久实例记录恰好一条、当前清单实时根恰好一个、旧 locator 已空或定点探测不是 `live` 时，允许原地写回 locator。macOS 上 `indeterminate` 不得挡住这条唯一换绑。macOS 清单保持 `partial`，不得用 complete 当门禁。不得恢复标题捷径，也不得把 Edge 里的 ChatGPT 标签当成 ChatGPT 应用。

- 状态：`superseded-by-WJ-19`，并由 RAW-208 再收窄回流门禁；仅保留为逻辑归档。
- 当前适用范围：持久真实主窗口根；WJ-22 会话子窗不参与换绑；槽位手动恢复只修改发起槽位；RAW-208 自动路径不新建替换目标。
- 回流门禁：不得恢复标题历史、相似度或任意同应用兄弟替换。不得在实时根 ≥2 或同应用记录 ≥2 时自动选。不得把 inventory 缺席当成死亡。不得在旧实例仍 `live` 时换绑。不得把标题相似的不同应用当成同一目标。
- 验收：关闭并重建一个**非唯一**槽位根，确认仍需人工确认、`Escape` 回原根、原生失败不提交换绑。单窗单记录且旧实例 gone 或 indeterminate 时允许原地换绑。Edge ChatGPT 标签不得绑到原生 ChatGPT。
