# Task 16 报告：启动流程与 Vite 接入

Commit: `4ff3366` — `feat(ui): wire boot sequence, vite entry and view tabs`
Worktree base: `78a37bb`（`refactor(md): port markdown renderer to TS with behaviour locked by tests`），进入时 worktree 落后于 main，已 `git merge --ff-only main` 追平，确认 `src/core/markdown.ts` 与 `src/core/store.ts` 均存在。

## 实现内容

按计划 Step 1–7 逐字落地：

- `vite.config.ts`：`base: './'`（同时适配 GitHub Pages 子路径与 Tauri 的 `file://`），`build.target: 'es2022'`、`outDir: 'dist'`、`emptyOutDir: true`。
- `src/ui/toast.ts`：`toast(msg)` 设 `textContent`、`hidden = false`、清掉上一个 timer、2200ms 后收起。没有加 `is-on` class（现有 CSS 无此态），与 `legacy/js/app.js:134` 行为一致。
- `src/main.ts`：导出 `interface Filter`、`interface AppCtx`、`defaultFilter()`、`newSeed()`、`switchView()`。启动链路：`init()` → 并行 `fetch(data/questions.json)` / `fetch(data/categories.json)` / `loadState()` → `new QuizEngine(...)`（`try/catch` 失败时把错误写进 `#cardWrap`，不白屏）→ `engine.restore_deck()` 为 false 才 `build(defaultFilter())` → 组 `ctx` → `installFlushHooks` → `mount(ctx)`。`mountViewTabs()` 在 `#viewTabs` 上做事件委托，`switchView` 切 `.tab.is-active` 与 `#view-practice` / `#view-stats` 的 `.is-active`。`boot().catch` 里 console.error + toast。
- `index.html`：只替换脚本块，27 个 `data/*.js` + `js/bank.js` + `store/scheduler/quiz/stats/app.js` 全删（Task 2 已把文件移到 `legacy/`，这些标签当前都是 404），换成 `<script type="module" src="/src/main.ts">` 加保留的 Service Worker 注册。`css/style.css` 的 `<link>`、`manifest.json` 引用、DOM 结构与 class 名一字未动。
- UI 占位模块（Task 17–20 填实现）：`card.ts`（`mountCard` / `renderCard`）、`filter.ts`（`mountFilter` / `refreshCount`）、`stats.ts`（`renderStats`）、`settings.ts`（`mountSettings` / `renderHealth`）、`keys.ts`（`mountKeys`）、`theme.ts`（`applyTheme` / `mountTheme`），签名统一用 `_ctx: AppCtx`。

## index.html 改动范围

```
$ git diff --stat index.html
 index.html | 51 +++++----------------------------------------------
 1 file changed, 5 insertions(+), 46 deletions(-)
```

完整 diff 仅覆盖 `<div class="toast">` 之后的 script 块（原 162–198 行的 script 标签 + 原 SW 注册块），无其他行变动。

## 验证结果

### `npx tsc --noEmit`
干净，无输出，exit 0。

### `npm test`（`vitest run`）
```
 ✓ src/core/markdown.test.ts (8 tests) 8ms
 ✓ src/core/store.test.ts (9 tests) 18ms

 Test Files  2 passed (2)
      Tests  17 passed (17)
   Duration  2.66s
```
17 个测试全过，与预期一致。

### `npm run wasm`
成功，产出 `pkg/embq_core.js`（16,948 B）、`pkg/embq_core.d.ts`（4,258 B）、`pkg/embq_core_bg.wasm`（390,196 B）、`pkg/embq_core_bg.wasm.d.ts`。

### `npm run build`
**首次 `npm run wasm` 成功，但 `npm run build` 内部第二次跑 wasm-pack 时失败**：
```
[INFO]: ⬇️  Installing wasm-bindgen...
Error: failed to download from https://github.com/WebAssembly/binaryen/releases/download/version_117/binaryen-version_117-x86_64-windows.tar.gz
To disable `wasm-opt`, add `wasm-opt = false` to your package metadata in your `Cargo.toml`.
```
这是 wasm-opt（binaryen）下载的网络问题，不是代码问题。`pkg/` 已由上一步构建好，于是直接跑 `npx vite build`：
```
vite v5.4.21 building for production...
✓ 13 modules transformed.
dist/assets/manifest-StzLgqkl.json        0.76 kB │ gzip: 0.30 kB
dist/index.html                           6.16 kB │ gzip: 2.25 kB
dist/assets/embq_core_bg-DnhDnsOf.wasm  390.20 kB
dist/assets/index-_iDjFm1C.css           14.32 kB │ gzip: 3.51 kB
dist/assets/index-DwGZA8bM.js            10.27 kB │ gzip: 4.00 kB
✓ built in 170ms
```
构建成功，`/src/main.ts` 被正确打包，wasm 和 CSS 都进了 `dist/assets/`。验证后已 `rm -rf dist`（`dist/` 本就在 `.gitignore` 里）。

### 题库数量
`node -e` 读 `data/questions.json`：**476** 题，与约束一致。

## 未能非交互验证的部分

- **`npx vite preview` + 浏览器 DevTools console**：需要交互式浏览器，没有验证。计划 Step 6 里「打开 http://localhost:4173，console 无报错」这一条我没有实际执行，只能确认构建产物正确生成、TS 类型无误。运行时的 wasm `init()` 是否顺利、`restore_deck()` 的实际行为都未在浏览器里跑过。
- **题库损坏时的降级路径**：`try/catch` 写了，但没在浏览器里注入坏数据实测。
- 题库数量是通过 node 直读文件确认 476，不是在浏览器 console 里 fetch 确认的。

## 关注点

1. **`npm run build` 目前在这台机器上不可用**，因为 `wasm-pack` 每次都要下 binaryen 而网络拿不到。变通办法是先 `npm run wasm`（缓存已 ready 的情况下能过）再单独 `npx vite build`。如果这在 CI 里也会出现，可以考虑在 `Cargo.toml` 里加 `[package.metadata.wasm-pack.profile.release] wasm-opt = false`，但那超出了 Task 16 的范围，没有动。
2. **`dist/` 里没有 `data/`、`css/`、`icons/`、`sw.js`、`manifest.json` 这些静态资源**，所以现在的产物直接 preview 时 `fetch('data/questions.json')` 会 404。这是预期的：计划把「拷静态资源进 dist」的 vite 插件放在后面的 PWA 任务（计划文件 4469 行 Step 2），本任务的 `vite.config.ts` 按 Step 1 的版本逐字写。开发模式 `vite dev` 下 `data/` 从项目根直接可访问，不受影响。
3. `index.html` 末尾原本就有重复的 `</body>` 标签（两个），我没有动它，因为约束要求 DOM 不变。
4. `npm install` 报了 5 个漏洞（3 moderate / 1 high / 1 critical），都在 devDependencies 传递依赖里，未处理。
5. 生成了 `package-lock.json`（之前仓库里没有），未提交 —— Step 7 的 `git add` 清单里没有它。
