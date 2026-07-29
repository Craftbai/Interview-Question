pub mod catalog;
pub mod models;
pub mod parser;
pub mod scheduler;
pub mod stats;

use models::{CountPayload, Filter, Grade, StatsPayload};
use scheduler::Scheduler;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct QuizEngine {
    inner: Scheduler,
    dirty: bool,
}

impl QuizEngine {
    fn parse_filter(json: &str) -> Option<Filter> {
        serde_json::from_str(json).ok()
    }

    fn parse_grade(s: &str) -> Option<Grade> {
        match s {
            "know" => Some(Grade::Know),
            "fuzzy" => Some(Grade::Fuzzy),
            "no" => Some(Grade::No),
            _ => None,
        }
    }

    /// `new` 的全部逻辑，错误用 String 表示。
    /// 单独提出来是因为 `JsError::new` 是 JS 导入函数，在原生 target 下调用会 panic，
    /// 构造失败路径没法在 `cargo test` 里断言。这里保持可测，`new` 只负责错误类型转换。
    fn try_new(
        questions_json: &str,
        categories_json: &str,
        state_json: Option<String>,
    ) -> Result<QuizEngine, String> {
        let catalog =
            parser::parse(questions_json, categories_json).map_err(|e| e.to_string())?;

        // 存档损坏时退回空状态：丢进度也比打不开应用好
        let state = state_json
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();

        Ok(QuizEngine { inner: Scheduler::new(catalog, state), dirty: false })
    }
}

#[wasm_bindgen]
impl QuizEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(
        questions_json: &str,
        categories_json: &str,
        state_json: Option<String>,
    ) -> Result<QuizEngine, JsError> {
        Self::try_new(questions_json, categories_json, state_json)
            .map_err(|e| JsError::new(&e))
    }

    /// 组卷，返回题数。filter_json 非法时返回 0。
    pub fn build(&mut self, filter_json: &str) -> usize {
        let f = match Self::parse_filter(filter_json) {
            Some(f) => f,
            None => return 0,
        };
        let n = self.inner.build(&f);
        self.dirty = true;
        n
    }

    /// 恢复上次未刷完的卷
    pub fn restore_deck(&mut self) -> bool {
        self.inner.restore_deck()
    }

    /// 筛选面板的实时计数
    pub fn count(&self, filter_json: &str) -> Result<JsValue, JsError> {
        let f = Self::parse_filter(filter_json).unwrap_or_default();
        let pool = self.inner.select(&f);
        let payload = CountPayload {
            total: pool.len(),
            boxes: self.inner.distribution(&pool),
        };
        serde_wasm_bindgen::to_value(&payload).map_err(|e| JsError::new(&e.to_string()))
    }
}

#[wasm_bindgen]
impl QuizEngine {
    pub fn current(&self) -> Result<JsValue, JsError> {
        match self.inner.current() {
            Some(q) => serde_wasm_bindgen::to_value(q).map_err(|e| JsError::new(&e.to_string())),
            None => Ok(JsValue::NULL),
        }
    }

    pub fn position(&self) -> usize { self.inner.position() }
    pub fn size(&self) -> usize { self.inner.size() }
    pub fn is_finished(&self) -> bool { self.inner.is_finished() }

    pub fn advance(&mut self) {
        self.inner.advance();
        self.dirty = true;
    }

    pub fn back(&mut self) -> bool {
        let ok = self.inner.back();
        if ok {
            self.dirty = true;
        }
        ok
    }

    pub fn judge(&self, picked: Vec<usize>) -> Result<JsValue, JsError> {
        let id = match self.inner.current() {
            Some(q) => q.id.clone(),
            None => return Ok(JsValue::NULL),
        };
        let v = self.inner.judge(&id, &picked);
        serde_wasm_bindgen::to_value(&v).map_err(|e| JsError::new(&e.to_string()))
    }

