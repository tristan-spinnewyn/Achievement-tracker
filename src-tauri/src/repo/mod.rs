//! Data access layer, split by domain (port of `src/main/data/repo`).

pub mod achievements;
pub mod catalog;
pub mod collections;
pub mod dashboard;
pub mod error;
pub mod history;
pub mod meta;
pub mod mutations;
pub mod recurring;
pub mod settings;

#[cfg(test)]
pub mod test_support;
