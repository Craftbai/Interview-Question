# 嵌入式面试题库 v2 — Rust + TS 重构设计

> 日期：2026-07-28
> 状态：待评审

## 背景

现有项目是纯 HTML/CSS/JS 的刷题练习器，运行在 GitHub Pages 上作为 PWA 使用。存在两个核心问题：

1. **进度丢失** — 使用 localStorage 存储，PWA 更新或浏览器清理后进度丢失
2. **调度算法不可靠** — 随机种子不稳定，Leitner 盒更新存在边界 bug

重构目标：用 Rust 重写核心逻辑（类型安全、算法正确），TS 做 UI 层，打包为 Windows exe 桌面应用。

## 架构

```
┌──────────────────────────────────────────┐
│            UI Layer (TypeScript)         │
│  DOM 渲染 · 事件绑定 · 样式              │
├──────────────────────────────────────────┤
│         Storage Layer (IndexedDB)        │
│  进度持久化（主）+ localStorage（兜底）   │
├──────────────────────────────────────────┤
│         Core Logic (Rust → WASM)         │
│  题库解析 · 筛选 · 调度 · 评分           │
├──────────────────────────────────────────┤
│       Data Layer (Flat JSON)             │
│  所有题目合并为一个扁平数组               │
└──────────────────────────────────────────┘
```

## 数据模型

### 题目（Question）

字段名与现有题库 **完全一致**，迁移时不需要改任何一道题的数据。

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct Question {
    pub id: String,            // 如 "c-001", "os-042"
    pub cat: String,           // 分类 ID，与 categories.json 中的 id 对应
    pub q: String,             // 题干（Markdown）
    pub a: String,             // 参考答案（Markdown）
    #[serde(rename = "type")]
    pub qtype: QType,          // single | multi | bool | qa
    #[serde(default)]
    pub options: Vec<String>,  // 选项（single / multi）
    #[serde(default)]
    pub answer: Answer,        // 见下：多态字段
    #[serde(default = "one")]
    pub level: u8,             // 1=基础, 2=进阶, 3=深入
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub resume: bool,          // 简历高危
    #[serde(default)]
    pub followup: Vec<String>, // 面试官可能追问
}
```

**`answer` 是多态字段**：选择题是索引数组 `[0, 2]`，判断题是布尔 `true`，简答题没有这个字段。用 untagged enum 表达：

```rust
#[derive(Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum Answer {
    Indices(Vec<usize>),   // single / multi
    Bool(bool),            // bool
    None,                  // qa
}

impl Default for Answer {
    fn default() -> Self { Answer::None }
}
```

### 分类元数据（CategoryMeta）

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct CategoryMeta {
    pub id: String,
    pub name: String,
    pub desc: String,
}
```

### 题库容器（Catalog）

```rust
pub struct Catalog {
    all: Vec<Question>,                  // 扁平存储，下标即 stable id
    by_cat: HashMap<String, Vec<usize>>, // 分类 → 下标列表，保持原始顺序
    cats: Vec<CategoryMeta>,             // 有序，决定 UI 上分类的显示顺序
    cat_index: HashMap<String, usize>,   // cat id → cats 下标
}
```

**扁平数组 + `by_cat` 索引，兼顾了两件事**：数据层面不分文件（新增题目只往数组末尾追加），逻辑层面分类依然是一等公民（`by_cat` 直接给出某分类的全部题目，O(1) 查表）。`cats` 保持声明顺序，所以筛选面板里分类的排列跟现在完全一致。

`by_level` 和 `by_type` 不建索引 —— 468 条数据线性扫描是微秒级，多一份索引只是多一处要维护同步的状态。

### 用户状态（Progress）

`box` 是 Rust 关键字，字段名用 `bx`，序列化时映射回 `box` 保持与现有存档兼容。

