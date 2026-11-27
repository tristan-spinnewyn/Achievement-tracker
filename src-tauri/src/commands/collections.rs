//! Collection commands.

use chrono::Utc;
use tauri::State;

use super::error::CommandResult;
use crate::models::collections::{CollectionCategory, CollectionType};
use crate::models::views::{
    CollectionFilter, CollectionItemRow, CollectionProgress, CollectionsStatus, CountsByType,
};
use crate::net::network::Network;
use crate::repo::collections;
use crate::repo::error::RepoError;
use crate::services::collections::builder::build_collections;
use crate::services::collections::sync::{sync_collection, CollectionSyncResult};
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

/// Rebuilds the collections catalog from XIVAPI and FFXIV Collect; ownership is untouched.
#[tauri::command]
pub async fn collections_refresh(
    state: State<'_, AppState>,
    net: State<'_, Network>,
) -> CommandResult<CollectionsStatus> {
    let built = build_collections(net.inner()).await?;
    let mut store = state.store();
    let data = built.into_data(store.catalog.game_version.as_deref(), Utc::now());
    store.set_collections(data).map_err(RepoError::from)?;
    Ok(collections::collections_status(&store))
}

/// Marks owned the items the Lodestone lists for this collection.
#[tauri::command]
pub async fn collections_sync(
    state: State<'_, AppState>,
    net: State<'_, Network>,
    kind: CollectionType,
) -> CommandResult<CollectionSyncResult> {
    Ok(sync_collection(&state, &net, kind, Utc::now()).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_support::sample_app;
    use crate::models::views::CollectionStatus;
    use tauri::Manager;
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

    #[tokio::test]
    async fn refresh_replaces_the_catalog_but_keeps_ownership() {
        let mut server = mockito::Server::new_async().await;
        server
            .mock("GET", mockito::Matcher::Regex("^/sheet/".into()))
            .match_query(mockito::Matcher::Any)
            .with_body(r#"{"rows":[]}"#)
            .create_async()
            .await;
        server
            .mock("GET", mockito::Matcher::Regex("^/collect/".into()))
            .match_query(mockito::Matcher::Any)
            .with_status(503)
            .create_async()
            .await;
        let t = crate::commands::test_support::network_app(&server.url());
        collections_set_owned(t.state(), Mount, 1, true).unwrap();
        t.state().store().catalog.game_version = Some("7.5".into());

        let status = collections_refresh(t.state(), t.app.state::<Network>())
            .await
            .unwrap();

        assert!(!status.seeded);
        let state = t.state();
        let store = state.store();
        assert_eq!(store.collections.game_version.as_deref(), Some("7.5"));
        assert!(store.user.collections["mount:1"].owned);
    }

    #[tokio::test]
    async fn a_failed_refresh_keeps_the_collections() {
        let mut server = mockito::Server::new_async().await;
        server
            .mock("GET", mockito::Matcher::Any)
            .match_query(mockito::Matcher::Any)
            .with_status(404)
            .create_async()
            .await;
        let t = crate::commands::test_support::network_app(&server.url());

        let err = collections_refresh(t.state(), t.app.state::<Network>())
            .await
            .unwrap_err();

        assert_eq!(
            serde_json::to_value(err).unwrap(),
            "XIVAPI HTTP 404 (Mount)"
        );
        assert_eq!(t.state().store().collections.items.len(), 4);
    }

    #[tokio::test]
    async fn sync_rejects_a_collection_not_on_the_lodestone() {
        let t = crate::commands::test_support::network_app("http://127.0.0.1:1");
        let result = collections_sync(
            t.state(),
            t.app.state::<Network>(),
            CollectionType::Orchestrion,
        )
        .await
        .unwrap();
        assert!(!result.ok);
    }
}
