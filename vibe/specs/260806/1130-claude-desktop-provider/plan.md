# Plan：Claude 桌面端 provider 分期

Spec: [spec.md](spec.md#L1)

## 分期（每期独立可验收，默认关闭直至最后一期）

- **Phase 0 — spec 细化 + 设计偏好回执**：补全 spec 待定项（去重规则、key 命名空间、水球三方策略、audit 事件→状态映射表）；读 soul + design-preferences 出回执；audit.jsonl 事件类型实采样（用户跑一次脱敏 `head`，或授权 Finder/Quick Look 取样）。
- **Phase 1 — 纯域**：`claudeDesktop.ts`（会话 json 归一、audit 事件归一、状态机、时效规则）+ 聚合层第三通道扩展；全量单测。
- **Phase 2 — preload 桥**：只读发现 + fs.watch 推送 + 事件解析（容错：HMAC 校验不做，只读不验）；桥安全测试（路径含空格、坏 JSON、半行 jsonl）。
- **Phase 3 — Controller/呈现**（P1-2 后大幅简化）：桌面卡并入既有 `claude` 通道，聚合/角标/循环序/水球**零改动**；剩余 = controller 里 `combineClaudeLaneCards` 接线、桌面 lane 的 refresh/watch 生命周期、（可选）行级"桌面/CLI"来源细分标记与 `rate_limit_event.resetsAt` 额度校准——后两项出设计偏好回执。仅-Codex 与既有双通道逐字节回归照跑。
- **Phase 4 — 打开 + 设置页**：AX 窗口激活路线；「接入来源」分区加桌面端块；帮助文档。
- **Phase 5 — 对抗复核 + 收尾**：对抗式子代理复核、error-memory、宿主验收清单。

## 并发风险（开工前必须确认）

另一会话正在改 `appRuntime.ts / types.ts / state.ts / App.vue / SettingsPage.vue`（favorites/runner 在途，typecheck 尚有 4 处未闭合）。Phase 3/4 会触碰同一批文件——**等该轮落地后再开工**，或先只做 Phase 0-1（纯新增文件，零冲突）。

## 开工条件

- [ ] 用户确认分期与范围
- [ ] favorites 在途轮落地（或确认只做 Phase 0-1）
- [ ] Phase 0 的 audit.jsonl 采样到手
