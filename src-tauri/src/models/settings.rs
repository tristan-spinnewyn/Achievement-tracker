//! User settings, mirroring `Settings` in `src/shared/types.ts`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Region {
    Na,
    Eu,
    Fr,
    De,
    Ja,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Fr,
    En,
    De,
    Ja,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SuggestionWeights {
    pub priority: f64,
    pub points: f64,
    pub category_proximity: f64,
}

impl Default for SuggestionWeights {
    fn default() -> Self {
        Self {
            priority: 3.0,
            points: 1.0,
            category_proximity: 2.0,
        }
    }
}

/// Missing keys fall back to the defaults, like `{ ...DEFAULT_SETTINGS, ...loaded }` in TS.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub lodestone_character_id: Option<String>,
    pub region: Region,
    pub language: Language,
    pub last_sync_at: Option<String>,
    pub theme: Theme,
    pub auto_sync: bool,
    pub suggestion_weights: SuggestionWeights,
    pub auto_backup_documents: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            lodestone_character_id: None,
            region: Region::Eu,
            language: Language::Fr,
            last_sync_at: None,
            theme: Theme::Dark,
            auto_sync: false,
            suggestion_weights: SuggestionWeights::default(),
            auto_backup_documents: true,
        }
    }
}
