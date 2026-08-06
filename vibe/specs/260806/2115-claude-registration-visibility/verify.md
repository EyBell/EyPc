# Verify：Claude 注册状态可见 + 一致性偏差收口

Spec: [spec.md](spec.md#L1) · Date: 2026-08-06 · 环境：本机 macOS（node/pnpm 宿主自带）

## 自动化结果

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 呈现层聚焦套件 | `vitest run tests/domain/companionPresentation.test.ts` | **55/55**（本轮 +8：注册行 7 + 过期窗口 1） |
| Companion UI 合同 | `vitest run tests/ui/codexCompanion.test.ts` | **36/36**（本轮 +2 源级断言） |
| `tests/domain` 全量 + companion controller + companion UI | `vitest run tests/domain tests/ui/codexCompanion.test.ts tests/runtime/claudeCompanionController.test.ts` | **442/442**（27 文件） |
| 语义类型检查 | `vue-tsc --noEmit` | **0 错误**（此前 1046 轮记录的 4 个 favorites 在途错误已随对方合入消失） |
| 生产构建与打包校验 | `pnpm run build`（含 `prepare-utools-runtime` + `validate-utools-runtime`） | 全部通过 |

## 覆盖了什么

- 行集合在健康 / 空环境 / `null` 三种输入下**恒为同一组六项**——这正是"只在坏掉时出现的诊断不可用于确认正常"的正向断言。
- `outdated` 与 `missing` 分别断言值、tone 与**不同的补救文案**。
- 缺 CLI 保持 muted，同时 `auth` / `home` 的警告色不受影响（防止把"只影响跳转"的缺失升格成故障）。
- 检查时效四档（尚未检查 / 刚刚 / 分钟 / 小时 / 天）。
- 序列化后不含 `/`、`\` 或 `~`——与 `claudeSetupHint` 同一隐私边界。
- 过期额度窗口两条（严格过去、`now === resetAt` 边界）。

## 未验证 / 归用户

- **宿主视觉验收**（用户 2026-08-06 明确"一会儿进行"）：设置页「运行 → 接入来源」六行的实际排布与换行、`i` 提示的可聚焦与不遮挡、过期钩子时「重新注册钩子 + 移除钩子」两个按钮并存、点重新注册后行状态与「最近检查」的刷新。
- **1150 遗留的宿主验收矩阵**仍未执行（hook 实时性、终端聚焦成功率、Keychain 首次授权、statusline 对既有状态栏的影响、双 provider 混合循环体感、三态水球可读性、钩子注册/移除往返还原）。本轮未触碰这些路径。
- 本轮未启动 `serve` / `dev` / uTools 宿主，未写入任何 Claude 原生状态。

## 同轮的文档修正

- [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L103)：「无法证明已读的来源不产生未读」入合同。
- [1130 桌面端 spec](../1130-claude-desktop-provider/spec.md#L5)：角标合并与设置页分区文案结案，待定项只剩水球三方额度与 `rate_limit_event` 校准。
- [1046 verify.md](../1046-claude-quota-status-visibility/verify.md#L1)：计数口径改为「本轮新增 + 文件当前总数」，并记录过期窗口分支补测。
