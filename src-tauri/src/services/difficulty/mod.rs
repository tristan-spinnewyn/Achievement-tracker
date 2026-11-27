//! Achievement difficulty score.
//!
//! Bounded additive model: points + content tier + grind + challenge
//! + context (kind/category) + recency + seasonal, each component capped.

pub mod text;
pub mod weights;

use std::collections::HashMap;

use crate::models::catalog::Achievement;
use crate::models::difficulty::{
    AchievementDifficulty, AchievementScore, DifficultyLevel, DifficultyStats,
};
use crate::models::views::SortDir;
use crate::store::Store;
use weights::DifficultyWeights;

const POINTS_CAP: f64 = 35.0;
const CONTEXT_CAP: f64 = 20.0;
const RECENCY_CAP: f64 = 8.0;
const SEASONAL_BONUS: f64 = 8.0;

/// Highest score of each level, with its display data. Scores above the last
/// bound are `extreme`. The bounds are continuous: unlike the TS thresholds
/// (0–20, 21–40…), a score of 20.2 is `easy`, not `extreme`.
const LEVELS: [(f64, DifficultyLevel, &str, &str, &str); 5] = [
    (
        20.0,
        DifficultyLevel::VeryEasy,
        "Très facile",
        "#22c55e",
        "⭐",
    ),
    (40.0, DifficultyLevel::Easy, "Facile", "#84cc16", "⭐⭐"),
    (
        60.0,
        DifficultyLevel::Medium,
        "Moyenne",
        "#eab308",
        "⭐⭐⭐",
    ),
    (
        80.0,
        DifficultyLevel::Hard,
        "Difficile",
        "#f97316",
        "⭐⭐⭐⭐",
    ),
    (
        100.0,
        DifficultyLevel::VeryHard,
        "Très difficile",
        "#ef4444",
        "⭐⭐⭐⭐⭐",
    ),
];
const EXTREME: (DifficultyLevel, &str, &str, &str) = (
    DifficultyLevel::Extreme,
    "Extrême",
    "#1f2937",
    "⭐⭐⭐⭐⭐⭐",
);

fn round_one_decimal(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

/// Classifies a raw score; the stored score is rounded to one decimal.
pub fn classify(score: f64) -> AchievementDifficulty {
    let (level, name, color, stars) = LEVELS
        .iter()
        .find(|(max, ..)| score <= *max)
        .map(|(_, level, name, color, stars)| (*level, *name, *color, *stars))
        .unwrap_or(EXTREME);
    AchievementDifficulty {
        score: round_one_decimal(score),
        level,
        level_name: name.into(),
        color: color.into(),
        stars: stars.into(),
    }
}

pub fn calculate_difficulty(
    achievement: &Achievement,
    weights: &DifficultyWeights,
) -> AchievementDifficulty {
    let text = format!("{} {}", achievement.name, achievement.description).to_lowercase();
    let points = POINTS_CAP * (1.0 - (-f64::from(achievement.points) / 40.0).exp());
    let tier = f64::min(text::TIER_CAP, text::tier_score(&text));
    let grind = text::grind_score(&text);
    let challenge = text::challenge_score(&text);

    let kind_weight = weights
        .kind_weights
        .get(&achievement.kind_id)
        .copied()
        .unwrap_or(0.0);
    let category_weight = weights
        .category_weights
        .get(&achievement.category_id)
        .copied()
        .unwrap_or(0.0);
    let context = f64::min(CONTEXT_CAP, kind_weight.max(category_weight) * 0.3);

    let factor = weights.patch_factor(achievement.patch.as_deref());
    let recency = ((factor - 0.8) / 0.4 * RECENCY_CAP).clamp(0.0, RECENCY_CAP);
    let seasonal = if achievement.is_seasonal == Some(true) {
        SEASONAL_BONUS
    } else {
        0.0
    };

    classify(points + tier + grind + challenge + context + recency + seasonal)
}

/// Recomputes the difficulty of every catalog achievement with the default weights.
pub fn refresh_difficulties(store: &mut Store) -> usize {
    let weights = DifficultyWeights::default();
    store.difficulties = store
        .catalog
        .achievements
        .iter()
        .map(|a| (a.id, calculate_difficulty(a, &weights)))
        .collect::<HashMap<_, _>>();
    store.difficulties.len()
}

/// Catalog achievements with their difficulty, in catalog order.
fn scored(store: &Store) -> impl Iterator<Item = (&Achievement, &AchievementDifficulty)> {
    store
        .catalog
        .achievements
        .iter()
        .filter_map(|a| store.difficulties.get(&a.id).map(|d| (a, d)))
}

pub fn difficulty_stats(store: &Store) -> DifficultyStats {
    let mut by_level = DifficultyLevel::ALL
        .iter()
        .map(|l| (*l, 0))
        .collect::<std::collections::BTreeMap<_, _>>();
    let (mut total, mut sum) = (0u32, 0.0);
    let mut hardest: Option<AchievementScore> = None;
    let mut easiest: Option<AchievementScore> = None;
    for (a, d) in scored(store) {
        *by_level.entry(d.level).or_default() += 1;
        total += 1;
        sum += d.score;
        let entry = || AchievementScore {
            id: a.id,
            name: a.name.clone(),
            score: d.score,
        };
        if hardest.as_ref().is_none_or(|h| d.score > h.score) {
            hardest = Some(entry());
        }
        if easiest.as_ref().is_none_or(|e| d.score < e.score) {
            easiest = Some(entry());
        }
    }
    let average = if total > 0 {
        sum / f64::from(total)
    } else {
        0.0
    };
    DifficultyStats {
        total,
        by_level,
        average_score: round_one_decimal(average),
        hardest,
        easiest,
    }
}

/// Ids of the achievements of a level (all of them for None), in catalog order.
pub fn ids_by_level(store: &Store, level: Option<DifficultyLevel>) -> Vec<u32> {
    scored(store)
        .filter(|(_, d)| level.is_none_or(|l| d.level == l))
        .map(|(a, _)| a.id)
        .collect()
}

/// Ids sorted by score (ties keep the catalog order).
pub fn ids_by_score(store: &Store, direction: SortDir) -> Vec<u32> {
    let mut entries: Vec<(u32, f64)> = scored(store).map(|(a, d)| (a.id, d.score)).collect();
    entries.sort_by(|x, y| match direction {
        SortDir::Asc => x.1.total_cmp(&y.1),
        SortDir::Desc => y.1.total_cmp(&x.1),
    });
    entries.into_iter().map(|(id, _)| id).collect()
}

#[cfg(test)]
mod tests;
