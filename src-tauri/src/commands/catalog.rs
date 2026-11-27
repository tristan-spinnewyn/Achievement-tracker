//! Catalog status and metadata commands.

use tauri::State;

use crate::models::catalog::{AchievementCategory, AchievementKind};
use crate::models::views::CatalogStatus;
use crate::repo::catalog;
use crate::state::AppState;

#[tauri::command]
pub fn catalog_status(state: State<'_, AppState>) -> CatalogStatus {
    catalog::catalog_status(&state.store())
}

#[tauri::command]
pub fn meta_kinds(state: State<'_, AppState>) -> Vec<AchievementKind> {
    catalog::kinds(&state.store())
}

#[tauri::command]
pub fn meta_categories(state: State<'_, AppState>) -> Vec<AchievementCategory> {
    catalog::categories(&state.store())
}

#[tauri::command]
pub fn meta_tags(state: State<'_, AppState>) -> Vec<String> {
    catalog::all_tags(&state.store())
}

#[tauri::command]
pub fn meta_patches(state: State<'_, AppState>) -> Vec<String> {
    catalog::achievement_patches(&state.store())
}

#[tauri::command]
pub fn meta_seasonal_events(state: State<'_, AppState>) -> Vec<String> {
    catalog::seasonal_events(&state.store())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_support::sample_app;

    #[test]
    fn exposes_the_catalog_metadata() {
        let t = sample_app();
        assert_eq!(catalog_status(t.state()).achievement_count, 3);
        assert_eq!(meta_kinds(t.state()).len(), 2);
        assert_eq!(meta_categories(t.state()).len(), 2);
        assert!(meta_tags(t.state()).is_empty());
        assert_eq!(meta_patches(t.state()), ["7.1", "6.5"]);
        assert_eq!(meta_seasonal_events(t.state()), ["Halloween"]);
    }
}
