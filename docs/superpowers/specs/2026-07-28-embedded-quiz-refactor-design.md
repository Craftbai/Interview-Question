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

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct Question {
    pub id: String,         // 如 "c-001", "os-042"
    pub cat: String,        // 分类 ID，与 _meta.js 中的 id 对应
    pub q: String,          // 题干（Markdown）
    pub a: String,          // 答案（Markdown）
    #[serde(default)]
    pub r#type: QType,      // single | multi | bool | qa
    #[serde(default)]
    pub options: Vec<String>, // 选项（仅 objective 题需要）
    #[serde(default)]
    pub ans: Vec<usize>,    // 正确答案索引（仅 objective 题需要）
    pub level: u8,          // 1=基础, 2=进阶, 3=深入
    #[serde(default)]
    pub tags: Vec<String>,  // 标签
    #[serde(default)]
    pub resume: bool,       // 是否简历高危
    #[serde(default)]
    pub followup: Vec<String>, // 面试官可能追问
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

### 分类索引

运行时按 `cat` 建立索引，避免每次查询全表扫描：

```rust
pub struct Catalog {
    all: Vec<Question>,
    by_cat: HashMap<String, Vec<usize>>, // cat -> question indices
    by_level: HashMap<u8, Vec<usize>>,
    by_type: HashMap<QType, Vec<usize>>,
}
```

### 用户状态（Progress）

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct Progress {
    pub id: String,
    pub box: u8,       // 0=未练, 1=生, 2=熟, 3=已掌握
    pub right: u32,
    pub wrong: u32,
    pub seen: u32,
    pub last: u64,     // last_seen timestamp
    pub fav: bool,
}

#[derive(Serialize, Deserialize)]
pub struct UserState {
    pub version: u32,
    pub progress: HashMap<String, Progress>,
    pub days: HashMap<String, u32>,      // "YYYY-MM-DD" -> count
    pub wrong_today: HashMap<String, Vec<String>>,
    pub settings: Settings,
}
```

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

```rust
pub fn parse(path: &str) -> Result<Catalog, ParseError>;
pub fn validate(q: &Question) -> Result<(), ValidationError>;
```

校验规则：
- `id` 非空，全局唯一
- `cat` 必须在分类表中存在
- `level` ∈ {1, 2, 3}
- `ans` 索引不能超出 `options` 范围
- 简答题必须有答案

### 模块 2：Scheduler — 调度引擎

**职责**：根据过滤条件和用户状态，从题库中选题。

```rust
pub struct Scheduler {
    state: UserState,
    catalog: Catalog,
    pool: Vec<&'static Question>,
    pos: usize,
    finished: bool,
}

impl Scheduler {
    pub fn new(catalog: Catalog, state: UserState) -> Self;
    pub fn build(&mut self, filter: &Filter) -> bool;
    pub fn next(&self) -> Option<&Question>;
    pub fn record(&mut self, id: &str, grade: Grade);
    pub fn goto(&mut self, pos: usize);
    pub fn distribution(&self) -> [usize; 4]; // [未练, 生, 熟, 已掌握]
}
```

**Smart 模式算法**：
- 按 Leitner 盒分组，盒号低的优先级高
- 同组内按 `last_seen` 升序（上次做过的优先）
- 同组同时间戳用随机打破平局

**Random 模式算法**：
- Fisher-Yates shuffle，使用确定性种子

**Ordered 模式算法**：
- 按题库原始顺序

### 模块 3：Store — 持久化

**职责**：读写用户状态到 IndexedDB，localStorage 做兜底。

```rust
pub struct PersistentStore;

impl PersistentStore {
    pub fn load() -> UserState;   // IndexedDB 优先，失败则 localStorage
    pub fn save(state: &UserState);
    pub fn reset();
    pub fn export_json() -> String;
    pub fn import_json(json: &str) -> Result<UserState, Error>;
}
```

IndexedDB 方案：
- DB 名：`embq-v2`
- ObjectStore `progress`：key=id，value=Progress
- ObjectStore `meta`：保存 UserState 元数据

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

使用 `wasm-bindgen`：

```rust
// Rust
#[wasm_bindgen]
pub fn parse_questions(json: &str) -> JsValue;

#[wasm_bindgen]
pub fn scheduler_build(filter_json: &str) -> bool;

#[wasm_bindgen]
pub fn scheduler_next() -> Option<String>;

#[wasm_bindgen]
pub fn scheduler_record(id: &str, grade: &str);

// TypeScript
import { init, parse_questions, scheduler_next } from '../pkg/my_quiz_lib';

async function boot() {
  await init();
  const catalog = parse_questions(await fetch('/data/questions.json').text());
  const next = scheduler_next();
}
```

## UI 层（TypeScript）

UI 层负责渲染和事件绑定，核心原则：

1. **保留现有 DOM 结构和 CSS** — `index.html` 的 HTML 结构基本不动，CSS 文件原样保留
2. **重写 JavaScript 交互逻辑** — 用 TS 重写 `app.js`，引入 WASM 模块
3. **组件化** — 将渲染逻辑拆分为独立函数，方便测试

```
src/ui/
├── render.ts          # DOM 渲染（card, stats, filter panel）
├── events.ts          # 事件绑定（点击、键盘）
├── theme.ts           # 主题切换
└── toast.ts           # 提示消息
```

Markdown 渲染器保留现有逻辑，移至 `src/core/render_md.ts`。

## 题库迁移

### 迁移脚本 `scripts/merge_data.py`

```python
# 读取所有 data/*.js 文件
# 提取 QBANK.add() 调用中的题目
# 写入 data/questions.json
```

### 旧题库文件处理

- 迁移完成后保留 `data/` 目录（标注 deprecated）
- 新增题目直接写入 `data/questions.json`
- `_meta.js` 中的分类信息同步到 `data/categories.json`

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

### Rust 单元测试

```rust
#[test]
fn test_smart_mode_prioritizes_lower_box() { ... }

#[test]
fn test_random_mode_deterministic_with_seed() { ... }

#[test]
fn test_filter_by_category() { ... }

#[test]
fn test_validate_rejects_invalid_ans_index() { ... }
```

### TypeScript 集成测试

- 用 Playwright 测试完整用户流程（筛选 → 答题 → 查看统计）
- 验证 IndexedDB 读写

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
| M1: Rust 核心 | Parser + Scheduler + Store 单元测试通过 | 2-3 天 |
| M2: TS 胶水 | WASM 桥接 + IndexedDB + 题库合并 | 1-2 天 |
| M3: UI 重写 | 渲染层迁移，功能等效 | 2-3 天 |
| M4: 打包 | Tauri Windows exe | 1 天 |
| M5: 测试 | 端到端测试 + 验收 | 1 天 |

总计约 **7-10 个工作日**。
