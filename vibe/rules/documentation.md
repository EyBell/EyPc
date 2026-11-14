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

### 项目级同步 Hook 自动构建核验

用户于2026-11-13选择以项目级同步 Hook 自动运行 `npm run build`，取代同日先前的 Grok 子 Agent 路线；构建无需模型执行，也无需逐轮询问。此处“打包核验”指运行项目的 build 脚本，不额外生成 asar、替换安装包、加载插件或重启宿主；这些动作不在本条授权内。

1. 入口为 [.codex/hooks.json](../../.codex/hooks.json#L1) 的同步 Stop command Hook，执行 [构建检查器](../../scripts/codex-build-stop.mjs#L1)。Stop 是回合结束事件，不能据此认定整个任务完成。检查器按检出根目录串行执行，初次建立成功基线；之后按构建输入和产物指纹复用结果。纯文档或规则修改不影响这些输入时跳过构建。
2. 检查器从当前检出根目录运行 `npm run build`，沿用 [package.json](../../package.json#L12) 中的合同检查、类型检查、Vite 构建、uTools runtime 准备与 `validate:utools` 完整链路。不得以单独 prepare、语法检查或旧 dist 的校验代替当前源码构建，也不得删减门禁来取得成功。构建期间输入变化或产物缺失不计成功。
3. 构建失败时以 Stop 的 block/reason 将原因交回当前 Agent；修复判断仍由主控负责。只有 Hook 回传真实失败后，模型才定向修复源码或 Hook 接入原因，修复后交回自然 Stop 重验。相同失败输入不自动重跑，Hook 已续接的回合不再无限 block；同会话最多两次自动续接，失败仍须明确报告。缓存只保存摘要、退出结果对应的状态和成功产物身份，不保存原始构建输出、聊天或凭据。缺失结果、锁占用、Hook 异常或未知不计构建通过，也不为此启动模型测试。
4. 成功时回传 `core / host / renderer / builtAt`；主控核对结果后才接受构建交付。输入未变且已有检查器成功结果时复用，不重复运行同一链路。此项授权不扩大到全量测试套件、真实宿主操作或发布；构建成功不能替代真实任务执行与宿主验收。新定义须经 Codex 原生 Hook 审阅与信任，配置存在不等于事件已运行。
5. 每次本项目 Stop 检查在 `.codex/build-hook/receipts/` 写独立回执，最多保留最近100份；记录开始与结束时间、匿名会话摘要、入口来源及 `running / rebuilt / reused / failed / locked` 状态，附构建是否尝试、退出码及成功产物身份。命令入口标记 `hook`，直接调用处理器默认标记 `manual`，不得混作自动触发证据；入口来源不单独证明宿主确实发出了 Stop。中途退出保留 `running`，不能当作成功。回执不保存原始事件、聊天、命令或构建输出，写入失败须报告 Hook 未完成；范围外的事件不建回执。

### 收尾门禁

1. 按上节由项目级同步 Hook 自动运行 `npm run build` 并通过完整构建链路。Hook 尚未获信任、不可用、没有回传结果、锁占用或状态未知时，只报告接入缺口并等待 Hook 核验；不手动运行 build，不把直接调用 `handleStop` 伪装成 Stop 事件。除非用户明确另行授权手动诊断，不把 manual 处理器当默认替代。Hook 回传真实失败后，模型才定向修复源码或 Hook 接入原因，修复后由自然 Stop 重验。缺失结果、锁占用或未知不得当作成功，也不为此启动模型测试。不另派构建 Agent。
2. Hook 已回传成功事实后，运行 `node scripts/validate-requirements.mjs --write-current-truth` 回写 [PRODUCT_REQUIREMENTS.md](../specs/PRODUCT_REQUIREMENTS.md#L1) 全局真值快照（核心版本、构建产物、`builtAt`、登记统计）。收尾文档和真值只复用已有事实；Hook 未回结果时不编造新产物，也不把未验写成已验。
3. 若本轮为实质交付且 Hook 已回传产物事实，在 [PROJECT_STATUS.md](../specs/PROJECT_STATUS.md#L1) 用同一 `host / renderer / builtAt` 更新当前产物句，并提醒用户重新接入 uTools 开发插件或安装新包。
4. 架构代际跃迁（如 V7→V8）时，先改 [eypc-core-version.mjs](../../scripts/eypc-core-version.mjs#L1)，再同步合同、登记与帮助文档。

### Agent 主动提醒

每轮实现/修复/重构收尾的 `E 提醒事项` 或 `D 推荐代做` 中，若本轮触及上述路径且未跑完步骤 1–2，必须显式提醒用户（或代跑）**版本真值同步**与 **uTools 重载**，并给出终端摘要中的 `core` / `host` / `renderer` / `builtAt` 四元组供对照。

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

2026-11-14 14:31 生产投影：当前 c222 周 99%，排除两个重复 Codex 窗口，其余 Codex 61%，Cursor Models 45.4%；Cursor Grok Bot 留在 Cursor。宿主手测未验，最终构建为 V7 / host-792c101e812567f159e2 / renderer-a231c1aa0813d0e7c024 / builtAt 2026-11-14T06:45:24.329Z。


- 需求条款有新增或变更时，先完成上述 [需求登记收尾门禁](#收尾门禁)。
- Medium and larger tasks update the process hub and task verification record.
- Stable implementation decisions update architecture knowledge.
- Verification records must list commands, results, and unverified gaps.
- Keep project-specific facts in this repository; cross-project principles stay in CodeNote.
- For uTools host/preload/window/HMR/packaging/Esc/`mainHide`/hotkey technical archival: write the durable guide or error record into the CodeNote uTools module. Task folders keep only raw requirement and verify evidence. Local `vibe/knowledge/error-memory/utools-*.md` files remain thin pointers, not second full copies.

- 2026-11-14 账号去重与重置展示的用户说明已同步 [Codex 帮助](../../src/help/guides/codex.md#悬浮球与展开卡片)；需求登记与状态说明同步，最终构建已通过，宿主手测未验。
