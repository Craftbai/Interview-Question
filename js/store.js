/* ============================================================
   store.js — localStorage 持久化
   记录每题掌握盒号、对错次数、收藏，以及每日刷题量与设置。
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'embq.v1';

  var blank = {
    version: 1,
    q: {},          // id -> { box, right, wrong, seen, last, fav }
    days: {},       // 'YYYY-MM-DD' -> 题量
    wrongToday: {}, // 'YYYY-MM-DD' -> [id,...]
    settings: { theme: 'auto', oral: false, oralSeconds: 60 }
  };

  var state = null;
  var saveTimer = null;

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(blank));
    } catch (e) {
      state = JSON.parse(JSON.stringify(blank));
    }
    // 补齐缺失字段（老数据兼容）
    if (!state.q) state.q = {};
    if (!state.days) state.days = {};
    if (!state.wrongToday) state.wrongToday = {};
    if (!state.settings) state.settings = { theme: 'auto', oral: false, oralSeconds: 60 };
    if (state.settings.oralSeconds == null) state.settings.oralSeconds = 60;
    return state;
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) { console.error('进度保存失败（localStorage 可能已满或被禁用）', e); }
    }, 120);
  }

  function rec(id) {
    if (!state.q[id]) state.q[id] = { box: 0, right: 0, wrong: 0, seen: 0, last: 0, fav: false };
    return state.q[id];
  }

  function bumpDay() {
    var t = today();
    state.days[t] = (state.days[t] || 0) + 1;
  }

  function markWrong(id) {
    var t = today();
    if (!state.wrongToday[t]) state.wrongToday[t] = [];
    if (state.wrongToday[t].indexOf(id) < 0) state.wrongToday[t].push(id);
  }

  var Store = {
    /* --- 生命周期 --- */
    init: function () { load(); return Store; },
    raw: function () { return state; },
    save: save,

    /* --- 单题状态 --- */
    of: function (id) { return state.q[id] || null; },
    box: function (id) { return state.q[id] ? state.q[id].box : 0; },
    isFav: function (id) { return !!(state.q[id] && state.q[id].fav); },
    isWrong: function (id) { return !!(state.q[id] && state.q[id].wrong > 0); },
    isSeen: function (id) { return !!(state.q[id] && state.q[id].seen > 0); },

    toggleFav: function (id) {
      var r = rec(id);
      r.fav = !r.fav;
      save();
      return r.fav;
    },

    /**
     * 记录一次作答。
     * grade: 'know'（答对/会了） | 'fuzzy'（模糊） | 'no'（答错/不会）
     * box 0 = 未练过；1/2/3 为三个 Leitner 盒，3 视为已掌握。
     */
    record: function (id, grade) {
      var r = rec(id);
      r.seen++;
      r.last = Date.now();
      if (grade === 'know') {
        r.right++;
        r.box = Math.min(3, (r.box || 0) + 1);
      } else if (grade === 'fuzzy') {
        r.box = Math.max(1, r.box || 0);
      } else {
        r.wrong++;
        r.box = 1;
        markWrong(id);
      }
      bumpDay();
      save();
      return r;
    },

    /* --- 每日 --- */
    today: today,
    todayCount: function () { return state.days[today()] || 0; },
    days: function () { return state.days; },
    wrongTodayIds: function () { return (state.wrongToday[today()] || []).slice(); },

    /** 连续打卡天数（含今天；今天没刷则从昨天往前数） */
    streak: function () {
      var d = new Date(), n = 0;
      if (!state.days[today()]) d.setDate(d.getDate() - 1);
      for (var i = 0; i < 400; i++) {
        var k = d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0');
        if (!state.days[k]) break;
        n++;
        d.setDate(d.getDate() - 1);
      }
      return n;
    },

    /* --- 设置 --- */
    get: function (k) { return state.settings[k]; },
    set: function (k, v) { state.settings[k] = v; save(); },

    /* --- 数据导入导出 --- */
    exportJSON: function () { return JSON.stringify(state, null, 2); },

    importJSON: function (text) {
      var data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.q) throw new Error('不是本应用导出的进度文件');
      state = data;
      if (!state.q) state.q = {};
      if (!state.days) state.days = {};
      if (!state.wrongToday) state.wrongToday = {};
      if (!state.settings) state.settings = { theme: 'auto', oral: false, oralSeconds: 60 };
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    },

    reset: function () {
      state = JSON.parse(JSON.stringify(blank));
      localStorage.setItem(KEY, JSON.stringify(state));
    }
  };

  global.Store = Store;
})(window);
