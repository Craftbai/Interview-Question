# Task 3 报告：数据模型（models.rs）

## 实现内容

按计划 Task 3 的 Step 1–5 逐步执行（TDD：先写失败测试 → 确认失败 → 写实现 → 确认通过 → 提交）。

在 `src-rust/models.rs` 中新增 4 个类型，定义**逐字照抄计划**，未作任何改动：

| 类型 | 说明 |
|------|------|
| `QType` | `Single / Multi / Bool / Qa`，`#[serde(rename_all = "lowercase")]` |
| `Answer` | `#[serde(untagged)]`，变体顺序 `Indices` → `Bool` → `None` |
| `Question` | 11 个字段，字段名与现有题库完全一致 |
| `CategoryMeta` | `id / name / desc` |

关键实现点（均按计划要求）：

- `Answer::default()` 返回 `Answer::None`，配合 `#[serde(default)]` 让简答题可以不带 `answer` 字段。
- `qtype` 字段加 `#[serde(rename = "type")]`，因为 `type` 是 Rust 关键字，但落盘必须写 `type` 以兼容现有题库。
- `level` 用 `#[serde(default = "one")]`，`one()` 辅助函数返回 `1`。
- `Answer` 的 untagged 变体顺序有语义：`None` 若放最前会吞掉所有值，实测已验证顺序正确（见下）。

Global Constraints 对照：题目总数 476 已用真实数据验证；Question 字段名 `id / cat / q / a / type / options / answer / level / tags / resume / followup` 全部一致；Grade 取值属于 Task 4 范围，本任务未涉及。

## 测试结果

### `cargo test --lib models`（Step 2，确认失败）

```
error[E0425]: cannot find type `Question` in this scope
error[E0425]: cannot find type `Question` in this scope
error[E0425]: cannot find type `Question` in this scope
error[E0433]: failed to resolve: use of undeclared type `QType`
error[E0433]: failed to resolve: use of undeclared type `Answer`
error[E0433]: failed to resolve: use of undeclared type `Answer`
error[E0433]: failed to resolve: use of undeclared type `Answer`
error: could not compile `embq-core` (lib test) due to 7 previous errors
```

与计划预期一致（`cannot find type Question in this scope`）。

### `cargo test --lib models`（Step 4，确认通过）

```
running 3 tests
test models::tests::question_accepts_qa_without_answer ... ok
test models::tests::question_roundtrips_choice ... ok
test models::tests::question_accepts_bool_answer ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out
```

3 个测试全部 PASS，符合预期。

### `cargo test`（全 crate）

```
running 4 tests
test models::tests::question_accepts_qa_without_answer ... ok
test models::tests::question_accepts_bool_answer ... ok
test models::tests::question_roundtrips_choice ... ok
test tests::skeleton_compiles ... ok

test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

   Doc-tests embq_core
test result: ok. 0 passed; 0 failed
```

整个 crate 编译通过，Task 1 的 `skeleton_compiles` 未被破坏。编译无 warning。

### 额外验证：真实 476 题（临时测试，跑完已删）

计划把「真实题库过校验」放在 Task 6（parser），但为确认 models 的 serde 配置对真实数据成立，我临时写了一个集成测试跑了一遍，通过后删除，**未提交**：

```
题型分布 single=109 multi=8 bool=7 qa=352
test real_bank_deserializes ... ok
```

验证内容：

- 476 题全部能反序列化成 `Vec<Question>`，数量正确。
- untagged 变体顺序正确：109 道 single + 8 道 multi 全落到 `Answer::Indices`，7 道 bool 全落到 `Answer::Bool`，352 道 qa 全落到 `Answer::None`。没有一道被错误变体吞掉。
- 所有 `level >= 1`，缺省值 `one()` 生效，无 0 值。
- 所有选择题的 `answer` 索引都在 `options` 范围内。
- 序列化往返写出 `"type"` 而非 `"qtype"`，rename 双向生效。
- `data/categories.json` 的 `cats` 能反序列化成 19 个 `CategoryMeta`。

## 需要说明的情况

**1. 工作树基线错误，已修复（重要）**

我的工作树最初创建在 `68014ac`，比 `main`（`9a61b97`）落后 6 个提交，因此完全没有 Task 1 的脚手架——没有 `Cargo.toml`、没有 `src-rust/`、没有 `data/questions.json`。

这一度产生了误导性结果：我在工作树里跑 `cargo test`，cargo 沿目录树向上查找 manifest，**静默编译了共享检出（shared checkout）而不是工作树**，所以测试报告 "0 tests" 且完全看不到我的代码。确认方式是 `cargo test -- --list` 只列出 `tests::skeleton_compiles`。

修复：`git merge --ff-only main` 把工作树快进到 `9a61b97`（已先用 `git merge-base --is-ancestor` 确认是纯快进，无分叉风险，非破坏性操作）。此后所有 cargo 命令都显式带 `--manifest-path ./Cargo.toml`，输出的 `Compiling embq-core (...worktrees/agent-...)` 路径可确认编译目标正确。

后续任务如果在新工作树里执行，值得先确认基线是否为 `main`。

**2. `Cargo.lock` 未提交**

我的构建生成了 `Cargo.lock`（当前未被 git 跟踪）。计划 Step 5 的 `git add` 只包含 `src-rust/models.rs`，所以我没有提交它。对于 `crate-type = ["cdylib", "rlib"]` 的库，不提交 lock 文件是常见做法，但如果后续希望锁定依赖版本以保证构建可复现，可以考虑提交——这是个待定决策，留给相关任务。

**3. 依赖版本提示（非阻塞）**

cargo 提示 `getrandom v0.2.17`（有 v0.4.3）和 `rand v0.8.7`（有 v0.10.2）可升级。这两个版本是 Task 1 的 `Cargo.toml` 按计划固定的，Task 8 的 `StdRng::seed_from_u64` 与 rand 0.8 API 对应，故未改动。

**4. 范围说明**

计划 Task 3 的 Interfaces 一节列出了 `Progress / UserState / Settings / Deck / Filter / Scope / Mode / Grade / Verdict`，但 Task 3 的 Step 3 只给出 `QType / Answer / Question / CategoryMeta` 四个定义，其余类型的定义与测试都写在 Task 4 的 Step 3–4。我严格按步骤实现，只做了这四个类型，未越界实现 Task 4 的内容。因此当前 `models.rs` 的测试数是 3，Task 4 完成后会变成计划预期的 6。

## 提交

| Hash | 说明 |
|------|------|
| `f463fc2` | `feat(core): add Question/Answer/QType models with serde compat` |

提交消息与计划 Step 5 完全一致。分支：`worktree-agent-a882c9c7f3fc97286`（基于 `main` @ `9a61b97`）。

提交内容仅 `src-rust/models.rs`（81 行新增，1 行删除——移除占位注释），与计划 `git add` 范围一致。
