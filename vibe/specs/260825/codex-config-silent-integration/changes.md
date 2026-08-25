# Changed inventory — Codex 配置页静默刷新与运行区整合

| 路径 | 核心说明 |
| --- | --- |
| `src/domain/codexEnvironmentPresentation.ts` | 静默保持上次成功诊断；新增连接药丸文案投影 |
| `src/pages/CodexPage.vue` | 诊断标题+详情常显；live region 仅异常；`i` 走不透明顶层提示 |
| `src/styles/codex.css` | 运行区改为叠层换行，取消挤压三列 |
| `src/styles/app.css` | 主窗 Tooltip 改为不透明 |
| `tests/domain/codexEnvironmentPresentation.test.ts` | 覆盖静默刷新与冷启动 checking |
| `tests/ui/codexCompanion.test.ts` | 页面合同改为常显详情 + 条件 live region |
| `src/help/guides/codex.md` | 用户说明同步静默刷新与完整诊断 |
| `vibe/specs/260825/codex-config-silent-integration/` | 本轮 raw/spec/receipt/inventory |
| `vibe/specs/requirements/codex-raw-180.md` | 登记叶子 |
| `vibe/specs/requirements/modules/companion-codex.md` | 模块索引 |
| `vibe/specs/PRODUCT_REQUIREMENTS.md` | 当前产品语义 |
| `vibe/knowledge/ARCHITECTURE.md` | 实现映射 |
| `vibe/knowledge/developer-soul.md` | 配置页口味修正 |

未做：合并五个配置 Tab；改浮窗提示层；改 Desktop 桥真实 connecting 终态。
