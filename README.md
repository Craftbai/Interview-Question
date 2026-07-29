# 嵌入式面试题库 · 刷题练习器

两种用法，进度都存在本地：

- **网页版**：<https://craftbai.github.io/Interview-Question/> —— 打开就能刷，装成 PWA 后可离线
- **桌面版**：Windows exe，`cargo tauri build` 产出安装包

核心逻辑用 Rust 写、编译成 WASM，界面是 TypeScript。两端共用同一套 `src/`。

---

## 题库现状

**476 题，19 个分类**

| 分类 | 题量 | 分类 | 题量 |
|---|---|---|---|
| C 语言核心 | 35 | 电路与硬件基础 | 20 |
| 手撕代码 | 30 | 总线与通信接口 | 26 |
| C++ 与 OOP | 26 | 网络协议与编程 | 20 |
| 数据结构与算法 | 23 | 编译链接与内存布局 | 21 |
| 控制与信号处理 | 16 | 工程工具与协作 | 17 |
| 操作系统原理 | 20 | 调试与问题定位 | 21 |
| RTOS / FreeRTOS | 25 | 信息安全 | 21 |
| 嵌入式 Linux 应用 | 24 | **汽车电子专题** | **59** |
| Linux 驱动与内核 | 21 | 项目与行为面 | 24 |
| MCU 与硬件 | 27 | | |

其中 **117 题标记为「简历高危」**——这些是因为你简历上写了具体技术名词（AURIX、TriCore、DoIP、AUTOSAR AP、eBPF、ECDSA、Bootloader、UDS、ISO-TP、链接脚本、Qt、CMake）才会被追问的题，答不上来最伤。可以在筛选面板里单独刷这一组。

---

## 用法

### 三种练习模式
- **智能复习**（默认）：Leitner 三盒算法，优先推没练过和练错的题
- **顺序练**：按分类逐题过一遍，适合首次扫盲
- **随机练**：模拟真实面试的跳跃感

### 口述模式（建议开启）
在「设置」里打开。只显示题干 + 倒计时，逼自己**出声把答案完整讲一遍**再揭晓。

面试考的是能不能讲清楚，不是能不能认出正确选项。这个开关对提分最直接。

### 快捷键
| 键 | 作用 |
|---|---|
| `1`–`6` | 选择选项 |
| `空格` | 提交 / 揭晓答案 / 下一题 |
| `1` `2` `3` | 简答题自评（会了 / 模糊 / 不会） |
| `←` `→` | 上一题 / 下一题 |
| `F` | 收藏 |
| `/` | 搜索 |
| `Esc` | 关闭面板 |

### 进度管理
进度主存在 IndexedDB，localStorage 留一份快照兜底。切后台、关页面时都会强制落盘，所以关掉再打开会**停在原来那一题**，卷的顺序也不变。

**换电脑或清缓存前先在「设置」里导出进度**。「导出今日错题 (MD)」会生成 Markdown 文件，可直接贴进笔记复盘。

---

## 开发

```bash
npm install
npm run wasm      # 编译 Rust → WASM，产出 pkg/
npm run dev       # 起开发服务器
```

改了 `src-rust/` 之后要重新跑 `npm run wasm`，TypeScript 那侧的类型定义是从这里生成的。

```bash
cargo test        # Rust 单元测试，78 个
npm test          # TypeScript 测试
npx tsc --noEmit  # 类型检查
```

## 构建

```bash
npm run build       # 网页版 → dist/
npm run deploy      # 部署到 GitHub Pages
cargo tauri build   # Windows 安装包 → src-tauri/target/release/bundle/nsis/
```

---

## 加题

直接编辑 `data/questions.json`，在数组末尾追加：

```json
{
  "id": "c-036",
  "cat": "c-lang",
  "type": "qa",
  "level": 2,
  "tags": ["指针"],
  "q": "题干，支持 Markdown 和代码块",
  "options": [],
  "answer": [],
  "a": "参考答案（客观题这里放解析）",
  "followup": ["可能的追问…"],
  "resume": true
}
```

字段含义：`type` 是 `single | multi | bool | qa`；`level` 是 1 基础 / 2 进阶 / 3 深入；选择题的 `answer` 填下标数组，判断题填 `true`/`false`，简答题留空；`resume: true` 标记「简历高危」。

**`id` 一旦用过就不要改**——进度是靠 id 索引的，改了等于丢掉那道题的记录。只追加，不动已有的。

加完跑一遍校验：

```bash
cargo test --lib parser
```

id 重复、分类没登记、选项下标越界都会报出具体题号。「设置」面板底部也有自检状态。

### 新增分类
在 `data/categories.json` 的 `cats` 数组里登记 `{ id, name, desc }` 即可，不需要动 `index.html`。

---

## 技术说明

```
├── index.html              页面骨架，单个 module 入口
├── css/style.css           全部样式，深/浅色双主题（重构中未改动一字节）
├── src-rust/               Rust 核心，纯函数、零 IO
│   ├── lib.rs              QuizEngine：wasm-bindgen 边界
│   ├── models.rs           数据结构 + 旧存档兼容
│   ├── catalog.rs          扁平数组 + 分类索引 + 题库指纹
│   ├── parser.rs           JSON 解析与校验
│   ├── scheduler.rs        筛选、三种排序、导航、判卷
│   └── stats.rs            掌握率、薄弱项、热力图
├── src/                    TypeScript
│   ├── main.ts             启动流程
│   ├── core/store.ts       IndexedDB + localStorage 兜底
│   ├── core/markdown.ts    Markdown 渲染
│   └── ui/                 题卡、筛选、统计、设置、快捷键、主题
├── data/
│   ├── questions.json      476 题，扁平数组
│   └── categories.json     19 个分类
├── src-tauri/              桌面端打包配置
└── legacy/                 v1 归档，保留一个版本周期
```

**为什么这么分**：Rust 侧不碰任何 IO，只负责把 `UserState` 序列化成字符串，读写全交给 TypeScript。这样调度算法能被完整单元测试覆盖，也是 78 个 Rust 测试跑得起来的前提。

Markdown 渲染留在 TypeScript——它输出 HTML 字符串直接喂 `innerHTML`，本质是 UI 层的事，搬进 Rust 只是多一次跨边界拷贝。

页面**不引用任何 CDN 资源**（无 React / Tailwind / 图表库），全部原生 DOM + 手写 CSS。
