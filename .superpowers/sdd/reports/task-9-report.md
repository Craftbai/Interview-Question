# Task 9 报告：导航与卷持久化（进度丢失修复）

## 基线确认

工作树初始 HEAD 为 `68014ac`（不是要求的 `29d969b`），已按指示执行 `git merge --ff-only 29d969b`，快进成功。
确认 `src-rust/scheduler.rs` 含 `pub fn build`（第 143 行）与 `pub fn pool_ids`（第 153 行）后开始实施。

## 实施内容

修改文件：`src-rust/scheduler.rs`（唯一改动文件）

### Step 3：导航

按计划原文实现，并把原先独立的 `position()` 合并进新的导航 impl 块：

- `size() -> usize`
- `position() -> usize`
- `is_finished() -> bool` — `pos >= pool.len()`
- `current() -> Option<&Question>`
- `advance()` — 边界检查只有一处
- `back() -> bool` — 首题返回 `false`
- `goto(pos)` — `pos.min(pool.len())`，不 panic

`pos == pool.len()` 即完成态，未使用 `Option<usize>`。

### Step 4：卷的存取

按计划原文实现 `save_deck()` 与 `restore_deck()`：

- `save_deck()`：空卷时清掉 `state.deck` 而不是存一个空卷。
- `restore_deck()`：两种整卷作废情形 —— `bank_hash` 不符、任一 id 已不在题库。两种情形都置 `state.deck = None` 并返回 `false`，绝不部分恢复。

### 计划外的必要改动（1 处）

计划 Step 3/4 的代码从未调用 `save_deck()`，但 Step 1 的测试 `restore_deck_resumes_exact_position` 只做 `build` + 两次 `advance` 就直接序列化 `state()`，随后断言恢复成功。照 Step 3/4 字面实现，`state.deck` 恒为 `None`，该测试必然失败（实测：26 passed / 1 failed，panic 于「题库未变，应恢复成功」）。

计划中 `save_deck` 的文档注释本身写明了契约：「每次组卷/前进/后退后调用」，只是代码没接线。故按该注释把 `save_deck()` 接入：

- `build()` — 设好 `pool` / `pos` / `filter` 之后、返回长度之前
- `advance()` — 仅在 `pos` 真的前进时
- `back()` — 仅在真的回退时
- `goto()` — 夹取之后

方法签名与计划一致，无接口偏离。`build` 的返回值语义不变（仍返回卷长度，`build_returns_pool_size_and_resets_position` 仍通过）。

### 清理

顺带移除了 Task 7 遗留的未使用 `QType` 导入（该导入仅在 `use` 行，测试模块通过 `use crate::models::*` 自行取得 `QType`）。改动仅限那一行 import，未触碰无关代码。

## 测试

新增 8 个测试，全部按计划 Step 1 原文放入既有 `mod tests`：
`navigation_walks_pool_and_stops_at_end`、`back_returns_false_at_first_question`、`goto_clamps_out_of_range`、`empty_pool_reports_finished_without_panic`、`restore_deck_resumes_exact_position`、`restore_deck_rejects_deck_from_changed_bank`、`restore_deck_returns_false_when_no_deck_saved`、`restore_deck_drops_ids_no_longer_in_bank`

### 实测结果

```
$ cargo test --lib scheduler
test result: ok. 27 passed; 0 failed; 0 ignored; 0 measured; 22 filtered out; finished in 0.00s
```

```
$ cargo test
test result: ok. 49 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s

   Doc-tests embq_core
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

27（19 既有 + 8 新增）与 49 均与预期一致。

```
$ cargo build --lib   # 强制重编后
（无 warning，无 error）
```

## 关注点

1. **计划的测试与实现代码不自洽**（已在上面说明并解决）。若 Task 10 或 12 假定「`save_deck` 只由调用方显式触发」，需要注意现在 `build` / `advance` / `back` / `goto` 会自动写 `state.deck`。这符合计划注释所述契约，但与 Step 3/4 的字面代码有出入。
2. `restore_deck` 不校验保存的 `filter` / `seed` 是否还能重现同一副卷 —— 它直接信任 `ids` 列表。这是计划的设计（`ids` 是权威顺序，`filter`/`seed` 只作元信息回填），行为正确，但意味着如果将来有人手改存档里的 `ids`，恢复出来的卷可能与 `filter` 不匹配。`bank_hash` 只挡题库变化，挡不住存档被篡改。
3. `save_deck` 的 `seed` 字段与 `filter.seed` 冗余（`seed: self.filter.seed.unwrap_or(0)`）。照计划原文保留。

## 提交

| 提交 | 说明 |
| --- | --- |
| `e1e8875` | `fix(core): persist deck so sessions resume at the same question` |

基线：`29d969b`（`fix(core): make all three sort modes total-ordered and reproducible`）
