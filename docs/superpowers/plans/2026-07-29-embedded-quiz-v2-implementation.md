# 嵌入式面试题库 v2（Rust + TS + Tauri）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有纯 JS 刷题器重写为 Rust 核心 + TypeScript UI，修复进度丢失与组卷顺序不稳定两个 bug，同时交付 Windows exe 和保留现有 web 版。

**Architecture:** Rust 编译为 WASM，承载题库解析、筛选、调度、评分、统计（纯函数、零 IO）；TypeScript 承载 DOM 渲染与持久化（IndexedDB 主 + localStorage 兜底）；两侧通过 `QuizEngine` 类以 JSON 字符串交互，不共享内存。Tauri 把同一套 `src/` 打包为桌面应用。

**Tech Stack:** Rust 1.93 + wasm-bindgen + serde + rand(StdRng) · TypeScript 5 + Vite · Tauri 2 · Vitest + fake-indexeddb · Node 24（迁移脚本）

## Global Constraints

- **视觉零变化**：`css/style.css` 一个字节都不改；`index.html` 的 DOM 结构与 class 名保持不变。
- 终端极简风格由现有 CSS 承载：等宽字体、直角边框、1px 线框、磷光绿强调色、`// ` 标签前缀、`>_` 品牌标记。
- 题目总数 **476**，跨 26 个题库脚本 + 1 个 `data/meta.js`（共 27 个 `<script>`）。
- 题库顺序 **严格照 `index.html` 中 `<script>` 的加载顺序**，`Ordered` 模式依赖它。
- Question 字段名与现有题库完全一致：`id / cat / q / a / type / options / answer / level / tags / resume / followup`。
- 存档字段名与现有 `localStorage["embq.v1"]` 兼容：`box`、`wrongToday`、`settings.oralSeconds`（详见 Task 4 的 serde rename）。
- Grade 取值固定为 `know` | `fuzzy` | `no`。
- 旧 `data/*.js` 移入 `legacy/`，保留一个版本周期，不删除。
- web 版与桌面版共存，共享 `src/`，差异仅在入口与 `tauri.conf.json`。

## 两处需要在实现中修正 spec 的地方

**1. `fuzzy` 语义** — spec 表格写「`fuzzy` 降回 1 盒」，但现有 `js/store.js:104` 是 `r.box = Math.max(1, r.box || 0)`，即**保底 1 盒但不降级**。照 spec 字面实现会让 `fuzzy` 与 `no` 只差一个计数器，等于砍掉一档评分粒度。**本计划实现现有行为**（`box = max(1, box)`，不计 wrong，不进错题本），Task 10 的测试锁定这一点。

**2. `UserState` 字段名** — spec 的 `wrong_today` / `oral_seconds` 若不加 rename，序列化出来跟现有存档的 `wrongToday` / `oralSeconds` 对不上，老用户进度会读不出来。spec 已为 `box` 做了 rename，同理这两个也要加。Task 4 的测试用真实旧存档 JSON 锁定。

---

## 文件结构

```
Cargo.toml                  # Rust crate（cdylib）
src-rust/
├── lib.rs                  # wasm_bindgen 边界：QuizEngine
├── models.rs               # 全部数据结构 + serde 兼容
├── parser.rs               # JSON → Catalog，校验
├── catalog.rs              # 扁平数组 + by_cat / cat_index 索引
├── scheduler.rs            # 筛选 + 三种排序 + 导航 + 作答
└── stats.rs                # 统计（纯函数）
src/
├── main.ts                 # 启动流程：init → fetch → engine → mount
├── core/
│   ├── store.ts            # IndexedDB + localStorage 兜底 + 旧数据迁移
│   └── markdown.ts         # 从 js/app.js 平移，加类型标注
└── ui/
    ├── card.ts             # 题卡：题头、选项、答案、评分行、口述模式
    ├── stats.ts            # 统计视图：KPI、分类条形图、热力图
    ├── filter.ts           # 筛选面板：chips ⇄ Filter
    ├── settings.ts         # 设置面板：口述、导入导出、题库自检
    ├── keys.ts             # 键盘快捷键
    ├── theme.ts            # 主题切换
    └── toast.ts            # 提示消息
data/
├── questions.json          # 迁移产物：扁平数组，476 题
└── categories.json         # 迁移产物：19 个分类 + CAT_PRESETS
scripts/migrate.mjs         # 一次性迁移脚本（含自检）
legacy/                     # 旧 data/*.js 与 js/*.js 归档
src-tauri/tauri.conf.json   # 桌面打包配置
```

拆分依据：Rust 侧按职责分文件，`scheduler.rs` 是唯一持有可变状态的模块，其余纯函数；TS 侧 `core/` 与 `ui/` 分离，`ui/*` 全部是 `(engine, root) => void` 的纯渲染函数，不持有状态。

---

### Task 1: 工具链与项目骨架

环境已有 Node v24.11.1、cargo 1.93.1，缺 `wasm-pack` 和 wasm32 target。

**Files:**
- Create: `Cargo.toml`
- Create: `src-rust/lib.rs`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`（追加条目）

**Interfaces:**
- Produces: 可编译的空 crate；`npm test` 可运行；后续所有任务依赖此骨架。

- [ ] **Step 1: 安装 wasm32 target 与 wasm-pack**

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
```

预期：`rustup target list --installed` 输出含 `wasm32-unknown-unknown`；`wasm-pack --version` 打印版本号。

- [ ] **Step 2: 写 Cargo.toml**

```toml
[package]
name = "embq-core"
version = "2.0.0"
edition = "2021"

[lib]
path = "src-rust/lib.rs"
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
serde-wasm-bindgen = "0.6"
rand = { version = "0.8", default-features = false, features = ["std", "std_rng", "small_rng"] }
getrandom = { version = "0.2", features = ["js"] }

[profile.release]
lto = true
opt-level = "z"
```

`opt-level = "z"` + `lto` 应对 spec 风险表里的「WASM 体积过大」。

- [ ] **Step 3: 写最小 lib.rs**

```rust
pub mod catalog;
pub mod models;
pub mod parser;
pub mod scheduler;
pub mod stats;

#[cfg(test)]
mod tests {
    #[test]
    fn skeleton_compiles() {
        assert_eq!(2 + 2, 4);
    }
}
```

同时创建 5 个空模块文件，每个只写一行 `// 占位，见后续 Task`，让 `cargo build` 能过。

- [ ] **Step 4: 写 package.json**

```json
{
  "name": "embq",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "wasm": "wasm-pack build --target web --out-dir pkg",
    "dev": "vite",
    "build": "npm run wasm && vite build",
    "test": "vitest run",
    "migrate": "node scripts/migrate.mjs"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "fake-indexeddb": "^6.0.0"
  }
}
```

- [ ] **Step 5: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "pkg"]
}
```

- [ ] **Step 6: 追加 .gitignore 条目**

```
/pkg
/target
/node_modules
/dist
/src-tauri/target
```

- [ ] **Step 7: 验证骨架**

```bash
cargo test
npm install
```

预期：`cargo test` 输出 `test tests::skeleton_compiles ... ok`；`npm install` 成功。

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml src-rust package.json tsconfig.json .gitignore
git commit -m "chore: scaffold rust crate and ts toolchain for v2"
```

---

### Task 2: 题库迁移脚本

**Files:**
- Create: `scripts/migrate.mjs`
- Produces: `data/questions.json`, `data/categories.json`

**Interfaces:**
- Produces: `data/questions.json`（476 条扁平数组，字段名同现有题库）与 `data/categories.json`（`{ cats: CategoryMeta[], presets: Record<string, string[]> }`）。Task 3 的 parser 消费这两个文件。

- [ ] **Step 1: 写迁移脚本**

题库文件是浏览器脚本（依赖 `QBANK` / `window` 全局，非 ESM），所以用 `node:vm` 在共享上下文里按序求值，而不是 `import`。

```javascript
// scripts/migrate.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 顺序严格照 index.html 中 <script> 的出现顺序
const FILES = [
  'meta.js',
  'c-lang.js', 'coding.js', 'coding-2.js', 'cpp.js', 'cpp-2.js',
  'ds-algo.js', 'ds-algo-2.js', 'control.js', 'os.js', 'rtos.js',
  'linux-app.js', 'linux-drv.js', 'linux-drv-2.js', 'mcu-hw.js',
  'hardware.js', 'bus.js', 'network.js', 'build.js', 'build-2.js',
  'tools.js', 'debug.js', 'debug-2.js', 'security.js', 'security-2.js',
  'automotive.js', 'behavioral.js',
];

const questions = [];
let categories = [];

const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.QBANK = {
  add: (list) => questions.push(...list),
  setCategories: (list) => { categories = list; },
};
const ctx = createContext(sandbox);

for (const f of FILES) {
  const src = readFileSync(join(ROOT, 'data', f), 'utf8');
  runInContext(src, ctx, { filename: f });
}

// 补齐 QBANK.add 会做的默认值，保持与旧行为一致
for (const q of questions) {
  q.level = q.level || 1;
  q.tags = q.tags || [];
  q.followup = q.followup || [];
  q.resume = !!q.resume;
}

const catalog = { cats: categories, presets: sandbox.CAT_PRESETS ?? {} };

// ---- 自检：任一条不过就中止，不写文件 ----
const errs = [];
if (questions.length !== 476) errs.push(`题目数 ${questions.length}，期望 476`);

const seen = new Set();
for (const q of questions) {
  if (!q.id) errs.push(`存在无 id 题目：${String(q.q).slice(0, 24)}`);
  else if (seen.has(q.id)) errs.push(`id 重复：${q.id}`);
  seen.add(q.id);
}

const catIds = new Set(categories.map((c) => c.id));
for (const q of questions) {
  if (!catIds.has(q.cat)) errs.push(`${q.id}: cat "${q.cat}" 未在 meta.js 登记`);
  if (q.type === 'single' || q.type === 'multi') {
    for (const i of q.answer) {
      if (!Number.isInteger(i) || i < 0 || i >= q.options.length) {
        errs.push(`${q.id}: answer 索引 ${i} 越界`);
      }
    }
  }
  if (q.type === 'bool' && typeof q.answer !== 'boolean') {
    errs.push(`${q.id}: 判断题 answer 必须是布尔`);
  }
  if (!q.a) errs.push(`${q.id}: 缺少参考答案`);
}

if (errs.length) {
  console.error('迁移自检失败，未写入任何文件：');
  for (const e of errs.slice(0, 20)) console.error('  - ' + e);
  process.exit(1);
}

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data', 'questions.json'), JSON.stringify(questions, null, 0), 'utf8');
writeFileSync(join(ROOT, 'data', 'categories.json'), JSON.stringify(catalog, null, 2), 'utf8');

console.log(`OK: ${questions.length} 题, ${categories.length} 分类`);
console.log('分类顺序:', categories.map((c) => c.id).join(', '));
```

- [ ] **Step 2: 运行迁移**

```bash
node scripts/migrate.mjs
```

预期输出：`OK: 476 题, 19 分类`。若报「题目数 X，期望 476」，说明 `FILES` 顺序或条目与 `index.html` 不一致 —— 用 `grep -n 'script src="data/' index.html` 重新核对，不要改期望值。

- [ ] **Step 3: 写抽样比对脚本并运行**

验证 Markdown 里的反斜杠、反引号、换行没有在 JSON 往返中失真。

