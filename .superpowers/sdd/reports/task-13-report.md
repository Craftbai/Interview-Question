# Task 13 报告：Store（IndexedDB + localStorage 兜底）

## 基线确认

初始 HEAD 为 `68014ac`（`src-rust/` 不存在）。按指令执行 `git merge --ff-only 82333ca`，快进成功，HEAD 现为 `82333ca feat(core): expose QuizEngine over wasm-bindgen`。已确认 `src-rust/lib.rs:12` 含 `pub struct QuizEngine {`。

## 实现内容

纯 TypeScript，无 WASM 依赖。严格按计划 Step 1–8 执行，`store.ts` 与 `store.test.ts` 使用计划中的原文实现，未改动任何一行逻辑或断言。

**Step 1 — 测试环境**
- `vitest.config.ts`：替换为 jsdom + `setupFiles: ['./src/test-setup.ts']`，按任务说明保留了 `passWithNoTests: true`（与新配置不冲突）。
- `src/test-setup.ts`：内容恰为 `import 'fake-indexeddb/auto';`。
- `package.json`：devDependencies 追加 `"jsdom": "^25.0.0"`，执行 `npm install`（新增 104 个包）。

**Step 2–3 — 先写测试并确认失败**
`src/core/store.test.ts` 按计划原文写入 9 个用例，运行后如计划预期报 `Failed to resolve import "./store"`。

**Step 4–6 — 实现 `src/core/store.ts`**
导出 6 个接口：`loadState`、`saveState`、`scheduleSave`（300ms debounce）、`flushNow`、`resetState`、`installFlushHooks`。

要点与计划一致：
- 常量：DB `embq` / version `2` / object store `state` / key `"current"` / localStorage `embq.v2` 与 `embq.v1`。
- 读顺序：IndexedDB → `localStorage["embq.v2"]` 快照 → `localStorage["embq.v1"]` 旧存档（`upgradeV1` 升级）→ `null`。兜底命中时回写 IndexedDB，下次读取走快路径。
- `embq.v1` 永不删除，保留一个版本周期作为回退，测试对此有断言。
- 所有 IndexedDB 失败路径（`onerror`/`onblocked`/`onabort`/`catch`）一律 `resolve` 而非 `reject`；localStorage 三个 helper 全部 try/catch 包裹，应对配额满与被禁用。
- `installFlushHooks` 先同步写 `localStorage` 快照，再启动异步 IndexedDB 写入。页面关闭时 IndexedDB 事务可能来不及提交，同步写入是唯一保证落地的路径。钩子挂在 `visibilitychange`（仅 hidden）、`pagehide`、`beforeunload` 上。

## 测试结果

```
$ npm test -- store
 ✓ src/core/store.test.ts (9 tests) 15ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

```
$ npm test
 ✓ src/core/store.test.ts (9 tests) 14ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

全仓库测试总数 **9 passed / 0 failed**（当前仅 store 一个 TS 测试文件；Rust 侧 75 个测试由 `cargo test` 运行，不在 vitest 范围内）。

类型检查：`npx tsc --noEmit` 退出码 0，在 `strict` + `noUncheckedIndexedAccess` 下无报错。

## 关注点

**测试数量与计划描述差 1（非缺陷）。** 计划 Step 7 的预期写的是「10 个测试全部 PASS」，实际为 9 个。核对后确认这是计划正文的笔误，不是我漏写：计划 Step 2 代码块（正文 2745–2833 行）本身只包含 9 个 `it()`，我的测试文件同样是 9 个，逐条一致。计划的测试代码与实现代码之间没有实质冲突，无需改动任何断言即全部通过。

**`package-lock.json` 未纳入提交。** `npm install` 生成了该文件，但计划 Step 8 的 `git add` 清单未列出它，故保持未跟踪状态，未擅自扩大提交范围。后续任务如需锁定依赖版本，可单独提交。

## 提交

| Hash | 说明 |
| --- | --- |
| `82333ca` | 基线（快进到此，非本任务产出） |
| `0e662e0` | `fix(store): IndexedDB primary with localStorage fallback and forced flush` |

提交包含 5 个文件：`src/core/store.ts`、`src/core/store.test.ts`、`src/test-setup.ts`、`vitest.config.ts`、`package.json`（261 insertions, 1 deletion）。
