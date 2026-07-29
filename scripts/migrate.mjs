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
