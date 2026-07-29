// src/ui/keys.ts
import type { AppCtx } from '../main';
import { renderCard } from './card';

export function mountKeys(ctx: AppCtx): void {
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;

    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('filterPanel')!.hidden = false;
      (document.getElementById('searchInput') as HTMLInputElement).focus();
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      ctx.engine.toggle_fav(); ctx.persist(); renderCard(ctx); return;
    }
    if (e.key === 'ArrowLeft') {
      if (ctx.engine.back()) { ctx.persist(); renderCard(ctx); } return;
    }
    if (e.key === 'ArrowRight') {
      ctx.engine.advance(); ctx.persist(); renderCard(ctx); return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      // 空格：提交 / 揭晓 / 下一题 —— 语义取决于卡片当前阶段
      document.querySelector<HTMLElement>('[data-act="reveal"]')?.click();
      return;
    }
    if (/^[1-6]$/.test(e.key)) {
      const n = Number(e.key) - 1;
      // 已揭晓时 1/2/3 是自评，未揭晓时是选选项
      const graded = document.querySelectorAll<HTMLElement>('[data-grade]');
      if (graded.length && n < 3) { graded[n]!.click(); return; }
      document.querySelectorAll<HTMLElement>('.opt')[n]?.click();
    }
  });
}