```javascript
// scripts/verify-sample.mjs
import { readFileSync } from 'node:fs';
const qs = JSON.parse(readFileSync('data/questions.json', 'utf8'));
// 挑最容易出问题的：含反引号、反斜杠、换行的题
const risky = qs.filter((q) => /[`\\]|\n/.test(q.q + q.a)).slice(0, 10);
console.log(`抽样 ${risky.length} 道含特殊字符的题：`);
for (const q of risky) {
  console.log(`--- ${q.id} ---`);
  console.log('题干含换行:', q.q.includes('\n'), '| 含反引号:', q.q.includes('`'));
  console.log(q.a.slice(0, 120).replace(/\n/g, '\\n'));
}
```

```bash
node scripts/verify-sample.mjs
```

人工确认输出里的代码块反引号成对、换行是真换行而非字面 `\n`。

- [ ] **Step 4: 归档旧文件**

```bash
mkdir -p legacy/data legacy/js
git mv data/*.js legacy/data/
git mv js/*.js legacy/js/
```

注意：`index.html` 此刻会失效，Task 15 重写入口时修复。旧文件保留一个版本周期，不删除。

- [ ] **Step 5: Commit**

```bash
git add scripts data/questions.json data/categories.json legacy
git commit -m "feat: migrate 476 questions to flat JSON, archive legacy js"
```

---

### Task 3: 数据模型（models.rs）

**Files:**
- Create: `src-rust/models.rs`

**Interfaces:**
- Produces: `Question`, `Answer`, `QType`, `CategoryMeta`, `Progress`, `UserState`, `Settings`, `Deck`, `Filter`, `Scope`, `Mode`, `Grade`, `Verdict`。所有后续 Rust 任务消费这些类型。

- [ ] **Step 1: 写失败测试**

```rust
// src-rust/models.rs 末尾
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn question_roundtrips_choice() {
        let json = r#"{"id":"c-001","cat":"c-lang","q":"题干","a":"答案",
            "type":"single","options":["A","B"],"answer":[1]}"#;
        let q: Question = serde_json::from_str(json).unwrap();
        assert_eq!(q.id, "c-001");
        assert_eq!(q.qtype, QType::Single);
        assert!(matches!(q.answer, Answer::Indices(ref v) if v == &vec![1]));
        assert_eq!(q.level, 1, "level 缺省应为 1");
        assert!(!q.resume);
    }

    #[test]
    fn question_accepts_bool_answer() {
        let json = r#"{"id":"os-001","cat":"os","q":"题","a":"答","type":"bool","answer":true}"#;
        let q: Question = serde_json::from_str(json).unwrap();
        assert!(matches!(q.answer, Answer::Bool(true)));
    }

    #[test]
    fn question_accepts_qa_without_answer() {
        let json = r#"{"id":"os-002","cat":"os","q":"题","a":"答","type":"qa"}"#;
        let q: Question = serde_json::from_str(json).unwrap();
        assert!(matches!(q.answer, Answer::None));
        assert!(q.options.is_empty());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --lib models
```

预期：编译失败，`cannot find type Question in this scope`。

- [ ] **Step 3: 写模型定义**

```rust
use serde::{Deserialize, Serialize};

fn one() -> u8 { 1 }

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Hash)]
#[serde(rename_all = "lowercase")]
pub enum QType { Single, Multi, Bool, Qa }

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum Answer {
    Indices(Vec<usize>),
    Bool(bool),
    None,
}

impl Default for Answer {
    fn default() -> Self { Answer::None }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Question {
    pub id: String,
    pub cat: String,
    pub q: String,
    pub a: String,
    #[serde(rename = "type")]
    pub qtype: QType,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub answer: Answer,
    #[serde(default = "one")]
    pub level: u8,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub resume: bool,
    #[serde(default)]
    pub followup: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CategoryMeta {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub desc: String,
}
```

`Answer` 的 untagged 顺序有讲究：`Indices` 必须在 `Bool` 之前，否则 serde 会先试 `Bool` 失败再回退，虽结果相同但多一次尝试；反过来若把 `None` 放最前，所有值都会匹配成 `None`。

- [ ] **Step 4: 运行测试确认通过**

```bash
cargo test --lib models
```

预期：3 个测试全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src-rust/models.rs
git commit -m "feat(core): add Question/Answer/QType models with serde compat"
```

---

### Task 4: 用户状态模型与旧存档兼容

**Files:**
- Modify: `src-rust/models.rs`

**Interfaces:**
- Consumes: Task 3 的类型。
- Produces: `Progress { bx, right, wrong, seen, last, fav }`、`UserState { version, q, days, wrong_today, settings, deck }`、`Settings { theme, oral, oral_seconds }`、`Deck { ids, pos, filter, seed, bank_hash }`、`Filter { cats, levels, types, scopes, mode, keyword, seed }`、`Scope`、`Mode`、`Grade`、`Verdict`。

这是 spec 修正点 2 落地的地方：`wrong_today` / `oral_seconds` 必须 rename 回 camelCase。

- [ ] **Step 1: 写失败测试（用真实旧存档形状）**

```rust
    #[test]
    fn user_state_reads_v1_archive() {
        // 形状取自现有 localStorage["embq.v1"]
        let json = r#"{
            "version": 1,
            "q": { "c-001": { "box": 2, "right": 3, "wrong": 1, "seen": 4, "last": 1720000000000, "fav": true } },
            "days": { "2026-07-28": 12 },
            "wrongToday": { "2026-07-28": ["c-001"] },
            "settings": { "theme": "dark", "oral": false, "oralSeconds": 60 }
        }"#;
        let s: UserState = serde_json::from_str(json).unwrap();
        let p = s.q.get("c-001").unwrap();
        assert_eq!(p.bx, 2, "box 必须映射到 bx");
        assert_eq!(p.right, 3);
        assert!(p.fav);
        assert_eq!(s.wrong_today.get("2026-07-28").unwrap(), &vec!["c-001".to_string()]);
        assert_eq!(s.settings.oral_seconds, 60, "oralSeconds 必须映射到 oral_seconds");
        assert!(s.deck.is_none(), "v1 存档没有 deck");
    }

    #[test]
    fn user_state_writes_camel_case_keys() {
        let s = UserState::default();
        let out = serde_json::to_string(&s).unwrap();
        assert!(out.contains("\"wrongToday\""), "落盘必须写 wrongToday，实际: {out}");
        assert!(out.contains("\"oralSeconds\""));
        assert!(!out.contains("wrong_today"));
    }

    #[test]
    fn progress_defaults_are_zero() {
        let p = Progress::default();
        assert_eq!(p.bx, 0);
        assert_eq!(p.seen, 0);
        assert!(!p.fav);
    }
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --lib models
```

预期：`cannot find type UserState in this scope`。

- [ ] **Step 3: 写状态模型**

```rust
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Progress {
    #[serde(rename = "box")]
    pub bx: u8,
    #[serde(default)]
    pub right: u32,
    #[serde(default)]
    pub wrong: u32,
    #[serde(default)]
    pub seen: u32,
    #[serde(default)]
    pub last: u64,
    #[serde(default)]
    pub fav: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub oral: bool,
    #[serde(rename = "oralSeconds", default = "default_oral_seconds")]
    pub oral_seconds: u32,
}

fn default_theme() -> String { "auto".to_string() }
fn default_oral_seconds() -> u32 { 60 }

impl Default for Settings {
    fn default() -> Self {
        Settings { theme: default_theme(), oral: false, oral_seconds: default_oral_seconds() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UserState {
    #[serde(default = "state_version")]
    pub version: u32,
    #[serde(default)]
    pub q: HashMap<String, Progress>,
    #[serde(default)]
    pub days: HashMap<String, u32>,
    #[serde(rename = "wrongToday", default)]
    pub wrong_today: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub deck: Option<Deck>,
}

fn state_version() -> u32 { 2 }

impl Default for UserState {
    fn default() -> Self {
        UserState {
            version: 2,
            q: HashMap::new(),
            days: HashMap::new(),
            wrong_today: HashMap::new(),
            settings: Settings::default(),
            deck: None,
        }
    }
}
```

- [ ] **Step 4: 写 Filter / Deck / Grade / Verdict**

```rust
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Scope { Wrong, Unmastered, Fav, ResumeRisk }

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Mode { Smart, Ordered, Random }

impl Default for Mode {
    fn default() -> Self { Mode::Smart }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Filter {
    #[serde(default)]
    pub cats: Vec<String>,
    #[serde(default)]
    pub levels: Vec<u8>,
    #[serde(default)]
    pub types: Vec<QType>,
    #[serde(default)]
    pub scopes: Vec<Scope>,
    #[serde(default)]
    pub mode: Mode,
    #[serde(default)]
    pub keyword: String,
    #[serde(default)]
    pub seed: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Deck {
    pub ids: Vec<String>,
    pub pos: usize,
    pub filter: Filter,
    pub seed: u64,
    pub bank_hash: u64,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Grade { Know, Fuzzy, No }

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Verdict {
    pub correct: bool,
    pub expected: Vec<usize>,
    pub picked: Vec<usize>,
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cargo test --lib models
```

预期：6 个测试全部 PASS。特别确认 `user_state_writes_camel_case_keys` 通过 —— 这条守着老用户进度不丢。

- [ ] **Step 6: Commit**

```bash
git add src-rust/models.rs
git commit -m "feat(core): add UserState/Filter/Deck with v1 archive compat"
```

---

### Task 5: Catalog 与题库指纹

**Files:**
- Create: `src-rust/catalog.rs`

**Interfaces:**
- Consumes: `Question`, `CategoryMeta`（Task 3）。
- Produces: `Catalog::new(all, cats) -> Catalog`、`Catalog::len()`、`Catalog::get(idx) -> Option<&Question>`、`Catalog::by_cat(cat) -> &[usize]`、`Catalog::cats() -> &[CategoryMeta]`、`Catalog::cat_meta(id) -> Option<&CategoryMeta>`、`Catalog::index_of(id) -> Option<usize>`、`Catalog::bank_hash() -> u64`。

- [ ] **Step 1: 写失败测试**

```rust
// src-rust/catalog.rs 末尾
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;

    fn q(id: &str, cat: &str) -> Question {
        Question {
            id: id.into(), cat: cat.into(), q: "题".into(), a: "答".into(),
            qtype: QType::Qa, options: vec![], answer: Answer::None,
            level: 1, tags: vec![], resume: false, followup: vec![],
        }
    }

    fn cat(id: &str) -> CategoryMeta {
        CategoryMeta { id: id.into(), name: id.into(), desc: String::new() }
    }

    #[test]
    fn by_cat_preserves_original_order() {
        let c = Catalog::new(
            vec![q("a-1", "a"), q("b-1", "b"), q("a-2", "a")],
            vec![cat("a"), cat("b")],
        );
        assert_eq!(c.by_cat("a"), &[0, 2], "同分类下标应按题库原始顺序");
        assert_eq!(c.by_cat("b"), &[1]);
        assert!(c.by_cat("nope").is_empty(), "未知分类返回空切片而不是 panic");
    }

    #[test]
    fn index_of_finds_question_by_id() {
        let c = Catalog::new(vec![q("a-1", "a"), q("a-2", "a")], vec![cat("a")]);
        assert_eq!(c.index_of("a-2"), Some(1));
        assert_eq!(c.index_of("missing"), None);
    }

    #[test]
    fn bank_hash_is_order_independent_but_content_sensitive() {
        let c1 = Catalog::new(vec![q("a-1", "a"), q("a-2", "a")], vec![cat("a")]);
        let c2 = Catalog::new(vec![q("a-2", "a"), q("a-1", "a")], vec![cat("a")]);
        let c3 = Catalog::new(vec![q("a-1", "a"), q("a-3", "a")], vec![cat("a")]);
        assert_eq!(c1.bank_hash(), c2.bank_hash(), "同一组 id 换顺序，指纹不变");
        assert_ne!(c1.bank_hash(), c3.bank_hash(), "id 集合变了，指纹必须变");
    }

    #[test]
    fn empty_catalog_does_not_panic() {
        let c = Catalog::new(vec![], vec![]);
        assert_eq!(c.len(), 0);
        assert!(c.get(0).is_none());
        assert_eq!(c.bank_hash(), c.bank_hash());
    }
}
```

指纹设计成「与顺序无关、与 id 集合有关」：新增题目会改变指纹从而废弃旧卷（新题需要重新组卷才能出现），但仅调整 `index.html` 里文件顺序不该让用户的卷失效。

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --lib catalog
```

预期：`cannot find type Catalog in this scope`。

- [ ] **Step 3: 实现 Catalog**

```rust
use crate::models::{CategoryMeta, Question};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

pub struct Catalog {
    all: Vec<Question>,
    by_cat: HashMap<String, Vec<usize>>,
    cats: Vec<CategoryMeta>,
    cat_index: HashMap<String, usize>,
    id_index: HashMap<String, usize>,
    hash: u64,
}

impl Catalog {
    pub fn new(all: Vec<Question>, cats: Vec<CategoryMeta>) -> Self {
        let mut by_cat: HashMap<String, Vec<usize>> = HashMap::new();
        let mut id_index = HashMap::new();
        for (i, q) in all.iter().enumerate() {
            by_cat.entry(q.cat.clone()).or_default().push(i);
            id_index.insert(q.id.clone(), i);
        }
        let cat_index = cats.iter().enumerate().map(|(i, c)| (c.id.clone(), i)).collect();

        // 指纹：id 排序后逐个 hash，与声明顺序无关
        let mut ids: Vec<&str> = all.iter().map(|q| q.id.as_str()).collect();
        ids.sort_unstable();
        let mut h = DefaultHasher::new();
        all.len().hash(&mut h);
        for id in ids {
            id.hash(&mut h);
        }

        Catalog { all, by_cat, cats, cat_index, id_index, hash: h.finish() }
    }

    pub fn len(&self) -> usize { self.all.len() }
    pub fn is_empty(&self) -> bool { self.all.is_empty() }
    pub fn get(&self, idx: usize) -> Option<&Question> { self.all.get(idx) }
    pub fn all(&self) -> &[Question] { &self.all }
    pub fn cats(&self) -> &[CategoryMeta] { &self.cats }
    pub fn bank_hash(&self) -> u64 { self.hash }

    pub fn by_cat(&self, cat: &str) -> &[usize] {
        self.by_cat.get(cat).map(|v| v.as_slice()).unwrap_or(&[])
    }

    pub fn cat_meta(&self, id: &str) -> Option<&CategoryMeta> {
        self.cat_index.get(id).and_then(|&i| self.cats.get(i))
    }

    pub fn index_of(&self, id: &str) -> Option<usize> {
        self.id_index.get(id).copied()
    }
}
```

`DefaultHasher` 在同一次运行内稳定，跨 Rust 版本不保证 —— 这正好符合需求：`bank_hash` 只用于「和上次启动比对」，存进 UserState 后若因升级而变化，最坏结果是丢一次卷，不影响单题进度。

- [ ] **Step 4: 运行测试确认通过**

```bash
cargo test --lib catalog
```

预期：4 个测试全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src-rust/catalog.rs
git commit -m "feat(core): add Catalog with cat index and bank fingerprint"
```

---

### Task 6: Parser 与数据校验

**Files:**
- Create: `src-rust/parser.rs`

**Interfaces:**
- Consumes: `Catalog`（Task 5）、`Question` / `CategoryMeta`（Task 3）。
- Produces: `parse(questions_json, categories_json) -> Result<Catalog, ParseError>`、`health(catalog) -> Vec<String>`、`ParseError`（实现 `Display`）。

`categories_json` 的形状是 Task 2 产出的 `{ "cats": [...], "presets": {...} }`。

- [ ] **Step 1: 写失败测试**

```rust
// src-rust/parser.rs 末尾
#[cfg(test)]
mod tests {
    use super::*;

    const CATS: &str = r#"{"cats":[{"id":"c-lang","name":"C","desc":""}],"presets":{}}"#;

    fn qs(body: &str) -> String { format!("[{body}]") }

    #[test]
    fn parses_valid_bank() {
        let j = qs(r#"{"id":"c-001","cat":"c-lang","q":"题","a":"答","type":"qa"}"#);
        let c = parse(&j, CATS).unwrap();
        assert_eq!(c.len(), 1);
        assert_eq!(c.cats().len(), 1);
    }

    #[test]
    fn rejects_malformed_json() {
        assert!(parse("[{", CATS).is_err());
    }

    #[test]
    fn rejects_duplicate_ids() {
        let j = qs(r#"{"id":"c-001","cat":"c-lang","q":"a","a":"b","type":"qa"},
                     {"id":"c-001","cat":"c-lang","q":"c","a":"d","type":"qa"}"#);
        let e = parse(&j, CATS).unwrap_err().to_string();
        assert!(e.contains("c-001"), "错误信息应指出重复的 id，实际: {e}");
    }

    #[test]
    fn rejects_unknown_category() {
        let j = qs(r#"{"id":"x-1","cat":"nope","q":"a","a":"b","type":"qa"}"#);
        assert!(parse(&j, CATS).unwrap_err().to_string().contains("nope"));
    }

    #[test]
    fn rejects_out_of_range_level() {
        let j = qs(r#"{"id":"x-1","cat":"c-lang","q":"a","a":"b","type":"qa","level":9}"#);
        assert!(parse(&j, CATS).unwrap_err().to_string().contains("level"));
    }

    #[test]
    fn rejects_choice_with_out_of_bounds_answer() {
        let j = qs(r#"{"id":"x-1","cat":"c-lang","q":"a","a":"b","type":"single",
                      "options":["A","B"],"answer":[5]}"#);
        assert!(parse(&j, CATS).unwrap_err().to_string().contains("越界"));
    }

    #[test]
    fn rejects_qa_without_reference_answer() {
        let j = qs(r#"{"id":"x-1","cat":"c-lang","q":"a","a":"","type":"qa"}"#);
        assert!(parse(&j, CATS).is_err());
    }

    #[test]
    fn health_reports_registered_but_empty_category() {
        let cats = r#"{"cats":[{"id":"c-lang","name":"C","desc":""},
                              {"id":"os","name":"OS","desc":""}],"presets":{}}"#;
        let j = qs(r#"{"id":"c-001","cat":"c-lang","q":"a","a":"b","type":"qa"}"#);
        let c = parse(&j, cats).unwrap();
        let problems = health(&c);
        assert!(problems.iter().any(|p| p.contains("os")), "应报告 os 分类没有题目");
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --lib parser
```

预期：`cannot find function parse in this scope`。

- [ ] **Step 3: 实现 parser**

```rust
use crate::catalog::Catalog;
use crate::models::{Answer, CategoryMeta, QType, Question};
use serde::Deserialize;
use std::collections::HashSet;
use std::fmt;

#[derive(Deserialize)]
struct CatalogFile {
    cats: Vec<CategoryMeta>,
    #[serde(default)]
    #[allow(dead_code)]
    presets: std::collections::HashMap<String, Vec<String>>,
}

#[derive(Debug)]
pub enum ParseError {
    Json(String),
    Validation(Vec<String>),
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseError::Json(m) => write!(f, "JSON 解析失败: {m}"),
            ParseError::Validation(v) => write!(f, "题库校验失败: {}", v.join("; ")),
        }
    }
}

pub fn parse(questions_json: &str, categories_json: &str) -> Result<Catalog, ParseError> {
    let cat_file: CatalogFile =
        serde_json::from_str(categories_json).map_err(|e| ParseError::Json(e.to_string()))?;
    let questions: Vec<Question> =
        serde_json::from_str(questions_json).map_err(|e| ParseError::Json(e.to_string()))?;

    let known: HashSet<&str> = cat_file.cats.iter().map(|c| c.id.as_str()).collect();
    let mut seen: HashSet<&str> = HashSet::new();
    let mut errs = Vec::new();

    for q in &questions {
        if q.id.is_empty() {
            errs.push(format!("存在无 id 的题目: {}", q.q.chars().take(24).collect::<String>()));
            continue;
        }
        if !seen.insert(q.id.as_str()) {
            errs.push(format!("{}: id 重复", q.id));
        }
        if !known.contains(q.cat.as_str()) {
            errs.push(format!("{}: 分类 \"{}\" 未登记", q.id, q.cat));
        }
        if !(1..=3).contains(&q.level) {
            errs.push(format!("{}: level 应为 1~3，实际 {}", q.id, q.level));
        }
        if q.a.trim().is_empty() {
            errs.push(format!("{}: 缺少参考答案", q.id));
        }
        match q.qtype {
            QType::Single | QType::Multi => match &q.answer {
                Answer::Indices(v) if !v.is_empty() => {
                    if q.options.len() < 2 {
                        errs.push(format!("{}: 选择题至少要 2 个选项", q.id));
                    }
                    for &i in v {
                        if i >= q.options.len() {
                            errs.push(format!("{}: answer 索引 {} 越界", q.id, i));
                        }
                    }
                    if q.qtype == QType::Single && v.len() != 1 {
                        errs.push(format!("{}: 单选题只能有 1 个正确答案", q.id));
                    }
                }
                _ => errs.push(format!("{}: 选择题 answer 必须是非空索引数组", q.id)),
            },
            QType::Bool => {
                if !matches!(q.answer, Answer::Bool(_)) {
                    errs.push(format!("{}: 判断题 answer 必须是 true/false", q.id));
                }
            }
            QType::Qa => {}
        }
    }

    if !errs.is_empty() {
        return Err(ParseError::Validation(errs));
    }
    Ok(Catalog::new(questions, cat_file.cats))
}

/// 题库自检：分类登记与题目分布是否对得上。不阻断加载，供设置面板显示。
pub fn health(catalog: &Catalog) -> Vec<String> {
    let mut out = Vec::new();
    for c in catalog.cats() {
        if catalog.by_cat(&c.id).is_empty() {
            out.push(format!("分类 \"{}\" 已登记但一道题都没有", c.id));
        }
    }
    let registered: HashSet<&str> = catalog.cats().iter().map(|c| c.id.as_str()).collect();
    let mut orphans: Vec<&str> = catalog
        .all()
        .iter()
        .map(|q| q.cat.as_str())
        .filter(|c| !registered.contains(c))
        .collect();
    orphans.sort_unstable();
    orphans.dedup();
    for c in orphans {
        out.push(format!("分类 \"{}\" 有题目但未登记", c));
    }
    out
}
```

注意 `Answer::Indices(v) if !v.is_empty()` 这个 guard：untagged enum 会把 `[]` 也解析成 `Indices(vec![])`，不加 guard 就漏掉「选择题答案为空数组」这种脏数据。

- [ ] **Step 4: 运行测试确认通过**

```bash
cargo test --lib parser
```

预期：8 个测试全部 PASS。

- [ ] **Step 5: 用真实题库跑一遍**

加一个读真实文件的集成测试，确认 476 题能过校验：

```rust
// src-rust/parser.rs 的 tests 模块内
    #[test]
    fn real_bank_passes_validation() {
        let qs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/data/questions.json"))
            .expect("先运行 npm run migrate 生成 data/questions.json");
        let cs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/data/categories.json"))
            .unwrap();
        let c = parse(&qs, &cs).expect("真实题库应通过校验");
        assert_eq!(c.len(), 476, "题目总数必须是 476");
        assert_eq!(c.cats().len(), 19);
        assert!(health(&c).is_empty(), "真实题库自检应无问题: {:?}", health(&c));
    }
```

```bash
cargo test --lib parser
```

预期：9 个测试 PASS。若 `real_bank_passes_validation` 失败，说明迁移产物有问题或校验规则比旧 `bank.js` 严 —— 对照 `legacy/js/bank.js:21-49` 的规则确认，不要为了让测试过而放宽校验。

- [ ] **Step 6: Commit**

```bash
git add src-rust/parser.rs
git commit -m "feat(core): add parser with validation and health check"
```

---

### Task 7: Scheduler 筛选

**Files:**
- Create: `src-rust/scheduler.rs`

**Interfaces:**
- Consumes: `Catalog`（Task 5）、`Filter` / `UserState` / `Scope`（Task 4）。
- Produces: `Scheduler::new(catalog, state) -> Scheduler`、`Scheduler::select(&Filter) -> Vec<usize>`、`Scheduler::catalog() -> &Catalog`、`Scheduler::state() -> &UserState`、`Scheduler::state_mut() -> &mut UserState`。

维度之间是 AND，维度内部是 OR —— 与现有筛选面板行为一致。

- [ ] **Step 1: 写失败测试**

```rust
// src-rust/scheduler.rs 末尾
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;

    fn mk(id: &str, cat: &str, level: u8, qtype: QType, resume: bool) -> Question {
        Question {
            id: id.into(), cat: cat.into(), q: format!("题干 {id}"), a: "答案".into(),
            qtype, options: vec!["A".into(), "B".into()],
            answer: if matches!(qtype, QType::Single) { Answer::Indices(vec![0]) } else { Answer::None },
            level, tags: vec![], resume, followup: vec![],
        }
    }

    fn cat(id: &str) -> CategoryMeta {
        CategoryMeta { id: id.into(), name: id.into(), desc: String::new() }
    }

    /// 4 题：c-1(c,L1,single) c-2(c,L2,qa,resume) os-1(os,L1,qa) os-2(os,L3,single)
    fn fixture_catalog() -> Catalog {
        Catalog::new(
            vec![
                mk("c-1", "c-lang", 1, QType::Single, false),
                mk("c-2", "c-lang", 2, QType::Qa, true),
                mk("os-1", "os", 1, QType::Qa, false),
                mk("os-2", "os", 3, QType::Single, false),
            ],
            vec![cat("c-lang"), cat("os")],
        )
    }

    fn fixture() -> Scheduler {
        Scheduler::new(fixture_catalog(), UserState::default())
    }

    fn ids(s: &Scheduler, picked: &[usize]) -> Vec<String> {
        picked.iter().map(|&i| s.catalog().get(i).unwrap().id.clone()).collect()
    }

    #[test]
    fn empty_filter_selects_everything() {
        let s = fixture();
        assert_eq!(s.select(&Filter::default()).len(), 4);
    }

    #[test]
    fn filters_by_category() {
        let s = fixture();
        let f = Filter { cats: vec!["c-lang".into()], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1", "c-2"]);
    }

    #[test]
    fn filters_by_level_as_or_within_dimension() {
        let s = fixture();
        let f = Filter { levels: vec![1, 3], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1", "os-1", "os-2"]);
    }

    #[test]
    fn filters_by_type() {
        let s = fixture();
        let f = Filter { types: vec![QType::Single], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1", "os-2"]);
    }

    #[test]
    fn dimensions_combine_as_and() {
        let s = fixture();
        let f = Filter {
            cats: vec!["c-lang".into()],
            levels: vec![1],
            ..Default::default()
        };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1"]);
    }

    #[test]
    fn keyword_matches_question_and_answer_case_insensitively() {
        let s = fixture();
        let f = Filter { keyword: "题干 OS-1".into(), ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["os-1"]);
    }

    #[test]
    fn scope_fav_selects_only_favourites() {
        let mut st = UserState::default();
        st.q.insert("os-2".into(), Progress { fav: true, ..Default::default() });
        let s = Scheduler::new(fixture_catalog(), st);
        let f = Filter { scopes: vec![Scope::Fav], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["os-2"]);
    }

    #[test]
    fn scope_unmastered_excludes_box3() {
        let mut st = UserState::default();
        st.q.insert("c-1".into(), Progress { bx: 3, ..Default::default() });
        let s = Scheduler::new(fixture_catalog(), st);
        let f = Filter { scopes: vec![Scope::Unmastered], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-2", "os-1", "os-2"]);
    }

    #[test]
    fn scope_resume_risk_selects_flagged() {
        let s = fixture();
        let f = Filter { scopes: vec![Scope::ResumeRisk], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-2"]);
    }

    #[test]
    fn no_match_returns_empty_without_panic() {
        let s = fixture();
        let f = Filter { cats: vec!["nope".into()], ..Default::default() };
        assert!(s.select(&f).is_empty());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --lib scheduler
```

预期：`cannot find type Scheduler in this scope`。

- [ ] **Step 3: 实现 Scheduler 骨架与 select**

```rust
use crate::catalog::Catalog;
use crate::models::{Filter, Progress, QType, Scope, UserState};

pub struct Scheduler {
    catalog: Catalog,
    state: UserState,
    filter: Filter,
    pool: Vec<usize>,
    pos: usize,
}

impl Scheduler {
    pub fn new(catalog: Catalog, state: UserState) -> Self {
        Scheduler { catalog, state, filter: Filter::default(), pool: Vec::new(), pos: 0 }
    }

    pub fn catalog(&self) -> &Catalog { &self.catalog }
    pub fn state(&self) -> &UserState { &self.state }
    pub fn state_mut(&mut self) -> &mut UserState { &mut self.state }
    pub fn filter(&self) -> &Filter { &self.filter }

    fn progress_of(&self, id: &str) -> Progress {
        self.state.q.get(id).cloned().unwrap_or_default()
    }

    /// 按 filter 挑出命中的下标，保持题库原始顺序。维度间 AND，维度内 OR。
    pub fn select(&self, f: &Filter) -> Vec<usize> {
        let kw = f.keyword.trim().to_lowercase();
        let wrong_ids = self.wrong_today_ids();

        (0..self.catalog.len())
            .filter(|&i| {
                let q = match self.catalog.get(i) {
                    Some(q) => q,
                    None => return false,
                };
                if !f.cats.is_empty() && !f.cats.iter().any(|c| c == &q.cat) { return false; }
                if !f.levels.is_empty() && !f.levels.contains(&q.level) { return false; }
                if !f.types.is_empty() && !f.types.contains(&q.qtype) { return false; }
                if !kw.is_empty() {
                    let hay = format!("{} {} {}", q.q, q.a, q.tags.join(" ")).to_lowercase();
                    if !hay.contains(&kw) { return false; }
                }
                if !f.scopes.is_empty() {
                    let p = self.progress_of(&q.id);
                    let hit = f.scopes.iter().any(|s| match s {
                        Scope::Fav => p.fav,
                        Scope::Unmastered => p.bx < 3,
                        Scope::ResumeRisk => q.resume,
                        Scope::Wrong => wrong_ids.iter().any(|w| w == &q.id),
                    });
                    if !hit { return false; }
                }
                true
            })
            .collect()
    }

    fn wrong_today_ids(&self) -> Vec<String> {
        self.state
            .wrong_today
            .get(&today_key())
            .cloned()
            .unwrap_or_default()
    }
}
```

- [ ] **Step 4: 加时间辅助函数**

WASM 里没有 `std::time::SystemTime`（会 panic），走 JS 的 `Date`；测试时走 `std`，避免单测依赖浏览器。

```rust
// src-rust/scheduler.rs 顶部 use 之后
#[cfg(all(target_arch = "wasm32", not(test)))]
pub fn now_ms() -> u64 {
    js_sys::Date::now() as u64
}

#[cfg(not(all(target_arch = "wasm32", not(test))))]
pub fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// "YYYY-MM-DD"（本地时区），与现有存档的 days / wrongToday key 格式一致
pub fn today_key() -> String {
    #[cfg(all(target_arch = "wasm32", not(test)))]
    {
        let d = js_sys::Date::new_0();
        return format!("{:04}-{:02}-{:02}", d.get_full_year(), d.get_month() + 1, d.get_date());
    }
    #[cfg(not(all(target_arch = "wasm32", not(test))))]
    {
        ymd_from_ms(now_ms())
    }
}

/// 把 Unix 毫秒换算成 YYYY-MM-DD（UTC）。只在非 wasm 下使用。
#[cfg(not(all(target_arch = "wasm32", not(test))))]
pub fn ymd_from_ms(ms: u64) -> String {
    let days = (ms / 86_400_000) as i64;
    let (mut y, mut d) = (1970i64, days);
    loop {
        let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
        let len = if leap { 366 } else { 365 };
        if d < len { break; }
        d -= len;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let months = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0usize;
    while d >= months[m] { d -= months[m]; m += 1; }
    format!("{:04}-{:02}-{:02}", y, m + 1, d + 1)
}
```

在 `Cargo.toml` 的 `[dependencies]` 追加：

```toml
js-sys = "0.3"
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cargo test --lib scheduler
```

预期：10 个测试全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src-rust/scheduler.rs Cargo.toml
git commit -m "feat(core): add scheduler filtering with AND/OR semantics"
```

---

### Task 8: 三种排序模式（核心 bug 修复）

**Files:**
- Modify: `src-rust/scheduler.rs`

**Interfaces:**
- Consumes: Task 7 的 `Scheduler` 与 `select`。
- Produces: `Scheduler::order(&mut Vec<usize>, &Filter)`、`Scheduler::build(&Filter) -> usize`。

三种模式的排序键都必须是**全序**，不能有「相等元素顺序不定」，否则每次组卷顺序都会变。

| 模式 | 排序键 | 种子 |
|------|--------|------|
| `Ordered` | 题库原始下标升序 | 不需要 |
| `Smart` | `(bx, urgency, last, id)` 升序 | 不需要 |
| `Random` | Fisher-Yates，`StdRng::seed_from_u64(seed)` | `seed` 必填 |

- [ ] **Step 1: 写失败测试**

```rust
    #[test]
    fn ordered_mode_follows_bank_declaration_order() {
        let mut s = fixture();
        let f = Filter { mode: Mode::Ordered, ..Default::default() };
        s.build(&f);
        assert_eq!(s.pool_ids(), vec!["c-1", "c-2", "os-1", "os-2"]);
    }

    #[test]
    fn ordered_mode_is_reproducible() {
        let f = Filter { mode: Mode::Ordered, ..Default::default() };
        let mut a = fixture(); a.build(&f);
        let mut b = fixture(); b.build(&f);
        assert_eq!(a.pool_ids(), b.pool_ids());
    }

    #[test]
    fn smart_mode_puts_lower_box_first() {
        let mut st = UserState::default();
        st.q.insert("c-1".into(), Progress { bx: 3, last: 1000, ..Default::default() });
        st.q.insert("c-2".into(), Progress { bx: 2, last: 1000, ..Default::default() });
        st.q.insert("os-1".into(), Progress { bx: 1, last: 1000, ..Default::default() });
        // os-2 无记录 => bx 0
        let mut s = Scheduler::new(fixture_catalog(), st);
        s.build(&Filter { mode: Mode::Smart, ..Default::default() });
        assert_eq!(s.pool_ids(), vec!["os-2", "os-1", "c-2", "c-1"]);
    }

    #[test]
    fn smart_mode_breaks_box_ties_by_last_then_id() {
        let mut st = UserState::default();
        // 同盒同时间 => 只能靠 id 兜底，保证全序
        for id in ["c-1", "c-2", "os-1", "os-2"] {
            st.q.insert(id.into(), Progress { bx: 1, last: 500, ..Default::default() });
        }
        let mut s = Scheduler::new(fixture_catalog(), st);
        s.build(&Filter { mode: Mode::Smart, ..Default::default() });
        assert_eq!(s.pool_ids(), vec!["c-1", "c-2", "os-1", "os-2"], "同键时按 id 字典序");
    }

    #[test]
    fn smart_mode_is_reproducible_across_rebuilds() {
        let mut st = UserState::default();
        st.q.insert("c-1".into(), Progress { bx: 1, right: 1, wrong: 4, last: 900, ..Default::default() });
        st.q.insert("os-1".into(), Progress { bx: 1, right: 5, wrong: 0, last: 900, ..Default::default() });
        let f = Filter { mode: Mode::Smart, ..Default::default() };
        let mut a = Scheduler::new(fixture_catalog(), st.clone()); a.build(&f);
        let mut b = Scheduler::new(fixture_catalog(), st.clone()); b.build(&f);
        assert_eq!(a.pool_ids(), b.pool_ids(), "Smart 必须无随机、可复现");
        // 错多于对的排在同盒里更前面
        let ids = a.pool_ids();
        let pc = ids.iter().position(|x| x == "c-1").unwrap();
        let po = ids.iter().position(|x| x == "os-1").unwrap();
        assert!(pc < po, "错多于对的题应加急");
    }

    #[test]
    fn random_mode_same_seed_same_order() {
        let f = Filter { mode: Mode::Random, seed: Some(42), ..Default::default() };
        let mut a = fixture(); a.build(&f);
        let mut b = fixture(); b.build(&f);
        assert_eq!(a.pool_ids(), b.pool_ids(), "同 seed 必须同顺序");
    }

    #[test]
    fn random_mode_different_seed_usually_differs() {
        let mut a = fixture();
        a.build(&Filter { mode: Mode::Random, seed: Some(1), ..Default::default() });
        let mut b = fixture();
        b.build(&Filter { mode: Mode::Random, seed: Some(999), ..Default::default() });
        assert_ne!(a.pool_ids(), b.pool_ids());
    }

    #[test]
    fn random_mode_without_seed_still_deterministic() {
        // seed 缺失时回退到固定值，绝不能读系统熵源
        let f = Filter { mode: Mode::Random, seed: None, ..Default::default() };
        let mut a = fixture(); a.build(&f);
        let mut b = fixture(); b.build(&f);
        assert_eq!(a.pool_ids(), b.pool_ids());
    }

    #[test]
    fn build_returns_pool_size_and_resets_position() {
        let mut s = fixture();
        assert_eq!(s.build(&Filter::default()), 4);
        assert_eq!(s.position(), 0);
    }
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --lib scheduler
```

预期：`no method named build found` / `no method named pool_ids found`。

- [ ] **Step 3: 实现排序与 build**

```rust
// 顶部追加
use crate::models::Mode;
use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::SeedableRng;

impl Scheduler {
    /// 排序键必须是全序，否则每次组卷顺序会变 —— 这是 v1 的核心 bug。
    fn order(&self, pool: &mut Vec<usize>, f: &Filter) {
        match f.mode {
            // select 已按原始下标升序产出，无需再排
            Mode::Ordered => {}
            Mode::Smart => {
                pool.sort_by(|&a, &b| self.smart_key(a).cmp(&self.smart_key(b)));
            }
            Mode::Random => {
                let seed = f.seed.unwrap_or(0);
                let mut rng = StdRng::seed_from_u64(seed);
                pool.shuffle(&mut rng);
            }
        }
    }

    /// (盒号, 紧急度, 上次作答时间, id) —— 全序、无随机、可复现。
    /// urgency: 0 = 加急（错多于对，或简历高危题），1 = 普通。
    fn smart_key(&self, idx: usize) -> (u8, u8, u64, String) {
        let q = match self.catalog.get(idx) {
            Some(q) => q,
            None => return (u8::MAX, 1, u64::MAX, String::new()),
        };
        let p = self.progress_of(&q.id);
        let urgent = p.wrong > p.right || q.resume;
        (p.bx, if urgent { 0 } else { 1 }, p.last, q.id.clone())
    }

    /// 组卷：筛选 + 排序，重置到第一题。返回题数，0 表示无命中。
    pub fn build(&mut self, f: &Filter) -> usize {
        let mut pool = self.select(f);
        self.order(&mut pool, f);
        self.pool = pool;
        self.pos = 0;
        self.filter = f.clone();
        self.pool.len()
    }

    /// 测试与持久化用：当前卷的 id 列表
    pub fn pool_ids(&self) -> Vec<String> {
        self.pool
            .iter()
            .filter_map(|&i| self.catalog.get(i).map(|q| q.id.clone()))
            .collect()
    }
}
```

`Mode::Ordered` 分支留空是有意的：`select` 用 `(0..len).filter(...)` 产出，天然是原始下标升序，再排一次是多余工作。测试 `ordered_mode_follows_bank_declaration_order` 守着这个假设 —— 如果将来 `select` 改成并行或换实现，测试会立刻失败。

- [ ] **Step 4: 运行测试确认通过**

```bash
cargo test --lib scheduler
```

预期：19 个测试全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src-rust/scheduler.rs
git commit -m "fix(core): make all three sort modes total-ordered and reproducible"
```

---

### Task 9: 导航与卷持久化（进度丢失修复）

**Files:**
- Modify: `src-rust/scheduler.rs`

**Interfaces:**
- Consumes: Task 8 的 `build` / `pool_ids`。
- Produces: `Scheduler::current() -> Option<&Question>`、`position()`、`size()`、`is_finished()`、`advance()`、`back() -> bool`、`goto(pos)`、`save_deck()`、`restore_deck() -> bool`。

- [ ] **Step 1: 写失败测试**

```rust
    #[test]
    fn navigation_walks_pool_and_stops_at_end() {
        let mut s = fixture();
        s.build(&Filter { mode: Mode::Ordered, ..Default::default() });
        assert_eq!(s.current().unwrap().id, "c-1");
        s.advance();
        assert_eq!(s.current().unwrap().id, "c-2");
        assert_eq!(s.position(), 1);
        s.advance(); s.advance();
        assert_eq!(s.current().unwrap().id, "os-2");
        s.advance();
        assert!(s.is_finished(), "走完 4 题应进入完成态");
        assert!(s.current().is_none());
        s.advance(); // 已完成再前进不该越界
        assert_eq!(s.position(), 4);
    }

    #[test]
    fn back_returns_false_at_first_question() {
        let mut s = fixture();
        s.build(&Filter { mode: Mode::Ordered, ..Default::default() });
        assert!(!s.back(), "首题回退应返回 false");
        s.advance();
        assert!(s.back());
        assert_eq!(s.current().unwrap().id, "c-1");
    }

    #[test]
    fn goto_clamps_out_of_range() {
        let mut s = fixture();
        s.build(&Filter::default());
        s.goto(999);
        assert_eq!(s.position(), 4, "越界 goto 应夹到完成态而不是 panic");
        s.goto(2);
        assert_eq!(s.position(), 2);
    }

    #[test]
    fn empty_pool_reports_finished_without_panic() {
        let mut s = fixture();
        assert_eq!(s.build(&Filter { cats: vec!["nope".into()], ..Default::default() }), 0);
        assert!(s.is_finished());
        assert!(s.current().is_none());
        assert!(!s.back());
    }

    #[test]
    fn restore_deck_resumes_exact_position() {
        let mut s = fixture();
        s.build(&Filter { mode: Mode::Random, seed: Some(7), ..Default::default() });
        s.advance();
        s.advance();
        let expected_ids = s.pool_ids();
        let json = serde_json::to_string(s.state()).unwrap();

        // 模拟「关掉再打开」
        let restored: UserState = serde_json::from_str(&json).unwrap();
        let mut s2 = Scheduler::new(fixture_catalog(), restored);
        assert!(s2.restore_deck(), "题库未变，应恢复成功");
        assert_eq!(s2.position(), 2, "应停在关掉时那一题");
        assert_eq!(s2.pool_ids(), expected_ids, "卷的顺序必须一模一样");
    }

    #[test]
    fn restore_deck_rejects_deck_from_changed_bank() {
        let mut s = fixture();
        s.build(&Filter::default());
        s.advance();
        let json = serde_json::to_string(s.state()).unwrap();

        // 题库变了：多一道题
        let mut all: Vec<Question> = fixture_catalog().all().to_vec();
        all.push(mk("os-3", "os", 1, QType::Qa, false));
        let bigger = Catalog::new(all, vec![cat("c-lang"), cat("os")]);

        let restored: UserState = serde_json::from_str(&json).unwrap();
        let mut s2 = Scheduler::new(bigger, restored);
        assert!(!s2.restore_deck(), "题库变了应拒绝旧卷");
    }

    #[test]
    fn restore_deck_returns_false_when_no_deck_saved() {
        let mut s = fixture();
        assert!(!s.restore_deck());
    }

    #[test]
    fn restore_deck_drops_ids_no_longer_in_bank() {
        // 卷里有已删除的题：整卷作废，不能静默跳过导致 pos 错位
        let mut st = UserState::default();
        st.deck = Some(Deck {
            ids: vec!["c-1".into(), "deleted-1".into(), "os-1".into()],
            pos: 1,
            filter: Filter::default(),
            seed: 0,
            bank_hash: fixture_catalog().bank_hash(),
        });
        let mut s = Scheduler::new(fixture_catalog(), st);
        assert!(!s.restore_deck(), "卷里含不存在的 id，应作废");
    }
```

`fixture()` 需要拆出 `fixture_catalog()`（Task 7 已按此写法），并给 `UserState` 加 `Clone`（Task 4 已加）。

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --lib scheduler
```

预期：`no method named current found`。

- [ ] **Step 3: 实现导航**

```rust
// 顶部追加
use crate::models::{Deck, Question};

impl Scheduler {
    pub fn size(&self) -> usize { self.pool.len() }
    pub fn position(&self) -> usize { self.pos }
    pub fn is_finished(&self) -> bool { self.pos >= self.pool.len() }

    pub fn current(&self) -> Option<&Question> {
        self.pool.get(self.pos).and_then(|&i| self.catalog.get(i))
    }

    pub fn advance(&mut self) {
        if self.pos < self.pool.len() {
            self.pos += 1;
        }
    }

    pub fn back(&mut self) -> bool {
        if self.pos == 0 {
            return false;
        }
        self.pos -= 1;
        true
    }

    pub fn goto(&mut self, pos: usize) {
        self.pos = pos.min(self.pool.len());
    }
}
```

`pos == pool.len()` 表示完成态 —— 比用 `Option<usize>` 少一层解包，且 `advance` 的边界检查只有一处。

- [ ] **Step 4: 实现卷的存取**

```rust
impl Scheduler {
    /// 把当前卷写进 state，供 TS 落盘。每次组卷/前进/后退后调用。
    pub fn save_deck(&mut self) {
        if self.pool.is_empty() {
            self.state.deck = None;
            return;
        }
        self.state.deck = Some(Deck {
            ids: self.pool_ids(),
            pos: self.pos,
            filter: self.filter.clone(),
            seed: self.filter.seed.unwrap_or(0),
            bank_hash: self.catalog.bank_hash(),
        });
    }

    /// 恢复上次未刷完的卷。题库变过或卷里有已删除的题则返回 false。
    pub fn restore_deck(&mut self) -> bool {
        let deck = match self.state.deck.clone() {
            Some(d) => d,
            None => return false,
        };
        if deck.bank_hash != self.catalog.bank_hash() {
            self.state.deck = None;
            return false;
        }
        let mut pool = Vec::with_capacity(deck.ids.len());
        for id in &deck.ids {
            match self.catalog.index_of(id) {
                Some(i) => pool.push(i),
                None => {
                    // 静默跳过会让 pos 指向别的题，宁可整卷作废
                    self.state.deck = None;
                    return false;
                }
            }
        }
        self.pos = deck.pos.min(pool.len());
        self.pool = pool;
        self.filter = deck.filter;
        true
    }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cargo test --lib scheduler
```

预期：27 个测试全部 PASS。`restore_deck_resumes_exact_position` 是「进度丢失」的正面回归测试。

- [ ] **Step 6: Commit**

```bash
git add src-rust/scheduler.rs
git commit -m "fix(core): persist deck so sessions resume at the same question"
```

---

### Task 10: 判卷与作答记录

**Files:**
- Modify: `src-rust/scheduler.rs`

**Interfaces:**
- Consumes: Task 9 的导航。
- Produces: `Scheduler::judge(id, picked) -> Verdict`、`Scheduler::record(id, Grade)`、`Scheduler::toggle_fav(id) -> bool`、`Scheduler::distribution(pool) -> [usize; 4]`。

**这是 spec 修正点 1 落地处**：`fuzzy` 实现为 `bx = max(1, bx)`（保底不降级、不计 wrong、不进错题本），与 `legacy/js/store.js:103-104` 一致。

- [ ] **Step 1: 写失败测试**

```rust
    #[test]
    fn judge_single_choice() {
        let s = fixture(); // c-1 是 single，答案 [0]
        let v = s.judge("c-1", &[0]);
        assert!(v.correct);
        assert_eq!(v.expected, vec![0]);
        assert!(!s.judge("c-1", &[1]).correct);
    }

    #[test]
    fn judge_multi_choice_ignores_pick_order() {
        let mut all: Vec<Question> = fixture_catalog().all().to_vec();
        all.push(Question {
            id: "m-1".into(), cat: "os".into(), q: "多选".into(), a: "答".into(),
            qtype: QType::Multi, options: vec!["A".into(), "B".into(), "C".into()],
            answer: Answer::Indices(vec![0, 2]), level: 1, tags: vec![],
            resume: false, followup: vec![],
        });
        let s = Scheduler::new(Catalog::new(all, vec![cat("c-lang"), cat("os")]), UserState::default());
        assert!(s.judge("m-1", &[2, 0]).correct, "选项顺序不影响判定");
        assert!(!s.judge("m-1", &[0]).correct, "少选算错");
        assert!(!s.judge("m-1", &[0, 1, 2]).correct, "多选算错");
    }

    #[test]
    fn judge_qa_is_always_correct() {
        let s = fixture(); // os-1 是 qa
        assert!(s.judge("os-1", &[]).correct, "简答题没有客观对错，交给用户自评");
    }

    #[test]
    fn judge_unknown_id_is_not_correct() {
        let s = fixture();
        assert!(!s.judge("missing", &[0]).correct);
    }

    #[test]
    fn record_know_promotes_box_capped_at_three() {
        let mut s = fixture();
        for expected in [1u8, 2, 3, 3] {
            s.record("c-1", Grade::Know);
            assert_eq!(s.state().q.get("c-1").unwrap().bx, expected);
        }
        let p = s.state().q.get("c-1").unwrap();
        assert_eq!(p.right, 4);
        assert_eq!(p.wrong, 0);
        assert_eq!(p.seen, 4);
        assert!(p.last > 0, "last 应写入时间戳");
    }

    #[test]
    fn record_fuzzy_floors_at_one_without_demoting() {
        let mut s = fixture();
        s.record("c-1", Grade::Fuzzy);
        assert_eq!(s.state().q.get("c-1").unwrap().bx, 1, "0 盒提到 1 盒");

        s.record("c-2", Grade::Know);
        s.record("c-2", Grade::Know); // c-2 到 2 盒
        s.record("c-2", Grade::Fuzzy);
        let p = s.state().q.get("c-2").unwrap();
        assert_eq!(p.bx, 2, "fuzzy 不降级（与 v1 行为一致，不是降回 1 盒）");
        assert_eq!(p.wrong, 0, "fuzzy 不计 wrong");
    }

    #[test]
    fn record_no_resets_box_and_marks_wrong_today() {
        let mut s = fixture();
        s.record("c-1", Grade::Know);
        s.record("c-1", Grade::Know); // 到 2 盒
        s.record("c-1", Grade::No);
        let p = s.state().q.get("c-1").unwrap();
        assert_eq!(p.bx, 1, "答错回 1 盒");
        assert_eq!(p.wrong, 1);
        let wrong = s.state().wrong_today.get(&today_key()).unwrap();
        assert!(wrong.contains(&"c-1".to_string()), "应进今日错题本");
    }

    #[test]
    fn record_bumps_daily_count_and_dedupes_wrong_list() {
        let mut s = fixture();
        s.record("c-1", Grade::No);
        s.record("c-1", Grade::No);
        assert_eq!(*s.state().days.get(&today_key()).unwrap(), 2, "每次作答都计入当日题量");
        assert_eq!(s.state().wrong_today.get(&today_key()).unwrap().len(), 1, "错题本按 id 去重");
    }

    #[test]
    fn toggle_fav_flips_and_reports() {
        let mut s = fixture();
        assert!(s.toggle_fav("c-1"));
        assert!(s.state().q.get("c-1").unwrap().fav);
        assert!(!s.toggle_fav("c-1"));
    }

    #[test]
    fn distribution_counts_each_box() {
        let mut st = UserState::default();
        st.q.insert("c-1".into(), Progress { bx: 3, ..Default::default() });
        st.q.insert("c-2".into(), Progress { bx: 1, ..Default::default() });
        st.q.insert("os-1".into(), Progress { bx: 1, ..Default::default() });
        let s = Scheduler::new(fixture_catalog(), st);
        let pool = s.select(&Filter::default());
        assert_eq!(s.distribution(&pool), [1, 2, 0, 1], "[未练, 生, 熟, 已掌握]");
    }
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --lib scheduler
```

预期：`no method named judge found`。

- [ ] **Step 3: 实现判卷**

```rust
// 顶部追加
use crate::models::{Answer, Grade, Verdict};

impl Scheduler {
    pub fn judge(&self, id: &str, picked: &[usize]) -> Verdict {
        let mut sorted: Vec<usize> = picked.to_vec();
        sorted.sort_unstable();
        sorted.dedup();

        let q = match self.catalog.index_of(id).and_then(|i| self.catalog.get(i)) {
            Some(q) => q,
            None => return Verdict { correct: false, expected: vec![], picked: sorted },
        };

        match (&q.qtype, &q.answer) {
            (QType::Single | QType::Multi, Answer::Indices(exp)) => {
                let mut e = exp.clone();
                e.sort_unstable();
                Verdict { correct: e == sorted, expected: e, picked: sorted }
            }
            (QType::Bool, Answer::Bool(b)) => {
                // 判断题用 picked[0]：0 = 错, 1 = 对
                let want = if *b { 1usize } else { 0usize };
                let got = sorted.first().copied();
                Verdict { correct: got == Some(want), expected: vec![want], picked: sorted }
            }
            // 简答题无客观对错，由用户点评分按钮自评
            (QType::Qa, _) => Verdict { correct: true, expected: vec![], picked: sorted },
            _ => Verdict { correct: false, expected: vec![], picked: sorted },
        }
    }
}
```

- [ ] **Step 4: 实现作答记录**

```rust
impl Scheduler {
    pub fn record(&mut self, id: &str, grade: Grade) {
        let day = today_key();
        let now = now_ms();

        let p = self.state.q.entry(id.to_string()).or_default();
        p.seen += 1;
        p.last = now;
        match grade {
            Grade::Know => {
                p.right += 1;
                p.bx = (p.bx + 1).min(3);
            }
            // 保底 1 盒但不降级 —— 与 v1 一致，保住 fuzzy 这一档粒度
            Grade::Fuzzy => {
                p.bx = p.bx.max(1);
            }
            Grade::No => {
                p.wrong += 1;
                p.bx = 1;
            }
        }

        *self.state.days.entry(day.clone()).or_insert(0) += 1;

        if matches!(grade, Grade::No) {
            let list = self.state.wrong_today.entry(day).or_default();
            if !list.iter().any(|x| x == id) {
                list.push(id.to_string());
            }
        }
    }

    pub fn toggle_fav(&mut self, id: &str) -> bool {
        let p = self.state.q.entry(id.to_string()).or_default();
        p.fav = !p.fav;
        p.fav
    }

    /// [未练, 生, 熟, 已掌握]
    pub fn distribution(&self, pool: &[usize]) -> [usize; 4] {
        let mut d = [0usize; 4];
        for &i in pool {
            if let Some(q) = self.catalog.get(i) {
                let bx = self.progress_of(&q.id).bx.min(3) as usize;
                d[bx] += 1;
            }
        }
        d
    }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cargo test --lib scheduler
```

预期：37 个测试全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src-rust/scheduler.rs
git commit -m "feat(core): add judge/record/toggle_fav preserving v1 grade semantics"
```

---

### Task 11: Stats 统计

**Files:**
- Create: `src-rust/stats.rs`

**Interfaces:**
- Consumes: `Catalog`（Task 5）、`UserState`（Task 4）、`Scheduler::distribution`（Task 10）。
- Produces: `OverallStats { total, seen, mastered, accuracy, today, streak, boxes }`、`CategoryStats { id, name, total, mastered, seen, accuracy }`、`HeatCell { date, count }`、`RiskStats { total, mastered, weak_ids }`，以及 `overall`、`by_category`、`weakest`、`heatmap`、`resume_risk` 五个函数。

- [ ] **Step 1: 写失败测试**

```rust
// src-rust/stats.rs 末尾
#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::Catalog;
    use crate::models::*;

    fn mk(id: &str, cat: &str, resume: bool) -> Question {
        Question {
            id: id.into(), cat: cat.into(), q: "题".into(), a: "答".into(),
            qtype: QType::Qa, options: vec![], answer: Answer::None,
            level: 1, tags: vec![], resume, followup: vec![],
        }
    }

    fn cat(id: &str, name: &str) -> CategoryMeta {
        CategoryMeta { id: id.into(), name: name.into(), desc: String::new() }
    }

    fn fx() -> (Catalog, UserState) {
        let c = Catalog::new(
            vec![
                mk("c-1", "c-lang", true),
                mk("c-2", "c-lang", false),
                mk("os-1", "os", false),
                mk("os-2", "os", false),
            ],
            vec![cat("c-lang", "C 语言核心"), cat("os", "操作系统原理")],
        );
        let mut st = UserState::default();
        st.q.insert("c-1".into(), Progress { bx: 3, right: 3, wrong: 1, seen: 4, last: 1000, fav: false });
        st.q.insert("c-2".into(), Progress { bx: 1, right: 0, wrong: 2, seen: 2, last: 1000, fav: false });
        st.q.insert("os-1".into(), Progress { bx: 3, right: 1, wrong: 0, seen: 1, last: 1000, fav: false });
        (c, st)
    }

    #[test]
    fn overall_counts_mastery_and_accuracy() {
        let (c, st) = fx();
        let o = overall(&st, &c);
        assert_eq!(o.total, 4);
        assert_eq!(o.seen, 3, "os-2 从未作答");
        assert_eq!(o.mastered, 2, "c-1 与 os-1 在 3 盒");
        // right=4, wrong=3 => 4/7
        assert!((o.accuracy - 4.0 / 7.0).abs() < 1e-9);
        assert_eq!(o.boxes, [1, 1, 0, 2], "[未练, 生, 熟, 已掌握]");
    }

    #[test]
    fn overall_on_empty_state_does_not_divide_by_zero() {
        let c = Catalog::new(vec![mk("a-1", "a", false)], vec![cat("a", "A")]);
        let o = overall(&UserState::default(), &c);
        assert_eq!(o.seen, 0);
        assert_eq!(o.accuracy, 0.0, "无作答时正确率为 0，不是 NaN");
    }

    #[test]
    fn by_category_follows_declaration_order() {
        let (c, st) = fx();
        let v = by_category(&st, &c);
        assert_eq!(v.iter().map(|x| x.id.as_str()).collect::<Vec<_>>(), vec!["c-lang", "os"]);
        assert_eq!(v[0].name, "C 语言核心");
        assert_eq!(v[0].total, 2);
        assert_eq!(v[0].mastered, 1);
    }

    #[test]
    fn weakest_ranks_by_mastery_rate_then_id() {
        let (c, st) = fx();
        let w = weakest(&st, &c, 2);
        // c-lang 掌握 1/2 = 0.5, os 掌握 1/2 = 0.5 => 同率按 id 兜底，保证结果稳定
        assert_eq!(w.len(), 2);
        assert_eq!(w[0].id, "c-lang");
    }

    #[test]
    fn weakest_skips_empty_categories() {
        let c = Catalog::new(
            vec![mk("a-1", "a", false)],
            vec![cat("a", "A"), cat("empty", "空分类")],
        );
        let w = weakest(&UserState::default(), &c, 5);
        assert!(w.iter().all(|x| x.id != "empty"), "没题的分类不该出现在最薄弱榜里");
    }

    #[test]
    fn heatmap_returns_requested_span_with_zeros_filled() {
        let mut st = UserState::default();
        st.days.insert(crate::scheduler::today_key(), 7);
        let h = heatmap(&st, 30);
        assert_eq!(h.len(), 30);
        assert_eq!(h.last().unwrap().count, 7, "最后一格是今天");
        assert_eq!(h.first().unwrap().count, 0, "没刷的日子补 0");
    }

    #[test]
    fn resume_risk_reports_unmastered_flagged_questions() {
        let mut st = UserState::default();
        // c-1 是 resume 题，只到 1 盒
        st.q.insert("c-1".into(), Progress { bx: 1, ..Default::default() });
        let (c, _) = fx();
        let r = resume_risk(&st, &c);
        assert_eq!(r.total, 1, "题库里只有 c-1 打了 resume 标记");
        assert_eq!(r.mastered, 0);
        assert_eq!(r.weak_ids, vec!["c-1"]);
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --lib stats
```

预期：`cannot find function overall in this scope`。

- [ ] **Step 3: 实现统计结构体与 overall**

```rust
use crate::catalog::Catalog;
use crate::models::UserState;
use crate::scheduler::today_key;
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct OverallStats {
    pub total: usize,
    pub seen: usize,
    pub mastered: usize,
    pub accuracy: f64,
    pub today: u32,
    pub streak: u32,
    pub boxes: [usize; 4],
}

pub fn overall(state: &UserState, catalog: &Catalog) -> OverallStats {
    let mut boxes = [0usize; 4];
    let (mut seen, mut right, mut wrong) = (0usize, 0u32, 0u32);

    for q in catalog.all() {
        let p = state.q.get(&q.id);
        let bx = p.map(|p| p.bx.min(3)).unwrap_or(0) as usize;
        boxes[bx] += 1;
        if let Some(p) = p {
            if p.seen > 0 { seen += 1; }
            right += p.right;
            wrong += p.wrong;
        }
    }

    let answered = right + wrong;
    OverallStats {
        total: catalog.len(),
        seen,
        mastered: boxes[3],
        accuracy: if answered == 0 { 0.0 } else { right as f64 / answered as f64 },
        today: state.days.get(&today_key()).copied().unwrap_or(0),
        streak: streak(state),
        boxes,
    }
}

/// 连续打卡天数（含今天；今天没刷则从昨天往前数），与 legacy/js/store.js:122 行为一致
fn streak(state: &UserState) -> u32 {
    let mut n = 0u32;
    let mut offset: i64 = if state.days.contains_key(&today_key()) { 0 } else { 1 };
    for _ in 0..400 {
        let key = day_key_offset(offset);
        if !state.days.contains_key(&key) { break; }
        n += 1;
        offset += 1;
    }
    n
}
```

- [ ] **Step 4: 加日期偏移辅助并实现分类统计**

```rust
/// 今天往前数 offset 天的 "YYYY-MM-DD"
fn day_key_offset(offset: i64) -> String {
    #[cfg(all(target_arch = "wasm32", not(test)))]
    {
        let d = js_sys::Date::new_0();
        d.set_date(d.get_date() - offset as u32);
        return format!("{:04}-{:02}-{:02}", d.get_full_year(), d.get_month() + 1, d.get_date());
    }
    #[cfg(not(all(target_arch = "wasm32", not(test))))]
    {
        let ms = crate::scheduler::now_ms() as i64 - offset * 86_400_000;
        crate::scheduler::ymd_from_ms(ms.max(0) as u64)
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct CategoryStats {
    pub id: String,
    pub name: String,
    pub total: usize,
    pub mastered: usize,
    pub seen: usize,
    pub accuracy: f64,
}

pub fn by_category(state: &UserState, catalog: &Catalog) -> Vec<CategoryStats> {
    catalog
        .cats()
        .iter()
        .map(|c| {
            let idxs = catalog.by_cat(&c.id);
            let (mut mastered, mut seen, mut right, mut wrong) = (0usize, 0usize, 0u32, 0u32);
            for &i in idxs {
                if let Some(q) = catalog.get(i) {
                    if let Some(p) = state.q.get(&q.id) {
                        if p.bx >= 3 { mastered += 1; }
                        if p.seen > 0 { seen += 1; }
                        right += p.right;
                        wrong += p.wrong;
                    }
                }
            }
            let answered = right + wrong;
            CategoryStats {
                id: c.id.clone(),
                name: c.name.clone(),
                total: idxs.len(),
                mastered,
                seen,
                accuracy: if answered == 0 { 0.0 } else { right as f64 / answered as f64 },
            }
        })
        .collect()
}

/// 掌握率最低的 n 个分类。同率按 id 兜底，保证榜单稳定。
pub fn weakest(state: &UserState, catalog: &Catalog, n: usize) -> Vec<CategoryStats> {
    let mut v: Vec<CategoryStats> =
        by_category(state, catalog).into_iter().filter(|c| c.total > 0).collect();
    v.sort_by(|a, b| {
        let ra = a.mastered as f64 / a.total as f64;
        let rb = b.mastered as f64 / b.total as f64;
        ra.partial_cmp(&rb).unwrap_or(std::cmp::Ordering::Equal).then_with(|| a.id.cmp(&b.id))
    });
    v.truncate(n);
    v
}
```

- [ ] **Step 5: 实现热力图与简历高危**

```rust
#[derive(Serialize, Clone, Debug)]
pub struct HeatCell {
    pub date: String,
    pub count: u32,
}

/// 最近 days 天，按时间升序，最后一格是今天。没刷的日子补 0。
pub fn heatmap(state: &UserState, days: usize) -> Vec<HeatCell> {
    (0..days)
        .rev()
        .map(|back| {
            let date = day_key_offset(back as i64);
            let count = state.days.get(&date).copied().unwrap_or(0);
            HeatCell { date, count }
        })
        .collect()
}

#[derive(Serialize, Clone, Debug)]
pub struct RiskStats {
    pub total: usize,
    pub mastered: usize,
    pub weak_ids: Vec<String>,
}

/// 简历高危题的掌握情况。weak_ids 按题库顺序，未掌握的排前面由 UI 决定展示几条。
pub fn resume_risk(state: &UserState, catalog: &Catalog) -> RiskStats {
    let mut total = 0usize;
    let mut mastered = 0usize;
    let mut weak_ids = Vec::new();
    for q in catalog.all().iter().filter(|q| q.resume) {
        total += 1;
        let bx = state.q.get(&q.id).map(|p| p.bx).unwrap_or(0);
        if bx >= 3 { mastered += 1; } else { weak_ids.push(q.id.clone()); }
    }
    RiskStats { total, mastered, weak_ids }
}
```

- [ ] **Step 6: 运行全部 Rust 测试**

```bash
cargo test
```

预期：models 6 + catalog 4 + parser 9 + scheduler 37 + stats 7 = 63 个测试全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add src-rust/stats.rs
git commit -m "feat(core): add stats module with deterministic ranking"
```

---

### Task 12: WASM 桥接（QuizEngine）

**Files:**
- Modify: `src-rust/lib.rs`

**Interfaces:**
- Consumes: Task 5–11 全部模块。
- Produces: 供 TS 调用的 `QuizEngine`：`new(questions_json, categories_json, state_json?)`、`build(filter_json) -> usize`、`restore_deck() -> bool`、`count(filter_json) -> JsValue`、`current() -> JsValue`、`position()`、`size()`、`is_finished()`、`advance()`、`back() -> bool`、`judge(picked: Vec<usize>) -> JsValue`、`record(grade: &str)`、`toggle_fav() -> bool`、`stats() -> JsValue`、`health() -> JsValue`、`cats() -> JsValue`、`state_json() -> String`、`is_dirty()`、`mark_clean()`。

- [ ] **Step 1: 写失败测试（原生侧，不需要浏览器）**

`wasm_bindgen` 方法在原生 target 下也能直接调用，所以桥接逻辑可以用普通 `cargo test` 覆盖。

```rust
// src-rust/lib.rs 末尾
#[cfg(test)]
mod engine_tests {
    use super::*;

    const CATS: &str = r#"{"cats":[{"id":"c-lang","name":"C","desc":""}],"presets":{}}"#;
    const QS: &str = r#"[
        {"id":"c-1","cat":"c-lang","q":"题一","a":"答一","type":"single","options":["A","B"],"answer":[0]},
        {"id":"c-2","cat":"c-lang","q":"题二","a":"答二","type":"qa"}
    ]"#;

    fn engine() -> QuizEngine {
        QuizEngine::new(QS, CATS, None).unwrap()
    }

    #[test]
    fn new_rejects_bad_bank() {
        assert!(QuizEngine::new("[{", CATS, None).is_err());
    }

    #[test]
    fn new_with_corrupt_state_falls_back_to_blank() {
        // 存档坏了不能拦住启动，否则用户永远打不开应用
        let e = QuizEngine::new(QS, CATS, Some("not json".into())).unwrap();
        assert_eq!(e.size(), 0);
        assert!(e.state_json().contains("\"version\""));
    }

    #[test]
    fn build_then_navigate_and_record() {
        let mut e = engine();
        let filter = r#"{"mode":"ordered"}"#;
        assert_eq!(e.build(filter), 2);
        assert_eq!(e.position(), 0);
        assert!(!e.is_finished());

        e.record("know");
        e.advance();
        assert_eq!(e.position(), 1);
        assert!(e.back());
        assert_eq!(e.position(), 0);

        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
        assert_eq!(s["q"]["c-1"]["box"], 1);
    }

    #[test]
    fn build_persists_deck_for_restore() {
        let mut e = engine();
        e.build(r#"{"mode":"random","seed":99}"#);
        e.advance();
        let saved = e.state_json();

        let mut e2 = QuizEngine::new(QS, CATS, Some(saved)).unwrap();
        assert!(e2.restore_deck());
        assert_eq!(e2.position(), 1);
    }

    #[test]
    fn record_is_noop_when_finished() {
        let mut e = engine();
        e.build(r#"{"mode":"ordered"}"#);
        e.advance(); e.advance();
        assert!(e.is_finished());
        e.record("know"); // 不该 panic，也不该乱记到别的题上
        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
        assert!(s["q"].get("c-1").is_none() || s["q"]["c-1"]["seen"] == 0);
    }

    #[test]
    fn invalid_grade_string_is_ignored() {
        let mut e = engine();
        e.build(r#"{"mode":"ordered"}"#);
        e.record("bogus");
        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
        assert!(s["q"].get("c-1").is_none(), "未知 grade 不该写进度");
    }

    #[test]
    fn bad_filter_json_builds_nothing() {
        let mut e = engine();
        assert_eq!(e.build("{oops"), 0);
    }

    #[test]
    fn dirty_flag_tracks_unsaved_changes() {
        let mut e = engine();
        e.build(r#"{"mode":"ordered"}"#);
        assert!(e.is_dirty());
        e.mark_clean();
        assert!(!e.is_dirty());
        e.record("no");
        assert!(e.is_dirty());
    }

    #[test]
    fn toggle_fav_targets_current_question() {
        let mut e = engine();
        e.build(r#"{"mode":"ordered"}"#);
        assert!(e.toggle_fav());
        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
        assert_eq!(s["q"]["c-1"]["fav"], true);
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --lib engine_tests
```

预期：`cannot find type QuizEngine in this scope`。

- [ ] **Step 3: 实现构造与内部辅助**

```rust
pub mod catalog;
pub mod models;
pub mod parser;
pub mod scheduler;
pub mod stats;

use models::{Filter, Grade};
use scheduler::Scheduler;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct QuizEngine {
    inner: Scheduler,
    dirty: bool,
}

impl QuizEngine {
    fn parse_filter(json: &str) -> Option<Filter> {
        serde_json::from_str(json).ok()
    }

    fn parse_grade(s: &str) -> Option<Grade> {
        match s {
            "know" => Some(Grade::Know),
            "fuzzy" => Some(Grade::Fuzzy),
            "no" => Some(Grade::No),
            _ => None,
        }
    }
}

#[wasm_bindgen]
impl QuizEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(
        questions_json: &str,
        categories_json: &str,
        state_json: Option<String>,
    ) -> Result<QuizEngine, JsError> {
        let catalog = parser::parse(questions_json, categories_json)
            .map_err(|e| JsError::new(&e.to_string()))?;

        // 存档损坏时退回空状态：丢进度也比打不开应用好
        let state = state_json
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();

        Ok(QuizEngine { inner: Scheduler::new(catalog, state), dirty: false })
    }

    /// 组卷，返回题数。filter_json 非法时返回 0。
    pub fn build(&mut self, filter_json: &str) -> usize {
        let f = match Self::parse_filter(filter_json) {
            Some(f) => f,
            None => return 0,
        };
        let n = self.inner.build(&f);
        self.inner.save_deck();
        self.dirty = true;
        n
    }

    /// 恢复上次未刷完的卷
    pub fn restore_deck(&mut self) -> bool {
        self.inner.restore_deck()
    }

    /// 筛选面板的实时计数
    pub fn count(&self, filter_json: &str) -> Result<JsValue, JsError> {
        let f = Self::parse_filter(filter_json).unwrap_or_default();
        let pool = self.inner.select(&f);
        let payload = serde_json::json!({
            "total": pool.len(),
            "boxes": self.inner.distribution(&pool),
        });
        serde_wasm_bindgen::to_value(&payload).map_err(|e| JsError::new(&e.to_string()))
    }
}
```

- [ ] **Step 4: 实现出题与作答**

```rust
#[wasm_bindgen]
impl QuizEngine {
    pub fn current(&self) -> Result<JsValue, JsError> {
        match self.inner.current() {
            Some(q) => serde_wasm_bindgen::to_value(q).map_err(|e| JsError::new(&e.to_string())),
            None => Ok(JsValue::NULL),
        }
    }

    pub fn position(&self) -> usize { self.inner.position() }
    pub fn size(&self) -> usize { self.inner.size() }
    pub fn is_finished(&self) -> bool { self.inner.is_finished() }

    pub fn advance(&mut self) {
        self.inner.advance();
        self.inner.save_deck();
        self.dirty = true;
    }

    pub fn back(&mut self) -> bool {
        let ok = self.inner.back();
        if ok {
            self.inner.save_deck();
            self.dirty = true;
        }
        ok
    }

    pub fn judge(&self, picked: Vec<usize>) -> Result<JsValue, JsError> {
        let id = match self.inner.current() {
            Some(q) => q.id.clone(),
            None => return Ok(JsValue::NULL),
        };
        let v = self.inner.judge(&id, &picked);
        serde_wasm_bindgen::to_value(&v).map_err(|e| JsError::new(&e.to_string()))
    }

    /// grade: "know" | "fuzzy" | "no"。未知值或已完成时静默忽略。
    pub fn record(&mut self, grade: &str) {
        let g = match Self::parse_grade(grade) {
            Some(g) => g,
            None => return,
        };
        let id = match self.inner.current() {
            Some(q) => q.id.clone(),
            None => return,
        };
        self.inner.record(&id, g);
        self.dirty = true;
    }

    pub fn toggle_fav(&mut self) -> bool {
        let id = match self.inner.current() {
            Some(q) => q.id.clone(),
            None => return false,
        };
        let v = self.inner.toggle_fav(&id);
        self.dirty = true;
        v
    }
}
```

- [ ] **Step 5: 实现统计与状态导出**

```rust
#[wasm_bindgen]
impl QuizEngine {
    pub fn stats(&self) -> Result<JsValue, JsError> {
        let st = self.inner.state();
        let cat = self.inner.catalog();
        let payload = serde_json::json!({
            "overall": stats::overall(st, cat),
            "byCategory": stats::by_category(st, cat),
            "weakest": stats::weakest(st, cat, 5),
            "heatmap": stats::heatmap(st, 182),
            "resumeRisk": stats::resume_risk(st, cat),
        });
        serde_wasm_bindgen::to_value(&payload).map_err(|e| JsError::new(&e.to_string()))
    }

    /// 题库自检：字符串数组，空数组表示无问题
    pub fn health(&self) -> Result<JsValue, JsError> {
        let problems = parser::health(self.inner.catalog());
        serde_wasm_bindgen::to_value(&problems).map_err(|e| JsError::new(&e.to_string()))
    }

    /// 分类元数据，按声明顺序 —— 筛选面板据此渲染 chips
    pub fn cats(&self) -> Result<JsValue, JsError> {
        serde_wasm_bindgen::to_value(self.inner.catalog().cats())
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// 导出状态给 TS 落盘
    pub fn state_json(&self) -> String {
        serde_json::to_string(self.inner.state()).unwrap_or_else(|_| "{}".to_string())
    }

    /// 导入状态（设置面板的「导入进度」）。校验失败返回 Err，不动现有状态。
    pub fn load_state_json(&mut self, json: &str) -> Result<(), JsError> {
        let st: models::UserState =
            serde_json::from_str(json).map_err(|e| JsError::new(&e.to_string()))?;
        *self.inner.state_mut() = st;
        self.dirty = true;
        Ok(())
    }

    pub fn is_dirty(&self) -> bool { self.dirty }
    pub fn mark_clean(&mut self) { self.dirty = false; }
}
```

- [ ] **Step 6: 运行测试确认通过**

```bash
cargo test
```

预期：63 + 9 = 72 个测试全部 PASS。

- [ ] **Step 7: 编译 WASM 并检查体积**

```bash
npm run wasm
ls -la pkg/
```

预期：生成 `pkg/embq_core_bg.wasm` 与 `pkg/embq_core.d.ts`。wasm 体积应在 200KB–400KB；若超过 1MB，检查 `Cargo.toml` 的 `[profile.release]` 是否生效（`wasm-pack build` 默认用 release）。

- [ ] **Step 8: Commit**

```bash
git add src-rust/lib.rs
git commit -m "feat(core): expose QuizEngine over wasm-bindgen"
```

---

### Task 13: Store（IndexedDB + localStorage 兜底）

**Files:**
- Create: `src/core/store.ts`
- Create: `src/core/store.test.ts`
- Modify: `package.json`（加 vitest 环境配置）
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: 无（纯 TS）。
- Produces: `loadState(): Promise<string | null>`、`saveState(json: string): Promise<void>`、`scheduleSave(json: string): void`、`flushNow(): Promise<void>`、`resetState(): Promise<void>`、`installFlushHooks(getJson: () => string): void`。

这是「进度丢失」的正面修复：IndexedDB 主 + localStorage 快照兜底 + 切后台强制 flush。

- [ ] **Step 1: 写 vitest 配置**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

```typescript
// src/test-setup.ts
import 'fake-indexeddb/auto';
```

`package.json` 的 devDependencies 追加 `"jsdom": "^25.0.0"`，然后 `npm install`。

- [ ] **Step 2: 写失败测试**

```typescript
// src/core/store.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushNow, loadState, resetState, saveState, scheduleSave } from './store';

const SAMPLE = JSON.stringify({ version: 2, q: { 'c-1': { box: 2 } } });

describe('store', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetState();
  });

  it('returns null on a fresh install', async () => {
    expect(await loadState()).toBeNull();
  });

  it('round-trips through IndexedDB', async () => {
    await saveState(SAMPLE);
    expect(await loadState()).toBe(SAMPLE);
  });

  it('mirrors every write to localStorage as a snapshot', async () => {
    await saveState(SAMPLE);
    expect(localStorage.getItem('embq.v2')).toBe(SAMPLE);
  });

  it('falls back to the v2 localStorage snapshot when IndexedDB is empty', async () => {
    localStorage.setItem('embq.v2', SAMPLE);
    expect(await loadState()).toBe(SAMPLE);
  });

  it('migrates a v1 localStorage archive when nothing else exists', async () => {
    const v1 = JSON.stringify({
      version: 1,
      q: { 'c-1': { box: 3, right: 2, wrong: 0, seen: 2, last: 111, fav: true } },
      days: { '2026-07-28': 5 },
      wrongToday: {},
      settings: { theme: 'dark', oral: false, oralSeconds: 60 },
    });
    localStorage.setItem('embq.v1', v1);

    const loaded = await loadState();
    expect(loaded).not.toBeNull();
    const parsed = JSON.parse(loaded!);
    expect(parsed.q['c-1'].box).toBe(3);
    expect(parsed.settings.theme).toBe('dark');
    expect(parsed.version).toBe(2);
    // 旧 key 保留一个版本周期，不删
    expect(localStorage.getItem('embq.v1')).toBe(v1);
    // 迁移结果应已写进 IndexedDB
    expect(await loadState()).toBe(loaded);
  });

  it('prefers IndexedDB over the localStorage snapshot', async () => {
    await saveState(SAMPLE);
    localStorage.setItem('embq.v2', JSON.stringify({ version: 2, q: { stale: true } }));
    expect(await loadState()).toBe(SAMPLE);
  });

  it('debounces scheduleSave into a single write', async () => {
    vi.useFakeTimers();
    scheduleSave('{"a":1}');
    scheduleSave('{"a":2}');
    scheduleSave('{"a":3}');
    await vi.advanceTimersByTimeAsync(400);
    vi.useRealTimers();
    expect(await loadState()).toBe('{"a":3}');
  });

  it('flushNow writes the pending value immediately', async () => {
    vi.useFakeTimers();
    scheduleSave(SAMPLE);
    vi.useRealTimers();
    await flushNow();
    expect(await loadState()).toBe(SAMPLE);
  });

  it('survives an unavailable IndexedDB by using localStorage only', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error 故意打坏
    globalThis.indexedDB = undefined;
    await saveState(SAMPLE);
    expect(localStorage.getItem('embq.v2')).toBe(SAMPLE);
    expect(await loadState()).toBe(SAMPLE);
    globalThis.indexedDB = original;
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
npm test -- store
```

预期：`Failed to resolve import "./store"`。

- [ ] **Step 4: 实现 IndexedDB 读写**

```typescript
// src/core/store.ts
const DB_NAME = 'embq';
const DB_VERSION = 2;
const STORE = 'state';
const KEY = 'current';
const LS_V2 = 'embq.v2';
const LS_V1 = 'embq.v1';
const DEBOUNCE_MS = 300;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function idbGet(db: IDBDatabase): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbPut(db: IDBDatabase, json: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(json, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
```

每个失败路径都 resolve 而不是 reject —— 持久化失败不该让 UI 崩掉，兜底层会接住。

- [ ] **Step 5: 实现 load / save / 旧数据迁移**

```typescript
/** v1 存档补齐 v2 新增字段。字段名本身两版一致，只是多了 deck。 */
function upgradeV1(raw: string): string | null {
  try {
    const s = JSON.parse(raw) as Record<string, unknown>;
    if (typeof s !== 'object' || s === null) return null;
    s.version = 2;
    s.q ??= {};
    s.days ??= {};
    s.wrongToday ??= {};
    s.settings ??= { theme: 'auto', oral: false, oralSeconds: 60 };
    s.deck ??= null;
    return JSON.stringify(s);
  } catch {
    return null;
  }
}

