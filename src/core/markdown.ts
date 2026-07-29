export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 只允许 http(s)、mailto 和站内相对路径。
 * `esc()` 已经把 `"` `<` `>` 实体化，所以突破属性或标签是不可能的，
 * 但 `javascript:alert(1)` 一个被转义字符都不含，能原样落进 href 变成可点的执行入口。
 * v1（legacy/js/app.js:34）没有这层白名单，这里补上。
 */
function safeUrl(u: string): string {
  const trimmed = u.trim();
  // 协议相对 //evil.com 也当外链拦掉，题库里没有这种用法
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return '#';
  return trimmed; // 相对路径 / 锚点
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, t: string, u: string) =>
        `<a href="${safeUrl(u)}" target="_blank" rel="noopener">${t}</a>`);
}

/* 表格：连续的 | 行 → <table>，第二行是分隔线则首行为表头 */
function tableHTML(rows: string[]): string {
  const isSep = (r: string): boolean => r.replace(/[|\s:\-]/g, '') === '';
  const parsed = rows.map((r) =>
    r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => inline(c.trim())));
  let html = '<div class="tblwrap"><table>';
  let start = 0;
  if (rows.length > 1 && isSep(rows[1]!)) {
    html += '<thead><tr>' + parsed[0]!.map((c) => `<th>${c}</th>`).join('') + '</tr></thead>';
    start = 2;
  }
  html += '<tbody>';
  for (let r = start; r < rows.length; r++) {
    if (isSep(rows[r]!)) continue;
    html += '<tr>' + parsed[r]!.map((c) => `<td>${c}</td>`).join('') + '</tr>';
  }
  return html + '</tbody></table></div>';
}

/* 引用块：> 行（去掉前缀后按空行分段，支持段内列表） */
function quoteHTML(qlines: string[]): string {
  let html = '';
  let para: string[] = [];
  let list: string[] = [];
  const fp = (): void => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const fl = (): void => {
    if (list.length) {
      html += '<ul>' + list.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>';
      list = [];
    }
  };
  for (const raw of qlines) {
    const ln = raw.trim();
    if (!ln) { fp(); fl(); continue; }
    if (/^[-*]\s+/.test(ln)) { fp(); list.push(ln.replace(/^[-*]\s+/, '')); continue; }
    fl(); para.push(ln);
  }
  fp(); fl();
  return `<blockquote>${html}</blockquote>`;
}

const CODE_LANGS =
  /^(?:c|cpp|c\+\+|c#|python|py|bash|sh|asm|arm|json|html|xml|css|js|javascript|ts|typescript|rust|go|make|makefile|cmake|txt|text|diff|sql|verilog|vhdl|yaml|yml)\n/i;

export function renderMD(text: string): string {
  const src = String(text || '');
  const out: string[] = [];
  const blocks = src.split(/```/);

  for (let b = 0; b < blocks.length; b++) {
    if (b % 2 === 1) {
      // 代码块：首行可能是语言名
      const code = blocks[b]!.replace(CODE_LANGS, '').replace(/\n$/, '');
      out.push(`<pre><code>${esc(code)}</code></pre>`);
      continue;
    }
    const lines = blocks[b]!.split('\n');
    let para: string[] = [];
    let list: string[] = [];
    let table: string[] = [];
    let quote: string[] = [];

    const flushPara = (): void => {
      if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
    };
    const flushList = (): void => {
      if (list.length) {
        out.push('<ul>' + list.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>');
        list = [];
      }
    };
    const flushTable = (): void => {
      if (table.length) { out.push(tableHTML(table)); table = []; }
    };
    const flushQuote = (): void => {
      if (quote.length) { out.push(quoteHTML(quote)); quote = []; }
    };
    const flushAll = (): void => { flushPara(); flushList(); flushTable(); flushQuote(); };

    for (const raw of lines) {
      const ln = raw.trim();
      if (!ln) { flushAll(); continue; }
      if (/^\|/.test(ln)) { flushPara(); flushList(); flushQuote(); table.push(ln); continue; }
      if (/^>/.test(ln)) {
        flushPara(); flushList(); flushTable(); quote.push(ln.replace(/^>\s?/, '')); continue;
      }
      if (/^[-*]\s+/.test(ln)) {
        flushPara(); flushTable(); flushQuote(); list.push(ln.replace(/^[-*]\s+/, '')); continue;
      }
      if (/^\d+[.)]\s+/.test(ln)) {
        /* 编号行独立成段（保留原编号，悬挂缩进），避免多条编号被拼进同一段 */
        flushAll();
        out.push(`<p class="oli">${inline(ln)}</p>`);
        continue;
      }
      flushList(); flushTable(); flushQuote();
      para.push(ln);
    }
    flushAll();
  }
  return out.join('');
}

// 保留 v1 的测试钩子
declare global {
  interface Window { __renderMD?: (t: string) => string }
}
if (typeof window !== 'undefined') window.__renderMD = renderMD;
