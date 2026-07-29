# 嵌入式面试题库 v2 — SDD Progress Ledger

> 创建于 2026-07-29，基于 `docs/superpowers/plans/2026-07-29-embedded-quiz-v2-implementation.md`
> 基准 commit: `5c32be0`

## 任务清单

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 1 | 工具链与项目骨架 | done | |
| 2 | 题库迁移脚本 | done | |
| 3 | 数据模型（models.rs） | done | |
| 4 | 用户状态模型与旧存档兼容 | done | |
| 5 | Catalog 与题库指纹 | done | |
| 6 | Parser 与数据校验 | done | |
| 7 | Scheduler 筛选 | done | now_ms/today_key 双路径；native=UTC, wasm=本地时区（仅影响测试） |
| 8 | 三种排序模式（核心 bug 修复） | done | 全序化完成；修正了计划中 tie-break 测试的 urgency 前提 |
| 9 | 导航与卷持久化 | done | save_deck 已接入 build/advance/back/goto —— Task 12 的 QuizEngine 不要重复调用 |
| 10 | 判卷与作答记录 | done | fuzzy = max(1,bx) 保底不降级，锁 v1 语义 |
| 11 | Stats 统计 | done | 修复计划 bug：wasm day_key_offset 的 u32 下溢（原生测试覆盖不到） |
| 12 | WASM 桥接（QuizEngine） | done | wasm 384KB；wasm-pack 需 --no-opt（binaryen 下载被墙） |
| 13 | Store（IndexedDB + localStorage 兜底） | done | 9 个测试（计划写 10 是笔误）；wasm-pack 实测可用，390KB |
| 14 | Scope 序列化对齐 DOM | done | 控制器直接实现（subagent 遇 API 错误） |
| 15 | Markdown 渲染器平移 | done | 476 题新旧渲染输出逐字节一致（Node 全量差分验证） |
| 16 | 启动流程与 Vite 接入 | done | 修复了 subagent 引入的重复 </body>；vite build 通过 |
| 17 | 题卡渲染 | done | bool 选项 idx 对齐 Rust（1=对,0=错）；currentFilter/oral 临时兜底待 T18/T20 替换 |
| 18 | 筛选面板 | done | card.ts placeholder removed |
| 19 | 统计视图 | done | heatmap 阈值修正为 legacy 一致 |
| 20 | 设置面板、主题与快捷键 | done | wasm 类型已重新生成 |
| 21 | Service Worker 与 web 版部署 | done | 复制插件改用 npm run build 后调用 copy-static.mjs |
| 22 | Tauri Windows 打包 | done | exe 8.2MB 编译通过；控制器直接实现 |
| 23 | 收尾与文档 | done | README 更新；题量断言改为下限；加题流程正反向验证通过 |

## 全分支审查（Opus）后的修复

审查发现一个四道验证门全绿却会导致界面一开就崩的 bug，已修：

| 问题 | 修复 |
|---|---|
| `count()`/`stats()` 用 `json!` 宏，经 wasm-bindgen 产出 JS Map，`Object.keys` 为空，`payload.total` 恒 undefined | 改用 `#[derive(Serialize)]` struct（`CountPayload` / `StatsPayload`） |
| 无任何测试跨 wasm 边界；`.d.ts` 把返回值标成 `any`，tsc 也查不到 | 新增 `src/core/wasm-contract.test.ts`，加载真实编译产物断言字段名与容器类型 |
| stats 键名 `by_category`/`resume_risk` 与 TS 侧读的 `byCategory`/`resumeRisk` 不符 | Rust 侧加 serde rename |
| `Scope::Wrong` 只看今日错题本，跨天后「只看错题」直接空 | 恢复 v1 语义 `wrong > 0` |
| `resetState()` 不清 `embq.v1`，清空进度后重载会从旧存档迁移回来 | 一并清除 |
| 统计视图用了冻结 CSS 里不存在的类名（`kpi-value`/`bar-fill`/`stat-block`），热力格用 class 而 CSS 只认 `data-n` | markup 重写为 legacy 结构，逐个类名核对过 CSS |
| `weakest()` 丢了 v1 的 `total >= 5` 门槛与「同率题量大者靠前」 | 恢复，并补 3 个测试 |
| 快捷键表里列了 Esc 但没实现；统计页按空格会误触揭晓 | 补 Esc，答题键加面板/视图守卫 |
| `restore_deck()` 后 chips 不回填，点「开始练习」会用错条件重新组卷 | 启动时回填 |

审查提出但判定为可后续处理：wasm 版 `day_key_offset` 的 DST 问题（中国无夏令时，实际影响为零）。

## 最终状态

- Rust 79 测试通过，TypeScript 25 测试通过（含 6 个 wasm 契约测试）
- `tsc --noEmit` 干净，`npm run build` 通过，Tauri exe 编译通过（8.2MB）
- `css/style.css` 与基线 `5c32be0` 逐字节一致；`index.html` 无 DOM id 变更
- 476 题 / 19 分类
- 基线以来 35 个 commit
