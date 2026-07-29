use crate::models::{CategoryMeta, Question};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

#[derive(Debug)]
pub struct Catalog {
    all: Vec<Question>,
    by_cat: HashMap<String, Vec<usize>>,
    cats: Vec<CategoryMeta>,
    cat_index: HashMap<String, usize>,
    id_index: HashMap<String, usize>,
    hash: u64,
}

impl Catalog {
    pub fn new(all: Vec<Question>, cats: Vec<CategoryMeta>) -> Self {
        let mut by_cat: HashMap<String, Vec<usize>> = HashMap::new();
        let mut id_index = HashMap::new();
        for (i, q) in all.iter().enumerate() {
            by_cat.entry(q.cat.clone()).or_default().push(i);
            id_index.insert(q.id.clone(), i);
        }
        let cat_index = cats.iter().enumerate().map(|(i, c)| (c.id.clone(), i)).collect();

        // 指纹：id 排序后逐个 hash，与声明顺序无关
        let mut ids: Vec<&str> = all.iter().map(|q| q.id.as_str()).collect();
        ids.sort_unstable();
        let mut h = DefaultHasher::new();
        all.len().hash(&mut h);
        for id in ids {
            id.hash(&mut h);
        }

        Catalog { all, by_cat, cats, cat_index, id_index, hash: h.finish() }
    }

    pub fn len(&self) -> usize { self.all.len() }
    pub fn is_empty(&self) -> bool { self.all.is_empty() }
    pub fn get(&self, idx: usize) -> Option<&Question> { self.all.get(idx) }
    pub fn all(&self) -> &[Question] { &self.all }
    pub fn cats(&self) -> &[CategoryMeta] { &self.cats }
    pub fn bank_hash(&self) -> u64 { self.hash }

    pub fn by_cat(&self, cat: &str) -> &[usize] {
        self.by_cat.get(cat).map(|v| v.as_slice()).unwrap_or(&[])
    }

    pub fn cat_meta(&self, id: &str) -> Option<&CategoryMeta> {
        self.cat_index.get(id).and_then(|&i| self.cats.get(i))
    }

    pub fn index_of(&self, id: &str) -> Option<usize> {
        self.id_index.get(id).copied()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;

    fn q(id: &str, cat: &str) -> Question {
        Question {
            id: id.into(), cat: cat.into(), q: "题".into(), a: "答".into(),
            qtype: QType::Qa, options: vec![], answer: Answer::None,
            level: 1, tags: vec![], resume: false, followup: vec![],
        }
    }

    fn cat(id: &str) -> CategoryMeta {
        CategoryMeta { id: id.into(), name: id.into(), desc: String::new() }
    }

    #[test]
    fn by_cat_preserves_original_order() {
        let c = Catalog::new(
            vec![q("a-1", "a"), q("b-1", "b"), q("a-2", "a")],
            vec![cat("a"), cat("b")],
        );
        assert_eq!(c.by_cat("a"), &[0, 2], "同分类下标应按题库原始顺序");
        assert_eq!(c.by_cat("b"), &[1]);
        assert!(c.by_cat("nope").is_empty(), "未知分类返回空切片而不是 panic");
    }

    #[test]
    fn index_of_finds_question_by_id() {
        let c = Catalog::new(vec![q("a-1", "a"), q("a-2", "a")], vec![cat("a")]);
        assert_eq!(c.index_of("a-2"), Some(1));
        assert_eq!(c.index_of("missing"), None);
    }

    #[test]
    fn bank_hash_is_order_independent_but_content_sensitive() {
        let c1 = Catalog::new(vec![q("a-1", "a"), q("a-2", "a")], vec![cat("a")]);
        let c2 = Catalog::new(vec![q("a-2", "a"), q("a-1", "a")], vec![cat("a")]);
        let c3 = Catalog::new(vec![q("a-1", "a"), q("a-3", "a")], vec![cat("a")]);
        assert_eq!(c1.bank_hash(), c2.bank_hash(), "同一组 id 换顺序，指纹不变");
        assert_ne!(c1.bank_hash(), c3.bank_hash(), "id 集合变了，指纹必须变");
    }

    #[test]
    fn empty_catalog_does_not_panic() {
        let c = Catalog::new(vec![], vec![]);
        assert_eq!(c.len(), 0);
        assert!(c.get(0).is_none());
        assert_eq!(c.bank_hash(), c.bank_hash());
    }
}
