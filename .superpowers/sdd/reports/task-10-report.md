# Task 10: 判卷与作答记录 — 报告

## 基线确认

worktree 初始在 `68014ac`，执行 `git merge --ff-only e55c38b` 后到达 `e55c38b`
（`fix(core): persist deck so sessions resume at the same question`）。
确认 `src-rust/scheduler.rs` 含 `pub fn save_deck`（196 行）与 `pub fn restore_deck`（211 行）。

## 实现内容

仅修改 `src-rust/scheduler.rs`，按 plan 的 Step 1-6 执行（先写 10 个失败测试，确认失败，再实现）。

顶部补充 import：`use crate::models::{Answer, Grade, QType, Verdict};`
（`QType` 原先未在本模块 import，判卷 match 需要它。）

新增 4 个方法，代码与 plan 逐字一致：

- `Scheduler::judge(&self, id: &str, picked: &[usize]) -> Verdict`
  - picked 先 `sort_unstable` + `dedup` 归一化，选项点击顺序不影响判定；少选/多选都算错。
  - `Single | Multi` 与排序后的 `Answer::Indices` 比对。
  - `Bool` 用 `picked[0]` 对照 `0 = false, 1 = true`。
  - `Qa` 恒返回 `correct: true` —— 简答题没有客观对错，由用户点三个评分按钮自评。
  - 未知 id 返回 `correct: false` 的 Verdict，不 panic。
- `Scheduler::record(&mut self, id: &str, grade: Grade)` —— 使用本模块已有的 `now_ms()` / `today_key()`。
- `Scheduler::toggle_fav(&mut self, id: &str) -> bool`
- `Scheduler::distribution(&self, pool: &[usize]) -> [usize; 4]` —— 计数 `[未练, 生, 熟, 已掌握]`。

## 三档评分行为核对（对照 `legacy/js/store.js:96-113`）

已实读 legacy 源码，逐档核对，实现与 v1 一致：

| grade | legacy/js/store.js | 本实现 |
| --- | --- | --- |
| `know` | `r.right++; r.box = Math.min(3, (r.box||0)+1)` | `p.right += 1; p.bx = (p.bx + 1).min(3)` |
| `fuzzy` | `r.box = Math.max(1, r.box || 0)`（第 104 行） | `p.bx = p.bx.max(1)` |
| `no` | `r.wrong++; r.box = 1; markWrong(id)` | `p.wrong += 1; p.bx = 1;` + 追加今日错题本 |

三档共同行为：`r.seen++` / `r.last = Date.now()` / `bumpDay()`
对应 `p.seen += 1` / `p.last = now` / 每次作答都 `days[day] += 1`。

**`fuzzy` 是保底不降级，不是降回 1 盒。** spec 表格的字面写法（降回 1 盒）未实现。
`box = max(1, box)` 意味着 2 盒题打 `fuzzy` 仍留在 2 盒；同时不计 `wrong`、不进当日错题本。
照 spec 字面实现会让 `fuzzy` 与 `no` 只差一个计数器，等于砍掉一整档用户信号。
plan 的 `record_fuzzy_floors_at_one_without_demoting` 测试已锁定正确行为，与本实现一致，无冲突。

错题本去重：按 id 判重（`!list.iter().any(|x| x == id)`），同一题连续答错两次只入一次，
但当日题量计数仍加 2。

## 测试结果

Step 2（确认失败）：

```
cargo test --lib scheduler
error[E0599]: no method named `judge` found for struct `scheduler::Scheduler` in the current scope
   --> src-rust\scheduler.rs:549:19
```

与 plan 预期的 `no method named judge found` 一致。

Step 5（确认通过）：

```
cargo test --lib scheduler
test result: ok. 37 passed; 0 failed; 0 ignored; 0 measured; 22 filtered out; finished in 0.00s
```

全量：

```
cargo test
test result: ok. 59 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
   Doc-tests embq_core
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

`cargo build` 干净通过，无 warning。

实测数字 = 预期数字：scheduler 37（27 旧 + 10 新），全量 59（49 旧 + 10 新）。

10 个新测试：`judge_single_choice`、`judge_multi_choice_ignores_pick_order`、
`judge_qa_is_always_correct`、`judge_unknown_id_is_not_correct`、
`record_know_promotes_box_capped_at_three`、`record_fuzzy_floors_at_one_without_demoting`、
`record_no_resets_box_and_marks_wrong_today`、`record_bumps_daily_count_and_dedupes_wrong_list`、
`toggle_fav_flips_and_reports`、`distribution_counts_each_box`。

## 存档兼容性

未新增存档字段。写入的都是既有字段：`Progress.bx`（serde 落盘为 `box`）、
`right` / `wrong` / `seen` / `last` / `fav`，以及 `days` 和 `wrong_today`（落盘为 `wrongToday`）。
与 `localStorage["embq.v1"]` 的兼容性由 Task 4 的 serde 标注保证，本任务未触碰。

## 关注点

1. `record` 不调用 `save_deck()`，所以作答不会刷新 `state.deck`。这符合 plan 给的实现
   （落盘时机由 Task 12 的 WASM 桥 / TS 侧统一负责），但 Task 12 需要确保每次 `record`
   之后 TS 侧真的把 state 写回 localStorage，否则进度会丢。
2. `judge` 对 `Bool` 题只看 `sorted.first()`。因为归一化时做了排序，若用户同时选了 0 和 1
   （UI 上判断题应互斥，理论不会发生），会取到 0 即「错」。属于防御性行为，不 panic。
3. `distribution` 对 pool 里查不到的下标静默跳过，计数总和可能小于 `pool.len()`。
   Task 11 的统计若要用总数做分母，建议用 `distribution` 的和而不是 `pool.len()`。
4. `record` 的 `Grade::Know` 分支里 `p.bx + 1` 在 `p.bx == u8::MAX` 时会溢出 panic（debug 构建）。
   实际不可达 —— bx 只由本方法写入且恒被 `.min(3)` 夹住，但如果外部导入了脏存档
   （手工改过的 localStorage，box 值异常大）理论上可触发。v1 的 JS 版本没有这个风险。
   未改动，因为要严格遵循 plan 给的实现；如需加固，可在反序列化时夹一次 bx。

## Commit

- `3deb3b6` — `feat(core): add judge/record/toggle_fav preserving v1 grade semantics`（1 file changed, 188 insertions）

基线 `e55c38b`（由 `68014ac` fast-forward 而来）。
