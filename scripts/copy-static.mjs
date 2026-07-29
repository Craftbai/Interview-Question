// 构建后把静态资源拷进 dist/
//
// 这里刻意不用 fs.cpSync：在本机 Node v24 + Windows 上，对含 1.2MB
// questions.json 的目录调用 cpSync 会让进程直接崩掉（退出码 127 /
// 0xC0000409 STATUS_STACK_BUFFER_OVERRUN），stdout 与 stderr 都是空的，
// 连前面的 console.log 都来不及打印。readFileSync / mkdirSync /
// copyFileSync 均正常，所以改成自己递归遍历、逐文件复制。
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    if (statSync(from).isDirectory()) copyDir(from, to);
    else copyFileSync(from, to);
  }
}

let count = 0;
for (const dir of ['data', 'icons', 'css']) {
  if (!existsSync(dir)) continue;
  copyDir(dir, join('dist', dir));
  count += readdirSync(dir).length;
}

for (const f of ['sw.js', 'manifest.json']) {
  if (existsSync(f)) {
    copyFileSync(f, join('dist', f));
    count += 1;
  }
}

// GitHub Pages 默认会跑 Jekyll，它会忽略下划线开头的目录、并可能干预静态资源的
// 服务方式。这是纯静态产物，不需要 Jekyll 参与。
writeFileSync(join('dist', '.nojekyll'), '');

console.log(`Static assets copied to dist/ (${count} entries)`);