/**
 * 读顺序：IndexedDB → localStorage v2 快照 → localStorage v1 旧存档（自动迁移）→ null
 */
export async function loadState(): Promise<string | null> {
  const db = await openDb();
  if (db) {
    const hit = await idbGet(db);
    if (hit) return hit;
  }

  const snapshot = safeGetItem(LS_V2);
  if (snapshot) {
    if (db) await idbPut(db, snapshot);
    return snapshot;
  }

  const legacy = safeGetItem(LS_V1);
  if (legacy) {
    const upgraded = upgradeV1(legacy);
    if (upgraded) {
      // 旧 key 不删，保留一个版本周期作为回退
      if (db) await idbPut(db, upgraded);
      safeSetItem(LS_V2, upgraded);
      return upgraded;
    }
  }

  return null;
}

/** 双写：IndexedDB 为主，localStorage 留一份快照当救命绳 */
export async function saveState(json: string): Promise<void> {
  const db = await openDb();
  if (db) await idbPut(db, json);
  safeSetItem(LS_V2, json);
}

export async function resetState(): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  safeRemoveItem(LS_V2);
}

function safeGetItem(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSetItem(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* 配额满或被禁用，IndexedDB 还在 */ }
}
function safeRemoveItem(k: string): void {
  try { localStorage.removeItem(k); } catch { /* ignore */ }
}
```

- [ ] **Step 6: 实现 debounce 与强制 flush**

```typescript
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: string | null = null;

