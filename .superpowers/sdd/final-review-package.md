# 嵌入式面试题库 v2 重构 · 全分支审查包

基线 `5c32be0` → HEAD。仅含新增/修改的源码，已排除：plan 文档、pkg/ 构建产物、legacy/ 归档、题库 JSON、lockfile。

## Commits
```
525165d fix: restore wasm/test/migrate scripts dropped in merge conflict
f199649 docs: update README for v2 stack and relax question count assertion
ee58c7a feat(desktop): add Tauri windows packaging
7ca7bbf fix(pwa): update service worker cache manifest for v2 build output
2cf93c4 fix(pwa): update service worker cache manifest for v2 build output
6bf785e chore: update wasm types
83032c9 feat(ui): settings panel, theme cycling and keyboard shortcuts
14208cc feat(ui): stats view with KPI, category bars and heatmap
dd01837 feat(ui): filter panel with live count and mode selection
e604015 feat(ui): render question card with consolidated CardState
abfbfc8 fix: remove duplicate closing body tag
b1ede7f feat(ui): wire boot sequence, vite entry and view tabs
78a37bb refactor(md): port markdown renderer to TS with behaviour locked by tests
1f68719 fix(core): align Scope serialization with existing data-scope values
9823d13 chore: exclude agent worktrees from vitest discovery
01c4215 fix(store): IndexedDB primary with localStorage fallback and forced flush
82333ca feat(core): expose QuizEngine over wasm-bindgen
78418e1 fix(core): avoid u32 underflow in wasm day_key_offset
c4dd8c8 feat(core): add stats module with deterministic ranking
f11361b feat(core): add judge/record/toggle_fav preserving v1 grade semantics
e55c38b fix(core): persist deck so sessions resume at the same question
29d969b fix(core): make all three sort modes total-ordered and reproducible
2f40abf feat(core): add scheduler filtering with AND/OR semantics
557c082 fix(core): enforce multi-answer count and non-empty stem like legacy validator
9f9ce85 feat(core): add parser with validation and health check
03c50bf feat(core): add Catalog with cat index and bank fingerprint
af80f19 chore: pin Cargo.lock
fdbbed0 feat(core): add UserState/Filter/Deck with v1 archive compat
2f226e0 feat(core): add Question/Answer/QType models with serde compat
9a61b97 feat: migrate 476 questions to flat JSON, archive legacy js
7ddf8c2 chore: scaffold rust crate and ts toolchain for v2
a547850 docs: v2 implementation plan (23 tasks, 147 steps)
```

## Stat
```
 Cargo.toml                  |  27 ++
 README.md                   | 119 ++++---
 index.html                  |  52 +---
 package.json                |  23 ++
 scripts/copy-static.mjs     |  11 +
 scripts/copy-static.ps1     |  10 +
 scripts/migrate.mjs         |  85 +++++
 src-rust/catalog.rs         | 109 +++++++
 src-rust/lib.rs             | 363 ++++++++++++++++++++++
 src-rust/models.rs          | 256 ++++++++++++++++
 src-rust/parser.rs          | 210 +++++++++++++
 src-rust/scheduler.rs       | 733 ++++++++++++++++++++++++++++++++++++++++++++
 src-rust/stats.rs           | 297 ++++++++++++++++++
 src-tauri/Cargo.toml        |  10 +
 src-tauri/build.rs          |   3 +
 src-tauri/icons/128x128.png | Bin 0 -> 1976 bytes
 src-tauri/icons/256x256.png | Bin 0 -> 3815 bytes
 src-tauri/icons/32x32.png   | Bin 0 -> 568 bytes
 src-tauri/icons/512x512.png | Bin 0 -> 5157 bytes
 src-tauri/icons/icon.ico    | Bin 0 -> 9247 bytes
 src-tauri/icons/icon.png    | Bin 0 -> 5157 bytes
 src-tauri/src/main.rs       |   8 +
 src-tauri/tauri.conf.json   |  37 +++
 src/core/markdown.test.ts   |  44 +++
 src/core/markdown.ts        | 122 ++++++++
 src/core/store.test.ts      |  86 ++++++
 src/core/store.ts           | 170 ++++++++++
 src/main.ts                 | 114 +++++++
 src/test-setup.ts           |   1 +
 src/ui/card.ts              | 405 ++++++++++++++++++++++++
 src/ui/filter.ts            | 135 ++++++++
 src/ui/keys.ts              |  39 +++
 src/ui/settings.ts          | 146 +++++++++
 src/ui/stats.ts             |  75 +++++
 src/ui/theme.ts             |  27 ++
 src/ui/toast.ts             |  15 +
 sw.js                       |  79 ++---
 tsconfig.json               |  12 +
 vite.config.ts              |   6 +
 vitest.config.ts            |  11 +
 40 files changed, 3702 insertions(+), 138 deletions(-)
```

## Full diff
```diff
diff --git a/Cargo.toml b/Cargo.toml
new file mode 100644
index 0000000..ee930f1
--- /dev/null
+++ b/Cargo.toml
@@ -0,0 +1,27 @@
+[package]
+name = "embq-core"
+version = "2.0.0"
+edition = "2021"
+
+[lib]
+path = "src-rust/lib.rs"
+crate-type = ["cdylib", "rlib"]
+
+[dependencies]
+wasm-bindgen = "0.2"
+serde = { version = "1.0", features = ["derive"] }
+serde_json = "1.0"
+serde-wasm-bindgen = "0.6"
+rand = { version = "0.8", default-features = false, features = ["std", "std_rng", "small_rng"] }
+getrandom = { version = "0.2", features = ["js"] }
+js-sys = "0.3"
+
+[profile.release]
+lto = true
+opt-level = "z"
+
+# src-tauri 是独立 crate：它编译到本机 target，embq-core 编译到 wasm32。
+# 放进同一工作区会让 cargo test 连带编译 Tauri 依赖，既慢又容易冲突。
+[workspace]
+members = []
+exclude = ["src-tauri"]
diff --git a/README.md b/README.md
index 9c66ebb..06f1837 100644
--- a/README.md
+++ b/README.md
@@ -1,13 +1,18 @@
 # 嵌入式面试题库 · 刷题练习器
 
-**双击 `index.html` 即可使用**，不需要装任何东西、不需要起服务器。进度存在浏览器本地。
+两种用法，进度都存在本地：
+
+- **网页版**：<https://craftbai.github.io/Interview-Question/> —— 打开就能刷，装成 PWA 后可离线
+- **桌面版**：Windows exe，`cargo tauri build` 产出安装包
+
+核心逻辑用 Rust 写、编译成 WASM，界面是 TypeScript。两端共用同一套 `src/`。
 
 ---
 
 ## 题库现状
 
 **476 题，19 个分类**
 
 | 分类 | 题量 | 分类 | 题量 |
 |---|---|---|---|
 | C 语言核心 | 35 | 电路与硬件基础 | 20 |
@@ -42,70 +47,108 @@
 |---|---|
 | `1`–`6` | 选择选项 |
 | `空格` | 提交 / 揭晓答案 / 下一题 |
 | `1` `2` `3` | 简答题自评（会了 / 模糊 / 不会） |
 | `←` `→` | 上一题 / 下一题 |
 | `F` | 收藏 |
 | `/` | 搜索 |
 | `Esc` | 关闭面板 |
 
 ### 进度管理
-进度存在浏览器 localStorage 里。**换电脑或清缓存前先在「设置」里导出进度**。
+进度主存在 IndexedDB，localStorage 留一份快照兜底。切后台、关页面时都会强制落盘，所以关掉再打开会**停在原来那一题**，卷的顺序也不变。
+
+**换电脑或清缓存前先在「设置」里导出进度**。「导出今日错题 (MD)」会生成 Markdown 文件，可直接贴进笔记复盘。
+
+---
+
+## 开发
+
+```bash
+npm install
+npm run wasm      # 编译 Rust → WASM，产出 pkg/
+npm run dev       # 起开发服务器
+```
+
+改了 `src-rust/` 之后要重新跑 `npm run wasm`，TypeScript 那侧的类型定义是从这里生成的。
+
+```bash
+cargo test        # Rust 单元测试，78 个
+npm test          # TypeScript 测试
+npx tsc --noEmit  # 类型检查
+```
+
+## 构建
 
-「导出今日错题 (MD)」会生成 Markdown 文件，可直接贴进笔记复盘。
+```bash
+npm run build       # 网页版 → dist/
+npm run deploy      # 部署到 GitHub Pages
+cargo tauri build   # Windows 安装包 → src-tauri/target/release/bundle/nsis/
+```
 
 ---
 
 ## 加题
 
-编辑 `data/` 下对应分类的 `.js` 文件，在数组里追加：
+直接编辑 `data/questions.json`，在数组末尾追加：
 
-```js
+```json
 {
-  id: 'c-036',                       // 分类前缀 + 序号，必须唯一且此后不要改
-  cat: 'c-lang',                     // 分类 id，见 data/_meta.js
-  type: 'qa',                        // single | multi | bool | qa
-  level: 2,                          // 1 基础 / 2 进阶 / 3 深入
-  tags: ['指针'],
-  q: '题干，可以带 ```c 代码块 ```',
-  options: ['A', 'B', 'C'],          // 仅选择题
-  answer: [0],                       // 选择题填下标数组；判断题填 true/false
-  a: '参考答案（客观题这里放解析）',
-  followup: ['可能的追问…'],           // 可选
-  resume: true                       // 可选：标记为「简历高危」
+  "id": "c-036",
+  "cat": "c-lang",
+  "type": "qa",
+  "level": 2,
+  "tags": ["指针"],
+  "q": "题干，支持 Markdown 和代码块",
+  "options": [],
+  "answer": [],
+  "a": "参考答案（客观题这里放解析）",
+  "followup": ["可能的追问…"],
+  "resume": true
 }
 ```
 
-**两个注意事项**：
+字段含义：`type` 是 `single | multi | bool | qa`；`level` 是 1 基础 / 2 进阶 / 3 深入；选择题的 `answer` 填下标数组，判断题填 `true`/`false`，简答题留空；`resume: true` 标记「简历高危」。
+
+**`id` 一旦用过就不要改**——进度是靠 id 索引的，改了等于丢掉那道题的记录。只追加，不动已有的。
+
+加完跑一遍校验：
 
-1. **`id` 一旦用过就不要改**——刷题进度是靠 id 索引的，改了等于丢失该题的记录。只追加，不修改已有 id。
-2. **字符串里的单引号要转义**（`\'`）或改用「」。中文引号直接写会截断字符串导致整个文件加载失败。
+```bash
+cargo test --lib parser
+```
 
-加完刷新页面即可。**打开浏览器控制台（F12）能看到题库自检结果**——id 重复、字段缺失、选项下标越界都会报出具体题号。「设置」面板底部也会显示自检状态。
+id 重复、分类没登记、选项下标越界都会报出具体题号。「设置」面板底部也有自检状态。
 
 ### 新增分类
-1. 在 `data/_meta.js` 里登记
-2. 新建 `data/你的分类.js`
-3. 在 `index.html` 的题库脚本区加一行 `<script src="data/你的分类.js"></script>`
+在 `data/categories.json` 的 `cats` 数组里登记 `{ id, name, desc }` 即可，不需要动 `index.html`。
 
 ---
 
 ## 技术说明
 
-纯静态页面，零依赖、零构建、可离线。
+```
+├── index.html              页面骨架，单个 module 入口
+├── css/style.css           全部样式，深/浅色双主题（重构中未改动一字节）
+├── src-rust/               Rust 核心，纯函数、零 IO
+│   ├── lib.rs              QuizEngine：wasm-bindgen 边界
+│   ├── models.rs           数据结构 + 旧存档兼容
+│   ├── catalog.rs          扁平数组 + 分类索引 + 题库指纹
+│   ├── parser.rs           JSON 解析与校验
+│   ├── scheduler.rs        筛选、三种排序、导航、判卷
+│   └── stats.rs            掌握率、薄弱项、热力图
+├── src/                    TypeScript
+│   ├── main.ts             启动流程
+│   ├── core/store.ts       IndexedDB + localStorage 兜底
+│   ├── core/markdown.ts    Markdown 渲染
+│   └── ui/                 题卡、筛选、统计、设置、快捷键、主题
+├── data/
+│   ├── questions.json      476 题，扁平数组
+│   └── categories.json     19 个分类
+├── src-tauri/              桌面端打包配置
+└── legacy/                 v1 归档，保留一个版本周期
+```
 
-**题库用普通 `<script>` 标签加载，没有用 `fetch` 或 ES module**——因为双击打开时是 `file://` 协议，这两者都会被浏览器 CORS 策略拦死。改动时请保持这个约定。
+**为什么这么分**：Rust 侧不碰任何 IO，只负责把 `UserState` 序列化成字符串，读写全交给 TypeScript。这样调度算法能被完整单元测试覆盖，也是 78 个 Rust 测试跑得起来的前提。
 
-同理，页面**不引用任何 CDN 资源**（无 React / Tailwind / 图表库），全部是原生 DOM + 手写 CSS。
+Markdown 渲染留在 TypeScript——它输出 HTML 字符串直接喂 `innerHTML`，本质是 UI 层的事，搬进 Rust 只是多一次跨边界拷贝。
 
-```
-├── index.html          页面骨架，按顺序引入所有脚本
-├── css/style.css       全部样式，深/浅色双主题 + 响应式
-├── js/
-│   ├── bank.js         题库注册器 + 自检（id 重复、字段缺失、答案越界）
-│   ├── store.js        localStorage 持久化
-│   ├── scheduler.js    Leitner 三盒复习算法
-│   ├── quiz.js         筛选 / 组卷 / 判分
-│   ├── stats.js        掌握率、薄弱项、打卡统计
-│   └── app.js          渲染与事件绑定
-└── data/               题库，一个分类一个文件
-```
+页面**不引用任何 CDN 资源**（无 React / Tailwind / 图表库），全部原生 DOM + 手写 CSS。
diff --git a/index.html b/index.html
index 9f03543..bae86a2 100644
--- a/index.html
+++ b/index.html
@@ -153,62 +153,20 @@
 </main>
 
 <!-- ============ 统计视图 ============ -->
 <main class="view" id="view-stats">
   <div class="stats-wrap" id="statsWrap"></div>
 </main>
 
 <div class="toast" id="toast" hidden></div>
 
 <!-- 引擎 -->
-<script src="js/bank.js"></script>
-
-<!-- 题库（普通 script 加载，file:// 下可用；勿改成 fetch/ESM） -->
-<script src="data/meta.js"></script>
-<script src="data/c-lang.js"></script>
-<script src="data/coding.js"></script>
-<script src="data/coding-2.js"></script>
-<script src="data/cpp.js"></script>
-<script src="data/cpp-2.js"></script>
-<script src="data/ds-algo.js"></script>
-<script src="data/ds-algo-2.js"></script>
-<script src="data/control.js"></script>
-<script src="data/os.js"></script>
-<script src="data/rtos.js"></script>
-<script src="data/linux-app.js"></script>
-<script src="data/linux-drv.js"></script>
-<script src="data/linux-drv-2.js"></script>
-<script src="data/mcu-hw.js"></script>
-<script src="data/hardware.js"></script>
-<script src="data/bus.js"></script>
-<script src="data/network.js"></script>
-<script src="data/build.js"></script>
-<script src="data/build-2.js"></script>
-<script src="data/tools.js"></script>
-<script src="data/debug.js"></script>
-<script src="data/debug-2.js"></script>
-<script src="data/security.js"></script>
-<script src="data/security-2.js"></script>
-<script src="data/automotive.js"></script>
-<script src="data/behavioral.js"></script>
-
-<script src="js/store.js"></script>
-<script src="js/scheduler.js"></script>
-<script src="js/quiz.js"></script>
-<script src="js/stats.js"></script>
-<script src="js/app.js"></script>
-
-<!-- PWA: 注册 Service Worker -->
+<script type="module" src="/src/main.ts"></script>
 <script>
