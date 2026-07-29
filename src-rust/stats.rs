use crate::catalog::Catalog;
use crate::models::UserState;
use crate::scheduler::today_key;
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct OverallStats {
    pub total: usize,
    pub seen: usize,
    pub mastered: usize,
    pub accuracy: f64,
    pub today: u32,
    pub streak: u32,
    pub boxes: [usize; 4],
}

pub fn overall(state: &UserState, catalog: &Catalog) -> OverallStats {
    let mut boxes = [0usize; 4];
    let (mut seen, mut right, mut wrong) = (0usize, 0u32, 0u32);

    for q in catalog.all() {
        let p = state.q.get(&q.id);
        let bx = p.map(|p| p.bx.min(3)).unwrap_or(0) as usize;
        boxes[bx] += 1;
        if let Some(p) = p {
            if p.seen > 0 {
                seen += 1;
            }
            right += p.right;
            wrong += p.wrong;
        }
    }

    let answered = right + wrong;
    OverallStats {
        total: catalog.len(),
        seen,
        mastered: boxes[3],
        accuracy: if answered == 0 { 0.0 } else { right as f64 / answered as f64 },
        today: state.days.get(&today_key()).copied().unwrap_or(0),
        streak: streak(state),
        boxes,
    }
}

/// 连续打卡天数（含今天；今天没刷则从昨天往前数），与 legacy/js/store.js:122 行为一致
fn streak(state: &UserState) -> u32 {
    let mut n = 0u32;
    let mut offset: i64 = if state.days.contains_key(&today_key()) { 0 } else { 1 };
    for _ in 0..400 {
        let key = day_key_offset(offset);
        if !state.days.contains_key(&key) {
            break;
        }
        n += 1;
        offset += 1;
    }
    n
}

