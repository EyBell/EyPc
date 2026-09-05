# RAW-209：插件与 Codex APP 归档双向实时收起

Tool: cursor · Date: 2026-09-05 · Level: Standard（需求）

spec_id: SPEC-260905-COMPANION-STATUS-ARCHIVE-SYNC

## 用户原话

> 当前codex上面的这个归档已经执行通路了 双方都可以执行通
> 当天所有的代码更新进行提交 , 文档要进行同步 相关的设计规则 编号 喜好要进行抽取更新 放到合适的结构目录

同日双轨原话（归档轨）：插件归档曾实时进 Codex APP 侧栏，后来不再同步；截图里的 Cloud Code 行不是归档通路。归档是 Codex Companion → Codex APP。

## RAW-209

captured_at: 2026-09-05
state: active
text: >

  插件对额外进程（含未命名会话）点归档，必须真实到达 CodexHost，并实时收起 Codex APP 侧栏；从 Codex APP 归档同一会话，Host / 插件也必须跟上。双方都可以执行通。

clarification_at: 2026-09-05
clarification: >

  2026-09-05 用户 F-1-a：当前 Codex 上该归档通路双方都可执行通（插件 → APP、APP → 插件/Host）。本条细化 RAW-199：别名钉住 `codexhostExternal`；官方 `protocol-error` 且 Host `thread read` 成功则改道 Host；Host 列表核验-1 后补发 companion `thread-archived`；Host 车道不等原生 ACK；Host 托管 Desktop 时原生车道 ACK 超时不得整单失败。Claude D′ `isArchived` 仍不扇出到 Host。

## 规范化需求

1. 额外进程归档走 Host 委派 CLI（read 预检 / archive 写入 / live+archived 列表双核验），官方 app-server 不得作为这些 id 的写面。
2. `codexhostExternal` 必须钉在库存别名上；会合点清空花名册后仍不得掉进官方预检。
3. 官方 `thread/read` 得到 `protocol-error` 且 Host `thread read` 成功时，改道 Host 车道，禁止停在预检。
4. Host 第一次列表核验通过后补发 Desktop companion `thread-archived`，实时收起 Codex APP 侧栏；Host 车道仍不等原生 ACK。
5. Host 托管 Desktop 时，原生车道两次库存已证归档则 ACK 超时记 `not-required`，不得整单 indeterminate。
6. Claude 原生 D′ 归档只写本机 `local_*.json` `isArchived`，不得扇出到 CodexHost / Codex APP。运行中 Host 任务仍不得归档。

# RAW-210：Cloud Code 唯一 live Hook 不被历史完成态盖掉

captured_at: 2026-09-05
state: active
text: >

  Cloud Code 本机行在 Claude App 侧栏仍开着、仍是进行中时，插件不得只因元数据 `completedTurns > 0` / `lastActivityAt` 把它打成已完成。

clarification_at: 2026-09-05
clarification: >

  同日双轨的状态轨。唯一关联（`direct-local` / `unique-cli`）的 live Hook 与 App live-append 同类：不得被未递增的 `completedTurns` 或冷启动 `lastActivityAt` 退休。history 只能在 `completedTurns` 相对 previous 增加、且完成水位晚于该 Hook `turnStartedAt` 时退休旧 Turn。无 Hook 的历史 completed 恢复不变。本条 2026-09-05 仅聚焦自动化核验；F-1-a 确认的是归档双向，不是 Cloud Code 相位真机。

## 规范化需求

1. 唯一关联 live Hook 的 running/waiting 压过未递增的 `completedTurns` 与 `lastActivityAt` 代理完成。
2. 仅当 `completedTurns` 相对 previous 增加且历史水位晚于该 Hook `turnStartedAt` 时，history 可退休该 unique live Hook。
3. 无 Hook、或 Hook 非唯一关联时，既有 `completedTurns > 0` 历史 completed 恢复不变。
4. 本条不改变未读、归档资格、或 Claude D′ 写入边界。

## 需求变更评审（Requirement Change Review）

`scanned_owners`：[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L244) Claude phase · [#L284](../../PRODUCT_REQUIREMENTS.md#L284) Codex archive · [#L307](../../PRODUCT_REQUIREMENTS.md#L307) 额外进程归档 · [RAW-199](../260901/codexhost-external-completion/raw-requirement.md#L76) · [EYPC-COMPANION-STATE-SOURCE-001](../../rules/README.md#L70) · [codexhost-external-threads-invisible-to-official-surfaces](../../../knowledge/error-memory/codexhost-external-threads-invisible-to-official-surfaces.md#L1) · [claude-metadata-activity-is-not-completion-evidence](../../../knowledge/error-memory/claude-metadata-activity-is-not-completion-evidence.md#L1)

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| refined | RAW-199 Host 归档通道 | 补实时 companion 通知、别名钉死、protocol-error 改道、Host Desktop ACK 不 fail-closed；用户 F-1-a 双向真机 |
| added | RAW-209 双向实时收起 | 插件 ↔ Codex APP 对额外进程归档都要通；Claude D′ 仍不扇出 Host |
| added | RAW-210 unique live Hook | `completedTurns` / `lastActivityAt` 不得退休当前 Turn 的唯一 live Hook |
| unchanged | RAW-200 side 级联 | Codex/CLI 归档主对话仍由 Host 级联 side；本条不改 Host 仓库 |
| unchanged | Claude D′ 原生侧栏 | 成功只确认 EyPc 收敛；原生侧栏同步仍不受支持 |

Conflict classification: `compatible-update`。Decision status: `explicit-current-request`（F-1-a 归档双向；状态轨保持既有用户截图原话，真机相位仍 host-pending）。