```rust
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Progress {
    #[serde(rename = "box")]
    pub bx: u8,        // 0=未练, 1=生, 2=熟, 3=已掌握
    pub right: u32,
    pub wrong: u32,
    pub seen: u32,
    pub last: u64,     // 上次作答的 Unix 毫秒
    pub fav: bool,
}

#[derive(Serialize, Deserialize)]
pub struct UserState {
    pub version: u32,                              // = 2
    pub q: HashMap<String, Progress>,              // 题 id → 进度
    pub days: HashMap<String, u32>,                // "YYYY-MM-DD" → 当日题量
    pub wrong_today: HashMap<String, Vec<String>>, // 日期 → 错题 id
    pub settings: Settings,
    pub deck: Option<Deck>,                        // v2 新增：未刷完的卷
}

/// v2 新增：让「关掉再打开还在原来那一题」成为可能
#[derive(Serialize, Deserialize)]
pub struct Deck {
    pub ids: Vec<String>,      // 组卷结果，按出题顺序
    pub pos: usize,            // 当前进度
    pub filter: Filter,        // 组卷条件，供「再刷一遍」
    pub seed: u64,             // 随机模式的种子
    pub bank_hash: u64,        // 题库指纹，用于判断题库是否变过
}

#[derive(Serialize, Deserialize)]
pub struct Settings {
    pub theme: String,         // auto | light | dark
    pub oral: bool,            // 口述模式
    pub oral_seconds: u32,
}
```

`deck` 是修复「每次打开都重新随机」的关键：现在的实现只存了单题状态，卷本身没有持久化，所以每次启动都要重新组卷。存了 `deck` 之后，启动流程变成「有未完成的卷就恢复它，没有才新建」。

### 过滤器（Filter）

```rust
pub struct Filter {
    pub cats: Vec<String>,      // 空 = 不限
    pub levels: Vec<u8>,
    pub types: Vec<QType>,
    pub scopes: Vec<Scope>,
    pub mode: Mode,             // Smart | Ordered | Random
    pub keyword: String,
    pub seed: Option<u64>,      // 随机模式种子
}

pub enum Scope {
    Wrong,
    Unmastered,
    Fav,
    ResumeRisk,
}

pub enum Mode {
    Smart,      // Leitner 盒权重 + 随机
    Ordered,    // 按题库顺序
    Random,     // 完全随机
}
```

## 核心模块

### 模块 1：Parser — 题库解析

**职责**：加载 JSON，校验数据完整性，构建分类索引。

WASM 里没有文件系统，JSON 文本由 TS 层 fetch 后传入：

```rust
pub fn parse(questions_json: &str, categories_json: &str) -> Result<Catalog, ParseError>;
pub fn validate(q: &Question, cats: &HashMap<String, CategoryMeta>) -> Result<(), ValidationError>;
```

校验规则：
- `id` 非空，全局唯一
- `cat` 必须在分类表中存在
- `level` ∈ {1, 2, 3}
- `answer` 格式正确（选择题是整数数组，判断题是布尔值）
- 简答题必须有答案

### 模块 2：Scheduler — 调度引擎

**职责**：根据过滤条件和用户状态，从题库中选题。

`pool` 存的是 `catalog.all` 的下标，不是引用 —— 避免自引用结构在 WASM 边界上的生命周期问题。

```rust
pub struct Scheduler {
    catalog: Catalog,
    state: UserState,
    filter: Filter,      // 保留，供「再刷一遍」复用
    pool: Vec<usize>,    // catalog.all 的下标
    pos: usize,
}

impl Scheduler {
    pub fn new(catalog: Catalog, state: UserState) -> Self;
    pub fn build(&mut self, filter: &Filter) -> usize;   // 返回组卷题数，0 = 无命中
    pub fn current(&self) -> Option<&Question>;
    pub fn advance(&mut self);                            // 前进一题
    pub fn back(&mut self) -> bool;                       // 回退一题，已在首题返回 false
    pub fn goto(&mut self, pos: usize);
    pub fn is_finished(&self) -> bool;                    // pos >= pool.len()
    pub fn record(&mut self, id: &str, grade: Grade);
    pub fn judge(&self, id: &str, picked: &[usize]) -> Verdict;
    pub fn distribution(&self, pool: &[usize]) -> [usize; 4]; // [未练, 生, 熟, 已掌握]
}
```

**排序稳定性是这次重构要解决的核心 bug**。三种模式的排序键都必须是全序（total order），不能出现「相等元素顺序不定」的情况，否则每次组卷顺序都会变。

| 模式 | 排序键 | 种子 |
|------|--------|------|
| `Ordered` | 题库原始下标 | 不需要 |
| `Smart` | `(box, last_seen, id)` 三元组升序 | 不需要 |
| `Random` | Fisher-Yates shuffle | `seed` 必填 |

