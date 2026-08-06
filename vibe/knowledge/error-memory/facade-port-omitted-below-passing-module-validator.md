---
id: eypc-facade-port-omitted-below-passing-module-validator
status: verified
scope: project
route_pending: codenote-utools
fingerprint: bridge-module-exports-port__packaging-manifest-ok__module-level-validator-green__preload-facade-omits-port__controller-feature-detect-false__feature-silently-absent-on-host
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - preload/index.js
  - public/preload.js
  - scripts/validate-utools-runtime.mjs
  - src/runtime/codexController.ts
  - vibe/specs/260806/1130-claude-desktop-provider/verify.md
tags:
  - preload
  - facade-port
  - feature-detection
  - iron-rule-14
  - validator-blind-spot
  - recurrence
---

# Facade Port Omitted Below A Passing Module Validator

> **路由待办**：本条是 uTools 可复用失败，按项目规则应归 CodeNote
> `DevelopRef/Multi-System-Use/uTools/error-memory/` 并在本地留 thin pointer。
> 归档当次会话未挂载 CodeNote，故先完整留在项目内；下次有 CodeNote 访问权时
> 迁移并把本文件降级为 `scope: project-pointer`。

## Symptom

Claude 桌面端 provider 的 P1–P4 全部"完成"且验证全绿——域 27 项、桥 7 项、controller 36 项、
typecheck 零错、build 通过、`validate-utools-runtime` 通过、public 镜像无差异——但在真机 uTools 里
打开「接入 Claude Code」后：0 张桌面卡、`claudeDesktopSessionCount` 恒 0、无心跳订阅、**无任何错误提示**。
整条特性等于不存在。

## Wrong Assumption

以为"模块导出了端口 + 打包清单收录了模块 + 验证器断言了端口"三件事成立，端口就到得了消费方。

## Verified Root Cause

链路有**四层**，而验证只覆盖了前三层：

1. `preload/claude/desktop.cjs` 导出 `readDesktopSnapshot` / `watchDesktopSessions` ✅
2. `utools-preload-assets.mjs` 清单收录该模块 ✅
3. `validate-utools-runtime.mjs` 断言 `createClaudeBridge()` **工厂**上有这两个方法 ✅
4. `preload/index.js` 的 `window.eypcPlatform.claude` **facade** 转发这两个端口 ❌

Controller 用的是第 4 层：`if (typeof bridge.readDesktopSnapshot === 'function')`。
特性探测失败即静默降级——这本是正确的向后兼容设计，代价是**漏端口没有任何噪音**。

最刺眼的一点：`preload/index.js` 里 `readQuotaFallback` 上方**已经写着**这条教训的注释
（"The Controller feature-detects this method, so omitting it here silently disabled the
`claudeQuotaFallback` setting"），而桌面端两个端口就加在它下面几行，依然漏了。
**注释形式的教训防不住复发。**

同宗但断在更早层的是 [new-preload-module-missing-from-packaging-manifest](new-preload-module-missing-from-packaging-manifest.md#L1)（断在 dist require）。
两条合起来说明：这条链路每一层都要有自己的机器断言。

## Detection Order

1. 特性在真机"什么都不发生"且无报错 → 先怀疑 facade 漏端口，不要先查域逻辑。
2. `grep -n '<portName>' preload/index.js public/preload.js` —— 零命中即确诊。
3. 注意验证器断言的对象是**工厂**还是 **facade**：断在工厂上的断言对本病完全不敏感。

## Prevention Rule

**结构性断言，不要逐个列举。** `validate-utools-runtime.mjs` 现在枚举 `createClaudeBridge()`
的全部函数型导出，逐个断言同名端口存在于 `window.eypcPlatform.claude`；确属模块私有的端口
必须显式写进 `CLAUDE_MODULE_PRIVATE_PORTS` 白名单（写进去等于声称"没有任何 Controller 路径
特性探测它"，要先核实）。

该断言落地当场就抓出**第三个**此前没人注意到的端口（`readQuota`，核实后确认是模块内部+测试专用，
已白名单）。逐条列举的写法永远追不上新增端口，枚举才追得上。

## Alternative Routes

- 让 Controller 对"端口缺失但 provider 已开启"发一条可见诊断，而不是纯静默降级——本轮未做，
  记进 P6 待办（静默降级同时也让"桌面读取失败"与"没有桌面会话"在状态行上同形）。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：P5 对抗复核发现，桌面 lane 在真机上从未跑过；改为枚举式断言后立即又抓出 `readQuota` |