/** record() 后调用。300ms 内的连续调用合并成一次落盘。 */
export function scheduleSave(json: string): void {
  pending = json;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void flushNow(); }, DEBOUNCE_MS);
}

/** 立刻落盘待写值。切后台、关页面时调用。 */
export async function flushNow(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const json = pending;
  pending = null;
  if (json !== null) await saveState(json);
}

/**
 * 装上「切后台 / 关页面就落盘」的钩子。
 * v1 只有 debounce，切后台时那一档时间窗内的作答会丢 —— 这是进度丢失的第二个来源。
 */
export function installFlushHooks(getJson: () => string): void {
  const flush = () => {
    pending = getJson();
    // pagehide/visibilitychange 里没时间等 Promise，先同步写快照保底
    safeSetItem(LS_V2, pending);
    void flushNow();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
}
```

`installFlushHooks` 里先同步写 localStorage 再异步写 IndexedDB：页面关闭时 IndexedDB 事务可能来不及提交，同步的 localStorage 写入是唯一能保证落地的路径。

- [ ] **Step 7: 运行测试确认通过**

```bash
npm test -- store
```

预期：10 个测试全部 PASS。

- [ ] **Step 8: Commit**

```bash
git add src/core/store.ts src/core/store.test.ts src/test-setup.ts vitest.config.ts package.json
git commit -m "fix(store): IndexedDB primary with localStorage fallback and forced flush"
```

---

### Task 14: Scope 序列化对齐 DOM

**Files:**
- Modify: `src-rust/models.rs`

现有 DOM 是 `data-scope="resume"`（`index.html:74`），而 `Scope::ResumeRisk` 在 `rename_all = "lowercase"` 下会序列化成 `resumerisk`，两边对不上。视觉零变化是硬约束，不能改 HTML，所以改 Rust 侧的 rename。

**Interfaces:**
- Produces: `Scope` 的四个变体序列化为 `"wrong"` / `"unmastered"` / `"fav"` / `"resume"`，与 `index.html` 的 `data-scope` 值一一对应。

- [ ] **Step 1: 写失败测试**

```rust
    #[test]
    fn scope_serializes_to_dom_data_attribute_values() {
        // 必须与 index.html:71-74 的 data-scope 值逐字一致
        let f: Filter = serde_json::from_str(
            r#"{"scopes":["wrong","unmastered","fav","resume"]}"#,
        ).unwrap();
        assert_eq!(
            f.scopes,
            vec![Scope::Wrong, Scope::Unmastered, Scope::Fav, Scope::ResumeRisk]
        );
        let out = serde_json::to_string(&f.scopes).unwrap();
        assert_eq!(out, r#"["wrong","unmastered","fav","resume"]"#);
    }
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --lib models::tests::scope_serializes
```

预期：FAIL，`unknown variant "resume"`。

- [ ] **Step 3: 加 rename**

```rust
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Wrong,
    Unmastered,
    Fav,
    #[serde(rename = "resume")]
    ResumeRisk,
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cargo test
```

预期：73 个测试全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src-rust/models.rs
git commit -m "fix(core): align Scope serialization with existing data-scope values"
```

---

### Task 15: Markdown 渲染器平移

**Files:**
- Create: `src/core/markdown.ts`
- Create: `src/core/markdown.test.ts`
- Reference: `legacy/js/app.js:24-160`（`esc` 与 `renderMD`）

**Interfaces:**
- Consumes: 无。
- Produces: `renderMD(text: string): string`、`esc(s: string): string`。挂 `window.__renderMD` 测试钩子（保留 v1 行为）。

逻辑**不变**，只加类型标注。现有实现已跑过 476 道题的真实数据，重写等于把已验证的行为重新引入风险。

- [ ] **Step 1: 读旧实现**

```bash
sed -n '20,170p' legacy/js/app.js
```

把 `esc` 与 `renderMD` 的完整实现抄下来，逐段转成 TS。

- [ ] **Step 2: 写失败测试（锁定旧行为）**

```typescript
// src/core/markdown.test.ts
import { describe, expect, it } from 'vitest';
import { esc, renderMD } from './markdown';

describe('markdown', () => {
  it('escapes html before anything else', () => {
    expect(esc('<script>alert(1)</script>')).not.toContain('<script>');
    expect(renderMD('<img onerror=x>')).not.toContain('<img onerror');
  });

  it('renders fenced code blocks', () => {
    const out = renderMD('```c\nint x = 1;\n```');
    expect(out).toContain('<pre');
    expect(out).toContain('int x = 1;');
  });

  it('renders inline code', () => {
    expect(renderMD('用 `volatile` 修饰')).toContain('<code>volatile</code>');
  });

  it('renders tables', () => {
    const out = renderMD('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(out).toContain('<table');
    expect(out).toContain('<td');
  });

  it('renders blockquotes', () => {
    expect(renderMD('> 注意这里')).toContain('<blockquote');
  });

  it('renders bold and preserves chinese punctuation', () => {
    const out = renderMD('**重点**：不要漏掉');
    expect(out).toContain('<strong>重点</strong>');
    expect(out).toContain('：');
  });

  it('keeps backslashes in code intact', () => {
    expect(renderMD('`C:\\\\path`')).toContain('C:\\\\path');
  });

  it('does not throw on empty or undefined-ish input', () => {
    expect(renderMD('')).toBe('');
    expect(() => renderMD('\n\n\n')).not.toThrow();
  });
});
```

跑测试前先用旧实现验证期望值：在浏览器 console 里对 `legacy/js/app.js` 的 `window.__renderMD` 传同样输入，比对输出。**测试要锁定的是旧行为，不是我认为对的行为** —— 若某条期望与旧实现不符，改测试而不是改实现。

- [ ] **Step 3: 运行测试确认失败**

```bash
npm test -- markdown
```

预期：`Failed to resolve import "./markdown"`。

- [ ] **Step 4: 平移实现**

从 `legacy/js/app.js` 抄 `esc` 与 `renderMD`，改成：

```typescript
// src/core/markdown.ts
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, t: string, u: string) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
}

/* 表格：连续的 | 行 → <table>，第二行是分隔线则首行为表头 */
function tableHTML(rows: string[]): string {
  const isSep = (r: string): boolean => r.replace(/[|\s:\-]/g, '') === '';
  const parsed = rows.map((r) =>
    r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => inline(c.trim())));
  let html = '<div class="tblwrap"><table>';
  let start = 0;
  if (rows.length > 1 && isSep(rows[1]!)) {
    html += '<thead><tr>' + parsed[0]!.map((c) => `<th>${c}</th>`).join('') + '</tr></thead>';
    start = 2;
  }
  html += '<tbody>';
  for (let r = start; r < rows.length; r++) {
    if (isSep(rows[r]!)) continue;
    html += '<tr>' + parsed[r]!.map((c) => `<td>${c}</td>`).join('') + '</tr>';
  }
  return html + '</tbody></table></div>';
}

/* 引用块：> 行（去掉前缀后按空行分段，支持段内列表） */
function quoteHTML(qlines: string[]): string {
  let html = '';
  let para: string[] = [];
  let list: string[] = [];
  const fp = (): void => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const fl = (): void => {
    if (list.length) {
      html += '<ul>' + list.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>';
      list = [];
    }
  };
  for (const raw of qlines) {
    const ln = raw.trim();
    if (!ln) { fp(); fl(); continue; }
    if (/^[-*]\s+/.test(ln)) { fp(); list.push(ln.replace(/^[-*]\s+/, '')); continue; }
    fl(); para.push(ln);
  }
  fp(); fl();
  return `<blockquote>${html}</blockquote>`;
}

const CODE_LANGS =
  /^(?:c|cpp|c\+\+|c#|python|py|bash|sh|asm|arm|json|html|xml|css|js|javascript|ts|typescript|rust|go|make|makefile|cmake|txt|text|diff|sql|verilog|vhdl|yaml|yml)\n/i;

export function renderMD(text: string): string {
  const src = String(text || '');
  const out: string[] = [];
  const blocks = src.split(/```/);

  for (let b = 0; b < blocks.length; b++) {
    if (b % 2 === 1) {
      // 代码块：首行可能是语言名
      const code = blocks[b]!.replace(CODE_LANGS, '').replace(/\n$/, '');
      out.push(`<pre><code>${esc(code)}</code></pre>`);
      continue;
    }
    const lines = blocks[b]!.split('\n');
    let para: string[] = [];
    let list: string[] = [];
    let table: string[] = [];
    let quote: string[] = [];

    const flushPara = (): void => {
      if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
    };
    const flushList = (): void => {
      if (list.length) {
        out.push('<ul>' + list.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>');
        list = [];
      }
    };
    const flushTable = (): void => {
      if (table.length) { out.push(tableHTML(table)); table = []; }
    };
    const flushQuote = (): void => {
      if (quote.length) { out.push(quoteHTML(quote)); quote = []; }
    };
    const flushAll = (): void => { flushPara(); flushList(); flushTable(); flushQuote(); };

    for (const raw of lines) {
      const ln = raw.trim();
      if (!ln) { flushAll(); continue; }
      if (/^\|/.test(ln)) { flushPara(); flushList(); flushQuote(); table.push(ln); continue; }
      if (/^>/.test(ln)) {
        flushPara(); flushList(); flushTable(); quote.push(ln.replace(/^>\s?/, '')); continue;
      }
      if (/^[-*]\s+/.test(ln)) {
        flushPara(); flushTable(); flushQuote(); list.push(ln.replace(/^[-*]\s+/, '')); continue;
      }
      if (/^\d+[.)]\s+/.test(ln)) {
        /* 编号行独立成段（保留原编号，悬挂缩进），避免多条编号被拼进同一段 */
        flushAll();
        out.push(`<p class="oli">${inline(ln)}</p>`);
        continue;
      }
      flushList(); flushTable(); flushQuote();
      para.push(ln);
    }
    flushAll();
  }
  return out.join('');
}

