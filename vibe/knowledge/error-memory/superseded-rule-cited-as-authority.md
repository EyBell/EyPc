---
id: eypc-superseded-rule-cited-as-authority
status: verified
scope: project
fingerprint: soul-entry-quoted-as-current__product-requirements-superseded-it__no-supersession-search-performed__review-finding-wrongly-overturned__wrong-conclusion-written-into-docs-and-help
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - vibe/knowledge/developer-soul.md
  - vibe/specs/PRODUCT_REQUIREMENTS.md
  - vibe/specs/260806/1130-claude-desktop-provider/design-preference-receipt.md
  - src/help/guides/codex.md
tags:
  - rules
  - supersession
  - review-process
  - authority-order
---

# A Superseded Rule Cited As Authority

## Symptom

一条对抗复核结论（「桌面卡永远无法置已读 → 完成未读角标只增不减」）被**否决**，理由是它与
`developer-soul.md:64/70` 的「无独立确认控件 / 隐藏即推进已读」冲突。用户据此拍板不做。
结论、理由与一条错误的事实断言随后被写进 `verify.md`、设计偏好回执**和面向用户的帮助文档**。

复核结论其实是对的。

## Wrong Assumption

把 `developer-soul.md` 当成常青权威，引用时**没有反查它是否已被更新的需求取代**。

## Verified Root Cause

三层错误叠加，每层都可以单独避免：

1. **未做取代检索**。`PRODUCT_REQUIREMENTS.md:123` 一句话就写着
   `RAW-083/…/128/134/136/138/139 supersede the preceding … acknowledgement clauses`，
   `:174` 直接写 `hide/restore remains unrelated`。soul 那两条是 2026-07-18/07-20，
   产品需求版本是 2026-08-03.1。**只要按权威顺序查一次就能发现。**
2. **事实断言靠读代码而非跑代码**。同时断言「隐藏即减角标」，实际
   `codexPresentation.ts:159-160` 的 compact 未读 =
   `completedUnread.length + hidden.filter(bucket==='completed-unread').length`，
   `PRODUCT_REQUIREMENTS.md:122` 明写 `including hidden tasks`——隐藏的完成未读卡**要**算进角标。
3. **错误结论下沉到了用户可见文档**。帮助文档里写了「隐藏一条已完成未读就等于把它读掉了」，
   这是直接教错用户。

## Detection Order

1. 引用任何 `developer-soul.md` 条款前，在 `PRODUCT_REQUIREMENTS.md` 里搜该主题关键词
   （本例：`acknowledg` / `hide` / `unread`），看有没有 `supersede` 字样或更新的 RAW 编号。
2. 比日期：soul 条目自带日期，`PRODUCT_REQUIREMENTS.md` 顶部有 requirement version。
3. 任何「A 即等于 B」的行为断言，**跑一遍**再写。读代码得出的结论只能叫假设。

## Prevention Rule

**权威顺序固定为：平台/安全 > 用户当前请求 > `PRODUCT_REQUIREMENTS.md`（最新版本）>
任务级 spec/raw > `developer-soul.md` > CodeNote master > 工具输出。**
soul 描述口味，需求描述契约；两者冲突时以需求为准。

**更新或引用全局规则时，必须先检索既有的相似需求**；发现冲突要**提示用户并默认以最新的为主**，
不能默默选一条照搬。发现失效条款要**就地标注 superseded 并链到取代它的条款**（本次已对
soul:64/70 这么做），而不是留着让下一个人再踩。

**推翻他人（含子代理）的结论，举证门槛高于提出结论。** 否决一条复核发现前，其事实前提必须
有可执行证据，不能只有代码阅读。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：用户质疑「角标消失逻辑」后逐条实跑，两条否决理由全部证伪；soul:64/70 就地标注失效，verify/回执/帮助文档三处更正，桌面卡改按 Codex 的 `unreadKnown === false → completed` 通路落地 |
