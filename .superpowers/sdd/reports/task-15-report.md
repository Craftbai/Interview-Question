# Task 15: Markdown 渲染器平移 — 报告

- 基线：`1f68719`（进入 worktree 时为 `68014ac`，已 `git merge --ff-only 1f68719` 快进；`src/core/store.ts` 存在，确认后开工）
- 提交：`a9ad0a2` — `refactor(md): port markdown renderer to TS with behaviour locked by tests`
- 状态：DONE

## 产出

- `src/core/markdown.ts`：`export function renderMD(text: string): string`、`export function esc(s: string): string`，并在 `typeof window !== 'undefined'` 时挂 `window.__renderMD` 测试钩子（保留 v1 行为）。
- `src/core/markdown.test.ts`：plan Step 2 的 8 条测试，原样照抄。

实现按 plan Step 4 逐字照抄，未改正则、未调整 flush 调用顺序、未"优化"任何分支。`!` 非空断言保持原位（都在已由 `length` 保证非空的分支里），以满足 `noUncheckedIndexedAccess`。

## 测试结果（实际输出）

Step 3，确认先失败（缺 import）：

```
 ❯ src/core/markdown.test.ts (0 test)
Error: Failed to resolve import "./markdown" from "src/core/markdown.test.ts". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

Step 5，`npm test -- markdown`：

```
 ✓ src/core/markdown.test.ts (8 tests) 5ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

全量 `npm test`：

```
 ✓ src/core/markdown.test.ts (8 tests) 5ms
 ✓ src/core/store.test.ts (9 tests) 13ms
 Test Files  2 passed (2)
      Tests  17 passed (17)
```

合计 17 个测试通过（store 9 + markdown 8），与预期一致。

`npx tsc --noEmit`：无输出，退出码 0，零错误。

## Step 6：已跳过（附替代验证）

plan Step 6 原方案是生成 `scripts/diff-md.mjs` 列出 20 道风险题号，再由人在浏览器里对 legacy 与新实现的 `__renderMD` 逐条肉眼比对。该步骤需要人工浏览器交互，我无法执行，故按任务指示跳过。

作为等价替代，我在 Node 侧做了一次全量差分：用 `new Function` 把 `legacy/js/app.js` 第 24–128 行（`esc`/`inline`/`tableHTML`/`quoteHTML`/`renderMD`）原样求值成 legacy 渲染器，再对 `data/questions.json` 里每道题的 `q` 与 `a` 两个字段同时跑新旧实现，逐字节比对字符串。

```
题目总数=476 渲染字段数=952 含风险标记题目=476 差异=0
```

476 道题、952 个字段，新旧输出**逐字节完全一致**，差异 0。覆盖面比原计划的 20 道抽样更广（476 道题全部含 `` ` `` `|` `>` `*` `\` 中至少一种标记，即 plan 的"风险题"筛选条件对全库都成立）。差分脚本为临时产物，比对完成后已按 plan 要求删除，未进入提交。

## 约束核对

- `css/style.css` 与 `index.html` 未触碰（`git status` 在提交前只有两个新增文件，无其他改动）。
- 题目总数 476，与全局约束一致（差分脚本实测输出确认）。

## 关注点

- 全量差分依赖 `new Function` 求值 legacy 源码的固定行区间（23–128，0-based slice）。若日后 `legacy/js/app.js` 行号漂移，该比对方式会失效——但脚本已删除，仅作为本次一次性验证手段记录在此。
- `window.__renderMD` 钩子做了 `typeof window` 保护，因此在纯 Node（无 jsdom）环境导入也安全；Vitest 配了 jsdom，测试里 `window` 存在。
- 无其他遗留问题。Task 17/18/19 可直接 `import { renderMD, esc } from './markdown'`。
