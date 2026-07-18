# Quick Jump 目标中心叠层需求记录

Tool: codex
Date: 2026-07-18
Spec: [spec.md](spec.md#L1)
Source format: `chat-requirement-summary`
Capture fidelity: `normalized-material-requirement`
Privacy boundary: `no-verbatim-prompt-or-transcript`

## Material Requirement Facts

- `RAW-001` (`active`): 所有 `F` Quick Jump 标记必须与对应目标的二维中心投影重合，仅通过更高 Z 轴层级悬浮；不得再使用标题侧边、目标角落、外部边缘、碰撞错位或视口夹取改变对应位置。
- `RAW-002` (`active`): 标记必须保留紧凑实底方框、边框和轻阴影，避免字母与目标或周围文字混淆；不采用纯描边裸字母。
- `RAW-003` (`active`): 标记必须继续使用 fixed 顶层和 `pointer-events: none`，不参与页面排版、不拦截目标点击；精确中心对应优先于标记互相避让和视口完整可见。
- `RAW-004` (`active`): `F` / `Shift+F`、目标扫描、筛选、激活、编辑控件输入所有权和 active 状态语义保持不变。

## Capture Boundary

- Included: 用户明确确认的定位关系、方框视觉、空间优先级和不变交互边界。
- Excluded: 原始 Prompt、对话转录、Agent 推理、工具输出、命令、日志和未确认的视觉扩展。
