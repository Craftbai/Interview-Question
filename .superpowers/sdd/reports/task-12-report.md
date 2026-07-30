# Task 12 报告：WASM 桥接（QuizEngine）

**状态：** DONE_WITH_CONCERNS
**提交：** `3f7fa1e2cb7bc4ae21b5ba1e8f5dbd3e79899891` — `feat(core): expose QuizEngine over wasm-bindgen`
**基线：** `78418e1`（worktree 初始在 `68014ac`，已按指示 `git merge --ff-only 78418e1`）

## 实现摘要

在 `src-rust/lib.rs` 中新增 `#[wasm_bindgen] pub struct QuizEngine { inner: Scheduler, dirty: bool }`，按计划 Step 3–5 分三个 `#[wasm_bindgen] impl` 块实现全部 18 个 TS 可见方法，另加一个非导出的 `impl` 放私有辅助函数。保留了原有 5 个 `pub mod` 声明与 `mod tests`；`engine_tests` 为独立模块。

TS 侧 API 表面（`pkg/embq_core.d.ts` 已确认全部导出）：

- `constructor(questions_json, categories_json, state_json?: string | null)`
- `build(filter_json): number`、`restore_deck(): boolean`、`count(filter_json)`
- `current()`、`position()`、`size()`、`is_finished()`、`advance()`、`back(): boolean`
- `judge(picked: Uint32Array)`、`record(grade: string)`、`toggle_fav(): boolean`
- `stats()`、`health()`、`cats()`
- `state_json(): string`、`load_state_json(json)`、`is_dirty()`、`mark_clean()`

关键语义（均已被测试锁定）：

- **坏存档不拦启动**：`state_json` 用 `.and_then(|s| serde_json::from_str(s).ok()).unwrap_or_default()` 静默退回空状态；坏题库则返回 `Err`（无题可练是硬错误）。
- **`record` / `toggle_fav` 作用于当前题**，id 取自 `inner.current()`；已完成时 `current()` 为 `None`，两者都是 no-op。未知 grade 字符串直接 return，不写进度。
- **`build` 非法 filter JSON 返回 0**，不改动现有卷。
- `stats()` 为手写 `serde_json::json!` 字面量，外层 camelCase：`overall` / `byCategory` / `weakest` / `heatmap` / `resumeRisk`；嵌套 `resumeRisk.weak_ids` 保持 snake_case（来自 `RiskStats` 的 derive，已核对 `stats.rs:153-158` 无 `rename_all`）。`heatmap` 传 `182`，`weakest` 传 `5`。

## 已确认省略冗余的 `save_deck` 调用

按指示核对 `src-rust/scheduler.rs`，Task 9 已在 scheduler 层面接好持久化：

```
150:        self.save_deck();   // build
176:            self.save_deck();  // advance
185:        self.save_deck();   // back
191:        self.save_deck();   // goto
197:    pub fn save_deck(&mut self) {
```

因此 `QuizEngine::build` / `advance` / `back` 中**未**调用 `self.inner.save_deck()`。`grep -n "save_deck" src-rust/lib.rs` 返回空。三个方法其余逻辑（含 `self.dirty = true`）全部保留，`back` 仍只在 `ok == true` 时置脏。`build_persists_deck_for_restore` 测试通过，证明卷仍被正确持久化。

## 与计划的一处必要偏离

计划称「`wasm_bindgen` 方法在原生 target 下也能直接调用」——对成功路径成立，但对**构造 `JsError` 的失败路径不成立**。`new_rejects_bad_bank` 首次运行时 panic：

```
cannot call wasm-bindgen imported functions on non-wasm targets
    at wasm-bindgen-0.2.126/src/lib.rs:1215
```

`JsError::new` 是 JS 导入函数，原生 target 下调用即 panic，因此 `new` 的错误分支无法在 `cargo test` 中断言。

处理方式：把 `new` 的全部实际逻辑提取为私有的 `fn try_new(...) -> Result<QuizEngine, String>`，`new` 只做错误类型转换（`.map_err(|e| JsError::new(&e))`）。测试改为断言 `QuizEngine::try_new("[{", CATS, None).is_err()`。

