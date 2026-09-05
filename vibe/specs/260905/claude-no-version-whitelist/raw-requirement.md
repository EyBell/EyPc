# RAW-211：取消 App 版本白名单准入

Tool: cursor · Date: 2026-09-05 · Level: Standard（需求）

spec_id: SPEC-260905-CLAUDE-NO-VERSION-WHITELIST

## 用户原话

> 不应该把版本当白名单限制
> 把所有的白名单都给取消限制

同日前置诊断：Claude App 自更新到 `1.46388.4` 后，「已完成未读」卡在 LevelDB 分钟刷盘；根因是 app-log 热未读车道把版本号当准入白名单 fail closed，而固定行式仍可解析。

## RAW-211

captured_at: 2026-09-05
state: active
text: >

  不应该把版本当白名单限制。把所有的白名单都给取消限制。

clarification_at: 2026-09-05
clarification: >

  取消的是用 Provider / Claude App **版本号**限制车道或能力的准入硬闸（当时还在限制的是 `preload/claude/app-state.cjs` 的 `SUPPORTED_APP_VERSIONS`）。不取消隐私字段允许名单、`LOCAL_SESSION_PATTERN`、Action argv 白名单、Cursor `sqlite3` 查询白名单、库存 Code-only / Cursor `agent|plan` 等身份与写入边界。准入只剩行式匹配：`parseAppStateLine` 命中才成为事件，失配丢弃；正文 / prompt 仍不得出模块。版本字符串只作诊断字段。

## 规范化需求

1. Claude App 日志热车道不得因 App 版本号 fail closed；`compatibility()` 恒为愿意走语法车道。
2. 删除 `SUPPORTED_APP_VERSION` / `SUPPORTED_APP_VERSIONS` 及其一切准入用途；archive 不得重新定义或引用该名单。
3. 行式失配、冷重放不得伪造 live running、归档二次确认与写前身份/phase/stat/hash 复核保持不变。
4. 不得把隐私字段允许名单、会话 id 形态、Action argv、sqlite 查询或库存 family 过滤器误当作本条要拆的「白名单」。

## 需求变更评审（Requirement Change Review）

`scanned_owners`：[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L244) Claude phase · [#L248](../../PRODUCT_REQUIREMENTS.md#L248) App state 版本门 · [RAW-013](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1) · [RAW-032](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1) · [RAW-168](../260810/1155-install-runtime-diagnostics/raw-requirement-next.draft.md#L27) · [EYPC-COMPANION 原生只读](../../rules/README.md#L54) · [claude-unread-decay](../../../knowledge/error-memory/claude-unread-decay-blocked-by-version-gate-and-minute-flush.md#L1) · [provider-version-whitelist](../../../knowledge/error-memory/provider-version-whitelist-must-not-gate-generic-capability.md#L1)

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| scoped-superseded | RAW-013 版本门禁措辞 | 路线仍是私有日志 + Hooks + 元数据 + LevelDB；去掉「版本门禁」准入 |
| scoped-superseded | RAW-032 未知版本 fail closed | 保留冷重放不得伪造 live running、归档二次确认与写前复核 |
| scoped-superseded | RAW-168 / RAW-170 版本 Set 单点 | 禁止再引入版本准入名单，不再把 Set 当校验层 |
| added | RAW-211 | 版本号不得限制车道；行式匹配才是准入 |

Conflict classification: `compatible-update`。Decision status: `explicit-current-request`。
