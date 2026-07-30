# Task 17: 题卡渲染 — 实施报告

**状态**: DONE_WITH_CONCERNS
**Commit**: `14e9411` — `feat(ui): render question card with consolidated CardState`
**基线**: `abfbfc8`（worktree 初始在 `68014ac`，已 `git merge --ff-only abfbfc8`）
**文件**: `src/ui/card.ts`（411 行新增，替换 4 行 stub）

---

## 1. 实现内容

按计划 Step 1–5 实现，Step 6 为浏览器手工验证（见第 5 节），Step 7 已提交。

### Step 1: 收拢卡片状态
`CardState` 单对象，切题时由 `resetCardState()` 整体替换，同时 `clearInterval` 清理口述计时器。

比计划多一个字段：**`oralDone: boolean`**。v1 的「讲完了」用模块级 `oralActive` 表示，是导致状态污染的同一类 bug——它在 `resetCardState` 里被重设为 `Store.get('oral')`（legacy/js/app.js:270），逻辑散在两处。放进 `CardState` 后随切题一起归零，语义单一。

### Step 2: 空卷与完成态
`renderEmpty` / `renderDone` 使用计划给出的代码，逐字未改（含文案、class、`style="justify-content:center"`）。

### Step 3: 题面渲染
`renderCard` 基本采用计划代码，四段片段从 `legacy/js/app.js:293-350` 平移：

| 片段 | 来源 | 说明 |
|---|---|---|
| `renderHead` | app.js:293-305 | `.card-head` + 分类/难度/题型/`.tag-resume`/前 3 个 tag/`.tag-box`（盒名 · 题号）|
| `renderChoices` | app.js:307-326 | `.options` 容器 + `.opt` 按钮，`.opt-key` 序号、`.opt-mark` 标注，揭晓后 `is-right`/`is-wrong` + `disabled` |
| `renderAnswer` | app.js:328-342 | `.reveal` + `.reveal-head`（`verdict-ok`/`verdict-bad`）+ `.ans` + `.followup` |
| `renderActions` | app.js:414-431 | 提交/揭晓/下一题；`gradeRow()` 逐字取自 app.js:344-350 |

常量 `LEVEL_NAME` / `BOX_NAME` / `TYPE_NAME` 取自 app.js:10-12。分类名通过 `engine.cats()` 取一次后缓存进 `Map`。

**对计划代码的两处偏离**（均为与 v1 保持一致所必需）：

1. **`<div class="card-body">` 包裹层**。计划的 `renderCard` 写成 `<div class="card">${renderHead}${body}${renderActions}</div>`，漏了 `.card-body`。v1（app.js:434）是 `cardHead(q) + '<div class="card-body">' + body + '</div>'`，而 `css/style.css:221` 的 `.card-body { padding: 20px 22px; }` 是题面唯一的内边距来源。不加这层，卡片内容会贴死边框——违反「视觉零变化」。已按 v1 补上。

2. **口述遮罩里的「讲完了」按钮**。计划的口述片段只有 `.oral-clock` 和 `.oral-note`，没有出口；v1（app.js:412）有 `<button class="btn btn-primary" id="oralDone">讲完了</button>`。少了它，开启口述模式后无法揭晓答案，该模式不可用。已补上，改用 `data-act="oralDone"` 走事件委托而非 `id` + 直接绑定。

### Step 4: 事件委托
`mountCard` 在 `#cardWrap` 上绑定**一次** click 委托，`renderCard` 只写 DOM 不挂监听。`#btnPrev` / `#btnNext` / `#btnFav` 各绑定一次。

按 v1 行为补齐了计划代码未覆盖的分支：

