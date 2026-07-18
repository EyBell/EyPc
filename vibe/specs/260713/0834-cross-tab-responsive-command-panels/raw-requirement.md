# EyPc 跨页面交互与响应式优化需求记录

Tool: codex
Date: 2026-07-13
Spec: [spec.md](spec.md#L1)
Source format: `chat + screenshots`
Capture fidelity: `normalized-user-facts`

## 用户需求事实

- 所有操作都需要悬浮提示，且提示不能被页面或弹层遮挡。
- 所有页面应支持窗口缩小、纵向滚动和宽度收缩，尽量不产生横向滚动或不可达内容。
- Global Quick Jump 的 `F` 字母标记需要轻量背景，避免与文字、图标混在一起，同时尽量少遮挡目标内容。
- `Ctrl/Cmd+ArrowLeft` 详情与 `Ctrl/Cmd+ArrowRight` 动作菜单应成为跨 Tab 的统一交互架构；相关按钮、右键、编辑逻辑与快捷帮助需要完整核验。
- 需要真实页面测试，不以源码字符串或单一视口代替布局、焦点和滚动验收。
- 用户已明确要求执行此前形成的完整实施方案。

## 截图证据

- `800px` 级窗口中，收藏动作抽屉覆盖右侧大部分主内容并由遮罩阻断底层页面。
- Quick Jump 字母直接覆盖在 Tab、树项和按钮图标上，透明背景不足以保证可读性。

## 采用的推荐默认

- `>720px` 使用页内停靠面板，`<=720px` 使用 Tab 内容区独占面板；确认与原子编辑仍可模态。
- 面板宽度自动响应式收缩，本轮不增加用户拖拽与宽度持久化。
- Settings 只对快捷键命令行和 Layer Commands 提供左右面板；普通表单保留原生编辑行为。
- Quick Favorites 只提供只读详情与打开、定位、复制等安全动作，不加入管理命令。
- 文件收藏仍只管理插件元数据，不扩展真实文件删除、移动或重命名。

## Capture Boundary

- Included: 用户可观察的布局、Tooltip、Quick Jump、快捷键、焦点、滚动与真实测试要求。
- Excluded: Agent 推理、工具输出、命令、日志、运行时标识和未获确认的范围扩张。

