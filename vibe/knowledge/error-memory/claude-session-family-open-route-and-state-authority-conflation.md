---
id: eypc-claude-session-family-open-route-and-state-authority-conflation
status: verified
scope: project
fingerprint: claude-companion__app-session-families-and-identities-treated-as-interchangeable__resume-import-presented-as-exact-open__latest-event-and-byte-scan-presented-as-native-state__code-only-authority-reset-required
first_seen: 2026-08-07
last_verified: 2026-08-08
review_after: 2027-02-07
evidence:
  - vibe/specs/260807/claude-code-companion-authority-reset/research.md
  - preload/claude/code-sessions.cjs
  - preload/claude/app-state.cjs
  - preload/claude/events.cjs
  - preload/claude/unread.cjs
  - preload/claude/open.cjs
  - src/domain/claudeCode.ts
tags:
  - claude-companion
  - session-identity
  - deep-link
  - state-authority
  - unread
---

# Claude Session Family, Open Route, And State Authority Were Conflated

## Symptom

EyPc 同时出现五个表面问题：非 Code 会话进入卡片、空标题显示短 UUID、同一任务在状态组里冗余、点击历史会话产生导入副本、原生未读与 Fable/模型额度不完整。

这些不是五个互不相关的 UI 缺陷，而是一个共同的权威错误：把 Claude CLI session id、App local session id、Cowork/Code session family、导入式 deep link 和多个不完整状态来源当成可互换的“Claude 会话”。

## Wrong Assumption

- “桌面端记录”被误当成 Code-mode 库存，未先区分 `claude-code-sessions` 与 `local-agent-mode-sessions`。
- `cliSessionId` 被误当成唯一 App 行身份，忽略一个 CLI id 可能对应多个 `local_*` 包装行。
- “能够导航到 Epitaxy 页面”被误当成“精确打开已有行”，没有把 `resume -> importCliSession -> navigate` 的副作用作为验收条件。
- “App 内部有准确状态”被误推成“EyPc 有可用的公开订阅 API”。
- 最新 Hook 事件、文件增长和字节可见性被误当成完整 phase/unread 权威。

## Verified Root Cause