- **`Smart`**：盒号低的先出（没练过和练错的优先），同盒按上次做的时间升序，时间也相同时用 `id` 字典序兜底。**全序、无随机、结果可复现**。
- **`Random`**：用 `StdRng::seed_from_u64(seed)` 而不是系统熵源。同一个 seed 永远得到同一个顺序。seed 由 TS 层生成后存进 UserState —— 这样退出重进能接着刷同一份卷，用户想换顺序就显式点「重新组卷」换 seed。

进度恢复：`pool` 的 id 列表和 `pos` 一起持久化。下次启动时若题库未变（比对题目数量与 id 集合哈希），直接恢复到上次那一题；题库变了则丢弃旧卷并提示重新组卷。

### 模块 3：Store — 持久化

**IndexedDB 是浏览器 API，所以这一层在 TS 里，不在 Rust 里。** Rust 核心保持纯函数、零 IO —— 它只负责把 `UserState` 序列化成字符串，读写由 TS 完成。这也是整套设计能被单元测试覆盖的前提。

Rust 侧只暴露两个纯函数：

```rust
#[wasm_bindgen]
pub fn state_to_json() -> String;                      // 导出当前状态
#[wasm_bindgen]
pub fn state_from_json(json: &str) -> Result<(), JsError>;  // 导入并校验
```

TS 侧负责实际读写：

```typescript
// src/core/store.ts
export interface Store {
  load(): Promise<string | null>;   // 返回 JSON 文本，交给 Rust 反序列化
  save(json: string): Promise<void>;
  reset(): Promise<void>;
}
```

**双写策略**（这是「进度丢失」的正面修复）：

- **读**：先读 IndexedDB。为空或抛错 → 回退读 localStorage 的 `embq.v1`（旧版 key，自动迁移）→ 都没有则用空状态。
- **写**：先写 IndexedDB，成功后再写一份到 localStorage。localStorage 只保留最近一份快照，作为 IndexedDB 被清或损坏时的救命绳。
- **写入时机**：每次 `record()` 后 debounce 300ms 落盘，另外在 `visibilitychange`（切后台）和 `beforeunload` 时强制 flush —— 现在的实现只有 debounce，切后台时那 120ms 内的作答会丢。

IndexedDB 结构：

| 项 | 值 |
|---|---|
| DB | `embq` |
| version | `2` |
| ObjectStore | `state`，key 固定为 `"current"`，value 为完整 UserState JSON |

单条记录而不是按题 id 拆成多条：468 题的状态序列化后只有几十 KB，一次读写反而比几百次事务快，也不用处理部分写入失败。

**旧数据迁移**：首次启动检测到 localStorage 有 `embq.v1` 而 IndexedDB 为空时，读出旧数据、补齐 v2 新增字段（`deck`、`seed`）、写入 IndexedDB。旧 key 不删除，保留一个版本周期作为回退。

### 模块 4：Stats — 统计

**职责**：计算统计指标，无副作用。

```rust
pub struct Stats;

impl Stats {
    pub fn overall(state: &UserState, catalog: &Catalog) -> OverallStats;
    pub fn by_category(state: &UserState, catalog: &Catalog) -> Vec<CategoryStats>;
    pub fn weakest(state: &UserState, catalog: &Catalog, n: usize) -> Vec<CategoryStats>;
    pub fn heatmap(state: &UserState, days: usize) -> Vec<HeatCell>;
    pub fn resume_risk(state: &UserState, catalog: &Catalog) -> RiskStats;
}
```

## Rust ↔ TypeScript 桥接

用 `wasm-bindgen` 暴露一个 `QuizEngine` 类，而不是一堆自由函数 —— 状态封装在 Rust 里，TS 只持有句柄。跨边界一律传 JSON 字符串或 `serde-wasm-bindgen` 转换后的结构体，不共享内存。

