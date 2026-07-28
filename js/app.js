/* ============================================================
   app.js — 渲染与交互（原生 DOM，无框架）
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var LEVEL_NAME = { 1: '基础', 2: '进阶', 3: '深入' };
  var BOX_NAME = { 0: '未练', 1: '生', 2: '熟', 3: '已掌握' };
  var TYPE_NAME = { single: '单选', multi: '多选', bool: '判断', qa: '简答' };

  // 单题作答状态
  var picked = [];
  var revealed = false;
  var verdict = null;
  var oralActive = false;
  var oralTimer = null;
  var oralLeft = 0;

  /* ---------------- 轻量 Markdown 渲染（先转义，再放行少量标记） ---------------- */

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, function (m, c) { return '<code>' + c + '</code>'; })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, t, u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>'; });
  }

  /* 表格：连续的 | 行 → <table>，第二行是分隔线则首行为表头 */
  function tableHTML(rows) {
    var isSep = function (r) { return r.replace(/[|\s:\-]/g, '') === ''; };
    var parsed = rows.map(function (r) {
      return r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|')
              .map(function (c) { return inline(c.trim()); });
    });
    var html = '<div class="tblwrap"><table>';
    var start = 0;
    if (rows.length > 1 && isSep(rows[1])) {
      html += '<thead><tr>' + parsed[0].map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead>';
      start = 2;
    }
    html += '<tbody>';
    for (var r = start; r < rows.length; r++) {
      if (isSep(rows[r])) continue;
      html += '<tr>' + parsed[r].map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }
    return html + '</tbody></table></div>';
  }

  /* 引用块：> 行（去掉前缀后按空行分段，支持段内列表） */
  function quoteHTML(qlines) {
    var html = '', para = [], list = [];
    var fp = function () { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
    var fl = function () {
      if (list.length) {
        html += '<ul>' + list.map(function (x) { return '<li>' + inline(x) + '</li>'; }).join('') + '</ul>';
        list = [];
      }
    };
    for (var i = 0; i < qlines.length; i++) {
      var ln = qlines[i].trim();
      if (!ln) { fp(); fl(); continue; }
      if (/^[-*]\s+/.test(ln)) { fp(); list.push(ln.replace(/^[-*]\s+/, '')); continue; }
      fl(); para.push(ln);
    }
    fp(); fl();
    return '<blockquote>' + html + '</blockquote>';
  }

  function renderMD(text) {
    var src = String(text || '');
    var out = [];
    var blocks = src.split(/```/);

    for (var b = 0; b < blocks.length; b++) {
      if (b % 2 === 1) {
        // 代码块：首行可能是语言名
        var code = blocks[b].replace(/^(?:c|cpp|c\+\+|c#|python|py|bash|sh|asm|arm|json|html|xml|css|js|javascript|ts|typescript|rust|go|make|makefile|cmake|txt|text|diff|sql|verilog|vhdl|yaml|yml)\n/i, '').replace(/\n$/, '');
        out.push('<pre><code>' + esc(code) + '</code></pre>');
        continue;
      }
      var lines = blocks[b].split('\n');
      var para = [], list = [], table = [], quote = [];

      var flushPara = function () {
        if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
      };
      var flushList = function () {
        if (list.length) {
          out.push('<ul>' + list.map(function (x) { return '<li>' + inline(x) + '</li>'; }).join('') + '</ul>');
          list = [];
        }
      };
      var flushTable = function () {
        if (table.length) { out.push(tableHTML(table)); table = []; }
      };
      var flushQuote = function () {
        if (quote.length) { out.push(quoteHTML(quote)); quote = []; }
      };
      var flushAll = function () { flushPara(); flushList(); flushTable(); flushQuote(); };

      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i].trim();
        if (!ln) { flushAll(); continue; }
        if (/^\|/.test(ln)) { flushPara(); flushList(); flushQuote(); table.push(ln); continue; }
        if (/^>/.test(ln)) { flushPara(); flushList(); flushTable(); quote.push(ln.replace(/^>\s?/, '')); continue; }
        if (/^[-*]\s+/.test(ln)) { flushPara(); flushTable(); flushQuote(); list.push(ln.replace(/^[-*]\s+/, '')); continue; }
        if (/^\d+[.)]\s+/.test(ln)) {
          /* 编号行独立成段（保留原编号，悬挂缩进），避免多条编号被拼进同一段 */
          flushAll();
          out.push('<p class="oli">' + inline(ln) + '</p>');
          continue;
        }
        flushList(); flushTable(); flushQuote();
        para.push(ln);
      }
      flushAll();
    }
    return out.join('');
  }
  window.__renderMD = renderMD;   /* 供自动化测试调用 */

  /* ---------------- Toast ---------------- */

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  /* ---------------- 主题 ---------------- */

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', Store.get('theme') || 'auto');
  }
  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var next = order[(order.indexOf(Store.get('theme') || 'auto') + 1) % 3];
    Store.set('theme', next);
    applyTheme();
    toast('主题：' + { auto: '跟随系统', light: '浅色', dark: '深色' }[next]);
  }

  /* ---------------- 筛选面板 ---------------- */

  function buildCatChips() {
    var counts = QBANK.countByCat();
    var html = QBANK.cats().map(function (c) {
      var n = counts[c.id] || 0;
      if (!n) return '';
      return '<button class="chip is-on" data-cat="' + c.id + '" title="' + esc(c.desc || '') + '">' +
        esc(c.name) + '<span class="n">' + n + '</span></button>';
    }).join('');
    $('#catChips').innerHTML = html;
  }

  function readFilter() {
    var f = Quiz.defaultFilter();
    var onCats = $$('#catChips .chip.is-on').map(function (b) { return b.dataset.cat; });
    var allCats = $$('#catChips .chip').length;
    f.cats = (onCats.length === allCats) ? [] : onCats;   // 全选等价于不限
    f.levels = $$('#levelChips .chip.is-on').map(function (b) { return +b.dataset.level; });
    f.types = $$('#typeChips .chip.is-on').map(function (b) { return b.dataset.type; });
    f.scopes = $$('#scopeChips .chip.is-on').map(function (b) { return b.dataset.scope; });
    var m = $('#modeChips .chip.is-on');
    f.mode = m ? m.dataset.mode : 'smart';
    f.keyword = $('#searchInput').value;
    return f;
  }

  function updateDeckCount() {
    var f = readFilter();
    if (!f.levels.length || !f.types.length) {
      $('#deckCount').innerHTML = '<b>0</b> 题 — 难度或题型不能全部取消';
      return;
    }
    var n = Quiz.select(f).length;
    var d = Scheduler.distribution(Quiz.select(f));
    $('#deckCount').innerHTML = '命中 <b>' + n + '</b> 题　·　未练 ' + d[0] + ' / 生 ' + d[1] + ' / 熟 ' + d[2] + ' / 已掌握 ' + d[3];
  }

  function wireFilter() {
    // 分类：单击切换
    $('#catChips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      b.classList.toggle('is-on');
      updateDeckCount();
    });

    // 分类批量操作
    $$('[data-cat-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.dataset.catAction;
        var chips = $$('#catChips .chip');
        if (act === 'all') chips.forEach(function (c) { c.classList.add('is-on'); });
        else if (act === 'none') chips.forEach(function (c) { c.classList.remove('is-on'); });
        else if (act === 'auto') {
          var preset = window.CAT_PRESETS && window.CAT_PRESETS.automotive || [];
          chips.forEach(function (c) { c.classList.toggle('is-on', preset.indexOf(c.dataset.cat) >= 0); });
        }
        updateDeckCount();
      });
    });

    // 难度 / 题型 / 范围：多选切换
    ['#levelChips', '#typeChips', '#scopeChips'].forEach(function (sel) {
      $(sel).addEventListener('click', function (e) {
        var b = e.target.closest('.chip');
        if (!b) return;
        b.classList.toggle('is-on');
        updateDeckCount();
      });
    });

    // 模式：单选
    $('#modeChips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      $$('#modeChips .chip').forEach(function (c) { c.classList.remove('is-on'); });
      b.classList.add('is-on');
    });

    var kwTimer = null;
    $('#searchInput').addEventListener('input', function () {
      clearTimeout(kwTimer);
      kwTimer = setTimeout(updateDeckCount, 200);
    });

    $('#btnResetFilter').addEventListener('click', function () {
      $$('#catChips .chip').forEach(function (c) { c.classList.add('is-on'); });
      $$('#levelChips .chip, #typeChips .chip').forEach(function (c) { c.classList.add('is-on'); });
      $$('#scopeChips .chip').forEach(function (c) { c.classList.remove('is-on'); });
      $$('#modeChips .chip').forEach(function (c, i) { c.classList.toggle('is-on', i === 0); });
      $('#searchInput').value = '';
      updateDeckCount();
    });

    $('#btnApplyFilter').addEventListener('click', function () {
      var f = readFilter();
      if (!f.levels.length || !f.types.length) { toast('难度和题型至少各留一项'); return; }
      var n = Quiz.build(f);
      if (!n) { toast('这组条件下没有题目，放宽一点试试'); return; }
      $('#filterPanel').hidden = true;
      $('#btnFilter').classList.remove('is-on');
      switchView('practice');
      renderCard();
      toast('已组卷 ' + n + ' 题');
    });
  }

  /* ---------------- 题卡渲染 ---------------- */

  function resetCardState() {
    picked = [];
    revealed = false;
    verdict = null;
    stopOral();
    oralActive = !!Store.get('oral');
  }

  function stopOral() {
    clearInterval(oralTimer);
    oralTimer = null;
  }

  function startOral() {
    oralLeft = Store.get('oralSeconds') || 60;
    var tick = function () {
      var el = $('#oralClock');
      if (!el) { stopOral(); return; }
      var m = Math.floor(Math.abs(oralLeft) / 60), s = Math.abs(oralLeft) % 60;
      el.textContent = (oralLeft < 0 ? '-' : '') + m + ':' + String(s).padStart(2, '0');
      el.classList.toggle('is-up', oralLeft <= 0);
      oralLeft--;
    };
    tick();
    stopOral();
    oralTimer = setInterval(tick, 1000);
  }

  function cardHead(q) {
    var c = QBANK.cat(q.cat);
    var box = Store.box(q.id);
    var bits = [
      '<span class="tag tag-cat">' + esc(c.name) + '</span>',
      '<span class="tag tag-lv' + q.level + '">' + LEVEL_NAME[q.level] + '</span>',
      '<span class="tag">' + TYPE_NAME[q.type] + '</span>'
    ];
    if (q.resume) bits.push('<span class="tag tag-resume">简历高危</span>');
    q.tags.slice(0, 3).forEach(function (t) { bits.push('<span class="tag">' + esc(t) + '</span>'); });
    bits.push('<span class="tag tag-box">' + BOX_NAME[box] + ' · ' + q.id + '</span>');
    return '<div class="card-head">' + bits.join('') + '</div>';
  }

  function optionRows(q) {
    var opts = q.type === 'bool' ? ['正确', '错误'] : q.options;
    return opts.map(function (text, i) {
      var cls = 'opt';
      var mark = '';
      if (revealed) {
        var isRight = verdict.right.indexOf(i) >= 0;
        var isPicked = picked.indexOf(i) >= 0;
        if (isRight) { cls += ' is-right'; mark = '正确答案'; }
        else if (isPicked) { cls += ' is-wrong'; mark = '你选的'; }
      } else if (picked.indexOf(i) >= 0) {
        cls += ' is-picked';
      }
      return '<button class="' + cls + '" data-opt="' + i + '"' + (revealed ? ' disabled' : '') + '>' +
        '<span class="opt-key">' + (i + 1) + '</span>' +
        '<span>' + inline(text) + '</span>' +
        (mark ? '<span class="opt-mark">' + mark + '</span>' : '') +
        '</button>';
    }).join('');
  }

  function revealBlock(q) {
    var head;
    if (q.type === 'qa') {
      head = '<div class="reveal-head">参考答案</div>';
    } else {
      head = '<div class="reveal-head ' + (verdict.correct ? 'verdict-ok' : 'verdict-bad') + '">' +
        (verdict.correct ? '✓ 答对了' : '✗ 答错了') + '　<span style="color:var(--text-faint);font-weight:400">解析</span></div>';
    }
    var fu = '';
    if (q.followup.length) {
      fu = '<div class="followup"><div class="followup-title">面试官可能追问</div><ul>' +
        q.followup.map(function (t) { return '<li>' + inline(t) + '</li>'; }).join('') + '</ul></div>';
    }
    return '<div class="reveal">' + head + '<div class="ans">' + renderMD(q.a) + '</div>' + fu + '</div>';
  }

  function gradeRow() {
    return '<div class="grade-row">' +
      '<button class="grade grade-know" data-grade="know"><b>会了</b><small>1 · 讲得完整</small></button>' +
      '<button class="grade grade-fuzzy" data-grade="fuzzy"><b>模糊</b><small>2 · 大概知道</small></button>' +
      '<button class="grade grade-no" data-grade="no"><b>不会</b><small>3 · 说不上来</small></button>' +
      '</div>';
  }

  function renderCard() {
    var wrap = $('#cardWrap');

    if (!Quiz.size()) {
      $('#navbar').hidden = true;
      wrap.innerHTML =
        '<div class="empty"><h2>还没有组卷</h2>' +
        '<p>打开「筛选」挑分类和难度，或者直接开始智能复习——它会优先推没练过和练错的题。</p>' +
        '<button class="btn btn-primary" id="quickStart">智能复习全部 ' + QBANK.all().length + ' 题</button></div>';
      var qs = $('#quickStart');
      if (qs) qs.addEventListener('click', function () {
        Quiz.build(Quiz.defaultFilter());
        renderCard();
      });
      return;
    }

    if (Quiz.finished()) {
      stopOral();
      $('#navbar').hidden = true;
      $('#deckProgress').style.width = '100%';
      var o = Stats.overall();
      wrap.innerHTML =
        '<div class="card"><div class="done">' +
        '<div class="done-num">' + Quiz.size() + '</div>' +
        '<h2>这一卷刷完了</h2>' +
        '<p>全库掌握 ' + o.mastered + ' / ' + o.total + ' 题（' + o.masteredPct + '%）　·　今日已练 ' + Store.todayCount() + ' 题</p>' +
        '<div class="card-actions" style="justify-content:center">' +
        '<button class="btn btn-primary" id="againAll">再刷一遍</button>' +
        '<button class="btn" id="againWrong">只刷这卷里的错题</button>' +
        '<button class="btn btn-ghost" id="toStats">看统计</button>' +
        '</div></div></div>';

      $('#againAll').addEventListener('click', function () {
        Quiz.build(Quiz.filter()); renderCard();
      });
      $('#againWrong').addEventListener('click', function () {
        var base = Quiz.filter();
        var f = JSON.parse(JSON.stringify(base));
        if (f.scopes.indexOf('wrong') < 0) f.scopes.push('wrong');
        if (!Quiz.build(f, false)) { toast('这卷里没有错题，漂亮'); Quiz.build(base); }
        renderCard();
      });
      $('#toStats').addEventListener('click', function () { switchView('stats'); });
      return;
    }

    var q = Quiz.current();
    $('#navbar').hidden = false;
    $('#deckPos').textContent = (Quiz.pos() + 1) + ' / ' + Quiz.size();
    $('#deckProgress').style.width = ((Quiz.pos()) / Quiz.size() * 100) + '%';
    $('#btnFav').textContent = Store.isFav(q.id) ? '★' : '☆';
    $('#btnFav').classList.toggle('is-on', Store.isFav(q.id));

    var body = '<div class="qtext">' + renderMD(q.q) + '</div>';

    if (oralActive && !revealed) {
      body += '<div class="oral">' +
        '<div class="oral-clock" id="oralClock">--:--</div>' +
        '<div class="oral-note">口述模式：先出声把答案完整讲一遍，讲完再揭晓。面试考的是能不能讲清楚。</div>' +
        '<button class="btn btn-primary" id="oralDone">讲完了</button>' +
        '</div>';
    } else if (q.type === 'qa') {
      if (!revealed) {
        body += '<div class="card-actions"><button class="btn btn-primary" id="btnReveal">显示参考答案　<kbd>空格</kbd></button></div>';
      } else {
        body += revealBlock(q) + gradeRow();
      }
    } else {
      body += '<div class="options">' + optionRows(q) + '</div>';
      if (!revealed) {
        if (q.type === 'multi') {
          body += '<div class="card-actions"><button class="btn btn-primary" id="btnSubmit">提交　<kbd>空格</kbd></button>' +
            '<span style="align-self:center;font-size:13px;color:var(--text-faint)">多选题，选完再提交</span></div>';
        }
      } else {
        body += revealBlock(q);
        body += '<div class="card-actions"><button class="btn btn-primary" id="btnNextInline">' +
          (Quiz.isLast() ? '完成这一卷' : '下一题') + '　<kbd>空格</kbd></button></div>';
      }
    }

    wrap.innerHTML = '<div class="card">' + cardHead(q) + '<div class="card-body">' + body + '</div></div>';

    if (oralActive && !revealed) {
      startOral();
      $('#oralDone').addEventListener('click', function () {
        oralActive = false;
        stopOral();
        renderCard();
      });
      return;
    }

    if (q.type === 'qa') {
      if (!revealed) {
        $('#btnReveal').addEventListener('click', reveal);
      } else {
        $$('.grade').forEach(function (b) {
          b.addEventListener('click', function () { grade(b.dataset.grade); });
        });
      }
      return;
    }

    if (!revealed) {
      $$('.opt').forEach(function (b) {
        b.addEventListener('click', function () { pick(+b.dataset.opt); });
      });
      var sb = $('#btnSubmit');
      if (sb) sb.addEventListener('click', submitObjective);
    } else {
      $('#btnNextInline').addEventListener('click', goNext);
    }
  }

  /* ---------------- 作答动作 ---------------- */

  function pick(i) {
    if (revealed) return;
    var q = Quiz.current();
    if (q.type === 'multi') {
      var at = picked.indexOf(i);
      if (at >= 0) picked.splice(at, 1); else picked.push(i);
      renderCard();
    } else {
      picked = [i];
      submitObjective();
    }
  }

  function submitObjective() {
    if (revealed) return;
    if (!picked.length) { toast('先选一个再提交'); return; }
    var q = Quiz.current();
    verdict = Quiz.judge(q, picked);
    revealed = true;
    Quiz.answer(q, verdict.correct ? 'know' : 'no');
    renderCard();
  }

  function reveal() {
    revealed = true;
    renderCard();
  }

  function grade(g) {
    var q = Quiz.current();
    Quiz.answer(q, g);
    goNext();
  }

  function goNext() {
    Quiz.next();
    resetCardState();
    renderCard();
  }

  function goPrev() {
    if (Quiz.finished()) { Quiz.goto(Quiz.size() - 1); }
    else if (!Quiz.prev()) { toast('已经是第一题'); return; }
    resetCardState();
    renderCard();
  }

  /* ---------------- 统计视图 ---------------- */

  function renderStats() {
    var o = Stats.overall();
    var risk = Stats.resumeRisk();
    var cats = Stats.byCategory();
    var weak = Stats.weakest(5);
    var heat = Stats.heatmap(56);

    var kpis = '<div class="kpis">' +
      kpi(o.masteredPct + '<small>%</small>', '总掌握率　' + o.mastered + '/' + o.total) +
      kpi(o.accuracy + '<small>%</small>', '客观题正确率　' + o.right + '对/' + o.wrong + '错') +
      kpi(String(Store.todayCount()), '今日已练（题）') +
      kpi(String(Store.streak()), '连续打卡（天）') +
      '</div>';

    var bars = cats.map(function (c) {
      var seg = function (n, cls) {
        return n ? '<div class="bar-seg ' + cls + '" style="width:' + (n / c.total * 100) + '%"></div>' : '';
      };
      return '<div class="bar-row">' +
        '<div class="bar-name" title="' + esc(c.name) + '">' + esc(c.name) + '</div>' +
        '<div class="bar-track">' + seg(c.dist[3], 'seg-3') + seg(c.dist[2], 'seg-2') + seg(c.dist[1], 'seg-1') + '</div>' +
        '<div class="bar-val">' + c.masteredPct + '% / ' + c.total + '</div>' +
        '</div>';
    }).join('');

    var weakHTML = weak.map(function (c, i) {
      return '<div class="weak-item">' +
        '<span class="weak-rank">' + (i + 1) + '</span>' +
        '<span class="weak-name">' + esc(c.name) + '</span>' +
        '<span class="weak-meta">掌握 ' + c.masteredPct + '%　共 ' + c.total + ' 题</span>' +
        '</div>';
    }).join('');

    var heatHTML = heat.map(function (d) {
      return '<div class="heat-cell" data-n="' + d.level + '" title="' + d.date + '：' + d.count + ' 题"></div>';
    }).join('');

    $('#statsWrap').innerHTML =
      kpis +
      '<div class="card-block">' +
      '<h3>简历高危题</h3>' +
      '<p class="sub">这些题是因为你简历上写了才会被追问的，答不上来最伤。</p>' +
      '<div class="bar-row"><div class="bar-name">掌握进度</div>' +
      '<div class="bar-track"><div class="bar-seg seg-3" style="width:' + risk.pct + '%"></div></div>' +
      '<div class="bar-val">' + risk.mastered + '/' + risk.total + '</div></div>' +
      '</div>' +

      '<div class="card-block"><h3>分类掌握度</h3>' +
      '<p class="sub">条形从左到右依次是已掌握、熟、生；灰色部分是还没练过的。</p>' +
      '<div class="bars">' + bars + '</div>' +
      '<div class="legend">' +
      '<span><i style="background:var(--ok)"></i>已掌握（第 3 盒）</span>' +
      '<span><i style="background:var(--accent)"></i>熟（第 2 盒）</span>' +
      '<span><i style="background:var(--warn)"></i>生（第 1 盒）</span>' +
      '<span><i style="background:var(--bg-sunk)"></i>未练过</span>' +
      '</div></div>' +

      '<div class="card-block"><h3>最该补的 5 个方向</h3>' +
      '<p class="sub">按掌握率升序，题量少于 5 题的分类不参与排名。</p>' +
      '<div class="weak-list">' + (weakHTML || '<p class="sub">先练一些题再看。</p>') + '</div></div>' +

      '<div class="card-block"><h3>最近 8 周</h3>' +
      '<p class="sub">每格一天，颜色越深当天练得越多。</p>' +
      '<div class="heat">' + heatHTML + '</div></div>';
  }

  function kpi(val, label) {
    return '<div class="kpi"><div class="kpi-val">' + val + '</div><div class="kpi-label">' + esc(label) + '</div></div>';
  }

  /* ---------------- 视图切换 ---------------- */

  function switchView(name) {
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + name); });
    $$('#viewTabs .tab').forEach(function (t) { t.classList.toggle('is-active', t.dataset.view === name); });
    if (name === 'stats') { stopOral(); renderStats(); }
    $('#navbar').hidden = (name !== 'practice') || !Quiz.size() || Quiz.finished();
    window.scrollTo(0, 0);
  }

  /* ---------------- 设置面板 ---------------- */

  function renderOralButtons() {
    var on = !!Store.get('oral');
    var b = $('#oralToggle');
    b.classList.toggle('is-on', on);
    b.textContent = '口述模式：' + (on ? '开' : '关');
    $('#oralTimeBtn').textContent = '倒计时：' + (Store.get('oralSeconds') || 60) + ' 秒';
  }

  function renderHealth() {
    var probs = QBANK.health();
    var el = $('#bankHealth');
    if (!probs.length) {
      el.innerHTML = '共 ' + QBANK.all().length + ' 题，' + QBANK.cats().length + ' 个分类，未发现问题。';
    } else {
      el.innerHTML = '共 ' + QBANK.all().length + ' 题，发现 ' + probs.length + ' 个问题：' +
        probs.map(function (p) { return '<span class="err">· ' + esc(p) + '</span>'; }).join('');
      console.error('[题库自检]', probs);
    }
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function wireSettings() {
    $('#oralToggle').addEventListener('click', function () {
      Store.set('oral', !Store.get('oral'));
      renderOralButtons();
      resetCardState();
      renderCard();
    });

    $('#oralTimeBtn').addEventListener('click', function () {
      var opts = [30, 45, 60, 90, 120];
      var cur = Store.get('oralSeconds') || 60;
      Store.set('oralSeconds', opts[(opts.indexOf(cur) + 1) % opts.length]);
      renderOralButtons();
    });

    $('#btnExport').addEventListener('click', function () {
      download('嵌入式题库进度-' + Store.today() + '.json', Store.exportJSON(), 'application/json');
      toast('进度已导出');
    });

    $('#btnImport').addEventListener('click', function () { $('#importFile').click(); });

    $('#importFile').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          Store.importJSON(reader.result);
          applyTheme();
          renderOralButtons();
          Quiz.build(Quiz.filter());
          renderCard();
          toast('进度已导入');
        } catch (err) {
          toast('导入失败：' + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#btnExportWrong').addEventListener('click', function () {
      var ids = Store.wrongTodayIds();
      if (!ids.length) { toast('今天还没有错题'); return; }
      download('今日错题-' + Store.today() + '.md', Stats.wrongTodayMarkdown(), 'text/markdown');
      toast('已导出 ' + ids.length + ' 道错题');
    });

    $('#btnReset').addEventListener('click', function () {
      if (!confirm('这会清空全部刷题进度、收藏和打卡记录，且无法撤销。确定吗？')) return;
      Store.reset();
      applyTheme();
      renderOralButtons();
      Quiz.build(Quiz.filter());
      renderCard();
      toast('进度已清空');
    });
  }

  /* ---------------- 键盘 ---------------- */

  function wireKeys() {
    document.addEventListener('keydown', function (e) {
      var t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        togglePanel('#filterPanel', '#btnFilter', true);
        $('#searchInput').focus();
        return;
      }
      if (e.key === 'Escape') {
        $('#filterPanel').hidden = true; $('#btnFilter').classList.remove('is-on');
        $('#settingsPanel').hidden = true; $('#btnSettings').classList.remove('is-on');
        return;
      }

      if (!$('#view-practice').classList.contains('is-active')) return;
      var q = Quiz.current();
      if (!q) return;

      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); return; }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); $('#btnFav').click(); return; }

      // 口述模式：空格 = 讲完了
      if (oralActive && !revealed) {
        if (e.key === ' ') { e.preventDefault(); $('#oralDone').click(); }
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        if (revealed) {
          if (q.type === 'qa') toast('给自己评个分：1 会了 · 2 模糊 · 3 不会');
          else goNext();
        } else if (q.type === 'qa') {
          reveal();
        } else if (q.type === 'multi') {
          submitObjective();
        } else {
          toast('按数字键选择答案');
        }
        return;
      }

      var n = parseInt(e.key, 10);
      if (isNaN(n)) return;

      if (q.type === 'qa') {
        if (!revealed) return;
        var g = { 1: 'know', 2: 'fuzzy', 3: 'no' }[n];
        if (g) { e.preventDefault(); grade(g); }
        return;
      }

      if (revealed) return;
      var count = q.type === 'bool' ? 2 : q.options.length;
      if (n >= 1 && n <= count) { e.preventDefault(); pick(n - 1); }
    });
  }

  /* ---------------- 面板开关 ---------------- */

  function togglePanel(panelSel, btnSel, force) {
    var p = $(panelSel);
    var open = (force === undefined) ? p.hidden : force;
    // 同时只开一个面板
    ['#filterPanel', '#settingsPanel'].forEach(function (s) {
      $(s).hidden = true;
    });
    $('#btnFilter').classList.remove('is-on');
    $('#btnSettings').classList.remove('is-on');
    p.hidden = !open;
    $(btnSel).classList.toggle('is-on', open);
    if (open && panelSel === '#filterPanel') updateDeckCount();
    if (open && panelSel === '#settingsPanel') { renderOralButtons(); renderHealth(); }
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    Store.init();
    applyTheme();
    buildCatChips();
    wireFilter();
    wireSettings();
    wireKeys();

    $('#viewTabs').addEventListener('click', function (e) {
      var b = e.target.closest('.tab');
      if (b) switchView(b.dataset.view);
    });
    $('#btnFilter').addEventListener('click', function () { togglePanel('#filterPanel', '#btnFilter'); });
    $('#btnSettings').addEventListener('click', function () { togglePanel('#settingsPanel', '#btnSettings'); });
    $('#btnTheme').addEventListener('click', cycleTheme);
    $('#btnPrev').addEventListener('click', goPrev);
    $('#btnNext').addEventListener('click', goNext);
    $('#btnFav').addEventListener('click', function () {
      var q = Quiz.current();
      if (!q) return;
      var on = Store.toggleFav(q.id);
      $('#btnFav').textContent = on ? '★' : '☆';
      $('#btnFav').classList.toggle('is-on', on);
      toast(on ? '已收藏' : '已取消收藏');
    });

    var probs = QBANK.health();
    if (probs.length) console.error('[题库自检] 发现 ' + probs.length + ' 个问题：\n' + probs.join('\n'));

    // 默认进入智能复习全库
    Quiz.build(Quiz.defaultFilter());
    resetCardState();
    renderCard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
