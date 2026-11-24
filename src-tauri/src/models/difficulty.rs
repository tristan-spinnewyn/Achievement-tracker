//! Achievement difficulty (computed in phase 2), mirroring `AchievementDifficulty`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DifficultyLevel {
    VeryEasy,
    Easy,
    Medium,
    Hard,
    VeryHard,
    Extreme,
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