- **单选/判断点选项即提交**（app.js:477-480）。计划的 opt 分支对非 multi 只 `state.picked = [idx]` 后重绘，会停在「选了但没判卷」的中间态，且此时没有任何按钮可提交（单选题不出提交按钮）——题卡会卡死。现在走 `submitObjective`。
- **`submitObjective` 空选提示**「先选一个再提交」（app.js:485）。
- **客观题自动记分**（app.js:489）：判对记 `know`、判错记 `no`，只有简答题出三个自评按钮。计划的 reveal 分支只 `judge` 不 `record`，客观题的作答不会进 Leitner 盒。
- **`data-act="reveal"` 承担全部空格语义**：未揭晓时是提交/揭晓，已揭晓时是「下一题 / 完成这一卷」。Task 20 的空格键用 `[data-act="reveal"]` 单选择器点击，所以三个阶段必须共用这一个属性。计划代码在已揭晓态没有该元素，空格会失效。
- **`#btnPrev` 首题 toast**「已经是第一题」（app.js:512）。

### Step 5: 口述倒计时
`startOral` / `stopOral` 从 app.js:273-291 平移：先 `tick()` 再 `setInterval`，`#oralClock` 消失时自停，`oralLeft <= 0` 切 `.is-up`（负数显示 `-m:ss`）。句柄存 `state.oralTimer`，`resetCardState` 统一清理。

---

## 2. 验证输出

```
$ npx tsc --noEmit
（无输出，EXIT=0）
```

```
$ npm test
 ✓ src/core/markdown.test.ts (8 tests) 6ms
 ✓ src/core/store.test.ts (9 tests) 13ms

 Test Files  2 passed (2)
      Tests  17 passed (17)
   Duration  2.47s
```

```
$ npx vite build
vite v5.4.21 building for production...
✓ 14 modules transformed.
dist/assets/manifest-StzLgqkl.json        0.76 kB │ gzip: 0.30 kB
dist/index.html                           6.15 kB │ gzip: 2.25 kB
dist/assets/embq_core_bg-BwCu-Oa-.wasm  390.20 kB
dist/assets/index-_iDjFm1C.css           14.32 kB │ gzip: 3.51 kB
dist/assets/index-DO35Q3VV.js            19.93 kB │ gzip: 8.03 kB
✓ built in 212ms
```

未运行 `npm run build`（会调 `wasm-pack`，binaryen 需联网）；`pkg/` 沿用已构建产物。

**环境备注**：`pkg/` 与 `node_modules/` 都在 `.gitignore` 里，worktree 中不存在。已从主检出目录建立 junction 链接以便验证，未修改任何被跟踪文件。

---

## 3. 需要后续任务接手的两处（重要）

### 3.1 `currentFilter` 本地兜底 → Task 18 替换

`src/ui/card.ts` 内有本地实现，从落盘 deck 读回筛选条件：

```typescript
/** Task 18 会用 ui/filter.ts 的 currentFilter 取代它 */
function currentFilter(ctx: AppCtx): Filter {
  return saved(ctx).deck?.filter ?? defaultFilter();
}
```

**Task 18 需要做的**：在 `src/ui/filter.ts` 导出 `currentFilter(ctx): Filter`（读当前 chips 状态），然后删掉 `card.ts` 里的本地函数，改为 `import { currentFilter } from './filter'`。

**语义差异**：兜底返回的是「当前这卷实际组卷时用的筛选条件」，而 Task 18 的版本返回「筛选面板此刻的 chips 状态」。二者在用户改了 chips 但没点重新组卷时会不一致。影响面仅限完成态的「再刷一遍」/「只刷这卷里的错题」两个按钮。

### 3.2 口述设置读自存档 JSON → Task 20 可改直连

`engine.oral()` / `engine.oral_seconds()` 尚不存在（Task 20 才加到 Rust 桥接）。当前从 `state_json()` 解析：

```typescript
function isOral(st: SavedState): boolean { return st.settings?.oral === true; }
function oralSeconds(st: SavedState): number { return st.settings?.oralSeconds ?? 60; }
```

**Task 20 加完 accessor 后**可把这两个函数改成直接调用 `ctx.engine.oral()` / `ctx.engine.oral_seconds()`。功能上等价（读的是同一份 `settings`），不改也能正常工作，只是每次渲染多一次 JSON 解析。

同理，单题的 `box` / `fav` 也从 `state_json()` 的 `q[id]` 读取——engine 未暴露单题进度 getter。这一点计划里的 `isFav(ctx, q.id)` 也没给实现。

