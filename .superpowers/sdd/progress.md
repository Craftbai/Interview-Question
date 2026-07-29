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
| 21 | Service Worker 与 web 版部署 | in_progress | |
| 22 | Tauri Windows 打包 | pending | |
| 23 | 收尾与文档 | pending | |
