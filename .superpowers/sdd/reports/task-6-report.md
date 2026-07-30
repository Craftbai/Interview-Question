# Task 6: Parser 与数据校验 — 实施报告

## 基线确认

worktree 初始位于 `68014ac`（错误基线，`src-rust/` 尚不存在），按指令执行 `git merge --ff-only 03c50bf` 后到达目标提交。确认 `src-rust/catalog.rs:42` 含 `pub fn bank_hash`，`src-rust/lib.rs` 已声明 `pub mod parser;`，`data/questions.json` 与 `data/categories.json` 均存在。

## 实现内容

`src-rust/parser.rs`（新增，原为占位注释），完全按计划 Step 1–6 实现：

- `parse(questions_json: &str, categories_json: &str) -> Result<Catalog, ParseError>` — 先反序列化 `CatalogFile { cats, presets }` 与 `Vec<Question>`，再逐题校验，**收集全部错误后一次性返回**（不是遇错即停），最后交给 `Catalog::new` 建索引。
- `health(catalog: &Catalog) -> Vec<String>` — 非阻断自检，报告「已登记但无题目的分类」与「有题目但未登记的分类」，孤儿分类先排序再去重以保证输出稳定。
- `pub enum ParseError { Json(String), Validation(Vec<String>) }`，实现 `Display`。

校验规则（对照 `legacy/js/bank.js:21-49`）：id 非空、id 不重复、cat 已登记、level ∈ 1..=3、`a` 非空白、选择题 answer 为非空索引数组且不越界、选择题至少 2 个选项、单选题恰好 1 个答案、判断题 answer 必须是布尔。

`Answer::Indices(v) if !v.is_empty()` 的 guard 按计划保留：`Answer` 是 untagged enum，`[]` 会解析成 `Indices(vec![])`，无 guard 则「选择题答案为空数组」这类脏数据会漏过。

### 计划外的一处必要改动

`src-rust/catalog.rs` 加了 `#[derive(Debug)]` 到 `pub struct Catalog`。计划给出的测试用 `parse(...).unwrap_err()`，而 `Result::unwrap_err` 要求 `T: Debug`，Task 5 的 `Catalog` 没有 derive。这是 Task 5 与 Task 6 之间的接口缺口，不是校验规则的放宽，所以直接补 derive，未改动任何测试或校验逻辑。改动与 parser 一并提交。

## 测试结果

Step 2（确认失败）：
```
$ cargo test --lib parser
error[E0425]: cannot find function `parse` in this scope   (× 8)
error[E0425]: cannot find function `health` in this scope
```
与计划预期一致。

Step 4（8 个合成测试）：
```
$ cargo test --lib parser
running 8 tests
test parser::tests::rejects_malformed_json ... ok
test parser::tests::rejects_qa_without_reference_answer ... ok
test parser::tests::rejects_duplicate_ids ... ok
test parser::tests::rejects_out_of_range_level ... ok
test parser::tests::rejects_choice_with_out_of_bounds_answer ... ok
test parser::tests::parses_valid_bank ... ok
test parser::tests::rejects_unknown_category ... ok
test parser::tests::health_reports_registered_but_empty_category ... ok

test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 11 filtered out
```

Step 5（加入真实题库测试）：
```
$ cargo test --lib parser
running 9 tests
... (上述 8 项全部 ok)
test parser::tests::real_bank_passes_validation ... ok

test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 11 filtered out
```
`real_bank_passes_validation` 一次通过，未放宽任何规则。476 题 / 19 分类 / `health()` 返回空数组，三项断言全中。

全量：
```
$ cargo test
running 20 tests
test result: ok. 20 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

   Doc-tests embq_core
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```
20 = 已有 11（models 6 + catalog 4 + skeleton 1）+ 新增 9，与预期一致。

## 关注点

**1. 新 parser 比 `legacy/js/bank.js` 少两条规则。** 逐条比对后发现两处 legacy 有、计划实现没有的校验：

- `bank.js:46` — `multi` 类型要求 `answer.length >= 2`（「否则请用 single」）。
- `bank.js:27` — `!q.q` 题干非空。

我按指令「使用计划中的实现原文」没有擅自添加，另外用脚本核对了真实数据：`multi` 且答案数 < 2 的有 **0** 条，题干为空的有 **0** 条，缺 `cat` 的有 **0** 条。所以当前是零影响的规则覆盖面差异，不是校验被放宽导致测试通过。若希望完全对齐 legacy，这两条可以后续补上；建议在 Task 12 或数据校验收口时决定。

另外几条 legacy 规则是被间接覆盖的，不算缺口：未知题型由 serde 反序列化直接失败（返回 `ParseError::Json`）；`!q.cat` 由「分类未登记」命中（空串不在 `known` 集合里）；`answer` 索引为负由 `usize` 反序列化失败拦住。

**2. `parse` 的错误是全量收集的。** `legacy` 的 `validate` 是遇错即返回并丢弃该题，新实现则把全部问题收集进 `Validation(Vec<String>)` 并整体拒绝加载。这比 legacy 更严（legacy 会静默丢弃坏题继续跑），符合「不得更宽松」的要求，也更容易一次定位所有数据问题。副作用是脏数据下错误串可能很长，UI 侧展示时可能需要截断。

## 提交

- `c47b45c` — `feat(core): add parser with validation and health check`（`src-rust/parser.rs` 新增实现 + 9 个测试，`src-rust/catalog.rs` 加 `#[derive(Debug)]`）

基线：`03c50bf`（`feat(core): add Catalog with cat index and bank fingerprint`）。提交后工作区干净。
