// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  // './' 让产物同时适配 GitHub Pages 子路径和 Tauri 的 file:// 环境
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
