# Windows 二次悬浮与 Codex 识别诊断复核

Tool: codex

状态：插件内采证与 Windows 透明重绘修复候选已生成，整合验证通过；现场因果与用户验收仍未闭合。

## 本轮续修范围

- 2026-11-09：新现场日志确认加载上一候选；CLI 在启动阶段未发现可运行候选，三次悬浮几何和 DOM 读回一致，实际绘制仍待取证。
- 用户授权继续补 CLI 候选未命中原因、模块加载状态和 Windows 悬浮窗实际绘制诊断；有证据的缺陷直接修复，生成候选供用户在 Windows 重新打包验证。
- 分工：主对话负责 Windows 绘制诊断、整合和文档；一位执行子代理负责 CLI 模块／候选诊断及聚焦检查。`planned_child_count=1`；模型继承当前宿主，`requested_model=inherited / configured_model=inherited / observed_model=unverified`，无模型覆盖。
- 本轮验证影响链：CLI 模块加载 → 候选发现 → 启动拒绝／诊断落盘；窗口展开收起 → 原生绘制证据 → 有界诊断产物；资源清单 → public/dist → Runtime Identity。复用聚焦测试，入口／资源／身份变化触发预算、类型、合同及生产构建；真实 Windows 验收由用户执行。
- 用户随后选择先交 Windows 本机 Codex 排查；本机执行子代理已停止，无代码修改或在途命令。上述实施分工收束，改由可复制的现场排查提示承接。
- Windows 回传已能运行桌面应用目录的 CLI 和 Node，但日志／窗口取证受访问限制；未改插件，未独立复核运行身份。现沿原授权恢复插件内诊断实施：CLI 记录模块与搜索原因，悬浮记录页面捕获与显示器窗口区域的像素摘要；仅保存摘要，不保存截图或会话正文，能力缺失和拒绝访问均显式记录。仍不把取证限制当作插件故障。

## 复核目标与已知事实

- 首轮 Windows 日志确认加载 `host-3a5c454625e601751199 / renderer-259c07bbb9d78f551ae0`；随后 19:27 日志确认加载 16:50 候选的 host-bfbcd1b6df99ec196a64 / renderer-8abf1a07c6692593a16d。不能用 Mac 的旧安装包解释本次问题。
- 第一次悬浮展开、移开收起正常；第二次上侧悬浮偏移并不展示。既有日志没有输入、几何、渲染观察链，尚不能确定现场原因。
- Codex 清单读取有两次 `provider-read-failed`；旧记录没有失败阶段和细分类别，不证明识别流程正常，也不能证明全部识别异常均由它引起。
- 定位锚点与识别业务规则保持既有合同；本轮处理原生透明重绘和诊断，模拟窗口不作为 Windows 宿主验收。

## 发现与纠正