---

## 4. 发现的一处引擎/UI 约定冲突（已在 UI 侧兼容）

**判断题的选项下标，v1 与 Rust 引擎是反的。**

- v1：显示 `['正确','错误']`，判卷 `right = [q.answer ? 0 : 1]` → **下标 0 = 正确**（legacy/js/quiz.js:92）
- Rust：`want = if *b { 1 } else { 0 }` → **下标 1 = 正确**（src-rust/scheduler.rs:256-258，计划 Task 10 明确写了注释「0 = 错, 1 = 对」）

Rust 侧已提交且测试通过，我没有改动它。UI 侧把「显示位置」与「引擎下标」解耦：

```typescript
const BOOL_OPTS = [{ label: '正确', idx: 1 }, { label: '错误', idx: 0 }];
```

`.opt` 的 `data-idx` 存引擎下标，`.opt-key` 的序号按显示位置排（正确=1、错误=2）。视觉与 v1 一致（正确在上），判卷结果正确。

**对 Task 20 的影响**：键盘数字键用 `document.querySelectorAll('.opt')[n].click()` 按 DOM 顺序取，走的是显示位置，因此按 `1` 选「正确」、`2` 选「错误」，与 v1 一致。无需特殊处理。

题库中共 7 道判断题，此前若按引擎下标直接渲染，全部 7 题的判卷结果都会反。

---

## 5. 待人工验证（Step 6，未执行）

我无法驱动浏览器，以下计划 Step 6 的清单**全部未验证**：

- [ ] 题卡外观与 v1 完全一致（对照 GitHub Pages 线上版本并排看）
- [ ] 单选点一下换选项，多选可多点、可取消
- [ ] 判断题两个按钮工作正常（**建议重点看**：见第 4 节的下标冲突，需确认 7 道判断题判对判错正确、且「正确」在上）
- [ ] 简答题直接出「揭晓」，揭晓后出三个评分按钮
- [ ] 三个评分按钮都能推进到下一题，且上一题的选择不残留
- [ ] `←` / `→` 导航正常，首题点「上一题」无反应且不报错
- [ ] 收藏星标点击后立刻变 `★`，刷新页面后仍是 `★`
- [ ] 刷完一卷显示完成态，「再刷一遍」和「只刷错题」都正常
- [ ] 顶部进度条随题目推进
- [ ] 额外：开启口述模式后倒计时走动、归零变红、「讲完了」可揭晓（该按钮是我按 v1 补的，计划里没有）
- [ ] 额外：`.card-body` 内边距是否与 v1 一致（我补的包裹层）

验证命令：`npm run build && npx vite preview --port 4173`（需联网，`wasm-pack` 要下 binaryen）。若 `pkg/` 已是最新，也可 `npx vite build && npx vite preview --port 4173`。

注：Task 18/20 尚未实现，`filter.ts` / `keys.ts` / `settings.ts` / `theme.ts` / `stats.ts` 仍是空 stub，所以此刻筛选面板、快捷键、口述模式开关都还不能用——口述模式相关项要等 Task 20 后才可完整验证。

---

## 6. 其他备注

- **`esc` vs `inline`**：v1 的选项与追问文本走 `inline()`（支持 `` ` ``、`**`、链接），但 `src/core/markdown.ts` 只导出 `esc` 和 `renderMD`，`inline` 未导出。我用了 `esc`。已扫描全部 476 题：选项与 followup 中含内联 Markdown 的数量均为 **0**，因此在真实数据上渲染完全一致。若 Task 23 收尾时想严格对齐，可从 `markdown.ts` 导出 `inline` 并替换。
- **题目总数确认**：`data/questions.json` 为 476 题（qa 352 / single 109 / multi 8 / bool 7），与全局约束一致。
- **`engine.judge()` 入参**：`pkg/embq_core.d.ts` 声明为 `Uint32Array`（wasm-bindgen 对 `Vec<usize>` 的映射），故调用处包了 `new Uint32Array(state.picked)`，而非计划里直接传数组。
