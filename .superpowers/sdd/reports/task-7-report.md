# Task 7: Scheduler 筛选 — 实施报告

## 基线确认

worktree 初始 HEAD 为 `68014ac`，执行 `git merge --ff-only 557c082` 后到位。
确认 `src-rust/parser.rs:30` 含 `pub fn parse`，`src-rust/catalog.rs:43` 含 `pub fn bank_hash`。

## 实施内容

按计划 Step 1-6 逐步执行，代码严格照计划原文抄录。

### Step 1-2: 先写失败测试
在 `src-rust/scheduler.rs` 写入 10 个测试（`mod tests`），fixture 按要求拆成两层：
- `fixture_catalog() -> Catalog` — 4 题固定题库：`c-1(c-lang,L1,single)`、`c-2(c-lang,L2,qa,resume)`、`os-1(os,L1,qa)`、`os-2(os,L3,single)`
- `fixture() -> Scheduler` — 包一层 `UserState::default()`

Task 9/10 需要自定义 state 时可直接调 `fixture_catalog()`。

首次运行确认失败：`error[E0425]: cannot find type Catalog in this scope`（后续错误同为 `Scheduler` 未定义）。

### Step 3: Scheduler 骨架与 select
私有字段 `catalog` / `state` / `filter` / `pool: Vec<usize>` / `pos: usize`，Task 8-10 会用到 `pool` 与 `pos`。

对外方法：`new`、`select`、`catalog`、`state`、`state_mut`、`filter`；私有辅助 `progress_of`、`wrong_today_ids`。

`select` 语义：遍历 `0..catalog.len()`，保持题库原始顺序，逐维短路判定。
- 维度之间 AND，维度内部 OR
- 空维度 = 无约束
- 关键词大小写不敏感，检索范围为 题干 `q` + 参考答案 `a` + `tags`
- `Scope::Fav` → `p.fav`；`Scope::Unmastered` → `p.bx < 3`；`Scope::ResumeRisk` → `q.resume`；`Scope::Wrong` → 命中 `state.wrong_today[today_key()]`

### Step 4: 时间辅助
模块级 `pub fn now_ms()` 按 `#[cfg(all(target_arch = "wasm32", not(test)))]` 与其否定式二分：wasm 走 `js_sys::Date::now()`，其余走 `std::time::SystemTime`。`today_key()` 同样二分，wasm 走 `js_sys::Date::new_0()` 的本地时区取值，native 走 `ymd_from_ms(now_ms())`。`ymd_from_ms` 为 native-only（同 cfg 否定式），手算闰年/月长换算 UTC 日期。

`Cargo.toml` `[dependencies]` 追加 `js-sys = "0.3"`。`Cargo.lock` 相应新增一行（js-sys 本已作为 wasm-bindgen 生态传递依赖存在，故仅 +1 行）。

## 测试结果

```
$ cargo test --lib scheduler
running 10 tests
test scheduler::tests::filters_by_category ... ok
test scheduler::tests::scope_resume_risk_selects_flagged ... ok
test scheduler::tests::dimensions_combine_as_and ... ok
test scheduler::tests::filters_by_level_as_or_within_dimension ... ok
test scheduler::tests::filters_by_type ... ok
test scheduler::tests::scope_unmastered_excludes_box3 ... ok
test scheduler::tests::empty_filter_selects_everything ... ok
test scheduler::tests::scope_fav_selects_only_favourites ... ok
test scheduler::tests::keyword_matches_question_and_answer_case_insensitively ... ok
test scheduler::tests::no_match_returns_empty_without_panic ... ok

test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 22 filtered out
```

```
$ cargo test
running 32 tests
... (catalog 4 + models 6 + parser 11 + scheduler 10 + tests::skeleton_compiles 1)
test result: ok. 32 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

   Doc-tests embq_core
test result: ok. 0 passed; 0 failed
```

实测 10 / 32，与预期一致。

## 关注点

1. **`QType` 导入未使用** — `cargo build` 报 `warning: unused import: QType`（`f.types.contains(&q.qtype)` 通过 `Vec<QType>` 推导，不需要显式导入）。计划原文的 use 行包含它，按"照抄计划"的要求保留；Task 8-10 若在排序里显式写 `QType::...` 该警告会自然消失。
2. **`pool` / `pos` dead_code 警告** — 两字段本任务未读取，`cargo build` 报 `fields pool and pos are never read`。计划明确说明 Task 8-10 会用到，属预期状态，未加 `#[allow]` 掩盖。
3. **`today_key()` 时区不一致** — 文档注释写"本地时区"，但 native 分支走 `ymd_from_ms` 是 UTC 换算，wasm 分支 `js_sys::Date::new_0()` 是本地时区。在非 UTC 时区（如东八区）下，native 测试与浏览器实际运行会在跨日边界得到不同的 day key。这按计划原文实现，但如果后续 Task 有跨日期边界的存档兼容断言，可能需要复核。
4. **`Scope::Wrong` 无专门测试** — 计划给的 10 个测试覆盖 Fav / Unmastered / ResumeRisk，未覆盖 Wrong 分支（它依赖当日 key，测试写起来会耦合系统时间）。实现已就位但未经测试验证。

## Commit

- `971cf36` — `feat(core): add scheduler filtering with AND/OR semantics`（`src-rust/scheduler.rs`、`Cargo.toml`、`Cargo.lock`）
