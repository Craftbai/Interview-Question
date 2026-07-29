// src/ui/filter.ts
import type { AppCtx, Filter } from '../main';
import { defaultFilter, newSeed } from '../main';
import { resetCardState } from './card';
import { toast } from './toast';
import { esc } from '../core/markdown';

interface CatMeta { id: string; name: string; desc: string }

function onChips(container: string, attr: string): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(`#${container} .chip.is-on`),
  ).map((el) => el.dataset[attr]!).filter(Boolean);
}

/** 读当前面板状态。mode 为 random 时补一个 seed，保证卷可复现。 */
export function currentFilter(ctx: AppCtx): Filter {
  const mode = (onChips('modeChips', 'mode')[0] ?? 'smart') as Filter['mode'];
  return {
    cats: onChips('catChips', 'cat'),
    levels: onChips('levelChips', 'level').map(Number),
    types: onChips('typeChips', 'type'),
    scopes: onChips('scopeChips', 'scope'),
    mode,
    keyword: (document.getElementById('searchInput') as HTMLInputElement).value.trim(),
    seed: mode === 'random' ? newSeed() : null,
  };
}

/**
 * 与 legacy/js/app.js:157 一致：带题量角标 `<span class="n">`，
 * 且题量为 0 的分类不渲染 chip（渲染了点了也出不来题）。
 */
export function renderCatChips(ctx: AppCtx): void {
  const box = document.getElementById('catChips')!;
  const cats = ctx.engine.cats() as CatMeta[];
  box.innerHTML = cats
    .map((c) => {
      const n = (ctx.engine.count(JSON.stringify({ ...defaultFilter(), cats: [c.id] })) as
        { total: number }).total;
      if (!n) return '';
      return `<button class="chip is-on" data-cat="${esc(c.id)}" title="${esc(c.desc)}">` +
        `${esc(c.name)}<span class="n">${n}</span></button>`;
    })
    .join('');
}

export function refreshCount(ctx: AppCtx): void {
  const el = document.getElementById('deckCount')!;
  const res = ctx.engine.count(JSON.stringify(currentFilter(ctx))) as
    { total: number; boxes: [number, number, number, number] };
  const [fresh, weak, ok, done] = res.boxes;
  el.textContent = res.total
    ? `命中 ${res.total} 题 未练 ${fresh} / 生 ${weak} / 熟 ${ok} / 已掌握 ${done}`
    : '没有命中任何题目';
}

const AUTO_PRESET = ['automotive', 'bus', 'security', 'mcu-hw', 'hardware', 'build', 'debug', 'behavioral'];

/** 把 Filter 写回 chips（重置按钮用） */
export function applyFilterToDom(f: Filter): void {
  document.querySelectorAll<HTMLElement>('#catChips .chip').forEach((c) => {
    c.classList.toggle('is-on', f.cats.length === 0 || f.cats.includes(c.dataset.cat!));
  });
  document.querySelectorAll<HTMLElement>('#levelChips .chip').forEach((c) => {
    c.classList.toggle('is-on', f.levels.includes(Number(c.dataset.level)));
  });
  document.querySelectorAll<HTMLElement>('#typeChips .chip').forEach((c) => {
    c.classList.toggle('is-on', f.types.includes(c.dataset.type!));
  });
  document.querySelectorAll<HTMLElement>('#scopeChips .chip').forEach((c) => {
    c.classList.toggle('is-on', f.scopes.includes(c.dataset.scope!));
  });
  document.querySelectorAll<HTMLElement>('#modeChips .chip').forEach((c) => {
    c.classList.toggle('is-on', c.dataset.mode === f.mode);
  });
  (document.getElementById('searchInput') as HTMLInputElement).value = f.keyword;
}

export function mountFilter(ctx: AppCtx): void {
  renderCatChips(ctx);

  document.getElementById('btnFilter')!.addEventListener('click', () => {
    const p = document.getElementById('filterPanel')!;
    p.hidden = !p.hidden;
    document.getElementById('settingsPanel')!.hidden = true;
    if (!p.hidden) refreshCount(ctx);
  });

  // 所有 chips 用一次委托：切换 is-on 后刷新计数
  document.getElementById('filterPanel')!.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

    const action = t.closest<HTMLElement>('[data-cat-action]')?.dataset.catAction;
    if (action) {
      const chips = document.querySelectorAll<HTMLElement>('#catChips .chip');
      chips.forEach((c) => {
        const on = action === 'all' ? true
          : action === 'none' ? false
          : AUTO_PRESET.includes(c.dataset.cat!);
        c.classList.toggle('is-on', on);
      });
      refreshCount(ctx);
      return;
    }

    const chip = t.closest<HTMLElement>('.chip');
    if (!chip) return;
    // 出题顺序是单选，其余维度是多选
    if (chip.parentElement?.id === 'modeChips') {
      document.querySelectorAll('#modeChips .chip').forEach((c) => c.classList.remove('is-on'));
      chip.classList.add('is-on');
    } else {
      chip.classList.toggle('is-on');
    }
    refreshCount(ctx);
  });

  document.getElementById('searchInput')!.addEventListener('input', () => refreshCount(ctx));

  document.getElementById('btnResetFilter')!.addEventListener('click', () => {
    applyFilterToDom(defaultFilter());
    refreshCount(ctx);
  });

  document.getElementById('btnApplyFilter')!.addEventListener('click', () => {
    const n = ctx.engine.build(JSON.stringify(currentFilter(ctx)));
    if (!n) { toast('没有命中任何题目，放宽条件试试'); return; }
    resetCardState();
    ctx.persist();
    document.getElementById('filterPanel')!.hidden = true;
    toast(`组卷 ${n} 题`);
    ctx.rerender();
  });
}
