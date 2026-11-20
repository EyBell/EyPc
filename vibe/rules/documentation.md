# EyPc Documentation Rules

Tool: tool-neutral (codex, claude, and any CodeNote-routed agent)

Consolidation follows [Single Authority And Current Entry](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/process/documentation-impact.md#single-authority-and-current-entry). This adapter keeps only local paths and constraints.

## Tiers

- Project process hub: [../specs/PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1).
- Unique global current product truth: [../specs/PRODUCT_REQUIREMENTS.md](../specs/PRODUCT_REQUIREMENTS.md#L1) — 所有原始需求与后续变更裁决后，功能现在应该怎样表现；不得建立平行当前 PRD。
- Requirement identity, status and supersession: [../specs/requirements/README.md](../specs/requirements/README.md#L1) — 某条条款是否还作数、还有哪部分作数、是谁说的。
- Task docs: follow CodeNote process date grouping under `vibe/specs/`.
- Durable architecture: [../knowledge/ARCHITECTURE.md](../knowledge/ARCHITECTURE.md#L1).
- Companion Provider 接入步骤: [../knowledge/companion-provider-onboarding.md](../knowledge/companion-provider-onboarding.md#L1).
- Harness 抬头缩写（CodexHost / Orca / Paseo 共用）: [../knowledge/harness-title-abbreviations.md](../knowledge/harness-title-abbreviations.md#L1).
- Code onboarding map (requirement → module → measured line, not a second PRD): [../knowledge/code-map/README.md](../knowledge/code-map/README.md#L1). Core flows also load from [`.codemark/codemark.json`](../../.codemark/codemark.json#L1).
- Technical implementation memory: [../knowledge/technical-details.md](../knowledge/technical-details.md#L1).
- Error memory: [../knowledge/error-memory.md](../knowledge/error-memory.md#L1).
- Data notes: [../ai-db/README.md](../ai-db/README.md#L1), with AI-DB storage and naming delegated to [CodeNote DB governance](../../../../../czz/CzzProj/CodeNote/DevelopRef/调试工具/db/governance/README.md#5-workspace-shape-and-naming).
- Reusable uTools plugin development guides and failure usage: [CodeNote uTools module](../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/README.md#L1).
- End-user feature operation guides (settings「说明」): [guide registry and loader](../../src/help/guides/index.ts#L1).

## Process Contract

- `Quick` has no Task file; `Standard` non-requirement uses one `task-card.md`; `Standard requirement` uses `raw-requirement.md + spec.md` with the `Spec owner`; `Controlled` uses the five-file ledger.
- Local `L0/L1` maps to Quick, `L2` defaults to Standard, and `L3/L4` maps to Controlled. File count alone does not promote a task.
- Process owner: [process/rules.md](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/process/rules.md#L1).
- Rollout owner: [codex-evolution/rollout/README.md](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/codex-evolution/rollout/README.md#L1).
- Runtime owner: [codex-evolution/runtime-supervision/README.md](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/codex-evolution/runtime-supervision/README.md#L1).
- Communication owner: [process/communication-io.md](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/process/communication-io.md#L1).
- 可发布主题交付或实际发版时，主题登记、发布时发现与回填读取 [topic-release-registration](../../../../../czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/ops/rules.md#topic-release-registration)。

## Feature Help Guides (required)

User-facing operation help is product surface, not optional developer notes. Authority for coverage is [featureRegistry.ts](../../src/runtime/feature/featureRegistry.ts#L1) `FEATURES` plus the matching Markdown imported by [the guide registry](../../src/help/guides/index.ts#L1).

### When a guide is mandatory

- **New feature type / Tab** (`AppTabId`, `FEATURES` entry, default feature config, and usually `plugin.json` feature): add `[id].md` in the same change. The settings「功能开关」row must open a non-empty guide; coverage is asserted by `missingFeatureHelpIds()` / the feature-help unit contract.
- **User-visible behavior change** on an existing feature (workflow, shortcuts defaults, risk/boundary, enablement default, platform capability, uTools entry): update that feature’s `[id].md` in the same change. Do not leave the guide describing superseded behavior.
- **Shared cross-feature keyboard/workbench** changes (Quick Jump, left/right drawers, Escape recovery, edit soul): update [settings.md](../../src/help/guides/settings.md#L1); other guides only adjust cross-references if their local wording becomes wrong.
- **Removed or renamed feature id**: remove or rename the matching guide file and keep `FEATURES` ↔ guides 1:1.

### Writing constraints

- Write for end users: operable steps, defaults, risks/boundaries, and effective default shortcuts (note they may be rebound).
- Do not paste RAW ids, source paths, error-memory, private IPC, or unverified acceptance promises.
- Prefer current page/runtime/Spec behavior over stale storefront blurbs or lagging PRD bullets; if PRD drifts, record the gap in the task process doc—do not silently ship outdated user help.
- Guides are build-time embedded (`?raw`); do not load `vibe/` at runtime.

### Closeout checklist item

Medium/larger feature or interaction tasks must list whether the matching `src/help/guides/{id}.md` was added or updated, or explicitly state why no user-visible guide impact exists.

## Build And Core Version Sync (required)

EyPc **核心版本**（当前架构代际，如 `EyPc V7` / `V7`）由 [eypc-core-version.mjs](../../scripts/eypc-core-version.mjs#L1) 唯一声明；`hostAssetId` / `rendererAssetId`、运行合同 revision 链与 `builtAt` 由 [utools-runtime-identity.mjs](../../scripts/utools-runtime-identity.mjs#L1) 与 `public/runtime-identity.cjs` 生成。

### 何时必须同步

任何会改变 Runtime Identity 输入或生产/uTools 产物的迭代（`src/`、`preload/`、`contracts/`、`public/` 预加载镜像、`vite` 构建边界、Companion 合同生成）在收尾前必须完成版本同步，不得只改代码不更新真值。

### 前置 closeout 与同步 Stop 共用构建检查器

用户于2026-11-16明确选择 F1：代码/规则完成后、最终回复前，显式运行 `node scripts/codex-build-stop.mjs --closeout`，等待完整构建链路结束，复核身份及当前输入对应产物，再同步真值。此授权替换2026-11-13方案中“仅允许自然 Stop、默认不手动运行检查器”的限制；自然 Stop 保持原定义作兜底，与前置入口共用一个检查器，无需逐轮另问。此处“打包核验”仅指项目 build 链路，不额外生成 asar、替换安装包、安装或加载插件、重启宿主、发布，也不扩到自动行为测试或实机验收。本次仅落实 F1，不代表原 `build-hook-lock-scope` 整个方案落地，不调整锁等待、范围登记或上传。

1. 前置入口为 `node scripts/codex-build-stop.mjs --closeout`；[.codex/hooks.json](../../.codex/hooks.json#L1) 的同步 Stop command Hook 继续调用同一[构建检查器](../../scripts/codex-build-stop.mjs#L1)作兜底。两入口共用同锁、同摘要及输入/产物指纹，按检出根目录串行执行，初次建立成功基线；输入与产物未变时复用成功结果。纯文档或规则修改不影响这些输入时不重建。Stop 是回合结束事件，不能据此认定整个任务完成；closeout 是手动开发收尾，不是 Stop。
2. 检查器从当前检出根目录运行 `npm run build`，沿用 [package.json](../../package.json#L12) 中的合同检查、类型检查、Vite 构建、uTools runtime 准备与 `validate:utools` 完整链路。不得以单独 prepare、语法检查或旧 dist 的校验代替当前源码构建，也不得删减门禁来取得成功。构建期间输入变化或产物缺失不计成功。
3. 前置 closeout 回传真实失败后，主控定向修复源码或入口接入原因，再调用同一 `--closeout` 入口重验，无需用户额外批准。保留失败记录，相同失败输入不重复构建。自然 Stop 仍以 block/reason 交回失败；Hook 已续接的回合不再无限 block，同会话最多两次自动续接。closeout 不是 Stop，不消耗此额度；两入口的失败都须明确报告。缓存只保存摘要、退出结果对应的状态和成功产物身份，不保存原始构建输出、聊天或凭据。缺失结果、锁占用、入口异常或未知不计构建通过，也不为此启动模型测试。
4. 成功时回传 `core / host / renderer / builtAt`；主控核对当前输入及产物后才接受构建交付。最终核验仍调用同一 `--closeout` CLI，输入和产物未变应返回 `reused`，不另跑 build。此项授权不扩大到自动行为测试、全量测试套件、真实宿主操作或发布；构建成功不能替代真实任务执行与宿主验收。Hook 新定义仍须经 Codex 原生 Hook 审阅与信任，配置存在不等于事件已运行；closeout 成功也不证明自然 Stop 已触发。
5. 本项目检查继续在 `.codex/build-hook/receipts/` 写独立回执，最多保留最近100份；记录开始与结束时间、匿名会话摘要、入口来源及 `running / rebuilt / reused / failed / locked` 状态，附构建是否尝试、退出码及成功产物身份。来源新增 `closeout`（`--closeout` / 手动开发收尾）；Stop command 来源保持 `hook`，手动直接调用 `handleStop` 默认仍为 `manual`。不得把 closeout 或 manual 冒称 Hook；入口来源不单独证明宿主确实发出了 Stop。中途退出保留 `running`，不能当作成功。回执不保存原始事件、聊天、命令或构建输出，写入失败须报告该入口检查未完成；范围外的事件不建回执。

### 收尾门禁

1. 代码/规则完成后显式调用 `node scripts/codex-build-stop.mjs --closeout`，等待完整 `npm run build` 链路成功或当前输入/产物匹配的 `reused` 回执。缺失结果、锁占用、异常或未知不得当作成功；生成期间输入变化或产物缺失也拒绝成功。前置失败由主控定向修复后同入口重验，无需用户额外批准，不另派构建 Agent、不单独 build、不启动额外自动行为测试。自然 Stop 仅作同检查器兜底；不得用手动 `handleStop` 冒充 Hook。
2. 核对成功回执的身份及当前输入/产物后，运行 `node scripts/validate-requirements.mjs --write-current-truth` 回写 [PRODUCT_REQUIREMENTS.md](../specs/PRODUCT_REQUIREMENTS.md#L1) 全局真值快照（核心版本、构建产物、`builtAt`、登记统计）。收尾文档和真值只复用已有事实；没有成功事实时不编造新产物，也不把未验写成已验。最终回复前再调用同一 `--closeout` CLI 核验；输入/产物未变应 `reused`，若变化则按检查器结果重新核对并同步真值。
3. 若本轮为实质交付且检查器已回传产物事实，在 [PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1) 用同一 `host / renderer / builtAt` 更新当前产物句，并提醒用户重新接入 uTools 开发插件或安装新包；提醒不授予安装或重载权限。
4. 架构代际跃迁（如 V7→V8）时，先改 [eypc-core-version.mjs](../../scripts/eypc-core-version.mjs#L1)，再同步合同、登记与帮助文档。

### Agent 主动提醒

每轮实现/修复/重构收尾须先完成上述前置检查。检查器尚未回传成功事实时，必须说明构建及版本真值未验或具体失败；不编造 `core / host / renderer / builtAt`。成功后才对照该四元组、同步真值并提醒 uTools 重载，最终回复如实区分 `source=closeout`、`manual` 与 `hook`；构建通过不写成宿主已加载。本条记录用户选定流程，不证明本轮 CLI、构建或宿主验收已通过。

## 文档关联 SQLite 试点

本试点仅覆盖 `build-hook-lock-scope` 及同任务的预防和规则优化思路，是现有全局互链规则在本项目获准的窄域例外。关系由 [documents.json](../documents.json#L1) 声明，不强求正文重复互链；正文事实、代码证据和历史内容不迁移进索引。非试点文档继续使用原有引用方式。目录只登记以下五份所选文档，不代表整个 `vibe`：

1. `vibe/specs/261113/task-action-path/task-card.md`
2. `vibe/specs/261113/task-action-path/build-hook-lock-scope-guide.md`
3. `vibe/rules/documentation.md`
4. `vibe/specs/261113/task-action-path/task-prevention-memo.md`
5. `vibe/specs/261113/task-action-path/rule-optimization-index.md`

`eypc-rule-optimization-index` 为本项目当前任务级思路入口，`eypc-task-prevention-memo` 为逐目标预防正文；关系继续只由目录声明。R01–R12的逐条状态和O1–O7到P01–P21的映射复用 `updates`：summary内的JSON元数据以 `schema=eypc-task-record/v1` 区分，`supersedes`保留旧快照。JSON声明为本试点唯一可编辑来源，SQLite可重建；该选择不限制其它数据集经明确声明使用SQLite主存。

思路的证据、处置、项目采纳、全局采纳、执行、核验与用户接受独立记录。每个kind+entity_id只允许一个未被取代的当前快照；多条当前快照先记冲突，不从时间先后猜接受。R到O只由objective_ids声明，反向关系查询派生，O只维护prevention_ids。现有通用索引器只核外层schema和引用，不校验内部状态枚举与跨实体取代；消费时须核这些约束。原CLI文本查询含历史，不等于当前状态筛选；逐字段查询方式由思路入口的状态合同承载。

执行者在开工、范围变化和交付时消费与当前目标关联的预防条目，回报实际差异和证据；这是本任务执行约束，尚无新增自动阻断器。规则候选不自动修改全局owner、Hook或产品功能，新对话创建也不授予功能实施权。范围未知与索引异常只阻断依赖它的动作或结论，不扩成全库治理。

查询入口固定为仓库根目录下的 `vibe`，无需另猜 task root：

```bash
python3 -B /Users/gdkmjd/work/czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/scripts/query_structured_assets.py --asset task-documents --root "$PWD" --task-root vibe --collection relations --related-to eypc-build-hook-lock-scope-guide --direction both
```

显式重建、摘要和按文档 ID 查询分别使用：

```bash
python3 -B /Users/gdkmjd/work/czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/scripts/query_structured_assets.py --asset task-documents --root "$PWD" --task-root vibe --build-index
python3 -B /Users/gdkmjd/work/czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/scripts/query_structured_assets.py --asset task-documents --root "$PWD" --task-root vibe --summary
python3 -B /Users/gdkmjd/work/czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/scripts/query_structured_assets.py --asset task-documents --root "$PWD" --task-root vibe --collection documents --id eypc-build-hook-lock-scope-guide
python3 -B /Users/gdkmjd/work/czz/CzzProj/CodeNote/AiRef/VibePractice/Vibe_Rules/scripts/query_structured_assets.py --asset task-documents --root "$PWD" --task-root vibe --collection updates --related-to eypc-rule-optimization-index --limit 30
```

`missing_index`、`stale_index`、`index_mismatch` 都不能当成“没有关联”或查询成功。元数据可随 Git 恢复；派生 SQLite 位于检出私有区，不提交。

## Requirement Registry (required)

需求条款的身份、状态与取代关系由 [需求登记](../specs/requirements/README.md#L1) 唯一承载。`RAW-nnn` 编号是任务局部的——同一个编号在不同任务里是不同需求——所以身份是 `SPEC-<任务>::RAW-nnn`，不是编号本身。

### 收尾门禁

任何新增或变更了需求条款的任务，收尾时必须：

1. 把本轮条款写入登记，`authority` 如实标注 `user-stated` 或 `agent-transcribed`；
2. 取代关系登记为机器边——整条取代用 `superseded_by`/`supersedes`，只失效一部分用 `scoped_relations` 并写明 `scope`；
3. 运行 `pnpm run validate:requirements` 并通过。

未完成上述三项的收尾不成立。这条是门禁而非建议：取代关系一旦只写在散文里就无法机检，而**跨任务的局部取代最危险——被取代的条款在它自己任务的文档中仍标着 `active`，只看那份文档不会发现它已部分失效**。

### 必须停下上报的情形

以下三种不得自行消解，须提交用户裁决：

- `semantic-fork`：采用较新条款会改变用户可见行为；
- `agent-vs-user`：`agent-transcribed` 条款与 `user-stated` 条款冲突——转述不得自动胜过原话；
- 同一条款在两个域都像 Primary，归属无法判定。

其余冲突按「后写入优先」自动消解，并在 [冲突登记](../specs/requirements/conflict-register.md#L1) 记录依据。

### 尚未入册的条款

当前机器扫描有 102 条围栏外有序来源条款没有父 `RAW` 身份；它们已经获得稳定 `SA-*` 来源地址，但仍不是登记需求。无稳定边界的散文继续只保留在来源中。分配需求身份属于需求撰写而非抽取，未经用户决定不得入册。当前范围见 [覆盖账](../specs/requirements/coverage.md#L1)。**登记必须诚实回答哪些还没进来**——一份看起来完整、实则只覆盖一部分的登记比没有登记更危险。

## Closeout
2026-11-14 显示收敛：常态只显示最大时间单位，如 5D、3H、25M；悬停只显示上海时间 YYMMDD-HHMMSS。Codex 每账号一行，Cursor 常态只用账号月周期，悬停分月与 Bot。上次数据和部分数据保留，13 类宿主手测未验。


2026-11-14 14:31 生产投影：当前 c222 周 99%，排除两个重复 Codex 窗口，其余 Codex 61%，Cursor Models 45.4%；Cursor Grok Bot 留在 Cursor。宿主手测未验，最终构建为 V7 / host-792c101e812567f159e2 / renderer-a231c1aa0813d0e7c024 / builtAt 2026-11-14T06:45:24.329Z。


- 需求条款有新增或变更时，先完成上述 [需求登记收尾门禁](#收尾门禁)。
- Medium and larger tasks update the process hub and task verification record.
- Stable implementation decisions update architecture knowledge.
- Verification records must list commands, results, and unverified gaps.
- Keep project-specific facts in this repository; cross-project principles stay in CodeNote.
- For uTools host/preload/window/HMR/packaging/Esc/`mainHide`/hotkey technical archival: write the durable guide or error record into the CodeNote uTools module. Task folders keep only raw requirement and verify evidence. Local `vibe/knowledge/error-memory/utools-*.md` files remain thin pointers, not second full copies.

- 2026-11-14 账号去重与重置展示的用户说明已同步 [Codex 帮助](../../src/help/guides/codex.md#悬浮球与展开卡片)；需求登记与状态说明同步，最终构建已通过，宿主手测未验。
