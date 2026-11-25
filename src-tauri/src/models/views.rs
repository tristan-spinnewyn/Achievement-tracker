//! Shapes exchanged with the renderer (rows, filters, summaries), mirroring `src/shared/types.ts`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::catalog::Achievement;
use super::collections::{CollectionItem, CollectionType};
use super::difficulty::DifficultyLevel;
use super::user::{Priority, SyncSource};

/// Achievement + progress + user meta, as displayed by the UI.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementRow {
    #[serde(flatten)]
    pub achievement: Achievement,
    pub category_name: String,
    pub kind_name: String,
    pub completed: bool,
    pub completed_date: Option<String>,
    pub source: Option<SyncSource>,
    pub priority: Priority,
    pub in_focus: bool,
    pub focus_order: Option<i64>,
    pub note: Option<String>,
    pub deadline: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AchievementStatus {
    #[default]
    All,
    Completed,
    Todo,
    Focus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SortField {
    #[default]
    Name,
    Points,
    Category,
    CompletedDate,
    Priority,
    FocusOrder,
    Patch,
    Difficulty,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SortDir {
    #[default]
    Asc,
    Desc,
}

#[derive(Debug, Clone, PartialEq, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AchievementFilter {
    pub search: Option<String>,
    pub kind_id: Option<u32>,
    pub category_id: Option<u32>,
    pub status: AchievementStatus,
    pub priority: Option<Priority>,
    pub min_points: Option<u32>,
    pub max_points: Option<u32>,
    pub obtainable_only: bool,
    pub has_note: bool,
    pub tags: Vec<String>,
    pub patch: Option<String>,
    pub seasonal_only: bool,
    pub seasonal_event: Option<String>,
    pub difficulty_level: Option<DifficultyLevel>,
    pub sort_by: SortField,
    pub sort_dir: SortDir,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KindProgress {
    pub kind_id: u32,
    pub kind_name: String,
    pub total: u32,
    pub completed: u32,
    pub points: u32,
    pub earned_points: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryProgress {
    pub category_id: u32,
    pub category_name: String,
    pub kind_id: u32,
    pub kind_name: String,
    pub total: u32,
    pub completed: u32,
    pub points: u32,
    pub earned_points: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentCompletion {
    pub id: u32,
    pub name: String,
    pub completed_date: Option<String>,
    pub points: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub total_achievements: u32,
    pub completed_achievements: u32,
    pub total_points: u32,
    pub earned_points: u32,
    pub focus_count: u32,
    pub by_kind: Vec<KindProgress>,
    pub by_category: Vec<CategoryProgress>,
    pub recent_completions: Vec<RecentCompletion>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogStatus {
    pub seeded: bool,
    pub achievement_count: u32,
    pub game_version: Option<String>,
    pub generated_at: Option<String>,
}

/// Most recent patch and how many of its achievements are still to do ("New" badge).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestPatchSummary {
    pub patch: Option<String>,
    pub pending: u32,
    pub total: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionItemRow {
    #[serde(flatten)]
    pub item: CollectionItem,
    pub category_name: String,
    pub owned: bool,
    pub owned_date: Option<String>,
    pub source: Option<SyncSource>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CollectionStatus {
    #[default]
    All,
    Owned,
    Missing,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionFilter {
    #[serde(rename = "type")]
    pub kind: CollectionType,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub status: CollectionStatus,
    #[serde(default)]
    pub category_id: Option<u32>,
    #[serde(default)]
    pub patch: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionProgress {
    #[serde(rename = "type")]
    pub kind: CollectionType,
    pub total: u32,
    pub owned: u32,
}

/// Item count per collection type.
pub type CountsByType = BTreeMap<CollectionType, u32>;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionsStatus {
    pub seeded: bool,
    pub counts: CountsByType,
    pub generated_at: Option<String>,
    pub game_version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct PendingRecurring {
    pub daily: u32,
    pub weekly: u32,
    pub daily22: u32,
}
