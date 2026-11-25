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

impl Region {
    /// Regional Lodestone subdomain (the content is the same everywhere).
    pub fn lodestone_host(self) -> &'static str {
        match self {
            Self::Na => "na",
            Self::Eu => "eu",
            Self::Fr => "fr",
            Self::De => "de",
            Self::Ja => "jp",
        }
    }
}

impl Language {
    /// Language code expected by XIVAPI.
    pub fn code(self) -> &'static str {
        match self {
            Self::Fr => "fr",
            Self::En => "en",
            Self::De => "de",
            Self::Ja => "ja",
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn regions_map_to_their_lodestone_subdomain() {
        let hosts: Vec<_> = [Region::Na, Region::Eu, Region::Fr, Region::De, Region::Ja]
            .into_iter()
            .map(Region::lodestone_host)
            .collect();
        assert_eq!(hosts, ["na", "eu", "fr", "de", "jp"]);
    }

    #[test]
    fn languages_map_to_their_xivapi_code() {
        let codes: Vec<_> = [Language::Fr, Language::En, Language::De, Language::Ja]
            .into_iter()
            .map(Language::code)
            .collect();
        assert_eq!(codes, ["fr", "en", "de", "ja"]);
    }
}
