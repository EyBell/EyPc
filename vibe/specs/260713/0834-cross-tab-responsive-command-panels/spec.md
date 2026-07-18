# EyPc 跨页面响应式命令面板规范

Tool: codex

Documentation level: `controlled`
Status: `accepted`
Raw requirement: [raw-requirement.md](raw-requirement.md#L1)

## Execution Authority

- Control plane: `app-root`
- Sole decision owner: App Root Thread
- Allowed interactive execution surfaces: `main`, `native-thread`
- Automation lane: `not-applicable`
- Surface-to-surface delegation: forbidden
- Main-owned decisions: scope, architecture, high-risk approval, reconciliation, canonical documents and final acceptance

## 任务规则声明

- 全局入口：CodeNote `VibeAi.md` 已读取。
- 项目入口：`AGENTS.md` → [项目规则](../../../rules/README.md#L1) → [文档规则](../../../rules/documentation.md#L1) → [状态中心](../../PROJECT_STATUS.md#L1) → [架构](../../../knowledge/ARCHITECTURE.md#L1) → [Developer Soul](../../../knowledge/developer-soul.md#L1)，已读取。
- Sidecar：Start 使用主线程既有浏览器证据与只读审计；实现阶段最多两个只读 native-thread，Root 独占写入与接纳。
- 既有任务重叠：`partial-overlap`；复用既有收藏、Quick Jump、MQTT 与 Settings 已接纳基线，只实施净增量。
- 文档路由：canonical requirement、项目当前态、架构、技术细节、Developer Soul 与确认后的错误记忆。
- 高风险门禁：真实文件修改、进程终止、DB/SQL、发布、凭据、权限和外部 MQTT 写入均排除。

## Prior Task Overlap

- Document governance：复用 [收藏工作台规范](../../260711/1452-file-favorites-workbench/spec.md#L1)、[Global Quick Jump 规范](../../260626-eypc-global-quick-jump/01-spec.md#L1)、[MQTT 当前同步](../../2606231645-eypc-mqtt-websocket-tab/06-sync-doc.md#L1) 和 [分层快捷键规范](../../260617-eypc-layered-shortcuts-settings/01-spec.md#L1)；历史任务不改写。
- Execution logic verification：上述实现均为已接纳基线，但旧验收没有覆盖跨 Tab 非遮挡面板、统一 Tooltip、Settings 左右命令面板和本轮视口矩阵；旧 Quick Jump 透明样式被本轮需求明确取代。
- Traceability：关系为 `partial-overlap`，决策为 `delta-only + new-task`；复用 Runtime Action、快捷键 layer、收藏目标优先级和 MQTT 目标模型，仅新增共享交互合同与响应式行为。

## 稳定需求

### 命令面板

- `Ctrl/Cmd+ArrowLeft` 打开或切换详情，`Ctrl/Cmd+ArrowRight` 打开或切换动作；编辑控件继续优先拥有系统文本导航。
- 同一 Tab 同时最多一个详情或动作面板；显式目标、冻结目标、焦点和可见多选按统一顺序解析。
- 详情只接受单目标；动作面板可批量，但不适用动作必须显示禁用原因。
- 按钮、右键和快捷键派发同一 action id；打开后进入面板焦点，关闭后恢复触发点或稳定 owner。
- Ports、Favorites、Quick Favorites、MQTT 与 Settings 命令行均使用同一视觉与焦点合同。

### Tooltip 与 Quick Jump

- 每个操作控件必须具有可访问名称和产品内 Tooltip；不能以原生 `title` 作为唯一提示，也不能为同一目标同时显示两套提示。
- Tooltip 支持 hover/focus、有效快捷键、禁用原因、视口夹取和 `aria-describedby`，且不得改变布局。
- Quick Jump badge 使用轻量实底与边框，真实渲染尺寸必须与布局碰撞尺寸一致；优先放在标题锚点或控件角落，中心覆盖仅作回退。

### 响应式与滚动

- `>1100px` 完整停靠；`721–1100px` 停靠时临时收起次级导航；`<=720px` 使用 Tab 内独占面板；`<=520px` 列表改两行/紧凑卡片。
- 页面高度由 Tab Shell 的剩余空间负责，不再硬编码 `100vh - 42px`。
- 页面不能依靠 `overflow:hidden` 隐藏不可达内容；纵向滚动 owner 必须明确，页面级横向滚动必须为零。
- 真正确认、危险操作和原子编辑可保留模态，但必须有最大高度、内部纵向滚动、焦点陷阱与关闭恢复。

## 已确认逻辑缺陷

- Ports 在 `420x680` 下内部宽度约 `640px`，被 Tab 内容裁切。
- 宽屏抽屉使用全屏遮罩并覆盖主内容，且 Ports/MQTT 焦点恢复不一致。
- Favorites 缺少左详情；Settings 和 Quick Favorites 缺少左右面板。
- MQTT 订阅行宣称 `F2` 编辑但实际未绑定，MQTT 快捷帮助会落入 Settings 分支。
- Quick Jump 测试反向锁定透明背景，且布局宽高未应用到真实 badge。

## 验收标准

- Runtime、keybinding、component 测试覆盖目标优先级、左右切换、输入所有权、Escape、焦点恢复、Tooltip 和 Quick Jump。
- 真实浏览器覆盖 `1180x680`、`800x736`、`760x680`、`640x680`、`420x680`、`800x480`、`420x480`。
- 每个视口验证默认页、详情、动作、编辑层、Tooltip 与 Quick Jump；主内容与停靠面板不重叠，最后一个操作可达。
- 完整门禁为 test、typecheck、build、uTools validate、diff check、规则审计和 Markdown code-link audit。
- macOS uTools 仅做安全 UI smoke；Windows/Linux 未经实机不得宣称宿主通过。

## 非目标

- 不新增真实文件删除、移动、重命名、递归扫描或任意目录导航。
- 不新增批量连接、发送或其他外部 MQTT 写入能力。
- 不修改 DB/SQL、发布、权限、凭据或全局 CodeNote 规则。