// 保留 v1 的测试钩子
declare global {
  interface Window { __renderMD?: (t: string) => string }
}
if (typeof window !== 'undefined') window.__renderMD = renderMD;
```

以上是 `legacy/js/app.js:24-129` 的逐行等价移植：`var` 改 `const`/`let`，加类型标注，`function(){}` 改箭头函数。**正则与 flush 调用顺序一字未改** —— 顺序变了转义会失效或分段会错。`noUncheckedIndexedAccess` 打开后数组下标返回 `T | undefined`，所以有 `!` 断言，位置都在已由 `length` 保证非空的分支里。

- [ ] **Step 5: 运行测试确认通过**

```bash
npm test -- markdown
```

预期：8 个测试全部 PASS。

- [ ] **Step 6: 抽样比对真实题目**

```typescript
// scripts/diff-md.mjs —— 临时脚本，比对新旧渲染器输出
import { readFileSync } from 'node:fs';
const qs = JSON.parse(readFileSync('data/questions.json', 'utf8'));
const risky = qs.filter((q) => /[`|>*\\]/.test(q.a)).slice(0, 20);
console.log(`需人工比对 ${risky.length} 道题的渲染结果，题号：`);
console.log(risky.map((q) => q.id).join(', '));
```

在浏览器里对这 20 道题同时跑 legacy 与新实现的 `__renderMD`，输出应完全相同。确认后删除该临时脚本。

- [ ] **Step 7: Commit**

```bash
git add src/core/markdown.ts src/core/markdown.test.ts
git commit -m "refactor(md): port markdown renderer to TS with behaviour locked by tests"
```

---

### Task 16: 启动流程与 Vite 接入

**Files:**
- Create: `src/main.ts`
- Create: `vite.config.ts`
- Modify: `index.html:162-198`（替换 27 个 script 标签为单个 module 入口）
- Create: `src/ui/toast.ts`

**Interfaces:**
- Consumes: `QuizEngine`（Task 12）、`loadState` / `scheduleSave` / `installFlushHooks`（Task 13）。
- Produces: `AppCtx { engine: QuizEngine; persist(): void; rerender(): void }`、`defaultFilter(): Filter`、`toast(msg: string): void`。Task 17–19 的 UI 模块都接收 `AppCtx`。

- [ ] **Step 1: 写 vite.config.ts**

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  // './' 让产物同时适配 GitHub Pages 子路径和 Tauri 的 file:// 环境
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 2: 写 toast.ts**

```typescript
// src/ui/toast.ts
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * 右下角一次只显示一条。与 legacy/js/app.js:134 逐字等价：
 * 只切 hidden，不加 class（现有 .toast 样式没有 .is-on 这一态），2200ms 后收起。
 */
export function toast(msg: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { el.hidden = true; }, 2200);
}
```

- [ ] **Step 3: 写 main.ts**

```typescript
// src/main.ts
import init, { QuizEngine } from '../pkg/embq_core';
import { installFlushHooks, loadState, scheduleSave } from './core/store';
import { mountCard, renderCard } from './ui/card';
import { mountFilter, refreshCount } from './ui/filter';
import { renderStats } from './ui/stats';
import { mountSettings, renderHealth } from './ui/settings';
import { mountKeys } from './ui/keys';
import { applyTheme, mountTheme } from './ui/theme';
import { toast } from './ui/toast';

export interface Filter {
  cats: string[];
  levels: number[];
  types: string[];
  scopes: string[];
  mode: 'smart' | 'ordered' | 'random';
  keyword: string;
  seed: number | null;
}

export interface AppCtx {
  engine: QuizEngine;
  /** 取出状态交给 store 落盘（debounce 300ms） */
  persist(): void;
  /** 重绘当前视图 */
  rerender(): void;
}

/** 默认：智能复习全库 */
export function defaultFilter(): Filter {
  return { cats: [], levels: [1, 2, 3], types: ['single', 'multi', 'bool', 'qa'],
           scopes: [], mode: 'smart', keyword: '', seed: null };
}

export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

async function boot(): Promise<void> {
  await init();

  const [questions, categories, saved] = await Promise.all([
    fetch('data/questions.json').then((r) => r.text()),
    fetch('data/categories.json').then((r) => r.text()),
    loadState(),
  ]);

  let engine: QuizEngine;
  try {
    engine = new QuizEngine(questions, categories, saved ?? undefined);
  } catch (e) {
    // 题库坏了没法降级，直接把错误摆给用户，别白屏
    document.getElementById('cardWrap')!.innerHTML =
      `<div class="empty"><h2>题库加载失败</h2><p>${String(e)}</p></div>`;
    return;
  }

  // 有未刷完的卷就接着刷，否则智能复习全库
  if (!engine.restore_deck()) {
    engine.build(JSON.stringify(defaultFilter()));
  }

  const ctx: AppCtx = {
    engine,
    persist() {
      scheduleSave(engine.state_json());
      engine.mark_clean();
    },
    rerender() {
      renderCard(ctx);
      renderStats(ctx);
    },
  };

  installFlushHooks(() => engine.state_json());
  mount(ctx);
}

function mount(ctx: AppCtx): void {
  applyTheme(ctx);
  mountTheme(ctx);
  mountCard(ctx);
  mountFilter(ctx);
  mountSettings(ctx);
  mountKeys(ctx);
  renderHealth(ctx);
  mountViewTabs();
  refreshCount(ctx);
  ctx.rerender();
}

/** 练习 / 统计 两个 tab，复用 index.html:19-22 的 .tab 与 .view.is-active */
function mountViewTabs(): void {
  const tabs = document.getElementById('viewTabs');
  tabs?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.tab');
    if (!btn) return;
    switchView(btn.dataset.view === 'stats' ? 'stats' : 'practice');
  });
}

export function switchView(view: 'practice' | 'stats'): void {
  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.view === view);
  });
  document.getElementById('view-practice')!.classList.toggle('is-active', view === 'practice');
  document.getElementById('view-stats')!.classList.toggle('is-active', view === 'stats');
}

boot().catch((e) => {
  console.error(e);
  toast('启动失败，请刷新重试');
});
```

- [ ] **Step 4: 改 index.html 的脚本引用**

删掉 `index.html:162-198` 的全部 `<script src=...>`（27 个题库 + 5 个 js，Task 2 已把文件移走，此刻它们全是 404），换成单个 module 入口。PWA 的 Service Worker 注册**保留**：

```html
<!-- 引擎 -->
<script type="module" src="/src/main.ts"></script>
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
</script>
```

`css/style.css` 的 `<link>` 与 `manifest.json` 的引用**都不动**。

- [ ] **Step 5: 建 UI 模块占位文件**

Task 17–19 才填实现，先让 `main.ts` 能编译：

```typescript
// src/ui/card.ts
import type { AppCtx } from '../main';
export function mountCard(_ctx: AppCtx): void {}
export function renderCard(_ctx: AppCtx): void {}
```

同样的空壳给 `src/ui/filter.ts`（`mountFilter` / `refreshCount`）、`src/ui/stats.ts`（`renderStats`）、`src/ui/settings.ts`（`mountSettings` / `renderHealth`）、`src/ui/keys.ts`（`mountKeys`）、`src/ui/theme.ts`（`applyTheme` / `mountTheme`）。

- [ ] **Step 6: 验证构建与启动**

```bash
npm run wasm
npm run build
npx vite preview --port 4173
```

浏览器打开 `http://localhost:4173`，DevTools console 应无报错。在 console 里验证数据加载：

```javascript
// 应打印 476
await fetch('data/questions.json').then(r => r.json()).then(a => a.length)
```

UI 还是空的（模块是占位），但启动链路必须跑通。

- [ ] **Step 7: Commit**

```bash
git add src/main.ts src/ui vite.config.ts index.html
git commit -m "feat(ui): wire boot sequence, vite entry and view tabs"
```

---

### Task 17: 题卡渲染

**Files:**
- Modify: `src/ui/card.ts`
- Reference: `legacy/js/app.js:352-518`（`renderCard` 与评分行、口述模式）

**Interfaces:**
- Consumes: `AppCtx`（Task 16）、`renderMD`（Task 15）、`engine.current/judge/record/toggle_fav/position/size/is_finished`（Task 12）。
- Produces: `mountCard(ctx)`（绑定一次事件委托）、`renderCard(ctx)`、`resetCardState()`。

DOM 契约（`index.html:143-153`）：`#cardWrap` 装卡片，`#navbar` / `#btnPrev` / `#btnNext` / `#deckPos` / `#btnFav` 是导航，`#deckProgress` 是顶部进度条。class 名全部沿用 `.card` `.qtext` `.opt` `.answer` `.card-actions` `.empty` `.done` `.oral`。

- [ ] **Step 1: 收拢卡片状态**

v1 把 `picked` / `revealed` / `verdict` 散在模块顶层，切题时漏重置就产生状态污染。收进一个对象整体替换：

```typescript
// src/ui/card.ts
import type { AppCtx } from '../main';
import { defaultFilter, switchView } from '../main';
import { renderMD } from '../core/markdown';
import { toast } from './toast';

interface Verdict { correct: boolean; expected: number[]; picked: number[] }

interface CardState {
  picked: number[];
  revealed: boolean;
  verdict: Verdict | null;
  oralLeft: number;
  oralTimer: ReturnType<typeof setInterval> | null;
}

let state: CardState = blank();

function blank(): CardState {
  return { picked: [], revealed: false, verdict: null, oralLeft: 0, oralTimer: null };
}

/** 切题时整体重置 —— 这是消除状态污染的关键 */
export function resetCardState(): void {
  if (state.oralTimer) clearInterval(state.oralTimer);
  state = blank();
}
```

- [ ] **Step 2: 实现空卷与完成态**

照 `legacy/js/app.js:355-397` 的结构和文案，只把数据源换成 engine：

```typescript
function renderEmpty(ctx: AppCtx, wrap: HTMLElement): void {
  document.getElementById('navbar')!.hidden = true;
  const total = ctx.engine.count(JSON.stringify(defaultFilter())) as { total: number };
  wrap.innerHTML =
    '<div class="empty"><h2>还没有组卷</h2>' +
    '<p>打开「筛选」挑分类和难度，或者直接开始智能复习——它会优先推没练过和练错的题。</p>' +
    `<button class="btn btn-primary" id="quickStart">智能复习全部 ${total.total} 题</button></div>`;
  document.getElementById('quickStart')?.addEventListener('click', () => {
    ctx.engine.build(JSON.stringify(defaultFilter()));
    resetCardState();
    ctx.persist();
    renderCard(ctx);
  });
}

function renderDone(ctx: AppCtx, wrap: HTMLElement): void {
  resetCardState();
  document.getElementById('navbar')!.hidden = true;
  document.getElementById('deckProgress')!.style.width = '100%';
  const s = ctx.engine.stats() as { overall: { mastered: number; total: number; today: number } };
  const o = s.overall;
  const pct = o.total ? Math.round((o.mastered / o.total) * 100) : 0;
  wrap.innerHTML =
    '<div class="card"><div class="done">' +
    `<div class="done-num">${ctx.engine.size()}</div>` +
    '<h2>这一卷刷完了</h2>' +
    `<p>全库掌握 ${o.mastered} / ${o.total} 题（${pct}%）　·　今日已练 ${o.today} 题</p>` +
    '<div class="card-actions" style="justify-content:center">' +
    '<button class="btn btn-primary" id="againAll">再刷一遍</button>' +
    '<button class="btn" id="againWrong">只刷这卷里的错题</button>' +
    '<button class="btn btn-ghost" id="toStats">看统计</button>' +
    '</div></div></div>';

  document.getElementById('againAll')?.addEventListener('click', () => {
    ctx.engine.build(JSON.stringify(currentFilter(ctx)));
    resetCardState(); ctx.persist(); renderCard(ctx);
  });
  document.getElementById('againWrong')?.addEventListener('click', () => {
    const f = currentFilter(ctx);
    if (!f.scopes.includes('wrong')) f.scopes.push('wrong');
    if (!ctx.engine.build(JSON.stringify(f))) {
      toast('这卷里没有错题，漂亮');
      ctx.engine.build(JSON.stringify(currentFilter(ctx)));
    }
    resetCardState(); ctx.persist(); renderCard(ctx);
  });
  document.getElementById('toStats')?.addEventListener('click', () => switchView('stats'));
}
```

`currentFilter(ctx)` 从 `src/ui/filter.ts` 导出（Task 18），读当前 chips 状态。

- [ ] **Step 3: 实现题面渲染**

照 `legacy/js/app.js:399-518` 平移，分四段：题干 → 口述遮罩 → 选项/判断 → 答案与评分行。

```typescript
interface Question {
  id: string; cat: string; q: string; a: string;
  type: 'single' | 'multi' | 'bool' | 'qa';
  options: string[]; level: number; tags: string[];
  resume: boolean; followup: string[];
}

export function renderCard(ctx: AppCtx): void {
  const wrap = document.getElementById('cardWrap')!;
  if (!ctx.engine.size()) return renderEmpty(ctx, wrap);
  if (ctx.engine.is_finished()) return renderDone(ctx, wrap);

  const q = ctx.engine.current() as Question | null;
  if (!q) return renderDone(ctx, wrap);

  const pos = ctx.engine.position();
  const size = ctx.engine.size();
  document.getElementById('navbar')!.hidden = false;
  document.getElementById('deckPos')!.textContent = `${pos + 1} / ${size}`;
  document.getElementById('deckProgress')!.style.width = `${(pos / size) * 100}%`;

  const st = ctx.engine.stats() as unknown;
  const fav = isFav(ctx, q.id);
  const favBtn = document.getElementById('btnFav')!;
  favBtn.textContent = fav ? '★' : '☆';
  favBtn.classList.toggle('is-on', fav);

  let body = `<div class="qtext">${renderMD(q.q)}</div>`;

  if (isOral(ctx) && !state.revealed) {
    body += '<div class="oral">' +
      '<div class="oral-clock" id="oralClock">--:--</div>' +
      '<div class="oral-note">口述模式：先出声把答案完整讲一遍，讲完再揭晓。面试考的是能不能讲清楚。</div>' +
      '</div>';
  } else {
    body += renderChoices(q);
  }

  if (state.revealed) body += renderAnswer(q);

  wrap.innerHTML = `<div class="card">${renderHead(q)}${body}${renderActions(q)}</div>`;
  if (isOral(ctx) && !state.revealed) startOral(ctx);
}
```

`renderHead` / `renderChoices` / `renderAnswer` / `renderActions` 逐一从 `legacy/js/app.js` 对应片段平移：

- `renderHead`：分类名、难度标签、`.chip-warn` 的简历高危标记、题型标签
- `renderChoices`：`single`/`multi` 渲染 `.opt` 列表并标 `.is-picked`；`bool` 渲染「正确 / 错误」两个 `.opt`；`qa` 不渲染选项
- `renderAnswer`：`.answer` 容器 + `renderMD(q.a)` + `followup` 列表
- `renderActions`：未提交时是「提交 / 揭晓」，已揭晓时是三个评分按钮（`data-grade="know|fuzzy|no"`）

- [ ] **Step 4: 实现事件委托**

一次绑定，不随重绘反复挂 —— v1 每次 `renderCard` 都重新 `addEventListener`，是内存泄漏和重复触发的来源。

```typescript
export function mountCard(ctx: AppCtx): void {
  const wrap = document.getElementById('cardWrap')!;

  wrap.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

    const opt = t.closest<HTMLElement>('.opt');
    if (opt && !state.revealed) {
      const idx = Number(opt.dataset.idx);
      const q = ctx.engine.current() as Question | null;
      if (!q) return;
      if (q.type === 'multi') {
        const at = state.picked.indexOf(idx);
        if (at >= 0) state.picked.splice(at, 1); else state.picked.push(idx);
      } else {
        state.picked = [idx];
      }
      renderCard(ctx);
      return;
    }

    if (t.closest('[data-act="reveal"]')) {
      state.verdict = ctx.engine.judge(state.picked) as Verdict;
      state.revealed = true;
      renderCard(ctx);
      return;
    }

    const gradeBtn = t.closest<HTMLElement>('[data-grade]');
    if (gradeBtn) {
      ctx.engine.record(gradeBtn.dataset.grade!);
      ctx.engine.advance();
      resetCardState();
      ctx.persist();
      ctx.rerender();
    }
  });

  document.getElementById('btnPrev')!.addEventListener('click', () => {
    if (ctx.engine.back()) { resetCardState(); ctx.persist(); renderCard(ctx); }
  });
  document.getElementById('btnNext')!.addEventListener('click', () => {
    ctx.engine.advance(); resetCardState(); ctx.persist(); renderCard(ctx);
  });
  document.getElementById('btnFav')!.addEventListener('click', () => {
    ctx.engine.toggle_fav(); ctx.persist(); renderCard(ctx);
  });
}
```

- [ ] **Step 5: 实现口述倒计时**

照 `legacy/js/app.js` 的 `startOral` / `stopOral` 平移，计时器句柄存在 `state.oralTimer` 里，由 `resetCardState` 统一清理。

- [ ] **Step 6: 手工验证**

```bash
npm run build && npx vite preview --port 4173
```

逐条确认：

- 题卡外观与 v1 完全一致（对照 GitHub Pages 上的线上版本并排看）
- 单选点一下换选项，多选可多点、可取消
- 判断题两个按钮工作正常
- 简答题直接出「揭晓」，揭晓后出三个评分按钮
- 三个评分按钮都能推进到下一题，且上一题的选择不残留
- `←` / `→` 导航正常，首题点「上一题」无反应且不报错
- 收藏星标点击后立刻变 `★`，刷新页面后仍是 `★`
- 刷完一卷显示完成态，「再刷一遍」和「只刷错题」都正常
- 顶部进度条随题目推进

- [ ] **Step 7: Commit**

```bash
git add src/ui/card.ts
git commit -m "feat(ui): render question card with consolidated CardState"
```

---

### Task 18: 筛选面板

**Files:**
- Modify: `src/ui/filter.ts`
- Reference: `legacy/js/app.js` 的筛选相关片段

**Interfaces:**
- Consumes: `AppCtx`、`engine.cats()` / `engine.count()`、`newSeed()`（Task 16）。
- Produces: `mountFilter(ctx)`、`refreshCount(ctx)`、`currentFilter(ctx): Filter`、`renderCatChips(ctx)`。

DOM 契约（`index.html:33-100`）：`#filterPanel` / `#catChips` / `#levelChips` / `#typeChips` / `#scopeChips` / `#modeChips` / `#searchInput` / `#deckCount` / `#btnResetFilter` / `#btnApplyFilter`，选中态是 `.chip.is-on`，分类快捷操作是 `[data-cat-action="all|none|auto"]`。

- [ ] **Step 1: 实现 chips ⇄ Filter 双向映射**

```typescript
// src/ui/filter.ts
import type { AppCtx, Filter } from '../main';
import { defaultFilter, newSeed } from '../main';
import { resetCardState } from './card';
import { toast } from './toast';

function onChips(container: string, attr: string): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(`#${container} .chip.is-on`),
  ).map((el) => el.dataset[attr]!).filter(Boolean);
}