```rust
#[wasm_bindgen]
pub struct QuizEngine { inner: Scheduler }

#[wasm_bindgen]
impl QuizEngine {
    /// questions_json / categories_json 由 TS fetch 后传入
    /// state_json 为 null 时使用空状态
    #[wasm_bindgen(constructor)]
    pub fn new(questions_json: &str, categories_json: &str, state_json: Option<String>)
        -> Result<QuizEngine, JsError>;

    // --- 组卷 ---
    pub fn build(&mut self, filter_json: &str) -> usize;   // 返回题数
    pub fn restore_deck(&mut self) -> bool;                // 恢复上次未刷完的卷
    pub fn count(&self, filter_json: &str) -> JsValue;     // 筛选面板的实时计数

    // --- 出题 ---
    pub fn current(&self) -> JsValue;                      // Question | null
    pub fn position(&self) -> usize;
    pub fn size(&self) -> usize;
    pub fn is_finished(&self) -> bool;
    pub fn advance(&mut self);
    pub fn back(&mut self) -> bool;

    // --- 作答 ---
    pub fn judge(&self, picked: Vec<usize>) -> JsValue;    // Verdict
    pub fn record(&mut self, grade: &str);
    pub fn toggle_fav(&mut self) -> bool;

    // --- 统计 ---
    pub fn stats(&self) -> JsValue;
    pub fn health(&self) -> Vec<JsValue>;                  // 题库自检

    // --- 状态导出（TS 负责落盘）---
    pub fn state_json(&self) -> String;
    pub fn is_dirty(&self) -> bool;                        // 有未落盘的改动
}
```

TS 侧的启动流程：

```typescript
// src/main.ts
import init, { QuizEngine } from '../pkg/embq_core';
import { loadState, saveState } from './core/store';

async function boot() {
  await init();

  const [questions, categories, saved] = await Promise.all([
    fetch('data/questions.json').then(r => r.text()),
    fetch('data/categories.json').then(r => r.text()),
    loadState(),                       // IndexedDB → localStorage 兜底
  ]);

  const engine = new QuizEngine(questions, categories, saved ?? undefined);

  // 有未刷完的卷就接着刷，否则智能复习全库
  if (!engine.restore_deck()) {
    engine.build(JSON.stringify(defaultFilter()));
  }

  mount(engine);                       // 绑定 UI
}
```

`engine.state_json()` 在每次 `record()` 后由 TS 取出落盘。Rust 不知道存储介质存在，TS 不知道调度算法怎么算 —— 两边职责不重叠。

## UI 层（TypeScript）

**视觉零变化是硬约束。** `css/style.css` 原样保留，一个字节都不改；`index.html` 的 DOM 结构和 class 名保持不变。终端极简风格（等宽字体、直角边框、1px 线框、磷光绿强调色、`// ` 标签前缀、`>_` 品牌标记）全部由现有 CSS 承载，重构不碰它。

现在的 `app.js` 是 816 行的单文件，渲染、事件、Markdown、主题、导入导出全在里面。按职责拆开：

```
src/ui/
├── card.ts       # 题卡渲染（题头、选项、答案、评分行、口述模式）
├── stats.ts      # 统计视图（KPI、分类条形图、热力图）
├── filter.ts     # 筛选面板（chips 状态 ⇄ Filter 对象）
├── settings.ts   # 设置面板（口述模式、导入导出、题库自检）
├── keys.ts       # 键盘快捷键
├── theme.ts      # 主题切换
└── toast.ts      # 提示消息
src/core/
├── markdown.ts   # Markdown 渲染（从 app.js 平移，逻辑不变）
└── store.ts      # IndexedDB + localStorage
```

**Markdown 渲染器留在 TS 而不是搬进 Rust**：它输出 HTML 字符串直接喂给 `innerHTML`，本质是 UI 层的事；搬进 Rust 只是多一次跨边界的字符串拷贝。现有实现（转义优先、表格、引用块、代码块、悬挂缩进编号）已经跑过 468 道题的真实数据，照搬过来加类型标注即可，`window.__renderMD` 测试钩子保留。

渲染函数签名统一为 `(engine: QuizEngine, root: HTMLElement) => void`，纯读 engine、纯写 DOM，不持有自己的状态。现在散落在模块顶层的 `picked` / `revealed` / `verdict` 收进一个 `CardState` 对象，随题目切换整体重置 —— 这是现在「状态污染」类 bug 的来源。

## 题库迁移

现有 26 个 `data/*.js` 文件，每个以 `QBANK.add([...])` 注册一批题目。迁移目标是两个 JSON：

| 文件 | 内容 | 来源 |
|---|---|---|
| `data/questions.json` | 扁平数组，476 道题 | 25 个题库 js 文件按 index.html 中的加载顺序拼接 |
| `data/categories.json` | 分类元数据 + `CAT_PRESETS` | `data/meta.js` |

### 迁移脚本 `scripts/migrate.mjs`

用 Node 而不是 Python —— 题库文件就是 JS，用 Node 直接求值最可靠，不需要写解析器去啃字符串里的转义和模板：

