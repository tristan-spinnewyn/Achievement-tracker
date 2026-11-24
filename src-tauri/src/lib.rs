pub mod commands;
pub mod models;
pub mod repo;
pub mod sanitize;
pub mod services;
pub mod shared;
pub mod state;
pub mod store;

use tauri::Manager;

use state::AppState;
use store::paths::{StorePaths, DOCUMENTS_FOLDER_NAME};

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
            app.manage(AppState::load(paths)?);
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
