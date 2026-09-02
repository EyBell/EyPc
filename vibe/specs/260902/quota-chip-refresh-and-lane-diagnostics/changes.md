# Changes：额度读数点击即刷新与 Claude 额度车道诊断

本清单只记录文件作用；需求和验收由 [spec](spec.md#L1) 承载。

| 文件 | 核心说明 |
| --- | --- |
| [quota.cjs](../../../../preload/claude/quota.cjs#L372) | `nextAllowedReason` 与 `force` 放行边界；诊断暴露原因 |
| [index.cjs](../../../../preload/claude/index.cjs#L337) | 透传 `force`；`quotaAccess` 诊断加有界 `reason / blockedBy` |
| [public 镜像](../../../../public/claude/quota.cjs#L1) | 跟随 canonical preload 生成，不能独立修改 |
| [codexController.ts](../../../../src/runtime/codexController.ts#L1316) | 触发原因、车道观测、`claude-quota-read` 诊断、`refreshQuota()` |
| [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L9712) | 注册 `codex.quota.refresh` 动作 |
| [FloatApp.vue](../../../../src/FloatApp.vue#L3387) | 读数块点击 / 键盘触发与提示后缀 |
| [float.css](../../../../src/styles/float.css#L741) | 指针与按压反馈 |
| [claudeQuotaFallback.test.ts](../../../../tests/platform/claudeQuotaFallback.test.ts#L1) | 手动绕过只跨 interval / backoff |
| [claudeCompanionController.test.ts](../../../../tests/runtime/claudeCompanionController.test.ts#L1) | 诊断行字段、无数值、manual 触发 |
| [RAW-201 登记](../../requirements/shared-raw-201.md#L1) | 登记身份、状态及 refinement 关系 |
| [preload/index.js](../../../../preload/index.js#L1204) | 两个发现车道的 `record` 透传改走带显式 level 的 `recordCompanionDiagnosticEvent`，level 契约测试转绿（与 RAW-201 无关的顺手修复） |

未执行：真实宿主点击验收、推送、提交；均不由本地改动授权。
