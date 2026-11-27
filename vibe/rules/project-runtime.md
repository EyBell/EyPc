# EyPc 本地运行适配器

- adapter_version：1；project_id：eypc；repository_roots：从本文件所属检出根目录解析。
- command_owner：开发收尾的 `npm run build` 与自动 Hook 由 [Build And Core Version Sync](documentation.md#build-and-core-version-sync-required) 维护；需要额外独立 asar 产物时才使用 [隔离构建脚本](../../scripts/build-isolated-utools.sh#L1)。
- state_namespace：自动 Hook 的摘要和检出级构建锁位于 Git 忽略的 `.codex/build-hook/`，不保存构建原始输出；隔离构建使用 `eypc-utools-build.*` 临时目录。均不创建端口或自启动服务。
- secret_boundary：只复制构建所需目录；不读取或输出账户凭据。
- release_provider：unsupported；此适配器不发布远端。

| 操作 | 能力 | 入口与证据 |
| --- | --- | --- |
| status | 只读 CLI | 检出根运行 `node scripts/read-eypc-task-state.mjs --check-version`，可选 `--dir=<端点目录>`。[实载核对](#loaded-core-version-check) |
| build | 支持 | 开发收尾走上方构建主本的前置 `closeout` 与同步 Stop，按同一检查器回执核对构建及产物身份。 |
| 隔离构建 | 支持，按明确需要选择 | `sh scripts/build-isolated-utools.sh` 使用临时目录，不改写检出的 `public/` 或 `dist/`；输出 `ARTIFACT` / `ASAR`。不作为自动 Hook 默认入口。 |
| 本地替换 | 支持，须单次授权 | [替换入口](../../scripts/apply-local-utools.mjs#L1)要求明确提供候选包、已安装包及两者 SHA-256；身份和原生模块一致、旧包无人占用后才备份并原子替换。`--check` 只读，`--apply` 写入；不关闭宿主。 |
| start | 仅 macOS 宿主 | 用户明确要求加载本地插件时，可用 `open -a /Applications/uTools.app` 启动已安装的 uTools；无项目端口。进程与实际插件加载需另行核对，启动命令成功不等于插件可用。 |
| stop / restart / debug | 不支持 | 不终止现有进程或管理端口。 |
| release | 不支持 | 本地产物不构成发布。 |

<a id="loaded-core-version-check"></a>

实载核对复用同一次本地只读快照和握手，不触发构建或任务刷新。`sourceCoreVersion` 是当前源码代际。`host` 含握手和实载 identity。`artifact` 读本检出 `dist/runtime-identity.cjs`。`lastSuccessfulBuild` 读构建状态缓存。`artifactVsLastSuccessfulBuild` 比较后两者。退出码只看 `status`。`match` 是代际、Host、Renderer 和生成时间一致。`same-content` 是前三项一致而生成时间不同。二者均退出 0。`mismatch` 是源码代际或资产不符。`unverified` 是端点、握手或身份缺失。二者均退出 1。参数误用退出 2。CLI 只比较标识。源码输入和完整产物仍走[构建主本](documentation.md#build-and-core-version-sync-required)。[核对实现](../../scripts/read-eypc-task-state.mjs#L204)

构建包含当前检出中相关源文件的未提交改动。加载前须区分开发插件目录和已安装包；不覆盖正在运行的 asar，也不把构建成功当作宿主验收。回退需退出宿主后人工核对并恢复输出的备份。

<a id="companion-task-count-acceptance"></a>

## Companion 任务数与展示验收

2026-11-24 用户选定的 F1。核对 EyPc 当前任务数、角标、分组或图钉时，直接读现有任务包及其展示回执。

1. 在当前 EyPc 检出根目录运行 `node scripts/read-eypc-task-state.mjs`。脚本支持 `--summary` 时可用它直接读取 `rootCount`、`badgeCounts` 和 `groupCounts`。逐条核对用完整输出，跟踪发包和后续回执用 `--watch` 只读监听已运行的宿主。[脚本入口](../../scripts/read-eypc-task-state.mjs#L1)
2. 按 `hostGeneration`、`packageRevision` 和 Main、Float 各自当前的 `windowGeneration` 配对包与回执。从 `consumerReceipts` 或监听的 `receipt` 事件取实际值。匿名 `taskRef` 只在同一宿主代次内配对。[回执出口](../../preload/companion/task-state-bridge.cjs#L1)
3. Main 用可见 `presentation` 回执的实际 `counts` 核对同包 `views.counts` 的 `active`、`input`、`unread`。展开 Float 用可见 `row` 回执按 `taskRef` 核对 `views.groups`、任务相位和图钉来源。有置顶计数字段时分别报原生置顶、本地置顶和置顶组，可从摘要的 `pinCounts.native`、`pinCounts.local` 和 `pinCounts.group` 读取。同一任务可以同时计入原生置顶和本地置顶。
4. 仅收包或应用、隐藏、折叠、视口外、回执缺失或字段不全时，记录实际阶段，展示标为待核验。首包未完整或相关数据仍在核验中时，保留该状态。真实零值须有完整包和相应字段支持。宿主或窗口换代后重新配对。匹配的可见回执与包内值不一致时，记录包号、窗代和对应字段或匿名任务引用。
5. 任务数和展示验收只采用脚本及同包回执。截图、无障碍树、人工数行均不作为取数或通过依据。若发现差异，沿原专题处理，F1 本身只核验现有展示。[同包实测凭证](../specs/261114/codex-state-sync/status-read-investigation-261116.md#script-display-f1-261124)

Codex、Orca、Cursor 和 Claude Code 的原生状态按[项目状态对账入口](local-context.md#project-skills)逐来源核验。2026-11-16 的开发收尾 F1 走[构建主本](documentation.md#build-and-core-version-sync-required)。

<a id="companion-incremental-sync-acceptance"></a>

## Codex 增量同步验收

```bash
node scripts/read-eypc-task-state.mjs --check-version
node scripts/read-eypc-task-state.mjs --summary
node scripts/read-eypc-task-state.mjs --watch
node scripts/read-eypc-task-state.mjs --check-transitions --expect=manifest.json --replay=events.ndjson
```

1. 用 `--check-version` 固定实载身份。从 `--summary` 和 `--watch` 分别读活动名单、归档名单、父子关系和轮次覆盖，再看全来源 `firstComplete`。覆盖回执核对 `sourceGeneration` 和 `readGeneration`，`deferred` 记为后台待补。`firstReadbackAt` 记录首个成功定向回读。首批可用的时间以样本首次全部出现在正确包内为准。活动名单回执的 `verified-index` 表示原生库与落盘文件已对齐，`verified-cache` 表示复用已核实覆盖。重读次数以 `listReads` 的分段增量为准。
2. 先从独立原生记录取得匿名根与成员、Turn、时间精度和预期状态，写入 `manifest.json`。用 `--check-transitions` 核对当前一帧，热更新验收加 `--replay` 对照事前开始的 `--watch` 记录。秒级观察保留原秒。超出诊断成员上限时看 `codexMemberTotal`。只有诊断覆盖已证明包含该范围，才判定目标漏收。
3. 正常和有持久证据的断线热更新分别验 P95 ≤ 2 秒和 ≤ 5 秒。每组至少 20 条匹配的独立原生事件才可判通过。冷启从宿主握手计时，首批有缓存 ≤ 3 秒、无缓存 ≤ 5 秒，Codex 全量核清 ≤ 15 秒，全启用来源可取证时 ≤ 20 秒。冷启超时期间，动态更新继续按自身证据发布。重复通知目标 P95 ≤ 1 秒，活动普通分页、归档分页和活动快索引分页的增量均为 0。歧义补读按每条实发回执核 1 秒截止。
4. Main 角标与 Float 的相位、分组、图钉和按钮沿[同包回执](#companion-task-count-acceptance)配对。继续资格还需核对应根组的只读派发门。实载、统计样本、来源失联和窗口可见各记自己的核验结果。[实施与回执](../specs/261114/codex-state-sync/delivery.md#incremental-state-sync-261126)
5. 热更新回放在清单加入 `"hotUpdate": true`。每项带 `memberRef`、`turnRef` 和 `connectionMode`。`normal` 对应事件发生时该成员已有可信订阅，`disconnected` 对应桥失联且有独立持久证据。先启动 `--watch`，订阅和落盘事件的模式回执随流输出为 `inventory.hotUpdateEvidence`。可提供匿名 `nativeEventRef` 区分同轮的多次事件。脚本按前帧和首个正确包的 `publishedAt` 打分，分别报两组样本不足、漏收、错包和超时。歧义补读用 `queuedAt` 从原成员的 `targeted-dispatch` 回执核实际发出。长时监听可用 `--watch --task-refs=<匿名根引用,匿名根引用>` 只保留目标任务行和全包统计，宿主换代后需更新引用。冷启动另轮核验时可单独运行首批和分段覆盖检查。[架构交付](../specs/261114/codex-state-sync/delivery.md#v7-hot-sync-architecture-261126)
