use crate::catalog::Catalog;
use crate::models::Mode;
use crate::models::{Answer, Grade, QType, Verdict};
use crate::models::{Deck, Filter, Progress, Question, Scope, UserState};
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
                        Scope::Wrong => p.wrong > 0,
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
        self.save_deck();
        self.pool.len()
    }

    /// 测试与持久化用：当前卷的 id 列表
    pub fn pool_ids(&self) -> Vec<String> {
        self.pool
            .iter()
            .filter_map(|&i| self.catalog.get(i).map(|q| q.id.clone()))
            .collect()
    }

    pub fn size(&self) -> usize { self.pool.len() }

    /// 当前题在卷中的下标；等于卷长度表示已完成。
    pub fn position(&self) -> usize { self.pos }

    pub fn is_finished(&self) -> bool { self.pos >= self.pool.len() }

    pub fn current(&self) -> Option<&Question> {
        self.pool.get(self.pos).and_then(|&i| self.catalog.get(i))
    }

    pub fn advance(&mut self) {
        if self.pos < self.pool.len() {
            self.pos += 1;
            self.save_deck();
        }
    }

    pub fn back(&mut self) -> bool {
        if self.pos == 0 {
            return false;
        }
        self.pos -= 1;
        self.save_deck();
        true
    }

    pub fn goto(&mut self, pos: usize) {
        self.pos = pos.min(self.pool.len());
        self.save_deck();
    }
}

impl Scheduler {
    /// 把当前卷写进 state，供 TS 落盘。每次组卷/前进/后退后调用。
    pub fn save_deck(&mut self) {
        if self.pool.is_empty() {
            self.state.deck = None;
            return;
        }
        self.state.deck = Some(Deck {
            ids: self.pool_ids(),
            pos: self.pos,
            filter: self.filter.clone(),
            seed: self.filter.seed.unwrap_or(0),
            bank_hash: self.catalog.bank_hash(),
        });
    }

    /// 恢复上次未刷完的卷。题库变过或卷里有已删除的题则返回 false。
    pub fn restore_deck(&mut self) -> bool {
        let deck = match self.state.deck.clone() {
            Some(d) => d,
            None => return false,
        };
        if deck.bank_hash != self.catalog.bank_hash() {
            self.state.deck = None;
            return false;
        }
        let mut pool = Vec::with_capacity(deck.ids.len());
        for id in &deck.ids {
            match self.catalog.index_of(id) {
                Some(i) => pool.push(i),
                None => {
                    // 静默跳过会让 pos 指向别的题，宁可整卷作废
                    self.state.deck = None;
                    return false;
                }
            }
        }
        self.pos = deck.pos.min(pool.len());
        self.pool = pool;
        self.filter = deck.filter;
        true
    }
}

impl Scheduler {
    pub fn judge(&self, id: &str, picked: &[usize]) -> Verdict {
        let mut sorted: Vec<usize> = picked.to_vec();
        sorted.sort_unstable();
        sorted.dedup();

        let q = match self.catalog.index_of(id).and_then(|i| self.catalog.get(i)) {
            Some(q) => q,
            None => return Verdict { correct: false, expected: vec![], picked: sorted },
        };

        match (&q.qtype, &q.answer) {
            (QType::Single | QType::Multi, Answer::Indices(exp)) => {
                let mut e = exp.clone();
                e.sort_unstable();
                Verdict { correct: e == sorted, expected: e, picked: sorted }
            }
            (QType::Bool, Answer::Bool(b)) => {
                // 判断题用 picked[0]：0 = 错, 1 = 对
                let want = if *b { 1usize } else { 0usize };
                let got = sorted.first().copied();
                Verdict { correct: got == Some(want), expected: vec![want], picked: sorted }
            }
            // 简答题无客观对错，由用户点评分按钮自评
            (QType::Qa, _) => Verdict { correct: true, expected: vec![], picked: sorted },
            _ => Verdict { correct: false, expected: vec![], picked: sorted },
        }
    }
}

impl Scheduler {
    pub fn record(&mut self, id: &str, grade: Grade) {
        let day = today_key();
        let now = now_ms();

        let p = self.state.q.entry(id.to_string()).or_default();
        p.seen += 1;
        p.last = now;
        match grade {
            Grade::Know => {
                p.right += 1;
                p.bx = (p.bx + 1).min(3);
            }
            // 保底 1 盒但不降级 —— 与 v1 一致，保住 fuzzy 这一档粒度
            Grade::Fuzzy => {
                p.bx = p.bx.max(1);
            }
            Grade::No => {
                p.wrong += 1;
                p.bx = 1;
            }
        }

        *self.state.days.entry(day.clone()).or_insert(0) += 1;

        if matches!(grade, Grade::No) {
            let list = self.state.wrong_today.entry(day).or_default();
            if !list.iter().any(|x| x == id) {
                list.push(id.to_string());
            }
        }
    }

