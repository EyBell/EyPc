# RAW：额度以 Claude App 可见信息为准（全部窗口 + 同步时机）

Date: 2026-08-06 · Tool: claude (Cowork) · Level: Standard（一个 owner）

## 用户原话

> 还有 Cloud 的额度同步时机以及实际展示，要以 Cloud APP 里面可见的信息为主。当前可能只展示了两个，这样其实是不够完善的。

随附 Claude 桌面端「Plan usage limits · Max (20x)」截图，三行：

| 行 | 重置 | 百分比 |
| --- | --- | --- |
| 5-hour limit | Resets in 3 hr 26 min | 35% |
| Weekly · all models | Resets Wed 10:00 PM | 29% |
| Weekly · Fable | Resets Wed 10:00 PM | 44% |

## 本机取证（结论均来自实际读取，不是推断）

1. **第三个窗口确实存在且我们丢掉了它**。状态栏包装脚本用花括号配平把**整个 `rate_limits` 对象逐字缓存**，[claude.ts](../../../../src/domain/claude.ts#L1) 的归一化却只读 `five_hour` 与 `seven_day` 两个硬编码键——字节一直在，投影把它扔了。
2. **桌面端自己写用量历史**：`~/Library/Application Support/Claude/plan-usage-history.json`，`{t, org, u:{fh, sd}}`，421 条样本、中位间隔 **5 分钟**、单一 org；最后一条 `{fh:36, sd:29}` 与截图前两行吻合。
3. **该文件只有两个窗口、且无重置时刻**：全库 `u` 键集合恰为 `{fh, sd}`。第三行与所有 `Resets …` 文案在本机任何文件里都找不到，只能来自接口实时返回。
4. 桌面端 `audit.jsonl` 的 `rate_limit_event` 仅见 `rateLimitType: five_hour`（46 条），带 `resetsAt` 无百分比——只能做校准，不能做来源。
5. 本机 EyPc 额度缓存（2026-08-05 写入，CLI 2.1.220）确实只有两个窗口，因此第三个键的**确切名字无法在本机证实**。

## 由 (5) 得出的设计约束

实现**不得依赖知道第三个键叫什么**。按键名枚举 + 从键名派生标签，未来任何模型的窗口都能自动出现；写死一张模型名对照表会重演同一个错误。

## 用户拍板（2026-08-06 AskUserQuestion）

- **第三个窗口同行再加一个 chip**：额度行仍是单行，Claude 侧从两个读数变三个。
- **接入 `plan-usage-history.json` 作为常规来源**：零凭证、零弹窗，用它保证「不跑 Claude Code 也不过期」。

## 范围

domain 额度模型 + 呈现投影 + 桌面端只读桥新增读取 + controller 合并 + 打包校验 + 帮助文档 + 测试。不动注册写入、不动任务状态机、不新增开关。
