/* ============================================================
   stats.js — 掌握率 / 分类薄弱项 / 打卡统计
   ============================================================ */
(function (global) {
  'use strict';

  var Stats = {
    /** 全库总览 */
    overall: function () {
      var all = QBANK.all();
      var d = { 0: 0, 1: 0, 2: 0, 3: 0 };
      var right = 0, wrong = 0;
      for (var i = 0; i < all.length; i++) {
        var r = Store.of(all[i].id);
        d[r ? r.box : 0]++;
        if (r) { right += r.right; wrong += r.wrong; }
      }
      var total = all.length;
      return {
        total: total,
        dist: d,
        touched: total - d[0],
        mastered: d[3],
        masteredPct: total ? Math.round(d[3] / total * 100) : 0,
        touchedPct: total ? Math.round((total - d[0]) / total * 100) : 0,
        right: right,
        wrong: wrong,
        accuracy: (right + wrong) ? Math.round(right / (right + wrong) * 100) : 0
      };
    },

    /** 按分类统计，返回 _meta.js 中的分类顺序 */
    byCategory: function () {
      var cats = QBANK.cats();
      var all = QBANK.all();
      var map = Object.create(null);

      for (var i = 0; i < cats.length; i++) {
        map[cats[i].id] = { id: cats[i].id, name: cats[i].name, total: 0, dist: { 0: 0, 1: 0, 2: 0, 3: 0 } };
      }
      for (var j = 0; j < all.length; j++) {
        var q = all[j];
        if (!map[q.cat]) map[q.cat] = { id: q.cat, name: QBANK.cat(q.cat).name, total: 0, dist: { 0: 0, 1: 0, 2: 0, 3: 0 } };
        map[q.cat].total++;
        map[q.cat].dist[Store.box(q.id)]++;
      }

      var out = [];
      for (var k = 0; k < cats.length; k++) {
        var c = map[cats[k].id];
        if (!c || !c.total) continue;
        c.masteredPct = Math.round(c.dist[3] / c.total * 100);
        c.familiarPct = Math.round((c.dist[2] + c.dist[3]) / c.total * 100);
        out.push(c);
      }
      return out;
    },

    /** 最薄弱的 n 个分类：练过但掌握率低的优先 */
    weakest: function (n) {
      var list = Stats.byCategory().filter(function (c) { return c.total >= 5; });
      list.sort(function (a, b) {
        if (a.masteredPct !== b.masteredPct) return a.masteredPct - b.masteredPct;
        return b.total - a.total;
      });
      return list.slice(0, n || 5);
    },

    /** 最近 n 天的打卡热力（今天在最右） */
    heatmap: function (n) {
      var days = Store.days();
      var out = [];
      var d = new Date();
      d.setDate(d.getDate() - (n - 1));
      for (var i = 0; i < n; i++) {
        var key = d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0');
        var c = days[key] || 0;
        out.push({ date: key, count: c, level: c === 0 ? 0 : c < 10 ? 1 : c < 25 ? 2 : c < 50 ? 3 : 4 });
        d.setDate(d.getDate() + 1);
      }
      return out;
    },

    /** 简历高危题的掌握情况 */
    resumeRisk: function () {
      var all = QBANK.all().filter(function (q) { return q.resume; });
      var mastered = 0;
      for (var i = 0; i < all.length; i++) if (Scheduler.isMastered(all[i].id)) mastered++;
      return { total: all.length, mastered: mastered, pct: all.length ? Math.round(mastered / all.length * 100) : 0 };
    },

    /** 今日错题导出为 Markdown */
    wrongTodayMarkdown: function () {
      var ids = Store.wrongTodayIds();
      var lines = ['# 今日错题 · ' + Store.today(), ''];
      if (!ids.length) {
        lines.push('_今天没有错题。_');
        return lines.join('\n');
      }
      lines.push('共 ' + ids.length + ' 题。', '');
      for (var i = 0; i < ids.length; i++) {
        var q = QBANK.get(ids[i]);
        if (!q) continue;
        lines.push('## ' + (i + 1) + '. ' + QBANK.cat(q.cat).name + ' · ' + q.id);
        lines.push('');
        lines.push(q.q);
        lines.push('');
        if (q.options) {
          for (var j = 0; j < q.options.length; j++) {
            var mark = q.answer.indexOf(j) >= 0 ? ' ✅' : '';
            lines.push('- ' + String.fromCharCode(65 + j) + '. ' + q.options[j] + mark);
          }
          lines.push('');
        }
        if (q.type === 'bool') { lines.push('**答案：**' + (q.answer ? '正确' : '错误'), ''); }
        lines.push('**要点：**');
        lines.push('');
        lines.push(q.a);
        lines.push('');
        if (q.followup && q.followup.length) {
          lines.push('**可能追问：**');
          for (var k = 0; k < q.followup.length; k++) lines.push('- ' + q.followup[k]);
          lines.push('');
        }
        lines.push('---', '');
      }
      return lines.join('\n');
    }
  };

  global.Stats = Stats;
})(window);
