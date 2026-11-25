pub mod commands;
pub mod models;
pub mod net;
pub mod repo;
pub mod sanitize;
pub mod services;
pub mod shared;
pub mod state;
pub mod store;

use tauri::Manager;

use net::network::Network;
use services::icons::{IconCache, PREFETCH_CONCURRENCY};
use services::snapshots::Snapshots;
use state::AppState;
use store::paths::{StorePaths, DOCUMENTS_FOLDER_NAME};

/// Icons of the first catalog achievements, downloaded in the background at startup.
const STARTUP_PREFETCH_COUNT: usize = 100;

/// Application entry point: loads the state and registers the commands.
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let paths = StorePaths {
                data_dir: app.path().app_data_dir()?,
                documents_dir: app
                    .path()
                    .document_dir()
                    .ok()
                    .map(|d| d.join(DOCUMENTS_FOLDER_NAME)),
            };
            let snapshots = app
                .path()
                .resource_dir()
                .ok()
                .map(|dir| Snapshots::in_dir(&dir.join("resources")));
            let icons = IconCache::in_data_dir(&paths.data_dir);
            // The webview may load cached icons through `asset:`, and nothing else.
            std::fs::create_dir_all(icons.dir())?;
            app.asset_protocol_scope()
                .allow_directory(icons.dir(), true)?;
            let state = AppState::load(paths, snapshots.as_ref())?;
            let startup_icons: Vec<String> = state
                .store()
                .catalog
                .achievements
                .iter()
                .take(STARTUP_PREFETCH_COUNT)
                .filter_map(|a| a.icon_path.clone())
                .collect();
            let net = Network::default();
            let (prefetch_icons, prefetch_net) = (icons.clone(), net.clone());
            tauri::async_runtime::spawn(async move {
                prefetch_icons
                    .prefetch(&prefetch_net, startup_icons, PREFETCH_CONCURRENCY)
                    .await;
            });
            app.manage(state);
            app.manage(net);
            app.manage(icons);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::achievements::achievements_list,
            commands::achievements::achievements_get,
            commands::achievements::achievements_focus_list,
            commands::achievements::achievements_latest_patch,
            commands::achievements::achievements_set_completion,
            commands::achievements::achievements_set_priority,
            commands::achievements::achievements_set_focus,
            commands::achievements::achievements_reorder_focus,
            commands::achievements::achievements_set_note,
            commands::achievements::achievements_set_deadline,
            commands::achievements::achievements_set_tags,
            commands::achievements::dashboard_get,
            commands::achievements::history_undo,
            commands::achievements::history_redo,
            commands::achievements::history_can_undo,
            commands::achievements::history_can_redo,
            commands::catalog::catalog_status,
            commands::catalog::meta_kinds,
            commands::catalog::meta_categories,
            commands::catalog::meta_tags,
            commands::catalog::meta_patches,
            commands::catalog::meta_seasonal_events,
            commands::collections::collections_status,
            commands::collections::collections_pending,
            commands::collections::collections_all_progress,
            commands::collections::collections_patches,
            commands::collections::collections_list,
            commands::collections::collections_categories,
            commands::collections::collections_progress,
            commands::collections::collections_set_owned,
            commands::collections::collections_refresh,
            commands::collections::collections_sync,
            commands::difficulty::difficulty_get,
            commands::difficulty::difficulty_all,
            commands::difficulty::difficulty_stats,
            commands::difficulty::difficulty_filter,
            commands::difficulty::difficulty_sort,
            commands::difficulty::difficulty_weights,
            commands::difficulty::difficulty_recalculate,
            commands::difficulty::suggestions_get,
            commands::network::catalog_refresh,
            commands::network::lodestone_sync,
            commands::network::icons_get_url,
            commands::network::icons_prefetch,
            commands::recurring::recurring_list,
            commands::recurring::recurring_add,
            commands::recurring::recurring_delete,
            commands::recurring::recurring_set_done,
            commands::recurring::recurring_pending,
            commands::settings::settings_get,
            commands::settings::settings_update,
            commands::settings::lodestone_sync_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Tauri application");
}
