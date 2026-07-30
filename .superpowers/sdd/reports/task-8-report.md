# Task 8 报告：三种排序模式（核心 bug 修复）

## 概要

在 `src-rust/scheduler.rs` 中实现了三种排序模式，全部保证**全序 + 可复现**，修掉了 v1「每次打开题目顺序都变」的核心 bug。

按计划 Step 1-5 执行（TDD：先写失败测试 → 确认失败 → 实现 → 确认通过 → 提交）。

### 新增接口

| 接口 | 可见性 | 说明 |
|------|--------|------|
| `Scheduler::build(&mut self, f: &Filter) -> usize` | pub | 筛选 + 排序，`pos` 重置为 0，存下 filter，返回卷长度 |
| `Scheduler::pool_ids(&self) -> Vec<String>` | pub | 当前卷按顺序的题目 id 列表 |
| `Scheduler::position(&self) -> usize` | pub | 当前题下标（见下方说明） |
| `Scheduler::order(&self, pool: &mut Vec<usize>, f: &Filter)` | private | 按 mode 分派排序 |
| `Scheduler::smart_key(&self, idx: usize) -> (u8, u8, u64, String)` | private | Smart 模式全序键 |

### 三种模式

- **`Ordered`**：空 match 分支，有意为之。`select` 用 `(0..len).filter(...)` 产出，天然是题库原始下标升序，再排一次是多余工作。测试 `ordered_mode_follows_bank_declaration_order` 守着这个假设——将来 `select` 换实现会立刻失败。
- **`Smart`**：`(bx, urgency, last, id)` 升序。`urgency` = 0（加急）当 `wrong > right` 或 `q.resume`，否则 1。保住了 v1「错多于对加急 / 简历高危提前」的行为，同时去掉了让它不可复现的 `Math.random() * 20` 抖动。`id` 兜底保证全序。
- **`Random`**：`StdRng::seed_from_u64(f.seed.unwrap_or(0))` + Fisher-Yates（`SliceRandom::shuffle`）。`seed: None` 时回退到固定值 0，绝不读系统熵源。

顶部新增 import：`crate::models::Mode`、`rand::rngs::StdRng`、`rand::seq::SliceRandom`、`rand::SeedableRng`。

## 与计划的一处偏差（测试用例，非实现）

计划里 `smart_mode_breaks_box_ties_by_last_then_id` 原样跑会失败：

```
left:  ["c-2", "c-1", "os-1", "os-2"]
right: ["c-1", "c-2", "os-1", "os-2"]
```

原因不是随机性——顺序完全确定，跑 5 次结果一致。是测试自身的前提有误：fixture 里 `c-2` 是 `resume: true` 的简历高危题，urgency 位恒为 0，所以它在 `id` 被比较之前就已经排到 `c-1` 前面了。计划假设四题键完全相等，实际 urgency 把它们分开了。

实现完全符合 spec 表格（`(bx, urgency, last, id)`，urgency 对 `wrong > right` 或 `resume` 取 0），所以**没有削弱排序键去迁就测试**，而是修正测试让它真正测到 `id` 兜底：给四题都设 `right: 0, wrong: 1`，把 urgency 位拉平。改动处已加注释说明原因。

改后断言与计划原意一致（同键时按 id 字典序），且真正覆盖了 `id` 这一级兜底。

## 另一处补充

计划的 Task 8 测试 `build_returns_pool_size_and_resets_position` 调用了 `s.position()`，但 `position()` 在计划里是 Task 9 才正式列出的接口。为让 Task 8 自己的测试能编译，本任务加了这个最小 accessor。Task 9 无需重复添加。

## 测试结果

```
$ cargo test --lib scheduler
test result: ok. 19 passed; 0 failed; 0 ignored; 0 measured; 22 filtered out
```

19 = 10 个已有 + 9 个新增，符合预期。

```
$ cargo test
running 41 tests
test result: ok. 41 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored
```

41 = 32 个已有 + 9 个新增，符合预期。

### 复现性额外验证

连跑 5 次 `cargo test --lib scheduler`，5 次全部 `19 passed; 0 failed`，无 flaky。

### 9 个新增测试

1. `ordered_mode_follows_bank_declaration_order`
2. `ordered_mode_is_reproducible`
3. `smart_mode_puts_lower_box_first`
4. `smart_mode_breaks_box_ties_by_last_then_id`（前提已修正，见上）
5. `smart_mode_is_reproducible_across_rebuilds`
6. `random_mode_same_seed_same_order`
7. `random_mode_different_seed_usually_differs`
8. `random_mode_without_seed_still_deterministic`
9. `build_returns_pool_size_and_resets_position`

## 关注点

- Task 7 遗留的 `pool` / `pos` dead_code 警告已随 `build` 写入而消失，未加任何 `#[allow(dead_code)]`。
- 仅剩 Task 7 遗留的 `unused import: QType`（在 `src-rust/scheduler.rs:3`）。本任务未触碰，留给后续任务清理。
- `smart_key` 对 `catalog.get(idx)` 返回 `None` 时给出 `(u8::MAX, 1, u64::MAX, String::new())` 兜底。多个越界下标会共享同一个键，理论上不是严格全序，但 `select` 只产出合法下标，实际不可达。
- `random_mode_different_seed_usually_differs` 依赖 seed 1 与 999 在 4 元素上洗出不同排列。4 个元素只有 24 种排列，碰撞是有可能的；当前两个 seed 已验证不撞，但这个测试在题目数很少时本质上不是强保证。

## Commit

| Hash | Message |
|------|---------|
| `02850c1` | `fix(core): make all three sort modes total-ordered and reproducible` |

基线为 `2f40abf`（worktree 初始在 `68014ac`，按指示 `git merge --ff-only 2f40abf` 后到位）。
