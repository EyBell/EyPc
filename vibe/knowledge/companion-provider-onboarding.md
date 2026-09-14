# Companion Provider 接入清单

单一开发入口。产品当前语义仍由 [PRODUCT_REQUIREMENTS](../specs/PRODUCT_REQUIREMENTS.md#L1) 决定；本文件只回答「加一个来源时代码和验收必须齐哪些口」。

Manifest `[preload/companion/provider-manifest.json](../../preload/companion/provider-manifest.json#L1)` 是唯一 Provider id / order / taskKind / capability / pin 声明。Kernel、Registry、TypeScript `CompanionProviderId` 都从这里读。禁止再发明一份平行名单。

## 失败模式（必须挡住）

库存预检 `accepted`、`taskCount > 0` **不等于**卡片可见。证据节点若带上清单里没有的 `taskKind`，Kernel `normalizeTask` 会静默丢掉，悬浮球、角标、循环都当它不存在。检测：诊断里 Orca/新来源 `taskCount` 与 Snapshot `tasks.filter(provider===id)` 必须同数。

机检：`tests/platform/companionProviderAdmission.test.ts`。清单每增一个 id，该测试必须对每个 id 跑通「running 根卡进入 `views.groups.active`」。

## 同一轮必须齐的口

按顺序做。缺一口不得声称接入完成。

| 层 | 必须满足 | 常见漏点 |
| --- | --- | --- |
| 1. Manifest | `order` 与 `providers.<id>` 同时加；`taskKind` 稳定、唯一；默认开关写清 | 只加目录不加 JSON |
| 2. Kernel 准入 | `taskKind` 必须被 Kernel 承认（现由清单派生 `TASK_KINDS` / `PROVIDER_TRAITS`）；入站 pin 的 `providerPinAuthority` 必须在 Kernel 集合里 | 硬编码 kind 白名单漏新值 → 静默丢卡 |
| 3. 证据 | Evidence Adapter 观察函数；Host 预检按 **id 分支**建 batch，禁止 `else` 当成上一个 Provider | `else` 把新来源送进 Cursor 车道 |
| 4. Host 绑定 | `createCompanionHostRegistry` 的 inspect / open / archive；`outbound:false` 不得挂 `setPin` | 有卡不能跳、不能归档 |
| 5. 包装 | `scripts/utools-preload-assets.mjs` 登记 `preload/<id>/`；跑 prepare + public 镜像 | vitest 绿、dist `MODULE_NOT_FOUND` |
| 6. 呈现 | Provider 标记走 `COMPANION_PROVIDER_ABBREVS`（`OR`/`XH`）；**任务抬头 harness 缩写**走全局表 [harness-title-abbreviations.md](harness-title-abbreviations.md#L1)（`gr`/`cc`/`cs`），CodexHost / Orca / Paseo 共用，禁止另起表；Orca 主题取标签标题而不是 OSC spinner；设置页开关；Float 筛选；帮助 | 抬头写成完整 Grok；工作中 spinner 退化成仓库名；或只给 CodexHost 抄一份缩写 |
| 7. 隐私 | 观察对象不得含正文、Prompt、工具参数、终端 preview、绝对路径 | 诊断 JSONL 泄漏 |
| 8. 验收 | 聚焦测试含「该 id 的 running 根进入 active」；诊断 `taskCount` 对 Snapshot 计数；重载 uTools 后看浮窗 | 只测 CLI 库存、不测 Kernel 准入 |

## 不要做

- 不要为新来源再开 Controller fold、Auxiliary `cycleKeys` 或直连 open。点击与快捷键只走 `companion-task-command-v1`。
- 不要把 CodexHost 额外进程（Grok/OMP/Cursor harness）做成第四套平行车道；那是 Codex 车道上的 Host 身份。
- 不要默认打开新来源，除非当前用户原话要求默认开。
- 不要用预检 `accepted` 代替「卡片在动态列表里」。

## 代码落点

- 身份：[companionProvider.ts](../../src/domain/companionProvider.ts#L1)
- Kernel：[task-kernel.cjs](../../preload/companion/task-kernel.cjs#L1) `TASK_KINDS` / `PROVIDER_TRAITS`
- 架构现状：[ARCHITECTURE.md](ARCHITECTURE.md#L1) Companion Providers
- 包装漏模块：[error-memory/new-preload-module-missing-from-packaging-manifest.md](error-memory/new-preload-module-missing-from-packaging-manifest.md#L1)
- 静默丢卡：[error-memory/kernel-must-admit-manifest-taskkind.md](error-memory/kernel-must-admit-manifest-taskkind.md#L1)
