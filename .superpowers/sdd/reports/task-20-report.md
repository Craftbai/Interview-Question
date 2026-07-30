# Task 20 实现报告：设置面板、主题与快捷键

## 实现内容

### Rust 侧新增（src-rust/lib.rs）

六个设置访问器 + 一个题库暴露方法：

| 签名 | 用途 |
|------|------|
| `theme() -> String` | 读取当前主题偏好 |
| `set_theme(&mut self, v: &str)` | 设置主题，标记 dirty |
| `oral() -> bool` | 读取口述模式开关 |
| `set_oral(&mut self, v: bool)` | 设置口述模式，标记 dirty |
| `oral_seconds() -> u32` | 读取倒计时秒数 |
| `set_oral_seconds(&mut self, v: u32)` | 设置倒计时，clamp 到 [5, 600] |
| `questions_json() -> String` | 返回全部题目 JSON 数组（供 wrongTodayMarkdown 查询） |

新增 2 个 Rust 测试：
- `settings_round_trip_through_engine` — 读写主题/口述/秒数，确认 state_json 落盘正确
- `oral_seconds_is_clamped_to_sane_range` — 验证 0→5, 9999→600 的 clamp 行为

### TypeScript 侧（三文件）

**src/ui/theme.ts** — 主题循环 auto → light → dark，`data-theme` 属性原样写入，toast 提示中文标签。

**src/ui/keys.ts** — 键盘快捷键：
- `1-6` 选择选项 / 自评
- `Space` 提交/揭晓/下一题
- `←/→` 前后题
- `F` 收藏
- `/` 搜索

输入框聚焦时不拦截。

**src/ui/settings.ts** — 设置面板完整实现：
- 口述模式开关 + 倒计时秒数循环 [30, 60, 90, 120, 180]
- 导出进度（下载 JSON blob）
- 导入进度（file input → load_state_json → restore_deck）
- 导出今日错题 Markdown（移植自 legacy/js/stats.js:95，含题干、选项标注、答案、追问）
- 清空全部进度（confirm 二次确认 → resetState → reload）
- 题库自检显示

## 测试结果

| 指标 | 结果 |
|------|------|
| `cargo test --lib` | 78 passed (0 failed) |
| `npm test` | 17 passed (0 failed) |
| `npx tsc --noEmit` | 无错误 |
| `npm run wasm` | 构建成功 |

## 手动浏览器检查（未执行）

按任务要求，以下检查需在浏览器中手工验证：
- 主题按钮循环 auto → light → dark，刷新后保持
- 口述模式开关后题卡先只显示题干与倒计时；倒计时秒数按 30/60/90/120/180 循环
- 导出进度得到 JSON 文件，清空后再导入能恢复
- 题库自检显示「通过」
- 「清空全部进度」有二次确认，确认后进度归零

## 提交信息

```bash
git add src/ui/settings.ts src/ui/theme.ts src/ui/keys.ts src-rust/lib.rs
git commit -m "feat(ui): settings panel, theme cycling and keyboard shortcuts"
```
