---
id: eypc-persistent-float-window-outlives-plugin-reload
status: verified
scope: project
fingerprint: renderer-change-lands-in-the-repacked-asar-and-the-user-still-sees-the-old-ui__the-detached-float-BrowserWindow-is-persistent-so-an-ordinary-plugin-reload-never-recreates-it__it-keeps-serving-the-bundle-it-loaded-at-creation-time
first_seen: 2026-08-28
last_verified: 2026-09-05
review_after: 2027-02-28
evidence:
  - vibe/specs/260828/claude-ball-centre-dual-weekly/raw-requirement.md
  - preload/codex/float-bridge.cjs
  - src/components/CodexWaterBall.vue
tags:
  - runtime-identity
  - packaging
  - float-window
  - host-lifecycle
---

# 持久化悬浮窗不随插件重载更换 bundle

## Symptom

水球球心的改动通过了全部聚焦测试、`pnpm run build` 绿、uTools 也重新打包了 asar（插件目录就是 `dist/`），用户仍报「没有效果」——界面逐像素等于改动前。

## Wrong Assumption

**「界面没变 ⇒ 新代码没进产物 ⇒ 去查构建链。」**

我按这条假设排了一轮构建链，还中途得出过一个**错误结论**：`grep -c "codex-water-ball__pair" <asar>` 无命中，于是宣布「运行中的 asar 里没有这段代码」。那是 `grep` 对含 NUL 的二进制默认不按文本匹配，不是事实。手写 asar header 解析读出 `assets/companionPresentation-*.js` 后，`pair class: true / scopedPercent: true`——**代码一直都在运行中的产物里**。

## Verified Root Cause

悬浮球由 [float-bridge.cjs](../../../preload/codex/float-bridge.cjs#L521) 用 `utools.createBrowserWindow('float.html', …)` 创建成一个**脱离插件窗口的独立 BrowserWindow**。它的生命周期由 [handleHostVisibility](../../../preload/codex/float-bridge.cjs#L1014) 决定：

```js
if (isKill) { …; codexFloatPersistent = false; closeCodexFloat(); return }
if (!codexFloatPersistent) closeCodexFloat()
```

普通退出（`isKill === false`）且 `codexFloatPersistent === true` 时**一行都不执行**。诊断日志里的 `plugin-lifecycle/plugin-out {"isKill":false,"floatPersistent":true}` 就是这一支。uTools 开发工具「重载」还会**重跑 Preload** 但通常不 kill：新闭包里 `codexFloatWindow === null`，旧 `BrowserWindow` 仍留在桌面上。RAW-212 在新 Preload 构造时按标题 `EyPc Codex` 关掉残留窗，再交给 `sync` 建新窗。

于是：uTools 重打包 asar、重载主窗口，**那个悬浮窗自始至终没被销毁**，仍在跑它创建那一刻加载的 renderer bundle。只有 `sync({ visible: false })`（关掉悬浮球）或真正 kill 插件才会 `closeCodexFloat()`，下次 `createCodexFloat` 才会加载新的 `float.html`。

## Why The Registered Guard Did Not Fire

[PRODUCT_REQUIREMENTS.md](../../specs/PRODUCT_REQUIREMENTS.md#L266) 有明文条款：「Main UI、Main Preload、Float UI、Float Preload 任一身份缺失或不一致时必须显示 `reload-required` 并停止任务动作」。本轮它一声没响，**而且这不是实现漏了，是比较对象选错了层**。

[float.js](../../../preload/float.js#L32) 的判据：

```js
runtimeIdentityCompatible = runtimeIdentityArtifact?.revision === RUNTIME_IDENTITY_REVISION
  && runtimeIdentityArtifact?.artifactState === 'artifact-ready'
  && Object.keys(actual).every((key) => actual[key] && actual[key] === expectation[key])
```

- `actual` = 悬浮窗**自己那份** preload 的 `runtime-identity.cjs`（窗口创建时 `require` 进来的）。
- `expectation` = 由 [FloatApp.vue](../../../src/FloatApp.vue#L3009) 传入的 `__EYPC_RENDERER_ASSET_ID__` 等编译期常量，来自**同一个悬浮窗里**的 UI bundle。

两半同属那个持久化窗口、同一刻加载。窗口不重建时**两半一起变旧**，于是仍然逐字段相等 ⇒ `host-loaded`。守卫比的是「Float UI ↔ Float Preload 内部是否自洽」，从来没有比过「这个悬浮窗 ↔ 当前磁盘上的产物」。

**一致 ≠ 最新。** 一个整体陈旧的窗口在字面上满足该条款（没有任何不一致），却完全违背条款意图（用户正对着旧构建，且没有任何信号）。

## Cost

一轮完整的构建链误排：解包 asar、比对 `runtime-identity.cjs`、跑真实额度探针、读持久化设置、把真实 payload 灌进域函数——全部返回「一切正常」。真因不在被查的那一层。

## Correct Detection Order

用户报「改了没效果」而自动化全绿时：

1. **先证明代码在不在运行中的产物里，再往上游查。** 读 asar 要么解 header，要么 `grep -a`；`grep` 无命中在二进制上**不构成证据**。
2. **确认渲染这块 UI 的窗口是哪一个、它的生命周期归谁管。** EyPc 的悬浮球不在插件主窗口里，主窗口重载与它无关。
3. **查该窗口的销毁条件，而不是插件的重载条件。** 搜 `closeCodexFloat` 的调用点比读日志快得多。
4. 数据侧（`probe:claude-quota`、持久化设置）放最后——它只在前三步都排除后才是嫌疑。

## Rule

**「重载插件」不等于「换掉了所有渲染进程」。凡是 `createBrowserWindow` 出来的持久化窗口，都必须单独走一次销毁重建才会换 bundle。**

- 交付涉及悬浮窗渲染的改动时，工作台再进（`eypc-main` 等可见入口）会自动重建插窗口（RAW-212）。验收仍须确认匿名 `runtime-identity-handshake` 为 `host-loaded`；若 Host Preload 还是旧进程，重建后仍可能 `reload-required`，那时才结束后台进程。静默 `mainHide` 快捷键不会拆窗。诊断时**不能把「重载了主窗」当成 Float 已换 bundle**——比较对象必须有窗口外的一端。
- 在二进制（asar、LevelDB、日志归档）里找字符串一律用 `grep -a` 或结构化解析；`grep` 的静默无命中会被误读成事实，而这个误读会把排查引向完全错误的一层。
- **自洽性守卫不能替代新鲜度守卫。** 凡是「A 与 B 是否一致」的版本判据，都要先问 A 和 B 会不会**一起**变旧；会的话它对整体陈旧完全失明。要真正覆盖，比较的另一端必须来自窗口之外（当前磁盘产物或宿主 preload），而不是同一个窗口里的另一半。

## Boundary

本记录讲**窗口生命周期导致新 bundle 未被加载**。它与 [runtime identity 握手不一致](modules/runtime-and-packaging.md#L1) 路线不同：那条是产物身份链本身不一致、界面会显示 `reload-required`；本条里身份链完全自洽、没有任何告警，只是某个渲染进程比产物老。

用户帮助现为工作台再进自动重建；本记录补的是**为什么主窗重载不等于 Float 已换 bundle**，以及自洽性守卫为何对整体陈旧失明。RAW-212 已把「失效 / 重新接入 / 关闭工作台再进」做成自动重建；`reload-required` 只在重建后仍不一致时出现。诊断顺序不变。
