# Task 4 报告：用户状态模型与旧存档兼容

## 概要

在 `src-rust/models.rs` 中**追加**（未替换）Task 3 已有内容，实现用户进度/状态模型，并锁定与现有 `localStorage["embq.v1"]` 存档的字段名兼容。

按计划 Step 1-6 执行：

- **Step 1**：在**已有的** `#[cfg(test)] mod tests` 块内追加 3 个测试（`user_state_reads_v1_archive`、`user_state_writes_camel_case_keys`、`progress_defaults_are_zero`），逐字照计划。
- **Step 2**：确认失败，报错与计划预期一致（见下）。
- **Step 3**：新增 `Progress`、`Settings`、`UserState`，含手写 `Default` impl（`Settings`: theme `"auto"` / oral `false` / oral_seconds `60`；`UserState`: version `2` / 空 map / `deck: None`）。同时在文件顶部已有 `use` 后补 `use std::collections::HashMap;`。
- **Step 4**：新增 `Scope`、`Mode`（含 `Default` = `Mode::Smart`）、`Filter`、`Deck`、`Grade`、`Verdict`。
- **Step 5**：6 个测试全部 PASS，含关键的 `user_state_writes_camel_case_keys`。
- **Step 6**：以计划中的原文 commit message 提交。

### spec 修正点 2 的落地

计划开头「两处需要在实现中修正 spec 的地方」第 2 条要求：`wrong_today` / `oral_seconds` 若不加 rename，序列化结果会与现有存档的 `wrongToday` / `oralSeconds` 对不上，老用户进度读不出来。本任务实装的三处 serde rename 即为此：

| Rust 字段 | 落盘/读档 key |
|---|---|
| `Progress.bx` | `box` |
| `UserState.wrong_today` | `wrongToday` |
| `Settings.oral_seconds` | `oralSeconds` |

`user_state_writes_camel_case_keys` 断言输出包含 `"wrongToday"`、`"oralSeconds"`，且**不含** `wrong_today`——这条是守着老用户进度不丢的回归测试。`user_state_reads_v1_archive` 用真实 v1 存档形状（`version: 1`，无 `deck`）验证反序列化方向。

### 产出的类型

- `Progress { bx, right, wrong, seen, last, fav }`
- `UserState { version, q, days, wrong_today, settings, deck }`，derive 含 `Clone`（后续任务在测试中 clone）
- `Settings { theme, oral, oral_seconds }`
- `Deck { ids, pos, filter, seed, bank_hash }`
- `Filter { cats, levels, types, scopes, mode, keyword, seed }`
- `Scope { Wrong, Unmastered, Fav, ResumeRisk }`、`Mode { Smart, Ordered, Random }`、`Grade { Know, Fuzzy, No }`、`Verdict { correct, expected, picked }`

`Grade` 为 `rename_all = "lowercase"`，取值即 `know` | `fuzzy` | `no`，符合全局约束。

## 测试结果

### Step 2：确认失败

```
$ cargo test --lib models
error[E0425]: cannot find type `UserState` in this scope
error[E0433]: failed to resolve: use of undeclared type `UserState`
error[E0433]: failed to resolve: use of undeclared type `Progress`
error: could not compile `embq-core` (lib test) due to 3 previous errors
```

与计划预期 `cannot find type UserState in this scope` 一致。

### Step 5：确认通过

```
$ cargo test --lib models
test models::tests::progress_defaults_are_zero ... ok
test models::tests::question_accepts_qa_without_answer ... ok
test models::tests::user_state_writes_camel_case_keys ... ok
test models::tests::question_roundtrips_choice ... ok
test models::tests::question_accepts_bool_answer ... ok
test models::tests::user_state_reads_v1_archive ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out
```

6 个 PASS（Task 3 的 3 个 + 本任务新增 3 个），符合预期。`user_state_writes_camel_case_keys` 已单独确认通过。

```
$ cargo test
running 7 tests
test tests::skeleton_compiles ... ok
test models::tests::question_roundtrips_choice ... ok
test models::tests::question_accepts_bool_answer ... ok
test models::tests::question_accepts_qa_without_answer ... ok
test models::tests::progress_defaults_are_zero ... ok
test models::tests::user_state_writes_camel_case_keys ... ok
test models::tests::user_state_reads_v1_archive ... ok
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

   Doc-tests embq_core
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

7 个全部 PASS，符合预期。`cargo build` 无 warning。

## 注意事项与关注点

1. **工作树初始基线不对，已修正。** 本 agent 分配到的隔离工作树分支初始指向 `68014ac`（"fix: rename _meta.js to meta.js"），缺少 v2 的 Rust 骨架与 Task 3 成果，`src-rust/` 整个目录不存在。核实 `68014ac` 是 `2f226e0` 的祖先（`git merge-base --is-ancestor` 退出码 0），因此以 `git checkout -B <branch> 2f226e0` 快进到任务指定基线，无任何工作丢失。后续所有编辑与提交都在正确基线上。

2. **`Scope::ResumeRisk` 当前序列化为 `resumerisk`，与 DOM 的 `data-scope="resume"` 不一致——这是计划的预期状态，不是缺陷。** 计划 Task 14「Scope 序列化对齐 DOM」专门处理这一点，会把该变体 rename 为 `"resume"`。本任务照 Step 4 原文实现，未提前修改。

3. **`Cargo.lock` 仍未被 git 跟踪**（`git status` 显示 `?? Cargo.lock`）。首次 `cargo test` 生成，且解析出 `getrandom v0.2.17`、`rand v0.8.7` 等非最新版本。本任务的文件清单只含 `src-rust/models.rs`，故未纳入提交。cdylib crate 通常应提交 `Cargo.lock` 以固定构建，建议后续任务或收尾阶段决定是否跟踪。

4. **`Progress.bx` 为 `u8`**，Leitner 盒号上限受此约束（0-255）。按计划原文实现，当前无问题。

## Commit

| Hash | Message |
|---|---|
| `8720d30` | `feat(core): add UserState/Filter/Deck with v1 archive compat` |

基线：`2f226e0`（`feat(core): add Question/Answer/QType models with serde compat`）
改动：`1 file changed, 154 insertions(+)`，仅 `src-rust/models.rs`。
