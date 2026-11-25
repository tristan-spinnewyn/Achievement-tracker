//! Achievement difficulty, mirroring `AchievementDifficulty` and the `difficulty:*` payloads.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DifficultyLevel {
    VeryEasy,
    Easy,
    Medium,
    Hard,
    VeryHard,
    Extreme,
}

impl DifficultyLevel {
    pub const ALL: [Self; 6] = [
        Self::VeryEasy,
        Self::Easy,
        Self::Medium,
        Self::Hard,
        Self::VeryHard,
        Self::Extreme,
    ];
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementDifficulty {
    pub score: f64,
    pub level: DifficultyLevel,
    pub level_name: String,
    pub color: String,
    pub stars: String,
}

/// One entry of `difficulty:all`: `{ id, score, level, … }`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DifficultyEntry {
    pub id: u32,
    #[serde(flatten)]
    pub difficulty: AchievementDifficulty,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AchievementScore {
    pub id: u32,
    pub name: String,
    pub score: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DifficultyStats {
    pub total: u32,
    pub by_level: BTreeMap<DifficultyLevel, u32>,
    pub average_score: f64,
    pub hardest: Option<AchievementScore>,
    pub easiest: Option<AchievementScore>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RecalculateResult {
    pub success: bool,
    pub count: u32,
}
