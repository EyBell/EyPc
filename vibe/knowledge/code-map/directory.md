# 文档目录结构

本页只整理「读代码该走哪棵树」。权威正文仍在原位置，这里不复制条款。

## 仓库文档树（读代码用）

```text
vibe/
  rules/
    README.md                 项目规则入口
    documentation.md          文档分层合同（本导读层登记在此）
  specs/
    PROJECT_STATUS.md         当前交付状态与任务索引
    PRODUCT_REQUIREMENTS.md   唯一当前产品真值
    requirements/             条款身份 / 状态 / 取代
      README.md
      modules/                六模块 Primary 列表
      coverage.md             尚未入册的来源条款
    source-anchors/           无 RAW 父身份的来源寻址
    260xxx/…                  任务级 raw / spec / verify（历史证据）
  knowledge/
    ARCHITECTURE.md           实现所有权与数据流
    technical-details.md      可过期的实现记忆
    developer-soul.md         交互口味（可被 PRD 取代）
    error-memory/             可复用失败
    code-map/                 ← 本目录：需求↔代码行号导读
      README.md
      directory.md
      requirement-module-map.md
      modules/
      flows/
src/help/guides/              给终端用户的「说明」，不是开发导读
.codemark/codemark.json       核心流程书签，侧栏加载
```

## 代码树（实现用）

```text
public/plugin.json            uTools feature 入口码
src/main.ts · App.vue         主窗 Renderer
src/float-main.ts · FloatApp  Companion 子窗
src/action-main.ts · ActionApp  Environment Action 子窗
src/runtime/                  唯一突变、快捷键、Tab 切片
src/domain/                   纯函数，无 shell / 存储副作用
src/platform/                 宿主桥；浏览器 dev 走 fallback
src/pages/ · components/      只 dispatch，不直连 Node
preload/index.js              Host 入口（行数棘轮约束）
preload/companion/            V7 Kernel / Registry / Actions
preload/codex|claude|cursor/  Provider 适配器
preload/windows/              WJ-22 原生窗口
contracts/                    Companion V7 schema
```

## 阅读顺序（熟悉改造时）

1. [PRODUCT_REQUIREMENTS.md](../../specs/PRODUCT_REQUIREMENTS.md#L87) 的 Global + 目标功能节。
2. 对应 [requirements/modules](../../specs/requirements/modules/) 看哪些 RAW 仍 `active`。
3. [ARCHITECTURE.md](../ARCHITECTURE.md#L7) 找 owner 文件。
4. 本目录 [requirement-module-map.md](requirement-module-map.md#L1) 落到行号。
5. [flows/](flows/README.md#L1) 按一次真实用户操作走读。
6. 需要失败边界时再打开 [error-memory](../error-memory.md#L1)。
