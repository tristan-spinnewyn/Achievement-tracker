//! Collection commands (Electron channels `collections:*`, except the network ones).

use chrono::Utc;
use tauri::State;

use super::error::CommandResult;
use crate::models::collections::{CollectionCategory, CollectionType};
use crate::models::views::{
    CollectionFilter, CollectionItemRow, CollectionProgress, CollectionsStatus, CountsByType,
};
use crate::repo::collections;
use crate::state::AppState;

#[tauri::command]
pub fn collections_status(state: State<'_, AppState>) -> CollectionsStatus {
    collections::collections_status(&state.store())
}

#[tauri::command]
pub fn collections_pending(state: State<'_, AppState>) -> CountsByType {
    collections::pending_by_type(&state.store())
}

#[tauri::command]
pub fn collections_all_progress(state: State<'_, AppState>) -> Vec<CollectionProgress> {
    collections::all_collections_progress(&state.store())
}

#[tauri::command]
pub fn collections_patches(state: State<'_, AppState>, kind: CollectionType) -> Vec<String> {
    collections::collection_patches(&state.store(), kind)
}

#[tauri::command]
pub fn collections_list(
    state: State<'_, AppState>,
    filter: CollectionFilter,
) -> Vec<CollectionItemRow> {
    collections::list_collection(&state.store(), &filter)
}

#[tauri::command]
pub fn collections_categories(
    state: State<'_, AppState>,
    kind: CollectionType,
) -> Vec<CollectionCategory> {
    collections::collection_categories(&state.store(), kind)
}

#[tauri::command]
pub fn collections_progress(
    state: State<'_, AppState>,
    kind: CollectionType,
) -> CollectionProgress {
    collections::collection_progress(&state.store(), kind)
}

#[tauri::command]
pub fn collections_set_owned(
    state: State<'_, AppState>,
    kind: CollectionType,
    id: u32,
    owned: bool,
) -> CommandResult<bool> {
    collections::set_collection_owned(&mut state.store(), kind, id, owned, Utc::now())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_support::sample_app;
    use crate::models::views::CollectionStatus;
    use CollectionType::Mount;

    #[test]
    fn reads_and_updates_collections() {
        let t = sample_app();
        assert!(collections_set_owned(t.state(), Mount, 1, true).unwrap());
        assert_eq!(collections_status(t.state()).counts[&Mount], 3);
        assert_eq!(collections_pending(t.state())[&Mount], 1);
        assert_eq!(collections_all_progress(t.state()).len(), 12);
        assert_eq!(collections_patches(t.state(), Mount), ["7.1", "6.0"]);
        assert_eq!(collections_categories(t.state(), Mount).len(), 1);
        assert_eq!(collections_progress(t.state(), Mount).owned, 1);
        let filter = CollectionFilter {
            kind: Mount,
            search: None,
            status: CollectionStatus::Owned,
            category_id: None,
            patch: None,
        };
        assert_eq!(collections_list(t.state(), filter).len(), 1);
    }
}
