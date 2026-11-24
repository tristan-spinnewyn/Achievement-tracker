//! Achievement catalog, mirroring the catalog types of `src/shared/types.ts`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementKind {
    pub id: u32,
    pub name: String,
    pub order: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementCategory {
    pub id: u32,
    pub kind_id: u32,
    pub name: String,
    pub order: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub id: u32,
    pub name: String,
    pub description: String,
    pub points: u32,
    pub category_id: u32,
    pub kind_id: u32,
    pub icon_path: Option<String>,
    pub obtainable: bool,
    /// Patch that introduced it, e.g. "7.51"; None if unknown.
    pub patch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_seasonal: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seasonal_event: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seasonal_end_date: Option<String>,
}

/// Content of `catalog.json` (and of the bundled catalog snapshot).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CatalogData {
    pub generated_at: Option<String>,
    pub game_version: Option<String>,
    pub kinds: Vec<AchievementKind>,
    pub categories: Vec<AchievementCategory>,
    pub achievements: Vec<Achievement>,
}
