/* ============================================================
   scheduler.js — Leitner 三盒复习调度
   box 0 = 未练过 / box 1 生 / box 2 熟 / box 3 已掌握
   智能复习按盒号加权排序：越不熟的越靠前，同权重内随机打散。
   ============================================================ */
(function (global) {
  'use strict';

  // 权重越大越优先出现
  var WEIGHT = { 0: 100, 1: 80, 2: 30, 3: 8 };

  // 距上次练习越久，越该复习（每满 1 天 +4 分，最多 +40）
  function agingBonus(last) {
    if (!last) return 0;
    var days = (Date.now() - last) / 86400000;
    return Math.min(40, Math.floor(days) * 4);
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  var Scheduler = {
    WEIGHT: WEIGHT,

    /** 已掌握 = 进到第 3 盒 */
    isMastered: function (id) { return Store.box(id) >= 3; },

    /**
     * 按模式排序题目数组。
     * mode: 'smart' | 'ordered' | 'random'
     */
    order: function (list, mode) {
      var arr = list.slice();
      if (mode === 'random') return shuffle(arr);
      if (mode === 'ordered') {
        return arr.sort(function (a, b) {
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
      }
      // smart：加权 + 随机抖动，避免每次顺序完全一样
      var score = Object.create(null);
      for (var i = 0; i < arr.length; i++) {
        var q = arr[i];
        var r = Store.of(q.id);
        var box = r ? r.box : 0;
        var s = (WEIGHT[box] || 0) + agingBonus(r ? r.last : 0);
        if (r && r.wrong > r.right) s += 25;      // 错多于对，加急
        if (q.resume) s += 12;                     // 简历高危题略微提前
        score[q.id] = s + Math.random() * 20;
      }
      return arr.sort(function (a, b) { return score[b.id] - score[a.id]; });
    },

    /** 每盒的题目数量分布 */
    distribution: function (list) {
      var d = { 0: 0, 1: 0, 2: 0, 3: 0 };
      for (var i = 0; i < list.length; i++) d[Store.box(list[i].id)]++;
      return d;
    }
  };

  global.Scheduler = Scheduler;
})(window);
