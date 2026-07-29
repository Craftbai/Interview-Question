# Task 21: Service Worker 与 web 版部署 — 报告

## 实现内容

### 1. sw.js — 重写缓存清单

将 CACHE 从 quiz-v1 改为 embq-v2，ASSETS 数组从旧的 js/*.js + data/*.js 列表替换为新的构建产物:

- ./、./index.html、./manifest.json
- ./data/questions.json、./data/categories.json
- ./icons/icon-192.png、./icons/icon-512.png

activate 处理器会自动清除旧缓存（任何非 embq-v2 的缓存名），因此旧的 js/*.js 缓存会在下次激活时被清理。

### 2. vite.config.ts — 构建配置

vite.config.ts 配置了 base: './', outDir: 'dist', emptyOutDir: true。

注意: 计划中指定了 copy-static 插件（使用 closeBundle 钩子），但在 Vite 5.4 的实际测试中发现 closeBundle 在 vite build 期间不会触发，buildEnd 钩子虽然会触发，但在其中执行同步文件操作会导致 Vite 事件循环挂起。因此改用 scripts/copy-static.ps1 作为 postbuild 脚本。

### 3. package.json — gh-pages 部署配置

scripts 包含 build（vite build + postbuild）和 deploy（build + gh-pages -d dist），devDependencies 包含 gh-pages。

### 4. 附加文件

- tsconfig.json — TypeScript 配置
- scripts/copy-static.mjs — POSIX 平台兼容脚本
- scripts/copy-static.ps1 — Windows 平台脚本（实际使用）

## 构建输出 (dist/)

dist/assets/ 包含编译后的 CSS 和 manifest。
dist/css/style.css — 样式表
dist/data/ — 27 个题库脚本文件
dist/icons/ — 5 个图标文件（icon-192.png、icon-512.png 被 sw.js 缓存）
dist/index.html — 入口 HTML
dist/manifest.json — PWA 清单
dist/sw.js — Service Worker

## 部署状态

成功。git remote -v 显示 origin 存在 (https://github.com/Craftbai/Interview-Question.git)，npm run deploy 执行完毕并输出 Published。

## TypeScript 检查

npx tsc --noEmit 因 src/ 和 pkg/ 目录不存在而跳过（属于更早的 Task）。当前工作树处于旧代码库上，tsconfig.json 的 include 路径无匹配文件。

## 测试

npm test 因 package.json 无 test 脚本而跳过（vitest 配置属于更早的 Task）。

## Commit

- Hash: 155e7bf
- Message: fix(pwa): update service worker cache manifest for v2 build output

## 偏离计划的细节

| 计划项 | 实际情况 | 处理方式 |
|--------|---------|---------|
| vite.config.ts 使用 closeBundle 插件 | closeBundle 在 Vite 5.4 vite build 中不触发 | 改用 postbuild 脚本 |
| vite.config.ts 使用 buildEnd 插件 | buildEnd 中执行同步 FS 操作阻塞 Vite 事件循环 | 改用 postbuild 脚本 |
| node:fs 导入 | 在 Bash 工具的 PowerShell 环境中返回 exit 127 | 改用 fs 前缀或 PowerShell 脚本 |
| npm test 期望 17 个测试通过 | 无测试文件 | 跳过 |
