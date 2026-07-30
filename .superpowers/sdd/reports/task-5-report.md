# Task 5 报告：Catalog 与题库指纹

## 基线确认

worktree 初始位于 `68014ac`（陈旧基线，无 `src-rust/`）。执行 `git merge --ff-only af80f19` 后到达要求的基线：

```
$ git log --oneline -1
af80f19 chore: pin Cargo.lock
```

确认 `src-rust/models.rs` 存在且包含 `pub struct UserState`（第 88 行）后才开始实现。

## 实现内容

文件：`src-rust/catalog.rs`（原为 Task 1 留下的占位注释，现已替换）。

按 plan 的 Step 1–5 逐步执行，实现代码与 plan 中给出的版本逐字一致：

- `pub struct Catalog { all, by_cat, cats, cat_index, id_index, hash }`
- 构造期一次性建好三个索引：
  - `by_cat: HashMap<String, Vec<usize>>` —— 顺序遍历 `all` 追加下标，因此每个分类内部**保持题库原始顺序**（`Ordered` 模式依赖该顺序）。
  - `id_index: HashMap<String, usize>` —— id → 扁平下标。
  - `cat_index: HashMap<String, usize>` —— 分类 id → `cats` 下标。
- 对外 API（全部按接口约定实现，后续 Task 可直接依赖）：
  `new` / `len` / `is_empty` / `get` / `all` / `by_cat` / `cats` / `cat_meta` / `index_of` / `bank_hash`
- `by_cat` 对未知分类返回空切片（`unwrap_or(&[])`），不 panic。

### 指纹设计

`bank_hash` 先把所有 id 收集后 `sort_unstable()`，再依次 hash，并额外把 `all.len()` 混入：

- 顺序无关：调整 `index.html` 里 `<script>` 的加载顺序不会改变指纹，用户进行中的卷不会失效。
- 内容敏感：新增/删除题目会改变 id 集合（及数量），指纹随之变化，旧卷被废弃并重新组卷。

`DefaultHasher` 跨 Rust 版本不保证稳定，这在本场景可接受：指纹只用于「与上次启动比对」，最坏后果是丢一次卷，不影响 `UserState.q` 里的单题进度。

## 测试结果

Step 2（确认失败）：

```
$ cargo test --lib catalog
error[E0433]: failed to resolve: use of undeclared type `Catalog`
...
error: could not compile `embq-core` (lib test) due to 6 previous errors; 1 warning emitted
```

与 plan 预期一致（`cannot find type Catalog in this scope`，rustc 实际报 E0433）。

Step 4（确认通过）：

```
$ cargo test --lib catalog
running 4 tests
test catalog::tests::by_cat_preserves_original_order ... ok
test catalog::tests::empty_catalog_does_not_panic ... ok
test catalog::tests::bank_hash_is_order_independent_but_content_sensitive ... ok
test catalog::tests::index_of_finds_question_by_id ... ok

test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 7 filtered out
```

全量：

```
$ cargo test
running 11 tests
test models::tests::progress_defaults_are_zero ... ok
test catalog::tests::bank_hash_is_order_independent_but_content_sensitive ... ok
test catalog::tests::empty_catalog_does_not_panic ... ok
test models::tests::question_accepts_qa_without_answer ... ok
test catalog::tests::index_of_finds_question_by_id ... ok
test models::tests::question_accepts_bool_answer ... ok
test catalog::tests::by_cat_preserves_original_order ... ok
test models::tests::question_roundtrips_choice ... ok
test models::tests::user_state_reads_v1_archive ... ok
test models::tests::user_state_writes_camel_case_keys ... ok
test tests::skeleton_compiles ... ok

test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

   Doc-tests embq_core
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

实测：`catalog` 4 通过、总计 11 通过（7 旧 + 4 新），与预期一致。`cargo build` 无警告。

## 说明与顾虑

- 测试模块按指示同时 `use super::*;` 与 `use crate::models::*;`，编译无 unused-import 警告。
- `Catalog` 只做索引，不做校验：重复 id 会被 `id_index` 静默覆盖为最后一个下标（`by_cat` 仍保留两条）。plan 把数据校验放在 Task 6（parser），因此这里不额外加防御，留意 Task 6 需要覆盖重复 id 的检查。
- `Catalog` 未派生 `Clone`/`Debug`，plan 的接口列表中也没有要求；若后续 Task 需要，再按需添加。
- 476 题 / 27 个 `<script>` 的实际装载在 Task 2/6 完成，本任务不涉及真实数据，只保证索引与指纹语义。

## Commit

- `d75da21` feat(core): add Catalog with cat index and bank fingerprint
