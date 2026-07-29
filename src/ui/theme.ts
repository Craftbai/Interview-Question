// src/ui/theme.ts
import type { AppCtx } from '../main';
import { toast } from './toast';

const THEME_ORDER = ['auto', 'light', 'dark'] as const;
const THEME_LABEL: Record<string, string> = { auto: '跟随系统', light: '浅色', dark: '深色' };

/**
 * 把偏好原样写进 data-theme —— 与 legacy/js/app.js:144 一致。
 * 注意不要在这里把 auto 解析成 light/dark：现有 CSS 自己用
 * `[data-theme="auto"]` + prefers-color-scheme 媒体查询处理跟随系统，
 * 提前解析会让 data-theme 永远拿不到 auto，媒体查询那段样式就成了死代码。
 */
export function applyTheme(ctx: AppCtx): void {
  document.documentElement.setAttribute('data-theme', ctx.engine.theme() || 'auto');
}

export function mountTheme(ctx: AppCtx): void {
  document.getElementById('btnTheme')!.addEventListener('click', () => {
    const cur = ctx.engine.theme() || 'auto';
    const next = THEME_ORDER[(THEME_ORDER.indexOf(cur as typeof THEME_ORDER[number]) + 1) % 3]!;
    ctx.engine.set_theme(next);
    ctx.persist();
    applyTheme(ctx);
    toast(`主题：${THEME_LABEL[next]}`);
  });
}
