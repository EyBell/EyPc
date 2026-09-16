# 上一／下一互斥优先级

spec_id: SPEC-260915-COMPANION-CYCLE-PRIORITY
status: implementation-landed / focused-automated-verified / artifact-ready / host-not-tested

## 需求裁决

decision_status: explicit-current-request。用户本次已明确选择四级互斥，无待决分支。[RAW-222](raw-requirement.md#L1) 是本轮唯一需求来源。

| 序号 | 优先级 | 合格根任务 |
| --- | --- | --- |
| 1 | 进行中 | 可见、未暂停、可打开的 running，保留活动时间窗与置顶豁免 |
| 2 | 待输入 | waiting-input / waiting-approval，包含当前 Plan 交互 |
| 3 | 已完成未读＋待继续 | completed 且 unread；以及列表内 stopped（含可执行 Plan） |
| 4 | 已读置顶 | completed 且已读，具有本地或来源置顶 |

每次只发布最高非空层。普通已完成已读、unknown、子任务、已隐藏、暂停、不可打开和未启用来源不入环。待继续仅并入第三级候选，不改相位、未读、列表组或专用入口。查看进行中、待输入或待继续任务本身不会让它退出。已完成未读按 RAW-221 在快捷打开成功派发后成为本轮已读并重新筛选；只有状态或资格变化让该层无合格项才进入下层。

## BusinessChangeReview

- baseline sources/version：[RAW-182](../../requirements/shared-raw-182.md#L1)、[RAW-183](../../requirements/shared-raw-183.md#L1)、[RAW-188](../../requirements/shared-raw-188.md#L1)、[RAW-215](../../requirements/shared-raw-215.md#L1)、[RAW-221](../../requirements/shared-raw-221.md#L1)；修改前 HEAD c5e93fc。
- allowed delta：改写通用循环优先级与互斥性；待继续并入第三级、已读置顶成为第四级；冻结只保留同一合格集合中的顺序，不保留已失格成员；候选变化取消尚未派发的失格循环请求。
- preserved invariants：Kernel 单一候选权威；来源中立、层内最近提问倒序及稳定并列；连续按键合并和全局并发一；普通点击/专用入口仍可打开环外项并保留高亮；角标按真实状态计数；专用未读入口按 RAW-188 独立兜底；RAW-221 本轮已读与原生确认分离；隐藏/暂停/来源关闭均排除。
- affected consumers：Kernel buildViews → Navigation sync/held ring/排队派发 → Main、Float、全局及局部上一／下一命令；帮助与需求、架构、历史规则登记。
- test expectation changes：authorized-behavior-change；旧各层并集改为四层互斥、旧 plan/fallback 归类调整、已读置顶环排除改为第四层、旧冻结失格成员改为立即裁剪；保留独立状态、专用入口、排序和并发断言。
- selected evidence/results：先用新行为回归拒绝旧实现，再运行 Kernel/Navigation/shortcut-read、公开投影与 Controller 相关套件；生产 preload/内嵌帮助影响产物，选择构建（含类型检查）、镜像及需求／来源／引用校验。结果续写于验证节。
- unresolved decisions/coverage gaps：无本轮需求待决；既有未登记来源片段与其他模块验收不在本轮范围；真实 uTools/原生宿主不启动或重载。

## 连续切换与异步边界

同层 metadata 重排不扰动正在遍历的顺序，新合格项追加；隐藏、完成降级或更高层出现时，按最新 cycleKeys 立即裁剪旧环。游标按旧邻接顺序恢复，若无共同候选就从新层边界开始。已经派发的原生操作无法撤回；未派发旧请求取消，迟到结果不得夺回失格游标。所有层为空返回无可切换任务。

## VerificationImpactTrace

变更边界：候选筛选＋导航冻结／排队。聚焦测试覆盖四级双向跳转、跨来源、隐藏全部类别、状态升降级、迟到回执、同层重排、专用入口和即时已读。生产构建由 preload 与内嵌帮助变更触发；不运行全仓测试、MQTT 或真实宿主。没有扩大验证触发。

## 验证与交付

| 序号 | 层面 | 结果 |
| --- | --- | --- |
| 1 | 红绿证据 | 新增 5 个行为回归在旧实现上全部失败，明确拒绝各层并集、保留失格缓存成员与派发失格排队目标；修复后通过 |
| 2 | 自动回归 | Kernel、Navigation、shortcut-read、TaskPackage、Presentation、Controller、Codex UI 共 7 套件 330/330；旧断言只在本节允许的通用循环范围内更新，保留 Plan 暂停/恢复、状态分组、角标、专用入口及并发约束 |
| 3 | 构建 | 合同生成检查、语义类型检查、生产构建、uTools 产物校验通过，94 组三侧源码/public/dist preload 逐字节一致；EyPc V7，构建时间 2026/09/15 17:18:40，host-27cfc29ab25a704d1ec6，renderer-bc38fb20131e59778cc4 |
| 4 | 需求与文档 | RAW-222、原始来源、范围取代关系、当前 PRD、帮助和架构同步；需求登记与来源锚点、受影响文档链接检查通过 |
| 5 | 边界 | 未启动或重载真实 uTools/原生应用，未验收现场体验；本轮未提交/推送。既有主入口预算超限与启动卡顿验收仍属单独未决项，不以本轮定向测试结案 |

实现：[Kernel 类别资格](../../../../preload/companion/task-kernel.cjs#L644)、[Navigation 实时资格](../../../../preload/companion/navigation.cjs#L241)。回归：[Kernel 四级场景](../../../../tests/platform/companionTaskKernel.test.ts#L4743)、[Navigation 在途变更](../../../../tests/platform/companionNavigationBridge.test.ts#L638)。
