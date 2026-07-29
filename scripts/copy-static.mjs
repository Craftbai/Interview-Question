// Post-build: copy static assets into dist/
import { copyFileSync, cpSync, existsSync } from 'fs';

for (const dir of ['data', 'icons', 'css']) {
  if (existsSync(dir)) cpSync(dir, `dist/${dir}`, { recursive: true });
}
for (const f of ['sw.js', 'manifest.json']) {
  if (existsSync(f)) copyFileSync(f, `dist/${f}`);
}

console.log('Static assets copied to dist/');
