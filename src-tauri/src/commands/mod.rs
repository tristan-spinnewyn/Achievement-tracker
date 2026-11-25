//! Tauri commands, one module per domain. Each command locks the store, calls the
//! repo layer and turns errors into a message for the renderer.

pub mod achievements;
pub mod backup;
pub mod catalog;
pub mod collections;
pub mod difficulty;
pub mod error;
pub mod network;
pub mod recurring;
pub mod settings;
pub mod updater;

#[cfg(test)]
pub mod test_support;
