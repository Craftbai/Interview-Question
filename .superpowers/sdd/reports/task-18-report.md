# Task 18: 筛选面板 — 完成报告

## 实现了什么

在 `src/ui/filter.ts` 中实现了完整的筛选面板逻辑（135 行新增代码），包括：

- **`currentFilter(ctx)`** — 从 DOM chips 状态读回 `Filter` 对象，mode 为 `random` 时补 seed
- **`renderCatChips(ctx)`** — 按 `engine.cats()` 声明顺序渲染分类 chips，带题量角标，0 题的分类不渲染
- **`refreshCount(ctx)`** — 实时显示命中题量和盒状态分布
- **`mountFilter(ctx)`** — 绑定所有事件：
  - `#btnFilter` 切换面板显隐（同时隐藏 settings）
  - 所有 chips 的点击委托：mode 单选、其他维度多选 toggle
  - 分类快捷操作（全选 / 清空 / 车载方向）
  - 搜索输入实时更新计数
  - 重置按钮恢复默认 filter
  - 应用按钮组卷（命中 0 题时 toast 提示，不清牌不关面板）
- **`onChips(container, attr)`** — 辅助函数，从 chips 容器读 `.is-on` 元素的 `data-*` 属性
- **`applyFilterToDom(f)`** — 将 Filter 写回 DOM chips（重置用），空 cats 视为"全选"

`AUTO_PRESET` 使用**硬编码字面量**（与 plan Step 3 代码块一致）。`data/categories.json` 的 `presets.automotive` 也包含相同的 8 个分类。

## card.ts 占位符确认

**已确认移除。** `src/ui/card.ts` 中的局部 `currentFilter` 函数（含注释）已删除，改为从 `./filter` 导入。`SavedState.deck.filter` 仍引用 `Filter` 类型，故 `Filter` 保持从 `../main` 的类型导入。

## 循环导入分析

不存在运行时问题：
- `filter.ts` → `card.ts` 只引用 `resetCardState`（事件回调中调用）
- `card.ts` → `filter.ts` 只引用 `currentFilter`（事件回调中调用）
- 两者都由 `main.ts` 在模块初始化时导入，但实际调用发生在用户交互时

## 构建结果

| 检查 | 结果 |
|------|------|
| `npx tsc --noEmit` | 报错 `Cannot find module '../pkg/embq_core'` — **预存问题**，`pkg/` 目录存在于主仓库但不在 worktree 中 |
| `npx vitest run` | **17 tests, 2 test files, all passed** (8.2s) |
| `npx vite build` | 同样因 `pkg/embq_core` 缺失失败 — **预存问题** |

## 待手工验证（Step 4）

无法在此环境驱动浏览器，以下检查需手动完成：
- 分类 chips 顺序以「C 语言核心」开头
- 「全选 / 清空 / 车载方向」三个快捷操作正常
- 勾选任何 chip，`#deckCount` 立刻更新
- 维度之间是 AND、维度内部是 OR
- 「顺序练」连续组卷两次，第一题相同
- 「随机练」组卷两次顺序不同，但刷到第 3 题刷新页面后仍停在第 3 题
- 条件过窄时提示「没有命中任何题目」而不是白屏

## Commit

`5899fb2` — `feat(ui): filter panel with live count and mode selection`
