use crate::catalog::Catalog;
use crate::models::{Answer, CategoryMeta, QType, Question};
use serde::Deserialize;
use std::collections::HashSet;
use std::fmt;

#[derive(Deserialize)]
struct CatalogFile {
    cats: Vec<CategoryMeta>,
    #[serde(default)]
    #[allow(dead_code)]
    presets: std::collections::HashMap<String, Vec<String>>,
}

#[derive(Debug)]
pub enum ParseError {
    Json(String),
    Validation(Vec<String>),
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseError::Json(m) => write!(f, "JSON 解析失败: {m}"),
            ParseError::Validation(v) => write!(f, "题库校验失败: {}", v.join("; ")),
        }
    }
}

pub fn parse(questions_json: &str, categories_json: &str) -> Result<Catalog, ParseError> {
    let cat_file: CatalogFile =
        serde_json::from_str(categories_json).map_err(|e| ParseError::Json(e.to_string()))?;
    let questions: Vec<Question> =
        serde_json::from_str(questions_json).map_err(|e| ParseError::Json(e.to_string()))?;

    let known: HashSet<&str> = cat_file.cats.iter().map(|c| c.id.as_str()).collect();
    let mut seen: HashSet<&str> = HashSet::new();
    let mut errs = Vec::new();

    for q in &questions {
        if q.id.is_empty() {
            errs.push(format!("存在无 id 的题目: {}", q.q.chars().take(24).collect::<String>()));
            continue;
        }
        if !seen.insert(q.id.as_str()) {
            errs.push(format!("{}: id 重复", q.id));
        }
        if !known.contains(q.cat.as_str()) {
            errs.push(format!("{}: 分类 \"{}\" 未登记", q.id, q.cat));
        }
        if !(1..=3).contains(&q.level) {
            errs.push(format!("{}: level 应为 1~3，实际 {}", q.id, q.level));
        }
        if q.a.trim().is_empty() {
            errs.push(format!("{}: 缺少参考答案", q.id));
        }
        match q.qtype {
            QType::Single | QType::Multi => match &q.answer {
                Answer::Indices(v) if !v.is_empty() => {
                    if q.options.len() < 2 {
                        errs.push(format!("{}: 选择题至少要 2 个选项", q.id));
                    }
                    for &i in v {
                        if i >= q.options.len() {
                            errs.push(format!("{}: answer 索引 {} 越界", q.id, i));
                        }
                    }
                    if q.qtype == QType::Single && v.len() != 1 {
                        errs.push(format!("{}: 单选题只能有 1 个正确答案", q.id));
                    }
                }
                _ => errs.push(format!("{}: 选择题 answer 必须是非空索引数组", q.id)),
            },
            QType::Bool => {
                if !matches!(q.answer, Answer::Bool(_)) {
                    errs.push(format!("{}: 判断题 answer 必须是 true/false", q.id));
                }
            }
            QType::Qa => {}
        }
    }

    if !errs.is_empty() {
        return Err(ParseError::Validation(errs));
    }
    Ok(Catalog::new(questions, cat_file.cats))
}

/// 题库自检：分类登记与题目分布是否对得上。不阻断加载，供设置面板显示。
pub fn health(catalog: &Catalog) -> Vec<String> {
    let mut out = Vec::new();
    for c in catalog.cats() {
        if catalog.by_cat(&c.id).is_empty() {
            out.push(format!("分类 \"{}\" 已登记但一道题都没有", c.id));
        }
    }
    let registered: HashSet<&str> = catalog.cats().iter().map(|c| c.id.as_str()).collect();
    let mut orphans: Vec<&str> = catalog
        .all()
        .iter()
        .map(|q| q.cat.as_str())
        .filter(|c| !registered.contains(c))
        .collect();
    orphans.sort_unstable();
    orphans.dedup();
    for c in orphans {
        out.push(format!("分类 \"{}\" 有题目但未登记", c));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const CATS: &str = r#"{"cats":[{"id":"c-lang","name":"C","desc":""}],"presets":{}}"#;

    fn qs(body: &str) -> String { format!("[{body}]") }

    #[test]
    fn parses_valid_bank() {
        let j = qs(r#"{"id":"c-001","cat":"c-lang","q":"题","a":"答","type":"qa"}"#);
        let c = parse(&j, CATS).unwrap();
        assert_eq!(c.len(), 1);
        assert_eq!(c.cats().len(), 1);
    }

    #[test]
    fn rejects_malformed_json() {
        assert!(parse("[{", CATS).is_err());
    }

    #[test]
    fn rejects_duplicate_ids() {
        let j = qs(r#"{"id":"c-001","cat":"c-lang","q":"a","a":"b","type":"qa"},
                     {"id":"c-001","cat":"c-lang","q":"c","a":"d","type":"qa"}"#);
        let e = parse(&j, CATS).unwrap_err().to_string();
        assert!(e.contains("c-001"), "错误信息应指出重复的 id，实际: {e}");
    }

    #[test]
    fn rejects_unknown_category() {
        let j = qs(r#"{"id":"x-1","cat":"nope","q":"a","a":"b","type":"qa"}"#);
        assert!(parse(&j, CATS).unwrap_err().to_string().contains("nope"));
    }

    #[test]
    fn rejects_out_of_range_level() {
        let j = qs(r#"{"id":"x-1","cat":"c-lang","q":"a","a":"b","type":"qa","level":9}"#);
        assert!(parse(&j, CATS).unwrap_err().to_string().contains("level"));
    }

    #[test]
    fn rejects_choice_with_out_of_bounds_answer() {
        let j = qs(r#"{"id":"x-1","cat":"c-lang","q":"a","a":"b","type":"single",
                      "options":["A","B"],"answer":[5]}"#);
        assert!(parse(&j, CATS).unwrap_err().to_string().contains("越界"));
    }

    #[test]
    fn rejects_qa_without_reference_answer() {
        let j = qs(r#"{"id":"x-1","cat":"c-lang","q":"a","a":"","type":"qa"}"#);
        assert!(parse(&j, CATS).is_err());
    }

    #[test]
    fn health_reports_registered_but_empty_category() {
        let cats = r#"{"cats":[{"id":"c-lang","name":"C","desc":""},
                              {"id":"os","name":"OS","desc":""}],"presets":{}}"#;
        let j = qs(r#"{"id":"c-001","cat":"c-lang","q":"a","a":"b","type":"qa"}"#);
        let c = parse(&j, cats).unwrap();
        let problems = health(&c);
        assert!(problems.iter().any(|p| p.contains("os")), "应报告 os 分类没有题目");
    }

    #[test]
    fn real_bank_passes_validation() {
        let qs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/data/questions.json"))
            .expect("先运行 npm run migrate 生成 data/questions.json");
        let cs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/data/categories.json"))
            .unwrap();
        let c = parse(&qs, &cs).expect("真实题库应通过校验");
        assert_eq!(c.len(), 476, "题目总数必须是 476");
        assert_eq!(c.cats().len(), 19);
        assert!(health(&c).is_empty(), "真实题库自检应无问题: {:?}", health(&c));
    }
}