| ID | 等级 | 结论与依据 | 影响与纠正 | 当前状态 |
| --- | --- | --- | --- | --- |
| W-1 | P1 | 上轮只在展开状态变化后记几何日志，没有覆盖页面拦截、宿主交互占用以及重复请求。 | 补上侧命中与拦截原因、展开意图、请求到达／忽略、原生失败日志；鼠标帧按固定事件和状态去重，跨离开后重新记录。 | 已修正，组件与桥接测试通过。 |
| W-2 | P1 | 面板原“可见”判定只有尺寸和 CSS display/visibility，没有检查可视范围或透明度，也缺少请求关联。 | 补面板位置、视口交集、文档可见性、CSS 透明度、原生可见性与透明度、显示器缩放；用请求序号、几何序号与窗口代次关联。CSS 可见仍不等于物理屏幕呈现成功。 | 已修正，窗口外及完全透明面板均不会报可见。 |
| W-3 | P1 | 实测主入口为 14860 行，超过原预算 14818 行；上轮遗漏该门禁。 | Codex 错误分类、公共错误投影和诊断整形拆到独立模块；主入口降为 14808 行，预算随之收紧为 14808，没有放宽。模块加入统一资源清单，原公共错误分类和文案保留。 | 预算及防增长回归通过。 |
| W-4 | P2 | Codex 原失败记录不能区分启动与清单请求，也缺少 JavaScript 错误类别；之前的测试没有验证实际诊断文件中的字段。 | 补有限错误名、原生错误码、RPC 错误码和启动候选摘要；新测试通过真实诊断写入器写临时文件，检查字段保留及原始错误文本、命令和路径不落盘。 | 诊断与持久化测试通过。 |
| W-5 | P1 | 收起后使用原生透明度 0.99→1 强制重绘。Electron Windows 实现会设置分层窗口及统一 alpha；Microsoft 说明该调用与后续分层更新存在兼容性限制。触发时序与首次收起后异常吻合，但未取得现场像素，尚未实证因果。 | Windows 收起改为 `invalidate` 重绘，取消该平台的透明度切换及回调中的几何写入；延迟回调仍检查窗口代次、交互和收起状态。 | 源码修正及三轮重复悬浮回归通过，真实呈现待验。 |
| W-6 | P1 | DOM 可见及窗口尺寸正确仍不能说明屏幕像素正确；Windows 外部读取工具受限。 | 由插件在调试日志启用时采集“屏幕窗口区域→页面捕获→屏幕窗口区域”，记录透明占比、像素指纹、颜色差异、客户区及运行版本。首 12 次几何变化、有界超时、过期拒绝；只在内存裁剪和比较，不保存截图。 | 像素差异、DPI／负坐标、权限／能力缺失、超时、代次过期及真实日志落盘回归通过。 |
| W-7 | P1 | CLI 模块加载失败和候选未命中原来都可能回退为相同的空候选；失败后重新扫描不代表当次启动现场。 | 启动时记录四个关键模块的加载、导出与工厂状态；按搜索来源记录缺失、拒绝访问、非文件、不可运行、shim／Node／入口等计数。错误对象关联当次安全计划快照，不重新扫描；缺快照显式为未知。 | 28 项模块／候选／持久化回归和 6 项既有启动桥接定向检查通过；Windows 自动发现未命中的现场原因仍待新日志。 |

