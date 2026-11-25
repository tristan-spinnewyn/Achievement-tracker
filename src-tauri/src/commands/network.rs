//! Network commands (Electron channels `catalog:refresh`, `lodestone:sync`, `icons:*`).
//!
//! The store lock is never held while waiting for the network.

use chrono::Utc;
use tauri::State;

use super::error::CommandResult;
use crate::models::views::{CatalogStatus, SyncResult};
use crate::net::network::Network;
use crate::repo::catalog::catalog_status;
use crate::services::catalog_refresh::fetch_catalog;
use crate::services::difficulty::refresh_difficulties;
use crate::services::icons::{IconCache, PREFETCH_CONCURRENCY};
use crate::services::lodestone::sync_lodestone;
use crate::state::AppState;

/// Rebuilds the catalog from XIVAPI in the settings language, then the difficulties.
#[tauri::command]
pub async fn catalog_refresh(
    state: State<'_, AppState>,
    net: State<'_, Network>,
) -> CommandResult<CatalogStatus> {
    let language = state.store().user.settings.language;
    let catalog = fetch_catalog(&net, language, Utc::now()).await?;
    let mut store = state.store();
    store
        .set_catalog(catalog)
        .map_err(crate::repo::error::RepoError::from)?;
    refresh_difficulties(&mut store);
    Ok(catalog_status(&store))
}

#[tauri::command]
pub async fn lodestone_sync(
    state: State<'_, AppState>,
    net: State<'_, Network>,
) -> CommandResult<SyncResult> {
    Ok(sync_lodestone(&state, &net, Utc::now()).await?)
}

#[tauri::command]
pub fn icons_get_url(
    icons: State<'_, IconCache>,
    net: State<'_, Network>,
    icon_path: Option<String>,
) -> Option<String> {
    icons.icon_url(&net, icon_path.as_deref()?)
}

/// Starts downloading the icons in the background and returns at once.
#[tauri::command]
pub fn icons_prefetch(
    icons: State<'_, IconCache>,
    net: State<'_, Network>,
    icon_paths: Vec<Option<String>>,
) {
    let (icons, net) = (icons.inner().clone(), net.inner().clone());
    let paths = icon_paths.into_iter().flatten().collect();
    tauri::async_runtime::spawn(
        async move { icons.prefetch(&net, paths, PREFETCH_CONCURRENCY).await },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_support::network_app;
    use mockito::Matcher;
    use serde_json::json;
    use tauri::Manager;

    #[tokio::test]
    async fn refreshes_the_catalog_and_the_difficulties() {
        let mut server = mockito::Server::new_async().await;
        let row = json!({ "row_id": 50, "fields": { "Name": "Nouveau", "Points": 10,
            "AchievementCategory": { "row_id": 1, "fields": { "Name": "Cat", "Order": 1 } } } });
        server
            .mock("GET", "/sheet/Achievement")
            .match_query(Matcher::Regex("fields=[^&]*$".into()))
            .with_body(json!({ "version": "7.6", "rows": [row] }).to_string())
            .create_async()
            .await;
        server
            .mock("GET", "/sheet/Achievement")
            .match_query(Matcher::UrlEncoded("after".into(), "50".into()))
            .with_body(json!({ "rows": [] }).to_string())
            .create_async()
            .await;
        server
            .mock("GET", "/collect/achievements")
            .match_query(Matcher::Any)
            .with_status(503)
            .create_async()
            .await;
        let t = network_app(&server.url());

        let status = catalog_refresh(t.state(), t.app.state::<Network>())
            .await
            .unwrap();

        assert_eq!(
            (status.achievement_count, status.game_version.as_deref()),
            (1, Some("7.6"))
        );
        assert!(t.state().store().difficulties.contains_key(&50));
    }

    #[tokio::test]
    async fn a_failed_refresh_keeps_the_catalog() {
        let mut server = mockito::Server::new_async().await;
        server
            .mock("GET", "/sheet/Achievement")
            .match_query(Matcher::Any)
            .with_status(404)
            .create_async()
            .await;
        let t = network_app(&server.url());

        let err = catalog_refresh(t.state(), t.app.state::<Network>())
            .await
            .unwrap_err();

        assert_eq!(serde_json::to_value(err).unwrap(), "HTTP 404");
        assert_eq!(t.state().store().catalog.achievements.len(), 3);
    }

    #[tokio::test]
    async fn sync_reports_a_missing_character_id() {
        let t = network_app("http://127.0.0.1:1");
        let result = lodestone_sync(t.state(), t.app.state::<Network>())
            .await
            .unwrap();
        assert!(!result.ok);
    }

    #[tokio::test]
    async fn icon_urls_fall_back_to_xivapi_and_prefetch_runs_in_background() {
        let mut server = mockito::Server::new_async().await;
        let asset = server
            .mock("GET", "/asset")
            .match_query(Matcher::Any)
            .with_body("png")
            .create_async()
            .await;
        let t = network_app(&server.url());
        let (icons, net) = (t.app.state::<IconCache>(), t.app.state::<Network>());

        let url = icons_get_url(icons.clone(), net.clone(), Some("ui/icon/1.tex".into())).unwrap();
        assert!(url.starts_with(&format!("{}/asset?path=", server.url())));
        assert_eq!(icons_get_url(icons.clone(), net.clone(), None), None);

        icons_prefetch(
            icons.clone(),
            net.clone(),
            vec![Some("ui/icon/1.tex".into()), None],
        );
        for _ in 0..100 {
            if icons.local_path("ui/icon/1.tex").is_some() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        asset.assert_async().await;
        assert!(icons.local_path("ui/icon/1.tex").is_some());
    }
}
