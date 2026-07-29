use crate::catalog::Catalog;
use crate::models::{Filter, Progress, QType, Scope, UserState};

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
}
