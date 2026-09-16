# 双色贴边线交互

spec_id: SPEC-260915-FLOAT-EDGE-RAIL
status: implementation-landed / focused-automated-verified / artifact-ready / host-not-tested

## 需求与实现

本次用户明确授权实施 [RAW-223](raw-requirement.md#L1)，decision_status: explicit-current-request。

- 设置的展示样式增加 `edge`，原有水球、卡片及默认值保留。共用 `CompanionEdgeRail`，每条 2 DIP，总厚度 4 DIP，长度 120 DIP；同一主题的 Codex/Claude 额度色与现有角标色直接输出。缺少周额度使用空轨，不拿短周期数据冒充；来源关闭不展示其缓存读数。
- 宿主 `float-placement.cjs` 负责屏幕空间的细线锚点、归属恢复、吸附与向内预览布局。40 DIP 内侧槽位为角标（含 99+）留出空间，细线仍为 4 DIP；预览与槽位相隔 6 DIP，不覆盖拖动入口。顶部预览避开 workArea 顶部系统区域，线条本身使用 bounds 上沿。
- `FloatApp` 保留线条 DOM，卡片独立渲染。悬停 200ms，离开 220ms；按下取消悬停并捕获指针，5px 才发送位移；拖动后需离开并重新进入线条才重新启用悬停。按下时只隐藏预览内容，原生窗口尺寸保持到松手；移动阶段只平移，避免活动按压中缩窗影响指针捕获。原任务动作、编辑和列表组件复用。固定属于窗口交互状态，受控重建与拖动期间保留。
- 拖动终点先吸附并写入原生窗口，成功读回后才保存 v2 位置（displayId、edge、edgeOffset、屏幕描述与实际 paint 坐标）。取消、无位移及写入失败均不保存。水球/卡片收起态去除原 12px 宿主间距及 5px 绘制内边距造成的贴边空隙。
- 首选屏幕与临时展示屏幕分离；已有位置不跟随当前鼠标选屏。借屏不写存储；屏幕列表、边界、workArea、缩放变化复用健康检查重新定位；主动拖动才提交新归属。预览开关与内容刷新不覆盖锚点。

## BusinessChangeReview

- baseline sources/version：HEAD `c5e93fc`；[RAW-083](../../requirements/codex-raw-083.md#L1) 的水球分区、当前 Float 原生桥与设置归一化。
- allowed delta：新增双色线形态及独立固定按钮；新形态的命中区、悬停和拖动规则；所有紧凑形态按可见边缘贴边；持久化改为版本化锚点、缺屏借用与归位。
- preserved invariants：现有任务/额度权威、角标零值隐藏和 99+、角标对应动作、预览卡片内部操作、主题配置、旧设置可读；不改变其它来源导航或 Action Runner 窗口。
- affected consumers：设置样式 → Float Snapshot → Float Renderer → preload IPC → 原生窗口；位置保存动作 → Controller 设置归一化 → 下次恢复；源码/public/dist 资源清单。
- test expectation changes：authorized-behavior-change；旧紧凑窗口 x/y 的 17px 间隙改为 paint 贴边；预览 resize 只保存尺寸、不再把预览矩形覆盖为收起态坐标。其它断言保留。
- selected evidence/results：原生桥 VM 回放、纯几何测试、实际 FloatApp 组件事件测试、类型检查与生产构建；结果见下节。
- unresolved decisions/coverage gaps：无需求待决。屏幕归属指显示器，不改现有所有 Spaces 可见策略；真实 uTools 顶层覆盖、刘海、鼠标连续捕获及跨缩放屏幕体感未验收。

## VerificationImpactTrace

变更涉及窗口生命周期、设置持久化、IPC 与交互样式，选取 floatWindow、floatPlacement、codexFloatWindowBridge、codexCompanion、Codex settings 的定向测试。生产资源变化触发构建、镜像、入口预算与需求来源校验，不运行全仓测试或真实宿主。视觉静态核验覆盖相邻无 gap 的 2 DIP 轨道、三位角标槽位、顶部方向、主题 token 稳定、线条 DOM 不替换；实际像素渲染和系统覆盖仍待真机。

## 验证结果

- 自动回归：floatWindow、floatPlacement、Codex settings、原生桥、实际 FloatApp 组件共 161 项通过。最后增加原生忽略位移回归后，桥接 34/34 再次通过；指针捕获丢失/超时解锁补测后，实际 FloatApp 组件 67/67 通过。覆盖四边锚点不跳、周额度空值、200ms/220ms、5px、按钮隔离/移出取消、固定恢复、取消不落盘、跨屏旋转、失败/无实际位移不写归属、实际读回、借屏接回与新窗口恢复。
- 生产构建（含合同检查、类型检查和 uTools 产物校验）通过；最终产物：EyPc V7 · `host-3bc47ebd19fc25b9ca1c` · `renderer-e817a8f1044c77883962` · 北京时间 `2026/09/15 21:12:37`。
- 入口预算未通过：HEAD 与当前 `preload/index.js` 均为 14761 行，相对预算 14679 超出 82 行；本轮未修改该入口，未放宽门禁。测试中的 StatWatcher 监听数量告警在基线已存在，不影响本轮断言。
- 94 对已跟踪镜像校验通过，新几何模块的源码/public/dist 另行逐字节一致；需求、来源与当前真值同步校验通过（2 条既有未确认提案告警保留）；没有真实宿主运行或像素截图验收。uTools 顶部可见性、系统栏/刘海覆盖、物理鼠标连续捕获、多屏缩放/重启体感仍待用户重载新产物后验收。
- 帮助已更新；未提交、未推送。原有导航、Kernel 及其文档变更保持在原工作区。


## 拖动不可用反馈修正

- 用户在上一产物交付后反馈不能拖动；此前自动测试通过不构成真机验收。本轮只读现有诊断未见 Float 几何写入失败，日志未覆盖指针事件，无法据此确认现场唯一原因。
- 修正两个源码可复现阻断路径：`setPointerCapture` 抛出异常时原代码会跳过 dragStart；`lostpointercapture` 会直接取消正在进行的拖动。捕获现在可重试，并由 window pointermove/up/cancel 接续窗口内的事件；明确取消、Escape、失焦和宿主超时仍按原恢复合同处理。
- 去除按下阶段的原生缩窗：双色线只隐藏预览 DOM，保留原视口与线条本地坐标；水球/旧卡片保留按下前形态。移动只平移原生窗口，松手后吸附并重新计算收起/固定视口。避免按压期间改变窗口尺寸主动扰动捕获链路。
- 定向回归：桥接 34/34、FloatApp 68/68，共 102 项通过。新增捕获拒绝后的 dragStart 与 window 级移动/松手用例；更新捕获转移继续拖动、明确取消恢复、预览拖动原生尺寸恒定断言。后续构建及产物真值记录见最新状态。
- 当前结论为源码阻断点已修正、自动回归通过；尚未复验真实 uTools 拖动是否恢复。

- 本次修正产物：EyPc V7 · `host-d84faab0802b1c220a0b` · `renderer-c35acd30d036d82a4754` · 北京时间 `2026/09/15 21:20:12`。合同检查、类型检查、生产构建与 uTools 产物校验通过。


## 底部全宽命中区修正

- 用户再次反馈不可拖，并明确整个底部下半区须显示抓手。只读当前运行日志确认实际加载的是上一修正产物 `host-d84faab0802b1c220a0b / renderer-c35acd30d036d82a4754`，版本未更新不是本次反馈的解释。
- 旧水球拖动入口依赖事件命中圆形 `.float-compact` 并通过其矩形坐标计算；外部透明角落与外边距事件没有入口。新增独立矩形 `.float-compact-drag-zone`，覆盖 root 下半区全宽；贴边线同样覆盖自身槽位下半区。极低 alpha 底色保留命中表面，grab/grabbing 状态可见；数字角标以更高层级保持点击。
- permitted delta：用户明确补充下半区全宽命中，不改变数字角标动作和取消/持久化规则。设置帮助、当前需求与 RAW-223 来源同步。
- 回归 106/106：新增三种形态左/中/右下边缘拖动、无需圆形按钮的测量、数字按钮不启动拖动、实际 CSS 下半区定位和 grab/grabbing/层级断言。新增匿名 Host 拖动 start/native-moved/saved/cancel 诊断；不记录坐标或任务内容。
- 现场根因仍需完整事件链证实；本轮可确认命中范围已与新要求一致，不将离线组件和 VM 测试宣告为真实 uTools 恢复。

- 本轮构建：EyPc V7 · `host-1849b57a9d594698dd00` · `renderer-1a9344e9204272dcbd92` · 北京时间 `2026/09/15 21:28:20`。合同/类型检查、生产构建与 uTools 产物校验通过；真实拖动恢复待验收。


## 日志定位与原生整数坐标修正

- 最新现场日志明确加载 `host-1849b57a9d594698dd00 / renderer-1a9344e9204272dcbd92`。截至北京时间 21:42:05 的记录，21:41:27—21:41:36 共 4 次 drag-start accepted、136 次 drag-move failed，没有 native-moved 或 saved。由此确认输入已到宿主，失败发生在原生位移/读回路径；先前单靠命中或捕获的判断不足。
- 源码缺陷：旧 clampFloatBounds 会取整，新的平移直接把 PointerEvent.screenX/Y 的差值加入原生坐标，漏掉取整。Electron Rectangle 明确要求 x/y/width/height 为整数；缩放下的小数 DIP 或浮点相减尾差会违反约束。[官方结构合同](https://www.electronjs.org/docs/latest/api/structures/rectangle)。已有日志没有保存原生异常详情，因此不宣告这是现场唯一原因。
- 红绿证据：把 VM 原生窗口替身改为拒绝非整数 Rectangle，新增 water/card/edge 三项小数指针位移回归，修改前 3/3 失败；写入前 Math.round 后全部通过。桥接 37 项与独立锚点 8 项共 45/45。之前的替身未执行原生整数约束，说明此前自动通过漏掉了这一边界。
- 诊断同时拆分 write/read/readback 阶段，记录受限错误类别与参数错误分类，不记录原始异常文本或坐标；同次手势同阶段失败去重，避免每帧刷日志。
- 本轮保持下半区抓手、按钮独立点击、5px 阈值、松手读回保存与取消恢复合同。生产产物及真实重载回验状态见本节后续记录。

- 本次产物：EyPc V7 · `host-56c177f012ea5ab27ab1` · `renderer-73c464d8593f40d12280` · 北京时间 `2026/09/15 21:45:41`。合同/类型检查、生产构建和 uTools 产物校验通过；入口仍为既有超限 82 行，本轮未修改入口或放宽门禁。实际拖动恢复未宣告完成。


## 顶部限制与自动切换补齐

- 当前现场已有进展：只读截至 22:08:18 的运行日志确认加载 21:45:41 产物，共 3 次 start、4 次 native-moved、3 次 saved；仍有 2 次 write/TypeError/invalid-native-argument，未证明所有原生异常消失。此轮未操作真实 uTools。
- 源码缺失链路：此前 style 仅来自设置，松手只改位置，根本没有水球/卡片到双色线的自动切换。另一个缺口是角落距离排序始终偏好已贴住的右边，向上拖仍可能无法停靠顶部。
- authorized-behavior-change：按用户本次补充，有效拖动松手后吸附最近边并自动切为双色线，既有 position.save 动作一次写入 position 与 displayStyle；无位移、取消和原生写入失败保持原样。设置仍可显式切回其它形态。沿用之前松手吸附最近边的规则，未增加屏幕中央自由悬浮模式。
- 距任一边 16 DIP 内结合向外位移选择正在靠近的边；其余位置沿用最近边。macOS 选择顶部时同时识别 workArea.y，以免系统菜单栏截停使顶部永远不进入候选。吸附仍请求物理边，最终以 getBounds 实际读回为准；匿名停靠日志新增方向、样式、是否自动转换及 topInset，便于后续确认系统留下的空间。
- [Electron 原生窗口合同](https://www.electronjs.org/docs/latest/api/base-window#winsetboundsbounds-animate) 明确 macOS y 坐标受菜单栏高度限制；设置置顶不等于可覆盖菜单栏。顶横条使用实际允许的上沿，不宣告已实现菜单栏内部挂载。水球自身圆形绘制留白不再参与条状停靠布局。
- 宿主把实际 style 与 geometry 同一状态消息下发，FloatApp 即时使用；无需伪造额度 baseRevision。设置持久化确认前旧快照不覆盖新形态。新条刚出现时抑制悬停，移出再进入后恢复 200ms 触发，避免松手立刻展开。
- 定向测试 125/125：桥接 42、几何 9、FloatApp 73、保存动作 1。新增 macOS 原生创建/移动均截停的替身、顶部切换/刷新/展开锚点/新窗口恢复、显式切回、失败/取消/单击保持、状态先于额度快照即时显示、松手抑制悬停、原动作原子设置写入。真实菜单栏覆盖、跨屏缩放鼠标连续移动和残余原生异常仍未验收。

- 本次生产构建（合同/类型检查/uTools 校验）通过：EyPc V7 · `host-ea0fbde477e437692187` · `renderer-ee95a82fc6d1f135a9aa` · 北京时间 `2026/09/15 22:19:54`。新自动停靠产物尚未重载宿主，状态 `artifact-ready / host-retest-pending`。未提交或推送。


## 2026-09-16 加粗线条与角标贴线

- 根据本次视觉反馈，将每条 2 DIP 加粗至 4 DIP，总厚 8 DIP；长度仍为 120 DIP。角标旧布局在预留槽位中居中，使单数字角标离线更远；现按四边朝线条内侧对齐，线与角标边界恒定间隔 1 DIP。
- authorized-behavior-change：本次规格覆盖最初 2+2 DIP。原生锚点厚度同步为 8 DIP，内侧预留从 36 DIP 调为 32 DIP，总槽位仍为 40 DIP；前端几何一致，99+ 角标仍预留空间。角标层级、独立点击、下半区拖动、悬停和主题不变。
- VerificationImpactTrace：几何厚度影响锚点/边界与恢复，更新既有尺寸断言并运行 floatPlacement、codexFloatWindowBridge、codexCompanion 三套件；业务逻辑未新增，未另增测试。生产源码与 preload 有变化，触发类型检查、生产构建、资源镜像与当前真值同步。四向对齐按 CSS 规则核验，未运行真实 uTools 或像素验收。此前缺少拖出恢复入口的交互问题仍未修正。

- 验证结果：几何/宿主桥/FloatApp 共 124/124，类型检查、生产构建和 uTools 产物校验通过。EyPc V7 · `host-5410250eeacee2b9fe55` · `renderer-6cad8ddfbd2863e8b0e0` · 北京时间 `2026/09/16 09:57:22`，`artifact-ready / host-retest-pending`。未提交、未推送，原有入口预算超限未处理。


## C 微型读数与水球顶部裁剪

- 用户标注概念图右侧 C 微型读数，改用一体窄底板、两路周额度数字、细分隔线与彩色状态点数量。沿用当前 120 DIP 长、8 DIP 双色轨道、40 DIP 槽位，以容纳 99+ 和三个独立任务按钮；采用参考构图，不机械复制概念图中的 18/3/100 尺寸。主题沿用已有 surface/fg/border 与角标色，示意读数不写死。
- authorized-behavior-change：该选择替代前一版孤立角标留 1 DIP 间隙的布局；轨道与底板无缝贴合。额度区域保留拖动与 200ms 悬停入口，状态点按钮保持独立点击/移出取消；水球形态裁去顶部 5 DIP 内边距，将原生窗口由 104×104 改为 104×99，球体本身仍为 94×94。卡片形态顶部边距不变。
- crop contract：水球 paint anchor 至窗口顶部的偏移从 5 改为 0；创建、收起、读回与展开后收起同步使用零偏移。旧位置保存的可见球体位置保留，窗口只移除其上方空间；不会通过拉伸或裁切球体造型填满窗口。系统菜单栏限制是独立边界。
- VerificationImpactTrace：涉及模板呈现和原生定位，增加真实读数/空数据/横向/状态点按钮组件断言，以及顶部水球裁剪后取消/展开收起恢复；调整旧水球尺寸与窗口 y 的授权预期。三套件 126/126 通过（桥接 43、FloatApp 74、几何 9）。此前拖出恢复交互与现场残余原生参数错误不在本次视觉修正中宣告解决。
- 视觉 QA：参考图已核对，源码布局/配色与自动事件用例已核验；尚无同状态原生渲染截图，无法宣告像素对照通过。按用户既有真实 uTools 测试需单独请求的边界，本轮不启动宿主或浏览器；`design-qa: blocked / real-host-pending`，生产产物可交付状态与视觉验收状态分别记录。

- 最终产物：EyPc V7 · `host-9f3764599b2deb15f7e7` · `renderer-32c7e3a4730aa7b46f79` · 北京时间 `2026/09/16 10:02:40`。类型检查、生产构建及 uTools 产物校验通过；`artifact-ready / real-host-pending`，未提交/推送。
