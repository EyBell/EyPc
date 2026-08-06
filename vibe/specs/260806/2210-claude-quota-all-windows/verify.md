# Verify：额度全窗口 + 以 App 节奏同步

Spec: [spec.md](spec.md#L1) · Date: 2026-08-06 · 环境：本机 macOS

## 取证（实际读取，非推断）

| 事实 | 怎么证的 |
| --- | --- |
| 桌面端每 ~5 分钟写一次用量，数值与其面板一致 | 读 `plan-usage-history.json`：421 样本、中位间隔 300000ms、单 org、末条 `{fh:36, sd:29}` 对上截图的 35%/29% |
| 该文件只有两个窗口、无重置时刻 | 全库 `u` 键集合 = `{fh, sd}`；无 `resets` 类字段 |
| 第三个窗口的键名在本机不可证实 | 本机 EyPc 缓存（CLI 2.1.220，08-05）只含两窗；桌面端 `audit.jsonl` 的 46 条 `rate_limit_event` 仅见 `rateLimitType: five_hour` |
| 状态栏缓存本就逐字保留整个 `rate_limits` | 读 `scripts.cjs` 的花括号配平提取 + 本机缓存文件结构 |

→ 因此实现按**键名枚举 + 从键名派生标签**，不依赖知道第三个键叫什么。

## 自动化结果

| 项 | 结果 |
| --- | --- |
| `tests/domain/claude.test.ts` | **52/52**（本轮 +9：窗口枚举/排序/标签派生、scoped 不冒充 plain、未识别键保留、任一窗口过期、合并的前进/不倒退/播种/空样本） |
| `tests/domain/companionPresentation.test.ts` | **57/57**（本轮 +2：section 三行与 chip 三短标） |
| `tests/platform/claudeDesktopBridge.test.ts` | **17/17**（本轮 +4：最新样本取时间戳最大者、丢弃 org、各种坏形状降级为 null、单窗口与越界钳制；facade 断言 +1） |
| `tests/runtime/claudeCompanionController.test.ts` | **48/48**（本轮 +3：合并落到 view 且保住 resetAt 与按模型窗口、无状态栏时以 `plan-history` 播种、无样本时读数不变） |
| `tests/domain` + `tests/platform` + `tests/ui` + companion controller | **885/886**，唯一失败见下 |
| `vue-tsc --noEmit` | **0 错误** |
| `vite build` + `prepare-utools-runtime` + `validate-utools-runtime` | 通过（含新增的模块侧与 facade 侧 `readPlanUsage` 断言） |

## 唯一失败：`claudeBridge` 的 hook 监听用例（**非本轮**）

`tests/platform/claudeBridge.test.ts > hook queue push lane > watches before registration…` 在整文件运行时约 2/3 概率失败，单独运行必过。

**已证明与本轮无关**：把本轮新增的 `readPlanUsage`（读取器函数 + 两处导出）从 `desktop.cjs` / `index.cjs` 中**整体删除**后，整文件三连跑得到同样的 1 通过 / 2 失败分布。这是 fs.watch 时序敏感用例在当前并行工作树里的既有抖动，与 [PROJECT_STATUS](../../PROJECT_STATUS.md#L36) 已记录的「两项失败来自非收藏 Claude hook 监听」同一条。本轮不代修他人在途工作。

## 未验证 / 归用户

- **第三个 chip 的实际视觉**：排布、窄浮窗下是否仍被裁掉。本轮已把来源标题的隐藏阈值从 `≤320px` 提前到 `≤400px` 缓解，是否需要进一步降级留待你看过再定。
- **第三个窗口的真实键名**：本机拿不到。等你的宿主里跑过一次 Claude Code、或桌面端写出带该窗口的状态栏读数后，chip 会自动出现——若届时标签显示异常（例如键名不是 `seven_day_*`），把 `eypc-claude-quota.json` 的内容给我，一次修正即可。
- 桌面端用量记录的实际刷新体感（关掉 Claude Code、只开桌面端，观察读数是否仍在走）。
