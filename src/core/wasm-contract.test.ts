/**
 * 跨 wasm 边界的契约测试。
 *
 * 存在理由：`cargo test` 只跑原生 target，`tsc` 对 `-> JsValue` 的方法只看到 `any`，
 * 所以「Rust 返回的对象长什么样」这件事在两边都是盲区。
 * 一个真实事故：用 `serde_json::json!` 构造返回值时，wasm-bindgen 产出的是 JS Map
 * 而不是普通对象，`payload.total` 恒为 undefined，四道验证门全绿但界面一开就崩。
 * 这个文件加载真正编译出的 wasm，断言字段名和容器类型。
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const FILTER = JSON.stringify({
  cats: [], levels: [1, 2, 3], types: ['single', 'multi', 'bool', 'qa'],
  scopes: [], mode: 'smart', keyword: '', seed: null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any;

beforeAll(async () => {
  const mod = await import('../../pkg/embq_core.js');
  await mod.default({ module_or_path: readFileSync('./pkg/embq_core_bg.wasm') });
  engine = new mod.QuizEngine(
    readFileSync('data/questions.json', 'utf8'),
    readFileSync('data/categories.json', 'utf8'),
    undefined,
  );
});

describe('wasm 边界返回普通对象而不是 Map', () => {
  it('count() 的字段可以直接点出来', () => {
    const c = engine.count(FILTER);
    expect(c).not.toBeInstanceOf(Map);
    expect(c.total).toBe(476);
    expect(Array.isArray(c.boxes)).toBe(true);
    expect(c.boxes).toHaveLength(4);
  });

  it('stats() 用 TS 侧读取的 camelCase 键名', () => {
    const s = engine.stats();
    expect(s).not.toBeInstanceOf(Map);
    // 键名与 src/ui/stats.ts 的 StatsPayload 接口逐字对应
    expect(Object.keys(s).sort()).toEqual(
      ['byCategory', 'heatmap', 'overall', 'resumeRisk', 'weakest'],
    );
    expect(s.overall.total).toBe(476);
    expect(s.byCategory).toHaveLength(19);
    // resumeRisk 内部保持 snake_case（来自 RiskStats 的 derive）
    expect(Array.isArray(s.resumeRisk.weak_ids)).toBe(true);
  });

  it('heatmap 是 56 格（8 周），最后一格是今天', () => {
    const s = engine.stats();
    expect(s.heatmap).toHaveLength(56);
    expect(s.heatmap[55]).toHaveProperty('date');
    expect(s.heatmap[55]).toHaveProperty('count');
    // level 是给 CSS 的 data-n 用的，0~4
    expect(s.heatmap[55].level).toBeGreaterThanOrEqual(0);
    expect(s.heatmap[55].level).toBeLessThanOrEqual(4);
  });

  it('byCategory 带 dist 数组供堆叠条形图使用', () => {
    const s = engine.stats();
    const first = s.byCategory[0];
    expect(Array.isArray(first.dist)).toBe(true);
    expect(first.dist).toHaveLength(4);
    // 各盒之和应等于该分类题量
    expect(first.dist.reduce((a: number, b: number) => a + b, 0)).toBe(first.total);
  });

  it('overall 带 right/wrong 供 KPI 显示', () => {
    const o = engine.stats().overall;
    expect(typeof o.right).toBe('number');
    expect(typeof o.wrong).toBe('number');
  });

  it('current() 返回题目对象，字段名与题库一致', () => {
    engine.build(FILTER);
    const q = engine.current();
    expect(q).not.toBeInstanceOf(Map);
    expect(Object.keys(q).sort()).toEqual(
      ['a', 'answer', 'cat', 'followup', 'id', 'level', 'options', 'q', 'resume', 'tags', 'type'],
    );
  });

  it('health() 返回数组', () => {
    expect(Array.isArray(engine.health())).toBe(true);
  });

  it('cats() 返回 19 个分类，保持声明顺序', () => {
    const cats = engine.cats();
    expect(Array.isArray(cats)).toBe(true);
    expect(cats).toHaveLength(19);
    expect(cats[0].id).toBe('c-lang');
  });
});
