// src/ui/card.ts
import type { AppCtx, Filter } from '../main';
import { defaultFilter, switchView } from '../main';
import { esc, renderMD } from '../core/markdown';
import { toast } from './toast';

/* ---------------- 题目与判卷 ---------------- */

interface Question {
  id: string; cat: string; q: string; a: string;
  type: 'single' | 'multi' | 'bool' | 'qa';
  options: string[]; level: number; tags: string[];
  resume: boolean; followup: string[];
}

/** engine.judge() 的返回：expected / picked 都是引擎侧的选项下标 */
interface Verdict { correct: boolean; expected: number[]; picked: number[] }

/* ---------------- Step 1: 收拢卡片状态 ---------------- */

interface CardState {
  picked: number[];
  revealed: boolean;
  verdict: Verdict | null;
  /** 口述模式已点「讲完了」——放进 state 才能随切题一起归零 */
  oralDone: boolean;
  oralLeft: number;
  oralTimer: ReturnType<typeof setInterval> | null;
}

let state: CardState = blank();

function blank(): CardState {
  return { picked: [], revealed: false, verdict: null,
           oralDone: false, oralLeft: 0, oralTimer: null };
}

/** 切题时整体重置 —— 这是消除状态污染的关键 */
export function resetCardState(): void {
  if (state.oralTimer) clearInterval(state.oralTimer);
  state = blank();
}

/* ---------------- 存档读取 ---------------- */

interface SavedProgress { box?: number; fav?: boolean }

interface SavedState {
  q?: Record<string, SavedProgress | undefined>;
  settings?: { theme?: string; oral?: boolean; oralSeconds?: number };
  deck?: { filter?: Filter };
}

/**
 * engine 没有单题进度 / 设置的直接 getter，先从落盘状态里读。
 * Task 20 给 Rust 侧补 oral() / oral_seconds() 后，isOral / oralSeconds 可改成直接调用。
 */
function saved(ctx: AppCtx): SavedState {
  try {
    return JSON.parse(ctx.engine.state_json()) as SavedState;
  } catch {
    return {};
  }
}

function progressOf(st: SavedState, id: string): SavedProgress {
  return st.q?.[id] ?? {};
}

function isOral(st: SavedState): boolean {
  return st.settings?.oral === true;
}

function oralSeconds(st: SavedState): number {
  return st.settings?.oralSeconds ?? 60;
}

/**
 * Task 18 会用 ui/filter.ts 的 currentFilter 取代它。
 * 退回读「当前这卷是用什么筛选条件组出来的」，是没有面板状态时最诚实的答案。
 */
function currentFilter(ctx: AppCtx): Filter {
  return saved(ctx).deck?.filter ?? defaultFilter();
}

/* ---------------- 文案常量（沿用 legacy/js/app.js:10-12） ---------------- */

const LEVEL_NAME: Record<number, string> = { 1: '基础', 2: '进阶', 3: '深入' };
const BOX_NAME: Record<number, string> = { 0: '未练', 1: '生', 2: '熟', 3: '已掌握' };
const TYPE_NAME: Record<string, string> = {
  single: '单选', multi: '多选', bool: '判断', qa: '简答',
};

/** 分类 id → 名称，只取一次 */
let catNames: Map<string, string> | null = null;

function catName(ctx: AppCtx, id: string): string {
  if (!catNames) {
    const list = (ctx.engine.cats() as { id: string; name: string }[] | null) ?? [];
    catNames = new Map(list.map((c) => [c.id, c.name]));
  }
  return catNames.get(id) ?? id;
}

/* ---------------- Step 2: 空卷与完成态 ---------------- */

function renderEmpty(ctx: AppCtx, wrap: HTMLElement): void {
  document.getElementById('navbar')!.hidden = true;
  const total = ctx.engine.count(JSON.stringify(defaultFilter())) as { total: number };
  wrap.innerHTML =
    '<div class="empty"><h2>还没有组卷</h2>' +
    '<p>打开「筛选」挑分类和难度，或者直接开始智能复习——它会优先推没练过和练错的题。</p>' +
    `<button class="btn btn-primary" id="quickStart">智能复习全部 ${total.total} 题</button></div>`;
  document.getElementById('quickStart')?.addEventListener('click', () => {
    ctx.engine.build(JSON.stringify(defaultFilter()));
    resetCardState();
    ctx.persist();
    renderCard(ctx);
  });
}