    /// grade: "know" | "fuzzy" | "no"。未知值或已完成时静默忽略。
    pub fn record(&mut self, grade: &str) {
        let g = match Self::parse_grade(grade) {
            Some(g) => g,
            None => return,
        };
        let id = match self.inner.current() {
            Some(q) => q.id.clone(),
            None => return,
        };
        self.inner.record(&id, g);
        self.dirty = true;
    }

    pub fn toggle_fav(&mut self) -> bool {
        let id = match self.inner.current() {
            Some(q) => q.id.clone(),
            None => return false,
        };
        let v = self.inner.toggle_fav(&id);
        self.dirty = true;
        v
    }
}

#[wasm_bindgen]
impl QuizEngine {
    pub fn stats(&self) -> Result<JsValue, JsError> {
        let st = self.inner.state();
        let cat = self.inner.catalog();
        let payload = StatsPayload {
            overall: stats::overall(st, cat),
            by_category: stats::by_category(st, cat),
            weakest: stats::weakest(st, cat, 5),
            // 56 天 = 8 周，与 legacy/js/app.js 的「最近 8 周」标题一致
            heatmap: stats::heatmap(st, 56),
            resume_risk: stats::resume_risk(st, cat),
        };
        serde_wasm_bindgen::to_value(&payload).map_err(|e| JsError::new(&e.to_string()))
    }

    /// 题库自检：字符串数组，空数组表示无问题
    pub fn health(&self) -> Result<JsValue, JsError> {
        let problems = parser::health(self.inner.catalog());
        serde_wasm_bindgen::to_value(&problems).map_err(|e| JsError::new(&e.to_string()))
    }

