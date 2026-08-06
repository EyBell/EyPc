# Tasks：Claude 桌面端 provider

Plan: [plan.md](plan.md#L1) · 状态：待开工（开工条件见 plan）

- [x] P0-1 audit.jsonl 事件采样与类型清单（脱敏）→ [sampling.md](sampling.md#L1)（2026-08-06，样本在 `_to_delete/`，用户可删）
- [x] P0-2 spec 待定项补全（事件映射/去重键/宽限值已定入 [claudeDesktop.ts](../../../../src/domain/claudeDesktop.ts#L1) 模块注释与 sampling.md；**设计偏好回执推迟到 Phase 3**——P1 纯域无 UI 行为）
- [x] P1-1 claudeDesktop.ts 纯域 + 单测（17 项，2026-08-06）
- [x] P1-2 卡片投影 + CLI 去重合并（2026-08-06；**设计决定：并入既有 `claude` 通道而非第三 provider id**——companionProvider/聚合/角标/水球零改动，`combineClaudeLaneCards` 在无桌面来源时按引用返回 CLI 数组保证零差异；App 内已归档会话不投影；显示名用 App 自有 title。新增 10 项测试，共 27 项）
- [x] P2-1 preload 只读桥 + fs.watch + 容错测试（2026-08-06：`preload/claude/desktop.cjs` 只读发现/白名单元数据/64KB 审计尾摘要/用户目录 watch；挂载于 claude facade（`readDesktopSnapshot` / `watchDesktopSessions`）；validate-utools-runtime 新增端口与只读断言；打包清单与 public 镜像已同步——清单漏项被验证器拦截，归档 [error-memory](../../../knowledge/error-memory/new-preload-module-missing-from-packaging-manifest.md#L1)；桥测试 7/7 含带空格路径、撕裂行、窗口门控、watch 起停）
- [x] P3-1 Controller 接线（2026-08-06：refreshClaude 同节奏读桌面快照并归一为域观察、`watchDesktopSessions` 心跳订阅并入既有事件通道（幂等/统一销毁/lane 重置）、claudeCards 经 `combineClaudeLaneCards` 合并（无桌面来源时 CLI 数组按引用直返）、`local_*` 会话打开加安全护栏（终端 `--resume` 路线 CLI-only）。controller 回归 36/36（含 6 项新增：折叠/去重/归档不投影/端口缺失零差异/打开护栏/心跳订阅生命周期）、codexController 59/59、domain+桥+UI 405/405、typecheck 零新增、build+validate 通过）
- [x] P4-1 AX 打开路线 + 设置页/帮助（2026-08-06：设计偏好回执见 [design-preference-receipt.md](design-preference-receipt.md#L1)；桌面会话打开 = 按应用身份准入 → 标题精确命中优先 → 激活并报 `dispatched`（**不写已读回执**，AX 无法证明用户看到了哪条会话）；`local_*` 永不回落 `--resume`；权限缺失与应用未运行分开报。顺带修复既有缺陷：`windows.activate` 目标对象缺 `platform` + 成功判定用了不存在的 `ok` —— CLI 终端聚焦此前 100% 失败，归档 [error-memory](../../../knowledge/error-memory/test-double-froze-an-invented-cross-module-contract.md#L1)。设置页零新增控件，桌面端会话数并进既有状态行（`claudeSourceStatusText`）；功能说明新增「Claude 桌面端会话」小节）
- [x] P5-1 对抗复核 + error-memory + 宿主验收清单（2026-08-06：三路对抗式子代理分别复核纯域 / preload 桥 / controller 与回归面，逐条自证后修 **4 个 blocker**（facade 漏 `readDesktopSnapshot`+`watchDesktopSessions` 导致真机整条 lane 不存在、`isClaudeAvailable` 把桌面 lane 连坐清空、`lastResultAt >= auditUpdatedAt` 跨时钟比较使完成规则永不触发、归档桌面会话吞掉同 id 的活跃 CLI 卡）+ **7 项高危 major**（拼接破坏 `mergeByRecency` 有序前提、`sessionId` 未校验直接拼路径可逃出数据根、`appRunning` 死守卫、单行 >64KB 时尾窗全盲、首启零 watcher 且永不重试、宽限次序让 20 分钟静默仍报 active、完成水位线掺 mtime/心跳致重命名重打未读）。验证器由逐条列举改为**枚举 bridge 工厂全部导出并断言同名端口存在于 facade**，落地当场又抓出第三个漏端口；只读断言由三字面量改为调用点级黑名单。测试重写四类「不可能变红」的写法。新增 error-memory 6 条 + 既有 readiness 条目记复发。**「桌面卡加显式标记已读」候选设计经查证前提不成立且与 soul 两条冲突，用户拍板不加**，改为补文档；见 [design-preference-receipt](design-preference-receipt.md#L1) P5 增补）

- [x] P5-2 用户质疑「角标消失逻辑」后的复核与返工（2026-08-06：实跑证明 P5-1 的否决理由两条全错——`PRODUCT_REQUIREMENTS.md:122` 明写角标含隐藏卡、soul:64/70 的 acknowledgement 子句已被 RAW-082/128/138/139 取代；且 P5-1 自己引入了隐藏**假成功**回归。按用户指示照 Codex 通路返工：静默不制造终态（`codex.ts:1686/1713`）、未读需权威否则落 `completed`（`:1704`）、`revisionAt` 单一货币（`:1722`）、比较改 `>=`（`:1761`）；补 Turn 等价物解锁动态/角标/循环序，补 `hiddenKind` 解锁「显」。soul 两处就地标注失效、rules 新增权威顺序与「结论须可执行证据」两条、错误归档 [superseded-rule-cited-as-authority](../../../knowledge/error-memory/superseded-rule-cited-as-authority.md#L1)）

- [x] P5-3 额度通路核验与优化（2026-08-06，联网查证官方文档后落地）：确认 statusline `rate_limits` 是官方通路、选型正确；修 A1/A2/A3/A4/A6 五项。核心是 **A2**——官方文档明写 `/clear` 之后 rate_limits 会缺失，而 awk 会抓走随后的 `model` 对象覆盖好读数，等于额度显示周期性自我清空；awk 改为要求键后第一个非空白字符即 `{`。**A1+A3 用同一个第一性事实统一**：`resets_at` 已过去 ⇒ 窗口已滚过 ⇒ 读数失效，既标 `stale` 也不再渲染「今天…0 分钟后」，无需拍任何年龄阈值。新增 `tests/platform/claudeStatuslineScript.test.ts` 用真实 `/bin/sh` 跑脚本（此前该层零覆盖）

## P6 待办（复核已确认、本轮未修）

### 额度（2026-08-06 核验发现）

> 权威依据：Claude Code 官方 statusline 文档确认 `rate_limits.{five_hour,seven_day}.{used_percentage,resets_at}` 为正式字段、`resets_at` 为 epoch 秒；并明确 **“the rate-limit fields don't exist for every render — right after a fresh `/clear` you won't see them until the first API response of the new session”**。通路选择正确，问题全在边界处理。

- [x] P6-A1 **已过去的重置时刻被渲染成「今天 <过去的时刻> 重置（0 分钟后）」**（我亲验：1 分钟前/昨天/3 天前三种输入全错）。`companionPresentation.ts` 的 `companionResetDetailText` 把负差夹到 0、负日差落「今天」。statusline 写 `resets_at = T+2h`、用户 T+5h 打开浮窗即必然触发。
- [x] P6-A2 `"rate_limits":null` 时 `scripts.cjs:156-180` 的 awk 只定位键名、取其后**第一个 `{`**，会把 `model` 对象当额度写进缓存，**覆盖掉上一份好读数**；违反本项目自己写的「旧读数标记 stale 而非丢弃」。（**已亲自用 `/bin/sh` 跑通复现与修复**）
- [x] P6-A3 `stale`（读数陈旧）在正常运行下**永不触发**——只在缓存被删/桥没加载时出现，`normalizeClaudeQuota` 有窗即恒 `ok`，从不看 `updatedAt` 年龄。「可能已过期」是死代码。
- [x] P6-A4 额度刷新绑在「会话收件箱」开关上（走 `taskDelay`，关掉后返回 `Infinity`），与 `260805/1150/spec.md:64`「接入现有 `quotaRefreshSeconds` 调度语义」矛盾。
- [ ] P6-A5 冷启动补读在 `cliReadable` 分支之外，Claude 未登录/目录不可读时仍会读凭证并弹钥匙串；且解释文案藏在开启后才可见的位置。
- [x] P6-A6 Claude chip 一位小数、Codex chip 整数、水球球心又取整——同屏三种精度（82.4% → chip「17.6%」/ 球心「18%」）。

### 桌面卡 vs Codex 一致性（剩余项）

- [ ] P6-B1 「归」槽对桌面卡显示可用，走完二次确认才被 `rejectForeignArchive` 拒绝；Codex 的口径是能力在投影层表达（`archiveCapability` 禁用态），应加 `blocked-foreign` 或直接 `canArchive=false`。
- [ ] P6-B2 `项目` Tab 不含 Claude 任务——`mergeCompanionConversations` 只合并任务数组，`projects/projectSections` 原样透传 Codex 侧；连带 `+` 槽恒禁用。
- [ ] P6-B3 compact「待输入」角标点击用显示序（`FloatApp.vue:1133`），全局命令用循环序（`codexController.ts:1907`），违反「直接打开命令跟随循环序」。
- [ ] P6-B4 `bucketsFor` 对 hidden 卡不返回真实桶，导致隐藏的 Claude 待输入卡不进 `inputRequired` 数组，而 `inputRequiredCount` 又把它算进去——数组与计数自相矛盾（`PRODUCT_REQUIREMENTS.md:122` 要求含隐藏卡）。
- [ ] P6-B5 receipts key 被 `codex.ts:1395` 强制小写，而 `companionTaskKey` 不归一；`local_<uuid>` 若含大写字符，隐藏/别名对账整条失配。

### 原有 P6 项

- [ ] P6-1 窗口路线：`open.cjs` 的 `appName` 兜底旁路了 bundle-id 排除表；「标题精确命中，绝不猜」实际在无命中时激活 `candidates[0]`；别的 Space 的桌面端窗口被报「未在运行」（`completeness` 被丢弃，重蹈 [macos-ax-misses-other-spaces](../../../knowledge/error-memory/macos-ax-misses-other-spaces.md#L1)）；多窗口终端会聚焦错窗口并写下**假的已读回执**。建议整体改走 `open -b <bundle-id>` 绕开 AX 清单。
- [ ] P6-2 静默降级不可诊断：`readDesktopSnapshot` 抛异常与「一个桌面会话都没有」在状态行上完全同形；provider 已开启但端口缺失时也无任何提示。
- [ ] P6-3 状态机剩余保守性缺口：`command-started` 无对应 `completed` 的长单工具调用在 30 分钟天花板后被判 completed-unread 且可归档；超时未应答的权限请求同理；未来时间戳被当作最新鲜。
- [ ] P6-4 `limited` 用拒绝列表语义解读一个未采样的状态词表（`allowed_warning` 会误报限流），且 fixture 里的 `rate_limited` 是杜撰值；该字段目前归一后即丢弃，暂无害。
- [ ] P6-5 性能：121KB 元数据每次快照整份读+解析，14 天新鲜度门在解析之后才生效；应先用 `stat.mtimeMs` 过门。
- [ ] P6-6 项目键未做路径规范化（尾斜杠产生两个分组）；会话标题未做单行化与长度钳制。