function renderDone(ctx: AppCtx, wrap: HTMLElement): void {
  resetCardState();
  document.getElementById('navbar')!.hidden = true;
  document.getElementById('deckProgress')!.style.width = '100%';
  const s = ctx.engine.stats() as { overall: { mastered: number; total: number; today: number } };
  const o = s.overall;
  const pct = o.total ? Math.round((o.mastered / o.total) * 100) : 0;
  wrap.innerHTML =
    '<div class="card"><div class="done">' +
    `<div class="done-num">${ctx.engine.size()}</div>` +
    '<h2>这一卷刷完了</h2>' +
    `<p>全库掌握 ${o.mastered} / ${o.total} 题（${pct}%）　·　今日已练 ${o.today} 题</p>` +
    '<div class="card-actions" style="justify-content:center">' +
    '<button class="btn btn-primary" id="againAll">再刷一遍</button>' +
    '<button class="btn" id="againWrong">只刷这卷里的错题</button>' +
    '<button class="btn btn-ghost" id="toStats">看统计</button>' +
    '</div></div></div>';

  document.getElementById('againAll')?.addEventListener('click', () => {
    ctx.engine.build(JSON.stringify(currentFilter(ctx)));
    resetCardState(); ctx.persist(); renderCard(ctx);
  });
  document.getElementById('againWrong')?.addEventListener('click', () => {
    const f = currentFilter(ctx);
    if (!f.scopes.includes('wrong')) f.scopes.push('wrong');
    if (!ctx.engine.build(JSON.stringify(f))) {
      toast('这卷里没有错题，漂亮');
      ctx.engine.build(JSON.stringify(currentFilter(ctx)));
    }
    resetCardState(); ctx.persist(); renderCard(ctx);
  });
  document.getElementById('toStats')?.addEventListener('click', () => switchView('stats'));
}

/* ---------------- Step 3: 题面渲染 ---------------- */

/** 题头标签行（legacy/js/app.js:293-305） */
function renderHead(ctx: AppCtx, st: SavedState, q: Question): string {
  const box = progressOf(st, q.id).box ?? 0;
  const bits = [
    `<span class="tag tag-cat">${esc(catName(ctx, q.cat))}</span>`,
    `<span class="tag tag-lv${q.level}">${LEVEL_NAME[q.level] ?? ''}</span>`,
    `<span class="tag">${TYPE_NAME[q.type] ?? ''}</span>`,
  ];
  if (q.resume) bits.push('<span class="tag tag-resume">简历高危</span>');
  for (const t of q.tags.slice(0, 3)) bits.push(`<span class="tag">${esc(t)}</span>`);
  bits.push(`<span class="tag tag-box">${BOX_NAME[box] ?? ''} · ${esc(q.id)}</span>`);
  return `<div class="card-head">${bits.join('')}</div>`;
}

/**
 * 判断题的显示顺序与引擎下标不是一回事：
 * 页面按 v1 先列「正确」，而 scheduler.rs:256 约定 1 = 对、0 = 错。
 * 所以 data-idx 存引擎下标，显示位置单独排。
 */
const BOOL_OPTS: { label: string; idx: number }[] = [
  { label: '正确', idx: 1 },
  { label: '错误', idx: 0 },
];

/** 选项区（legacy/js/app.js:307-326）；简答题不出选项 */
function renderChoices(q: Question): string {
  if (q.type === 'qa') return '';
  const opts = q.type === 'bool'
    ? BOOL_OPTS
    : q.options.map((label, idx) => ({ label, idx }));

  const rows = opts.map((o, slot) => {
    let cls = 'opt';
    let mark = '';
    if (state.revealed) {
      const isRight = state.verdict?.expected.includes(o.idx) ?? false;
      const isPicked = state.picked.includes(o.idx);
      if (isRight) { cls += ' is-right'; mark = '正确答案'; }
      else if (isPicked) { cls += ' is-wrong'; mark = '你选的'; }
    } else if (state.picked.includes(o.idx)) {
      cls += ' is-picked';
    }
    return `<button class="${cls}" data-idx="${o.idx}"${state.revealed ? ' disabled' : ''}>` +
      `<span class="opt-key">${slot + 1}</span>` +
      `<span>${esc(o.label)}</span>` +
      (mark ? `<span class="opt-mark">${mark}</span>` : '') +
      '</button>';
  }).join('');

  return `<div class="options">${rows}</div>`;
}

