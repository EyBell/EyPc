# Claude Companion Provider 任务分解

Tool: claude (Cowork)
Date: 2026-08-05
Plan: [plan.md](plan.md#L1)

## Phase 0 前置（用户）
- [x] 本机安装 Claude Code CLI 并登录（2026-08-05 完成：2.1.220 / Max / 已登录）
- [x] EyPc 确认环境可探测（桥对真实安装返回 installed/homeReady/authenticated/cliVersion）
- [x] hooks / statusline 注册方案确认（幂等合并 + 标记 + 链式 statusline + 可干净卸载；实际写入仍需行动时确认）

## Phase 1 Domain 抽象
- [x] `CompanionProvider` 接口 + `CompanionProviderId` + key 命名空间
- [x] 共享基础比较器；显示序（不分组）/循环序（provider 分组、稳定单调）双投影
- [x] 直接打开跟随循环序（RAW-146 合同修订 + 回归测试更新）
- [x] 角标跨 provider 按状态合并（Domain 聚合函数就位，接入待 Phase 3）
- [x] 兼容验证：基线与改动版失败子集逐项相同

## Phase 2 Claude preload 桥
- [x] 环境探测（PATH 优先 + 常见根；版本取自转录戳记）
- [x] hooks 安装器（幂等合并/可卸载）+ 事件桥（session_id/cwd/PID 捕获）
- [x] JSONL 有界尾部读取 + 结构化摘要（tasks/ 目录证据未接入，非必需）
- [x] statusline 主源落盘 + 解析（oauth/usage 兜底与独立刷新 lane 待 Phase 3 接调度）
- [x] 打开动作（终端聚焦 → resume 降级；仅聚焦成功才确认已读）
- [x] canonical/public/dist 镜像同步与静态核验（清单泛化为模块组 + 打包断言）

## Phase 3 Controller 汇总层
- [x] Aggregator：双 provider 流 → 单一原子包（追加保序、状态分桶、计数重算、幂等）
- [x] 启用/停用开关（`CodexSettings.providers`，缺省归一为仅 Codex）+ 单侧降级隔离
- [x] Claude read-state 自管（仅确认聚焦写回执）；循环游标接新循环序

## Phase 4 UI 与设置
- [x] 卡片行底部 provider 标记位（含 operation-tooltip；兼容模式整体抑制）
- [x] 水球三态额度映射（仅 Codex 原样 / 仅 Claude 独占 / 共享 ring=Codex + 球心%=Claude，未连接回退）
- [x] 展开卡额度 provider 分区；设置页 Claude 开关与钩子注册入口
- [x] 功能说明 guide 更新（`EYPC-FEATURE-HELP-001`）

## Phase 5 验证与文档
- [x] 聚焦测试 + typecheck + 非运行 build（`EYPC-VERIFY-001`）
- [x] verify.md 建立并记录证据
- [x] 文档同步：PROJECT_STATUS / ARCHITECTURE / PRODUCT_REQUIREMENTS / rules README trace（含 `EYPC-COMPANION-PROVIDER-001`）/ RAW-146 修订记录
- [x] 宿主验收矩阵移交用户（见 verify.md「宿主验收门禁」）

## 进度

Phase 0–5 全部完成并通过自动化验证，见 [verify.md](verify.md#L1)。`providers.claude` 默认关闭，关闭状态下用户可见行为零变化；真实宿主验收归用户。

## 优化轮（2026-08-05，复核之后）

- [x] 显示序改为按活跃度两路稳定归并（Codex 内部相对次序逐项不变），修正「实际按来源分组」与用户要求相悖的问题
- [x] 额度 `api/oauth/usage` 兜底落地为 `preload/claude/quota.cjs`，默认关闭的显式开关 + 主源新鲜时不触发 + 自身最小调用间隔 + 凭证不落盘不返回 + 全失败路径静默降级
- [x] 打包校验新增「兜底必须 opt-in」「兜底模块不得写文件」源级断言
- [x] 功能说明补「空闲时补充读取额度（默认关闭）」小节，说明代价与隐私边界

完整 Vitest 994/996，typecheck、build 与 uTools validation 通过。