/** 读当前面板状态。mode 为 random 时补一个 seed，保证卷可复现。 */
export function currentFilter(ctx: AppCtx): Filter {
  const mode = (onChips('modeChips', 'mode')[0] ?? 'smart') as Filter['mode'];
  return {
    cats: onChips('catChips', 'cat'),
    levels: onChips('levelChips', 'level').map(Number),
    types: onChips('typeChips', 'type'),
    scopes: onChips('scopeChips', 'scope'),
    mode,
    keyword: (document.getElementById('searchInput') as HTMLInputElement).value.trim(),
    seed: mode === 'random' ? newSeed() : null,
  };
}
```

`onChips` 用 `dataset[attr]`，所以 `data-level` → `attr = 'level'`，与 HTML 里的属性名一一对应。

- [ ] **Step 2: 渲染分类 chips**

分类按 `engine.cats()` 的声明顺序渲染 —— 顺序来自 `data/meta.js`，跟 v1 完全一致。

```typescript
interface CatMeta { id: string; name: string; desc: string }

/**
 * 与 legacy/js/app.js:157 一致：带题量角标 `<span class="n">`，
 * 且题量为 0 的分类不渲染 chip（渲染了点了也出不来题）。
 */
export function renderCatChips(ctx: AppCtx): void {
  const box = document.getElementById('catChips')!;
  const cats = ctx.engine.cats() as CatMeta[];
  box.innerHTML = cats
    .map((c) => {
      const n = (ctx.engine.count(JSON.stringify({ ...defaultFilter(), cats: [c.id] })) as
        { total: number }).total;
      if (!n) return '';
      return `<button class="chip is-on" data-cat="${c.id}" title="${esc(c.desc)}">` +
        `${esc(c.name)}<span class="n">${n}</span></button>`;
    })
    .join('');
}
```

`import { esc } from '../core/markdown';` 加到文件头 —— 分类名与描述来自数据文件，进 `innerHTML` 前要转义。

- [ ] **Step 3: 实现实时计数与事件**

```typescript
export function refreshCount(ctx: AppCtx): void {
  const el = document.getElementById('deckCount')!;
  const res = ctx.engine.count(JSON.stringify(currentFilter(ctx))) as
    { total: number; boxes: [number, number, number, number] };
  const [fresh, weak, ok, done] = res.boxes;
  el.textContent = res.total
    ? `命中 ${res.total} 题　·　未练 ${fresh} / 生 ${weak} / 熟 ${ok} / 已掌握 ${done}`
    : '没有命中任何题目';
}

