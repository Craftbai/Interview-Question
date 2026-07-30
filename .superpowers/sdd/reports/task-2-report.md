# Task 2 实现报告：题库迁移脚本

## 摘要

实现了从 27 个浏览器 JS 题库脚本到两个 JSON 文件的迁移脚本，共处理 476 道题、19 个分类。

## 实现步骤

### Step 1: 编写 `scripts/migrate.mjs`

- 使用 `node:vm` 在共享上下文中按序求值 27 个 `QBANK` 脚本（与 `index.html` 的 `<script>` 加载顺序一致）
- 建立 `QBANK.add` / `QBANK.setCategories` 沙箱，补齐 `QBANK.add` 会做的默认值（level、tags、followup、resume）
- 内置自检：题目总数、id 唯一性、分类注册、答案索引越界、判断题类型、参考答案存在性

### Step 2: 运行迁移

```
node scripts/migrate.mjs
```

输出：
```
OK: 476 题, 19 分类
分类顺序: c-lang, coding, cpp, ds-algo, control, os, rtos, linux-app, linux-drv, mcu-hw, hardware, bus, network, build, tools, debug, security, automotive, behavioral
```

### Step 3: 抽样验证

```
node scripts/verify-sample.mjs
```

输出确认 10 道含特殊字符的题目中，反引号、反斜杠、换行符均正确保留在 JSON 往返中。

### Step 4: 归档旧文件

- `data/*.js` → `legacy/data/`（27 个题库脚本 + meta.js）
- `js/*.js` → `legacy/js/`（6 个运行时脚本）

### Step 5: 提交

```bash
git add scripts data/questions.json data/categories.json legacy
git commit -m "feat: migrate 476 questions to flat JSON, archive legacy js"
```

## 测试输出

**迁移脚本输出：**
```
OK: 476 题, 19 分类
分类顺序: c-lang, coding, cpp, ds-algo, control, os, rtos, linux-app, linux-drv, mcu-hw, hardware, bus, network, build, tools, debug, security, automotive, behavioral
```

**抽样验证输出（节选）：**
```
抽样 10 道含特殊字符的题：
--- c-005 ---
题干含换行: true | 含反引号: true
--- c-008 ---
题干含换行: true | 含反引号: true
--- c-009 ---
题干含换行: false | 含反引号: true
```

所有特殊字符（反引号、反斜杠、换行符 `\n`）在 JSON 往返后保持原样，无失真。

## 注意事项

- 旧题库文件已归档到 `legacy/`，保留一个版本周期不删除
- `index.html` 中引用的 `data/*.js` 路径已失效，Task 15 重写入口时需要修复
- `data/categories.json` 采用 2-space 缩进（便于人工阅读），`data/questions.json` 采用 0-space 压缩（节省体积）

## 提交哈希

`a8cda3e` feat: migrate 476 questions to flat JSON, archive legacy js