/** 答案与解析（legacy/js/app.js:328-342） */
function renderAnswer(q: Question): string {
  let head: string;
  if (q.type === 'qa') {
    head = '<div class="reveal-head">参考答案</div>';
  } else {
    const ok = state.verdict?.correct ?? false;
    head = `<div class="reveal-head ${ok ? 'verdict-ok' : 'verdict-bad'}">` +
      (ok ? '✓ 答对了' : '✗ 答错了') +
      '　<span style="color:var(--text-faint);font-weight:400">解析</span></div>';
  }
  let fu = '';
  if (q.followup.length) {
    fu = '<div class="followup"><div class="followup-title">面试官可能追问</div><ul>' +
      q.followup.map((t) => `<li>${esc(t)}</li>`).join('') + '</ul></div>';
  }
  return `<div class="reveal">${head}<div class="ans">${renderMD(q.a)}</div>${fu}</div>`;
}

/** 三个自评按钮（legacy/js/app.js:344-350） */
function gradeRow(): string {
  return '<div class="grade-row">' +
    '<button class="grade grade-know" data-grade="know"><b>会了</b><small>1 · 讲得完整</small></button>' +
    '<button class="grade grade-fuzzy" data-grade="fuzzy"><b>模糊</b><small>2 · 大概知道</small></button>' +
    '<button class="grade grade-no" data-grade="no"><b>不会</b><small>3 · 说不上来</small></button>' +
    '</div>';
}

/**
 * 动作行。`data-act="reveal"` 标的始终是「空格该按的那颗」——
 * 未揭晓时是提交 / 揭晓，已揭晓时是下一题，Task 20 的空格键据此选中。
 */
function renderActions(ctx: AppCtx, q: Question): string {
  if (!state.revealed) {
    if (q.type === 'qa') {
      return '<div class="card-actions">' +
        '<button class="btn btn-primary" data-act="reveal">显示参考答案　<kbd>空格</kbd></button></div>';
    }
    if (q.type === 'multi') {
      return '<div class="card-actions">' +
        '<button class="btn btn-primary" data-act="reveal">提交　<kbd>空格</kbd></button>' +
        '<span style="align-self:center;font-size:13px;color:var(--text-faint)">多选题，选完再提交</span></div>';
    }
    // 单选 / 判断：点选项即提交，和 v1 一样不额外出按钮
    return '';
  }
  // 简答自评；客观题已按判卷结果自动记分，只需推进
  if (q.type === 'qa') return gradeRow();
  const last = ctx.engine.position() >= ctx.engine.size() - 1;
  return '<div class="card-actions">' +
    `<button class="btn btn-primary" data-act="reveal">${last ? '完成这一卷' : '下一题'}　<kbd>空格</kbd></button></div>`;
}

export function renderCard(ctx: AppCtx): void {
  const wrap = document.getElementById('cardWrap')!;
  if (!ctx.engine.size()) return renderEmpty(ctx, wrap);
  if (ctx.engine.is_finished()) return renderDone(ctx, wrap);

  const q = ctx.engine.current() as Question | null;
  if (!q) return renderDone(ctx, wrap);

  const pos = ctx.engine.position();
  const size = ctx.engine.size();
  document.getElementById('navbar')!.hidden = false;
  document.getElementById('deckPos')!.textContent = `${pos + 1} / ${size}`;
  document.getElementById('deckProgress')!.style.width = `${(pos / size) * 100}%`;

  const st = saved(ctx);
  const fav = progressOf(st, q.id).fav === true;
  const favBtn = document.getElementById('btnFav')!;
  favBtn.textContent = fav ? '★' : '☆';
  favBtn.classList.toggle('is-on', fav);

  const oral = isOral(st) && !state.oralDone && !state.revealed;

  let body = `<div class="qtext">${renderMD(q.q)}</div>`;

  if (oral) {
    body += '<div class="oral">' +
      '<div class="oral-clock" id="oralClock">--:--</div>' +
      '<div class="oral-note">口述模式：先出声把答案完整讲一遍，讲完再揭晓。面试考的是能不能讲清楚。</div>' +
      '<button class="btn btn-primary" data-act="oralDone">讲完了</button>' +
      '</div>';
  } else {
    body += renderChoices(q);
    if (state.revealed) body += renderAnswer(q);
    body += renderActions(ctx, q);
  }

  wrap.innerHTML =
    `<div class="card">${renderHead(ctx, st, q)}<div class="card-body">${body}</div></div>`;

  if (oral) startOral(st);
}

