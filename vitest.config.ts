import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
    // 排除 agent worktree，否则同一份测试会被重复统计
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/worktrees/**', 'legacy/**'],
  },
});
