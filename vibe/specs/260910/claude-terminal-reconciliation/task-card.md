# Claude 完成状态与子任务收敛修复

状态：实现、针对性自动验证、生产构建与真实来源预检通过；user-verified / closed。用户已安装并确认现场验证通过；修复代码 `22936bb`、验证文档 `dc6d1f6` 已提交。

## 问题与授权

本任务修复明确完成证据与完整子任务快照的收敛，并核对现场 5 条任务。已完成代码与验证文档的分批提交；本轮授权提交验收记录并推送当前仓库全部待推送提交。保留现有 `.agents/skills/codexhost-companion`、`.codemark/codemark.json` 和运行身份的并行改动。

现场两次只读来源采样均为 Claude 1 running / 22 completed；悬浮窗中 5 条来源已完成的任务仍显示 running / verifying。插件持续发布并被浮窗确认。安装包与 dist 的 Claude reader、queue、Kernel、主 preload、runtime identity 内容一致。旧子任务数量与冷读不同，不能把父任务完成直接等同于所有后台子任务完成。

当前已定位的证据丢失路径：queue reader 只保留最后 2,000 条，但游标越过全部字节；bridge 在 drain 之前轮转，未读结束事件可被清空。现场队列超过 3,000 条；历史事件已经轮转的部分无法逆推为逐条运行时证据。

## 实现与边界

| 修复 | 实现与回归依据 |
| --- | --- |
| 积压结束事件 | [queue parser](../../../../preload/claude/events.cjs#L86) 不再裁掉已消费字节对应的事件；父 Stop、SubagentStop 位于 2,100 条其它会话事件之前也必须生效 |
| 未读队列轮转 | [rotation](../../../../preload/claude/events.cjs#L500) 仅接受全部消费完毕的文件；三个读入口先 drain 再轮转，保留不完整记录 |
| 完成证据反复 | [correlation](../../../../preload/claude/code-sessions.cjs#L181) 在私有 metadata map 保留已观测 completedTurns 增量；重复读取及旧回合工具尾事件不能复活同一回合，较新 UserPromptSubmit 仍立即生效 |
| 精确空子任务名单未发布 | [state envelope](../../../../preload/claude/index.cjs#L178) 指纹包含 topologyComplete；从未知名单到精确空名单必须推进 generation，交由现有 Kernel family sweep 撤回缺席成员 |
| 单条核验丢失其它任务完成证据 | [targeted read](../../../../preload/claude/index.cjs#L116) 只更新对应任务的私有 metadata，不替换整个会话 map |

没有更改 Kernel 的未知状态保留策略，也没有根据父任务完成或超时强行结束真实活动子任务。以上失效路径均由合成回归执行复现，不能声称每条已经轮转的历史现场事件均已逐条追溯。Hook 写入侧既有的自限长/并发截断协议不在本轮改动内，仍不构成无限历史或无损审计保证。

## VerificationImpactTrace（实施前）

| 项目 | 选择与边界 |
| --- | --- |
| 修改面 | Claude Hook 队列读取/轮转、已确认完成证据的跨快照保留；同步生成镜像 |
| 影响链 | queue → Code session correlation → Host evidence adapter → Kernel family aggregation → 主界面与浮窗 |
| 聚焦验证 | Claude bridge 的积压/轮转/重复读取回归；App log 与实际 Host→Kernel 直接消费者测试 |
| 产物验证 | 初选准备脚本；实测 uTools 校验拒绝旧 Renderer：其编译内容嵌入 Host asset id，身份派生也包含 Host。因此改用项目生产 build（合同、类型、Vite、准备、uTools 校验），必须同步主入口与浮窗编译身份 |
| 真机验证 | 来源与浮窗的同任务状态、子任务活动数；更新后读取实际 Host 身份，经过观察间隔再次核对 |
| 不运行 | 全仓测试与无关功能；当前改动的消费者可被限定 |
| 升级条件 | 已触发产物边界升级：validate-utools-runtime 检出旧 Renderer 未嵌入新 Host 身份；构建覆盖该编译依赖，不升级全仓测试 |
| 帮助/需求 | 修复既有同步语义，无新增用户操作或需求条款；无需新建 RAW 身份 |

## 验证与交付

| 检查 | 结果 |
| --- | --- |
| 定点失败复现 | 新增队列积压、未读轮转、完成证据反复、空拓扑代际 4 个回归；修复前执行失败，修复后通过 |
| 聚焦模块/消费者 | `pnpm exec vitest run tests/platform/claudeBridge.test.ts tests/platform/claudeAppStateBridge.test.ts tests/platform/claudeBridgeSafety.test.ts tests/platform/codexAppServerBridge.test.ts`：296 项通过 |
| 隐藏 Host→Float 积压完成 | 增强已有 [直接消费者回归](../../../../tests/platform/codexAppServerBridge.test.ts#L1891)，再定点执行通过：父子先运行，超过 2,000 条其它会话事件之后，真实 bridge 的恢复读取将 Kernel liveCount 从 2 降至 0 并发布 completed 浮窗包；这是模拟宿主验收，不是真机成功声明 |
| 镜像/构建 | 83 对镜像通过；`pnpm run build` 合同、类型、Vite、uTools 产物校验通过；准备脚本单独执行曾因 Renderer 内嵌旧 Host id 被拒绝，已按影响链改用完整生产构建解决 |
| 当前真值 | `node scripts/validate-requirements.mjs --write-current-truth` 通过；只回写构建快照，无需求条款新增 |
| 新产物真实来源预检 | `node scripts/probe-claude-live-state-runtime.mjs`：ok，完整消费 3,234 条事件；该次 Claude 24 completed / 0 running，App 版本兼容、Hook 与 statusline installed；采样数量会变化 |
| 用户现场验收 | 用户已安装新产物并确认验证通过，重载待验收项关闭。依据为用户反馈；未新增自动宿主身份读回或两轮采样记录 |

产物：EyPc V7；`host-7ea2d457c39eb57bde4f / renderer-ae98a0145628aa56faf9`；北京时间 `2026/09/10 09:42:32`（`2026-09-10T01:42:32.549Z`）。完整插件入口：[dist/plugin.json](../../../../dist/plugin.json#L1)。对应 [当前需求真值](../../PRODUCT_REQUIREMENTS.md#L14) 与 [状态中心](../../PROJECT_STATUS.md#L8)。

结论：用户现场验收通过，本任务关闭，无待执行修复。验收结论随本轮提交交付。