    /// 分类元数据，按声明顺序 —— 筛选面板据此渲染 chips
    pub fn cats(&self) -> Result<JsValue, JsError> {
        serde_wasm_bindgen::to_value(self.inner.catalog().cats())
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// 导出状态给 TS 落盘
    pub fn state_json(&self) -> String {
        serde_json::to_string(self.inner.state()).unwrap_or_else(|_| "{}".to_string())
    }

    /// 导入状态（设置面板的「导入进度」）。校验失败返回 Err，不动现有状态。
    pub fn load_state_json(&mut self, json: &str) -> Result<(), JsError> {
        let st: models::UserState =
            serde_json::from_str(json).map_err(|e| JsError::new(&e.to_string()))?;
        *self.inner.state_mut() = st;
        self.dirty = true;
        Ok(())
    }

    pub fn is_dirty(&self) -> bool { self.dirty }
    pub fn mark_clean(&mut self) { self.dirty = false; }

    pub fn theme(&self) -> String { self.inner.state().settings.theme.clone() }

    pub fn set_theme(&mut self, v: &str) {
        self.inner.state_mut().settings.theme = v.to_string();
        self.dirty = true;
    }

    pub fn oral(&self) -> bool { self.inner.state().settings.oral }

    pub fn set_oral(&mut self, v: bool) {
        self.inner.state_mut().settings.oral = v;
        self.dirty = true;
    }

    pub fn oral_seconds(&self) -> u32 { self.inner.state().settings.oral_seconds }

    pub fn set_oral_seconds(&mut self, v: u32) {
        self.inner.state_mut().settings.oral_seconds = v.clamp(5, 600);
        self.dirty = true;
    }

    pub fn questions_json(&self) -> String {
        serde_json::to_string(self.inner.catalog().all()).unwrap_or_else(|_| "[]".to_string())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn skeleton_compiles() {
        assert_eq!(2 + 2, 4);
    }
}

#[cfg(test)]
mod engine_tests {
    use super::*;

    const CATS: &str = r#"{"cats":[{"id":"c-lang","name":"C","desc":""}],"presets":{}}"#;
    const QS: &str = r#"[
        {"id":"c-1","cat":"c-lang","q":"题一","a":"答一","type":"single","options":["A","B"],"answer":[0]},
        {"id":"c-2","cat":"c-lang","q":"题二","a":"答二","type":"qa"}
    ]"#;

    fn engine() -> QuizEngine {
        QuizEngine::new(QS, CATS, None).unwrap()
    }

    #[test]
    fn new_rejects_bad_bank() {
        // 走 try_new：`new` 的失败路径要构造 JsError，而 JsError::new 是 JS 导入函数，
        // 在原生 target 下调用会 panic。try_new 是 `new` 的全部实际逻辑。
        assert!(QuizEngine::try_new("[{", CATS, None).is_err());
    }

    #[test]
    fn new_with_corrupt_state_falls_back_to_blank() {
        // 存档坏了不能拦住启动，否则用户永远打不开应用
        let e = QuizEngine::new(QS, CATS, Some("not json".into())).unwrap();
        assert_eq!(e.size(), 0);
        assert!(e.state_json().contains("\"version\""));
    }

    #[test]
    fn build_then_navigate_and_record() {
        let mut e = engine();
        let filter = r#"{"mode":"ordered"}"#;
        assert_eq!(e.build(filter), 2);
        assert_eq!(e.position(), 0);
        assert!(!e.is_finished());

        e.record("know");
        e.advance();
        assert_eq!(e.position(), 1);
        assert!(e.back());
        assert_eq!(e.position(), 0);

        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
        assert_eq!(s["q"]["c-1"]["box"], 1);
    }

    #[test]
    fn build_persists_deck_for_restore() {
        let mut e = engine();
        e.build(r#"{"mode":"random","seed":99}"#);
        e.advance();
        let saved = e.state_json();

        let mut e2 = QuizEngine::new(QS, CATS, Some(saved)).unwrap();
        assert!(e2.restore_deck());
        assert_eq!(e2.position(), 1);
    }

    #[test]
    fn record_is_noop_when_finished() {
        let mut e = engine();
        e.build(r#"{"mode":"ordered"}"#);
        e.advance(); e.advance();
        assert!(e.is_finished());
        e.record("know"); // 不该 panic，也不该乱记到别的题上
        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
        assert!(s["q"].get("c-1").is_none() || s["q"]["c-1"]["seen"] == 0);
    }

    #[test]
    fn invalid_grade_string_is_ignored() {
        let mut e = engine();
        e.build(r#"{"mode":"ordered"}"#);
        e.record("bogus");
        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
        assert!(s["q"].get("c-1").is_none(), "未知 grade 不该写进度");
    }

    #[test]
    fn bad_filter_json_builds_nothing() {
        let mut e = engine();
        assert_eq!(e.build("{oops"), 0);
    }

    #[test]
    fn dirty_flag_tracks_unsaved_changes() {
        let mut e = engine();
        e.build(r#"{"mode":"ordered"}"#);
        assert!(e.is_dirty());
        e.mark_clean();
        assert!(!e.is_dirty());
        e.record("no");
        assert!(e.is_dirty());
    }

    #[test]
    fn toggle_fav_targets_current_question() {
        let mut e = engine();
        e.build(r#"{"mode":"ordered"}"#);
        assert!(e.toggle_fav());
        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
        assert_eq!(s["q"]["c-1"]["fav"], true);
    }

    #[test]
    fn settings_round_trip_through_engine() {
        let mut e = engine();
        assert_eq!(e.theme(), "auto");
        e.set_theme("dark");
        assert_eq!(e.theme(), "dark");

        assert!(!e.oral());
        e.set_oral(true);
        assert!(e.oral());

        assert_eq!(e.oral_seconds(), 60);
        e.set_oral_seconds(90);
        assert_eq!(e.oral_seconds(), 90);

        let s: serde_json::Value = serde_json::from_str(&e.state_json()).unwrap();
        assert_eq!(s["settings"]["theme"], "dark");
        assert_eq!(s["settings"]["oralSeconds"], 90);
    }

    #[test]
    fn oral_seconds_is_clamped_to_sane_range() {
        let mut e = engine();
        e.set_oral_seconds(0);
        assert_eq!(e.oral_seconds(), 5, "下限 5 秒");
        e.set_oral_seconds(9999);
        assert_eq!(e.oral_seconds(), 600, "上限 10 分钟");
    }
}
