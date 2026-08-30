# Changes：状态因果、置顶折叠与构建身份

本清单由当前 Git 差异核对，仅承载文件范围。需求、核验与集成状态以 [spec](spec.md#L1) 为准；RAW-188 子范围见 [未读/置顶清单](../companion-unread-pin-fallback/changes.md#L1)。

## 行为批次

| 批次 | 核心说明 |
| --- | --- |
| Kernel | 精确当前交互先于终态，稳定 attention 与本地置顶顺序 |
| Codex 同步 | 保留当前 Plan 请求，清除已执行旧 Plan，防止旧 waiting 回弹 |
| Float | 置顶分组可折叠，隐藏任务不占编号，展开后立即重算 |
| 构建身份 | Main/Float 握手透传受管构建时间，Codex 页面展示实际宿主身份 |
| 文档 | 同步两组需求、当前真值、帮助、知识与防错证据 |
| 主目录产物 | main 重建受管身份并同步当前真值，构建目录不入 Git |

## 文件清单

| 文件 | 核心说明 |
| --- | --- |
| [V7 schema](../../../../contracts/companion-v7.schema.json#L1) | Rollout Evidence revision 推进到 V3 |
| [contracts-v7.cjs](../../../../preload/companion/contracts-v7.cjs#L1) | schema 生成的 Node 合同 |
| [合同镜像](../../../../public/companion/contracts-v7.cjs#L1) | 同步受管 preload 合同 |
| [TypeScript 合同](../../../../src/domain/generated/companionContractsV7.ts#L1) | 同步 Renderer 合同 revision |
| [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) | 当前 interaction、latent unread、稳定轮次与显式置顶顺序 |
| [Kernel 镜像](../../../../public/companion/task-kernel.cjs#L1) | 随 canonical owner 生成 |
| [desktop-request-projection.cjs](../../../../preload/codex/desktop-request-projection.cjs#L1) | bare request 消失不关闭仍开放 Plan |
| [请求镜像](../../../../public/codex/desktop-request-projection.cjs#L1) | 随请求 owner 生成 |
| [desktop-activity-aggregation.cjs](../../../../preload/codex/desktop-activity-aggregation.cjs#L1) | 因果胜出的 App Server 不继承旧 Desktop waiting |
| [聚合镜像](../../../../public/codex/desktop-activity-aggregation.cjs#L1) | 随聚合 owner 生成 |
| [rollout-evidence.cjs](../../../../preload/codex/rollout-evidence.cjs#L1) | 结构化文件变更消费旧 Plan；补充 Turn 保留 |
| [Rollout 镜像](../../../../public/codex/rollout-evidence.cjs#L1) | 随 Rollout owner 生成 |
| [Main preload](../../../../preload/index.js#L1) | 接线因果 helper、本地 pinOrder 与构建元数据 |
| [Main 镜像](../../../../public/preload.js#L1) | 随 Main canonical preload 生成 |
| [Float preload](../../../../preload/float.js#L1) | 握手透传实际 artifact 元数据 |
| [Float 镜像](../../../../public/float-preload.js#L1) | 随 Float canonical preload 生成 |
| [Runtime Identity](../../../../public/runtime-identity.cjs#L1) | 主目录最终构建生成的受管身份与日期 |
| [入口预算](../../../../scripts/validate-preload-entry-budget.mjs#L1) | helper 迁出后收紧入口预算 |
| [uTools 产物验证](../../../../scripts/validate-utools-runtime.mjs#L1) | 校验握手日期、版本与产物完全一致 |
| [FloatApp.vue](../../../../src/FloatApp.vue#L1) | 置顶折叠及可见编号映射 |
| [float.css](../../../../src/styles/float.css#L1) | 折叠标题、焦点及单编号样式 |
| [CodexPage.vue](../../../../src/pages/CodexPage.vue#L1) | 当前宿主构建日期、版本和需重载提示 |
| [eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1) | 增量握手类型与缺失 metadata 回退 |
| [Kernel 测试](../../../../tests/platform/companionTaskKernel.test.ts#L1) | 直接状态切换、已读 Plan、稳定置顶及 attention |
| [Bridge 测试](../../../../tests/platform/codexAppServerBridge.test.ts#L1) | Plan 结构消费、请求保留与旧 waiting 拒绝 |
| [Identity 测试](../../../../tests/platform/runtimeIdentity.test.ts#L1) | Main/Float 元数据透传和 identity 边界 |
| [UI 测试](../../../../tests/ui/codexCompanion.test.ts#L1) | 折叠展开编号、目标派发及构建提示 |
| [Codex 帮助](../../../../src/help/guides/codex.md#L1) | 同步当前状态、快捷键与构建凭据口径 |
| [架构](../../../knowledge/ARCHITECTURE.md#L1) | 同步唯一状态 owner、证据优先级和产物边界 |
| [技术事实](../../../knowledge/technical-details.md#L1) | 同步 Provider 因果与 Runtime Identity 接线 |
| [交互偏好](../../../knowledge/developer-soul.md#L1) | 保留本任务已确认的稳定置顶与可观察身份偏好 |
| [Plan 防错记录](../../../knowledge/error-memory/companion-plan-lifecycle-and-interrupted-causality.md#L1) | 精确等待、终态与独立 artifact 的防回归证据 |
| [当前产品真值](../../PRODUCT_REQUIREMENTS.md#L1) | 同步行为条款及最终生成构建身份 |
| [项目状态入口](../../PROJECT_STATUS.md#L1) | 精简当前状态，链接唯一集成 owner |
| [冲突登记](../../requirements/conflict-register.md#L1) | 记录 RAW-188/189 的局部裁决，不造整条取代 |
| [共享需求索引](../../requirements/modules/companion-shared.md#L1) | 发现 RAW-188/189 身份 |
| [Source Anchor](../../source-anchors/catalog.json#L1) | 跟随来源与 current truth 生成 |
| [raw-requirement.md](raw-requirement.md#L1) | 本任务规范化来源与验收边界 |
| [spec.md](spec.md#L1) | 当前设计、验证、同步清单及本地集成合同 |
| [RAW-189 登记](../../requirements/shared-raw-189.md#L1) | 身份、状态和 scoped refinement |
| [changes.md](changes.md#L1) | 可审阅的逐文件清单 |

## 明确不提交与未执行

- production build 目录、依赖目录、日志及截图不入 Git；Runtime Identity 是仓库已有受管生成文件，随最终主目录构建及当前真值同步。
- 不改变配置、远端分支、正在运行的原生宿主或其它工作树；不推送、不安装、不重载、不清理。
- 真实 uTools 状态时延、视觉和快捷键未验收；自动化与构建只证明 artifact-ready。
