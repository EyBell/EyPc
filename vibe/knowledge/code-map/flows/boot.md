# 00 启动与壳

一次「在 uTools 里打开 EyPc」实际经过这些行。

## 1. 宿主声明入口码

[public/plugin.json](../../../../public/plugin.json#L15) `features` 把 `eypc-ports` / `eypc-codex` / 槽位等码交给 uTools。`mainHide` 槽位打开时主窗可以不出现。

## 2. Renderer 挂载

[src/main.ts](../../../../src/main.ts#L9) `createApp(App).mount('#app')`。样式先加载 V7 token，再加载主界面。

Float / Action 是另外两个 HTML 入口：

- [src/float-main.ts](../../../../src/float-main.ts#L8)
- [src/action-main.ts](../../../../src/action-main.ts#L7)

## 3. 创建 Runtime，而不是页面自己持有状态

[src/App.vue](../../../../src/App.vue#L37) 调用 `createAppRuntime(normalizeAppState(platform.storage.getState()))`。

六个功能 slice 从 [featureModules.ts](../../../../src/runtime/feature/featureModules.ts#L59) `featureModuleV7(id).createSlice` 来，页面拿不到完整 `AppRuntimeSnapshot`。

## 4. 把 uTools payload 变成 Tab 或 Action

[src/App.vue](../../../../src/App.vue#L374) `applyPluginRoute`：

1. [routePluginFeature](../../../../src/runtime/feature/featureRouting.ts#L37) 解释 `payload.code`
2. 需要时 `runtime.setTab`
3. 有 `actionId` 则 [runtime.dispatch](../../../../src/App.vue#L384)（`source: 'utools-feature'`）
4. `mainHide` 槽位不额外 hide

## 5. 宿主 API 从哪来

[getPlatform](../../../../src/platform/eypcPlatform.ts#L1183) 读 `window.eypcPlatform`。生产环境由 [preload/index.js](../../../../preload/index.js#L14075) 挂上；其中 Companion Kernel 在 [L12173](../../../../preload/index.js#L12173) 注入。

浏览器 `pnpm run serve` 没有 uTools：平台走 dev fallback，端口扫描可工作，Companion / 窗口原生能力会报 unsupported。