/* ---------------- Step 5: 口述倒计时（legacy/js/app.js:273-291） ---------------- */

function stopOral(): void {
  if (state.oralTimer) clearInterval(state.oralTimer);
  state.oralTimer = null;
}

function startOral(st: SavedState): void {
  state.oralLeft = oralSeconds(st);
  const tick = (): void => {
    const el = document.getElementById('oralClock');
    if (!el) { stopOral(); return; }
    const left = state.oralLeft;
    const m = Math.floor(Math.abs(left) / 60);
    const s = Math.abs(left) % 60;
    el.textContent = `${left < 0 ? '-' : ''}${m}:${String(s).padStart(2, '0')}`;
    el.classList.toggle('is-up', left <= 0);
    state.oralLeft--;
  };
  tick();
  stopOral();
  state.oralTimer = setInterval(tick, 1000);
}

/* ---------------- Step 4: 事件委托 ---------------- */

/** 客观题提交：判卷并按对错自动记分（legacy/js/app.js:483-491） */
function submitObjective(ctx: AppCtx): void {
  if (!state.picked.length) { toast('先选一个再提交'); return; }
  state.verdict = ctx.engine.judge(new Uint32Array(state.picked)) as Verdict | null;
  state.revealed = true;
  ctx.engine.record(state.verdict?.correct ? 'know' : 'no');
  ctx.persist();
  renderCard(ctx);
}

function goNext(ctx: AppCtx): void {
  ctx.engine.advance();
  resetCardState();
  ctx.persist();
  ctx.rerender();
}

export function mountCard(ctx: AppCtx): void {
  const wrap = document.getElementById('cardWrap')!;

  wrap.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

    const opt = t.closest<HTMLElement>('.opt');
    if (opt && !state.revealed) {
      const idx = Number(opt.dataset.idx);
      const q = ctx.engine.current() as Question | null;
      if (!q) return;
      if (q.type === 'multi') {
        const at = state.picked.indexOf(idx);
        if (at >= 0) state.picked.splice(at, 1); else state.picked.push(idx);
        renderCard(ctx);
      } else {
        // 单选 / 判断点一下就算提交
        state.picked = [idx];
        submitObjective(ctx);
      }
      return;
    }

    if (t.closest('[data-act="oralDone"]')) {
      state.oralDone = true;
      stopOral();
      renderCard(ctx);
      return;
    }

    if (t.closest('[data-act="reveal"]')) {
      const q = ctx.engine.current() as Question | null;
      if (!q) return;
      if (state.revealed) { goNext(ctx); return; }
      if (q.type === 'qa') {
        // 简答题无客观对错，直接揭晓，由用户自评
        state.revealed = true;
        renderCard(ctx);
      } else {
        submitObjective(ctx);
      }
      return;
    }

    const gradeBtn = t.closest<HTMLElement>('[data-grade]');
    if (gradeBtn) {
      ctx.engine.record(gradeBtn.dataset.grade!);
      ctx.engine.advance();
      resetCardState();
      ctx.persist();
      ctx.rerender();
    }
  });

  document.getElementById('btnPrev')!.addEventListener('click', () => {
    if (ctx.engine.back()) { resetCardState(); ctx.persist(); renderCard(ctx); }
    else toast('已经是第一题');
  });
  document.getElementById('btnNext')!.addEventListener('click', () => {
    ctx.engine.advance(); resetCardState(); ctx.persist(); renderCard(ctx);
  });
  document.getElementById('btnFav')!.addEventListener('click', () => {
    ctx.engine.toggle_fav(); ctx.persist(); renderCard(ctx);
  });
}
