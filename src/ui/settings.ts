// src/ui/settings.ts
import type { AppCtx } from '../main';
import { defaultFilter } from '../main';
import { resetState } from '../core/store';
import { esc } from '../core/markdown';
import { renderCard } from './card';
import { toast } from './toast';

const ORAL_STEPS = [30, 60, 90, 120, 180];

interface Question {
  id: string; cat: string; q: string; a: string;
  type: string; options: string[]; answer: unknown; followup: string[];
}

/** 从 engine 的题库中查找题目 */
function getQuestionById(ctx: AppCtx, id: string): Question | null {
  const all = JSON.parse(ctx.engine.questions_json()) as Question[];
  return all.find((q) => q.id === id) ?? null;
}

/** 分类 id → 名称缓存 */
let _catNames: Map<string, string> | null = null;
function catName(ctx: AppCtx, id: string): string {
  if (!_catNames) {
    const list = (ctx.engine.cats() as { id: string; name: string }[] | null) ?? [];
    _catNames = new Map(list.map((c) => [c.id, c.name]));
  }
  return _catNames.get(id) ?? id;
}

/**
 * 题库自检结果。结构照 legacy/js/app.js:611-617：外层 .health（index.html 已有），
 * 每条问题一个 <span class="err">，冻结的 CSS 只认这两个选择器。
 *
 * `esc(p)` 不能省：health() 的文本由 parser 用题目的 cat 字段拼成
 * （src-rust/parser.rs 的 format!("分类 \"{}\" ...", c.id)），
 * 也就是 questions.json 里一个恶意 cat 能一路走到 innerHTML。
 */
export function renderHealth(ctx: AppCtx): void {
  const box = document.getElementById('bankHealth')!;
  const problems = ctx.engine.health() as string[];
  const total = (ctx.engine.count(JSON.stringify(defaultFilter())) as { total: number }).total;
  const catCount = (ctx.engine.cats() as unknown[]).length;

  box.innerHTML = problems.length
    ? `共 ${total} 题，发现 ${problems.length} 个问题：` +
      problems.map((p) => `<span class="err">· ${esc(p)}</span>`).join('')
    : `共 ${total} 题，${catCount} 个分类，未发现问题。`;
}

/** 今天错题 Markdown 导出（移植自 legacy/js/stats.js:95） */
function wrongTodayMarkdown(ctx: AppCtx): string {
  const state = JSON.parse(ctx.engine.state_json());
  const today = state.days ? Object.keys(state.days).pop() ?? '' : '';
  const ids = (state.wrongToday as Record<string, string[]> | null)?.[today] ?? [];

  const lines: string[] = [`# 今日错题 · ${today}`, ''];
  if (!ids.length) {
    lines.push('_今天没有错题。_');
    return lines.join('\n');
  }
  lines.push(`共 ${ids.length} 题。`, '');

  for (const id of ids) {
    const q = getQuestionById(ctx, id);
    if (!q) continue;
    lines.push(`## ${q.id} · ${catName(ctx, q.cat)}`, '');
    lines.push(q.q, '');
    if (q.options.length) {
      for (let j = 0; j < q.options.length; j++) {
        const ansArr = Array.isArray(q.answer) ? q.answer : [];
        const mark = ansArr.includes(j) ? ' ✅' : '';
        lines.push(`- ${String.fromCharCode(65 + j)}. ${q.options[j]}${mark}`);
      }
      lines.push('');
    }
    if (q.type === 'bool') {
      lines.push(`**答案：**${q.answer ? '正确' : '错误'}`, '');
    }
    lines.push('**要点：**', '', q.a, '');
    if (q.followup.length) {
      lines.push('**可能追问：**');
      for (const f of q.followup) lines.push(`- ${f}`);
      lines.push('');
    }
    lines.push('---', '');
  }
  return lines.join('\n');
}

export function mountSettings(ctx: AppCtx): void {
  document.getElementById('btnSettings')!.addEventListener('click', () => {
    const p = document.getElementById('settingsPanel')!;
    p.hidden = !p.hidden;
    document.getElementById('filterPanel')!.hidden = true;
    if (!p.hidden) { renderHealth(ctx); syncOral(ctx); }
  });

  document.getElementById('oralToggle')!.addEventListener('click', () => {
    ctx.engine.set_oral(!ctx.engine.oral());
    ctx.persist(); syncOral(ctx); renderCard(ctx);
  });

  document.getElementById('oralTimeBtn')!.addEventListener('click', () => {
    const cur = ctx.engine.oral_seconds();
    const next = ORAL_STEPS[(ORAL_STEPS.indexOf(cur) + 1) % ORAL_STEPS.length]!;
    ctx.engine.set_oral_seconds(next);
    ctx.persist(); syncOral(ctx);
  });

  document.getElementById('btnExport')!.addEventListener('click', () => {
    download('embq-progress.json', ctx.engine.state_json(), 'application/json');
    toast('已导出进度');
  });

  document.getElementById('btnImport')!.addEventListener('click', () => {
    (document.getElementById('importFile') as HTMLInputElement).click();
  });

  document.getElementById('importFile')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      ctx.engine.load_state_json(await file.text());
      ctx.persist();
      if (!ctx.engine.restore_deck()) toast('进度已导入，卷需要重新组');
      else toast('进度已导入');
      ctx.rerender();
    } catch {
      toast('导入失败：文件格式不对');
    }
  });

  document.getElementById('btnExportWrong')!.addEventListener('click', () => {
    download('今日错题.md', wrongTodayMarkdown(ctx), 'text/markdown');
  });

  document.getElementById('btnReset')!.addEventListener('click', async () => {
    if (!confirm('清空全部进度？这个操作没法撤销，建议先导出。')) return;
    await resetState();
    location.reload();
  });
}

function syncOral(ctx: AppCtx): void {
  const t = document.getElementById('oralToggle')!;
  const on = ctx.engine.oral();
  t.dataset.on = String(on);
  t.textContent = `口述模式：${on ? '开' : '关'}`;
  t.classList.toggle('is-on', on);
  document.getElementById('oralTimeBtn')!.textContent = `倒计时：${ctx.engine.oral_seconds()} 秒`;
}

function download(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
