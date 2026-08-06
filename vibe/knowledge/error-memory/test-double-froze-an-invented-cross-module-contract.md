---
id: eypc-test-double-froze-an-invented-cross-module-contract
status: verified
scope: project
fingerprint: cross-module-call__hand-built-target-object__missing-discriminator-field__stub-returned-invented-outcome__integration-silently-always-failed
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - preload/claude/open.cjs
  - preload/windows/index.cjs
  - tests/platform/claudeBridge.test.ts
  - vibe/specs/260806/1130-claude-desktop-provider/verify.md
tags:
  - cross-module-contract
  - test-double
  - window-jump
  - claude-companion
  - silent-degradation
---

# Test Double Froze An Invented Cross-Module Contract

## Symptom

从卡片打开 Claude Code 会话时，**永远**是「在新终端 `claude --resume`」，从来不会聚焦已经开着的那个终端；因此「已完成未读」也永远得不到已读回执（回执只在确认聚焦后写）。8 项桥测试全绿，typecheck 全绿，build 全绿。

## Wrong Assumption

以为「聚焦不到就退回 resume」是运行时环境差异（AX 权限、终端不在清单里），属于兜底生效，不是缺陷。

## Verified Root Cause

调用方与被调方的契约**在两处同时对不上**，而两处都被测试桩掩盖：

1. `open.cjs` 用清单行里的字段**重新捏了一个对象**（`{kind, instanceId, nativeRef, pid}`）传给 `windows.activate`。窗口子系统第一行就是 `if (source.platform !== hostPlatform) return {outcome:'not-found'}` —— 手工对象没有 `platform`，于是任何主机上都必然 not-found。（`kind` 也是编的，真实参数名是 `mode`，只是默认值恰好正确才没暴露。）
2. 成功判定写成 `outcome === 'ok'`，而真实词表是 `activated | not-found | ambiguous | focus-denied | permission-required | unsupported | failed`（`parseWindowJson`/`parseActivationResult` 的白名单）。即便第 1 条修好，判定也仍然是 false。

测试桩 `activate: async () => ({ outcome: 'ok' })` 把这个**不存在的词**固化成了断言基准，于是「测试证明了实现符合一个从未存在过的契约」。

## Detection Order

1. 症状是「某条集成路径的兜底分支 100% 命中」——不是环境问题，先怀疑契约。
2. 在被调方**入口的守卫行**上读一遍：它拿 source 的哪些字段做准入？调用方是否原样传了整行？
3. 把被调方的返回词表 grep 出来（通常是一个 `includes([...])` 白名单），与调用方的比较值对照。
4. 看测试桩返回的值是否出现在那份词表里；**不在词表里的桩值是最强的信号**。

## Prevention Rule

- 跨模块传「目标对象」时**原样转发清单里的那一行**（`{...row, mode}`），不要挑字段重建；被调方常用调用方看不见的判别字段做准入。
- 测试桩的返回值必须来自被调方**真实词表**里的常量；写桩时先 grep 一次白名单。桩里出现自造词等于把测试变成同义反复。
- 对「有兜底路径」的集成，至少留一项断言**主路径确实被走过**（本次补的是「activate 收到的对象仍带 platform」），否则兜底会把失败吃干净。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | P4 接桌面端打开路线时发现；同批修复两处并补 3 项断言（platform 转发 / activated 词表 / 权限缺失与应用未运行的区分） |
