---
id: eypc-capability-gap-asserted-without-reading-the-shipped-app
status: verified
scope: project
fingerprint: third-party-capability-declared-missing__source-was-external-claim-not-the-installed-binary__gap-hardened-into-comments-specs-help-and-a-design-decision__inspecting-the-app-bundle-found-the-capability-shipped
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - preload/claude/open.cjs
  - vibe/specs/260806/2147-claude-open-in-desktop-app/raw-requirement.md
tags:
  - external-dependency
  - evidence
  - capability-probe
  - design-decision
---

# A Capability Gap Asserted Without Reading the Shipped App

## Symptom

Claude 桌面端会话的「打开」只能把 App 前置，再让用户自己在界面里找那条会话——因为
「桌面端没有按 sessionId 打开的深链」。这条结论被写进了五处：

- [preload/claude/open.cjs](../../../preload/claude/open.cjs#L1) 的模块注释
- 1130 的 [raw](../../specs/260806/1130-claude-desktop-provider/raw-requirement.md#L1) / [spec](../../specs/260806/1130-claude-desktop-provider/spec.md#L1)
- 1130 的[设计偏好回执](../../specs/260806/1130-claude-desktop-provider/design-preference-receipt.md#L1)（"AX 只能把 App 前置，无法证明用户看到了那条会话"整条推理建立在它之上）
- 用户可见的[功能说明](../../../src/help/guides/codex.md#L1)（"等上游补上按会话打开的深链后会直接切换过去"）
- 1150 的 verify，作为"退路是复用 Window Jump 的 AX 窗口激活"的依据

用户提出"我不希望通过 CLI 形式打开"后去核对安装包，深链一直都在。

## Wrong Assumption

**把外部说法当成能力探测的结论。** 依据是当时的上游 issue 与文档措辞（`claude://cowork/`
只有 `new`），而不是本机装着的那个 App。措辞恰好是对的——`cowork` host 确实只有 `new`；
错的是由此推出"整个 scheme 没有按会话打开的能力"。真正的入口在**另一个 host** 上。

## Verified Root Cause

`/Applications/Claude.app`（1.25927.0）`Contents/Resources/app.asar` 的 `claudeURLHandler`
按 `url.host` 分派，`cowork` 与 `resume` 是**并列的两个 host**：

```js
case Xa.Cowork: { if (l.pathname !== `/new`) return false; ... }   // 只有 new，说法没错
case Ya.Resume: {                                                  // 但它旁边就是这个
  let e = l.searchParams.get(`session`)
  return e && b.test(e)                                            // 严格 UUID
    ? (LocalSessionManager.importCliSession(e).then(n => navigate(`/epitaxy/${n}`)), true)
    : false
}
```

只查了 `cowork` 分支的能力，就给整个 scheme 下了结论。

## Cost

一条"用户得自己在 App 里找会话"的降级体验、一份为它写的设计回执、一段写进用户帮助的
"等上游"承诺，外加把打开路线拆成 CLI/桌面端两套分支的实现复杂度。全部可以在 1130 立项时
用一次 `strings app.asar | grep 'claude://'` 避免。

## Rule

**第三方能力"没有"这种结论，只能由被安装的那个产物证明。** 外部 issue、文档措辞、上游
回复都只是线索。落地前必须：

1. 读装在本机的那份产物（`.asar` / 二进制 / `Info.plist` 的 `CFBundleURLTypes`），不是读别人对它的描述；
2. 穷举**同级分派点**——一个 host / 命令 / 路由不支持，不代表兄弟分派点不支持；
3. 把"结论来自哪个版本的哪个产物"写进记录。深链是外部依赖不是稳定接口，
   1.25927.0 成立不等于下个版本成立。

一条"某能力不存在"的结论一旦被写进注释、spec、偏好回执和用户帮助，就会被后续每一轮当成
既定前提复述，没人再回去验它。所以它落地时的取证标准要比"能力存在"更高，不是更低。
