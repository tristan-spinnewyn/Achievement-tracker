//! Tauri commands, one module per domain. Each command locks the store, calls the
//! repo layer and turns errors into a message for the renderer.

pub mod achievements;
pub mod catalog;
pub mod collections;
pub mod error;
pub mod recurring;
pub mod settings;

#[cfg(test)]
pub mod test_support;
