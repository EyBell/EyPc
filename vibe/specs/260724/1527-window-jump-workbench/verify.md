# Window Jump Workbench — Verification Record

Tool: codex
Updated: 2026-08-01

## Current Status

`wj21-main-child-window-tree / implemented / focused-tests-typecheck-build-static-verified / host-validation-pending`

当前源码把真实主窗口作为稳定持久切换单位，只把桥证明的普通应用成员显示为会话级精确子窗，并保持 Finder/Explorer 虚拟父→真实根两级。Windows 与 macOS 均只接纳用户可见、可操作且身份/关系可验证的窗口；精确成员失败不能回退。

## Executed Development Evidence

- 领域合同覆盖 `WindowFamily { root, children }`、关系/能力证据、完整替换、部分缓存保留及 `root-current`/`member-exact` 判别请求。
- 树合同覆盖普通根/子 level 1/2、同应用独立根、Finder/Explorer 固定两级、搜索临时展开、手动展开保留和子窗焦点回根。
- 子窗合同证明其不进入目标创建、收藏、pin、别名、槽位、多选、页面置顶、强杀或批量动作；只保留精确激活、能力允许时精确关闭、只读详情与 Windows HWND 复制。
- Runtime 合同证明精确成员操作前重验，成功必须返回请求根和请求成员；成员缺失/不匹配明确失败且不重试根或兄弟。根/槽位继续使用 `root-current`。
- 平台合同证明 Windows 使用 `EnumWindows` + 同应用 `GA_ROOTOWNER` 且不使用 `EnumChildWindows`；macOS 为 AX-first，正 CG ID 只佐证身份，CG-only/system/helper 表面不制造产品行。
- 精确 WJ-21 暂存快照的四组变更窗口套件通过 `219/219`；`pnpm run typecheck` 与 `pnpm run build` 通过。build 包含再次 typecheck、Vite production compile、uTools runtime preparation 和 `validate:utools`，未启动 uTools、浏览器、dev/preview server 或原生窗口操作。
- 完整套件 A/B：父提交 `9ba8b91` 为 `661/675`（14 失败），WJ 提交 `d834f7b` 为 `664/676`（12 失败）。两个窗口失败被修复，没有新增失败；剩余 12 项都位于未触碰的 Codex Activity/Companion 文件。
- WJ 快照构建曾报告 `595.12 kB` main chunk 警告；后续独立构建体积批次将其降至 `365.55 kB`，500,000-byte 静态门禁、typecheck、build 和无 Vite 体积警告均通过。
- Renderer、canonical preload 与 public preload 使用同一 `wj21-main-child-window-tree` revision；preload JS 语法、镜像字节一致、关键符号、退役符号、Markdown 链接及 diff whitespace 静态门禁通过。

## Implementation Re-review

- 持久目标、收藏、pin、槽位、编辑、选择、页面置顶、强杀和批量动作保持 root/group-only；子窗保持 session-only 和 fail-closed。
- 从页面命令到 Runtime/platform 的调用链覆盖完整/部分家族、根/成员激活、文件管理器两级、搜索/焦点恢复、准入过滤和最终焦点复验。
- 窗口原生副作用仍只跨现有 Runtime → platform 边界；Files、Ports、MQTT、Codex、存储 schema 和 EzAgentPlatform 未变化。
- 已修复：旧 preload 清单混入、macOS 操作时 CG 范围漏验、平行 inventory 更新、隐藏子窗动作上下文和重复桥类型/树深度推断。静态范围未发现未关闭 P0/P1。

## Required User-owned Host Validation

1. 重载非热更新 preload，确认桥为 `wj21-main-child-window-tree`。
2. 浏览器/IDE 改变当前子会话后，从收藏/槽位激活根并确认落到该根当前子窗，且持久目标不变。
3. 选择一个真实子窗并确认精确焦点；关闭/失效后必须明确失败且不打开根或兄弟。
4. 同应用两个独立根保持两个一级项；Finder/Explorer 永远是虚拟父→真实根两级。
5. 企业微信等应用不显示 CG-only、系统/helper、控件、no-activate、cloaked、透明或宿主噪声。
6. 验证完整/部分清单缓存、搜索临时展开、左右树导航、右键、动作层优先 `Escape`、子窗消失/收起/隐藏后的焦点回根。
7. 验证子窗无收藏/pin/编辑/槽位/多选/topmost/force/batch，只有能力允许时出现精确关闭。
8. 复验持久根真正失效后的 WJ-19 人工候选流程，包括唯一候选、空/部分/替换刷新及一次 `Escape` 回原根。

## Historical Evidence Boundary

| Evidence | Status |
| --- | --- |
| WJ-15 的跨 Space 宿主实验 | 仅为历史平台证据，不能验证当前桥；当前代码无 Space 路径 |
| WJ-17 标题相似自动换绑 | 已被 WJ-19 人工确认替代 |
| WJ-18 标题等值门禁 | 已被实例/AX↔CG 身份证明替代 |
| WJ-20 成员全部隐藏 | 已被 WJ-21 普通根→真实子窗替代 |
| WJ-21 自动化/typecheck/build | 当前有效开发证据，但不等于真实 uTools/native/视觉验收 |

## Documentation Cleanup Verification

2026-08-01 清理只修改文档，不修改生产代码、测试或构建配置；因此不重跑测试、typecheck 或 build。

- 变更文件全部为 `M`，没有删除任何仍有入链的 Controlled 或错误记忆文件。
- 变更 Markdown 的 code-link audit 通过；当前桥源码与双 preload 仍为 `wj21-main-child-window-tree`，canonical/public preload 字节一致。
- 现行权威和错误记忆中的 Space/标题/成员隐藏/CG-only 表述已逐项复核；保留的命中均明确是“已清退/不存在/禁止回流”，没有再作为当前正向路线。
- 目标写集 `git diff --check` 通过。
- 项目 AI-rule audit 的 working 与 HEAD 视图都报告同一组六项历史模板传播缺口（文档 process/template contract 与状态页 W24/W28/W30 等接纳记录）；本轮没有新增或扩大这些既有问题，也未借窗口文档清理扩写项目规则。
