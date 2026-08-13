---
id: eypc-req-codex-raw-139
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-139
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / refines-RAW-084-087-136-138 / cold-mainhide-task-open-recovery"
relations:
  - refines-RAW-084-087-136-138
---

# RAW-139 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户在重载“最新版本”后纠正：已读修复未生效，并出现全局快捷键不触发、卡片点击不能正确打开任务。真实宿主复核发现 uTools 缓存中同时存在 `1.2.6`、`1.2.31`、`1.2.32` 与 `1.2.33` 的 EyPc ASAR，悬浮窗最初仍由 `1.2.6` preload 驱动，激活插件后才切到与当前源码/三份镜像哈希一致的 `1.2.33`；在正确实例中点击卡片已精确打开预期 Codex task，插件 completed-unread 计数立即从 2 降到 1，证明 RAW-138 成功打开确认有效，而 Codex 原生 unread 集合保持 true 属于既定“不写原生状态”边界。另确认当前源代码存在独立冷启动缺陷：`plugin.json.mainHide` 已拥有入口可见性，Renderer 却在同步 dispatch 后再次 hide；同时 Controller 在停用清空库存后，待输入/完成未读/前后任务动作直接读取空投影并返回，异步 bootstrap 尚未完成。修复后全部 Codex `mainHide` 入口保持当前 Tab、由 `mainHide` 独占隐藏且 Renderer 不再二次 hide/show；Controller 在任务库存为空时串行执行一次 tasks-only action preflight，再按原候选规则打开。卡片动作若跨生命周期找不到旧 alias，必须以同一匿名 task key 重建当前 alias；Host 返回 expired/invalid/stale alias 时仅刷新并对同一 key 重试一次，不得退化为列表首项或其它任务。打开成功仍走 RAW-138 的会话期已读确认，失败仍不改 unread，不新增公开字段、持久化或 Codex 原生写入。聚焦 App/route/Controller/Bridge/lifecycle 回归 `141/141`；最终 `pnpm run verify` 同步 preload 后通过全库 `730/730`（`57/57` 文件）、typecheck、production build、runtime prepare 与 uTools validation。修复后的安装包尚未重载，真实快捷键与卡片冷启动复验保持 host-pending。
