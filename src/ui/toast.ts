// src/ui/toast.ts
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * 右下角一次只显示一条。与 legacy/js/app.js:134 逐字等价：
 * 只切 hidden，不加 class（现有 .toast 样式没有 .is-on 这一态），2200ms 后收起。
 */
export function toast(msg: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { el.hidden = true; }, 2200);
}
