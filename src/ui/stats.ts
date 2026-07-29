// src/ui/stats.ts
// 结构与 class 名逐字照 legacy/js/app.js:519-590 —— css/style.css 是冻结的，
// markup 必须贴着它写：条形是 .bar-row/.bar-name/.bar-track/.bar-seg(.seg-1~3)/.bar-val，
// 热力格用 data-n 属性（不是 class）表示深浅，区块外壳是 .card-block。
import type { AppCtx } from '../main';
import { esc } from '../core/markdown';

interface CategoryStat {
  id: string;
  name: string;
  total: number;
  mastered: number;
  seen: number;
  accuracy: number;
  dist: [number, number, number, number];
}

interface StatsPayload {
  overall: {
    total: number; seen: number; mastered: number; accuracy: number;
    today: number; streak: number; boxes: [number, number, number, number];
    right: number; wrong: number;
  };
  byCategory: CategoryStat[];
  weakest: CategoryStat[];
  heatmap: { date: string; count: number; level: number }[];
  resumeRisk: { total: number; mastered: number; weak_ids: string[] };
}

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 100) : 0;
}

function kpi(val: string, label: string): string {
  return `<div class="kpi"><div class="kpi-val">${val}</div>` +
    `<div class="kpi-label">${esc(label)}</div></div>`;
}

function kpis(o: StatsPayload['overall']): string {
  const masteredPct = pct(o.mastered, o.total);
  const accPct = Math.round(o.accuracy * 100);
  return '<div class="kpis">' +
    kpi(`${masteredPct}<small>%</small>`, `总掌握率　${o.mastered}/${o.total}`) +
    kpi(`${accPct}<small>%</small>`, `客观题正确率　${o.right}对/${o.wrong}错`) +
    kpi(String(o.today), '今日已练（题）') +
    kpi(String(o.streak), '连续打卡（天）') +
    '</div>';
}

/** 一行堆叠条：已掌握 → 熟 → 生，未练过留白 */
function barRow(name: string, dist: [number, number, number, number], total: number, val: string): string {
  const seg = (n: number, cls: string): string =>
    n ? `<div class="bar-seg ${cls}" style="width:${(n / total) * 100}%"></div>` : '';
  return '<div class="bar-row">' +
    `<div class="bar-name" title="${esc(name)}">${esc(name)}</div>` +
    '<div class="bar-track">' +
      seg(dist[3], 'seg-3') + seg(dist[2], 'seg-2') + seg(dist[1], 'seg-1') +
    '</div>' +
    `<div class="bar-val">${val}</div>` +
    '</div>';
}

function categoryBars(list: CategoryStat[]): string {
  return list
    .map((c) => barRow(c.name, c.dist, c.total, `${pct(c.mastered, c.total)}% / ${c.total}`))
    .join('');
}

function weakList(list: CategoryStat[]): string {
  if (!list.length) return '<p class="sub">先练一些题再看。</p>';
  return list
    .map((c, i) =>
      '<div class="weak-item">' +
      `<span class="weak-rank">${i + 1}</span>` +
      `<span class="weak-name">${esc(c.name)}</span>` +
      `<span class="weak-meta">掌握 ${pct(c.mastered, c.total)}%　共 ${c.total} 题</span>` +
      '</div>')
    .join('');
}

function heat(cells: StatsPayload['heatmap']): string {
  return cells
    .map((d) =>
      `<div class="heat-cell" data-n="${d.level}" title="${d.date}：${d.count} 题"></div>`)
    .join('');
}

const LEGEND =
  '<div class="legend">' +
  '<span><i style="background:var(--ok)"></i>已掌握（第 3 盒）</span>' +
  '<span><i style="background:var(--accent)"></i>熟（第 2 盒）</span>' +
  '<span><i style="background:var(--warn)"></i>生（第 1 盒）</span>' +
  '<span><i style="background:var(--bg-sunk)"></i>未练过</span>' +
  '</div>';

export function renderStats(ctx: AppCtx): void {
  const wrap = document.getElementById('statsWrap');
  if (!wrap) return;
  const s = ctx.engine.stats() as StatsPayload;
  const risk = s.resumeRisk;
  const riskPct = pct(risk.mastered, risk.total);

  wrap.innerHTML =
    kpis(s.overall) +

    '<div class="card-block">' +
    '<h3>简历高危题</h3>' +
    '<p class="sub">这些题是因为你简历上写了才会被追问的，答不上来最伤。</p>' +
    '<div class="bar-row"><div class="bar-name">掌握进度</div>' +
    `<div class="bar-track"><div class="bar-seg seg-3" style="width:${riskPct}%"></div></div>` +
    `<div class="bar-val">${risk.mastered}/${risk.total}</div></div>` +
    '</div>' +

    '<div class="card-block"><h3>分类掌握度</h3>' +
    '<p class="sub">条形从左到右依次是已掌握、熟、生；灰色部分是还没练过的。</p>' +
    `<div class="bars">${categoryBars(s.byCategory)}</div>` +
    LEGEND +
    '</div>' +

    '<div class="card-block"><h3>最该补的 5 个方向</h3>' +
    '<p class="sub">按掌握率升序，题量少于 5 题的分类不参与排名。</p>' +
    `<div class="weak-list">${weakList(s.weakest)}</div></div>` +

    '<div class="card-block"><h3>最近 8 周</h3>' +
    '<p class="sub">每格一天，颜色越深当天练得越多。</p>' +
    `<div class="heat">${heat(s.heatmap)}</div></div>`;
}
