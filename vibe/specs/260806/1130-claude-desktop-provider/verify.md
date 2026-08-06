# Verify：Claude 桌面端 provider

> **P4 的打开路线已于 2026-08-06 被取代。** 当时「桌面端没有按 sessionId 打开的深链」的前提不成立——见 [2147 raw](../2147-claude-open-in-desktop-app/raw-requirement.md#L1) / [verify](../2147-claude-open-in-desktop-app/verify.md#L1)。本文件中「前置 App + 提示会话名」「点终端会话应聚焦而非新开」等条目仅作历史记录，不再是当前行为。

状态：P0 + P1-1 完成（automated-verified）；P1-2 起等 favorites 在途轮落地。

## P1-1 + P1-2（2026-08-06，Cowork 沙箱独立 pnpm install 环境）

| 项 | 结果 |
| --- | --- |
| `tests/domain/claudeDesktop.test.ts` | 27/27（元数据/审计行隐私归一、正文字段不存活断言、事件优先状态机全分支、脉冲兜底、去重集合、项目归属/显示名、卡片合同、通道合并） |
| `tests/domain` 全量 | 328/328 |
| `vue-tsc` | 与 HEAD 基线一致（4 处既有错属 favorites 在途），零新增 |
| 零冲突承诺 | 全程仅新增 `src/domain/claudeDesktop.ts` + `tests/domain/claudeDesktop.test.ts`，未触碰任何既有源文件 |
| 零差异合同 | `combineClaudeLaneCards` 无桌面来源时**按引用**返回 CLI 数组（测试断言 `toBe`） |

## P2（2026-08-06，同一沙箱环境）

| 项 | 结果 |
| --- | --- |
| `tests/platform/claudeDesktopBridge.test.ts` | 7/7（带空格 fixture 路径、白名单防泄漏断言、result/permission/rate-limit 尾摘要、撕裂行容错、窗口门控、watch 起停、facade 挂载） |
| claude 平台套件 + domain 全量 | 409/409 |
| `vue-tsc` | 与基线一致，零新增 |
| `vite build` + prepare + `validate-utools-runtime` | 通过；validator 新增 `readDesktopSnapshot`/`watchDesktopSessions` 端口断言、空根降级断言、只读断言（无 write/rename/unlink） |
| public 镜像 | `sync-utools-preloads` 后 `diff -q` 无差异（含新 desktop.cjs） |
| 错误归档 | 打包清单漏项被 validator 拦截 → [new-preload-module-missing-from-packaging-manifest](../../../knowledge/error-memory/new-preload-module-missing-from-packaging-manifest.md#L1) |

本阶段触碰的既有文件：`preload/claude/index.cjs`、`scripts/validate-utools-runtime.mjs`、`scripts/utools-preload-assets.mjs`（均不在 favorites 冲突面）+ `src/platform/eypcPlatform.ts`（冲突面文件，仅可选类型外科追加，动手前已重取基线）。

## P3（2026-08-06，同一沙箱环境）

| 项 | 结果 |
| --- | --- |
| `tests/runtime/claudeCompanionController.test.ts` | 36/36（30 项既有 lane 回归接线后原样全绿 + 6 项新增：桌面卡折叠进 claude 通道、CLI 包装去重、App 归档不投影、端口缺失时 claude lane 键集不变、桌面会话打开护栏、心跳订阅→refresh→dispose 生命周期） |
| `tests/runtime/codexController.test.ts` | 59/59（Codex lane 无回归） |
| domain 全量 + claudeDesktopBridge + codexCompanion | 405/405 |
| `vue-tsc` / build / prepare / validate | 零新增 / 全通过 |

触碰文件：`src/runtime/codexController.ts`（不在 favorites 冲突面）+ 测试。**验证环境备注**：Cowork 沙箱每次 bash 调用是独立 bwrap（die-with-parent），nohup 后台**跨调用不存活**（log 恒空 + `pgrep -f` 会匹配轮询命令自身造成"仍在跑"假象）；且 `tests/runtime` 整目录含云端慢文件（action/mqtt 等，见 companion 记忆），只按相关文件分批单调用跑。

前置核验（三个未知）证据与结论见 [raw-requirement.md](raw-requirement.md#L1) 与 [sampling.md](sampling.md#L1)。

| 前置项 | 结果 |
| --- | --- |
| 标准版数据根路径 | ✅ `~/Library/Application Support/Claude/`（会话自证 + Finder 实景） |
| audit.jsonl 于标准版存在且实时 | ✅ 本会话目录 3.1MB 分钟级追加 |
| 云端会话本地留痕 | ✅ 仅索引级（remote-session-spaces.json），无状态字段 |
| 桌面端本地额度落盘 | ❌ 不存在（policy-limits 是策略缓存）——额度不入本项目范围 |

## P4（2026-08-06，同一沙箱环境）

设计偏好门：[design-preference-receipt.md](design-preference-receipt.md#L1)（用户三项拍板：前置 App + 提示会话名 / 不加子开关 / 并进现有状态行）。

| 项 | 结果 |
| --- | --- |
| `tests/platform/claudeBridge.test.ts` | 43/45（+7 项新增：应用身份准入不看标题、`local_*` 永不落 `--resume`、激活并命名会话且 `confirmsRead:false`、标题精确命中优先且不猜、子窗/不可激活行剔除、失败不冒充打开、权限缺失≠应用未运行）。**2 项失败是已归档的沙箱环境限制**（沙箱自带真实 `claude` 二进制 → 空机器 fixture 必挂，见 [sandbox-real-claude-binary…](../../../knowledge/error-memory/sandbox-real-claude-binary-breaks-empty-machine-fixtures.md#L1)），与本轮改动无关 |
| `tests/runtime/claudeCompanionController.test.ts` | 39/39（原「拒绝打开桌面会话」护栏用例替换为 4 项：路由到桌面 opener 并带 App 自有标题、桌面激活不写已读回执、失败可报且不动卡片、非归档会话计数进设置页视图） |
| `tests/domain/companionPresentation.test.ts` | +4 项（关闭时文案、连接态追加桌面端事实、CLI 提示与桌面计数并存、缺环境/异常计数容错） |
| `tests/domain` + `tests/platform/claudeDesktopBridge` + `tests/runtime/codexController` | 408/408 |
| `tests/ui` + 两个 controller | 228/228 |
| `vue-tsc --noEmit` | **零错误**（favorites 在途 4 错已由另一会话闭合） |
| `vite build` + prepare + `validate-utools-runtime` | 全通过 |
| public 镜像 | `sync-utools-preloads` 后无差异 |
| 错误归档 | [test-double-froze-an-invented-cross-module-contract](../../../knowledge/error-memory/test-double-froze-an-invented-cross-module-contract.md#L1) |

触碰文件：`preload/claude/open.cjs`、`preload/claude/index.cjs`（+ public 镜像）、`src/platform/eypcPlatform.ts`（可选参数外科追加）、`src/runtime/codexController.ts`、`src/domain/companionPresentation.ts`、`src/pages/CodexPage.vue`、`src/help/guides/codex.md` + 三个测试文件。

### 顺带修复的既有缺陷（非本期设计）

CLI 的「聚焦承载会话的终端窗口」此前 **100% 失败**，两处契约断裂叠加：传给 `windows.activate` 的自造对象缺 `platform`（子系统守卫直接 `not-found`），且成功判定用了词表里不存在的 `ok`（真实为 `activated`）。原 8 项桥测试全绿是因为桩返回了同一个自造词。修复后主路径有正向断言（activate 收到的对象仍带 `platform`）。**这条修复改变了 CLI 打开的实际行为**（从「每次新开终端」变成「优先聚焦已有终端，并写已读回执」），属于恢复既定设计，需宿主验收确认。

### 宿主验收清单（P4 部分，归用户）

1. 开着 Claude 桌面端 → 卡片里点一条 `local_*` 会话 → 桌面端应被前置，消息含会话标题；该卡若是「已完成未读」应**保持未读**。
2. 关掉 Claude 桌面端 → 再点一次 → 消息应为「Claude 桌面端未在运行」，卡片状态不变。
3. 未授予辅助功能权限时 → 消息应为「需要在系统设置中允许 EyPc 使用辅助功能」。
4. 终端里跑着的 Claude Code 会话 → 点卡片应**聚焦到那个终端窗口**（而不是新开一个），并把已完成未读置为已读。
5. 设置页「运行 → 接入来源」→「接入 Claude Code」下方状态行应出现「· 桌面端 N 个会话」，N 与卡片里桌面会话数一致；关闭开关后该行回到「关闭时不读取任何 Claude 数据」。

## P5（2026-08-06，对抗复核 + 修复 + 收口）

复核方式：三路独立对抗式子代理，分别针对纯域 / preload 桥 / controller 与回归面，指令要求
「成功标准是找到真实问题，不是确认实现正确」。所有结论由主会话逐条自证后才动手；其中数条为误报
（最重要的一条见下「被否决的复核结论」）。

### 修复的 blocker

| # | 结论 | 自证 | 修法 |
| --- | --- | --- | --- |
| B1 | **facade 漏两个端口 → 真机上整条桌面 lane 不存在** | `preload/index.js:8727-8745` 的 claude facade 无 `readDesktopSnapshot` / `watchDesktopSessions`；两文件 grep 零命中；validator 断言打在 `createClaudeBridge()` 工厂上所以全绿 | 两份 facade 补转发端口；validator 改为**枚举工厂全部函数导出并断言同名端口存在于 `window.eypcPlatform.claude`**，模块私有端口须显式白名单 |
| B2 | **`isClaudeAvailable` 把桌面 lane 一起清空** | `codexController.ts:719-724`；桌面数据在 `~/Library/Application Support/Claude/`，与 CLI 二进制/家目录/登录态无关 | CLI 读取包进 `cliReadable` 分支；桌面 lane 只受 provider 开关约束 |
| B3 | **跨时钟比较使完成规则永不触发** | `claudeDesktop.ts:327-330` 拿行内 ISO 时间戳比文件 mtime，mtime 恒更晚 → 卡片假「运行中」约 30 分钟 | 改由桥回答同源问题（`auditTailUnparsed`）；观察对象类型逐字段标注时钟归属 |
| B4 | **归档桌面会话吞掉同 id 的活跃 CLI 卡** | `:488` 归档不产卡，但 `:529` 去重集用全部 metadata（含归档）→ 净效果是删除一行 | 去重集同样跳过 `isArchived` |

### 修复的高危 major

顺序回归（拼接破坏 `mergeByRecency` 有序前提 → 本层改二路归并）、`sessionId` 路径遍历
（内容来的 id 未校验直接 `path.join` → 形状正则 + 容纳性二次断言）、`appRunning` 死守卫
（桥全文不产出 → 删字段与分支，改为显式「永不 stopped」断言）、单行 >64KB 尾窗全盲
（→ 扩窗至 1MB 上限 + `auditTailUnparsed` 降级标志）、首启零 watcher 永不重试
（→ 加watch 数据根 + 零订阅返回 `null` + refresh 每轮重试）、宽限次序
（20 分钟静默仍报 active → `eventFresh` 超出宽限落保守 ongoing）、完成水位线掺 mtime/心跳
（重命名重打未读 → 拆 `claudeDesktopActivityAt`（排序）与 `claudeDesktopCompletionRevision`（只认内容证据））。

### ~~被否决的复核结论~~ → 已撤销：复核是对的，否决理由两条全错（2026-08-06 修正）

P5 当时声称「桌面卡永远无法置已读 → 角标只增不减」这条**前提不成立**并据此否决。
用户质疑后逐条实跑，**两条否决理由全部证伪**：

| 当时的说法 | 实际 |
| --- | --- |
| 「`bucketsFor` 对 hidden 卡只返回 `['hidden']` → 隐藏即减角标」 | `codexPresentation.ts:159-160` 的 compact 未读 = `completedUnread.length + hidden.filter(bucket==='completed-unread').length`，**隐藏的完成未读卡按设计要加回角标**（[PRODUCT_REQUIREMENTS.md#L122](../../PRODUCT_REQUIREMENTS.md#L122) “including hidden tasks”） |
| 「与 `developer-soul.md#L64/#L70` 冲突」 | 那两条的 acknowledgement 子句**早已被 RAW-082/128/138/139 取代**（[#L123](../../PRODUCT_REQUIREMENTS.md#L123) “supersede the preceding … acknowledgement clauses”、[#L174](../../PRODUCT_REQUIREMENTS.md#L174) “hide/restore remains unrelated”）。soul 已就地标注失效 |
| 附带：「隐藏链路早已接好」 | **隐藏当时根本不生效**，且是 P5 自己引入的回归——见下 |

复核结论成立。修法不是加确认控件，而是照 Codex 通路让桌面卡**不产生** completed-unread，
见「按 Codex 通路对齐」一节。

### P5 自己引入并已修复的回归

P5 把 `claudeDesktopCompletionRevision` 收窄成纯内容证据（为修「重命名重打未读」），
但 `claudeCards` 的隐藏对账仍用它、而 `hide()` 存的是 `card.revisionAt`（含 mtime 偏移）——
两者相差 mtime skew，严格相等恒不命中。实跑证据：

```
hide() 返回          = true
消息                 = 已移入 Companion 的已隐藏区；不会修改 Codex 任务
隐藏后 isHidden      = false      ← 没隐藏
completedUnreadCount = 1          ← 没变
```

即**假成功**。P5 之前两个表达式恰好同值，所以是本轮引入。controller 测试 harness 把
`auditUpdatedAt / lastEventAt / lastActivityAt` 设成同一瞬间，正好把它盖住（已修）。

### 按 Codex 通路对齐（2026-08-06，用户指示）

用户要求：桌面卡若能走「不产生已完成未读」的通路就以它为主，静默逻辑照 Codex 改。
读透 Codex 后照抄三条：

| Codex 通路 | 出处 | 桌面卡对齐后 |
| --- | --- | --- |
| 完成必须有显式证据，**时间流逝不制造终态** | `codex.ts:1686` + `:1713` | 超出宽限不再返回 `completedState`，落保守 `ongoing`（此前违反 [#L137](../../PRODUCT_REQUIREMENTS.md#L137) “elapsed time and recency never create completion or stop”） |
| **未读需要权威**，无权威落 `completed` + `unreadState:'unknown'` | `codex.ts:1704` / `:1713-1716` / `:1750` | 无回执不再等于未读；回执分支保留，将来接上确认路径零改动 |
| `revisionAt` 优先取 `completionRevision` —— **单一 revision 货币** | `codex.ts:1722` | 终态 `revisionAt === completionRevision`；隐藏对账改为「先投影、再按卡片自己的 `revisionAt` 过滤」，比较由 `===` 改 `>=`（对齐 `codex.ts:1761`），CLI 与桌面两条 lane 共用同一段逻辑 |

另修两项 Codex 一致性缺口：

- **Turn 等价物**：桌面卡此前不设 `lastTurnStartedAt` / `lastTurnCompletedAt`，而
  `codexPresentation.taskActivityAt` 只读这两个字段（刻意忽略 `updatedAt`，soul:87 把「用
  updatedAt 当活动」列为避免行为）→ 桌面卡恒计 0，被**动态 Tab、进行中角标、上一个/下一个循环
  全部滤掉**。现取 `lastTurnStartedAt = createdAt`、`lastTurnCompletedAt = lastResultAt || lastEventAt`。
- **`hiddenKind`**：`companionAggregate` 推入 hidden 桶时不打 `hiddenKind:'task'`，而 Codex 在
  `codex.ts:1765` 打了、`restore()` 与「显」按钮都以它为门 → **所有 Claude 卡（含 CLI）的「显」
  按钮恒禁用**。已在聚合层补上。

### 验证结果

| 项 | 结果 |
| --- | --- |
| `tests/domain/claudeDesktop.test.ts` | 33/33（27→33；新增跨时钟完成回归、`auditTailUnparsed` 守卫、宽限次序、重命名不重打未读、水位线与排序信号分离、归档不删对端 CLI 卡、归并单调性） |
| `tests/platform/claudeDesktopBridge.test.ts` | 13/13（7→13；新增路径遍历四类恶意输入、超大单行扩窗、不可解析尾窗降级、torn 行置位、空根仍能 arm watcher、零订阅返回 null） |
| `tests/runtime/claudeCompanionController.test.ts` | 43/43（39→43；新增只装桌面端也出卡、桌面读取抛异常时 Codex 卡逐字段不变、订阅重试、provider 关闭清空桌面数组） |
| `tests/domain` + `tests/platform/claude*` + 两个 controller | 506/508 —— 2 项失败是已归档的沙箱环境限制（`/usr/local/bin/claude` 真实存在，空机器 fixture 必挂），见 [sandbox-real-claude-binary…](../../../knowledge/error-memory/sandbox-real-claude-binary-breaks-empty-machine-fixtures.md#L1) |
| `vue-tsc --noEmit` | **零错误** |
| `vite build` + `prepare-utools-runtime` + `validate-utools-runtime` | 全通过；validator 的新枚举断言落地当场抓出第三个漏端口（`readQuota`，核实为模块内部+测试专用，已白名单） |
| public 镜像 | `sync-utools-preloads` 后 `diff -rq preload/claude public/claude` 无差异，facade 段逐字节一致 |
| 错误归档 | 新增 6 条 + [claude-readiness-gated-on-unneeded-capability](../../../knowledge/error-memory/claude-readiness-gated-on-unneeded-capability.md#L1) 记复发；error-memory README 索引补齐 P2–P5 全部 10 条 |

本阶段触碰文件：`preload/index.js`（+ public 镜像）、`preload/claude/desktop.cjs`（+ 镜像）、
`scripts/validate-utools-runtime.mjs`、`src/domain/claudeDesktop.ts`、`src/runtime/codexController.ts`、
`src/help/guides/codex.md` + 三个测试文件。

---

## 宿主验收清单（整轮 P1–P5，归用户）

沙箱只能证明编译与逻辑，uTools 宿主 / 原生窗口 / 视觉交互一律归用户。请按顺序走：

### A. 特性是否真的活着（P5 修的两个 blocker，最优先）

1. 开启「运行 → 接入来源 → 接入 Claude Code」，Claude 桌面端里有近期会话 → 卡片列表里**应当出现**桌面端会话卡（P5 之前这里恒为空）。
2. 若你的机器上**没装 Claude Code CLI**（或没登录），第 1 条仍应成立——桌面端不依赖 CLI。
3. 设置页该开关下方状态行应出现「· 桌面端 N 个会话」，N = 近 14 天内未归档的桌面会话数，与卡片数一致；关掉开关后该行回到「关闭时不读取任何 Claude 数据」且卡片全部消失。

### B. 状态正确性（P5 修的 B3/B4 与水位线）

4. 让一个桌面端会话跑完一轮 → 卡片应在**几分钟内**变成「已完成未读」，而不是继续显示「进行中」约半小时。
5. 在桌面端把一个会话**改名** → 已经读过（隐藏过）的那张卡**不应**重新变回未读、也不应重新冒出来。
6. 在桌面端**归档**一个 Cowork 会话 → 只有它那张卡消失；如果同一会话还有一个在跑的 Claude Code CLI 会话，**那张 CLI 卡必须还在**。
7. 桌面端卡片与 Codex / CLI 卡片混排时，**最近活动的排在前面**；「上一个/下一个任务」循环序与看到的顺序一致。

### C. 打开与已读语义（P4 + P5）

8. 开着 Claude 桌面端 → 点一条 `local_*` 卡 → 桌面端被前置，消息含会话标题；该卡若是「已完成未读」应**保持未读**。
9. 关掉 Claude 桌面端 → 再点一次 → 消息应为「Claude 桌面端未在运行」，卡片状态不变。
10. 未授予辅助功能权限时 → 消息应为「需要在系统设置中允许 EyPc 使用辅助功能」。
11. 对一张「已完成未读」的桌面卡点 **隐** → 角标应减一；该会话之后再有新活动，卡片应自己回来。
12. 终端里跑着的 Claude Code 会话 → 点卡片应**聚焦到那个终端窗口**（而不是新开一个），并把已完成未读置为已读。
    ⚠️ 这条是 P4 顺带修复的既有缺陷，**改变了 CLI 打开的实际行为**（此前 100% 失败、每次新开终端），请重点确认。

### D. 已知限制（不是缺陷，确认你能接受）

- **多个终端窗口跑多个 Claude Code 会话时，第 12 条可能聚焦到错的窗口，并把点中的那张卡误标为已读。** 已记 P6-1。
- **Claude 桌面端窗口在别的 Space（尤其全屏 Space）时，第 9 条会误报「未在运行」。** 已记 P6-1。
- **桌面端窗口标题是否等于会话标题从未在真机核实过**；若不等，第 8 条的「标题精确命中」会退化为激活任意一个 Claude 窗口。**请在验收时顺便看一眼窗口标题栏写的是什么**，这条会决定 P6-1 的修法。
- 桌面端读取失败与「没有桌面会话」在状态行上同形，都显示 0。已记 P6-2。
- 桌面端 App 被中途退出时，未完成的那轮仍会在宽限后显示为「已完成未读」——文件型只读数据源证明不了进程存活。已记为 [guard-field-no-producer-ever-sets](../../../knowledge/error-memory/guard-field-no-producer-ever-sets.md#L1)。

## P5-3 额度通路核验（2026-08-06，联网查证 + 本机实跑）

### 通路结论：选型正确，问题全在边界

Claude Code 官方 statusline 文档确认 `rate_limits.{five_hour,seven_day}.{used_percentage,resets_at}`
是正式字段、`resets_at` 为 epoch 秒。**无凭证、无网络、由 Anthropic 主动推送** —— 对比 Codex 走
App Server 结构化 RPC，这是 Claude 侧的等价通路，选对了。凭证兜底是次要路线，不是主路线。

同一份文档还写明：**「the rate-limit fields don't exist for every render — right after a fresh
`/clear` you won't see them until the first API response of the new session」**。这句话直接决定了
下面 A2 的严重性——它不是边缘情况，是每次 `/clear` 都会发生。

### 修复与证据

| 项 | 证据 | 修法 |
| --- | --- | --- |
| **A2 `/clear` 后好读数被覆盖** | 本机 `/bin/sh` 实跑：`rate_limits:null` → awk 输出 `{"id":"claude-opus-5","display_name":"Opus 5"}`，缓存被 `model` 对象覆盖 | awk 改为跳过键与冒号后**要求首字符是 `{`**；`null` 与「无键」走同一条不触碰缓存的路径。实跑复验：好读数保留 ✓ |
| **A1 已过去的重置时刻文案** | 亲跑 `companionResetDetailText`：1 分钟前 / 昨天 / 3 天前三种输入全部渲染成「今天 <时刻> 重置（0 分钟后）」 | `now >= resetAt` 直接返回「额度窗口已重置 · 等待新读数」 |
| **A3 `stale` 永不触发** | `normalizeClaudeQuota` 有窗即恒 `ok`，从不看年龄 | **与 A1 同一个第一性事实**：`resets_at` 已过去 ⇒ 窗口已滚过 ⇒ 百分比失效。新增 `claudeQuotaWindowExpired`，`normalizeClaudeQuota` 接受 `now` 后按此标 `stale`。**不引入任何人为年龄阈值** |
| **A4 额度刷新被收件箱开关冻结** | `taskDelay` 在 `conversationInboxEnabled === false` 时返回 `Infinity`，Claude lane 整个不再唤醒 | 抽出 `claudeLaneDelay = min(taskDelay, quotaDelay)`，与 Codex 调度器自己的 `Math.min(quotaWait, taskWait, …)` 同构；一次读服务两个界面 |
| **A6 同屏三种精度** | 82.4% → Claude chip「17.6%」/ Codex chip 整数 / 球心「18」 | Claude 侧取整对齐 Codex（Codex 格式受逐字节合同冻结，只能 Claude 让步） |
| 顺带 | `resets_at` 主源只收数字、兜底源另做 ISO 解析，两源对同一字段口径不一 | 抽出 `claudeResetAtToMs` 统一收数字/毫秒/ISO，两源共用 |

### 新增测试层

`tests/platform/claudeStatuslineScript.test.ts` —— **此前 shell/awk 这一层零覆盖**，A2 正是因此逃过
所有 JS 侧测试。新测试用真实 `/bin/sh` 执行生成出来的脚本，覆盖：正常双窗、`rate_limits:null`
不覆盖缓存、无键不覆盖缓存、键后带空格、空 stdin 不建文件。fixture 路径含空格（macOS 数据目录形态）。

### 验证

| 项 | 结果 |
| --- | --- |
| `tests/domain` + `tests/ui` + claude 桥/statusline/两个 controller | 605/605 |
| `vue-tsc --noEmit` | 零错误 |
| `vite build` + prepare + `validate-utools-runtime` | 全通过 |
| public 镜像 | 无差异 |
| 错误归档 | [documented-absent-field-treated-as-parse-target](../../../knowledge/error-memory/documented-absent-field-treated-as-parse-target.md#L1) |

### 未修（P6-A5）

冷启动补读在 `cliReadable` 分支之外，Claude 未登录/目录不可读时仍会读凭证并弹钥匙串；
且解释文案藏在开启 Claude 之后才可见的位置。这条涉及凭证与用户告知，属产品决定，留给用户定夺。

### 宿主验收补充（额度）

6. Claude Code 里跑一轮 → 水球额度出数字；随后执行 `/clear` → **额度数字应保持不变**（此前会变回「尚未读到额度」）。
7. 让 5 小时窗过了重置时刻再看浮窗 → 提示应为「额度窗口已重置 · 等待新读数」，chip 应显示为陈旧态，而不是「今天 <过去的时刻>（0 分钟后）」。
8. 关闭「会话收件箱」→ 额度仍应按 `quotaRefreshSeconds` 继续刷新。
9. Claude 与 Codex 两个 chip 的百分比精度应一致（都是整数），与水球球心数字一致。
