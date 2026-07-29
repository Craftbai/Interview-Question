pub mod catalog;
pub mod models;
pub mod parser;
pub mod scheduler;
pub mod stats;

#[cfg(test)]
mod tests {
    #[test]
    fn skeleton_compiles() {
        assert_eq!(2 + 2, 4);
    }
}