-if ('serviceWorker' in navigator) {
-  window.addEventListener('load', function() {
-    navigator.serviceWorker.register('./sw.js').then(function(reg) {
-      console.log('SW registered:', reg.scope);
-    }).catch(function(err) {
-      console.warn('SW registration failed:', err);
+  if ('serviceWorker' in navigator) {
+    window.addEventListener('load', function () {
+      navigator.serviceWorker.register('sw.js').catch(function () {});
     });
-  });
-}
+  }
 </script>
 </body>
-</body>
 </html>
diff --git a/package.json b/package.json
new file mode 100644
index 0000000..f2694a2
--- /dev/null
+++ b/package.json
@@ -0,0 +1,23 @@
+{
+  "name": "embq",
+  "version": "2.0.0",
+  "private": true,
+  "type": "module",
+  "scripts": {
+    "wasm": "wasm-pack build --target web --out-dir pkg",
+    "dev": "vite",
+    "build": "vite build && node scripts/copy-static.mjs",
+    "preview": "vite preview",
+    "test": "vitest run",
+    "migrate": "node scripts/migrate.mjs",
+    "deploy": "npm run build && gh-pages -d dist"
+  },
+  "devDependencies": {
+    "fake-indexeddb": "^6.0.0",
+    "gh-pages": "^6.2.0",
+    "jsdom": "^25.0.0",
+    "typescript": "^5.6.0",
+    "vite": "^5.4.0",
+    "vitest": "^2.1.0"
+  }
+}
diff --git a/scripts/copy-static.mjs b/scripts/copy-static.mjs
new file mode 100644
index 0000000..5f91727
--- /dev/null
+++ b/scripts/copy-static.mjs
@@ -0,0 +1,11 @@
+// Post-build: copy static assets into dist/
+import { copyFileSync, cpSync, existsSync } from 'fs';
+
+for (const dir of ['data', 'icons', 'css']) {
+  if (existsSync(dir)) cpSync(dir, `dist/${dir}`, { recursive: true });
+}
+for (const f of ['sw.js', 'manifest.json']) {
+  if (existsSync(f)) copyFileSync(f, `dist/${f}`);
+}
+
+console.log('Static assets copied to dist/');
diff --git a/scripts/copy-static.ps1 b/scripts/copy-static.ps1
new file mode 100644
index 0000000..fe366f2
--- /dev/null
+++ b/scripts/copy-static.ps1
@@ -0,0 +1,10 @@
+# Post-build: copy static assets into dist/
+$dirs = @('data', 'icons', 'css')
+foreach ($dir in $dirs) {
+    if (Test-Path $dir) { Copy-Item -Path $dir -Destination "dist\$dir" -Recurse -Force }
+}
+$files = @('sw.js', 'manifest.json')
+foreach ($f in $files) {
+    if (Test-Path $f) { Copy-Item -Path $f -Destination "dist\$f" -Force }
+}
+Write-Output "Static assets copied to dist/"
diff --git a/scripts/migrate.mjs b/scripts/migrate.mjs
new file mode 100644
index 0000000..f3226fc
--- /dev/null
+++ b/scripts/migrate.mjs
@@ -0,0 +1,85 @@
+// scripts/migrate.mjs
+import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
+import { createContext, runInContext } from 'node:vm';
+import { fileURLToPath } from 'node:url';
+import { dirname, join } from 'node:path';
+
+const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
+
+// 顺序严格照 index.html 中 <script> 的出现顺序
+const FILES = [
+  'meta.js',
+  'c-lang.js', 'coding.js', 'coding-2.js', 'cpp.js', 'cpp-2.js',
+  'ds-algo.js', 'ds-algo-2.js', 'control.js', 'os.js', 'rtos.js',
+  'linux-app.js', 'linux-drv.js', 'linux-drv-2.js', 'mcu-hw.js',
+  'hardware.js', 'bus.js', 'network.js', 'build.js', 'build-2.js',
+  'tools.js', 'debug.js', 'debug-2.js', 'security.js', 'security-2.js',
+  'automotive.js', 'behavioral.js',
+];
+
+const questions = [];
+let categories = [];
+
+const sandbox = { console };
+sandbox.window = sandbox;
+sandbox.globalThis = sandbox;
+sandbox.QBANK = {
+  add: (list) => questions.push(...list),
+  setCategories: (list) => { categories = list; },
+};
+const ctx = createContext(sandbox);
+
+for (const f of FILES) {
+  const src = readFileSync(join(ROOT, 'data', f), 'utf8');
+  runInContext(src, ctx, { filename: f });
+}
+
+// 补齐 QBANK.add 会做的默认值，保持与旧行为一致
+for (const q of questions) {
+  q.level = q.level || 1;
+  q.tags = q.tags || [];
+  q.followup = q.followup || [];
+  q.resume = !!q.resume;
+}
+
+const catalog = { cats: categories, presets: sandbox.CAT_PRESETS ?? {} };
+
+// ---- 自检：任一条不过就中止，不写文件 ----
+const errs = [];
+if (questions.length !== 476) errs.push(`题目数 ${questions.length}，期望 476`);
+
+const seen = new Set();
+for (const q of questions) {
+  if (!q.id) errs.push(`存在无 id 题目：${String(q.q).slice(0, 24)}`);
+  else if (seen.has(q.id)) errs.push(`id 重复：${q.id}`);
+  seen.add(q.id);
+}
+
+const catIds = new Set(categories.map((c) => c.id));
+for (const q of questions) {
+  if (!catIds.has(q.cat)) errs.push(`${q.id}: cat "${q.cat}" 未在 meta.js 登记`);
+  if (q.type === 'single' || q.type === 'multi') {
+    for (const i of q.answer) {
+      if (!Number.isInteger(i) || i < 0 || i >= q.options.length) {
+        errs.push(`${q.id}: answer 索引 ${i} 越界`);
+      }
+    }
+  }
+  if (q.type === 'bool' && typeof q.answer !== 'boolean') {
+    errs.push(`${q.id}: 判断题 answer 必须是布尔`);
+  }
+  if (!q.a) errs.push(`${q.id}: 缺少参考答案`);
+}
+
+if (errs.length) {
+  console.error('迁移自检失败，未写入任何文件：');
+  for (const e of errs.slice(0, 20)) console.error('  - ' + e);
+  process.exit(1);
+}
+
+mkdirSync(join(ROOT, 'data'), { recursive: true });
+writeFileSync(join(ROOT, 'data', 'questions.json'), JSON.stringify(questions, null, 0), 'utf8');
+writeFileSync(join(ROOT, 'data', 'categories.json'), JSON.stringify(catalog, null, 2), 'utf8');
+
+console.log(`OK: ${questions.length} 题, ${categories.length} 分类`);
+console.log('分类顺序:', categories.map((c) => c.id).join(', '));
diff --git a/src-rust/catalog.rs b/src-rust/catalog.rs
new file mode 100644
index 0000000..b3d6188
--- /dev/null
+++ b/src-rust/catalog.rs
@@ -0,0 +1,109 @@
+use crate::models::{CategoryMeta, Question};
+use std::collections::hash_map::DefaultHasher;
+use std::collections::HashMap;
+use std::hash::{Hash, Hasher};
+
+#[derive(Debug)]
+pub struct Catalog {
+    all: Vec<Question>,
+    by_cat: HashMap<String, Vec<usize>>,
+    cats: Vec<CategoryMeta>,
+    cat_index: HashMap<String, usize>,
+    id_index: HashMap<String, usize>,
+    hash: u64,
+}
+
+impl Catalog {
+    pub fn new(all: Vec<Question>, cats: Vec<CategoryMeta>) -> Self {
+        let mut by_cat: HashMap<String, Vec<usize>> = HashMap::new();
+        let mut id_index = HashMap::new();
+        for (i, q) in all.iter().enumerate() {
+            by_cat.entry(q.cat.clone()).or_default().push(i);
+            id_index.insert(q.id.clone(), i);
+        }
+        let cat_index = cats.iter().enumerate().map(|(i, c)| (c.id.clone(), i)).collect();
+
+        // 指纹：id 排序后逐个 hash，与声明顺序无关
+        let mut ids: Vec<&str> = all.iter().map(|q| q.id.as_str()).collect();
+        ids.sort_unstable();
+        let mut h = DefaultHasher::new();
+        all.len().hash(&mut h);
+        for id in ids {
+            id.hash(&mut h);
+        }
+
+        Catalog { all, by_cat, cats, cat_index, id_index, hash: h.finish() }
+    }
+
+    pub fn len(&self) -> usize { self.all.len() }
+    pub fn is_empty(&self) -> bool { self.all.is_empty() }
+    pub fn get(&self, idx: usize) -> Option<&Question> { self.all.get(idx) }
+    pub fn all(&self) -> &[Question] { &self.all }
+    pub fn cats(&self) -> &[CategoryMeta] { &self.cats }
+    pub fn bank_hash(&self) -> u64 { self.hash }
+
+    pub fn by_cat(&self, cat: &str) -> &[usize] {
+        self.by_cat.get(cat).map(|v| v.as_slice()).unwrap_or(&[])
+    }
+
+    pub fn cat_meta(&self, id: &str) -> Option<&CategoryMeta> {
+        self.cat_index.get(id).and_then(|&i| self.cats.get(i))
+    }
+
+    pub fn index_of(&self, id: &str) -> Option<usize> {
+        self.id_index.get(id).copied()
+    }
+}
+
+#[cfg(test)]
+mod tests {
+    use super::*;
+    use crate::models::*;
+
+    fn q(id: &str, cat: &str) -> Question {
+        Question {
+            id: id.into(), cat: cat.into(), q: "题".into(), a: "答".into(),
+            qtype: QType::Qa, options: vec![], answer: Answer::None,
+            level: 1, tags: vec![], resume: false, followup: vec![],
+        }
+    }
+
+    fn cat(id: &str) -> CategoryMeta {
+        CategoryMeta { id: id.into(), name: id.into(), desc: String::new() }
+    }
+
+    #[test]
+    fn by_cat_preserves_original_order() {
+        let c = Catalog::new(
+            vec![q("a-1", "a"), q("b-1", "b"), q("a-2", "a")],
+            vec![cat("a"), cat("b")],
+        );
+        assert_eq!(c.by_cat("a"), &[0, 2], "同分类下标应按题库原始顺序");
+        assert_eq!(c.by_cat("b"), &[1]);
+        assert!(c.by_cat("nope").is_empty(), "未知分类返回空切片而不是 panic");
+    }
+
+    #[test]
+    fn index_of_finds_question_by_id() {
+        let c = Catalog::new(vec![q("a-1", "a"), q("a-2", "a")], vec![cat("a")]);
+        assert_eq!(c.index_of("a-2"), Some(1));
+        assert_eq!(c.index_of("missing"), None);
+    }
+
+    #[test]
+    fn bank_hash_is_order_independent_but_content_sensitive() {
+        let c1 = Catalog::new(vec![q("a-1", "a"), q("a-2", "a")], vec![cat("a")]);
+        let c2 = Catalog::new(vec![q("a-2", "a"), q("a-1", "a")], vec![cat("a")]);
+        let c3 = Catalog::new(vec![q("a-1", "a"), q("a-3", "a")], vec![cat("a")]);
+        assert_eq!(c1.bank_hash(), c2.bank_hash(), "同一组 id 换顺序，指纹不变");
+        assert_ne!(c1.bank_hash(), c3.bank_hash(), "id 集合变了，指纹必须变");
+    }
+
+    #[test]
+    fn empty_catalog_does_not_panic() {
+        let c = Catalog::new(vec![], vec![]);
+        assert_eq!(c.len(), 0);
+        assert!(c.get(0).is_none());
+        assert_eq!(c.bank_hash(), c.bank_hash());
+    }
+}
diff --git a/src-rust/lib.rs b/src-rust/lib.rs
new file mode 100644
index 0000000..2950c72
--- /dev/null
+++ b/src-rust/lib.rs
@@ -0,0 +1,363 @@
+pub mod catalog;
+pub mod models;
+pub mod parser;
+pub mod scheduler;
+pub mod stats;
+
+use models::{Filter, Grade};
+use scheduler::Scheduler;
+use wasm_bindgen::prelude::*;
+
+#[wasm_bindgen]
+pub struct QuizEngine {
+    inner: Scheduler,
+    dirty: bool,
+}
+
+impl QuizEngine {
+    fn parse_filter(json: &str) -> Option<Filter> {
+        serde_json::from_str(json).ok()
+    }
+
+    fn parse_grade(s: &str) -> Option<Grade> {
+        match s {
+            "know" => Some(Grade::Know),
+            "fuzzy" => Some(Grade::Fuzzy),
+            "no" => Some(Grade::No),
+            _ => None,
+        }
+    }
+
+    /// `new` 的全部逻辑，错误用 String 表示。
+    /// 单独提出来是因为 `JsError::new` 是 JS 导入函数，在原生 target 下调用会 panic，
+    /// 构造失败路径没法在 `cargo test` 里断言。这里保持可测，`new` 只负责错误类型转换。
+    fn try_new(
+        questions_json: &str,
+        categories_json: &str,
+        state_json: Option<String>,
+    ) -> Result<QuizEngine, String> {
+        let catalog =
+            parser::parse(questions_json, categories_json).map_err(|e| e.to_string())?;
+
+        // 存档损坏时退回空状态：丢进度也比打不开应用好
+        let state = state_json
+            .as_deref()
+            .and_then(|s| serde_json::from_str(s).ok())
+            .unwrap_or_default();
+
+        Ok(QuizEngine { inner: Scheduler::new(catalog, state), dirty: false })
+    }
+}
+
+#[wasm_bindgen]
+impl QuizEngine {
+    #[wasm_bindgen(constructor)]
+    pub fn new(
+        questions_json: &str,
+        categories_json: &str,
+        state_json: Option<String>,
+    ) -> Result<QuizEngine, JsError> {
+        Self::try_new(questions_json, categories_json, state_json)
+            .map_err(|e| JsError::new(&e))
+    }
+
+    /// 组卷，返回题数。filter_json 非法时返回 0。
+    pub fn build(&mut self, filter_json: &str) -> usize {
+        let f = match Self::parse_filter(filter_json) {
+            Some(f) => f,
+            None => return 0,
+        };
+        let n = self.inner.build(&f);
+        self.dirty = true;
+        n
+    }
+
+    /// 恢复上次未刷完的卷
+    pub fn restore_deck(&mut self) -> bool {
+        self.inner.restore_deck()
+    }
+
+    /// 筛选面板的实时计数
+    pub fn count(&self, filter_json: &str) -> Result<JsValue, JsError> {
+        let f = Self::parse_filter(filter_json).unwrap_or_default();
+        let pool = self.inner.select(&f);
+        let payload = serde_json::json!({
+            "total": pool.len(),
+            "boxes": self.inner.distribution(&pool),
+        });
+        serde_wasm_bindgen::to_value(&payload).map_err(|e| JsError::new(&e.to_string()))
+    }
+}
+
+#[wasm_bindgen]
+impl QuizEngine {
+    pub fn current(&self) -> Result<JsValue, JsError> {
+        match self.inner.current() {
+            Some(q) => serde_wasm_bindgen::to_value(q).map_err(|e| JsError::new(&e.to_string())),
+            None => Ok(JsValue::NULL),
+        }
+    }
+
+    pub fn position(&self) -> usize { self.inner.position() }
+    pub fn size(&self) -> usize { self.inner.size() }
+    pub fn is_finished(&self) -> bool { self.inner.is_finished() }
+
+    pub fn advance(&mut self) {
+        self.inner.advance();
+        self.dirty = true;
+    }
+
+    pub fn back(&mut self) -> bool {
+        let ok = self.inner.back();
+        if ok {
+            self.dirty = true;
+        }
+        ok
+    }
+
+    pub fn judge(&self, picked: Vec<usize>) -> Result<JsValue, JsError> {
+        let id = match self.inner.current() {
+            Some(q) => q.id.clone(),
+            None => return Ok(JsValue::NULL),
+        };
+        let v = self.inner.judge(&id, &picked);
+        serde_wasm_bindgen::to_value(&v).map_err(|e| JsError::new(&e.to_string()))
+    }
+
+    /// grade: "know" | "fuzzy" | "no"。未知值或已完成时静默忽略。
+    pub fn record(&mut self, grade: &str) {
+        let g = match Self::parse_grade(grade) {
+            Some(g) => g,
+            None => return,
+        };
+        let id = match self.inner.current() {
+            Some(q) => q.id.clone(),
+            None => return,
+        };
+        self.inner.record(&id, g);
+        self.dirty = true;
+    }
+
+    pub fn toggle_fav(&mut self) -> bool {
+        let id = match self.inner.current() {
+            Some(q) => q.id.clone(),
+            None => return false,
+        };
+        let v = self.inner.toggle_fav(&id);
+        self.dirty = true;
+        v
+    }
+}
+
+#[wasm_bindgen]
+impl QuizEngine {
+    pub fn stats(&self) -> Result<JsValue, JsError> {
+        let st = self.inner.state();
+        let cat = self.inner.catalog();
+        let payload = serde_json::json!({
+            "overall": stats::overall(st, cat),
+            "byCategory": stats::by_category(st, cat),
+            "weakest": stats::weakest(st, cat, 5),
+            "heatmap": stats::heatmap(st, 182),
+            "resumeRisk": stats::resume_risk(st, cat),
+        });
+        serde_wasm_bindgen::to_value(&payload).map_err(|e| JsError::new(&e.to_string()))
+    }
+
+    /// 题库自检：字符串数组，空数组表示无问题
+    pub fn health(&self) -> Result<JsValue, JsError> {
+        let problems = parser::health(self.inner.catalog());
+        serde_wasm_bindgen::to_value(&problems).map_err(|e| JsError::new(&e.to_string()))
+    }
+
+    /// 分类元数据，按声明顺序 —— 筛选面板据此渲染 chips
+    pub fn cats(&self) -> Result<JsValue, JsError> {
+        serde_wasm_bindgen::to_value(self.inner.catalog().cats())
+            .map_err(|e| JsError::new(&e.to_string()))
+    }
+
+    /// 导出状态给 TS 落盘
+    pub fn state_json(&self) -> String {
+        serde_json::to_string(self.inner.state()).unwrap_or_else(|_| "{}".to_string())
+    }
+
+    /// 导入状态（设置面板的「导入进度」）。校验失败返回 Err，不动现有状态。
+    pub fn load_state_json(&mut self, json: &str) -> Result<(), JsError> {
+        let st: models::UserState =
+            serde_json::from_str(json).map_err(|e| JsError::new(&e.to_string()))?;
+        *self.inner.state_mut() = st;
+        self.dirty = true;
+        Ok(())
+    }
+
+    pub fn is_dirty(&self) -> bool { self.dirty }
+    pub fn mark_clean(&mut self) { self.dirty = false; }
+
+    pub fn theme(&self) -> String { self.inner.state().settings.theme.clone() }
+
+    pub fn set_theme(&mut self, v: &str) {
+        self.inner.state_mut().settings.theme = v.to_string();
+        self.dirty = true;
+    }
+
+    pub fn oral(&self) -> bool { self.inner.state().settings.oral }
+
+    pub fn set_oral(&mut self, v: bool) {
+        self.inner.state_mut().settings.oral = v;
+        self.dirty = true;
+    }
+
+    pub fn oral_seconds(&self) -> u32 { self.inner.state().settings.oral_seconds }
+
+    pub fn set_oral_seconds(&mut self, v: u32) {
+        self.inner.state_mut().settings.oral_seconds = v.clamp(5, 600);
+        self.dirty = true;
+    }
+
+    pub fn questions_json(&self) -> String {
+        serde_json::to_string(self.inner.catalog().all()).unwrap_or_else(|_| "[]".to_string())
+    }
+}
+
+#[cfg(test)]
+mod tests {
+    #[test]
+    fn skeleton_compiles() {
+        assert_eq!(2 + 2, 4);
+    }
+}
+
+#[cfg(test)]
+mod engine_tests {
+    use super::*;
+
+    const CATS: &str = r#"{"cats":[{"id":"c-lang","name":"C","desc":""}],"presets":{}}"#;
+    const QS: &str = r#"[
+        {"id":"c-1","cat":"c-lang","q":"题一","a":"答一","type":"single","options":["A","B"],"answer":[0]},
+        {"id":"c-2","cat":"c-lang","q":"题二","a":"答二","type":"qa"}
+    ]"#;
+
+    fn engine() -> QuizEngine {
+        QuizEngine::new(QS, CATS, None).unwrap()
+    }
+
+    #[test]
+    fn new_rejects_bad_bank() {
+        // 走 try_new：`new` 的失败路径要构造 JsError，而 JsError::new 是 JS 导入函数，
+        // 在原生 target 下调用会 panic。try_new 是 `new` 的全部实际逻辑。
+        assert!(QuizEngine::try_new("[{", CATS, None).is_err());
+    }
+
+    #[test]
+    fn new_with_corrupt_state_falls_back_to_blank() {
+        // 存档坏了不能拦住启动，否则用户永远打不开应用
+        let e = QuizEngine::new(QS, CATS, Some("not json".into())).unwrap();
+        assert_eq!(e.size(), 0);
+        assert!(e.state_json().contains("\"version\""));
+    }
+
+    #[test]
+    fn build_then_navigate_and_record() {
+        let mut e = engine();
+        let filter = r#"{"mode":"ordered"}"#;
+        assert_eq!(e.build(filter), 2);
+        assert_eq!(e.position(), 0);
+        assert!(!e.is_finished());
+
+        e.record("know");
+        e.advance();
+        assert_eq!(e.position(), 1);
+        assert!(e.back());
+        assert_eq!(e.position(), 0);
+
+        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
+        assert_eq!(s["q"]["c-1"]["box"], 1);
+    }
+
+    #[test]
+    fn build_persists_deck_for_restore() {
+        let mut e = engine();
+        e.build(r#"{"mode":"random","seed":99}"#);
+        e.advance();
+        let saved = e.state_json();
+
+        let mut e2 = QuizEngine::new(QS, CATS, Some(saved)).unwrap();
+        assert!(e2.restore_deck());
+        assert_eq!(e2.position(), 1);
+    }
+
+    #[test]
+    fn record_is_noop_when_finished() {
+        let mut e = engine();
+        e.build(r#"{"mode":"ordered"}"#);
+        e.advance(); e.advance();
+        assert!(e.is_finished());
+        e.record("know"); // 不该 panic，也不该乱记到别的题上
+        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
+        assert!(s["q"].get("c-1").is_none() || s["q"]["c-1"]["seen"] == 0);
+    }
+
+    #[test]
+    fn invalid_grade_string_is_ignored() {
+        let mut e = engine();
+        e.build(r#"{"mode":"ordered"}"#);
+        e.record("bogus");
+        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
+        assert!(s["q"].get("c-1").is_none(), "未知 grade 不该写进度");
+    }
+
+    #[test]
+    fn bad_filter_json_builds_nothing() {
+        let mut e = engine();
+        assert_eq!(e.build("{oops"), 0);
+    }
+
+    #[test]
+    fn dirty_flag_tracks_unsaved_changes() {
+        let mut e = engine();
+        e.build(r#"{"mode":"ordered"}"#);
+        assert!(e.is_dirty());
+        e.mark_clean();
+        assert!(!e.is_dirty());
+        e.record("no");
+        assert!(e.is_dirty());
+    }
+
+    #[test]
+    fn toggle_fav_targets_current_question() {
+        let mut e = engine();
+        e.build(r#"{"mode":"ordered"}"#);
+        assert!(e.toggle_fav());
+        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
+        assert_eq!(s["q"]["c-1"]["fav"], true);
+    }
+
+    #[test]
+    fn settings_round_trip_through_engine() {
+        let mut e = engine();
+        assert_eq!(e.theme(), "auto");
+        e.set_theme("dark");
+        assert_eq!(e.theme(), "dark");
+
+        assert!(!e.oral());
+        e.set_oral(true);
+        assert!(e.oral());
+
+        assert_eq!(e.oral_seconds(), 60);
+        e.set_oral_seconds(90);
+        assert_eq!(e.oral_seconds(), 90);
+
+        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
+        assert_eq!(s["settings"]["theme"], "dark");
+        assert_eq!(s["settings"]["oralSeconds"], 90);
+    }
+
+    #[test]
+    fn oral_seconds_is_clamped_to_sane_range() {
+        let mut e = engine();
+        e.set_oral_seconds(0);
+        assert_eq!(e.oral_seconds(), 5, "下限 5 秒");
+        e.set_oral_seconds(9999);
+        assert_eq!(e.oral_seconds(), 600, "上限 10 分钟");
+    }
+}
diff --git a/src-rust/models.rs b/src-rust/models.rs
new file mode 100644
index 0000000..1c6b695
--- /dev/null
+++ b/src-rust/models.rs
@@ -0,0 +1,256 @@
+use serde::{Deserialize, Serialize};
+use std::collections::HashMap;
+
+fn one() -> u8 { 1 }
+
+#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Hash)]
+#[serde(rename_all = "lowercase")]
+pub enum QType { Single, Multi, Bool, Qa }
+
+#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
+#[serde(untagged)]
+pub enum Answer {
+    Indices(Vec<usize>),
+    Bool(bool),
+    None,
+}
+
+impl Default for Answer {
+    fn default() -> Self { Answer::None }
+}
+
+#[derive(Serialize, Deserialize, Clone, Debug)]
+pub struct Question {
+    pub id: String,
+    pub cat: String,
+    pub q: String,
+    pub a: String,
+    #[serde(rename = "type")]
+    pub qtype: QType,
+    #[serde(default)]
+    pub options: Vec<String>,
+    #[serde(default)]
+    pub answer: Answer,
+    #[serde(default = "one")]
+    pub level: u8,
+    #[serde(default)]
+    pub tags: Vec<String>,
+    #[serde(default)]
+    pub resume: bool,
+    #[serde(default)]
+    pub followup: Vec<String>,
+}
+
+#[derive(Serialize, Deserialize, Clone, Debug)]
+pub struct CategoryMeta {
+    pub id: String,
+    pub name: String,
+    #[serde(default)]
+    pub desc: String,
+}
+
+#[derive(Serialize, Deserialize, Clone, Debug, Default)]
+pub struct Progress {
+    #[serde(rename = "box")]
+    pub bx: u8,
+    #[serde(default)]
+    pub right: u32,
+    #[serde(default)]
+    pub wrong: u32,
+    #[serde(default)]
+    pub seen: u32,
+    #[serde(default)]
+    pub last: u64,
+    #[serde(default)]
+    pub fav: bool,
+}
+
+#[derive(Serialize, Deserialize, Clone, Debug)]
+pub struct Settings {
+    #[serde(default = "default_theme")]
+    pub theme: String,
+    #[serde(default)]
+    pub oral: bool,
+    #[serde(rename = "oralSeconds", default = "default_oral_seconds")]
+    pub oral_seconds: u32,
+}
+
+fn default_theme() -> String { "auto".to_string() }
+fn default_oral_seconds() -> u32 { 60 }
+
+impl Default for Settings {
+    fn default() -> Self {
+        Settings { theme: default_theme(), oral: false, oral_seconds: default_oral_seconds() }
+    }
+}
+
+#[derive(Serialize, Deserialize, Clone, Debug)]
+pub struct UserState {
+    #[serde(default = "state_version")]
+    pub version: u32,
+    #[serde(default)]
+    pub q: HashMap<String, Progress>,
+    #[serde(default)]
+    pub days: HashMap<String, u32>,
+    #[serde(rename = "wrongToday", default)]
+    pub wrong_today: HashMap<String, Vec<String>>,
+    #[serde(default)]
+    pub settings: Settings,
+    #[serde(default)]
+    pub deck: Option<Deck>,
+}
+
+fn state_version() -> u32 { 2 }
+
+impl Default for UserState {
+    fn default() -> Self {
+        UserState {
+            version: 2,
+            q: HashMap::new(),
+            days: HashMap::new(),
+            wrong_today: HashMap::new(),
+            settings: Settings::default(),
+            deck: None,
+        }
+    }
+}
+
+#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
+#[serde(rename_all = "lowercase")]
+pub enum Scope {
+    Wrong,
+    Unmastered,
+    Fav,
+    /// 序列化为 "resume" 以匹配 index.html:74 的 data-scope 值
+    #[serde(rename = "resume")]
+    ResumeRisk,
+}
+
+#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
+#[serde(rename_all = "lowercase")]
+pub enum Mode { Smart, Ordered, Random }
+
+impl Default for Mode {
+    fn default() -> Self { Mode::Smart }
+}
+
+#[derive(Serialize, Deserialize, Clone, Debug, Default)]
+pub struct Filter {
+    #[serde(default)]
+    pub cats: Vec<String>,
+    #[serde(default)]
+    pub levels: Vec<u8>,
+    #[serde(default)]
+    pub types: Vec<QType>,
+    #[serde(default)]
+    pub scopes: Vec<Scope>,
+    #[serde(default)]
+    pub mode: Mode,
+    #[serde(default)]
+    pub keyword: String,
+    #[serde(default)]
+    pub seed: Option<u64>,
+}
+
+#[derive(Serialize, Deserialize, Clone, Debug)]
+pub struct Deck {
+    pub ids: Vec<String>,
+    pub pos: usize,
+    pub filter: Filter,
+    pub seed: u64,
+    pub bank_hash: u64,
+}
+
+#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
+#[serde(rename_all = "lowercase")]
+pub enum Grade { Know, Fuzzy, No }
+
+#[derive(Serialize, Deserialize, Clone, Debug)]
+pub struct Verdict {
+    pub correct: bool,
+    pub expected: Vec<usize>,
+    pub picked: Vec<usize>,
+}
+
+#[cfg(test)]
+mod tests {
+    use super::*;
+
+    #[test]
+    fn question_roundtrips_choice() {
+        let json = r#"{"id":"c-001","cat":"c-lang","q":"题干","a":"答案",
+            "type":"single","options":["A","B"],"answer":[1]}"#;
+        let q: Question = serde_json::from_str(json).unwrap();
+        assert_eq!(q.id, "c-001");
+        assert_eq!(q.qtype, QType::Single);
+        assert!(matches!(q.answer, Answer::Indices(ref v) if v == &vec![1]));
+        assert_eq!(q.level, 1, "level 缺省应为 1");
+        assert!(!q.resume);
+    }
+
+    #[test]
+    fn question_accepts_bool_answer() {
+        let json = r#"{"id":"os-001","cat":"os","q":"题","a":"答","type":"bool","answer":true}"#;
+        let q: Question = serde_json::from_str(json).unwrap();
+        assert!(matches!(q.answer, Answer::Bool(true)));
+    }
+
+    #[test]
+    fn question_accepts_qa_without_answer() {
+        let json = r#"{"id":"os-002","cat":"os","q":"题","a":"答","type":"qa"}"#;
+        let q: Question = serde_json::from_str(json).unwrap();
+        assert!(matches!(q.answer, Answer::None));
+        assert!(q.options.is_empty());
+    }
+
+    #[test]
+    fn user_state_reads_v1_archive() {
+        // 形状取自现有 localStorage["embq.v1"]
+        let json = r#"{
+            "version": 1,
+            "q": { "c-001": { "box": 2, "right": 3, "wrong": 1, "seen": 4, "last": 1720000000000, "fav": true } },
+            "days": { "2026-07-28": 12 },
+            "wrongToday": { "2026-07-28": ["c-001"] },
+            "settings": { "theme": "dark", "oral": false, "oralSeconds": 60 }
+        }"#;
+        let s: UserState = serde_json::from_str(json).unwrap();
+        let p = s.q.get("c-001").unwrap();
+        assert_eq!(p.bx, 2, "box 必须映射到 bx");
+        assert_eq!(p.right, 3);
+        assert!(p.fav);
+        assert_eq!(s.wrong_today.get("2026-07-28").unwrap(), &vec!["c-001".to_string()]);
+        assert_eq!(s.settings.oral_seconds, 60, "oralSeconds 必须映射到 oral_seconds");
+        assert!(s.deck.is_none(), "v1 存档没有 deck");
+    }
+
+    #[test]
+    fn user_state_writes_camel_case_keys() {
+        let s = UserState::default();
+        let out = serde_json::to_string(&s).unwrap();
+        assert!(out.contains("\"wrongToday\""), "落盘必须写 wrongToday，实际: {out}");
+        assert!(out.contains("\"oralSeconds\""));
+        assert!(!out.contains("wrong_today"));
+    }
+
+    #[test]
+    fn progress_defaults_are_zero() {
+        let p = Progress::default();
+        assert_eq!(p.bx, 0);
+        assert_eq!(p.seen, 0);
+        assert!(!p.fav);
+    }
+
+    #[test]
+    fn scope_serializes_to_dom_data_attribute_values() {
+        // 必须与 index.html:71-74 的 data-scope 值逐字一致
+        let f: Filter = serde_json::from_str(
+            r#"{"scopes":["wrong","unmastered","fav","resume"]}"#,
+        ).unwrap();
+        assert_eq!(
+            f.scopes,
+            vec![Scope::Wrong, Scope::Unmastered, Scope::Fav, Scope::ResumeRisk]
+        );
+        let out = serde_json::to_string(&f.scopes).unwrap();
+        assert_eq!(out, r#"["wrong","unmastered","fav","resume"]"#);
+    }
+}
diff --git a/src-rust/parser.rs b/src-rust/parser.rs
new file mode 100644
index 0000000..253cc19
--- /dev/null
+++ b/src-rust/parser.rs
@@ -0,0 +1,210 @@
+use crate::catalog::Catalog;
+use crate::models::{Answer, CategoryMeta, QType, Question};
+use serde::Deserialize;
+use std::collections::HashSet;
+use std::fmt;
+
+#[derive(Deserialize)]
+struct CatalogFile {
+    cats: Vec<CategoryMeta>,
+    #[serde(default)]
+    #[allow(dead_code)]
+    presets: std::collections::HashMap<String, Vec<String>>,
+}
+
+#[derive(Debug)]
+pub enum ParseError {
+    Json(String),
+    Validation(Vec<String>),
+}
+
+impl fmt::Display for ParseError {
+    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
+        match self {
+            ParseError::Json(m) => write!(f, "JSON 解析失败: {m}"),
+            ParseError::Validation(v) => write!(f, "题库校验失败: {}", v.join("; ")),
+        }
+    }
+}
+
+pub fn parse(questions_json: &str, categories_json: &str) -> Result<Catalog, ParseError> {
+    let cat_file: CatalogFile =
+        serde_json::from_str(categories_json).map_err(|e| ParseError::Json(e.to_string()))?;
+    let questions: Vec<Question> =
+        serde_json::from_str(questions_json).map_err(|e| ParseError::Json(e.to_string()))?;
+
+    let known: HashSet<&str> = cat_file.cats.iter().map(|c| c.id.as_str()).collect();
+    let mut seen: HashSet<&str> = HashSet::new();
+    let mut errs = Vec::new();
+
+    for q in &questions {
+        if q.id.is_empty() {
+            errs.push(format!("存在无 id 的题目: {}", q.q.chars().take(24).collect::<String>()));
+            continue;
+        }
+        if !seen.insert(q.id.as_str()) {
+            errs.push(format!("{}: id 重复", q.id));
+        }
+        if !known.contains(q.cat.as_str()) {
+            errs.push(format!("{}: 分类 \"{}\" 未登记", q.id, q.cat));
+        }
+        if !(1..=3).contains(&q.level) {
+            errs.push(format!("{}: level 应为 1~3，实际 {}", q.id, q.level));
+        }
+        if q.q.trim().is_empty() {
+            errs.push(format!("{}: 缺少题干", q.id));
+        }
+        if q.a.trim().is_empty() {
+            errs.push(format!("{}: 缺少参考答案", q.id));
+        }
+        match q.qtype {
+            QType::Single | QType::Multi => match &q.answer {
+                Answer::Indices(v) if !v.is_empty() => {
+                    if q.options.len() < 2 {
+                        errs.push(format!("{}: 选择题至少要 2 个选项", q.id));
+                    }
+                    for &i in v {
+                        if i >= q.options.len() {
+                            errs.push(format!("{}: answer 索引 {} 越界", q.id, i));
+                        }
+                    }
+                    if q.qtype == QType::Single && v.len() != 1 {
+                        errs.push(format!("{}: 单选题只能有 1 个正确答案", q.id));
+                    }
+                    if q.qtype == QType::Multi && v.len() < 2 {
+                        errs.push(format!("{}: 多选题至少 2 个正确答案，否则请用 single", q.id));
+                    }
+                }
+                _ => errs.push(format!("{}: 选择题 answer 必须是非空索引数组", q.id)),
+            },
+            QType::Bool => {
+                if !matches!(q.answer, Answer::Bool(_)) {
+                    errs.push(format!("{}: 判断题 answer 必须是 true/false", q.id));
+                }
+            }
+            QType::Qa => {}
+        }
+    }
+
+    if !errs.is_empty() {
+        return Err(ParseError::Validation(errs));
+    }
+    Ok(Catalog::new(questions, cat_file.cats))
+}
+
+/// 题库自检：分类登记与题目分布是否对得上。不阻断加载，供设置面板显示。
+pub fn health(catalog: &Catalog) -> Vec<String> {
+    let mut out = Vec::new();
+    for c in catalog.cats() {
+        if catalog.by_cat(&c.id).is_empty() {
+            out.push(format!("分类 \"{}\" 已登记但一道题都没有", c.id));
+        }
+    }
+    let registered: HashSet<&str> = catalog.cats().iter().map(|c| c.id.as_str()).collect();
+    let mut orphans: Vec<&str> = catalog
+        .all()
+        .iter()
+        .map(|q| q.cat.as_str())
+        .filter(|c| !registered.contains(c))
+        .collect();
+    orphans.sort_unstable();
+    orphans.dedup();
+    for c in orphans {
+        out.push(format!("分类 \"{}\" 有题目但未登记", c));
+    }
+    out
+}
+
+#[cfg(test)]
+mod tests {
+    use super::*;
+
+    const CATS: &str = r#"{"cats":[{"id":"c-lang","name":"C","desc":""}],"presets":{}}"#;
+
+    fn qs(body: &str) -> String { format!("[{body}]") }
+
+    #[test]
+    fn parses_valid_bank() {
+        let j = qs(r#"{"id":"c-001","cat":"c-lang","q":"题","a":"答","type":"qa"}"#);
+        let c = parse(&j, CATS).unwrap();
+        assert_eq!(c.len(), 1);
+        assert_eq!(c.cats().len(), 1);
+    }
+
+    #[test]
+    fn rejects_malformed_json() {
+        assert!(parse("[{", CATS).is_err());
+    }
+
+    #[test]
+    fn rejects_duplicate_ids() {
+        let j = qs(r#"{"id":"c-001","cat":"c-lang","q":"a","a":"b","type":"qa"},
+                     {"id":"c-001","cat":"c-lang","q":"c","a":"d","type":"qa"}"#);
+        let e = parse(&j, CATS).unwrap_err().to_string();
+        assert!(e.contains("c-001"), "错误信息应指出重复的 id，实际: {e}");
+    }
+
+    #[test]
+    fn rejects_unknown_category() {
+        let j = qs(r#"{"id":"x-1","cat":"nope","q":"a","a":"b","type":"qa"}"#);
+        assert!(parse(&j, CATS).unwrap_err().to_string().contains("nope"));
+    }
+
+    #[test]
+    fn rejects_out_of_range_level() {
+        let j = qs(r#"{"id":"x-1","cat":"c-lang","q":"a","a":"b","type":"qa","level":9}"#);
+        assert!(parse(&j, CATS).unwrap_err().to_string().contains("level"));
+    }
+
+    #[test]
+    fn rejects_choice_with_out_of_bounds_answer() {
+        let j = qs(r#"{"id":"x-1","cat":"c-lang","q":"a","a":"b","type":"single",
+                      "options":["A","B"],"answer":[5]}"#);
+        assert!(parse(&j, CATS).unwrap_err().to_string().contains("越界"));
+    }
+
+    #[test]
+    fn rejects_multi_with_single_answer() {
+        let j = qs(r#"{"id":"x-1","cat":"c-lang","q":"a","a":"b","type":"multi",
+                      "options":["A","B","C"],"answer":[1]}"#);
+        let e = parse(&j, CATS).unwrap_err().to_string();
+        assert!(e.contains("多选题"), "错误信息应指出多选题答案过少，实际: {e}");
+    }
+
+    #[test]
+    fn rejects_question_with_empty_stem() {
+        let j = qs(r#"{"id":"x-1","cat":"c-lang","q":"  ","a":"b","type":"qa"}"#);
+        let e = parse(&j, CATS).unwrap_err().to_string();
+        assert!(e.contains("题干"), "错误信息应指出缺少题干，实际: {e}");
+    }
+
+    #[test]
+    fn rejects_qa_without_reference_answer() {
+        let j = qs(r#"{"id":"x-1","cat":"c-lang","q":"a","a":"","type":"qa"}"#);
+        assert!(parse(&j, CATS).is_err());
+    }
+
+    #[test]
+    fn health_reports_registered_but_empty_category() {
+        let cats = r#"{"cats":[{"id":"c-lang","name":"C","desc":""},
+                              {"id":"os","name":"OS","desc":""}],"presets":{}}"#;
+        let j = qs(r#"{"id":"c-001","cat":"c-lang","q":"a","a":"b","type":"qa"}"#);
+        let c = parse(&j, cats).unwrap();
+        let problems = health(&c);
+        assert!(problems.iter().any(|p| p.contains("os")), "应报告 os 分类没有题目");
+    }
+
+    #[test]
+    fn real_bank_passes_validation() {
+        let qs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/data/questions.json"))
+            .expect("先运行 npm run migrate 生成 data/questions.json");
+        let cs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/data/categories.json"))
+            .unwrap();
+        let c = parse(&qs, &cs).expect("真实题库应通过校验");
+        // 下限而非等值：新增题目不该让测试失败。
+        // id 唯一、分类合法、答案不越界这些真正要守的规则由 parse 本身保证。
+        assert!(c.len() >= 476, "题目数不该少于迁移时的 476，实际 {}", c.len());
+        assert_eq!(c.cats().len(), 19);
+        assert!(health(&c).is_empty(), "真实题库自检应无问题: {:?}", health(&c));
+    }
+}
diff --git a/src-rust/scheduler.rs b/src-rust/scheduler.rs
new file mode 100644
index 0000000..0dfcf41
--- /dev/null
+++ b/src-rust/scheduler.rs
@@ -0,0 +1,733 @@
+use crate::catalog::Catalog;
+use crate::models::Mode;
+use crate::models::{Answer, Grade, QType, Verdict};
+use crate::models::{Deck, Filter, Progress, Question, Scope, UserState};
+use rand::rngs::StdRng;
+use rand::seq::SliceRandom;
+use rand::SeedableRng;
+
+#[cfg(all(target_arch = "wasm32", not(test)))]
+pub fn now_ms() -> u64 {
+    js_sys::Date::now() as u64
+}
+
+#[cfg(not(all(target_arch = "wasm32", not(test))))]
+pub fn now_ms() -> u64 {
+    use std::time::{SystemTime, UNIX_EPOCH};
+    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
+}
+
+/// "YYYY-MM-DD"（本地时区），与现有存档的 days / wrongToday key 格式一致
+pub fn today_key() -> String {
+    #[cfg(all(target_arch = "wasm32", not(test)))]
+    {
+        let d = js_sys::Date::new_0();
+        return format!("{:04}-{:02}-{:02}", d.get_full_year(), d.get_month() + 1, d.get_date());
+    }
+    #[cfg(not(all(target_arch = "wasm32", not(test))))]
+    {
+        ymd_from_ms(now_ms())
+    }
+}
+
+/// 把 Unix 毫秒换算成 YYYY-MM-DD（UTC）。只在非 wasm 下使用。
+#[cfg(not(all(target_arch = "wasm32", not(test))))]
+pub fn ymd_from_ms(ms: u64) -> String {
+    let days = (ms / 86_400_000) as i64;
+    let (mut y, mut d) = (1970i64, days);
+    loop {
+        let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
+        let len = if leap { 366 } else { 365 };
+        if d < len { break; }
+        d -= len;
+        y += 1;
+    }
+    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
+    let months = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
+    let mut m = 0usize;
+    while d >= months[m] { d -= months[m]; m += 1; }
+    format!("{:04}-{:02}-{:02}", y, m + 1, d + 1)
+}
+
+pub struct Scheduler {
+    catalog: Catalog,
+    state: UserState,
+    filter: Filter,
+    pool: Vec<usize>,
+    pos: usize,
+}
+
+impl Scheduler {
+    pub fn new(catalog: Catalog, state: UserState) -> Self {
+        Scheduler { catalog, state, filter: Filter::default(), pool: Vec::new(), pos: 0 }
+    }
+
+    pub fn catalog(&self) -> &Catalog { &self.catalog }
+    pub fn state(&self) -> &UserState { &self.state }
+    pub fn state_mut(&mut self) -> &mut UserState { &mut self.state }
+    pub fn filter(&self) -> &Filter { &self.filter }
+
+    fn progress_of(&self, id: &str) -> Progress {
+        self.state.q.get(id).cloned().unwrap_or_default()
+    }
+
+    /// 按 filter 挑出命中的下标，保持题库原始顺序。维度间 AND，维度内 OR。
+    pub fn select(&self, f: &Filter) -> Vec<usize> {
+        let kw = f.keyword.trim().to_lowercase();
+        let wrong_ids = self.wrong_today_ids();
+
+        (0..self.catalog.len())
+            .filter(|&i| {
+                let q = match self.catalog.get(i) {
+                    Some(q) => q,
+                    None => return false,
+                };
+                if !f.cats.is_empty() && !f.cats.iter().any(|c| c == &q.cat) { return false; }
+                if !f.levels.is_empty() && !f.levels.contains(&q.level) { return false; }
+                if !f.types.is_empty() && !f.types.contains(&q.qtype) { return false; }
+                if !kw.is_empty() {
+                    let hay = format!("{} {} {}", q.q, q.a, q.tags.join(" ")).to_lowercase();
+                    if !hay.contains(&kw) { return false; }
+                }
+                if !f.scopes.is_empty() {
+                    let p = self.progress_of(&q.id);
+                    let hit = f.scopes.iter().any(|s| match s {
+                        Scope::Fav => p.fav,
+                        Scope::Unmastered => p.bx < 3,
+                        Scope::ResumeRisk => q.resume,
+                        Scope::Wrong => wrong_ids.iter().any(|w| w == &q.id),
+                    });
+                    if !hit { return false; }
+                }
+                true
+            })
+            .collect()
+    }
+
+    fn wrong_today_ids(&self) -> Vec<String> {
+        self.state
+            .wrong_today
+            .get(&today_key())
+            .cloned()
+            .unwrap_or_default()
+    }
+
+    /// 排序键必须是全序，否则每次组卷顺序会变 —— 这是 v1 的核心 bug。
+    fn order(&self, pool: &mut Vec<usize>, f: &Filter) {
+        match f.mode {
+            // select 已按原始下标升序产出，无需再排
+            Mode::Ordered => {}
+            Mode::Smart => {
+                pool.sort_by(|&a, &b| self.smart_key(a).cmp(&self.smart_key(b)));
+            }
+            Mode::Random => {
+                let seed = f.seed.unwrap_or(0);
+                let mut rng = StdRng::seed_from_u64(seed);
+                pool.shuffle(&mut rng);
+            }
+        }
+    }
+
+    /// (盒号, 紧急度, 上次作答时间, id) —— 全序、无随机、可复现。
+    /// urgency: 0 = 加急（错多于对，或简历高危题），1 = 普通。
+    fn smart_key(&self, idx: usize) -> (u8, u8, u64, String) {
+        let q = match self.catalog.get(idx) {
+            Some(q) => q,
+            None => return (u8::MAX, 1, u64::MAX, String::new()),
+        };
+        let p = self.progress_of(&q.id);
+        let urgent = p.wrong > p.right || q.resume;
+        (p.bx, if urgent { 0 } else { 1 }, p.last, q.id.clone())
+    }
+
+    /// 组卷：筛选 + 排序，重置到第一题。返回题数，0 表示无命中。
+    pub fn build(&mut self, f: &Filter) -> usize {
+        let mut pool = self.select(f);
+        self.order(&mut pool, f);
+        self.pool = pool;
+        self.pos = 0;
+        self.filter = f.clone();
+        self.save_deck();
+        self.pool.len()
+    }
+
+    /// 测试与持久化用：当前卷的 id 列表
+    pub fn pool_ids(&self) -> Vec<String> {
+        self.pool
+            .iter()
+            .filter_map(|&i| self.catalog.get(i).map(|q| q.id.clone()))
+            .collect()
+    }
+
+    pub fn size(&self) -> usize { self.pool.len() }
+
+    /// 当前题在卷中的下标；等于卷长度表示已完成。
+    pub fn position(&self) -> usize { self.pos }
+
+    pub fn is_finished(&self) -> bool { self.pos >= self.pool.len() }
+
+    pub fn current(&self) -> Option<&Question> {
+        self.pool.get(self.pos).and_then(|&i| self.catalog.get(i))
+    }
+
+    pub fn advance(&mut self) {
+        if self.pos < self.pool.len() {
+            self.pos += 1;
+            self.save_deck();
+        }
+    }
+
+    pub fn back(&mut self) -> bool {
+        if self.pos == 0 {
+            return false;
+        }
+        self.pos -= 1;
+        self.save_deck();
+        true
+    }
+
+    pub fn goto(&mut self, pos: usize) {
+        self.pos = pos.min(self.pool.len());
+        self.save_deck();
+    }
+}
+
+impl Scheduler {
+    /// 把当前卷写进 state，供 TS 落盘。每次组卷/前进/后退后调用。
+    pub fn save_deck(&mut self) {
+        if self.pool.is_empty() {
+            self.state.deck = None;
+            return;
+        }
+        self.state.deck = Some(Deck {
+            ids: self.pool_ids(),
+            pos: self.pos,
+            filter: self.filter.clone(),
+            seed: self.filter.seed.unwrap_or(0),
+            bank_hash: self.catalog.bank_hash(),
+        });
+    }
+
+    /// 恢复上次未刷完的卷。题库变过或卷里有已删除的题则返回 false。
+    pub fn restore_deck(&mut self) -> bool {
+        let deck = match self.state.deck.clone() {
+            Some(d) => d,
+            None => return false,
+        };
+        if deck.bank_hash != self.catalog.bank_hash() {
+            self.state.deck = None;
+            return false;
+        }
+        let mut pool = Vec::with_capacity(deck.ids.len());
+        for id in &deck.ids {
+            match self.catalog.index_of(id) {
+                Some(i) => pool.push(i),
+                None => {
+                    // 静默跳过会让 pos 指向别的题，宁可整卷作废
+                    self.state.deck = None;
+                    return false;
+                }
+            }
+        }
+        self.pos = deck.pos.min(pool.len());
+        self.pool = pool;
+        self.filter = deck.filter;
+        true
+    }
+}
+
+impl Scheduler {
+    pub fn judge(&self, id: &str, picked: &[usize]) -> Verdict {
+        let mut sorted: Vec<usize> = picked.to_vec();
+        sorted.sort_unstable();
+        sorted.dedup();
+
+        let q = match self.catalog.index_of(id).and_then(|i| self.catalog.get(i)) {
+            Some(q) => q,
+            None => return Verdict { correct: false, expected: vec![], picked: sorted },
+        };
+
+        match (&q.qtype, &q.answer) {
+            (QType::Single | QType::Multi, Answer::Indices(exp)) => {
+                let mut e = exp.clone();
+                e.sort_unstable();
+                Verdict { correct: e == sorted, expected: e, picked: sorted }
+            }
+            (QType::Bool, Answer::Bool(b)) => {
+                // 判断题用 picked[0]：0 = 错, 1 = 对
+                let want = if *b { 1usize } else { 0usize };
+                let got = sorted.first().copied();
+                Verdict { correct: got == Some(want), expected: vec![want], picked: sorted }
+            }
+            // 简答题无客观对错，由用户点评分按钮自评
+            (QType::Qa, _) => Verdict { correct: true, expected: vec![], picked: sorted },
+            _ => Verdict { correct: false, expected: vec![], picked: sorted },
+        }
+    }
+}
+
+impl Scheduler {
+    pub fn record(&mut self, id: &str, grade: Grade) {
+        let day = today_key();
+        let now = now_ms();
+
+        let p = self.state.q.entry(id.to_string()).or_default();
+        p.seen += 1;
+        p.last = now;
+        match grade {
+            Grade::Know => {
+                p.right += 1;
+                p.bx = (p.bx + 1).min(3);
+            }
+            // 保底 1 盒但不降级 —— 与 v1 一致，保住 fuzzy 这一档粒度
+            Grade::Fuzzy => {
+                p.bx = p.bx.max(1);
+            }
+            Grade::No => {
+                p.wrong += 1;
+                p.bx = 1;
+            }
+        }
+
+        *self.state.days.entry(day.clone()).or_insert(0) += 1;
+
+        if matches!(grade, Grade::No) {
+            let list = self.state.wrong_today.entry(day).or_default();
+            if !list.iter().any(|x| x == id) {
+                list.push(id.to_string());
+            }
+        }
+    }
+
+    pub fn toggle_fav(&mut self, id: &str) -> bool {
+        let p = self.state.q.entry(id.to_string()).or_default();
+        p.fav = !p.fav;
+        p.fav
+    }
+
+    /// [未练, 生, 熟, 已掌握]
+    pub fn distribution(&self, pool: &[usize]) -> [usize; 4] {
+        let mut d = [0usize; 4];
+        for &i in pool {
+            if let Some(q) = self.catalog.get(i) {
+                let bx = self.progress_of(&q.id).bx.min(3) as usize;
+                d[bx] += 1;
+            }
+        }
+        d
+    }
+}
+
+#[cfg(test)]
+mod tests {
+    use super::*;
+    use crate::models::*;
+
+    fn mk(id: &str, cat: &str, level: u8, qtype: QType, resume: bool) -> Question {
+        Question {
+            id: id.into(), cat: cat.into(), q: format!("题干 {id}"), a: "答案".into(),
+            qtype, options: vec!["A".into(), "B".into()],
+            answer: if matches!(qtype, QType::Single) { Answer::Indices(vec![0]) } else { Answer::None },
+            level, tags: vec![], resume, followup: vec![],
+        }
+    }
+
+    fn cat(id: &str) -> CategoryMeta {
+        CategoryMeta { id: id.into(), name: id.into(), desc: String::new() }
+    }
+
+    /// 4 题：c-1(c,L1,single) c-2(c,L2,qa,resume) os-1(os,L1,qa) os-2(os,L3,single)
+    fn fixture_catalog() -> Catalog {
+        Catalog::new(
+            vec![
+                mk("c-1", "c-lang", 1, QType::Single, false),
+                mk("c-2", "c-lang", 2, QType::Qa, true),
+                mk("os-1", "os", 1, QType::Qa, false),
+                mk("os-2", "os", 3, QType::Single, false),
+            ],
+            vec![cat("c-lang"), cat("os")],
+        )
+    }
+
+    fn fixture() -> Scheduler {
+        Scheduler::new(fixture_catalog(), UserState::default())
+    }
+
+    fn ids(s: &Scheduler, picked: &[usize]) -> Vec<String> {
+        picked.iter().map(|&i| s.catalog().get(i).unwrap().id.clone()).collect()
+    }
+
+    #[test]
+    fn empty_filter_selects_everything() {
+        let s = fixture();
+        assert_eq!(s.select(&Filter::default()).len(), 4);
+    }
+
+    #[test]
+    fn filters_by_category() {
+        let s = fixture();
+        let f = Filter { cats: vec!["c-lang".into()], ..Default::default() };
+        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1", "c-2"]);
+    }
+
+    #[test]
+    fn filters_by_level_as_or_within_dimension() {
+        let s = fixture();
+        let f = Filter { levels: vec![1, 3], ..Default::default() };
+        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1", "os-1", "os-2"]);
+    }
+
+    #[test]
+    fn filters_by_type() {
+        let s = fixture();
+        let f = Filter { types: vec![QType::Single], ..Default::default() };
+        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1", "os-2"]);
+    }
+
+    #[test]
+    fn dimensions_combine_as_and() {
+        let s = fixture();
+        let f = Filter {
+            cats: vec!["c-lang".into()],
+            levels: vec![1],
+            ..Default::default()
+        };
+        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1"]);
+    }
+
+    #[test]
+    fn keyword_matches_question_and_answer_case_insensitively() {
+        let s = fixture();
+        let f = Filter { keyword: "题干 OS-1".into(), ..Default::default() };
+        assert_eq!(ids(&s, &s.select(&f)), vec!["os-1"]);
+    }
+
+    #[test]
+    fn scope_fav_selects_only_favourites() {
+        let mut st = UserState::default();
+        st.q.insert("os-2".into(), Progress { fav: true, ..Default::default() });
+        let s = Scheduler::new(fixture_catalog(), st);
+        let f = Filter { scopes: vec![Scope::Fav], ..Default::default() };
+        assert_eq!(ids(&s, &s.select(&f)), vec!["os-2"]);
+    }
+
+    #[test]
+    fn scope_unmastered_excludes_box3() {
+        let mut st = UserState::default();
+        st.q.insert("c-1".into(), Progress { bx: 3, ..Default::default() });
+        let s = Scheduler::new(fixture_catalog(), st);
+        let f = Filter { scopes: vec![Scope::Unmastered], ..Default::default() };
+        assert_eq!(ids(&s, &s.select(&f)), vec!["c-2", "os-1", "os-2"]);
+    }
+
+    #[test]
+    fn scope_resume_risk_selects_flagged() {
+        let s = fixture();
+        let f = Filter { scopes: vec![Scope::ResumeRisk], ..Default::default() };
+        assert_eq!(ids(&s, &s.select(&f)), vec!["c-2"]);
+    }
+
+    #[test]
+    fn no_match_returns_empty_without_panic() {
+        let s = fixture();
+        let f = Filter { cats: vec!["nope".into()], ..Default::default() };
+        assert!(s.select(&f).is_empty());
+    }
+
+    #[test]
+    fn ordered_mode_follows_bank_declaration_order() {
+        let mut s = fixture();
+        let f = Filter { mode: Mode::Ordered, ..Default::default() };
+        s.build(&f);
+        assert_eq!(s.pool_ids(), vec!["c-1", "c-2", "os-1", "os-2"]);
+    }
+
+    #[test]
+    fn ordered_mode_is_reproducible() {
+        let f = Filter { mode: Mode::Ordered, ..Default::default() };
+        let mut a = fixture(); a.build(&f);
+        let mut b = fixture(); b.build(&f);
+        assert_eq!(a.pool_ids(), b.pool_ids());
+    }
+
+    #[test]
+    fn smart_mode_puts_lower_box_first() {
+        let mut st = UserState::default();
+        st.q.insert("c-1".into(), Progress { bx: 3, last: 1000, ..Default::default() });
+        st.q.insert("c-2".into(), Progress { bx: 2, last: 1000, ..Default::default() });
+        st.q.insert("os-1".into(), Progress { bx: 1, last: 1000, ..Default::default() });
+        // os-2 无记录 => bx 0
+        let mut s = Scheduler::new(fixture_catalog(), st);
+        s.build(&Filter { mode: Mode::Smart, ..Default::default() });
+        assert_eq!(s.pool_ids(), vec!["os-2", "os-1", "c-2", "c-1"]);
+    }
+
+    #[test]
+    fn smart_mode_breaks_box_ties_by_last_then_id() {
+        let mut st = UserState::default();
+        // 同盒、同紧急度、同时间 => 只能靠 id 兜底，保证全序。
+        // 注意 c-2 在 fixture 里是 resume 高危题（urgency 恒为 0），
+        // 所以这里让四题都 wrong > right，把 urgency 位拉平，才真正测到 id 兜底。
+        for id in ["c-1", "c-2", "os-1", "os-2"] {
+            st.q.insert(id.into(), Progress { bx: 1, right: 0, wrong: 1, last: 500, ..Default::default() });
+        }
+        let mut s = Scheduler::new(fixture_catalog(), st);
+        s.build(&Filter { mode: Mode::Smart, ..Default::default() });
+        assert_eq!(s.pool_ids(), vec!["c-1", "c-2", "os-1", "os-2"], "同键时按 id 字典序");
+    }
+
+    #[test]
+    fn smart_mode_is_reproducible_across_rebuilds() {
+        let mut st = UserState::default();
+        st.q.insert("c-1".into(), Progress { bx: 1, right: 1, wrong: 4, last: 900, ..Default::default() });
+        st.q.insert("os-1".into(), Progress { bx: 1, right: 5, wrong: 0, last: 900, ..Default::default() });
+        let f = Filter { mode: Mode::Smart, ..Default::default() };
+        let mut a = Scheduler::new(fixture_catalog(), st.clone()); a.build(&f);
+        let mut b = Scheduler::new(fixture_catalog(), st.clone()); b.build(&f);
+        assert_eq!(a.pool_ids(), b.pool_ids(), "Smart 必须无随机、可复现");
+        // 错多于对的排在同盒里更前面
+        let ids = a.pool_ids();
+        let pc = ids.iter().position(|x| x == "c-1").unwrap();
+        let po = ids.iter().position(|x| x == "os-1").unwrap();
+        assert!(pc < po, "错多于对的题应加急");
+    }
+
+    #[test]
+    fn random_mode_same_seed_same_order() {
+        let f = Filter { mode: Mode::Random, seed: Some(42), ..Default::default() };
+        let mut a = fixture(); a.build(&f);
+        let mut b = fixture(); b.build(&f);
+        assert_eq!(a.pool_ids(), b.pool_ids(), "同 seed 必须同顺序");
+    }
+
+    #[test]
+    fn random_mode_different_seed_usually_differs() {
+        let mut a = fixture();
+        a.build(&Filter { mode: Mode::Random, seed: Some(1), ..Default::default() });
+        let mut b = fixture();
+        b.build(&Filter { mode: Mode::Random, seed: Some(999), ..Default::default() });
+        assert_ne!(a.pool_ids(), b.pool_ids());
+    }
+
+    #[test]
+    fn random_mode_without_seed_still_deterministic() {
+        // seed 缺失时回退到固定值，绝不能读系统熵源
+        let f = Filter { mode: Mode::Random, seed: None, ..Default::default() };
+        let mut a = fixture(); a.build(&f);
+        let mut b = fixture(); b.build(&f);
+        assert_eq!(a.pool_ids(), b.pool_ids());
+    }
+
+    #[test]
+    fn build_returns_pool_size_and_resets_position() {
+        let mut s = fixture();
+        assert_eq!(s.build(&Filter::default()), 4);
+        assert_eq!(s.position(), 0);
+    }
+
+    #[test]
+    fn navigation_walks_pool_and_stops_at_end() {
+        let mut s = fixture();
+        s.build(&Filter { mode: Mode::Ordered, ..Default::default() });
+        assert_eq!(s.current().unwrap().id, "c-1");
+        s.advance();
+        assert_eq!(s.current().unwrap().id, "c-2");
+        assert_eq!(s.position(), 1);
+        s.advance(); s.advance();
+        assert_eq!(s.current().unwrap().id, "os-2");
+        s.advance();
+        assert!(s.is_finished(), "走完 4 题应进入完成态");
+        assert!(s.current().is_none());
+        s.advance(); // 已完成再前进不该越界
+        assert_eq!(s.position(), 4);
+    }
+
+    #[test]
+    fn back_returns_false_at_first_question() {
+        let mut s = fixture();
+        s.build(&Filter { mode: Mode::Ordered, ..Default::default() });
+        assert!(!s.back(), "首题回退应返回 false");
+        s.advance();
+        assert!(s.back());
+        assert_eq!(s.current().unwrap().id, "c-1");
+    }
+
+    #[test]
+    fn goto_clamps_out_of_range() {
+        let mut s = fixture();
+        s.build(&Filter::default());
+        s.goto(999);
+        assert_eq!(s.position(), 4, "越界 goto 应夹到完成态而不是 panic");
+        s.goto(2);
+        assert_eq!(s.position(), 2);
+    }
+
+    #[test]
+    fn empty_pool_reports_finished_without_panic() {
+        let mut s = fixture();
+        assert_eq!(s.build(&Filter { cats: vec!["nope".into()], ..Default::default() }), 0);
+        assert!(s.is_finished());
+        assert!(s.current().is_none());
+        assert!(!s.back());
+    }
+
+    #[test]
+    fn restore_deck_resumes_exact_position() {
+        let mut s = fixture();
+        s.build(&Filter { mode: Mode::Random, seed: Some(7), ..Default::default() });
+        s.advance();
+        s.advance();
+        let expected_ids = s.pool_ids();
+        let json = serde_json::to_string(s.state()).unwrap();
+
+        // 模拟「关掉再打开」
+        let restored: UserState = serde_json::from_str(&json).unwrap();
+        let mut s2 = Scheduler::new(fixture_catalog(), restored);
+        assert!(s2.restore_deck(), "题库未变，应恢复成功");
+        assert_eq!(s2.position(), 2, "应停在关掉时那一题");
+        assert_eq!(s2.pool_ids(), expected_ids, "卷的顺序必须一模一样");
+    }
+
+    #[test]
+    fn restore_deck_rejects_deck_from_changed_bank() {
+        let mut s = fixture();
+        s.build(&Filter::default());
+        s.advance();
+        let json = serde_json::to_string(s.state()).unwrap();
+
+        // 题库变了：多一道题
+        let mut all: Vec<Question> = fixture_catalog().all().to_vec();
+        all.push(mk("os-3", "os", 1, QType::Qa, false));
+        let bigger = Catalog::new(all, vec![cat("c-lang"), cat("os")]);
+
+        let restored: UserState = serde_json::from_str(&json).unwrap();
+        let mut s2 = Scheduler::new(bigger, restored);
+        assert!(!s2.restore_deck(), "题库变了应拒绝旧卷");
+    }
+
+    #[test]
+    fn restore_deck_returns_false_when_no_deck_saved() {
+        let mut s = fixture();
+        assert!(!s.restore_deck());
+    }
+
+    #[test]
+    fn restore_deck_drops_ids_no_longer_in_bank() {
+        // 卷里有已删除的题：整卷作废，不能静默跳过导致 pos 错位
+        let mut st = UserState::default();
+        st.deck = Some(Deck {
+            ids: vec!["c-1".into(), "deleted-1".into(), "os-1".into()],
+            pos: 1,
+            filter: Filter::default(),
+            seed: 0,
+            bank_hash: fixture_catalog().bank_hash(),
+        });
+        let mut s = Scheduler::new(fixture_catalog(), st);
+        assert!(!s.restore_deck(), "卷里含不存在的 id，应作废");
+    }
+
+    #[test]
+    fn judge_single_choice() {
+        let s = fixture(); // c-1 是 single，答案 [0]
+        let v = s.judge("c-1", &[0]);
+        assert!(v.correct);
+        assert_eq!(v.expected, vec![0]);
+        assert!(!s.judge("c-1", &[1]).correct);
+    }
+
+    #[test]
+    fn judge_multi_choice_ignores_pick_order() {
+        let mut all: Vec<Question> = fixture_catalog().all().to_vec();
+        all.push(Question {
+            id: "m-1".into(), cat: "os".into(), q: "多选".into(), a: "答".into(),
+            qtype: QType::Multi, options: vec!["A".into(), "B".into(), "C".into()],
+            answer: Answer::Indices(vec![0, 2]), level: 1, tags: vec![],
+            resume: false, followup: vec![],
+        });
+        let s = Scheduler::new(Catalog::new(all, vec![cat("c-lang"), cat("os")]), UserState::default());
+        assert!(s.judge("m-1", &[2, 0]).correct, "选项顺序不影响判定");
+        assert!(!s.judge("m-1", &[0]).correct, "少选算错");
+        assert!(!s.judge("m-1", &[0, 1, 2]).correct, "多选算错");
+    }
+
+    #[test]
+    fn judge_qa_is_always_correct() {
+        let s = fixture(); // os-1 是 qa
+        assert!(s.judge("os-1", &[]).correct, "简答题没有客观对错，交给用户自评");
+    }
+
+    #[test]
+    fn judge_unknown_id_is_not_correct() {
+        let s = fixture();
+        assert!(!s.judge("missing", &[0]).correct);
+    }
+
+    #[test]
+    fn record_know_promotes_box_capped_at_three() {
+        let mut s = fixture();
+        for expected in [1u8, 2, 3, 3] {
+            s.record("c-1", Grade::Know);
+            assert_eq!(s.state().q.get("c-1").unwrap().bx, expected);
+        }
+        let p = s.state().q.get("c-1").unwrap();
+        assert_eq!(p.right, 4);
+        assert_eq!(p.wrong, 0);
+        assert_eq!(p.seen, 4);
+        assert!(p.last > 0, "last 应写入时间戳");
+    }
+
+    #[test]
+    fn record_fuzzy_floors_at_one_without_demoting() {
+        let mut s = fixture();
+        s.record("c-1", Grade::Fuzzy);
+        assert_eq!(s.state().q.get("c-1").unwrap().bx, 1, "0 盒提到 1 盒");
+
+        s.record("c-2", Grade::Know);
+        s.record("c-2", Grade::Know); // c-2 到 2 盒
+        s.record("c-2", Grade::Fuzzy);
+        let p = s.state().q.get("c-2").unwrap();
+        assert_eq!(p.bx, 2, "fuzzy 不降级（与 v1 行为一致，不是降回 1 盒）");
+        assert_eq!(p.wrong, 0, "fuzzy 不计 wrong");
+    }
+
+    #[test]
+    fn record_no_resets_box_and_marks_wrong_today() {
+        let mut s = fixture();
+        s.record("c-1", Grade::Know);
+        s.record("c-1", Grade::Know); // 到 2 盒
+        s.record("c-1", Grade::No);
+        let p = s.state().q.get("c-1").unwrap();
+        assert_eq!(p.bx, 1, "答错回 1 盒");
+        assert_eq!(p.wrong, 1);
+        let wrong = s.state().wrong_today.get(&today_key()).unwrap();
+        assert!(wrong.contains(&"c-1".to_string()), "应进今日错题本");
+    }
+
+    #[test]
+    fn record_bumps_daily_count_and_dedupes_wrong_list() {
+        let mut s = fixture();
+        s.record("c-1", Grade::No);
+        s.record("c-1", Grade::No);
+        assert_eq!(*s.state().days.get(&today_key()).unwrap(), 2, "每次作答都计入当日题量");
+        assert_eq!(s.state().wrong_today.get(&today_key()).unwrap().len(), 1, "错题本按 id 去重");
+    }
+
+    #[test]
+    fn toggle_fav_flips_and_reports() {
+        let mut s = fixture();
+        assert!(s.toggle_fav("c-1"));
+        assert!(s.state().q.get("c-1").unwrap().fav);
+        assert!(!s.toggle_fav("c-1"));
+    }
+
+    #[test]
+    fn distribution_counts_each_box() {
+        let mut st = UserState::default();
+        st.q.insert("c-1".into(), Progress { bx: 3, ..Default::default() });
+        st.q.insert("c-2".into(), Progress { bx: 1, ..Default::default() });
+        st.q.insert("os-1".into(), Progress { bx: 1, ..Default::default() });
+        let s = Scheduler::new(fixture_catalog(), st);
+        let pool = s.select(&Filter::default());
+        assert_eq!(s.distribution(&pool), [1, 2, 0, 1], "[未练, 生, 熟, 已掌握]");
+    }
+}
diff --git a/src-rust/stats.rs b/src-rust/stats.rs
new file mode 100644
index 0000000..6ad1c22
--- /dev/null
+++ b/src-rust/stats.rs
@@ -0,0 +1,297 @@
+use crate::catalog::Catalog;
+use crate::models::UserState;
+use crate::scheduler::today_key;
+use serde::Serialize;
+
+#[derive(Serialize, Clone, Debug)]
+pub struct OverallStats {
+    pub total: usize,
+    pub seen: usize,
+    pub mastered: usize,
+    pub accuracy: f64,
+    pub today: u32,
+    pub streak: u32,
+    pub boxes: [usize; 4],
+}
+
+pub fn overall(state: &UserState, catalog: &Catalog) -> OverallStats {
+    let mut boxes = [0usize; 4];
+    let (mut seen, mut right, mut wrong) = (0usize, 0u32, 0u32);
+
+    for q in catalog.all() {
+        let p = state.q.get(&q.id);
+        let bx = p.map(|p| p.bx.min(3)).unwrap_or(0) as usize;
+        boxes[bx] += 1;
+        if let Some(p) = p {
+            if p.seen > 0 {
+                seen += 1;
+            }
+            right += p.right;
+            wrong += p.wrong;
+        }
+    }
+
+    let answered = right + wrong;
+    OverallStats {
+        total: catalog.len(),
+        seen,
+        mastered: boxes[3],
+        accuracy: if answered == 0 { 0.0 } else { right as f64 / answered as f64 },
+        today: state.days.get(&today_key()).copied().unwrap_or(0),
+        streak: streak(state),
+        boxes,
+    }
+}
+
+/// 连续打卡天数（含今天；今天没刷则从昨天往前数），与 legacy/js/store.js:122 行为一致
+fn streak(state: &UserState) -> u32 {
+    let mut n = 0u32;
+    let mut offset: i64 = if state.days.contains_key(&today_key()) { 0 } else { 1 };
+    for _ in 0..400 {
+        let key = day_key_offset(offset);
+        if !state.days.contains_key(&key) {
+            break;
+        }
+        n += 1;
+        offset += 1;
+    }
+    n
+}
+
+/// 今天往前数 offset 天的 "YYYY-MM-DD"
+fn day_key_offset(offset: i64) -> String {
+    #[cfg(all(target_arch = "wasm32", not(test)))]
+    {
+        // 用毫秒做减法（对齐 native 分支）：set_date(get_date() - offset) 会让 u32 下溢，
+        // offset > 当月日号时会算出垃圾日期。get_full_year/get_month/get_date 仍是本地时区语义。
+        let ms = js_sys::Date::new_0().get_time() - (offset as f64) * 86_400_000.0;
+        let d = js_sys::Date::new(&wasm_bindgen::JsValue::from_f64(ms));
+        return format!("{:04}-{:02}-{:02}", d.get_full_year(), d.get_month() + 1, d.get_date());
+    }
+    #[cfg(not(all(target_arch = "wasm32", not(test))))]
+    {
+        let ms = crate::scheduler::now_ms() as i64 - offset * 86_400_000;
+        crate::scheduler::ymd_from_ms(ms.max(0) as u64)
+    }
+}
+
+#[derive(Serialize, Clone, Debug)]
+pub struct CategoryStats {
+    pub id: String,
+    pub name: String,
+    pub total: usize,
+    pub mastered: usize,
+    pub seen: usize,
+    pub accuracy: f64,
+}
+
+pub fn by_category(state: &UserState, catalog: &Catalog) -> Vec<CategoryStats> {
+    catalog
+        .cats()
+        .iter()
+        .map(|c| {
+            let idxs = catalog.by_cat(&c.id);
+            let (mut mastered, mut seen, mut right, mut wrong) = (0usize, 0usize, 0u32, 0u32);
+            for &i in idxs {
+                if let Some(q) = catalog.get(i) {
+                    if let Some(p) = state.q.get(&q.id) {
+                        if p.bx >= 3 {
+                            mastered += 1;
+                        }
+                        if p.seen > 0 {
+                            seen += 1;
+                        }
+                        right += p.right;
+                        wrong += p.wrong;
+                    }
+                }
+            }
+            let answered = right + wrong;
+            CategoryStats {
+                id: c.id.clone(),
+                name: c.name.clone(),
+                total: idxs.len(),
+                mastered,
+                seen,
+                accuracy: if answered == 0 { 0.0 } else { right as f64 / answered as f64 },
+            }
+        })
+        .collect()
+}
+
+/// 掌握率最低的 n 个分类。同率按 id 兜底，保证榜单稳定。
+pub fn weakest(state: &UserState, catalog: &Catalog, n: usize) -> Vec<CategoryStats> {
+    let mut v: Vec<CategoryStats> =
+        by_category(state, catalog).into_iter().filter(|c| c.total > 0).collect();
+    v.sort_by(|a, b| {
+        let ra = a.mastered as f64 / a.total as f64;
+        let rb = b.mastered as f64 / b.total as f64;
+        ra.partial_cmp(&rb).unwrap_or(std::cmp::Ordering::Equal).then_with(|| a.id.cmp(&b.id))
+    });
+    v.truncate(n);
+    v
+}
+
+#[derive(Serialize, Clone, Debug)]
+pub struct HeatCell {
+    pub date: String,
+    pub count: u32,
+}
+
+/// 最近 days 天，按时间升序，最后一格是今天。没刷的日子补 0。
+pub fn heatmap(state: &UserState, days: usize) -> Vec<HeatCell> {
+    (0..days)
+        .rev()
+        .map(|back| {
+            let date = day_key_offset(back as i64);
+            let count = state.days.get(&date).copied().unwrap_or(0);
+            HeatCell { date, count }
+        })
+        .collect()
+}
+
+#[derive(Serialize, Clone, Debug)]
+pub struct RiskStats {
+    pub total: usize,
+    pub mastered: usize,
+    pub weak_ids: Vec<String>,
+}
+
+/// 简历高危题的掌握情况。weak_ids 按题库顺序，未掌握的排前面由 UI 决定展示几条。
+pub fn resume_risk(state: &UserState, catalog: &Catalog) -> RiskStats {
+    let mut total = 0usize;
+    let mut mastered = 0usize;
+    let mut weak_ids = Vec::new();
+    for q in catalog.all().iter().filter(|q| q.resume) {
+        total += 1;
+        let bx = state.q.get(&q.id).map(|p| p.bx).unwrap_or(0);
+        if bx >= 3 {
+            mastered += 1;
+        } else {
+            weak_ids.push(q.id.clone());
+        }
+    }
+    RiskStats { total, mastered, weak_ids }
+}
+
+#[cfg(test)]
+mod tests {
+    use super::*;
+    use crate::catalog::Catalog;
+    use crate::models::*;
+
+    fn mk(id: &str, cat: &str, resume: bool) -> Question {
+        Question {
+            id: id.into(),
+            cat: cat.into(),
+            q: "题".into(),
+            a: "答".into(),
+            qtype: QType::Qa,
+            options: vec![],
+            answer: Answer::None,
+            level: 1,
+            tags: vec![],
+            resume,
+            followup: vec![],
+        }
+    }
+
+    fn cat(id: &str, name: &str) -> CategoryMeta {
+        CategoryMeta { id: id.into(), name: name.into(), desc: String::new() }
+    }
+
+    fn fx() -> (Catalog, UserState) {
+        let c = Catalog::new(
+            vec![
+                mk("c-1", "c-lang", true),
+                mk("c-2", "c-lang", false),
+                mk("os-1", "os", false),
+                mk("os-2", "os", false),
+            ],
+            vec![cat("c-lang", "C 语言核心"), cat("os", "操作系统原理")],
+        );
+        let mut st = UserState::default();
+        st.q.insert(
+            "c-1".into(),
+            Progress { bx: 3, right: 3, wrong: 1, seen: 4, last: 1000, fav: false },
+        );
+        st.q.insert(
+            "c-2".into(),
+            Progress { bx: 1, right: 0, wrong: 2, seen: 2, last: 1000, fav: false },
+        );
+        st.q.insert(
+            "os-1".into(),
+            Progress { bx: 3, right: 1, wrong: 0, seen: 1, last: 1000, fav: false },
+        );
+        (c, st)
+    }
+
+    #[test]
+    fn overall_counts_mastery_and_accuracy() {
+        let (c, st) = fx();
+        let o = overall(&st, &c);
+        assert_eq!(o.total, 4);
+        assert_eq!(o.seen, 3, "os-2 从未作答");
+        assert_eq!(o.mastered, 2, "c-1 与 os-1 在 3 盒");
+        // right=4, wrong=3 => 4/7
+        assert!((o.accuracy - 4.0 / 7.0).abs() < 1e-9);
+        assert_eq!(o.boxes, [1, 1, 0, 2], "[未练, 生, 熟, 已掌握]");
+    }
+
+    #[test]
+    fn overall_on_empty_state_does_not_divide_by_zero() {
+        let c = Catalog::new(vec![mk("a-1", "a", false)], vec![cat("a", "A")]);
+        let o = overall(&UserState::default(), &c);
+        assert_eq!(o.seen, 0);
+        assert_eq!(o.accuracy, 0.0, "无作答时正确率为 0，不是 NaN");
+    }
+
+    #[test]
+    fn by_category_follows_declaration_order() {
+        let (c, st) = fx();
+        let v = by_category(&st, &c);
+        assert_eq!(v.iter().map(|x| x.id.as_str()).collect::<Vec<_>>(), vec!["c-lang", "os"]);
+        assert_eq!(v[0].name, "C 语言核心");
+        assert_eq!(v[0].total, 2);
+        assert_eq!(v[0].mastered, 1);
+    }
+
+    #[test]
+    fn weakest_ranks_by_mastery_rate_then_id() {
+        let (c, st) = fx();
+        let w = weakest(&st, &c, 2);
+        // c-lang 掌握 1/2 = 0.5, os 掌握 1/2 = 0.5 => 同率按 id 兜底，保证结果稳定
+        assert_eq!(w.len(), 2);
+        assert_eq!(w[0].id, "c-lang");
+    }
+
+    #[test]
+    fn weakest_skips_empty_categories() {
+        let c =
+            Catalog::new(vec![mk("a-1", "a", false)], vec![cat("a", "A"), cat("empty", "空分类")]);
+        let w = weakest(&UserState::default(), &c, 5);
+        assert!(w.iter().all(|x| x.id != "empty"), "没题的分类不该出现在最薄弱榜里");
+    }
+
+    #[test]
+    fn heatmap_returns_requested_span_with_zeros_filled() {
+        let mut st = UserState::default();
+        st.days.insert(crate::scheduler::today_key(), 7);
+        let h = heatmap(&st, 30);
+        assert_eq!(h.len(), 30);
+        assert_eq!(h.last().unwrap().count, 7, "最后一格是今天");
+        assert_eq!(h.first().unwrap().count, 0, "没刷的日子补 0");
+    }
+
+    #[test]
+    fn resume_risk_reports_unmastered_flagged_questions() {
+        let mut st = UserState::default();
+        // c-1 是 resume 题，只到 1 盒
+        st.q.insert("c-1".into(), Progress { bx: 1, ..Default::default() });
+        let (c, _) = fx();
+        let r = resume_risk(&st, &c);
+        assert_eq!(r.total, 1, "题库里只有 c-1 打了 resume 标记");
+        assert_eq!(r.mastered, 0);
+        assert_eq!(r.weak_ids, vec!["c-1"]);
+    }
+}
diff --git a/src-tauri/Cargo.toml b/src-tauri/Cargo.toml
new file mode 100644
index 0000000..1b0aaec
--- /dev/null
+++ b/src-tauri/Cargo.toml
@@ -0,0 +1,10 @@
+[package]
+name = "embq-desktop"
+version = "2.0.0"
+edition = "2021"
+
+[build-dependencies]
+tauri-build = { version = "2", features = [] }
+
+[dependencies]
+tauri = { version = "2", features = [] }
diff --git a/src-tauri/build.rs b/src-tauri/build.rs
new file mode 100644
index 0000000..d860e1e
--- /dev/null
+++ b/src-tauri/build.rs
@@ -0,0 +1,3 @@
+fn main() {
+    tauri_build::build()
+}
diff --git a/src-tauri/icons/128x128.png b/src-tauri/icons/128x128.png
new file mode 100644
index 0000000..df33a82
Binary files /dev/null and b/src-tauri/icons/128x128.png differ
diff --git a/src-tauri/icons/256x256.png b/src-tauri/icons/256x256.png
new file mode 100644
index 0000000..a7b8ff0
Binary files /dev/null and b/src-tauri/icons/256x256.png differ
diff --git a/src-tauri/icons/32x32.png b/src-tauri/icons/32x32.png
new file mode 100644
index 0000000..08fdb9f
Binary files /dev/null and b/src-tauri/icons/32x32.png differ
diff --git a/src-tauri/icons/512x512.png b/src-tauri/icons/512x512.png
new file mode 100644
index 0000000..9864469
Binary files /dev/null and b/src-tauri/icons/512x512.png differ
diff --git a/src-tauri/icons/icon.ico b/src-tauri/icons/icon.ico
new file mode 100644
index 0000000..eb5a6bc
Binary files /dev/null and b/src-tauri/icons/icon.ico differ
diff --git a/src-tauri/icons/icon.png b/src-tauri/icons/icon.png
new file mode 100644
index 0000000..9864469
Binary files /dev/null and b/src-tauri/icons/icon.png differ
diff --git a/src-tauri/src/main.rs b/src-tauri/src/main.rs
new file mode 100644
index 0000000..809117e
--- /dev/null
+++ b/src-tauri/src/main.rs
@@ -0,0 +1,8 @@
+// release 下不弹控制台窗口
+#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
+
+fn main() {
+    tauri::Builder::default()
+        .run(tauri::generate_context!())
+        .expect("启动 Tauri 应用失败");
+}
diff --git a/src-tauri/tauri.conf.json b/src-tauri/tauri.conf.json
new file mode 100644
index 0000000..d71945a
--- /dev/null
+++ b/src-tauri/tauri.conf.json
@@ -0,0 +1,37 @@
+{
+  "$schema": "https://schema.tauri.app/config/2",
+  "productName": "嵌入式面试题库",
+  "version": "2.0.0",
+  "identifier": "com.embedded.quiz",
+  "build": {
+    "frontendDist": "../dist",
+    "devUrl": "http://localhost:5173",
+    "beforeDevCommand": "npm run dev",
+    "beforeBuildCommand": "npm run build"
+  },
+  "app": {
+    "windows": [
+      {
+        "title": "嵌入式面试题库",
+        "width": 900,
+        "height": 700,
+        "resizable": true,
+        "center": true
+      }
+    ],
+    "security": {
+      "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
+    }
+  },
+  "bundle": {
+    "active": true,
+    "targets": ["nsis"],
+    "icon": ["icons/icon.ico", "icons/icon-512.png"],
+    "windows": {
+      "certificateThumbprint": null,
+      "nsis": {
+        "installMode": "currentUser"
+      }
+    }
+  }
+}
diff --git a/src/core/markdown.test.ts b/src/core/markdown.test.ts
new file mode 100644
index 0000000..3c3eb93
--- /dev/null
+++ b/src/core/markdown.test.ts
@@ -0,0 +1,44 @@
+import { describe, expect, it } from 'vitest';
+import { esc, renderMD } from './markdown';
+
+describe('markdown', () => {
+  it('escapes html before anything else', () => {
+    expect(esc('<script>alert(1)</script>')).not.toContain('<script>');
+    expect(renderMD('<img onerror=x>')).not.toContain('<img onerror');
+  });
+
+  it('renders fenced code blocks', () => {
+    const out = renderMD('```c\nint x = 1;\n```');
+    expect(out).toContain('<pre');
+    expect(out).toContain('int x = 1;');
+  });
+
+  it('renders inline code', () => {
+    expect(renderMD('用 `volatile` 修饰')).toContain('<code>volatile</code>');
+  });
+
+  it('renders tables', () => {
+    const out = renderMD('| a | b |\n|---|---|\n| 1 | 2 |');
+    expect(out).toContain('<table');
+    expect(out).toContain('<td');
+  });
+
+  it('renders blockquotes', () => {
+    expect(renderMD('> 注意这里')).toContain('<blockquote');
+  });
+
+  it('renders bold and preserves chinese punctuation', () => {
+    const out = renderMD('**重点**：不要漏掉');
+    expect(out).toContain('<strong>重点</strong>');
+    expect(out).toContain('：');
+  });
+
+  it('keeps backslashes in code intact', () => {
+    expect(renderMD('`C:\\\\path`')).toContain('C:\\\\path');
+  });
+
+  it('does not throw on empty or undefined-ish input', () => {
+    expect(renderMD('')).toBe('');
+    expect(() => renderMD('\n\n\n')).not.toThrow();
+  });
+});
diff --git a/src/core/markdown.ts b/src/core/markdown.ts
new file mode 100644
index 0000000..6cdfbea
--- /dev/null
+++ b/src/core/markdown.ts
@@ -0,0 +1,122 @@
+export function esc(s: string): string {
+  return String(s)
+    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
+    .replace(/"/g, '&quot;');
+}
+
+function inline(s: string): string {
+  return esc(s)
+    .replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`)
+    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
+    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
+      (_m, t: string, u: string) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
+}
+
+/* 表格：连续的 | 行 → <table>，第二行是分隔线则首行为表头 */
+function tableHTML(rows: string[]): string {
+  const isSep = (r: string): boolean => r.replace(/[|\s:\-]/g, '') === '';
+  const parsed = rows.map((r) =>
+    r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => inline(c.trim())));
+  let html = '<div class="tblwrap"><table>';
+  let start = 0;
+  if (rows.length > 1 && isSep(rows[1]!)) {
+    html += '<thead><tr>' + parsed[0]!.map((c) => `<th>${c}</th>`).join('') + '</tr></thead>';
+    start = 2;
+  }
+  html += '<tbody>';
+  for (let r = start; r < rows.length; r++) {
+    if (isSep(rows[r]!)) continue;
+    html += '<tr>' + parsed[r]!.map((c) => `<td>${c}</td>`).join('') + '</tr>';
+  }
+  return html + '</tbody></table></div>';
+}
+
+/* 引用块：> 行（去掉前缀后按空行分段，支持段内列表） */
+function quoteHTML(qlines: string[]): string {
+  let html = '';
+  let para: string[] = [];
+  let list: string[] = [];
+  const fp = (): void => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
+  const fl = (): void => {
+    if (list.length) {
+      html += '<ul>' + list.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>';
+      list = [];
+    }
+  };
+  for (const raw of qlines) {
+    const ln = raw.trim();
+    if (!ln) { fp(); fl(); continue; }
+    if (/^[-*]\s+/.test(ln)) { fp(); list.push(ln.replace(/^[-*]\s+/, '')); continue; }
+    fl(); para.push(ln);
+  }
+  fp(); fl();
+  return `<blockquote>${html}</blockquote>`;
+}
+
+const CODE_LANGS =
+  /^(?:c|cpp|c\+\+|c#|python|py|bash|sh|asm|arm|json|html|xml|css|js|javascript|ts|typescript|rust|go|make|makefile|cmake|txt|text|diff|sql|verilog|vhdl|yaml|yml)\n/i;
+
+export function renderMD(text: string): string {
+  const src = String(text || '');
+  const out: string[] = [];
+  const blocks = src.split(/```/);
+
+  for (let b = 0; b < blocks.length; b++) {
+    if (b % 2 === 1) {
+      // 代码块：首行可能是语言名
+      const code = blocks[b]!.replace(CODE_LANGS, '').replace(/\n$/, '');
+      out.push(`<pre><code>${esc(code)}</code></pre>`);
+      continue;
+    }
+    const lines = blocks[b]!.split('\n');
+    let para: string[] = [];
+    let list: string[] = [];
+    let table: string[] = [];
+    let quote: string[] = [];
+
+    const flushPara = (): void => {
+      if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
+    };
+    const flushList = (): void => {
+      if (list.length) {
+        out.push('<ul>' + list.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>');
+        list = [];
+      }
+    };
+    const flushTable = (): void => {
+      if (table.length) { out.push(tableHTML(table)); table = []; }
+    };
+    const flushQuote = (): void => {
+      if (quote.length) { out.push(quoteHTML(quote)); quote = []; }
+    };
+    const flushAll = (): void => { flushPara(); flushList(); flushTable(); flushQuote(); };
+
+    for (const raw of lines) {
+      const ln = raw.trim();
+      if (!ln) { flushAll(); continue; }
+      if (/^\|/.test(ln)) { flushPara(); flushList(); flushQuote(); table.push(ln); continue; }
+      if (/^>/.test(ln)) {
+        flushPara(); flushList(); flushTable(); quote.push(ln.replace(/^>\s?/, '')); continue;
+      }
+      if (/^[-*]\s+/.test(ln)) {
+        flushPara(); flushTable(); flushQuote(); list.push(ln.replace(/^[-*]\s+/, '')); continue;
+      }
+      if (/^\d+[.)]\s+/.test(ln)) {
+        /* 编号行独立成段（保留原编号，悬挂缩进），避免多条编号被拼进同一段 */
+        flushAll();
+        out.push(`<p class="oli">${inline(ln)}</p>`);
+        continue;
+      }
+      flushList(); flushTable(); flushQuote();
+      para.push(ln);
+    }
+    flushAll();
+  }
+  return out.join('');
+}
+
+// 保留 v1 的测试钩子
+declare global {
+  interface Window { __renderMD?: (t: string) => string }
+}
+if (typeof window !== 'undefined') window.__renderMD = renderMD;
diff --git a/src/core/store.test.ts b/src/core/store.test.ts
new file mode 100644
index 0000000..4ca285a
--- /dev/null
+++ b/src/core/store.test.ts
@@ -0,0 +1,86 @@
+import { beforeEach, describe, expect, it, vi } from 'vitest';
+import { flushNow, loadState, resetState, saveState, scheduleSave } from './store';
+
+const SAMPLE = JSON.stringify({ version: 2, q: { 'c-1': { box: 2 } } });
+
+describe('store', () => {
+  beforeEach(async () => {
+    localStorage.clear();
+    await resetState();
+  });
+
+  it('returns null on a fresh install', async () => {
+    expect(await loadState()).toBeNull();
+  });
+
+  it('round-trips through IndexedDB', async () => {
+    await saveState(SAMPLE);
+    expect(await loadState()).toBe(SAMPLE);
+  });
+
+  it('mirrors every write to localStorage as a snapshot', async () => {
+    await saveState(SAMPLE);
+    expect(localStorage.getItem('embq.v2')).toBe(SAMPLE);
+  });
+
+  it('falls back to the v2 localStorage snapshot when IndexedDB is empty', async () => {
+    localStorage.setItem('embq.v2', SAMPLE);
+    expect(await loadState()).toBe(SAMPLE);
+  });
+
+  it('migrates a v1 localStorage archive when nothing else exists', async () => {
+    const v1 = JSON.stringify({
+      version: 1,
+      q: { 'c-1': { box: 3, right: 2, wrong: 0, seen: 2, last: 111, fav: true } },
+      days: { '2026-07-28': 5 },
+      wrongToday: {},
+      settings: { theme: 'dark', oral: false, oralSeconds: 60 },
+    });
+    localStorage.setItem('embq.v1', v1);
+
+    const loaded = await loadState();
+    expect(loaded).not.toBeNull();
+    const parsed = JSON.parse(loaded!);
+    expect(parsed.q['c-1'].box).toBe(3);
+    expect(parsed.settings.theme).toBe('dark');
+    expect(parsed.version).toBe(2);
+    // 旧 key 保留一个版本周期，不删
+    expect(localStorage.getItem('embq.v1')).toBe(v1);
+    // 迁移结果应已写进 IndexedDB
+    expect(await loadState()).toBe(loaded);
+  });
+
+  it('prefers IndexedDB over the localStorage snapshot', async () => {
+    await saveState(SAMPLE);
+    localStorage.setItem('embq.v2', JSON.stringify({ version: 2, q: { stale: true } }));
+    expect(await loadState()).toBe(SAMPLE);
+  });
+
+  it('debounces scheduleSave into a single write', async () => {
+    vi.useFakeTimers();
+    scheduleSave('{"a":1}');
+    scheduleSave('{"a":2}');
+    scheduleSave('{"a":3}');
+    await vi.advanceTimersByTimeAsync(400);
+    vi.useRealTimers();
+    expect(await loadState()).toBe('{"a":3}');
+  });
+
+  it('flushNow writes the pending value immediately', async () => {
+    vi.useFakeTimers();
+    scheduleSave(SAMPLE);
+    vi.useRealTimers();
+    await flushNow();
+    expect(await loadState()).toBe(SAMPLE);
+  });
+
+  it('survives an unavailable IndexedDB by using localStorage only', async () => {
+    const original = globalThis.indexedDB;
+    // @ts-expect-error 故意打坏
+    globalThis.indexedDB = undefined;
+    await saveState(SAMPLE);
+    expect(localStorage.getItem('embq.v2')).toBe(SAMPLE);
+    expect(await loadState()).toBe(SAMPLE);
+    globalThis.indexedDB = original;
+  });
+});
diff --git a/src/core/store.ts b/src/core/store.ts
new file mode 100644
index 0000000..ad9354c
--- /dev/null
+++ b/src/core/store.ts
@@ -0,0 +1,170 @@
+const DB_NAME = 'embq';
+const DB_VERSION = 2;
+const STORE = 'state';
+const KEY = 'current';
+const LS_V2 = 'embq.v2';
+const LS_V1 = 'embq.v1';
+const DEBOUNCE_MS = 300;
+
+function openDb(): Promise<IDBDatabase | null> {
+  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
+  return new Promise((resolve) => {
+    let req: IDBOpenDBRequest;
+    try {
+      req = indexedDB.open(DB_NAME, DB_VERSION);
+    } catch {
+      resolve(null);
+      return;
+    }
+    req.onupgradeneeded = () => {
+      const db = req.result;
+      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
+    };
+    req.onsuccess = () => resolve(req.result);
+    req.onerror = () => resolve(null);
+    req.onblocked = () => resolve(null);
+  });
+}
+
+function idbGet(db: IDBDatabase): Promise<string | null> {
+  return new Promise((resolve) => {
+    try {
+      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
+      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
+      req.onerror = () => resolve(null);
+    } catch {
+      resolve(null);
+    }
+  });
+}
+
+function idbPut(db: IDBDatabase, json: string): Promise<boolean> {
+  return new Promise((resolve) => {
+    try {
+      const tx = db.transaction(STORE, 'readwrite');
+      tx.objectStore(STORE).put(json, KEY);
+      tx.oncomplete = () => resolve(true);
+      tx.onerror = () => resolve(false);
+      tx.onabort = () => resolve(false);
+    } catch {
+      resolve(false);
+    }
+  });
+}
+
+/** v1 存档补齐 v2 新增字段。字段名本身两版一致，只是多了 deck。 */
+function upgradeV1(raw: string): string | null {
+  try {
+    const s = JSON.parse(raw) as Record<string, unknown>;
+    if (typeof s !== 'object' || s === null) return null;
+    s.version = 2;
+    s.q ??= {};
+    s.days ??= {};
+    s.wrongToday ??= {};
+    s.settings ??= { theme: 'auto', oral: false, oralSeconds: 60 };
+    s.deck ??= null;
+    return JSON.stringify(s);
+  } catch {
+    return null;
+  }
+}
+
+/**
+ * 读顺序：IndexedDB → localStorage v2 快照 → localStorage v1 旧存档（自动迁移）→ null
+ */
+export async function loadState(): Promise<string | null> {
+  const db = await openDb();
+  if (db) {
+    const hit = await idbGet(db);
+    if (hit) return hit;
+  }
+
+  const snapshot = safeGetItem(LS_V2);
+  if (snapshot) {
+    if (db) await idbPut(db, snapshot);
+    return snapshot;
+  }
+
+  const legacy = safeGetItem(LS_V1);
+  if (legacy) {
+    const upgraded = upgradeV1(legacy);
+    if (upgraded) {
+      // 旧 key 不删，保留一个版本周期作为回退
+      if (db) await idbPut(db, upgraded);
+      safeSetItem(LS_V2, upgraded);
+      return upgraded;
+    }
+  }
+
+  return null;
+}
+
+/** 双写：IndexedDB 为主，localStorage 留一份快照当救命绳 */
+export async function saveState(json: string): Promise<void> {
+  const db = await openDb();
+  if (db) await idbPut(db, json);
+  safeSetItem(LS_V2, json);
+}
+
+export async function resetState(): Promise<void> {
+  const db = await openDb();
+  if (db) {
+    await new Promise<void>((resolve) => {
+      try {
+        const tx = db.transaction(STORE, 'readwrite');
+        tx.objectStore(STORE).delete(KEY);
+        tx.oncomplete = () => resolve();
+        tx.onerror = () => resolve();
+      } catch {
+        resolve();
+      }
+    });
+  }
+  safeRemoveItem(LS_V2);
+}
+
+function safeGetItem(k: string): string | null {
+  try { return localStorage.getItem(k); } catch { return null; }
+}
+function safeSetItem(k: string, v: string): void {
+  try { localStorage.setItem(k, v); } catch { /* 配额满或被禁用，IndexedDB 还在 */ }
+}
+function safeRemoveItem(k: string): void {
+  try { localStorage.removeItem(k); } catch { /* ignore */ }
+}
+
+let timer: ReturnType<typeof setTimeout> | null = null;
+let pending: string | null = null;
+
+/** record() 后调用。300ms 内的连续调用合并成一次落盘。 */
+export function scheduleSave(json: string): void {
+  pending = json;
+  if (timer) clearTimeout(timer);
+  timer = setTimeout(() => { void flushNow(); }, DEBOUNCE_MS);
+}
+
+/** 立刻落盘待写值。切后台、关页面时调用。 */
+export async function flushNow(): Promise<void> {
+  if (timer) { clearTimeout(timer); timer = null; }
+  const json = pending;
+  pending = null;
+  if (json !== null) await saveState(json);
+}
+
+/**
+ * 装上「切后台 / 关页面就落盘」的钩子。
+ * v1 只有 debounce，切后台时那一档时间窗内的作答会丢 —— 这是进度丢失的第二个来源。
+ */
+export function installFlushHooks(getJson: () => string): void {
+  const flush = () => {
+    pending = getJson();
+    // pagehide/visibilitychange 里没时间等 Promise，先同步写快照保底
+    safeSetItem(LS_V2, pending);
+    void flushNow();
+  };
+  document.addEventListener('visibilitychange', () => {
+    if (document.visibilityState === 'hidden') flush();
+  });
+  window.addEventListener('pagehide', flush);
+  window.addEventListener('beforeunload', flush);
+}
diff --git a/src/main.ts b/src/main.ts
new file mode 100644
index 0000000..3ba8777
--- /dev/null
+++ b/src/main.ts
@@ -0,0 +1,114 @@
+// src/main.ts
+import init, { QuizEngine } from '../pkg/embq_core';
+import { installFlushHooks, loadState, scheduleSave } from './core/store';
+import { mountCard, renderCard } from './ui/card';
+import { mountFilter, refreshCount } from './ui/filter';
+import { renderStats } from './ui/stats';
+import { mountSettings, renderHealth } from './ui/settings';
+import { mountKeys } from './ui/keys';
+import { applyTheme, mountTheme } from './ui/theme';
+import { toast } from './ui/toast';
+
+export interface Filter {
+  cats: string[];
+  levels: number[];
+  types: string[];
+  scopes: string[];
+  mode: 'smart' | 'ordered' | 'random';
+  keyword: string;
+  seed: number | null;
+}
+
+export interface AppCtx {
+  engine: QuizEngine;
+  /** 取出状态交给 store 落盘（debounce 300ms） */
+  persist(): void;
+  /** 重绘当前视图 */
+  rerender(): void;
+}
+
+/** 默认：智能复习全库 */
+export function defaultFilter(): Filter {
+  return { cats: [], levels: [1, 2, 3], types: ['single', 'multi', 'bool', 'qa'],
+           scopes: [], mode: 'smart', keyword: '', seed: null };
+}
+
+export function newSeed(): number {
+  return Math.floor(Math.random() * 0xffffffff);
+}
+
+async function boot(): Promise<void> {
+  await init();
+
+  const [questions, categories, saved] = await Promise.all([
+    fetch('data/questions.json').then((r) => r.text()),
+    fetch('data/categories.json').then((r) => r.text()),
+    loadState(),
+  ]);
+
+  let engine: QuizEngine;
+  try {
+    engine = new QuizEngine(questions, categories, saved ?? undefined);
+  } catch (e) {
+    // 题库坏了没法降级，直接把错误摆给用户，别白屏
+    document.getElementById('cardWrap')!.innerHTML =
+      `<div class="empty"><h2>题库加载失败</h2><p>${String(e)}</p></div>`;
+    return;
+  }
+
+  // 有未刷完的卷就接着刷，否则智能复习全库
+  if (!engine.restore_deck()) {
+    engine.build(JSON.stringify(defaultFilter()));
+  }
+
+  const ctx: AppCtx = {
+    engine,
+    persist() {
+      scheduleSave(engine.state_json());
+      engine.mark_clean();
+    },
+    rerender() {
+      renderCard(ctx);
+      renderStats(ctx);
+    },
+  };
+
+  installFlushHooks(() => engine.state_json());
+  mount(ctx);
+}
+
+function mount(ctx: AppCtx): void {
+  applyTheme(ctx);
+  mountTheme(ctx);
+  mountCard(ctx);
+  mountFilter(ctx);
+  mountSettings(ctx);
+  mountKeys(ctx);
+  renderHealth(ctx);
+  mountViewTabs();
+  refreshCount(ctx);
+  ctx.rerender();
+}
+
+/** 练习 / 统计 两个 tab，复用 index.html:19-22 的 .tab 与 .view.is-active */
+function mountViewTabs(): void {
+  const tabs = document.getElementById('viewTabs');
+  tabs?.addEventListener('click', (e) => {
+    const btn = (e.target as HTMLElement).closest<HTMLElement>('.tab');
+    if (!btn) return;
+    switchView(btn.dataset.view === 'stats' ? 'stats' : 'practice');
+  });
+}
+
+export function switchView(view: 'practice' | 'stats'): void {
+  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
+    t.classList.toggle('is-active', t.dataset.view === view);
+  });
+  document.getElementById('view-practice')!.classList.toggle('is-active', view === 'practice');
+  document.getElementById('view-stats')!.classList.toggle('is-active', view === 'stats');
+}
+
+boot().catch((e) => {
+  console.error(e);
+  toast('启动失败，请刷新重试');
+});
diff --git a/src/test-setup.ts b/src/test-setup.ts
new file mode 100644
index 0000000..37b9389
--- /dev/null
+++ b/src/test-setup.ts
@@ -0,0 +1 @@
+import 'fake-indexeddb/auto';
diff --git a/src/ui/card.ts b/src/ui/card.ts
new file mode 100644
index 0000000..de3e502
--- /dev/null
+++ b/src/ui/card.ts
@@ -0,0 +1,405 @@
+// src/ui/card.ts
+import type { AppCtx, Filter } from '../main';
+import { defaultFilter, switchView } from '../main';
+import { esc, renderMD } from '../core/markdown';
+import { toast } from './toast';
+import { currentFilter } from './filter';
+
+/* ---------------- 题目与判卷 ---------------- */
+
+interface Question {
+  id: string; cat: string; q: string; a: string;
+  type: 'single' | 'multi' | 'bool' | 'qa';
+  options: string[]; level: number; tags: string[];
+  resume: boolean; followup: string[];
+}
+
+/** engine.judge() 的返回：expected / picked 都是引擎侧的选项下标 */
+interface Verdict { correct: boolean; expected: number[]; picked: number[] }
+
+/* ---------------- Step 1: 收拢卡片状态 ---------------- */
+
+interface CardState {
+  picked: number[];
+  revealed: boolean;
+  verdict: Verdict | null;
+  /** 口述模式已点「讲完了」——放进 state 才能随切题一起归零 */
+  oralDone: boolean;
+  oralLeft: number;
+  oralTimer: ReturnType<typeof setInterval> | null;
+}
+
+let state: CardState = blank();
+
+function blank(): CardState {
+  return { picked: [], revealed: false, verdict: null,
+           oralDone: false, oralLeft: 0, oralTimer: null };
+}
+
+/** 切题时整体重置 —— 这是消除状态污染的关键 */
+export function resetCardState(): void {
+  if (state.oralTimer) clearInterval(state.oralTimer);
+  state = blank();
+}
+
+/* ---------------- 存档读取 ---------------- */
+
+interface SavedProgress { box?: number; fav?: boolean }
+
+interface SavedState {
+  q?: Record<string, SavedProgress | undefined>;
+  settings?: { theme?: string; oral?: boolean; oralSeconds?: number };
+  deck?: { filter?: Filter };
+}
+
+/**
+ * engine 没有单题进度 / 设置的直接 getter，先从落盘状态里读。
+ * Task 20 给 Rust 侧补 oral() / oral_seconds() 后，isOral / oralSeconds 可改成直接调用。
+ */
+function saved(ctx: AppCtx): SavedState {
+  try {
+    return JSON.parse(ctx.engine.state_json()) as SavedState;
+  } catch {
+    return {};
+  }
+}
+
+function progressOf(st: SavedState, id: string): SavedProgress {
+  return st.q?.[id] ?? {};
+}
+
+function isOral(st: SavedState): boolean {
+  return st.settings?.oral === true;
+}
+
+function oralSeconds(st: SavedState): number {
+  return st.settings?.oralSeconds ?? 60;
+}
+
+/* ---------------- 文案常量（沿用 legacy/js/app.js:10-12） ---------------- */
+
+const LEVEL_NAME: Record<number, string> = { 1: '基础', 2: '进阶', 3: '深入' };
+const BOX_NAME: Record<number, string> = { 0: '未练', 1: '生', 2: '熟', 3: '已掌握' };
+const TYPE_NAME: Record<string, string> = {
+  single: '单选', multi: '多选', bool: '判断', qa: '简答',
+};
+
+/** 分类 id → 名称，只取一次 */
+let catNames: Map<string, string> | null = null;
+
+function catName(ctx: AppCtx, id: string): string {
+  if (!catNames) {
+    const list = (ctx.engine.cats() as { id: string; name: string }[] | null) ?? [];
+    catNames = new Map(list.map((c) => [c.id, c.name]));
+  }
+  return catNames.get(id) ?? id;
+}
+
+/* ---------------- Step 2: 空卷与完成态 ---------------- */
+
+function renderEmpty(ctx: AppCtx, wrap: HTMLElement): void {
+  document.getElementById('navbar')!.hidden = true;
+  const total = ctx.engine.count(JSON.stringify(defaultFilter())) as { total: number };
+  wrap.innerHTML =
+    '<div class="empty"><h2>还没有组卷</h2>' +
+    '<p>打开「筛选」挑分类和难度，或者直接开始智能复习——它会优先推没练过和练错的题。</p>' +
+    `<button class="btn btn-primary" id="quickStart">智能复习全部 ${total.total} 题</button></div>`;
+  document.getElementById('quickStart')?.addEventListener('click', () => {
+    ctx.engine.build(JSON.stringify(defaultFilter()));
+    resetCardState();
+    ctx.persist();
+    renderCard(ctx);
+  });
+}
+
+function renderDone(ctx: AppCtx, wrap: HTMLElement): void {
+  resetCardState();
+  document.getElementById('navbar')!.hidden = true;
+  document.getElementById('deckProgress')!.style.width = '100%';
+  const s = ctx.engine.stats() as { overall: { mastered: number; total: number; today: number } };
+  const o = s.overall;
+  const pct = o.total ? Math.round((o.mastered / o.total) * 100) : 0;
+  wrap.innerHTML =
+    '<div class="card"><div class="done">' +
+    `<div class="done-num">${ctx.engine.size()}</div>` +
+    '<h2>这一卷刷完了</h2>' +
+    `<p>全库掌握 ${o.mastered} / ${o.total} 题（${pct}%）　·　今日已练 ${o.today} 题</p>` +
+    '<div class="card-actions" style="justify-content:center">' +
+    '<button class="btn btn-primary" id="againAll">再刷一遍</button>' +
+    '<button class="btn" id="againWrong">只刷这卷里的错题</button>' +
+    '<button class="btn btn-ghost" id="toStats">看统计</button>' +
+    '</div></div></div>';
+
+  document.getElementById('againAll')?.addEventListener('click', () => {
+    ctx.engine.build(JSON.stringify(currentFilter(ctx)));
+    resetCardState(); ctx.persist(); renderCard(ctx);
+  });
+  document.getElementById('againWrong')?.addEventListener('click', () => {
+    const f = currentFilter(ctx);
+    if (!f.scopes.includes('wrong')) f.scopes.push('wrong');
+    if (!ctx.engine.build(JSON.stringify(f))) {
+      toast('这卷里没有错题，漂亮');
+      ctx.engine.build(JSON.stringify(currentFilter(ctx)));
+    }
+    resetCardState(); ctx.persist(); renderCard(ctx);
+  });
+  document.getElementById('toStats')?.addEventListener('click', () => switchView('stats'));
+}
+
+/* ---------------- Step 3: 题面渲染 ---------------- */
+
+/** 题头标签行（legacy/js/app.js:293-305） */
+function renderHead(ctx: AppCtx, st: SavedState, q: Question): string {
+  const box = progressOf(st, q.id).box ?? 0;
+  const bits = [
+    `<span class="tag tag-cat">${esc(catName(ctx, q.cat))}</span>`,
+    `<span class="tag tag-lv${q.level}">${LEVEL_NAME[q.level] ?? ''}</span>`,
+    `<span class="tag">${TYPE_NAME[q.type] ?? ''}</span>`,
+  ];
+  if (q.resume) bits.push('<span class="tag tag-resume">简历高危</span>');
+  for (const t of q.tags.slice(0, 3)) bits.push(`<span class="tag">${esc(t)}</span>`);
+  bits.push(`<span class="tag tag-box">${BOX_NAME[box] ?? ''} · ${esc(q.id)}</span>`);
+  return `<div class="card-head">${bits.join('')}</div>`;
+}
+
+/**
+ * 判断题的显示顺序与引擎下标不是一回事：
+ * 页面按 v1 先列「正确」，而 scheduler.rs:256 约定 1 = 对、0 = 错。
+ * 所以 data-idx 存引擎下标，显示位置单独排。
+ */
+const BOOL_OPTS: { label: string; idx: number }[] = [
+  { label: '正确', idx: 1 },
+  { label: '错误', idx: 0 },
+];
+
+/** 选项区（legacy/js/app.js:307-326）；简答题不出选项 */
+function renderChoices(q: Question): string {
+  if (q.type === 'qa') return '';
+  const opts = q.type === 'bool'
+    ? BOOL_OPTS
+    : q.options.map((label, idx) => ({ label, idx }));
+
+  const rows = opts.map((o, slot) => {
+    let cls = 'opt';
+    let mark = '';
+    if (state.revealed) {
+      const isRight = state.verdict?.expected.includes(o.idx) ?? false;
+      const isPicked = state.picked.includes(o.idx);
+      if (isRight) { cls += ' is-right'; mark = '正确答案'; }
+      else if (isPicked) { cls += ' is-wrong'; mark = '你选的'; }
+    } else if (state.picked.includes(o.idx)) {
+      cls += ' is-picked';
+    }
+    return `<button class="${cls}" data-idx="${o.idx}"${state.revealed ? ' disabled' : ''}>` +
+      `<span class="opt-key">${slot + 1}</span>` +
+      `<span>${esc(o.label)}</span>` +
+      (mark ? `<span class="opt-mark">${mark}</span>` : '') +
+      '</button>';
+  }).join('');
+
+  return `<div class="options">${rows}</div>`;
+}
+
+/** 答案与解析（legacy/js/app.js:328-342） */
+function renderAnswer(q: Question): string {
+  let head: string;
+  if (q.type === 'qa') {
+    head = '<div class="reveal-head">参考答案</div>';
+  } else {
+    const ok = state.verdict?.correct ?? false;
+    head = `<div class="reveal-head ${ok ? 'verdict-ok' : 'verdict-bad'}">` +
+      (ok ? '✓ 答对了' : '✗ 答错了') +
+      '　<span style="color:var(--text-faint);font-weight:400">解析</span></div>';
+  }
+  let fu = '';
+  if (q.followup.length) {
+    fu = '<div class="followup"><div class="followup-title">面试官可能追问</div><ul>' +
+      q.followup.map((t) => `<li>${esc(t)}</li>`).join('') + '</ul></div>';
+  }
+  return `<div class="reveal">${head}<div class="ans">${renderMD(q.a)}</div>${fu}</div>`;
+}
+
+/** 三个自评按钮（legacy/js/app.js:344-350） */
+function gradeRow(): string {
+  return '<div class="grade-row">' +
+    '<button class="grade grade-know" data-grade="know"><b>会了</b><small>1 · 讲得完整</small></button>' +
+    '<button class="grade grade-fuzzy" data-grade="fuzzy"><b>模糊</b><small>2 · 大概知道</small></button>' +
+    '<button class="grade grade-no" data-grade="no"><b>不会</b><small>3 · 说不上来</small></button>' +
+    '</div>';
+}
+
+/**
+ * 动作行。`data-act="reveal"` 标的始终是「空格该按的那颗」——
+ * 未揭晓时是提交 / 揭晓，已揭晓时是下一题，Task 20 的空格键据此选中。
+ */
+function renderActions(ctx: AppCtx, q: Question): string {
+  if (!state.revealed) {
+    if (q.type === 'qa') {
+      return '<div class="card-actions">' +
+        '<button class="btn btn-primary" data-act="reveal">显示参考答案　<kbd>空格</kbd></button></div>';
+    }
+    if (q.type === 'multi') {
+      return '<div class="card-actions">' +
+        '<button class="btn btn-primary" data-act="reveal">提交　<kbd>空格</kbd></button>' +
+        '<span style="align-self:center;font-size:13px;color:var(--text-faint)">多选题，选完再提交</span></div>';
+    }
+    // 单选 / 判断：点选项即提交，和 v1 一样不额外出按钮
+    return '';
+  }
+  // 简答自评；客观题已按判卷结果自动记分，只需推进
+  if (q.type === 'qa') return gradeRow();
+  const last = ctx.engine.position() >= ctx.engine.size() - 1;
+  return '<div class="card-actions">' +
+    `<button class="btn btn-primary" data-act="reveal">${last ? '完成这一卷' : '下一题'}　<kbd>空格</kbd></button></div>`;
+}
+
+export function renderCard(ctx: AppCtx): void {
+  const wrap = document.getElementById('cardWrap')!;
+  if (!ctx.engine.size()) return renderEmpty(ctx, wrap);
+  if (ctx.engine.is_finished()) return renderDone(ctx, wrap);
+
+  const q = ctx.engine.current() as Question | null;
+  if (!q) return renderDone(ctx, wrap);
+
+  const pos = ctx.engine.position();
+  const size = ctx.engine.size();
+  document.getElementById('navbar')!.hidden = false;
+  document.getElementById('deckPos')!.textContent = `${pos + 1} / ${size}`;
+  document.getElementById('deckProgress')!.style.width = `${(pos / size) * 100}%`;
+
+  const st = saved(ctx);
+  const fav = progressOf(st, q.id).fav === true;
+  const favBtn = document.getElementById('btnFav')!;
+  favBtn.textContent = fav ? '★' : '☆';
+  favBtn.classList.toggle('is-on', fav);
+
+  const oral = isOral(st) && !state.oralDone && !state.revealed;
+
+  let body = `<div class="qtext">${renderMD(q.q)}</div>`;
+
+  if (oral) {
+    body += '<div class="oral">' +
+      '<div class="oral-clock" id="oralClock">--:--</div>' +
+      '<div class="oral-note">口述模式：先出声把答案完整讲一遍，讲完再揭晓。面试考的是能不能讲清楚。</div>' +
+      '<button class="btn btn-primary" data-act="oralDone">讲完了</button>' +
+      '</div>';
+  } else {
+    body += renderChoices(q);
+    if (state.revealed) body += renderAnswer(q);
+    body += renderActions(ctx, q);
+  }
+
+  wrap.innerHTML =
+    `<div class="card">${renderHead(ctx, st, q)}<div class="card-body">${body}</div></div>`;
+
+  if (oral) startOral(st);
+}
+
+/* ---------------- Step 5: 口述倒计时（legacy/js/app.js:273-291） ---------------- */
+
+function stopOral(): void {
+  if (state.oralTimer) clearInterval(state.oralTimer);
+  state.oralTimer = null;
+}
+
+function startOral(st: SavedState): void {
+  state.oralLeft = oralSeconds(st);
+  const tick = (): void => {
+    const el = document.getElementById('oralClock');
+    if (!el) { stopOral(); return; }
+    const left = state.oralLeft;
+    const m = Math.floor(Math.abs(left) / 60);
+    const s = Math.abs(left) % 60;
+    el.textContent = `${left < 0 ? '-' : ''}${m}:${String(s).padStart(2, '0')}`;
+    el.classList.toggle('is-up', left <= 0);
+    state.oralLeft--;
+  };
+  tick();
+  stopOral();
+  state.oralTimer = setInterval(tick, 1000);
+}
+
+/* ---------------- Step 4: 事件委托 ---------------- */
+
+/** 客观题提交：判卷并按对错自动记分（legacy/js/app.js:483-491） */
+function submitObjective(ctx: AppCtx): void {
+  if (!state.picked.length) { toast('先选一个再提交'); return; }
+  state.verdict = ctx.engine.judge(new Uint32Array(state.picked)) as Verdict | null;
+  state.revealed = true;
+  ctx.engine.record(state.verdict?.correct ? 'know' : 'no');
+  ctx.persist();
+  renderCard(ctx);
+}
+
+function goNext(ctx: AppCtx): void {
+  ctx.engine.advance();
+  resetCardState();
+  ctx.persist();
+  ctx.rerender();
+}
+
+export function mountCard(ctx: AppCtx): void {
+  const wrap = document.getElementById('cardWrap')!;
+
+  wrap.addEventListener('click', (e) => {
+    const t = e.target as HTMLElement;
+
+    const opt = t.closest<HTMLElement>('.opt');
+    if (opt && !state.revealed) {
+      const idx = Number(opt.dataset.idx);
+      const q = ctx.engine.current() as Question | null;
+      if (!q) return;
+      if (q.type === 'multi') {
+        const at = state.picked.indexOf(idx);
+        if (at >= 0) state.picked.splice(at, 1); else state.picked.push(idx);
+        renderCard(ctx);
+      } else {
+        // 单选 / 判断点一下就算提交
+        state.picked = [idx];
+        submitObjective(ctx);
+      }
+      return;
+    }
+
+    if (t.closest('[data-act="oralDone"]')) {
+      state.oralDone = true;
+      stopOral();
+      renderCard(ctx);
+      return;
+    }
+
+    if (t.closest('[data-act="reveal"]')) {
+      const q = ctx.engine.current() as Question | null;
+      if (!q) return;
+      if (state.revealed) { goNext(ctx); return; }
+      if (q.type === 'qa') {
+        // 简答题无客观对错，直接揭晓，由用户自评
+        state.revealed = true;
+        renderCard(ctx);
+      } else {
+        submitObjective(ctx);
+      }
+      return;
+    }
+
+    const gradeBtn = t.closest<HTMLElement>('[data-grade]');
+    if (gradeBtn) {
+      ctx.engine.record(gradeBtn.dataset.grade!);
+      ctx.engine.advance();
+      resetCardState();
+      ctx.persist();
+      ctx.rerender();
+    }
+  });
+
+  document.getElementById('btnPrev')!.addEventListener('click', () => {
+    if (ctx.engine.back()) { resetCardState(); ctx.persist(); renderCard(ctx); }
+    else toast('已经是第一题');
+  });
+  document.getElementById('btnNext')!.addEventListener('click', () => {
+    ctx.engine.advance(); resetCardState(); ctx.persist(); renderCard(ctx);
+  });
+  document.getElementById('btnFav')!.addEventListener('click', () => {
+    ctx.engine.toggle_fav(); ctx.persist(); renderCard(ctx);
+  });
+}
diff --git a/src/ui/filter.ts b/src/ui/filter.ts
new file mode 100644
index 0000000..527f3f5
--- /dev/null
+++ b/src/ui/filter.ts
@@ -0,0 +1,135 @@
+// src/ui/filter.ts
+import type { AppCtx, Filter } from '../main';
+import { defaultFilter, newSeed } from '../main';
+import { resetCardState } from './card';
+import { toast } from './toast';
+import { esc } from '../core/markdown';
+
+interface CatMeta { id: string; name: string; desc: string }
+
+function onChips(container: string, attr: string): string[] {
+  return Array.from(
+    document.querySelectorAll<HTMLElement>(`#${container} .chip.is-on`),
+  ).map((el) => el.dataset[attr]!).filter(Boolean);
+}
+
+/** 读当前面板状态。mode 为 random 时补一个 seed，保证卷可复现。 */
+export function currentFilter(ctx: AppCtx): Filter {
+  const mode = (onChips('modeChips', 'mode')[0] ?? 'smart') as Filter['mode'];
+  return {
+    cats: onChips('catChips', 'cat'),
+    levels: onChips('levelChips', 'level').map(Number),
+    types: onChips('typeChips', 'type'),
+    scopes: onChips('scopeChips', 'scope'),
+    mode,
+    keyword: (document.getElementById('searchInput') as HTMLInputElement).value.trim(),
+    seed: mode === 'random' ? newSeed() : null,
+  };
+}
+
+/**
+ * 与 legacy/js/app.js:157 一致：带题量角标 `<span class="n">`，
+ * 且题量为 0 的分类不渲染 chip（渲染了点了也出不来题）。
+ */
+export function renderCatChips(ctx: AppCtx): void {
+  const box = document.getElementById('catChips')!;
+  const cats = ctx.engine.cats() as CatMeta[];
+  box.innerHTML = cats
+    .map((c) => {
+      const n = (ctx.engine.count(JSON.stringify({ ...defaultFilter(), cats: [c.id] })) as
+        { total: number }).total;
+      if (!n) return '';
+      return `<button class="chip is-on" data-cat="${c.id}" title="${esc(c.desc)}">` +
+        `${esc(c.name)}<span class="n">${n}</span></button>`;
+    })
+    .join('');
+}
+
+export function refreshCount(ctx: AppCtx): void {
+  const el = document.getElementById('deckCount')!;
+  const res = ctx.engine.count(JSON.stringify(currentFilter(ctx))) as
+    { total: number; boxes: [number, number, number, number] };
+  const [fresh, weak, ok, done] = res.boxes;
+  el.textContent = res.total
+    ? `命中 ${res.total} 题 未练 ${fresh} / 生 ${weak} / 熟 ${ok} / 已掌握 ${done}`
+    : '没有命中任何题目';
+}
+
+const AUTO_PRESET = ['automotive', 'bus', 'security', 'mcu-hw', 'hardware', 'build', 'debug', 'behavioral'];
+
+/** 把 Filter 写回 chips（重置按钮用） */
+function applyFilterToDom(f: Filter): void {
+  document.querySelectorAll<HTMLElement>('#catChips .chip').forEach((c) => {
+    c.classList.toggle('is-on', f.cats.length === 0 || f.cats.includes(c.dataset.cat!));
+  });
+  document.querySelectorAll<HTMLElement>('#levelChips .chip').forEach((c) => {
+    c.classList.toggle('is-on', f.levels.includes(Number(c.dataset.level)));
+  });
+  document.querySelectorAll<HTMLElement>('#typeChips .chip').forEach((c) => {
+    c.classList.toggle('is-on', f.types.includes(c.dataset.type!));
+  });
+  document.querySelectorAll<HTMLElement>('#scopeChips .chip').forEach((c) => {
+    c.classList.toggle('is-on', f.scopes.includes(c.dataset.scope!));
+  });
+  document.querySelectorAll<HTMLElement>('#modeChips .chip').forEach((c) => {
+    c.classList.toggle('is-on', c.dataset.mode === f.mode);
+  });
+  (document.getElementById('searchInput') as HTMLInputElement).value = f.keyword;
+}
+
+export function mountFilter(ctx: AppCtx): void {
+  renderCatChips(ctx);
+
+  document.getElementById('btnFilter')!.addEventListener('click', () => {
+    const p = document.getElementById('filterPanel')!;
+    p.hidden = !p.hidden;
+    document.getElementById('settingsPanel')!.hidden = true;
+    if (!p.hidden) refreshCount(ctx);
+  });
+
+  // 所有 chips 用一次委托：切换 is-on 后刷新计数
+  document.getElementById('filterPanel')!.addEventListener('click', (e) => {
+    const t = e.target as HTMLElement;
+
+    const action = t.closest<HTMLElement>('[data-cat-action]')?.dataset.catAction;
+    if (action) {
+      const chips = document.querySelectorAll<HTMLElement>('#catChips .chip');
+      chips.forEach((c) => {
+        const on = action === 'all' ? true
+          : action === 'none' ? false
+          : AUTO_PRESET.includes(c.dataset.cat!);
+        c.classList.toggle('is-on', on);
+      });
+      refreshCount(ctx);
+      return;
+    }
+
+    const chip = t.closest<HTMLElement>('.chip');
+    if (!chip) return;
+    // 出题顺序是单选，其余维度是多选
+    if (chip.parentElement?.id === 'modeChips') {
+      document.querySelectorAll('#modeChips .chip').forEach((c) => c.classList.remove('is-on'));
+      chip.classList.add('is-on');
+    } else {
+      chip.classList.toggle('is-on');
+    }
+    refreshCount(ctx);
+  });
+
+  document.getElementById('searchInput')!.addEventListener('input', () => refreshCount(ctx));
+
+  document.getElementById('btnResetFilter')!.addEventListener('click', () => {
+    applyFilterToDom(defaultFilter());
+    refreshCount(ctx);
+  });
+
+  document.getElementById('btnApplyFilter')!.addEventListener('click', () => {
+    const n = ctx.engine.build(JSON.stringify(currentFilter(ctx)));
+    if (!n) { toast('没有命中任何题目，放宽条件试试'); return; }
+    resetCardState();
+    ctx.persist();
+    document.getElementById('filterPanel')!.hidden = true;
+    toast(`组卷 ${n} 题`);
+    ctx.rerender();
+  });
+}
diff --git a/src/ui/keys.ts b/src/ui/keys.ts
new file mode 100644
index 0000000..9d3e80c
--- /dev/null
+++ b/src/ui/keys.ts
@@ -0,0 +1,39 @@
+// src/ui/keys.ts
+import type { AppCtx } from '../main';
+import { renderCard } from './card';
+
+export function mountKeys(ctx: AppCtx): void {
+  document.addEventListener('keydown', (e) => {
+    const t = e.target as HTMLElement;
+    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
+
+    if (e.key === '/') {
+      e.preventDefault();
+      document.getElementById('filterPanel')!.hidden = false;
+      (document.getElementById('searchInput') as HTMLInputElement).focus();
+      return;
+    }
+    if (e.key === 'f' || e.key === 'F') {
+      ctx.engine.toggle_fav(); ctx.persist(); renderCard(ctx); return;
+    }
+    if (e.key === 'ArrowLeft') {
+      if (ctx.engine.back()) { ctx.persist(); renderCard(ctx); } return;
+    }
+    if (e.key === 'ArrowRight') {
+      ctx.engine.advance(); ctx.persist(); renderCard(ctx); return;
+    }
+    if (e.key === ' ') {
+      e.preventDefault();
+      // 空格：提交 / 揭晓 / 下一题 —— 语义取决于卡片当前阶段
+      document.querySelector<HTMLElement>('[data-act="reveal"]')?.click();
+      return;
+    }
+    if (/^[1-6]$/.test(e.key)) {
+      const n = Number(e.key) - 1;
+      // 已揭晓时 1/2/3 是自评，未揭晓时是选选项
+      const graded = document.querySelectorAll<HTMLElement>('[data-grade]');
+      if (graded.length && n < 3) { graded[n]!.click(); return; }
+      document.querySelectorAll<HTMLElement>('.opt')[n]?.click();
+    }
+  });
+}
diff --git a/src/ui/settings.ts b/src/ui/settings.ts
new file mode 100644
index 0000000..9f09115
--- /dev/null
+++ b/src/ui/settings.ts
@@ -0,0 +1,146 @@
+// src/ui/settings.ts
+import type { AppCtx } from '../main';
+import { resetState } from '../core/store';
+import { renderCard } from './card';
+import { toast } from './toast';
+
+const ORAL_STEPS = [30, 60, 90, 120, 180];
+
+interface Question {
+  id: string; cat: string; q: string; a: string;
+  type: string; options: string[]; answer: unknown; followup: string[];
+}
+
+/** 从 engine 的题库中查找题目 */
+function getQuestionById(ctx: AppCtx, id: string): Question | null {
+  const all = JSON.parse(ctx.engine.questions_json()) as Question[];
+  return all.find((q) => q.id === id) ?? null;
+}
+
+/** 分类 id → 名称缓存 */
+let _catNames: Map<string, string> | null = null;
+function catName(ctx: AppCtx, id: string): string {
+  if (!_catNames) {
+    const list = (ctx.engine.cats() as { id: string; name: string }[] | null) ?? [];
+    _catNames = new Map(list.map((c) => [c.id, c.name]));
+  }
+  return _catNames.get(id) ?? id;
+}
+
+export function renderHealth(ctx: AppCtx): void {
+  const box = document.getElementById('bankHealth')!;
+  const problems = ctx.engine.health() as string[];
+  box.innerHTML = problems.length
+    ? problems.map((p) => `<div class="health-item is-bad">${p}</div>`).join('')
+    : '<div class="health-item is-ok">题库自检通过，没有发现问题。</div>';
+}
+
+/** 今天错题 Markdown 导出（移植自 legacy/js/stats.js:95） */
+function wrongTodayMarkdown(ctx: AppCtx): string {
+  const state = JSON.parse(ctx.engine.state_json());
+  const today = state.days ? Object.keys(state.days).pop() ?? '' : '';
+  const ids = (state.wrongToday as Record<string, string[]> | null)?.[today] ?? [];
+
+  const lines: string[] = [`# 今日错题 · ${today}`, ''];
+  if (!ids.length) {
+    lines.push('_今天没有错题。_');
+    return lines.join('\n');
+  }
+  lines.push(`共 ${ids.length} 题。`, '');
+
+  for (const id of ids) {
+    const q = getQuestionById(ctx, id);
+    if (!q) continue;
+    lines.push(`## ${q.id} · ${catName(ctx, q.cat)}`, '');
+    lines.push(q.q, '');
+    if (q.options.length) {
+      for (let j = 0; j < q.options.length; j++) {
+        const ansArr = Array.isArray(q.answer) ? q.answer : [];
+        const mark = ansArr.includes(j) ? ' ✅' : '';
+        lines.push(`- ${String.fromCharCode(65 + j)}. ${q.options[j]}${mark}`);
+      }
+      lines.push('');
+    }
+    if (q.type === 'bool') {
+      lines.push(`**答案：**${q.answer ? '正确' : '错误'}`, '');
+    }
+    lines.push('**要点：**', '', q.a, '');
+    if (q.followup.length) {
+      lines.push('**可能追问：**');
+      for (const f of q.followup) lines.push(`- ${f}`);
+      lines.push('');
+    }
+    lines.push('---', '');
+  }
+  return lines.join('\n');
+}
+
+export function mountSettings(ctx: AppCtx): void {
+  document.getElementById('btnSettings')!.addEventListener('click', () => {
+    const p = document.getElementById('settingsPanel')!;
+    p.hidden = !p.hidden;
+    document.getElementById('filterPanel')!.hidden = true;
+    if (!p.hidden) { renderHealth(ctx); syncOral(ctx); }
+  });
+
+  document.getElementById('oralToggle')!.addEventListener('click', () => {
+    ctx.engine.set_oral(!ctx.engine.oral());
+    ctx.persist(); syncOral(ctx); renderCard(ctx);
+  });
+
+  document.getElementById('oralTimeBtn')!.addEventListener('click', () => {
+    const cur = ctx.engine.oral_seconds();
+    const next = ORAL_STEPS[(ORAL_STEPS.indexOf(cur) + 1) % ORAL_STEPS.length]!;
+    ctx.engine.set_oral_seconds(next);
+    ctx.persist(); syncOral(ctx);
+  });
+
+  document.getElementById('btnExport')!.addEventListener('click', () => {
+    download('embq-progress.json', ctx.engine.state_json(), 'application/json');
+    toast('已导出进度');
+  });
+
+  document.getElementById('btnImport')!.addEventListener('click', () => {
+    (document.getElementById('importFile') as HTMLInputElement).click();
+  });
+
+  document.getElementById('importFile')!.addEventListener('change', async (e) => {
+    const file = (e.target as HTMLInputElement).files?.[0];
+    if (!file) return;
+    try {
+      ctx.engine.load_state_json(await file.text());
+      ctx.persist();
+      if (!ctx.engine.restore_deck()) toast('进度已导入，卷需要重新组');
+      else toast('进度已导入');
+      ctx.rerender();
+    } catch {
+      toast('导入失败：文件格式不对');
+    }
+  });
+
+  document.getElementById('btnExportWrong')!.addEventListener('click', () => {
+    download('今日错题.md', wrongTodayMarkdown(ctx), 'text/markdown');
+  });
+
+  document.getElementById('btnReset')!.addEventListener('click', async () => {
+    if (!confirm('清空全部进度？这个操作没法撤销，建议先导出。')) return;
+    await resetState();
+    location.reload();
+  });
+}
+
+function syncOral(ctx: AppCtx): void {
+  const t = document.getElementById('oralToggle')!;
+  const on = ctx.engine.oral();
+  t.dataset.on = String(on);
+  t.textContent = `口述模式：${on ? '开' : '关'}`;
+  t.classList.toggle('is-on', on);
+  document.getElementById('oralTimeBtn')!.textContent = `倒计时：${ctx.engine.oral_seconds()} 秒`;
+}
+
+function download(name: string, content: string, mime: string): void {
+  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
+  const a = document.createElement('a');
+  a.href = url; a.download = name; a.click();
+  URL.revokeObjectURL(url);
+}
diff --git a/src/ui/stats.ts b/src/ui/stats.ts
new file mode 100644
index 0000000..3a0888e
--- /dev/null
+++ b/src/ui/stats.ts
@@ -0,0 +1,75 @@
+// src/ui/stats.ts
+import type { AppCtx } from '../main';
+
+interface StatsPayload {
+  overall: { total: number; seen: number; mastered: number; accuracy: number;
+             today: number; streak: number; boxes: [number, number, number, number] };
+  byCategory: CategoryStat[];
+  weakest: CategoryStat[];
+  heatmap: { date: string; count: number }[];
+  resumeRisk: { total: number; mastered: number; weak_ids: string[] };
+}
+
+interface CategoryStat {
+  id: string; name: string; total: number;
+  mastered: number; seen: number; accuracy: number;
+}
+
+function pct(n: number, d: number): number {
+  return d ? Math.round((n / d) * 100) : 0;
+}
+
+function kpis(o: StatsPayload['overall']): string {
+  return '<div class="kpis">' +
+    kpi('已掌握', `${o.mastered} / ${o.total}`, `${pct(o.mastered, o.total)}%`) +
+    kpi('已练过', `${o.seen} / ${o.total}`, `${pct(o.seen, o.total)}%`) +
+    kpi('正确率', `${Math.round(o.accuracy * 100)}%`, '答对 / 已答') +
+    kpi('今日', `${o.today} 题`, `连续 ${o.streak} 天`) +
+    '</div>';
+}
+
+function kpi(label: string, value: string, sub: string): string {
+  return `<div class="kpi"><div class="kpi-label">// ${label}</div>` +
+    `<div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
+}
+
+function bars(list: CategoryStat[]): string {
+  const rows = list.map((c) => {
+    const p = pct(c.mastered, c.total);
+    return '<div class="bar">' +
+      `<div class="bar-label">${c.name}</div>` +
+      `<div class="bar-track"><div class="bar-fill" style="width:${p}%"></div></div>` +
+      `<div class="bar-num">${c.mastered}/${c.total}</div>` +
+      '</div>';
+  }).join('');
+  return `<div class="bars">${rows}</div>`;
+}
+
+function heat(cells: { date: string; count: number }[]): string {
+  const inner = cells.map((c) => {
+    // 0 / 1-9 / 10-24 / 25-49 / 50+ 五档，对齐 legacy/js/stats.js:80
+    const lv = c.count === 0 ? 0 : c.count < 10 ? 1 : c.count < 25 ? 2 : c.count < 50 ? 3 : 4;
+    return `<div class="heat-cell lv${lv}" title="${c.date}：${c.count} 题"></div>`;
+  }).join('');
+  return `<div class="heat">${inner}</div>`;
+}
+
+export function renderStats(ctx: AppCtx): void {
+  const wrap = document.getElementById('statsWrap');
+  if (!wrap) return;
+  const s = ctx.engine.stats() as StatsPayload;
+
+  const risk = s.resumeRisk;
+  const riskBlock = risk.total
+    ? `<section class="stat-block"><h3>// 简历高危</h3>` +
+      `<p class="hint">这些题跟你简历上写的东西直接相关，面试官大概率会问。已掌握 ` +
+      `${risk.mastered} / ${risk.total}。</p></section>`
+    : '';
+
+  wrap.innerHTML =
+    kpis(s.overall) +
+    '<section class="stat-block"><h3>// 最薄弱的分类</h3>' + bars(s.weakest) + '</section>' +
+    '<section class="stat-block"><h3>// 全部分类</h3>' + bars(s.byCategory) + '</section>' +
+    '<section class="stat-block"><h3>// 最近半年</h3>' + heat(s.heatmap) + '</section>' +
+    riskBlock;
+}
diff --git a/src/ui/theme.ts b/src/ui/theme.ts
new file mode 100644
index 0000000..eeeb6a8
--- /dev/null
+++ b/src/ui/theme.ts
@@ -0,0 +1,27 @@
+// src/ui/theme.ts
+import type { AppCtx } from '../main';
+import { toast } from './toast';
+
+const THEME_ORDER = ['auto', 'light', 'dark'] as const;
+const THEME_LABEL: Record<string, string> = { auto: '跟随系统', light: '浅色', dark: '深色' };
+
+/**
+ * 把偏好原样写进 data-theme —— 与 legacy/js/app.js:144 一致。
+ * 注意不要在这里把 auto 解析成 light/dark：现有 CSS 自己用
+ * `[data-theme="auto"]` + prefers-color-scheme 媒体查询处理跟随系统，
+ * 提前解析会让 data-theme 永远拿不到 auto，媒体查询那段样式就成了死代码。
+ */
+export function applyTheme(ctx: AppCtx): void {
+  document.documentElement.setAttribute('data-theme', ctx.engine.theme() || 'auto');
+}
+
+export function mountTheme(ctx: AppCtx): void {
+  document.getElementById('btnTheme')!.addEventListener('click', () => {
+    const cur = ctx.engine.theme() || 'auto';
+    const next = THEME_ORDER[(THEME_ORDER.indexOf(cur as typeof THEME_ORDER[number]) + 1) % 3]!;
+    ctx.engine.set_theme(next);
+    ctx.persist();
+    applyTheme(ctx);
+    toast(`主题：${THEME_LABEL[next]}`);
+  });
+}
diff --git a/src/ui/toast.ts b/src/ui/toast.ts
new file mode 100644
index 0000000..0054b6c
--- /dev/null
+++ b/src/ui/toast.ts
@@ -0,0 +1,15 @@
+// src/ui/toast.ts
+let timer: ReturnType<typeof setTimeout> | null = null;
+
+/**
+ * 右下角一次只显示一条。与 legacy/js/app.js:134 逐字等价：
+ * 只切 hidden，不加 class（现有 .toast 样式没有 .is-on 这一态），2200ms 后收起。
+ */
+export function toast(msg: string): void {
+  const el = document.getElementById('toast');
+  if (!el) return;
+  el.textContent = msg;
+  el.hidden = false;
+  if (timer) clearTimeout(timer);
+  timer = setTimeout(() => { el.hidden = true; }, 2200);
+}
diff --git a/sw.js b/sw.js
index 6bdbd55..0df9b50 100644
--- a/sw.js
+++ b/sw.js
@@ -1,68 +1,41 @@
 // ============================================================
 //  Service Worker — 离线缓存
 //  所有静态资源预缓存，断网也能刷
 // ============================================================
-var CACHE_NAME = 'quiz-v1';
-var ASSETS = [
+const CACHE = 'embq-v2';
+const ASSETS = [
   './',
   './index.html',
   './manifest.json',
-  './css/style.css',
-  './js/bank.js',
-  './js/store.js',
-  './js/scheduler.js',
-  './js/quiz.js',
-  './js/stats.js',
-  './js/app.js',
-  './data/meta.js',
-  './data/c-lang.js',
-  './data/coding.js',
-  './data/coding-2.js',
-  './data/cpp.js',
-  './data/cpp-2.js',
-  './data/ds-algo.js',
-  './data/ds-algo-2.js',
-  './data/control.js',
-  './data/os.js',
-  './data/rtos.js',
-  './data/linux-app.js',
-  './data/linux-drv.js',
-  './data/linux-drv-2.js',
-  './data/mcu-hw.js',
-  './data/hardware.js',
-  './data/bus.js',
-  './data/network.js',
-  './data/build.js',
-  './data/build-2.js',
-  './data/tools.js',
-  './data/debug.js',
-  './data/debug-2.js',
-  './data/security.js',
-  './data/security-2.js',
-  './data/automotive.js',
-  './data/behavioral.js',
+  './data/questions.json',
+  './data/categories.json',
+  './icons/icon-192.png',
+  './icons/icon-512.png',
 ];
 
-self.addEventListener('install', function(event) {
-  event.waitUntil(caches.open(CACHE_NAME).then(function(cache) {
-    return cache.addAll(ASSETS);
-  }));
+self.addEventListener('install', (e) => {
+  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
 });
 
-self.addEventListener('activate', function(event) {
-  event.waitUntil(caches.keys().then(function(names) {
-    return Promise.all(names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); }));
-  }));
+// 清掉旧版本缓存，否则老用户会一直吃到已删除的 js/*.js
+self.addEventListener('activate', (e) => {
+  e.waitUntil(
+    caches.keys()
+      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
+      .then(() => self.clients.claim()),
+  );
 });
 
-self.addEventListener('fetch', function(event) {
-  event.respondWith(caches.match(event.request).then(function(resp) {
-    return resp || fetch(event.request).then(function(networkResp) {
-      if (networkResp.ok) {
-        var clone = networkResp.clone();
-        caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
+self.addEventListener('fetch', (e) => {
+  if (e.request.method !== 'GET') return;
+  e.respondWith(
+    caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((res) => {
+      // 只缓存同源成功响应，避免把 opaque 响应塞进缓存
+      if (res.ok && new URL(e.request.url).origin === location.origin) {
+        const copy = res.clone();
+        caches.open(CACHE).then((c) => c.put(e.request, copy));
       }
-      return networkResp;
-    });
-  }));
+      return res;
+    }).catch(() => hit)),
+  );
 });
diff --git a/tsconfig.json b/tsconfig.json
new file mode 100644
index 0000000..f72701f
--- /dev/null
+++ b/tsconfig.json
@@ -0,0 +1,12 @@
+{
+  "compilerOptions": {
+    "target": "ES2022",
+    "module": "ESNext",
+    "moduleResolution": "bundler",
+    "strict": true,
+    "noUncheckedIndexedAccess": true,
+    "skipLibCheck": true,
+    "types": ["vite/client"]
+  },
+  "include": ["src", "pkg"]
+}
diff --git a/vite.config.ts b/vite.config.ts
new file mode 100644
index 0000000..47f837f
--- /dev/null
+++ b/vite.config.ts
@@ -0,0 +1,6 @@
+import { defineConfig } from 'vite';
+
+export default defineConfig({
+  base: './',
+  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
+});
diff --git a/vitest.config.ts b/vitest.config.ts
new file mode 100644
index 0000000..fbfb724
--- /dev/null
+++ b/vitest.config.ts
@@ -0,0 +1,11 @@
+import { defineConfig } from 'vitest/config';
+
+export default defineConfig({
+  test: {
+    environment: 'jsdom',
+    setupFiles: ['./src/test-setup.ts'],
+    passWithNoTests: true,
+    // 排除 agent worktree，否则同一份测试会被重复统计
+    exclude: ['**/node_modules/**', '**/dist/**', '.claude/worktrees/**', 'legacy/**'],
+  },
+});
```
