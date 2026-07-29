/* ============================================================
   quiz.js — 出题引擎：筛选 → 组卷 → 判分 → 记录
   ============================================================ */
(function (global) {
  'use strict';

  var deck = [];      // 当前卷子（题目对象数组）
  var pos = 0;        // 当前题下标
  var filter = null;  // 当前筛选条件

  function defaultFilter() {
    return {
      cats: [],                                   // 空 = 全部
      levels: [1, 2, 3],
      types: ['single', 'multi', 'bool', 'qa'],
      scopes: [],                                 // wrong / unmastered / fav / resume
      mode: 'smart',
      keyword: ''
    };
  }

  function hit(text, kw) {
    return String(text || '').toLowerCase().indexOf(kw) >= 0;
  }

  var Quiz = {
    defaultFilter: defaultFilter,

    /** 按筛选条件挑出题目（不排序） */
    select: function (f) {
      var all = QBANK.all();
      var kw = (f.keyword || '').trim().toLowerCase();
      var out = [];

      for (var i = 0; i < all.length; i++) {
        var q = all[i];

        if (f.cats.length && f.cats.indexOf(q.cat) < 0) continue;
        if (f.levels.indexOf(q.level) < 0) continue;
        if (f.types.indexOf(q.type) < 0) continue;

        if (f.scopes.indexOf('resume') >= 0 && !q.resume) continue;
        if (f.scopes.indexOf('fav') >= 0 && !Store.isFav(q.id)) continue;
        if (f.scopes.indexOf('wrong') >= 0 && !Store.isWrong(q.id)) continue;
        if (f.scopes.indexOf('unmastered') >= 0 && Scheduler.isMastered(q.id)) continue;

        if (kw) {
          var tagStr = q.tags.join(' ');
          if (!hit(q.q, kw) && !hit(q.a, kw) && !hit(tagStr, kw) &&
              !hit((q.options || []).join(' '), kw) && !hit(q.id, kw)) continue;
        }
        out.push(q);
      }
      return out;
    },

    /** 用筛选条件组卷并重置进度指针。saveFilter 为 false 时不更新当前活跃的筛选规则 */
    build: function (f, saveFilter) {
      if (saveFilter !== false) filter = f;
      deck = Scheduler.order(Quiz.select(f), f.mode);
      pos = 0;
      return deck.length;
    },

    filter: function () { return filter || (filter = defaultFilter()); },
    deck: function () { return deck; },
    size: function () { return deck.length; },
    pos: function () { return pos; },
    current: function () { return deck[pos] || null; },
    isLast: function () { return pos >= deck.length - 1; },

    next: function () {
      if (pos < deck.length - 1) { pos++; return true; }
      pos = deck.length; // 越界 = 完成
      return false;
    },
    prev: function () {
      if (pos > 0) { pos--; return true; }
      return false;
    },
    goto: function (i) { if (i >= 0 && i < deck.length) pos = i; },
    finished: function () { return deck.length > 0 && pos >= deck.length; },
    restart: function () { pos = 0; },

    /**
     * 判定客观题。picked 为选项下标数组（判断题用 [0]=对 / [1]=错）。
     * 返回 { correct, right:[下标...] }
     */
    judge: function (q, picked) {
      var right;
      if (q.type === 'bool') {
        right = [q.answer ? 0 : 1];
      } else {
        right = q.answer.slice();
      }
      var a = picked.slice().sort().join(',');
      var b = right.slice().sort().join(',');
      return { correct: a === b, right: right };
    },

    /** 记录一次作答并推进 Leitner 盒 */
    answer: function (q, grade) { return Store.record(q.id, grade); }
  };

  global.Quiz = Quiz;
})(window);
