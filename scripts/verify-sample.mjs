// scripts/verify-sample.mjs
import { readFileSync } from 'node:fs';
const qs = JSON.parse(readFileSync('data/questions.json', 'utf8'));
// 挑最容易出问题的：含反引号、反斜杠、换行的题
const risky = qs.filter((q) => /[`\\]|\n/.test(q.q + q.a)).slice(0, 10);
console.log(`抽样 ${risky.length} 道含特殊字符的题：`);
for (const q of risky) {
  console.log(`--- ${q.id} ---`);
  console.log('题干含换行:', q.q.includes('\n'), '| 含反引号:', q.q.includes('`'));
  console.log(q.a.slice(0, 120).replace(/\n/g, '\\n'));
}
