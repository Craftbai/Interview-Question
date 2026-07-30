# Task 1 Report: 工具链与项目骨架

## 摘要

完成了嵌入式面试题库 v2 的工具链安装与项目骨架搭建。包括 Rust 编译环境、wasm-pack、Cargo crate、TypeScript 配置，以及配套的项目配置文件。

## 实现的步骤

| 步骤 | 状态 | 说明 |
|------|------|------|
| Step 1: wasm32 target + wasm-pack | 完成 | `rustup target add wasm32-unknown-unknown` + `cargo install wasm-pack --locked` (v0.15.0) |
| Step 2: Cargo.toml | 完成 | 含 `cdylib` + `rlib` crate-type，`lto=true` + `opt-level=z` 优化 |
| Step 3: src-rust/lib.rs + 5 个模块文件 | 完成 | lib.rs 包含模块声明 + skeleton 测试；5 个空模块各一行 `// 占位，见后续 Task` |
| Step 4: package.json | 完成 | scripts: wasm/dev/build/test/migrate，devDeps: typescript/vite/vitest/fake-indexeddb |
| Step 5: tsconfig.json | 完成 | ES2022 + bundler moduleResolution + strict + noUncheckedIndexedAccess |
| Step 6: .gitignore | 完成 | 追加 pkg/target/node_modules/dist/src-tauri/target |
| Step 7: 验证骨架 | 完成 | 见下方测试结果 |
| Step 8: Commit | 完成 | `8106fb5` |

## 测试结果

```
$ wasm-pack --version
wasm-pack 0.15.0

$ rustup target list --installed
wasm32-unknown-unknown
x86_64-pc-windows-msvc

$ cargo test
running 1 test
test tests::skeleton_compiles ... ok
test result: ok. 1 passed; 0 failed; 0 ignored

$ npm install
added 46 packages, and audited 47 packages in 1m

$ npm test
vitest run
No test files found, exiting with code 0
```

## 额外处理

- 创建了 `vitest.config.ts`，配置 `passWithNoTests: true`。因为此时还没有测试文件，Vitest 默认在无测试文件时退出码 1，不符合 Task 1 的预期。

## 注意事项

- `.gitignore` 不存在于仓库中，因此我创建了一个全新的 `.gitignore`（而非追加到已有文件）。后续如有其他 `.gitignore` 条目需要合并，需注意此点。
- `wasm-pack build` 尚未验证（需在 Task 12 做），但 `Cargo.toml` 的 `[profile.release]` 已按 spec 配置完毕。

## Commit 信息

- SHA: `8106fb5`
- Message: `chore: scaffold rust crate and ts toolchain for v2`
