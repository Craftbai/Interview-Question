// 构建后把静态资源拷进 dist/
//
// 这里刻意不用 fs.cpSync：在本机 Node v24 + Windows 上，对含 1.2MB
// questions.json 的目录调用 cpSync 会让进程直接崩掉（退出码 127 /
// 0xC0000409 STATUS_STACK_BUFFER_OVERRUN），stdout 与 stderr 都是空的，
// 连前面的 console.log 都来不及打印。readFileSync / mkdirSync /
// copyFileSync 均正常，所以改成自己递归遍历、逐文件复制。
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync,
  statSync, writeFileSync,
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

// Vite 把 <link rel="manifest"> 当成资源，哈希进了 assets/。
// 后果是 manifest 里的相对图标路径（icons/icon-192.png）基准变成 assets/，
// 全部 404，安卓 Chrome 就不弹「添加到主屏幕」。
// 这里把引用改回根目录那份未哈希的 manifest.json，并删掉哈希副本。
const indexPath = join('dist', 'index.html');
const html = readFileSync(indexPath, 'utf8');
const patched = html.replace(
  /<link rel="manifest" href="[^"]*">/,
  '<link rel="manifest" href="manifest.json">',
);
// assets/ 下那份哈希副本改完引用后就没人指向了，留着无害（721 字节），
// 不删是因为本机 rmSync 会报成功但实际不生效（同 cpSync 那类环境问题）。
if (patched !== html) {
  writeFileSync(indexPath, patched);
  console.log('Rewired manifest link to unhashed dist/manifest.json');
}

console.log(`Static assets copied to dist/ (${count} entries)`);