W-5 的上游依据：[Electron Windows SetOpacity 实现](https://github.com/electron/electron/blob/main/shell/browser/native_window_views.cc)与 [Microsoft 分层窗口限制](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setlayeredwindowattributes)。它们支持移除兼容性风险，不代表已验证用户所用 uTools 的 Electron 版本或绘制后端。采证使用 [uTools 窗口 API](https://www.u-tools.cn/docs/api-reference/window.html)及[屏幕 API](https://www.u-tools.cn/docs/api-reference/screen.html)，运行时不支持则记录 `unsupported`，不调用 Windows SDK 或静默改用外部工具。

## 实现入口

- [页面悬停与展开意图](../../../../src/FloatApp.vue#L1538)：记录决定所需的布尔状态和固定原因，不改变原命中、拖动与展开决策。
- [宿主窗口观察](../../../../preload/codex/float-bridge.cjs#L477)：原生呈现状态、请求接收和几何前后读回。
- [Codex 诊断模块](../../../../preload/codex/runtime-diagnostics.cjs#L3)：有限分类、请求失败阶段、启动摘要和退出诊断。
- [统一资源清单](../../../../scripts/utools-preload-assets.mjs#L22)：新模块随源码、公用镜像和生产产物同步。
- [Windows 像素采证](../../../../preload/codex/float-paint-diagnostics.cjs#L5)：安全摘要、DPI 裁剪、先后比较和有界采样；[绘制回归](../../../../tests/platform/codexFloatPaintDiagnostics.test.ts#L1)。
- [Windows 收起重绘](../../../../preload/codex/float-bridge.cjs#L978)：仅请求重绘，保持锚点与原生透明度；[窗口回归](../../../../tests/platform/codexFloatWindowBridge.test.ts#L1190)。
- [CLI 模块加载状态](../../../../preload/index.js#L707)、[候选未命中计数](../../../../preload/codex/launch-path-preference.cjs#L85)、[启动解析类别](../../../../preload/codex/launch-plan.cjs#L93)、[当次失败快照](../../../../preload/codex/runtime-diagnostics.cjs#L10)及[定向回归](../../../../tests/platform/codexCliDiagnostics.test.ts#L66)。

## 16:50 候选验证

- 影响链：页面输入 → Float preload → 宿主 IPC → 原生窗口观察；Codex RPC → 失败分类 → 诊断写入器；统一资源清单 → public/dist → Runtime Identity。
- 本轮选取悬浮桥接、Codex 诊断、诊断写入器、入口预算回归，共 74 项；App Server 启动相关 2 项；组件悬停／拖动／收起相关 5 项；Runtime Identity 6 项。共 87 项通过。
- 新诊断模块已进入资源清单，99 组源码／public／dist 逐字节一致，生产身份与当前源代码计算结果一致；镜像门禁报告 98 组已跟踪、1 组新增未提交。
- 修改了入口、preload 资源清单和页面诊断调用，因此执行合同检查、语义类型检查、生产构建和 uTools 源／包产物校验。
- 当时产物：EyPc V7 / `host-bfbcd1b6df99ec196a64` / `renderer-8abf1a07c6692593a16d` / 北京时间 `2026-11-09 16:50:16`；后续 Windows 19:27 日志确认已加载，故障未解决。
- 未运行全仓套件、真实 Windows 悬停、Codex 原生清单读取或宿主自动化；Mac 的运行状态不用于 Windows 验收。

## Windows 回传后的候选与验证

- 当前候选：EyPc V7 / `host-a042aee90a2444e80c74` / `renderer-097465087482145ac72b` / 北京时间 `2026-11-09 20:03:25`。取代 16:50 候选，工作区 dist 已生成；未在 Mac 安装或重载，待用户打包到 Windows。
- 整合运行绘制、悬浮桥接、CLI 模块／候选、错误持久化、公共诊断、入口预算及运行身份七份测试共 112 项；另选 App Server 启动及 Windows shim／Volta 相关 6 项通过，未选的 298 项保持未跑。合计 118 个不同检查项通过；帮助文案更新后另复核运行身份 6 项，不重复计数。
- 类型、合同、生产构建和 uTools 源／包保全校验通过；入口为 14797 行／279 个 Codex 函数／160 个可变绑定，预算同步收紧至实测值。
- 资源镜像门禁通过：98 组已跟踪、2 组新增未提交；额外逐字节核对全部 100 组源码／public／dist 一致，生产身份与当前源码计算结果一致。本轮没有新增 CLI 运行模块；新增绘制模块已进入统一资源清单。
- 未运行全仓套件、真实 Windows 悬停、实际 Codex 清单读取或外部宿主自动化。CLI 自动发现未命中的原因与屏幕呈现修复效果仍待新运行日志。

## 待实机核验

- 在 Windows 加载本次产物，复现第一次展开、正常收起、第二次上侧悬浮，并回传完整的本次运行日志。
- 用输入事件、请求到达、目标／实际／延迟坐标和渲染观察的关联字段区分输入拦截、原生偏移、窗口隐藏或页面未展开。
- 用 Codex 清单失败的阶段与错误分类继续定位识别问题；根因未知时不改识别业务规则。
- `codex-cli-modules` 先区分模块加载状态；失败记录中的 `search` 按来源给出计数与安全错误码，`launch` 是错误对象关联的当次计划。没有快照时为 null，不能解释为“没有安装 CLI”；Windows 回传的终端版本探测也不代表 uTools 的发现结果。
- 本轮像素采证要求诊断开启且为 debug；日志中 `float-paint/capture` 的 `beforeComparison` 与 `afterComparison` 是像素差异，不能单独当作“屏幕可见”判决。遮挡、动画、捕获本身引发刷新或权限拒绝都需要结合其他字段解释。
- 当前构建与加载状态见[项目状态](../../PROJECT_STATUS.md#L3)，定位合同与实机边界见[架构记录](../../../knowledge/ARCHITECTURE.md#L24)。
