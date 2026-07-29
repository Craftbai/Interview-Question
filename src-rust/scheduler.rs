use crate::catalog::Catalog;
use crate::models::Mode;
use crate::models::{Filter, Progress, QType, Scope, UserState};
use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::SeedableRng;

#[cfg(all(target_arch = "wasm32", not(test)))]
pub fn now_ms() -> u64 {
    js_sys::Date::now() as u64
}

#[cfg(not(all(target_arch = "wasm32", not(test))))]
pub fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// "YYYY-MM-DD"（本地时区），与现有存档的 days / wrongToday key 格式一致
pub fn today_key() -> String {
    #[cfg(all(target_arch = "wasm32", not(test)))]
    {
        let d = js_sys::Date::new_0();
        return format!("{:04}-{:02}-{:02}", d.get_full_year(), d.get_month() + 1, d.get_date());
    }
    #[cfg(not(all(target_arch = "wasm32", not(test))))]
    {
        ymd_from_ms(now_ms())
    }
}

/// 把 Unix 毫秒换算成 YYYY-MM-DD（UTC）。只在非 wasm 下使用。
#[cfg(not(all(target_arch = "wasm32", not(test))))]
pub fn ymd_from_ms(ms: u64) -> String {
    let days = (ms / 86_400_000) as i64;
    let (mut y, mut d) = (1970i64, days);
    loop {
        let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
        let len = if leap { 366 } else { 365 };
        if d < len { break; }
        d -= len;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let months = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0usize;
    while d >= months[m] { d -= months[m]; m += 1; }
    format!("{:04}-{:02}-{:02}", y, m + 1, d + 1)
}

pub struct Scheduler {
    catalog: Catalog,
    state: UserState,
    filter: Filter,
    pool: Vec<usize>,
    pos: usize,
}

impl Scheduler {
    pub fn new(catalog: Catalog, state: UserState) -> Self {
        Scheduler { catalog, state, filter: Filter::default(), pool: Vec::new(), pos: 0 }
    }

    pub fn catalog(&self) -> &Catalog { &self.catalog }
    pub fn state(&self) -> &UserState { &self.state }
    pub fn state_mut(&mut self) -> &mut UserState { &mut self.state }
    pub fn filter(&self) -> &Filter { &self.filter }

    fn progress_of(&self, id: &str) -> Progress {
        self.state.q.get(id).cloned().unwrap_or_default()
    }

    /// 按 filter 挑出命中的下标，保持题库原始顺序。维度间 AND，维度内 OR。
    pub fn select(&self, f: &Filter) -> Vec<usize> {
        let kw = f.keyword.trim().to_lowercase();
        let wrong_ids = self.wrong_today_ids();

        (0..self.catalog.len())
            .filter(|&i| {
                let q = match self.catalog.get(i) {
                    Some(q) => q,
                    None => return false,
                };
                if !f.cats.is_empty() && !f.cats.iter().any(|c| c == &q.cat) { return false; }
                if !f.levels.is_empty() && !f.levels.contains(&q.level) { return false; }
                if !f.types.is_empty() && !f.types.contains(&q.qtype) { return false; }
                if !kw.is_empty() {
                    let hay = format!("{} {} {}", q.q, q.a, q.tags.join(" ")).to_lowercase();
                    if !hay.contains(&kw) { return false; }
                }
                if !f.scopes.is_empty() {
                    let p = self.progress_of(&q.id);
                    let hit = f.scopes.iter().any(|s| match s {
                        Scope::Fav => p.fav,
                        Scope::Unmastered => p.bx < 3,
                        Scope::ResumeRisk => q.resume,
                        Scope::Wrong => wrong_ids.iter().any(|w| w == &q.id),
                    });
                    if !hit { return false; }
                }
                true
            })
            .collect()
    }

    fn wrong_today_ids(&self) -> Vec<String> {
        self.state
            .wrong_today
            .get(&today_key())
            .cloned()
            .unwrap_or_default()
    }

    /// 排序键必须是全序，否则每次组卷顺序会变 —— 这是 v1 的核心 bug。
    fn order(&self, pool: &mut Vec<usize>, f: &Filter) {
        match f.mode {
            // select 已按原始下标升序产出，无需再排
            Mode::Ordered => {}
            Mode::Smart => {
                pool.sort_by(|&a, &b| self.smart_key(a).cmp(&self.smart_key(b)));
            }
            Mode::Random => {
                let seed = f.seed.unwrap_or(0);
                let mut rng = StdRng::seed_from_u64(seed);
                pool.shuffle(&mut rng);
            }
        }
    }

    /// (盒号, 紧急度, 上次作答时间, id) —— 全序、无随机、可复现。
    /// urgency: 0 = 加急（错多于对，或简历高危题），1 = 普通。
    fn smart_key(&self, idx: usize) -> (u8, u8, u64, String) {
        let q = match self.catalog.get(idx) {
            Some(q) => q,
            None => return (u8::MAX, 1, u64::MAX, String::new()),
        };
        let p = self.progress_of(&q.id);
        let urgent = p.wrong > p.right || q.resume;
        (p.bx, if urgent { 0 } else { 1 }, p.last, q.id.clone())
    }

    /// 组卷：筛选 + 排序，重置到第一题。返回题数，0 表示无命中。
    pub fn build(&mut self, f: &Filter) -> usize {
        let mut pool = self.select(f);
        self.order(&mut pool, f);
        self.pool = pool;
        self.pos = 0;
        self.filter = f.clone();
        self.pool.len()
    }

    /// 测试与持久化用：当前卷的 id 列表
    pub fn pool_ids(&self) -> Vec<String> {
        self.pool
            .iter()
            .filter_map(|&i| self.catalog.get(i).map(|q| q.id.clone()))
            .collect()
    }

    /// 当前题在卷中的下标；等于卷长度表示已完成。
    pub fn position(&self) -> usize {
        self.pos
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;

    fn mk(id: &str, cat: &str, level: u8, qtype: QType, resume: bool) -> Question {
        Question {
            id: id.into(), cat: cat.into(), q: format!("题干 {id}"), a: "答案".into(),
            qtype, options: vec!["A".into(), "B".into()],
            answer: if matches!(qtype, QType::Single) { Answer::Indices(vec![0]) } else { Answer::None },
            level, tags: vec![], resume, followup: vec![],
        }
    }

    fn cat(id: &str) -> CategoryMeta {
        CategoryMeta { id: id.into(), name: id.into(), desc: String::new() }
    }

    /// 4 题：c-1(c,L1,single) c-2(c,L2,qa,resume) os-1(os,L1,qa) os-2(os,L3,single)
    fn fixture_catalog() -> Catalog {
        Catalog::new(
            vec![
                mk("c-1", "c-lang", 1, QType::Single, false),
                mk("c-2", "c-lang", 2, QType::Qa, true),
                mk("os-1", "os", 1, QType::Qa, false),
                mk("os-2", "os", 3, QType::Single, false),
            ],
            vec![cat("c-lang"), cat("os")],
        )
    }

    fn fixture() -> Scheduler {
        Scheduler::new(fixture_catalog(), UserState::default())
    }

    fn ids(s: &Scheduler, picked: &[usize]) -> Vec<String> {
        picked.iter().map(|&i| s.catalog().get(i).unwrap().id.clone()).collect()
    }

    #[test]
    fn empty_filter_selects_everything() {
        let s = fixture();
        assert_eq!(s.select(&Filter::default()).len(), 4);
    }

    #[test]
    fn filters_by_category() {
        let s = fixture();
        let f = Filter { cats: vec!["c-lang".into()], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1", "c-2"]);
    }

    #[test]
    fn filters_by_level_as_or_within_dimension() {
        let s = fixture();
        let f = Filter { levels: vec![1, 3], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1", "os-1", "os-2"]);
    }

    #[test]
    fn filters_by_type() {
        let s = fixture();
        let f = Filter { types: vec![QType::Single], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1", "os-2"]);
    }

    #[test]
    fn dimensions_combine_as_and() {
        let s = fixture();
        let f = Filter {
            cats: vec!["c-lang".into()],
            levels: vec![1],
            ..Default::default()
        };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-1"]);
    }

    #[test]
    fn keyword_matches_question_and_answer_case_insensitively() {
        let s = fixture();
        let f = Filter { keyword: "题干 OS-1".into(), ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["os-1"]);
    }

    #[test]
    fn scope_fav_selects_only_favourites() {
        let mut st = UserState::default();
        st.q.insert("os-2".into(), Progress { fav: true, ..Default::default() });
        let s = Scheduler::new(fixture_catalog(), st);
        let f = Filter { scopes: vec![Scope::Fav], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["os-2"]);
    }

    #[test]
    fn scope_unmastered_excludes_box3() {
        let mut st = UserState::default();
        st.q.insert("c-1".into(), Progress { bx: 3, ..Default::default() });
        let s = Scheduler::new(fixture_catalog(), st);
        let f = Filter { scopes: vec![Scope::Unmastered], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-2", "os-1", "os-2"]);
    }

    #[test]
    fn scope_resume_risk_selects_flagged() {
        let s = fixture();
        let f = Filter { scopes: vec![Scope::ResumeRisk], ..Default::default() };
        assert_eq!(ids(&s, &s.select(&f)), vec!["c-2"]);
    }

    #[test]
    fn no_match_returns_empty_without_panic() {
        let s = fixture();
        let f = Filter { cats: vec!["nope".into()], ..Default::default() };
        assert!(s.select(&f).is_empty());
    }

    #[test]
    fn ordered_mode_follows_bank_declaration_order() {
        let mut s = fixture();
        let f = Filter { mode: Mode::Ordered, ..Default::default() };
        s.build(&f);
        assert_eq!(s.pool_ids(), vec!["c-1", "c-2", "os-1", "os-2"]);
    }

    #[test]
    fn ordered_mode_is_reproducible() {
        let f = Filter { mode: Mode::Ordered, ..Default::default() };
        let mut a = fixture(); a.build(&f);
        let mut b = fixture(); b.build(&f);
        assert_eq!(a.pool_ids(), b.pool_ids());
    }

    #[test]
    fn smart_mode_puts_lower_box_first() {
        let mut st = UserState::default();
        st.q.insert("c-1".into(), Progress { bx: 3, last: 1000, ..Default::default() });
        st.q.insert("c-2".into(), Progress { bx: 2, last: 1000, ..Default::default() });
        st.q.insert("os-1".into(), Progress { bx: 1, last: 1000, ..Default::default() });
        // os-2 无记录 => bx 0
        let mut s = Scheduler::new(fixture_catalog(), st);
        s.build(&Filter { mode: Mode::Smart, ..Default::default() });
        assert_eq!(s.pool_ids(), vec!["os-2", "os-1", "c-2", "c-1"]);
    }

    #[test]
    fn smart_mode_breaks_box_ties_by_last_then_id() {
        let mut st = UserState::default();
        // 同盒、同紧急度、同时间 => 只能靠 id 兜底，保证全序。
        // 注意 c-2 在 fixture 里是 resume 高危题（urgency 恒为 0），
        // 所以这里让四题都 wrong > right，把 urgency 位拉平，才真正测到 id 兜底。
        for id in ["c-1", "c-2", "os-1", "os-2"] {
            st.q.insert(id.into(), Progress { bx: 1, right: 0, wrong: 1, last: 500, ..Default::default() });
        }
        let mut s = Scheduler::new(fixture_catalog(), st);
        s.build(&Filter { mode: Mode::Smart, ..Default::default() });
        assert_eq!(s.pool_ids(), vec!["c-1", "c-2", "os-1", "os-2"], "同键时按 id 字典序");
    }

    #[test]
    fn smart_mode_is_reproducible_across_rebuilds() {
        let mut st = UserState::default();
        st.q.insert("c-1".into(), Progress { bx: 1, right: 1, wrong: 4, last: 900, ..Default::default() });
        st.q.insert("os-1".into(), Progress { bx: 1, right: 5, wrong: 0, last: 900, ..Default::default() });
        let f = Filter { mode: Mode::Smart, ..Default::default() };
        let mut a = Scheduler::new(fixture_catalog(), st.clone()); a.build(&f);
        let mut b = Scheduler::new(fixture_catalog(), st.clone()); b.build(&f);
        assert_eq!(a.pool_ids(), b.pool_ids(), "Smart 必须无随机、可复现");
        // 错多于对的排在同盒里更前面
        let ids = a.pool_ids();
        let pc = ids.iter().position(|x| x == "c-1").unwrap();
        let po = ids.iter().position(|x| x == "os-1").unwrap();
        assert!(pc < po, "错多于对的题应加急");
    }

    #[test]
    fn random_mode_same_seed_same_order() {
        let f = Filter { mode: Mode::Random, seed: Some(42), ..Default::default() };
        let mut a = fixture(); a.build(&f);
        let mut b = fixture(); b.build(&f);
        assert_eq!(a.pool_ids(), b.pool_ids(), "同 seed 必须同顺序");
    }

    #[test]
    fn random_mode_different_seed_usually_differs() {
        let mut a = fixture();
        a.build(&Filter { mode: Mode::Random, seed: Some(1), ..Default::default() });
        let mut b = fixture();
        b.build(&Filter { mode: Mode::Random, seed: Some(999), ..Default::default() });
        assert_ne!(a.pool_ids(), b.pool_ids());
    }

    #[test]
    fn random_mode_without_seed_still_deterministic() {
        // seed 缺失时回退到固定值，绝不能读系统熵源
        let f = Filter { mode: Mode::Random, seed: None, ..Default::default() };
        let mut a = fixture(); a.build(&f);
        let mut b = fixture(); b.build(&f);
        assert_eq!(a.pool_ids(), b.pool_ids());
    }

    #[test]
    fn build_returns_pool_size_and_resets_position() {
        let mut s = fixture();
        assert_eq!(s.build(&Filter::default()), 4);
        assert_eq!(s.position(), 0);
    }
}