const AUTO_PRESET = ['automotive', 'bus', 'security', 'mcu-hw', 'hardware', 'build', 'debug', 'behavioral'];

export function mountFilter(ctx: AppCtx): void {
  renderCatChips(ctx);

  document.getElementById('btnFilter')!.addEventListener('click', () => {
    const p = document.getElementById('filterPanel')!;
    p.hidden = !p.hidden;
    document.getElementById('settingsPanel')!.hidden = true;
    if (!p.hidden) refreshCount(ctx);
  });

  // 所有 chips 用一次委托：切换 is-on 后刷新计数
  document.getElementById('filterPanel')!.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

    const action = t.closest<HTMLElement>('[data-cat-action]')?.dataset.catAction;
    if (action) {
      const chips = document.querySelectorAll<HTMLElement>('#catChips .chip');
      chips.forEach((c) => {
        const on = action === 'all' ? true
          : action === 'none' ? false
          : AUTO_PRESET.includes(c.dataset.cat!);
        c.classList.toggle('is-on', on);
      });
      refreshCount(ctx);
      return;
    }

    const chip = t.closest<HTMLElement>('.chip');
    if (!chip) return;
    // 出题顺序是单选，其余维度是多选
    if (chip.parentElement?.id === 'modeChips') {
      document.querySelectorAll('#modeChips .chip').forEach((c) => c.classList.remove('is-on'));
      chip.classList.add('is-on');
    } else {
      chip.classList.toggle('is-on');
    }
    refreshCount(ctx);
  });

  document.getElementById('searchInput')!.addEventListener('input', () => refreshCount(ctx));

  document.getElementById('btnResetFilter')!.addEventListener('click', () => {
    applyFilterToDom(defaultFilter());
    refreshCount(ctx);
  });

  document.getElementById('btnApplyFilter')!.addEventListener('click', () => {
    const n = ctx.engine.build(JSON.stringify(currentFilter(ctx)));
    if (!n) { toast('没有命中任何题目，放宽条件试试'); return; }
    resetCardState();
    ctx.persist();
    document.getElementById('filterPanel')!.hidden = true;
    toast(`组卷 ${n} 题`);
    ctx.rerender();
  });
}

/** 把 Filter 写回 chips（重置按钮用） */
function applyFilterToDom(f: Filter): void {
  document.querySelectorAll<HTMLElement>('#catChips .chip').forEach((c) => {
    c.classList.toggle('is-on', f.cats.length === 0 || f.cats.includes(c.dataset.cat!));
  });
  document.querySelectorAll<HTMLElement>('#levelChips .chip').forEach((c) => {
    c.classList.toggle('is-on', f.levels.includes(Number(c.dataset.level)));
  });
  document.querySelectorAll<HTMLElement>('#typeChips .chip').forEach((c) => {
    c.classList.toggle('is-on', f.types.includes(c.dataset.type!));
  });
  document.querySelectorAll<HTMLElement>('#scopeChips .chip').forEach((c) => {
    c.classList.toggle('is-on', f.scopes.includes(c.dataset.scope!));
  });
  document.querySelectorAll<HTMLElement>('#modeChips .chip').forEach((c) => {
    c.classList.toggle('is-on', c.dataset.mode === f.mode);
  });
  (document.getElementById('searchInput') as HTMLInputElement).value = f.keyword;
}
```

- [ ] **Step 4: 手工验证**

- 分类 chips 顺序以「C 语言核心」开头，与 `data/meta.js` 声明顺序一致
- 「全选 / 清空 / 车载方向」三个快捷操作正常
- 勾选任何 chip，`#deckCount` 立刻更新
- 维度之间是 AND、维度内部是 OR（例：只选「C 语言核心」+ 只选「基础」，命中数应远小于全库）
- 「顺序练」连续组卷两次，第一题相同
- 「随机练」组卷两次顺序不同，但刷到第 3 题刷新页面后仍停在第 3 题
- 条件过窄时提示「没有命中任何题目」而不是白屏

- [ ] **Step 5: Commit**

```bash
git add src/ui/filter.ts
git commit -m "feat(ui): filter panel with live count and mode selection"
```

---

### Task 19: 统计视图

**Files:**
- Modify: `src/ui/stats.ts`
- Reference: `legacy/js/app.js:519+`（`renderStats`）

**Interfaces:**
- Consumes: `AppCtx`、`engine.stats()`（Task 12）。
- Produces: `renderStats(ctx)`。

DOM 契约：`#statsWrap`（`index.html:157`）。class 名沿用 `.kpis` `.kpi` `.bars` `.bar` `.heat` `.heat-cell`。

`engine.stats()` 的返回形状（Task 12 Step 5 定义）：

```typescript
interface StatsPayload {
  overall: { total: number; seen: number; mastered: number; accuracy: number;
             today: number; streak: number; boxes: [number, number, number, number] };
  byCategory: CategoryStat[];
  weakest: CategoryStat[];
  heatmap: { date: string; count: number }[];
  resumeRisk: { total: number; mastered: number; weak_ids: string[] };
}
interface CategoryStat { id: string; name: string; total: number;
                         mastered: number; seen: number; accuracy: number }
```

- [ ] **Step 1: 实现 KPI 区**

```typescript
// src/ui/stats.ts
import type { AppCtx } from '../main';

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 100) : 0;
}

function kpis(o: StatsPayload['overall']): string {
  return '<div class="kpis">' +
    kpi('已掌握', `${o.mastered} / ${o.total}`, `${pct(o.mastered, o.total)}%`) +
    kpi('已练过', `${o.seen} / ${o.total}`, `${pct(o.seen, o.total)}%`) +
    kpi('正确率', `${Math.round(o.accuracy * 100)}%`, '答对 / 已答') +
    kpi('今日', `${o.today} 题`, `连续 ${o.streak} 天`) +
    '</div>';
}

function kpi(label: string, value: string, sub: string): string {
  return `<div class="kpi"><div class="kpi-label">// ${label}</div>` +
    `<div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}
```

`// ` 前缀是现有风格标记（见 spec 的硬约束），照 `legacy/js/app.js` 的用法保留。

- [ ] **Step 2: 实现分类条形图与热力图**

```typescript
function bars(list: CategoryStat[]): string {
  const rows = list.map((c) => {
    const p = pct(c.mastered, c.total);
    return '<div class="bar">' +
      `<div class="bar-label">${c.name}</div>` +
      `<div class="bar-track"><div class="bar-fill" style="width:${p}%"></div></div>` +
      `<div class="bar-num">${c.mastered}/${c.total}</div>` +
      '</div>';
  }).join('');
  return `<div class="bars">${rows}</div>`;
}

function heat(cells: { date: string; count: number }[]): string {
  const inner = cells.map((c) => {
    // 0 / 1-5 / 6-15 / 16-30 / 30+ 五档，对应现有 CSS 的 lv0-lv4
    const lv = c.count === 0 ? 0 : c.count <= 5 ? 1 : c.count <= 15 ? 2 : c.count <= 30 ? 3 : 4;
    return `<div class="heat-cell lv${lv}" title="${c.date}：${c.count} 题"></div>`;
  }).join('');
  return `<div class="heat">${inner}</div>`;
}
```

分档阈值照 `legacy/js/app.js` 里 `renderStats` 的原值填写 —— 读旧实现确认，不要自己定。

- [ ] **Step 3: 组装 renderStats**

```typescript
export function renderStats(ctx: AppCtx): void {
  const wrap = document.getElementById('statsWrap');
  if (!wrap) return;
  const s = ctx.engine.stats() as StatsPayload;

  const risk = s.resumeRisk;
  const riskBlock = risk.total
    ? `<section class="stat-block"><h3>// 简历高危</h3>` +
      `<p class="hint">这些题跟你简历上写的东西直接相关，面试官大概率会问。已掌握 ` +
      `${risk.mastered} / ${risk.total}。</p></section>`
    : '';

  wrap.innerHTML =
    kpis(s.overall) +
    '<section class="stat-block"><h3>// 最薄弱的分类</h3>' + bars(s.weakest) + '</section>' +
    '<section class="stat-block"><h3>// 全部分类</h3>' + bars(s.byCategory) + '</section>' +
    '<section class="stat-block"><h3>// 最近半年</h3>' + heat(s.heatmap) + '</section>' +
    riskBlock;
}
```

- [ ] **Step 4: 手工验证**

```bash
npm run build && npx vite preview --port 4173
```

刷几道题后切到「统计」tab，确认：KPI 数字与实际作答对得上；热力图最后一格是今天且有颜色；分类条形图顺序与筛选面板一致；连续打卡天数正确。

- [ ] **Step 5: Commit**

```bash
git add src/ui/stats.ts
git commit -m "feat(ui): stats view with KPI, category bars and heatmap"
```

---

### Task 20: 设置面板、主题与快捷键

**Files:**
- Modify: `src/ui/settings.ts`, `src/ui/theme.ts`, `src/ui/keys.ts`
- Modify: `src-rust/lib.rs`（加设置读写方法）

**Interfaces:**
- Consumes: `AppCtx`、`engine.health()` / `state_json()` / `load_state_json()`、`resetState`（Task 13）。
- Produces: `mountSettings(ctx)`、`renderHealth(ctx)`、`applyTheme(ctx)`、`mountTheme(ctx)`、`mountKeys(ctx)`；Rust 侧新增 `theme()`、`set_theme(&str)`、`oral()`、`set_oral(bool)`、`oral_seconds()`、`set_oral_seconds(u32)`。

DOM 契约（`index.html:103-140`）：`#settingsPanel` / `#oralToggle`（带 `data-on`）/ `#oralTimeBtn` / `#btnExport` / `#btnImport` / `#btnExportWrong` / `#btnReset` / `#importFile` / `#bankHealth`；主题按钮是 `#btnTheme`。

- [ ] **Step 1: Rust 侧加设置访问器（先写测试）**

```rust
// src-rust/lib.rs 的 engine_tests 模块内
    #[test]
    fn settings_round_trip_through_engine() {
        let mut e = engine();
        assert_eq!(e.theme(), "auto");
        e.set_theme("dark");
        assert_eq!(e.theme(), "dark");

        assert!(!e.oral());
        e.set_oral(true);
        assert!(e.oral());

        assert_eq!(e.oral_seconds(), 60);
        e.set_oral_seconds(90);
        assert_eq!(e.oral_seconds(), 90);

        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
        assert_eq!(s["settings"]["theme"], "dark");
        assert_eq!(s["settings"]["oralSeconds"], 90);
    }

    #[test]
    fn oral_seconds_is_clamped_to_sane_range() {
        let mut e = engine();
        e.set_oral_seconds(0);
        assert_eq!(e.oral_seconds(), 5, "下限 5 秒");
        e.set_oral_seconds(9999);
        assert_eq!(e.oral_seconds(), 600, "上限 10 分钟");
    }
```

```bash
cargo test --lib engine_tests
```

预期：FAIL，`no method named theme found`。

- [ ] **Step 2: 实现设置访问器**

```rust
#[wasm_bindgen]
impl QuizEngine {
    pub fn theme(&self) -> String { self.inner.state().settings.theme.clone() }

    pub fn set_theme(&mut self, v: &str) {
        self.inner.state_mut().settings.theme = v.to_string();
        self.dirty = true;
    }

    pub fn oral(&self) -> bool { self.inner.state().settings.oral }

    pub fn set_oral(&mut self, v: bool) {
        self.inner.state_mut().settings.oral = v;
        self.dirty = true;
    }

    pub fn oral_seconds(&self) -> u32 { self.inner.state().settings.oral_seconds }

    pub fn set_oral_seconds(&mut self, v: u32) {
        self.inner.state_mut().settings.oral_seconds = v.clamp(5, 600);
        self.dirty = true;
    }
}
```

