// src/main.ts
import init, { QuizEngine } from '../pkg/embq_core';
import { installFlushHooks, loadState, scheduleSave } from './core/store';
import { mountCard, renderCard } from './ui/card';
import { applyFilterToDom, mountFilter, refreshCount } from './ui/filter';
import { renderStats } from './ui/stats';
import { mountSettings, renderHealth } from './ui/settings';
import { mountKeys } from './ui/keys';
import { applyTheme, mountTheme } from './ui/theme';
import { toast } from './ui/toast';

export interface Filter {
  cats: string[];
  levels: number[];
  types: string[];
  scopes: string[];
  mode: 'smart' | 'ordered' | 'random';
  keyword: string;
  seed: number | null;
}

export interface AppCtx {
  engine: QuizEngine;
  /** 取出状态交给 store 落盘（debounce 300ms） */
  persist(): void;
  /** 重绘当前视图 */
  rerender(): void;
}

/** 默认：智能复习全库 */
export function defaultFilter(): Filter {
  return { cats: [], levels: [1, 2, 3], types: ['single', 'multi', 'bool', 'qa'],
           scopes: [], mode: 'smart', keyword: '', seed: null };
}

export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

async function boot(): Promise<void> {
  await init();

  const [questions, categories, saved] = await Promise.all([
    fetch('data/questions.json').then((r) => r.text()),
    fetch('data/categories.json').then((r) => r.text()),
    loadState(),
  ]);

  let engine: QuizEngine;
  try {
    engine = new QuizEngine(questions, categories, saved ?? undefined);
  } catch (e) {
    // 题库坏了没法降级，直接把错误摆给用户，别白屏
    document.getElementById('cardWrap')!.innerHTML =
      `<div class="empty"><h2>题库加载失败</h2><p>${String(e)}</p></div>`;
    return;
  }

  // 有未刷完的卷就接着刷，否则智能复习全库。
  // 恢复成功时把卷的筛选条件回填到 chips，否则面板显示的是默认值，
  // 用户一点「开始练习」就会用错的条件重新组卷、丢掉当前进度。
  const restored = engine.restore_deck();
  if (!restored) {
    engine.build(JSON.stringify(defaultFilter()));
  }
  const deckFilter = restored ? deckFilterOf(engine) : null;

  const ctx: AppCtx = {
    engine,
    persist() {
      scheduleSave(engine.state_json());
      engine.mark_clean();
    },
    rerender() {
      renderCard(ctx);
      renderStats(ctx);
    },
  };

  installFlushHooks(() => engine.state_json());
  mount(ctx, deckFilter);
}

/** 从落盘的 deck 里读回组卷条件；结构不符就返回 null，让面板保持默认值 */
function deckFilterOf(engine: QuizEngine): Filter | null {
  try {
    const s = JSON.parse(engine.state_json()) as { deck?: { filter?: Filter } };
    return s.deck?.filter ?? null;
  } catch {
    return null;
  }
}

function mount(ctx: AppCtx, deckFilter: Filter | null): void {
  applyTheme(ctx);
  mountTheme(ctx);
  mountCard(ctx);
  mountFilter(ctx);
  mountSettings(ctx);
  mountKeys(ctx);
  renderHealth(ctx);
  mountViewTabs();
  // chips 要在 mountFilter 渲染完分类之后再回填
  if (deckFilter) applyFilterToDom(deckFilter);
  refreshCount(ctx);
  ctx.rerender();
}

/** 练习 / 统计 两个 tab，复用 index.html:19-22 的 .tab 与 .view.is-active */
function mountViewTabs(): void {
  const tabs = document.getElementById('viewTabs');
  tabs?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.tab');
    if (!btn) return;
    switchView(btn.dataset.view === 'stats' ? 'stats' : 'practice');
  });
}

export function switchView(view: 'practice' | 'stats'): void {
  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.view === view);
  });
  document.getElementById('view-practice')!.classList.toggle('is-active', view === 'practice');
  document.getElementById('view-stats')!.classList.toggle('is-active', view === 'stats');
}

boot().catch((e) => {
  console.error(e);
  toast('启动失败，请刷新重试');
});
