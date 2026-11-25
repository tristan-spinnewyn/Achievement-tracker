//! Difficulty and suggestion commands (Electron channels `difficulty:*`, `suggestions:get`).

use tauri::State;

use crate::models::difficulty::{
    AchievementDifficulty, DifficultyEntry, DifficultyLevel, DifficultyStats, RecalculateResult,
};
use crate::models::settings::SuggestionWeights;
use crate::models::views::SortDir;
use crate::services::difficulty::{self, weights::DifficultyWeights};
use crate::services::suggestions::{self, Suggestion, DEFAULT_LIMIT};
use crate::state::AppState;

#[tauri::command]
pub fn difficulty_get(
    state: State<'_, AppState>,
    achievement_id: u32,
) -> Option<AchievementDifficulty> {
    state.store().difficulties.get(&achievement_id).cloned()
}

/// Every computed difficulty, in catalog order.
#[tauri::command]
pub fn difficulty_all(state: State<'_, AppState>) -> Vec<DifficultyEntry> {
    let store = state.store();
    store
        .catalog
        .achievements
        .iter()
        .filter_map(|a| {
            let difficulty = store.difficulties.get(&a.id)?.clone();
            Some(DifficultyEntry {
                id: a.id,
                difficulty,
            })
        })
        .collect()
}

#[tauri::command]
pub fn difficulty_stats(state: State<'_, AppState>) -> DifficultyStats {
    difficulty::difficulty_stats(&state.store())
}

#[tauri::command]
pub fn difficulty_filter(state: State<'_, AppState>, level: Option<DifficultyLevel>) -> Vec<u32> {
    difficulty::ids_by_level(&state.store(), level)
}

#[tauri::command]
pub fn difficulty_sort(state: State<'_, AppState>, direction: Option<SortDir>) -> Vec<u32> {
    difficulty::ids_by_score(&state.store(), direction.unwrap_or_default())
}

#[tauri::command]
pub fn difficulty_weights() -> DifficultyWeights {
    DifficultyWeights::default()
}

#[tauri::command]
pub fn difficulty_recalculate(state: State<'_, AppState>) -> RecalculateResult {
    let count = difficulty::refresh_difficulties(&mut state.store());
    RecalculateResult {
        success: true,
        count: u32::try_from(count).unwrap_or(u32::MAX),
    }
}

#[tauri::command]
pub fn suggestions_get(
    state: State<'_, AppState>,
    weights: Option<SuggestionWeights>,
) -> Vec<Suggestion> {
    suggestions::suggestions(&state.store(), weights.as_ref(), DEFAULT_LIMIT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_support::sample_app;

    #[test]
    fn recalculates_then_exposes_the_difficulties() {
        let t = sample_app();
        assert!(difficulty_all(t.state()).is_empty());
        assert_eq!(
            difficulty_recalculate(t.state()),
            RecalculateResult {
                success: true,
                count: 3
            }
        );

        assert_eq!(difficulty_all(t.state()).len(), 3);
        assert!(difficulty_get(t.state(), 1).is_some());
        assert!(difficulty_get(t.state(), 999).is_none());
        assert_eq!(difficulty_stats(t.state()).total, 3);
        assert_eq!(difficulty_filter(t.state(), None).len(), 3);
        assert_eq!(difficulty_sort(t.state(), None).len(), 3);
        let desc = difficulty_sort(t.state(), Some(SortDir::Desc));
        assert_eq!(
            desc.first(),
            difficulty_sort(t.state(), Some(SortDir::Asc)).last()
        );
        assert_eq!(difficulty_weights().kind_weights[&1], 30.0);
    }

    #[test]
    fn suggests_with_given_or_stored_weights() {
        let t = sample_app();
        assert_eq!(suggestions_get(t.state(), None).len(), 2);
        let none = SuggestionWeights {
            priority: 0.0,
            points: 0.0,
            category_proximity: 0.0,
        };
        assert!(suggestions_get(t.state(), Some(none)).is_empty());
    }
}