```javascript
// 造一个假的 QBANK 收集调用，然后 import 每个题库文件
const collected = [];
globalThis.QBANK = {
  add: (arr) => collected.push(...arr),
  setCategories: (c) => { categories = c; },
};
for (const f of FILES_IN_LOAD_ORDER) await import(`../data/${f}`);
```

**顺序必须严格照 `index.html` 里 `<script>` 的顺序**，因为 `Ordered` 模式依赖题库原始顺序，顺序变了用户看到的「顺序练」就跟以前不一样了。

### 迁移后的校验

脚本跑完立刻自检，任一条不过就中止并保留旧文件：

- 题目总数 = 476
- id 无重复、无缺失（与旧题库的 id 集合逐一比对）
- 每道题的 `cat` 都在 `categories.json` 里
- 选择题的 `answer` 索引不越界
- 抽样 10 道题逐字段比对，确认 Markdown 里的反斜杠、反引号、换行没有在转换中失真

### 旧文件处理

`data/*.js` 移到 `legacy/data/` 保留一个版本周期，不立即删除 —— 万一发现迁移丢了内容还能回去比对。新增题目直接编辑 `questions.json`；如果手写 JSON 觉得难受，可以保留一个 `scripts/add-question.mjs` 交互式追加。

## 打包

### Tauri 配置

```json
{
  "package": {
    "productName": "嵌入式面试题库",
    "version": "2.0.0"
  },
  "tauri": {
    "bundle": {
      "identifier": "com.embedded.quiz",
      "windows": {
        "certificateThumbprint": null
      }
    },
    "windows": [
      {
        "title": "嵌入式面试题库",
        "width": 900,
        "height": 700,
        "resizable": true,
        "center": true
      }
    ]
  }
}
```

### 构建流程

```bash
# 1. 编译 Rust → WASM
wasm-pack build --target web

# 2. 构建前端
npm run build

# 3. 打包 Tauri
cargo tauri build
```

## 测试

### Rust 单元测试（无需浏览器）

Rust 纯函数层占大头，全部跑 `cargo test`：

| 测试类别 | 代表用例 |
|---|---|
| 解析 | 非法 JSON 拒绝、空答案接受、id 重复拒绝 |
| 筛选 | 按分类/难度/题型/关键词/范围过滤 |
| 调度 | `Smart` 优先低盒号、`Random` 同 seed 同结果、`Ordered` 保序 |
| 作答 | `know` 升盒、`fuzzy` 降回 1 盒、`no` 回 1 盒 |
| 统计 | 掌握率计算、热力图网格、简历高危题 |
| 边界 | 空题库不 panic、`goto` 越界、`back` 在首题 |

### 题库迁移测试

- 脚本跑完后自动校验（见上文「迁移后的校验」）
- 抽样 10 道题逐字段比对，确认 Markdown 转义和换行没有失真

### 浏览器集成测试

- 用 WebdriverIO + Firefox 跑关键路径：筛选 → 出题 → 作答 → 评分 → 下一题 → 统计 → 收藏 → 导出/导入
- 验证 IndexedDB 落盘、localStorage 兜底、`deck` 恢复

## 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| WASM 体积过大 | 低 | 中 | 优化编译标志，启用 LTO |
| IndexedDB API 兼容性 | 低 | 中 | localStorage 兜底 |
| 题库迁移脚本出错 | 中 | 高 | 迁移后跑校验脚本 |
| Tauri 打包失败 | 中 | 中 | 提前测试 Tauri 环境 |

## 里程碑

| 阶段 | 交付物 | 预估工时 |
|------|--------|----------|
| M0: 题库迁移 | `questions.json` + `categories.json` + 迁移脚本 + 校验 | 1 天 |
| M1: Rust 核心 | Parser + Scheduler + Stats + 单元测试通过 | 2-3 天 |
| M2: WASM 桥接 | `QuizEngine` 类 + TS 接口 + 状态流转 | 1-2 天 |
| M3: IndexedDB | 双写策略 + 旧数据迁移 + 自动恢复 | 1 天 |
| M4: UI 重写 | 渲染函数迁移，功能等效 | 2-3 天 |
| M5: Tauri | Windows exe 构建 + 打包配置 | 1 天 |
| M6: 测试 | Rust 单元测试 + 浏览器集成测试 + 验收 | 1 天 |

总计约 **8-11 个工作日**。
