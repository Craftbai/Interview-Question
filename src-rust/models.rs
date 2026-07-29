use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn one() -> u8 { 1 }

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Hash)]
#[serde(rename_all = "lowercase")]
pub enum QType { Single, Multi, Bool, Qa }

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum Answer {
    Indices(Vec<usize>),
    Bool(bool),
    None,
}

impl Default for Answer {
    fn default() -> Self { Answer::None }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Question {
    pub id: String,
    pub cat: String,
    pub q: String,
    pub a: String,
    #[serde(rename = "type")]
    pub qtype: QType,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub answer: Answer,
    #[serde(default = "one")]
    pub level: u8,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub resume: bool,
    #[serde(default)]
    pub followup: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CategoryMeta {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub desc: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Progress {
    #[serde(rename = "box")]
    pub bx: u8,
    #[serde(default)]
    pub right: u32,
    #[serde(default)]
    pub wrong: u32,
    #[serde(default)]
    pub seen: u32,
    #[serde(default)]
    pub last: u64,
    #[serde(default)]
    pub fav: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub oral: bool,
    #[serde(rename = "oralSeconds", default = "default_oral_seconds")]
    pub oral_seconds: u32,
}

fn default_theme() -> String { "auto".to_string() }
fn default_oral_seconds() -> u32 { 60 }

impl Default for Settings {
    fn default() -> Self {
        Settings { theme: default_theme(), oral: false, oral_seconds: default_oral_seconds() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UserState {
    #[serde(default = "state_version")]
    pub version: u32,
    #[serde(default)]
    pub q: HashMap<String, Progress>,
    #[serde(default)]
    pub days: HashMap<String, u32>,
    #[serde(rename = "wrongToday", default)]
    pub wrong_today: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub deck: Option<Deck>,
}

fn state_version() -> u32 { 2 }

impl Default for UserState {
    fn default() -> Self {
        UserState {
            version: 2,
            q: HashMap::new(),
            days: HashMap::new(),
            wrong_today: HashMap::new(),
            settings: Settings::default(),
            deck: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Wrong,
    Unmastered,
    Fav,
    /// 序列化为 "resume" 以匹配 index.html:74 的 data-scope 值
    #[serde(rename = "resume")]
    ResumeRisk,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Mode { Smart, Ordered, Random }

impl Default for Mode {
    fn default() -> Self { Mode::Smart }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Filter {
    #[serde(default)]
    pub cats: Vec<String>,
    #[serde(default)]
    pub levels: Vec<u8>,
    #[serde(default)]
    pub types: Vec<QType>,
    #[serde(default)]
    pub scopes: Vec<Scope>,
    #[serde(default)]
    pub mode: Mode,
    #[serde(default)]
    pub keyword: String,
    #[serde(default)]
    pub seed: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Deck {
    pub ids: Vec<String>,
    pub pos: usize,
    pub filter: Filter,
    pub seed: u64,
    pub bank_hash: u64,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Grade { Know, Fuzzy, No }

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Verdict {
    pub correct: bool,
    pub expected: Vec<usize>,
    pub picked: Vec<usize>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn question_roundtrips_choice() {
        let json = r#"{"id":"c-001","cat":"c-lang","q":"题干","a":"答案",
            "type":"single","options":["A","B"],"answer":[1]}"#;
        let q: Question = serde_json::from_str(json).unwrap();
        assert_eq!(q.id, "c-001");
        assert_eq!(q.qtype, QType::Single);
        assert!(matches!(q.answer, Answer::Indices(ref v) if v == &vec![1]));
        assert_eq!(q.level, 1, "level 缺省应为 1");
        assert!(!q.resume);
    }

    #[test]
    fn question_accepts_bool_answer() {
        let json = r#"{"id":"os-001","cat":"os","q":"题","a":"答","type":"bool","answer":true}"#;
        let q: Question = serde_json::from_str(json).unwrap();
        assert!(matches!(q.answer, Answer::Bool(true)));
    }

    #[test]
    fn question_accepts_qa_without_answer() {
        let json = r#"{"id":"os-002","cat":"os","q":"题","a":"答","type":"qa"}"#;
        let q: Question = serde_json::from_str(json).unwrap();
        assert!(matches!(q.answer, Answer::None));
        assert!(q.options.is_empty());
    }

    #[test]
    fn user_state_reads_v1_archive() {
        // 形状取自现有 localStorage["embq.v1"]
        let json = r#"{
            "version": 1,
            "q": { "c-001": { "box": 2, "right": 3, "wrong": 1, "seen": 4, "last": 1720000000000, "fav": true } },
            "days": { "2026-07-28": 12 },
            "wrongToday": { "2026-07-28": ["c-001"] },
            "settings": { "theme": "dark", "oral": false, "oralSeconds": 60 }
        }"#;
        let s: UserState = serde_json::from_str(json).unwrap();
        let p = s.q.get("c-001").unwrap();
        assert_eq!(p.bx, 2, "box 必须映射到 bx");
        assert_eq!(p.right, 3);
        assert!(p.fav);
        assert_eq!(s.wrong_today.get("2026-07-28").unwrap(), &vec!["c-001".to_string()]);
        assert_eq!(s.settings.oral_seconds, 60, "oralSeconds 必须映射到 oral_seconds");
        assert!(s.deck.is_none(), "v1 存档没有 deck");
    }

    #[test]
    fn user_state_writes_camel_case_keys() {
        let s = UserState::default();
        let out = serde_json::to_string(&s).unwrap();
        assert!(out.contains("\"wrongToday\""), "落盘必须写 wrongToday，实际: {out}");
        assert!(out.contains("\"oralSeconds\""));
        assert!(!out.contains("wrong_today"));
    }

    #[test]
    fn progress_defaults_are_zero() {
        let p = Progress::default();
        assert_eq!(p.bx, 0);
        assert_eq!(p.seen, 0);
        assert!(!p.fav);
    }

    #[test]
    fn scope_serializes_to_dom_data_attribute_values() {
        // 必须与 index.html:71-74 的 data-scope 值逐字一致
        let f: Filter = serde_json::from_str(
            r#"{"scopes":["wrong","unmastered","fav","resume"]}"#,
        ).unwrap();
        assert_eq!(
            f.scopes,
            vec![Scope::Wrong, Scope::Unmastered, Scope::Fav, Scope::ResumeRisk]
        );
        let out = serde_json::to_string(&f.scopes).unwrap();
        assert_eq!(out, r#"["wrong","unmastered","fav","resume"]"#);
    }
}

/// Count 的返回结构 — 用 struct 而非 json! 宏，因为 wasm-bindgen 对 json! 序列化的结果
/// 产生 JS Map（Object.keys 为空），而 struct 产生普通 Object。
#[derive(Serialize, Debug)]
pub struct CountPayload {
    pub total: usize,
    pub boxes: [usize; 4],
}

/// Stats 的返回结构。weakest 的 weak_ids 保持 snake_case（来自 RiskStats）。
#[derive(Serialize, Debug)]
pub struct StatsPayload {
    pub overall: crate::stats::OverallStats,
    /// TS 侧读 s.byCategory
    #[serde(rename = "byCategory")]
    pub by_category: Vec<crate::stats::CategoryStats>,
    pub weakest: Vec<crate::stats::CategoryStats>,
    pub heatmap: Vec<crate::stats::HeatCell>,
    /// TS 侧读 s.resumeRisk；其内部 weak_ids 保持 snake_case
    #[serde(rename = "resumeRisk")]
    pub resume_risk: crate::stats::RiskStats,
}
