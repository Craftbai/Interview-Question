// src/ui/stats.ts
import type { AppCtx } from '../main';

interface StatsPayload {
  overall: { total: number; seen: number; mastered: number; accuracy: number;
             today: number; streak: number; boxes: [number, number, number, number] };
  byCategory: CategoryStat[];
  weakest: CategoryStat[];
  heatmap: { date: string; count: number }[];
  resumeRisk: { total: number; mastered: number; weak_ids: string[] };
}

interface CategoryStat {
  id: string; name: string; total: number;
  mastered: number; seen: number; accuracy: number;
}

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 100) : 0;
}

function kpis(o: StatsPayload['overall']): string {
  return '<div class="kpis">' +
    kpi('已掌握', `${o.mastered} / ${o.total}`, `${pct(o.mastered, o.total)}%`) +
    kpi('已练过', `${o.seen} / ${o.total}`, `${pct(o.seen, o.total)}%`) +
    kpi('正确率', `${Math.round(o.accuracy * 100)}%`, '答对 / 已答') +
    kpi('今日', `${o.today} 题`, `连续 ${o.streak} 天`) +
    '</div>';
}

function kpi(label: string, value: string, sub: string): string {
  return `<div class="kpi"><div class="kpi-label">// ${label}</div>` +
    `<div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

function bars(list: CategoryStat[]): string {
  const rows = list.map((c) => {
    const p = pct(c.mastered, c.total);
    return '<div class="bar">' +
      `<div class="bar-label">${c.name}</div>` +
      `<div class="bar-track"><div class="bar-fill" style="width:${p}%"></div></div>` +
      `<div class="bar-num">${c.mastered}/${c.total}</div>` +
      '</div>';
  }).join('');
  return `<div class="bars">${rows}</div>`;
}

function heat(cells: { date: string; count: number }[]): string {
  const inner = cells.map((c) => {
    // 0 / 1-9 / 10-24 / 25-49 / 50+ 五档，对齐 legacy/js/stats.js:80
    const lv = c.count === 0 ? 0 : c.count < 10 ? 1 : c.count < 25 ? 2 : c.count < 50 ? 3 : 4;
    return `<div class="heat-cell lv${lv}" title="${c.date}：${c.count} 题"></div>`;
  }).join('');
  return `<div class="heat">${inner}</div>`;
}

export function renderStats(ctx: AppCtx): void {
  const wrap = document.getElementById('statsWrap');
  if (!wrap) return;
  const s = ctx.engine.stats() as StatsPayload;

  const risk = s.resumeRisk;
  const riskBlock = risk.total
    ? `<section class="stat-block"><h3>// 简历高危</h3>` +
      `<p class="hint">这些题跟你简历上写的东西直接相关，面试官大概率会问。已掌握 ` +
      `${risk.mastered} / ${risk.total}。</p></section>`
    : '';

  wrap.innerHTML =
    kpis(s.overall) +
    '<section class="stat-block"><h3>// 最薄弱的分类</h3>' + bars(s.weakest) + '</section>' +
    '<section class="stat-block"><h3>// 全部分类</h3>' + bars(s.byCategory) + '</section>' +
    '<section class="stat-block"><h3>// 最近半年</h3>' + heat(s.heatmap) + '</section>' +
    riskBlock;
}
