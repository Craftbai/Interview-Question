use serde::{Deserialize, Serialize};

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
}
