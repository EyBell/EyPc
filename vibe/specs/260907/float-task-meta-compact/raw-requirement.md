# RAW-217：悬浮卡片任务行第二行压缩

Tool: cursor · Date: 2026-09-07 · Level: Standard（需求）

spec_id: SPEC-260907-FLOAT-TASK-META-COMPACT

## 用户原话

> 优化一下悬浮卡片的展示元素信息 也就是说对话记录第二行的这是个信息
>
> * 压缩一下“归属”的描述：
> 1. 把 cloud、codex、Cursor 都缩写成两个字母 `cc, cx, cs`。
> 2. 把“归属”改为数学符号中的归属标记 `∈`。
>
> * 有了归属之后就不需要展示 `claude chats`
> * 子任务展示的字符改为 `sub+3`
> * 时间展示改为 `33d` `12h` `35m` `RECENT`
> * 并且把归属项目放到第二序列
>
> 综上 完整的第二行信息模板如下:
> `∈cc CodeNote sub+3 已完成 2.5h `
> 悬浮时可以展示更详细的说明信息

口误：截图与现网来源是 Claude / Codex / Cursor，不是 cloud；`cc` 对应 Claude。

## 同日跟进（用户原话）

> ∈去掉, cc改为大写,
>
> 核验一下 为什么很多个任务获取不到它的归属项目 只能知道它是 Cursor 的或者是 Cloud Code 的 真实去核排查一下

## 规范化需求

1. 任务行第二行来源标记为两字母大写缩写：Claude `CC`、Codex `CX`、Cursor `CS`。不再使用 `∈`。颜色仍用来源 token。项目行继续显示完整「归属 Codex / Claude / 共享」。
2. 行 `aria-label`、来源标记 tooltip 与 200ms 悬停提示保留完整「归属 Claude / Codex / Cursor」，不得改成只靠颜色辨认来源。
3. 有来源标记后，第二行不再展示默认 chats 容器名：`Claude Chats`、`Cursor Chats`、`Codex Chats`、`Chats`、`Cursor Agent`，以及 `projectKind === 'chats'` 或 32 位 workspace 哈希。真实项目名排在来源标记之后。
4. Claude 任务的真实项目名来自 App 元数据 `originCwd`/`cwd` 末段（及与 Codex 同配方的 `projectKey`），必须写入 Kernel metadata；不得在证据层丢掉后由包层回填 `Claude Chats`。
5. Cursor 任务的真实项目名来自 `workspaceStorage/<id>/workspace.json` 的 folder/workspace 叶子，或 `file://` 工作区 URI；不得把 workspace 哈希当项目名。
6. 子任务摘要为 `sub+N`（`N = memberCount - 1`）。活动 / 注意 / 异常计数只进入悬停详情，不占第二行。
7. 第二行相对时间为 `RECENT`（< 1 分钟）、`Nm`、不足一天时为整小时 `Nh` 或一位小数 `N.h`（如 `2.5h`）、满一天为 `Nd`。详情面板与 Shift 预览仍用中文长格式加绝对时间。
8. 可见顺序：`CC` 项目 `sub+N` 状态 时间。缺项省略，空格分隔，不插入 `·`。

## 需求变更评审

`scanned_owners`：RAW-022 文本化来源标记、PRD 任务行来源/拓扑摘要、帮助「虚拟项目与归属」与「任务拓扑」。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| refined | RAW-022 任务行可见「归属 Codex/Claude」字面 | 压缩为 `CC`/`CX`/`CS`；tooltip / ARIA / 来源底色保留 |
| refined | 本条首轮 `∈cc/cx/cs` | 去掉 `∈`，缩写改大写 |
| refined | V1 `+N 子任务` 常显摘要 | 第二行改为 `sub+N`；计数详情改悬停 |
| unchanged | 项目行完整「归属 …」 | 项目页与共享项目行不改 |
| unchanged | 来源 8%/12% 底色与状态色正交 | RAW-022 底色合同保留 |
