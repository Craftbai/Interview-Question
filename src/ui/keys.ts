// src/ui/keys.ts
import type { AppCtx } from '../main';
import { renderCard } from './card';

/** 面板开着时，快捷键归面板；只有练习视图在前台才响应答题类按键 */
function panelOpen(): boolean {
  return !document.getElementById('filterPanel')!.hidden ||
    !document.getElementById('settingsPanel')!.hidden;
}

function onPracticeView(): boolean {
  return document.getElementById('view-practice')!.classList.contains('is-active');
}

export function mountKeys(ctx: AppCtx): void {
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
      // 输入框里只保留 Esc：让搜索框能退出去
      if (e.key === 'Escape') t.blur();
      return;
    }

    // Esc 关面板（index.html:130-137 的快捷键表里列了它）
    if (e.key === 'Escape') {
      document.getElementById('filterPanel')!.hidden = true;
      document.getElementById('settingsPanel')!.hidden = true;
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('filterPanel')!.hidden = false;
      (document.getElementById('searchInput') as HTMLInputElement).focus();
      return;
    }

    // 以下都是答题相关：面板开着或不在练习视图时不该触发
    if (panelOpen() || !onPracticeView()) return;
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