/// 今天往前数 offset 天的 "YYYY-MM-DD"
fn day_key_offset(offset: i64) -> String {
    #[cfg(all(target_arch = "wasm32", not(test)))]
    {
        let d = js_sys::Date::new_0();
        d.set_date(d.get_date() - offset as u32);
        return format!("{:04}-{:02}-{:02}", d.get_full_year(), d.get_month() + 1, d.get_date());
    }
    #[cfg(not(all(target_arch = "wasm32", not(test))))]
    {
        let ms = crate::scheduler::now_ms() as i64 - offset * 86_400_000;
        crate::scheduler::ymd_from_ms(ms.max(0) as u64)
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct CategoryStats {
    pub id: String,
    pub name: String,
    pub total: usize,
    pub mastered: usize,
    pub seen: usize,
    pub accuracy: f64,
}

pub fn by_category(state: &UserState, catalog: &Catalog) -> Vec<CategoryStats> {
    catalog
        .cats()
        .iter()
        .map(|c| {
            let idxs = catalog.by_cat(&c.id);
            let (mut mastered, mut seen, mut right, mut wrong) = (0usize, 0usize, 0u32, 0u32);
            for &i in idxs {
                if let Some(q) = catalog.get(i) {
                    if let Some(p) = state.q.get(&q.id) {
                        if p.bx >= 3 {
                            mastered += 1;
                        }
                        if p.seen > 0 {
                            seen += 1;
                        }
                        right += p.right;
                        wrong += p.wrong;
                    }
                }
            }
            let answered = right + wrong;
            CategoryStats {
                id: c.id.clone(),
                name: c.name.clone(),
                total: idxs.len(),
                mastered,
                seen,
                accuracy: if answered == 0 { 0.0 } else { right as f64 / answered as f64 },
            }
        })
        .collect()
}

/// 掌握率最低的 n 个分类。同率按 id 兜底，保证榜单稳定。
pub fn weakest(state: &UserState, catalog: &Catalog, n: usize) -> Vec<CategoryStats> {
    let mut v: Vec<CategoryStats> =
        by_category(state, catalog).into_iter().filter(|c| c.total > 0).collect();
    v.sort_by(|a, b| {
        let ra = a.mastered as f64 / a.total as f64;
        let rb = b.mastered as f64 / b.total as f64;
        ra.partial_cmp(&rb).unwrap_or(std::cmp::Ordering::Equal).then_with(|| a.id.cmp(&b.id))
    });
    v.truncate(n);
    v
}

#[derive(Serialize, Clone, Debug)]
pub struct HeatCell {
    pub date: String,
    pub count: u32,
}

/// 最近 days 天，按时间升序，最后一格是今天。没刷的日子补 0。
pub fn heatmap(state: &UserState, days: usize) -> Vec<HeatCell> {
    (0..days)
        .rev()
        .map(|back| {
            let date = day_key_offset(back as i64);
            let count = state.days.get(&date).copied().unwrap_or(0);
            HeatCell { date, count }
        })
        .collect()
}

#[derive(Serialize, Clone, Debug)]
pub struct RiskStats {
    pub total: usize,
    pub mastered: usize,
    pub weak_ids: Vec<String>,
}

/// 简历高危题的掌握情况。weak_ids 按题库顺序，未掌握的排前面由 UI 决定展示几条。
pub fn resume_risk(state: &UserState, catalog: &Catalog) -> RiskStats {
    let mut total = 0usize;
    let mut mastered = 0usize;
    let mut weak_ids = Vec::new();
    for q in catalog.all().iter().filter(|q| q.resume) {
        total += 1;
        let bx = state.q.get(&q.id).map(|p| p.bx).unwrap_or(0);
        if bx >= 3 {
            mastered += 1;
        } else {
            weak_ids.push(q.id.clone());
        }
    }
    RiskStats { total, mastered, weak_ids }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::Catalog;
    use crate::models::*;

    fn mk(id: &str, cat: &str, resume: bool) -> Question {
        Question {
            id: id.into(),
            cat: cat.into(),
            q: "题".into(),
            a: "答".into(),
            qtype: QType::Qa,
            options: vec![],
            answer: Answer::None,
            level: 1,
            tags: vec![],
            resume,
            followup: vec![],
        }
    }

    fn cat(id: &str, name: &str) -> CategoryMeta {
        CategoryMeta { id: id.into(), name: name.into(), desc: String::new() }
    }

    fn fx() -> (Catalog, UserState) {
        let c = Catalog::new(
            vec![
                mk("c-1", "c-lang", true),
                mk("c-2", "c-lang", false),
                mk("os-1", "os", false),
                mk("os-2", "os", false),
            ],
            vec![cat("c-lang", "C 语言核心"), cat("os", "操作系统原理")],
        );
        let mut st = UserState::default();
        st.q.insert(
            "c-1".into(),
            Progress { bx: 3, right: 3, wrong: 1, seen: 4, last: 1000, fav: false },
        );
        st.q.insert(
            "c-2".into(),
            Progress { bx: 1, right: 0, wrong: 2, seen: 2, last: 1000, fav: false },
        );
        st.q.insert(
            "os-1".into(),
            Progress { bx: 3, right: 1, wrong: 0, seen: 1, last: 1000, fav: false },
        );
        (c, st)
    }

    #[test]
    fn overall_counts_mastery_and_accuracy() {
        let (c, st) = fx();
        let o = overall(&st, &c);
        assert_eq!(o.total, 4);
        assert_eq!(o.seen, 3, "os-2 从未作答");
        assert_eq!(o.mastered, 2, "c-1 与 os-1 在 3 盒");
        // right=4, wrong=3 => 4/7
        assert!((o.accuracy - 4.0 / 7.0).abs() < 1e-9);
        assert_eq!(o.boxes, [1, 1, 0, 2], "[未练, 生, 熟, 已掌握]");
    }

    #[test]
    fn overall_on_empty_state_does_not_divide_by_zero() {
        let c = Catalog::new(vec![mk("a-1", "a", false)], vec![cat("a", "A")]);
        let o = overall(&UserState::default(), &c);
        assert_eq!(o.seen, 0);
        assert_eq!(o.accuracy, 0.0, "无作答时正确率为 0，不是 NaN");
    }

    #[test]
    fn by_category_follows_declaration_order() {
        let (c, st) = fx();
        let v = by_category(&st, &c);
        assert_eq!(v.iter().map(|x| x.id.as_str()).collect::<Vec<_>>(), vec!["c-lang", "os"]);
        assert_eq!(v[0].name, "C 语言核心");
        assert_eq!(v[0].total, 2);
        assert_eq!(v[0].mastered, 1);
    }

    #[test]
    fn weakest_ranks_by_mastery_rate_then_id() {
        let (c, st) = fx();
        let w = weakest(&st, &c, 2);
        // c-lang 掌握 1/2 = 0.5, os 掌握 1/2 = 0.5 => 同率按 id 兜底，保证结果稳定
        assert_eq!(w.len(), 2);
        assert_eq!(w[0].id, "c-lang");
    }

    #[test]
    fn weakest_skips_empty_categories() {
        let c =
            Catalog::new(vec![mk("a-1", "a", false)], vec![cat("a", "A"), cat("empty", "空分类")]);
        let w = weakest(&UserState::default(), &c, 5);
        assert!(w.iter().all(|x| x.id != "empty"), "没题的分类不该出现在最薄弱榜里");
    }

    #[test]
    fn heatmap_returns_requested_span_with_zeros_filled() {
        let mut st = UserState::default();
        st.days.insert(crate::scheduler::today_key(), 7);
        let h = heatmap(&st, 30);
        assert_eq!(h.len(), 30);
        assert_eq!(h.last().unwrap().count, 7, "最后一格是今天");
        assert_eq!(h.first().unwrap().count, 0, "没刷的日子补 0");
    }

    #[test]
    fn resume_risk_reports_unmastered_flagged_questions() {
        let mut st = UserState::default();
        // c-1 是 resume 题，只到 1 盒
        st.q.insert("c-1".into(), Progress { bx: 1, ..Default::default() });
        let (c, _) = fx();
        let r = resume_risk(&st, &c);
        assert_eq!(r.total, 1, "题库里只有 c-1 打了 resume 标记");
        assert_eq!(r.mastered, 0);
        assert_eq!(r.weak_ids, vec!["c-1"]);
    }
}