1. 已删除的旧 mixed-desktop reader 与领域投影读取 `local-agent-mode-sessions`，不是用户要求的 Code-only 元数据根；当前 [Code inventory](../../../preload/claude/code-sessions.cjs#L1) 只读 `claude-code-sessions`。
2. 旧标题投影在空标题时拼项目名和短 id，因此把内部身份泄漏到主标题；当前 [Claude Code domain](../../../src/domain/claudeCode.ts#L1) 使用固定人类可读回退。
3. 旧 reducer 每会话只留一个“最新事件”，普通 Stop→SessionEnd 会丢完成证据；后续 Hooks-only 又无法恢复 App 历史。当前 [App state](../../../preload/claude/app-state.cjs#L1) 只接受版本门禁 local-id 精确日志，[Hook reducer](../../../preload/claude/events.cjs#L1) 只作唯一关联 fallback，`completedTurns` 提供历史恢复。
4. 旧打开路线使用 `claude://resume`，其 handler 会先 import 再进入 Epitaxy；当前 [exact open](../../../preload/claude/open.cjs#L1) 缓存主 App 代次并用 latest-target-wins 只派发已有 local id 的 Epitaxy 路由。
5. 旧未读路线扫描原始字节，但 compacted/snappy LevelDB 不保证目标值可见；当前 [snapshot reader](../../../preload/claude/unread.cjs#L1) 只打开完整临时快照。
6. 动态 N-window 领域可以保留 Fable，但两窗口 App history 只是 partial patch；把它当完整来源会让第三窗口永远缺席或被抹掉。Claude Code 凭据又不是 Claude App 当前额度凭据，实机分别返回 401 与 200。
7. 点击精确历史只证明 deep-link 派发成功，不是 Claude 原生已读回执；完全拒绝会话级保护会让迟到的同轮 `unread=true` 覆盖 App 已经显示的已读。当前只对精确 `sessionId + completionEpoch` 建立可撤销进程内提示，并立即有界复核原生集合。
8. 旧 Hook fold 没有显式父 Turn 生命周期：`Stop` 虽先写入 completed，随后 `SubagentStop`、工具尾事件或 SessionEnd 尾部却会落入普通 activity 分支并把父任务恢复为 running。当前纯 reducer 只允许 `UserPromptSubmit` 开启 Turn；subagent start/stop 只更新活动水位，关闭后的同 Turn 尾事件不能复活。

## Detection Order

1. 先列出用户正在看的 Claude surface 和 session family；不要从一个泛称“桌面会话”开始设计。
2. 为每个来源列 identity、title、phase、unread、open target、quota 字段，禁止一列空缺时用另一来源的同名 id 猜。
3. 对 deep link 做**前后状态对照**：原 local id 是否相同、文件集合是否新增、CLI transcript 是否改写；只看“页面打开了”不算通过。
4. 对事件 reducer 回放普通序列而非单事件：Prompt→Stop→SubagentStop/PostTool/SessionEnd、新 Prompt 重启、Permission→tool、AskUserQuestion→answer；断言父 Turn 与子代理水位彼此独立。
5. 对 Chromium 数据用 compacted snapshot 验证；WAL 或 grep 命中只证明偶然可见。
6. 最后才接 Controller/UI，先用集合相交断言一张任务只能在一个桶。

## Prevention Rule

- Session family、identity、presentation、phase、unread、open 和 quota 各自声明唯一权威与 failure state；`unknown` 是合法结果。
- 私有 App 能力只有在固定版本/固定无内容 grammar 下才能作为 fail-closed 只读来源；私有 IPC 注入没有公开 external contract，不能成为生产依赖。
- 路线选择必须有反例测试：非目标 session 排除、重复 id 歧义、Stop→SessionEnd、compacted unread、no-clone open、两窗 patch 保三窗。
- 当前产品/架构/帮助只链接一份现行 Spec；旧任务在标题下声明 historical/superseded，不能继续以“已完成”口吻参与当前路由。

## Alternative Route

Status: `verified`

Preconditions:

- Claude App 仍提供 Code metadata 与 Epitaxy local route。
- 官方 Hooks 随 App Code 会话加载。
- uTools 自带的同宿主签名 LevelDB reader 仍可在实际 Electron 包内加载。

Ordered route:

1. Code metadata inventory + App title/local id.
2. Version-gated exact App log + parent-Turn Hook reducer + unique Hook fallback + `completedTurns` history priority; App terminal wins same-Turn Hook tail and only a strictly newer prompt Turn reactivates.
3. Complete LevelDB temporary snapshot + pre/post source fingerprint + exact Chromium-tagged target-key reader; failure→unknown.
4. Feature-lifetime independent inventory/state/unread/quota/presence lanes with source generation、Controller revision 与 Float applied revision 单调屏障。
5. Cached positive running proof + latest-target-wins exact Epitaxy local deep link; no fallback.
6. 成功精确派发后建立同 completion 的会话提示并在 0/100/300/1000ms 原生复读；失败不提示，新轮次撤销。
7. Explicitly authorized Claude App OAuth + Node HTTPS dynamic `limits[]` + non-destructive two-window patch + credential/Retry-After/backoff scheduling.
8. One Controller mutually exclusive projection、virtual project/provider projection and end-to-end publish SLO.

Verification and fallback:

- Follow [the strict local route](../../specs/260807/claude-code-companion-authority-reset/research.md#strict-local-test-route). Automated route, 30/30 actual-host unread reads with one real membership, ten-key no-clone comparison and live App OAuth Fable/reset data probe are recorded in [verify](../../specs/260807/claude-code-companion-authority-reset/verify.md#L1); EyPc click/removal/no-return/new-completion unread, controlled waiting transitions, project filters and final rendered quota comparison remain acceptance gates.
- A failed package, identity or host gate stops that component at `unknown/unavailable`. It never restores mixed inventory, resume/import, byte scan or one-event state.

Applicability boundary:

- Project-specific to EyPc's Claude App Code Companion. It does not define Codex state authority or a general uTools host rule.

## Occurrence History

| Date | Task | Trigger | Failed route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-07 | Claude Code Companion authority reset | User compared EyPc cards with Claude App Code UI and observed clone/status/title/scope/read drift | Mixed desktop + resume/import + latest event/Hooks-only + unstable snapshot + no same-completion hint + wrong quota credential/full refresh | Rebuilt versioned authorities, independent hot lanes, stable unread/read hint, virtual projects and App OAuth dynamic quota; ran automated/targeted gates | Core/data route verified; interactive unread/state/project/rendered-quota acceptance remains |
| 2026-08-08 | Claude old-task state correction | App 已完成且已读的旧任务在 EyPc 长期显示 running | Stop 后 SubagentStop/工具尾事件被普通 activity fold 当成父 Turn 新活动；点击打开也没有单项 state/unread 同步 | 抽取纯父 Turn reducer、集中来源选择/版本比较、state/unread singleflight，并新增 Claude-only 精确同步动作与成功打开后静默同步 | focused code tests passed; final type/bundle/runtime and live UI acceptance pending |
