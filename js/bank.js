/* ============================================================
   bank.js — 题库注册器与自检
   题库文件通过普通 <script> 加载（file:// 下 fetch/ESM 会被 CORS 拦），
   每个 data/*.js 末尾调用 QBANK.add([...]) 注册。
   ============================================================ */
(function (global) {
  'use strict';

  var questions = [];
  var byId = Object.create(null);
  var categories = [];
  var catById = Object.create(null);
  var problems = [];

  var TYPES = { single: 1, multi: 1, bool: 1, qa: 1 };

  function fail(id, msg) {
    problems.push((id || '<无 id>') + '：' + msg);
  }

  function validate(q) {
    if (!q || typeof q !== 'object') { fail(null, '题目不是对象'); return false; }
    if (!q.id) { fail(null, '缺少 id：' + String(q.q).slice(0, 24)); return false; }
    if (byId[q.id]) { fail(q.id, 'id 重复，后一条被丢弃'); return false; }
    if (!q.cat) { fail(q.id, '缺少 cat'); return false; }
    if (!TYPES[q.type]) { fail(q.id, '未知题型 ' + q.type); return false; }
    if (!q.q) { fail(q.id, '缺少题干'); return false; }
    if (!q.a) { fail(q.id, '缺少参考答案 a'); return false; }

    var lv = q.level || 1;
    if (lv < 1 || lv > 3) { fail(q.id, 'level 应为 1~3'); return false; }

    if (q.type === 'bool') {
      if (typeof q.answer !== 'boolean') { fail(q.id, '判断题 answer 必须是 true/false'); return false; }
    } else if (q.type === 'single' || q.type === 'multi') {
      if (!Array.isArray(q.options) || q.options.length < 2) { fail(q.id, '选择题至少要 2 个选项'); return false; }
      if (!Array.isArray(q.answer) || !q.answer.length) { fail(q.id, '选择题 answer 必须是非空数组'); return false; }
      for (var i = 0; i < q.answer.length; i++) {
        var idx = q.answer[i];
        if (typeof idx !== 'number' || idx < 0 || idx >= q.options.length) {
          fail(q.id, 'answer 索引 ' + idx + ' 越界（共 ' + q.options.length + ' 个选项）');
          return false;
        }
      }
      if (q.type === 'single' && q.answer.length !== 1) { fail(q.id, '单选题只能有 1 个正确答案'); return false; }
      if (q.type === 'multi' && q.answer.length < 2) { fail(q.id, '多选题至少 2 个正确答案，否则请用 single'); return false; }
    }
    return true;
  }

  var QBANK = {
    /** 注册一批题目 */
    add: function (list) {
      if (!Array.isArray(list)) { fail(null, 'add() 需要数组'); return; }
      for (var i = 0; i < list.length; i++) {
        var q = list[i];
        if (!validate(q)) continue;
        q.level = q.level || 1;
        q.tags = q.tags || [];
        q.followup = q.followup || [];
        q.resume = !!q.resume;
        byId[q.id] = q;
        questions.push(q);
      }
    },

    /** 注册分类元数据 */
    setCategories: function (list) {
      categories = list.slice();
      for (var i = 0; i < categories.length; i++) catById[categories[i].id] = categories[i];
    },

    all: function () { return questions; },
    get: function (id) { return byId[id] || null; },
    cats: function () { return categories; },
    cat: function (id) { return catById[id] || { id: id, name: id, group: 'other' }; },

    /** 每个分类的题量 */
    countByCat: function () {
      var m = Object.create(null);
      for (var i = 0; i < questions.length; i++) m[questions[i].cat] = (m[questions[i].cat] || 0) + 1;
      return m;
    },

    /** 自检结果：孤儿分类 + 校验错误 */
    health: function () {
      var out = problems.slice();
      var counts = QBANK.countByCat();
      for (var c in counts) {
        if (!catById[c]) out.push('分类 "' + c + '" 有 ' + counts[c] + ' 题，但未在 _meta.js 中登记');
      }
      for (var i = 0; i < categories.length; i++) {
        if (!counts[categories[i].id]) out.push('分类 "' + categories[i].id + '" 已登记但一道题都没有');
      }
      return out;
    }
  };

  global.QBANK = QBANK;
})(window);