**TS 可见签名与计划完全一致**，`try_new` 未加 `#[wasm_bindgen]`，不出现在 `.d.ts` 中。这是让计划指定的第 1 个测试可运行的最小改动，未改变任何行为。

## 测试结果

```
$ cargo test --lib engine_tests
running 9 tests
test engine_tests::new_rejects_bad_bank ... ok
test engine_tests::bad_filter_json_builds_nothing ... ok
test engine_tests::dirty_flag_tracks_unsaved_changes ... ok
test engine_tests::new_with_corrupt_state_falls_back_to_blank ... ok
test engine_tests::record_is_noop_when_finished ... ok
test engine_tests::invalid_grade_string_is_ignored ... ok
test engine_tests::toggle_fav_targets_current_question ... ok
test engine_tests::build_then_navigate_and_record ... ok
test engine_tests::build_persists_deck_for_restore ... ok

test result: ok. 9 passed; 0 failed; 0 ignored; 66 filtered out
```

```
$ cargo test
running 75 tests
test result: ok. 75 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
Doc-tests embq_core
test result: ok. 0 passed; 0 failed
```

**实测 75 通过（66 既有 + 9 新增），0 失败**，与任务书预期一致。注：计划 Step 6 文字写「63 + 9 = 72」，与任务书给出的 66 + 9 = 75 不符；实际既有测试数为 66，故 75 为正确值。

`cargo build --release` 零 warning 零 error。

另外用真实题库（`data/questions.json` + `data/categories.json`）跑了一个临时校验测试，确认：`build` 返回 **476**、5 个 camelCase 键齐全、`heatmap` 长度 182、`weakest` ≤ 5、`resumeRisk.weak_ids` 为数组、`parser::health` 返回空。该临时测试已删除，最终提交中不含它。

## WASM 体积

```
$ ls -l pkg/embq_core_bg.wasm
390204 bytes  (384K)
```

**390,204 字节 ≈ 384 KB**，落在计划预期的 200–400 KB 区间内，远低于 1 MB 警戒线。`[profile.release]` 的 `lto = true` + `opt-level = "z"` 生效。同时生成 `embq_core.d.ts`（4258 B）、`embq_core.js`（16948 B）、`embq_core_bg.wasm.d.ts`（1968 B）。`pkg/` 已被 `.gitignore` 忽略，未进提交（`git status` 确认仅 `M src-rust/lib.rs`）。

## 关注点

1. **`npm run wasm` 原样执行会失败**（这是 DONE_WITH_CONCERNS 的唯一原因）。Rust 编译成功、wasm-bindgen 生成成功，但 wasm-pack 0.15.0 的可选后置优化步骤下载 binaryen 失败：

   ```
   Error: failed to download from https://github.com/WebAssembly/binaryen/releases/download/
          version_117/binaryen-version_117-x86_64-windows.tar.gz
   ```

   属环境网络限制，非代码问题。我用 `wasm-pack build --target web --out-dir pkg --no-opt` 成功产出全部产物并测得上述体积。**未修改 `package.json` 或 `Cargo.toml`**，因为这超出 Task 12 范围。后续需要决定：给 `Cargo.toml` 加 `[package.metadata.wasm-pack.profile.release] wasm-opt = false`、预装 binaryen、还是在 CI 放开该域名。跳过 `wasm-opt` 后体积仍达标，但少了约 10–20% 的额外压缩空间。注意 `npm run build`（`npm run wasm && vite build`）在当前环境同样会卡在这一步。

2. `judge` 在 TS 侧签名是 `judge(picked: Uint32Array)` 而非 `number[]` —— 这是 `Vec<usize>` 经 wasm-bindgen 的正常映射。Task 16–20 传参时需注意传 `Uint32Array`。

3. `load_state_json` 依赖 `serde_json::from_str` 先完整反序列化成功才赋值，「校验失败不动现有状态」的语义正确。但它只校验结构、不校验 `version` 字段，导入结构恰好兼容的 v1 存档会被接受。计划未要求版本校验，故未添加。

4. `count()` 对非法 filter JSON 用 `unwrap_or_default()`（回退默认 filter、返回全量计数），与 `build()` 返回 0 的行为不对称。这是照计划原样实现，属计划既有设计，非本任务引入。