    pub fn toggle_fav(&mut self, id: &str) -> bool {
        let p = self.state.q.entry(id.to_string()).or_default();
        p.fav = !p.fav;
        p.fav
    }

    /// [未练, 生, 熟, 已掌握]
    pub fn distribution(&self, pool: &[usize]) -> [usize; 4] {
        let mut d = [0usize; 4];
        for &i in pool {
            if let Some(q) = self.catalog.get(i) {
                let bx = self.progress_of(&q.id).bx.min(3) as usize;
                d[bx] += 1;
            }
        }
        d
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

    #[test]
    fn navigation_walks_pool_and_stops_at_end() {
        let mut s = fixture();
        s.build(&Filter { mode: Mode::Ordered, ..Default::default() });
        assert_eq!(s.current().unwrap().id, "c-1");
        s.advance();
        assert_eq!(s.current().unwrap().id, "c-2");
        assert_eq!(s.position(), 1);
        s.advance(); s.advance();
        assert_eq!(s.current().unwrap().id, "os-2");
        s.advance();
        assert!(s.is_finished(), "走完 4 题应进入完成态");
        assert!(s.current().is_none());
        s.advance(); // 已完成再前进不该越界
        assert_eq!(s.position(), 4);
    }

    #[test]
    fn back_returns_false_at_first_question() {
        let mut s = fixture();
        s.build(&Filter { mode: Mode::Ordered, ..Default::default() });
        assert!(!s.back(), "首题回退应返回 false");
        s.advance();
        assert!(s.back());
        assert_eq!(s.current().unwrap().id, "c-1");
    }

    #[test]
    fn goto_clamps_out_of_range() {
        let mut s = fixture();
        s.build(&Filter::default());
        s.goto(999);
        assert_eq!(s.position(), 4, "越界 goto 应夹到完成态而不是 panic");
        s.goto(2);
        assert_eq!(s.position(), 2);
    }

    #[test]
    fn empty_pool_reports_finished_without_panic() {
        let mut s = fixture();
        assert_eq!(s.build(&Filter { cats: vec!["nope".into()], ..Default::default() }), 0);
        assert!(s.is_finished());
        assert!(s.current().is_none());
        assert!(!s.back());
    }

    #[test]
    fn restore_deck_resumes_exact_position() {
        let mut s = fixture();
        s.build(&Filter { mode: Mode::Random, seed: Some(7), ..Default::default() });
        s.advance();
        s.advance();
        let expected_ids = s.pool_ids();
        let json = serde_json::to_string(s.state()).unwrap();

        // 模拟「关掉再打开」
        let restored: UserState = serde_json::from_str(&json).unwrap();
        let mut s2 = Scheduler::new(fixture_catalog(), restored);
        assert!(s2.restore_deck(), "题库未变，应恢复成功");
        assert_eq!(s2.position(), 2, "应停在关掉时那一题");
        assert_eq!(s2.pool_ids(), expected_ids, "卷的顺序必须一模一样");
    }

    #[test]
    fn restore_deck_rejects_deck_from_changed_bank() {
        let mut s = fixture();
        s.build(&Filter::default());
        s.advance();
        let json = serde_json::to_string(s.state()).unwrap();

        // 题库变了：多一道题
        let mut all: Vec<Question> = fixture_catalog().all().to_vec();
        all.push(mk("os-3", "os", 1, QType::Qa, false));
        let bigger = Catalog::new(all, vec![cat("c-lang"), cat("os")]);

        let restored: UserState = serde_json::from_str(&json).unwrap();
        let mut s2 = Scheduler::new(bigger, restored);
        assert!(!s2.restore_deck(), "题库变了应拒绝旧卷");
    }

    #[test]
    fn restore_deck_returns_false_when_no_deck_saved() {
        let mut s = fixture();
        assert!(!s.restore_deck());
    }

    #[test]
    fn restore_deck_drops_ids_no_longer_in_bank() {
        // 卷里有已删除的题：整卷作废，不能静默跳过导致 pos 错位
        let mut st = UserState::default();
        st.deck = Some(Deck {
            ids: vec!["c-1".into(), "deleted-1".into(), "os-1".into()],
            pos: 1,
            filter: Filter::default(),
            seed: 0,
            bank_hash: fixture_catalog().bank_hash(),
        });
        let mut s = Scheduler::new(fixture_catalog(), st);
        assert!(!s.restore_deck(), "卷里含不存在的 id，应作废");
    }

    #[test]
    fn judge_single_choice() {
        let s = fixture(); // c-1 是 single，答案 [0]
        let v = s.judge("c-1", &[0]);
        assert!(v.correct);
        assert_eq!(v.expected, vec![0]);
        assert!(!s.judge("c-1", &[1]).correct);
    }

    #[test]
    fn judge_multi_choice_ignores_pick_order() {
        let mut all: Vec<Question> = fixture_catalog().all().to_vec();
        all.push(Question {
            id: "m-1".into(), cat: "os".into(), q: "多选".into(), a: "答".into(),
            qtype: QType::Multi, options: vec!["A".into(), "B".into(), "C".into()],
            answer: Answer::Indices(vec![0, 2]), level: 1, tags: vec![],
            resume: false, followup: vec![],
        });
        let s = Scheduler::new(Catalog::new(all, vec![cat("c-lang"), cat("os")]), UserState::default());
        assert!(s.judge("m-1", &[2, 0]).correct, "选项顺序不影响判定");
        assert!(!s.judge("m-1", &[0]).correct, "少选算错");
        assert!(!s.judge("m-1", &[0, 1, 2]).correct, "多选算错");
    }

    #[test]
    fn judge_qa_is_always_correct() {
        let s = fixture(); // os-1 是 qa
        assert!(s.judge("os-1", &[]).correct, "简答题没有客观对错，交给用户自评");
    }

    #[test]
    fn judge_unknown_id_is_not_correct() {
        let s = fixture();
        assert!(!s.judge("missing", &[0]).correct);
    }

    #[test]
    fn record_know_promotes_box_capped_at_three() {
        let mut s = fixture();
        for expected in [1u8, 2, 3, 3] {
            s.record("c-1", Grade::Know);
            assert_eq!(s.state().q.get("c-1").unwrap().bx, expected);
        }
        let p = s.state().q.get("c-1").unwrap();
        assert_eq!(p.right, 4);
        assert_eq!(p.wrong, 0);
        assert_eq!(p.seen, 4);
        assert!(p.last > 0, "last 应写入时间戳");
    }

    #[test]
    fn record_fuzzy_floors_at_one_without_demoting() {
        let mut s = fixture();
        s.record("c-1", Grade::Fuzzy);
        assert_eq!(s.state().q.get("c-1").unwrap().bx, 1, "0 盒提到 1 盒");

        s.record("c-2", Grade::Know);
        s.record("c-2", Grade::Know); // c-2 到 2 盒
        s.record("c-2", Grade::Fuzzy);
        let p = s.state().q.get("c-2").unwrap();
        assert_eq!(p.bx, 2, "fuzzy 不降级（与 v1 行为一致，不是降回 1 盒）");
        assert_eq!(p.wrong, 0, "fuzzy 不计 wrong");
    }

    #[test]
    fn record_no_resets_box_and_marks_wrong_today() {
        let mut s = fixture();
        s.record("c-1", Grade::Know);
        s.record("c-1", Grade::Know); // 到 2 盒
        s.record("c-1", Grade::No);
        let p = s.state().q.get("c-1").unwrap();
        assert_eq!(p.bx, 1, "答错回 1 盒");
        assert_eq!(p.wrong, 1);
        let wrong = s.state().wrong_today.get(&today_key()).unwrap();
        assert!(wrong.contains(&"c-1".to_string()), "应进今日错题本");
    }

    #[test]
    fn record_bumps_daily_count_and_dedupes_wrong_list() {
        let mut s = fixture();
        s.record("c-1", Grade::No);
        s.record("c-1", Grade::No);
        assert_eq!(*s.state().days.get(&today_key()).unwrap(), 2, "每次作答都计入当日题量");
        assert_eq!(s.state().wrong_today.get(&today_key()).unwrap().len(), 1, "错题本按 id 去重");
    }

    #[test]
    fn toggle_fav_flips_and_reports() {
        let mut s = fixture();
        assert!(s.toggle_fav("c-1"));
        assert!(s.state().q.get("c-1").unwrap().fav);
        assert!(!s.toggle_fav("c-1"));
    }

    #[test]
    fn distribution_counts_each_box() {
        let mut st = UserState::default();
        st.q.insert("c-1".into(), Progress { bx: 3, ..Default::default() });
        st.q.insert("c-2".into(), Progress { bx: 1, ..Default::default() });
        st.q.insert("os-1".into(), Progress { bx: 1, ..Default::default() });
        let s = Scheduler::new(fixture_catalog(), st);
        let pool = s.select(&Filter::default());
        assert_eq!(s.distribution(&pool), [1, 2, 0, 1], "[未练, 生, 熟, 已掌握]");
    }
}
