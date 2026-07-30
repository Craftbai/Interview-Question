# Task 19: 统计视图

## 完成内容

实现了 `src/ui/stats.ts` 中的 `renderStats(ctx: AppCtx): void` 函数，包含：

1. **KPI 区** — 四个指标卡片：已掌握率、已练过率、正确率、今日/连续打卡
2. **分类条形图** — 最薄弱的分类（weakest）和全部分类（byCategory），每个显示掌握率进度条
3. **热力图** — 最近半年每日练习量的五级着色
4. **简历高危提示** — 当有未掌握的 resume 题时显示提示

## 热力图分档阈值

**从 `legacy/js/stats.js:80` 确认的实际阈值：**

```
0 / 1-9 / 10-24 / 25-49 / 50+
```

对应 CSS 类 `lv0` ~ `lv4`。

**注意：** 计划中给出的 `0/1-5/6-15/16-30/30+` 是错误的。实际代码以 legacy 为准，代码注释中也注明了来源。

## 编译与测试

- **`npx tsc --noEmit`**: 仅有一个预先存在的错误（TS2307，WASM 模块未构建），无新增错误
- **`npm test`**: 17 个测试全部通过（markdown.test.ts 8 个 + store.test.ts 9 个）

## 手动浏览器检查（未完成）

Step 4 的手工验证无法执行（无浏览器自动化能力），待验证项：

- KPI 数字与实际作答对得上
- 热力图最后一格是今天且有颜色
- 分类条形图顺序与筛选面板一致
- 连续打卡天数正确
- 刷几道题后切到「统计」tab 能正常渲染

## 提交信息

```bash
git add src/ui/stats.ts
git commit -m "feat(ui): stats view with KPI, category bars and heatmap"
```

**Commit:** `cf579ad`
