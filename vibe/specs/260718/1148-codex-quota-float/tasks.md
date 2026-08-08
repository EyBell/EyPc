# Codex 任务状态执行清单

Tool: codex

| 任务 | 状态 |
| --- | --- |
| 锁定 completion baseline 反弹序列 | complete |
| 完成接受后清理 active-exit baseline | complete |
| 发布 Activity/Turn 证据来源与 revision | complete |
| 真实 activity patch 开启新周期 | complete |
| `task-state-v3` 与 v2 degraded 兼容 | complete |
| 移除当前 completion delay 设置形状 | complete |
| 同步 canonical/技术/帮助/错误记忆 | complete |
| 静态与状态链自动验证 | complete |
| 实时与完整快照共用 active-exit 转换器 | complete |
| 晚到原生 unread 唤醒 latest-Turn 复核 | complete |
| 旧 interrupted 全量快照不得发布 stopped | complete |
| 同 revision 无 `completedAt` 的精确/佐证完成不再被阻断 | complete |
| latest-Turn 不兼容复核模式可取消并接管 | complete |
| stale-active unread 只唤醒核验，缺 Turn outcome 保持 ongoing | complete |
| confirmed targeted/corroborated provenance 写回会话期 inventory | complete |
| 移除 completed-unread 本地确认覆盖，原生 read-state 单一权威 | complete |
| mixed delta 已知条目不被未知 key 整批阻断 | complete |
| full snapshot Activity generation 屏障与证据保留 | complete |
| missing-key 仅隔离缺失行，现存任务即时更新 | complete |
| 重复 active snapshot 复用有界复核，新 unread/切换歧义可重启 | complete |
| active 退出不把旧 inventory completed 升级为 confirmed | complete |
| 冷启动原生 unread=true 只唤醒一次有界 Turn 复核 | complete |
| active-exit 转换器在 delta/full snapshot 自身识别 confirmed provenance | complete |
| 新会话任一已返回普通窗口为 0 时切换最高可用 Spark | complete |
| 移除旧配色预览/提交/回滚 Runtime Action 与 Controller 暂态状态 | complete |
| 外观回归与现行直存直渲合同统一 | complete |
| MQTT/Quick Jump 静态断言限制到 media/function 边界 | complete |
| 清理 PRD、Soul、架构和错误记忆中的旧配色阻断认知 | complete |
| 跨来源 live evidence sequence 阻止旧 Desktop idle 重放撤销新 App Server active | complete |
| RAW-130 Bridge 回归合同执行 | complete / automated-verified |
| RAW-131 全状态机写入/撤销/重放/消费点静态摘取 | complete |
| RAW-131 七个 P1 运行实现修复 | complete / automated-verified |
| RAW-131 闭合转换矩阵合同编写 | complete / automated-verified |
| RAW-131 闭合转换矩阵执行 | complete / automated-verified |
| RAW-132 父任务纯聚合与 Side Chat 分支终态保护 | complete / automated-verified |
| RAW-132 匿名裁决计数与设置页诊断 | complete / automated-verified |
| RAW-132 镜像、空白、隐私形状与文档链接静态检查 | complete |
| RAW-132 反向回归合同执行 | complete / automated-verified |
| RAW-133 Domain 诊断规范化/比较唯一权威 | complete / automated-verified |
| RAW-133 Controller 原子接纳与 diagnostics-only 单通知 | complete / automated-verified |
| RAW-133 紧凑诊断、live-region 隔离与原生帮助按钮统一 | complete / automated-verified |
| RAW-133 镜像、空白、唯一权威与文档链接静态检查 | complete |
| RAW-133 父聚合真值表与诊断通知合同执行 | complete / automated-verified |
| RAW-134 动态小时设置、默认/规范化与配置页输入 | complete / automated-verified |
| RAW-134 原子包即时重投影、时间边界与任务循环合同 | complete / automated-verified |
| RAW-134 Domain/Controller/UI 合同执行 | complete / automated-verified |
| RAW-135 额度刷新自由秒数、默认/边界与旧分钟迁移 | complete / automated-verified |
| RAW-135 完整校对自由秒数与独立 2s/3s 调度合同 | complete / automated-verified |
| RAW-135 无 Turn 载荷 completed 专属单任务快路与 25ms 重试 | complete / automated-verified |
| RAW-135 双 preload 镜像、帮助、canonical、架构与错误记忆同步 | complete |
| RAW-135 typecheck、production build 与完整相关回归 | complete / automated-verified |
| RAW-135 真实 uTools 完成事件时延验收 | pending / user-owned |
| RAW-136 Plan-only 隐私标记、父任务聚合与 `task-state-v4` | complete / automated-verified |
| RAW-136 普通输入/审批 → Plan → 最近活跃独占循环 | complete / automated-verified |
| RAW-136 Bridge/Domain/Controller/平台合同与 preload 镜像 | complete / automated-verified |
| RAW-136 帮助、canonical、架构、Soul 与过程文档同步 | complete |
| RAW-136 相关回归、typecheck、production build 与静态审计 | complete / automated-verified |
| RAW-136 真实 uTools 快捷键顺序验收 | pending / user-owned |
| RAW-137 unread 成员/非成员双向权威与 main/Side 聚合 | complete / automated-verified |
| RAW-137 Controller 停用基线清理、新代次 bootstrap 与旧异步隔离 | complete / automated-verified |
| RAW-137 零周期 missing-key 剩余窗口自唤醒 | complete / automated-verified |
| RAW-137 已知 Side Chat 会话期拓扑重订、App Server-only 库存重建与 bounded child Turn 校对 | complete / automated-verified |
| RAW-137 聚焦 106 项、全库 704 项、typecheck/build/preload/uTools runtime 门禁 | complete / automated-verified |
| RAW-137 真实 uTools 关闭—变更—重开状态矩阵 | pending / user-owned |
| RAW-138 当前运行包、IPC owner/版本、read-event 时间线与原生 unread 冲突只读核验 | complete / host-evidence |
| RAW-138 refollow false 清除 stale persisted true，保留 persisted false 压住 snapshot true | complete / automated-verified |
| RAW-138 成功打开 parent/已知 Side Chat 即会话期已读，失败与断桥边界 | complete / automated-verified |
| RAW-138 当前 v11/v2 与已核验旧 v6/v1 协议合同 | complete / automated-verified |
| RAW-138 Bridge 67 项、Bridge+Controller 116 项与全库 722 项门禁 | complete / automated-verified |
| RAW-138 新构建重载后的卡片打开与关闭期已读恢复 | pending / user-owned |
| RAW-139 真实宿主 ASAR/preload 身份、Deep Link 目标与成功已读反馈核验 | complete / host-evidence |
| RAW-139 Codex `mainHide` 入口移除 Renderer 二次 hide/show并保持当前 Tab | complete / automated-verified |
| RAW-139 空库存快捷命令 tasks-only preflight 与串行执行 | complete / automated-verified |
| RAW-139 卡片生命周期 alias 按同一 task key 重建及一次 stale retry | complete / automated-verified |
| RAW-139 聚焦 141 项、全库 730 项、typecheck/build/runtime validation 与文档/错误记忆同步 | complete / automated-verified |
| RAW-139 新构建重载后的真实快捷键与卡片冷启动复验 | pending / user-owned |
| RAW-140 快捷键成功打开后 mainHide/IPC reset/refollow 已读反弹复现 | complete / automated-reproduced |
| RAW-140 有界 preload 会话确认及同 completion/new Turn 仲裁 | complete / automated-verified |
| RAW-140 Bridge 70 项、聚焦五文件 144 项与 typecheck | complete / automated-verified |
| RAW-140 完整 verify `733/733`、文档/错误记忆审计 | complete / automated-verified |
| RAW-140 新构建重载后的完成未读快捷键持续已读验收 | pending / user-owned |
| RAW-141 当前真实 Needs input、Desktop owner 与 App Server/rollout 证据链 | complete / host-readonly-evidence |
| RAW-141 有界 rollout 未决输入回退与隐私边界 | complete / automated-verified |
| RAW-141 owner loss 下输入/审批/Plan sticky、普通 active 降级与新证据清理 | complete / automated-verified |
| RAW-141 非 kill pluginOut Desktop observer 连续性及 Controller close 合同 | complete / automated-verified |
| RAW-141 聚焦 `170/170`、完整工作树 `737/737`、独立暂存提交 `711/711` 与 typecheck/build/preload/uTools runtime 门禁 | complete / automated-verified |
| RAW-141 新构建重载后的普通输入、Plan 与 ownerless Needs input 展示 | pending / user-owned |
| RAW-142 completed Plan 精确 rollout/App Server item 待实现投影，且不受 unread 影响 | complete / focused-automated-verified |
| RAW-142 原生 unread 瞬时不可用与库存替换期间不发布错误 true 中间帧 | complete / focused-automated-verified |
| RAW-142 Bridge+Domain 114 项、Controller 2 项、typecheck、preload 语法/镜像/同步 IPC 定向门禁 | complete / focused-automated-verified |
| RAW-142 真实 uTools completed Plan、新 Turn 解除与完成未读无闪跳验收 | pending / user-owned |
| RAW-143 普通 mainHide 保留 App Server alias/latest-Turn 热会话，kill/显式 close 仍清理 | complete / focused-automated-verified |
| RAW-143 tasks preflight 发布成功感知单飞、verified 空库存与 Runner 热库存复用 | complete / focused-automated-verified |
| RAW-143 四文件 `149/149`、typecheck、preload 语法/镜像与 diff 定向门禁 | complete / focused-automated-verified |
| RAW-143 新构建连续任务/Runner 快捷键体感与冷启动时延验收 | pending / user-owned |
| RAW-144 feature-lifetime 任务/Activity 热缓存与额度 surface 门控 | complete / focused-automated-verified |
| RAW-144 Runner per-project catalog 增量新增、alias 失效与 single-flight | complete / focused-automated-verified |
| RAW-144 uTools fallback 成功确认、Turn ID 绑定与旧 snapshot 反压保护 | complete / focused-automated-verified |
| RAW-144 受影响 15 文件 `301/301`、typecheck、三类 preload 语法/镜像、Vite/runtime/uTools packaging 与 diff | complete / focused-automated-verified |
| RAW-144 真实 uTools 连续快捷键、fallback 打开与同 Turn 时间补全验收 | pending / user-owned |
| RAW-145 当前本机 Provider → Preload → Domain 真实投影复现与根因定位 | complete / host-readonly-evidence |
| RAW-145 `persisted-decision` 端到端来源、v5 协议与精确新 Turn 清理 | complete / focused-automated-verified |
| RAW-145 四文件 `192/192`、typecheck、完整 build、三份 main preload 镜像与真实预检 | complete / focused-automated-verified |
| RAW-145 8092 开发服务与 main/float/action 重载入口 | pending / current-not-listening |
| RAW-145 新构建重载后的同一 `Needs input` 卡片与解除边界 | pending / user-owned |
| RAW-146 Controller/Float 共用置顶优先稳定显示排序，待输入首条一致 | complete / automated-verified |
| RAW-146 紧凑角标帮助/ARIA及旧测试合同修正 | complete / automated-verified |
| RAW-146 canonical/过程文档漂移、错误记忆与链接审计 | complete / automated-verified |
| RAW-146 实际 uTools ASAR/进程/8092 启动或重载 | excluded / user-request |
| RAW-147 正向 follower 公告不回声、显式 status request 单次重报 | complete / focused-automated-verified |
| RAW-147 精确变更快照的 Bridge `81/81`、typecheck、production build、三向 Preload/语法/同步 IPC/runtime 门禁 | complete / focused-automated-verified |
| RAW-147 真实预检相对 TypeScript 依赖加载与生产 Domain 投影 | complete / host-readonly-evidence |
| RAW-147 task/current/technical 文档冲突扫描与错误记忆“一主一引”更新引入 | complete / documentation-memory-verified |
| RAW-148 Runtime 环境横幅/诊断表/帮助与兼容等待单一 Domain 投影 | complete / focused-automated-verified |
| RAW-148 任务归属参数与行内重复解析去除，Codex/Claude/legacy 合同 | complete / focused-automated-verified |
| RAW-148 启动路径 set/clear 共用发布 helper 且额外 inspect 为零 | complete / focused-automated-verified |
| RAW-148 RAW-022 与规则/PRD 冲突裁定、架构/技术/错误记忆同步 | complete / documentation-memory-verified |
| RAW-148 聚焦四文件 `188/188`、typecheck、冲突词与链接审计 | complete / documentation-memory-verified |
| 并发 Claude 改动后的当前整树 typecheck/build 复跑 | superseded / 当前整树 typecheck 已恢复通过；RAW-148 未触发 build，RAW-147 当时的独立阻断保留在历史验证记录 |
| RAW-147 新构建重载后的有界 IPC snapshot 与 active→waiting 转换 | pending / user-owned |
| 反向 generation 屏障夹具 TS2349 修复与 typecheck | complete / typecheck-verified |
| 统一 `pnpm run verify`（preload 同步、全量测试、typecheck、production build） | complete / automated-verified |
| 三类 uTools preload 单一资产清单与镜像同步 | complete / automated-verified |
| 真实 uTools 重载与状态转换验收 | pending / user-owned |