```bash
cargo test && npm run wasm
```

预期：75 个测试全部 PASS。

- [ ] **Step 3: 实现 theme.ts**

```typescript
// src/ui/theme.ts
import type { AppCtx } from '../main';

const THEME_ORDER = ['auto', 'light', 'dark'] as const;
const THEME_LABEL: Record<string, string> = { auto: '跟随系统', light: '浅色', dark: '深色' };

/**
 * 把偏好原样写进 data-theme —— 与 legacy/js/app.js:144 一致。
 * 注意不要在这里把 auto 解析成 light/dark：现有 CSS 自己用
 * `[data-theme="auto"]` + prefers-color-scheme 媒体查询处理跟随系统，
 * 提前解析会让 data-theme 永远拿不到 auto，媒体查询那段样式就成了死代码。
 */
export function applyTheme(ctx: AppCtx): void {
  document.documentElement.setAttribute('data-theme', ctx.engine.theme() || 'auto');
}

export function mountTheme(ctx: AppCtx): void {
  document.getElementById('btnTheme')!.addEventListener('click', () => {
    const cur = ctx.engine.theme() || 'auto';
    const next = THEME_ORDER[(THEME_ORDER.indexOf(cur as typeof THEME_ORDER[number]) + 1) % 3]!;
    ctx.engine.set_theme(next);
    ctx.persist();
    applyTheme(ctx);
    toast(`主题：${THEME_LABEL[next]}`);
  });
}
```

`import { toast } from './toast';` 加到文件头。

先读 `css/style.css` 确认 `data-theme` 的取值写法，按 CSS 实际写法对齐，**不要改 CSS**。

- [ ] **Step 4: 实现 keys.ts**

照 `index.html:130-137` 已声明的快捷键实现，输入框聚焦时不拦截：

```typescript
// src/ui/keys.ts
import type { AppCtx } from '../main';
import { renderCard } from './card';

export function mountKeys(ctx: AppCtx): void {
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;

    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('filterPanel')!.hidden = false;
      (document.getElementById('searchInput') as HTMLInputElement).focus();
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      ctx.engine.toggle_fav(); ctx.persist(); renderCard(ctx); return;
    }
    if (e.key === 'ArrowLeft') {
      if (ctx.engine.back()) { ctx.persist(); renderCard(ctx); } return;
    }
    if (e.key === 'ArrowRight') {
      ctx.engine.advance(); ctx.persist(); renderCard(ctx); return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      // 空格：提交 / 揭晓 / 下一题 —— 语义取决于卡片当前阶段
      document.querySelector<HTMLElement>('[data-act="reveal"]')?.click();
      return;
    }
    if (/^[1-6]$/.test(e.key)) {
      const n = Number(e.key) - 1;
      // 已揭晓时 1/2/3 是自评，未揭晓时是选选项
      const graded = document.querySelectorAll<HTMLElement>('[data-grade]');
      if (graded.length && n < 3) { graded[n]!.click(); return; }
      document.querySelectorAll<HTMLElement>('.opt')[n]?.click();
    }
  });
}
```

- [ ] **Step 5: 实现 settings.ts**

```typescript
// src/ui/settings.ts
import type { AppCtx } from '../main';
import { resetState } from '../core/store';
import { renderCard } from './card';
import { toast } from './toast';

const ORAL_STEPS = [30, 60, 90, 120, 180];

export function renderHealth(ctx: AppCtx): void {
  const box = document.getElementById('bankHealth')!;
  const problems = ctx.engine.health() as string[];
  box.innerHTML = problems.length
    ? problems.map((p) => `<div class="health-item is-bad">${p}</div>`).join('')
    : '<div class="health-item is-ok">题库自检通过，没有发现问题。</div>';
}

export function mountSettings(ctx: AppCtx): void {
  document.getElementById('btnSettings')!.addEventListener('click', () => {
    const p = document.getElementById('settingsPanel')!;
    p.hidden = !p.hidden;
    document.getElementById('filterPanel')!.hidden = true;
    if (!p.hidden) { renderHealth(ctx); syncOral(ctx); }
  });

  document.getElementById('oralToggle')!.addEventListener('click', () => {
    ctx.engine.set_oral(!ctx.engine.oral());
    ctx.persist(); syncOral(ctx); renderCard(ctx);
  });

  document.getElementById('oralTimeBtn')!.addEventListener('click', () => {
    const cur = ctx.engine.oral_seconds();
    const next = ORAL_STEPS[(ORAL_STEPS.indexOf(cur) + 1) % ORAL_STEPS.length]!;
    ctx.engine.set_oral_seconds(next);
    ctx.persist(); syncOral(ctx);
  });

  document.getElementById('btnExport')!.addEventListener('click', () => {
    download('embq-progress.json', ctx.engine.state_json(), 'application/json');
    toast('已导出进度');
  });

  document.getElementById('btnImport')!.addEventListener('click', () => {
    (document.getElementById('importFile') as HTMLInputElement).click();
  });

  document.getElementById('importFile')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      ctx.engine.load_state_json(await file.text());
      ctx.persist();
      if (!ctx.engine.restore_deck()) toast('进度已导入，卷需要重新组');
      else toast('进度已导入');
      ctx.rerender();
    } catch {
      toast('导入失败：文件格式不对');
    }
  });

  document.getElementById('btnExportWrong')!.addEventListener('click', () => {
    download('今日错题.md', wrongTodayMarkdown(ctx), 'text/markdown');
  });

  document.getElementById('btnReset')!.addEventListener('click', async () => {
    if (!confirm('清空全部进度？这个操作没法撤销，建议先导出。')) return;
    await resetState();
    location.reload();
  });
}

function syncOral(ctx: AppCtx): void {
  const t = document.getElementById('oralToggle')!;
  const on = ctx.engine.oral();
  t.dataset.on = String(on);
  t.textContent = `口述模式：${on ? '开' : '关'}`;
  t.classList.toggle('is-on', on);
  document.getElementById('oralTimeBtn')!.textContent = `倒计时：${ctx.engine.oral_seconds()} 秒`;
}

function download(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
```

`wrongTodayMarkdown(ctx)` 照 `legacy/js/app.js` 的导出格式平移：标题 + 日期，每题一段「题干 + 参考答案」。

- [ ] **Step 6: 手工验证**

- 主题按钮循环 auto → light → dark，刷新后保持
- 口述模式开关后题卡先只显示题干与倒计时；倒计时秒数按 30/60/90/120/180 循环
- 导出进度得到 JSON 文件，清空后再导入能恢复
- 题库自检显示「通过」
- 「清空全部进度」有二次确认，确认后进度归零

- [ ] **Step 7: Commit**

```bash
git add src/ui/settings.ts src/ui/theme.ts src/ui/keys.ts src-rust/lib.rs
git commit -m "feat(ui): settings panel, theme cycling and keyboard shortcuts"
```

---

### Task 21: Service Worker 与 web 版部署

**Files:**
- Modify: `sw.js`
- Modify: `vite.config.ts`
- Modify: `package.json`

`sw.js` 现在缓存的是已经移走的 `js/*.js` 和 `data/*.js`，必须换成构建产物。

**Interfaces:**
- Consumes: Task 16 的 vite 构建。
- Produces: 可离线运行的 web 版 + `npm run deploy`。

- [ ] **Step 1: 重写 sw.js 的缓存清单**

```javascript
// sw.js
const CACHE = 'embq-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './data/questions.json',
  './data/categories.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// 清掉旧版本缓存，否则老用户会一直吃到已删除的 js/*.js
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((res) => {
      // 只缓存同源成功响应，避免把 opaque 响应塞进缓存
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit)),
  );
});
```

构建产物（带 hash 的 JS/WASM）不写进 `ASSETS` —— 文件名每次构建都变，写死会导致 install 失败。它们由 fetch 处理器在首次访问时缓存。

- [ ] **Step 2: 让 vite 把静态资源拷进 dist**

```typescript
// vite.config.ts
import { copyFileSync, cpSync, existsSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  plugins: [{
    name: 'copy-static',
    closeBundle() {
      cpSync('data', 'dist/data', { recursive: true });
      cpSync('icons', 'dist/icons', { recursive: true });
      cpSync('css', 'dist/css', { recursive: true });
      for (const f of ['sw.js', 'manifest.json']) {
        if (existsSync(f)) copyFileSync(f, `dist/${f}`);
      }
    },
  }],
});
```

- [ ] **Step 3: 构建并验证离线可用**

```bash
npm run build
npx vite preview --port 4173
```

DevTools → Application：确认 Service Worker 已注册、Cache Storage 里有 `embq-v2`。然后勾 Network → Offline，刷新页面应仍能加载并出题。

- [ ] **Step 4: 关键验收 —— 进度与顺序**

这是整个重构要修的两个 bug，逐条确认：

1. 刷 5 道题 → 关掉标签页 → 重新打开 → **停在第 6 题**，前 5 题的盒号已更新
2. DevTools 删掉 IndexedDB 的 `embq` 库 → 刷新 → 进度**从 localStorage 快照恢复**
3. 「顺序练」组卷 → 记下前 3 题 → 刷新 → **前 3 题顺序完全相同**
4. 「随机练」组卷 → 刷到第 4 题 → 刷新 → **仍在第 4 题，且卷的顺序没变**
5. 刷题中途切到别的标签页再切回来 → 进度没丢（`visibilitychange` 强制 flush 生效）

- [ ] **Step 5: 部署到 GitHub Pages**

```bash
npm install --save-dev gh-pages@6.2.0
```

`package.json` 的 scripts 追加：

```json
"deploy": "npm run build && gh-pages -d dist"
```

```bash
npm run deploy
```

访问 `https://craftbai.github.io/Interview-Question/` 验证线上版本可用。

- [ ] **Step 6: Commit**

```bash
git add sw.js vite.config.ts package.json
git commit -m "fix(pwa): update service worker cache manifest for v2 build output"
```

---

### Task 22: Tauri Windows 打包

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/tauri.conf.json`
- Modify: `Cargo.toml`（排除 src-tauri 出工作区）

**Interfaces:**
- Consumes: Task 21 的 `dist/` 产物。
- Produces: `src-tauri/target/release/bundle/nsis/*.exe` 安装包。

- [ ] **Step 1: 装 Tauri CLI**

```bash
cargo install tauri-cli --version "^2.0" --locked
cargo tauri --version
```

预期：打印 `tauri-cli 2.x`。

- [ ] **Step 2: 根 Cargo.toml 排除 src-tauri**

`src-tauri/` 是独立 crate，编译到本机 target，而 `embq-core` 编译到 wasm32；放进同一工作区会让 `cargo test` 连带编译 Tauri 依赖，很慢也容易冲突。

```toml
# Cargo.toml 末尾追加
[workspace]
members = []
exclude = ["src-tauri"]
```

- [ ] **Step 3: 写 src-tauri/Cargo.toml**

```toml
[package]
name = "embq-desktop"
version = "2.0.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
```

- [ ] **Step 4: 写 build.rs 与 main.rs**

```rust
// src-tauri/build.rs
fn main() {
    tauri_build::build()
}
```

```rust
// src-tauri/src/main.rs
// release 下不弹控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
```

- [ ] **Step 5: 写 tauri.conf.json**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "嵌入式面试题库",
  "version": "2.0.0",
  "identifier": "com.embedded.quiz",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "嵌入式面试题库",
        "width": 900,
        "height": 700,
        "resizable": true,
        "center": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": ["icons/icon.ico", "icons/icon-512.png"],
    "windows": {
      "certificateThumbprint": null,
      "nsis": { "installMode": "currentUser" }
    }
  }
}
```

CSP 里的 `'wasm-unsafe-eval'` 是必须的 —— 少了它 Tauri 的 webview 会拦掉 WASM 实例化，应用白屏。`installMode: currentUser` 让安装包不需要管理员权限。

- [ ] **Step 6: 生成 .ico 图标**

```bash
cargo tauri icon icons/icon-512.png --output src-tauri/icons
```

预期：`src-tauri/icons/` 下生成 `icon.ico` 与各尺寸 png。

- [ ] **Step 7: 开发模式验证**

```bash
cargo tauri dev
```

预期：弹出 900×700 窗口，标题「嵌入式面试题库」，界面与 web 版一致。逐条确认：

- 组卷、作答、评分、统计全部正常
- 关掉窗口再打开，停在上次那一题（IndexedDB 在 Tauri webview 里同样持久化）
- 主题切换正常

若白屏，打开 webview 的开发者工具（`cargo tauri dev` 下按 F12）看 console 是否有 CSP 报错。

- [ ] **Step 8: 打 release 包**

```bash
cargo tauri build
```

预期：产出 `src-tauri/target/release/bundle/nsis/嵌入式面试题库_2.0.0_x64-setup.exe`。

- [ ] **Step 9: 装包验证**

运行安装包，从开始菜单启动，重跑 Step 7 的验收清单。额外确认：安装后的应用与开发模式行为一致，IndexedDB 数据独立于浏览器。

- [ ] **Step 10: Commit**

```bash
git add src-tauri Cargo.toml
git commit -m "feat(desktop): add Tauri windows packaging"
```

---

### Task 23: 收尾与文档

**Files:**
- Modify: `README.md`
- Delete: `scripts/verify-sample.mjs`
- Modify: `src-rust/parser.rs`（放宽题量断言）

- [ ] **Step 1: 跑全套测试**

```bash
cargo test
npm test
npm run build
```

预期：Rust 75 个测试 PASS，TS 18 个测试 PASS，构建无错误。

- [ ] **Step 2: 删临时脚本**

```bash
git rm scripts/verify-sample.mjs
```

抽样比对已完成，题量与字段由 Rust 测试持续守着，这个脚本不再需要。`scripts/migrate.mjs` **保留** —— 万一要从 legacy 重跑迁移还用得上。

- [ ] **Step 3: 让题量断言容纳新增题目**

`real_bank_passes_validation` 硬断言 476，每加一道新题都会失败。改成下限，把「id 唯一、分类合法、答案不越界」这些真正要守的规则留给 `parse` 本身：

```rust
        assert!(c.len() >= 476, "题目数不该少于迁移时的 476，实际 {}", c.len());
        assert_eq!(c.cats().len(), 19);
```

```bash
cargo test --lib parser
```

预期：9 个测试 PASS。

- [ ] **Step 4: 验证新增题目流程**

手工往 `data/questions.json` 末尾追加一道题：

```json
{"id":"c-999","cat":"c-lang","q":"测试题","a":"测试答案","type":"qa","level":1}
```

```bash
cargo test --lib parser
```

预期：PASS（题量 477 ≥ 476）。再把 `cat` 改成 `"nope"` 重跑，预期 FAIL 并指出分类未登记 —— 确认校验真的在工作。验证完把这道测试题删掉，重跑确认回到 476。

- [ ] **Step 5: 确认 CSS 一字未改**

```bash
git log --oneline -- css/style.css
git diff 5c32be0 HEAD -- css/style.css
```

预期：`git diff` 输出为空。这是硬约束，若有改动就回滚 CSS 并改 TS 去适配。

- [ ] **Step 6: 更新 README**

改动这几处：

- 技术栈：`纯 HTML/CSS/JS` → `Rust (WASM) + TypeScript + Tauri`
- 新增「开发」段：`npm install` → `npm run wasm` → `npm run dev`
- 新增「构建」段：web 版 `npm run build` / `npm run deploy`；桌面版 `cargo tauri build`
- 新增「加题」段：直接编辑 `data/questions.json`，然后 `cargo test --lib parser` 校验
- 说明 `legacy/` 是 v1 归档，保留一个版本周期

- [ ] **Step 7: Commit**

```bash
git add README.md src-rust/parser.rs
git rm --cached scripts/verify-sample.mjs 2>/dev/null || true
git commit -m "docs: update README for v2 stack and relax question count assertion"
```

---

## 自查

**Spec 覆盖**

| Spec 章节 | 对应任务 |
|---|---|
| 数据模型：Question / Answer / CategoryMeta | Task 3 |
| 数据模型：Catalog（扁平数组 + by_cat） | Task 5 |
| 数据模型：Progress / UserState / Settings / Deck | Task 4 |
| 数据模型：Filter / Scope / Mode | Task 4、Task 14 |
| 模块 1 Parser：parse + 5 条校验规则 | Task 6 |
| 模块 2 Scheduler：筛选 | Task 7 |
| 模块 2 Scheduler：三种排序 + 稳定性 | Task 8 |
| 模块 2 Scheduler：导航 + 进度恢复 | Task 9 |
| 模块 2 Scheduler：record / judge / distribution | Task 10 |
| 模块 3 Store：双写 + 旧数据迁移 + flush 时机 | Task 13 |
| 模块 4 Stats：5 个函数 | Task 11 |
| Rust ↔ TS 桥接：QuizEngine 全部方法 | Task 12、Task 20 |
| UI：Markdown 留在 TS | Task 15 |
| UI：启动流程 boot() | Task 16 |
| UI：card / filter / stats | Task 17、18、19 |
| UI：settings / keys / theme / toast | Task 16、Task 20 |
| 题库迁移：27 脚本 → 2 JSON + 自检 | Task 2 |
| 题库迁移：旧文件移到 legacy/ | Task 2 |
| 打包：Tauri 配置 + 构建流程 | Task 22 |
| 打包：双端策略（web + 桌面并存） | Task 21、Task 22 |
| 测试：Rust 单元测试 6 类 | Task 3–12 |
| 测试：迁移校验 | Task 2 |
| 测试：浏览器路径验证 | Task 17–21 手工验收 |
| 风险：WASM 体积 | Task 1（LTO + opt-level z）、Task 12 Step 7 |
| 风险：IndexedDB 兼容性 | Task 13（3 条兜底路径测试） |
| 风险：迁移脚本出错 | Task 2（自检不过不写文件） |
| 风险：Tauri 打包失败 | Task 22（先 dev 验证再 build） |

**偏离 spec 的四处，均已在计划开头说明并在任务内落地：**

1. `fuzzy` 保持 v1 语义（不降级）— Task 10
2. `UserState` 加 serde rename 保兼容 — Task 4
3. `Ordered` 用题库原始下标而非 id 字典序（spec 要求，v1 是 id 序）— Task 8
4. `Smart` 排序键加入 urgency 位，保住 v1 的「错多于对加急 / 简历高危提前」同时做到可复现 — Task 8

**Spec 未覆盖但实现必需的，已补进计划：**

- `Scope::ResumeRisk` 序列化对齐 DOM 的 `data-scope="resume"`（Task 14）
- `theme()` / `oral()` / `oral_seconds()` 访问器 —— 设置面板需要（Task 20）
- `sw.js` 缓存清单更新 —— 旧清单指向已删除文件（Task 21）
- Vite `base: './'` + 静态资源拷贝 —— 双端共用产物（Task 21）
- Tauri CSP 的 `'wasm-unsafe-eval'` —— 少了会白屏（Task 22）
- 根 Cargo 工作区排除 `src-tauri`（Task 22）

**跨边界类型一致性**

- `Filter.seed`：Rust `Option<u64>` ⇄ TS `number | null`，serde `default` 兜住缺失
- `Grade`：以字符串过桥，取值 `know` / `fuzzy` / `no`，与 DOM 的 `data-grade` 一致
- `Scope`：`resume` ⇄ `ResumeRisk`（Task 14）
- `accuracy`：两侧都是 0–1 小数，只在渲染时乘 100
- `stats()` 载荷用 camelCase（`byCategory` / `resumeRisk`），因为它是 `serde_json::json!` 手写的字面量，与 TS 侧 `StatsPayload` 逐字对应
- `resumeRisk.weak_ids` 保持 snake_case —— 它来自 `RiskStats` 的 derive，Task 19 的 TS 接口按此声明
