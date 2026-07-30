# Task 11 — fix wasm `day_key_offset` u32 underflow

## 根因

`src-rust/stats.rs` 的 `day_key_offset` 在 wasm 分支上用 `d.set_date(d.get_date() - offset as u32)`
回退日期。`js_sys::Date::get_date()` 返回 1–31 的 `u32`，而 `offset` 常常远大于它
（`heatmap(state, 182)` 最大传 181，`streak` 最多回溯 400 天），减法在 `u32` 上下溢。
release wasm 不 panic，只是静默算出垃圾日期，导致热力图格子和连续打卡天数落在错误的日子上。

native 分支本来就是正确的（在毫秒上做减法）。由于 cfg 是 `not(test)`，`cargo test` 编译的是
native 分支，所以 66 个通过的测试无法覆盖这个 bug。

## 修复

只改 wasm 分支，改为与 native 分支一致地在毫秒上做减法，再由毫秒构造 `Date`：

```rust
// 用毫秒做减法（对齐 native 分支）：set_date(get_date() - offset) 会让 u32 下溢，
// offset > 当月日号时会算出垃圾日期。get_full_year/get_month/get_date 仍是本地时区语义。
let ms = js_sys::Date::new_0().get_time() - (offset as f64) * 86_400_000.0;
let d = js_sys::Date::new(&wasm_bindgen::JsValue::from_f64(ms));
return format!("{:04}-{:02}-{:02}", d.get_full_year(), d.get_month() + 1, d.get_date());
```

`get_time()` 是 `f64` Unix 毫秒，不存在无符号下溢。读取日期分量仍用
`get_full_year()` / `get_month()` / `get_date()`，保持浏览器**本地时区**语义，与原有行为及
`legacy/js/store.js` 一致（没有改成 UTC）。native 分支未作任何改动。

## 验证 1：`cargo test`

```
test stats::tests::by_category_follows_declaration_order ... ok
test stats::tests::heatmap_returns_requested_span_with_zeros_filled ... ok
test stats::tests::overall_on_empty_state_does_not_divide_by_zero ... ok
test stats::tests::overall_counts_mastery_and_accuracy ... ok
test stats::tests::weakest_ranks_by_mastery_rate_then_id ... ok
test stats::tests::resume_risk_reports_unmastered_flagged_questions ... ok
test scheduler::tests::toggle_fav_flips_and_reports ... ok
test tests::skeleton_compiles ... ok
test stats::tests::weakest_skips_empty_categories ... ok
test parser::tests::real_bank_passes_validation ... ok

test result: ok. 66 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.03s

   Doc-tests embq_core

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

66 passed / 0 failed —— native 路径未受影响。

## 验证 2：`cargo build --target wasm32-unknown-unknown --release`

这是真正编译到改动代码的检查（wasm 分支只在这里被编译）。

```
   Compiling js-sys v0.3.103
   Compiling getrandom v0.2.17
   Compiling serde-wasm-bindgen v0.6.5
   Compiling rand_core v0.6.4
   Compiling rand_chacha v0.3.1
   Compiling rand v0.8.7
   Compiling embq-core v2.0.0 (C:\Users\xiao\Desktop\嵌入式面试题库\.claude\worktrees\agent-a5ddd27ef495f3f47)
    Finished `release` profile [optimized] target(s) in 31.41s
```

编译干净，无 warning、无 error。

## 验证 3：手工推演 today = 2026-07-05, offset = 181

期望结果：**2026-01-05**

反向核对天数（2026-01-05 → 2026-07-05）：

| 区间 | 天数 |
|---|---|
| 01-05 → 02-05 | 31 |
| 02-05 → 03-05 | 28（2026 非闰年）|
| 03-05 → 04-05 | 31 |
| 04-05 → 05-05 | 30 |
| 05-05 → 06-05 | 31 |
| 06-05 → 07-05 | 30 |
| **合计** | **181** |

修复后的算术：`get_time()` 返回 2026-07-05 本地时刻的毫秒，减去
`181 * 86_400_000 = 15_638_400_000` ms（181 天），得到 2026-01-05 同一本地时刻的毫秒。
`Date::new(&JsValue::from_f64(ms))` 由该毫秒构造，`get_full_year()=2026`、
`get_month()=0`（+1 → 1）、`get_date()=5`，格式化为 `2026-01-05`。✔

对比修复前：`get_date()=5`，`5u32 - 181u32` 回绕为 `4_294_967_120`，
`set_date(4294967120)` 得到的日期完全无意义 —— 这正是 bug 的表现。

补充说明：该毫秒减法在跨 DST 切换时会有 ±1 小时偏移，但与 native 分支的语义一致，
且原本的意图（回退整天）在非 DST 边界下精确成立；本次不扩大改动范围。

## Commit

- hash: `30eab3a01acd62270c942aaee57a0b18d52f6654`
- message: `fix(core): avoid u32 underflow in wasm day_key_offset`
- 改动范围：仅 `src-rust/stats.rs`（4 insertions, 2 deletions），仅 `day_key_offset` 的 wasm 分支。

注：worktree 起始于 `68014ac`，已按要求 `git merge --ff-only c4dd8c8` 快进到基线后再修改。
报告文件在基线上并不存在（`.superpowers/sdd/` 只有 `progress.md` 与 `task-1-report.md`），
因此本次为新建而非追加。
