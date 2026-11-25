pub mod commands;
pub mod models;
pub mod net;
pub mod platform;
pub mod repo;
pub mod sanitize;
pub mod services;
pub mod shared;
pub mod state;
pub mod store;

use tauri_plugin_window_state::StateFlags;

/// Application entry point: registers the plugins and the commands, then starts.
pub fn run() {
    tauri::Builder::default()
        // First, so a second launch only brings the running window to the front.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            platform::window::focus_main_window(app);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        // Links are opened from Rust (https only): no script injected in the page.
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .setup(platform::setup::setup)
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
            commands::backup::data_export,
            commands::backup::data_import,
            commands::backup::data_auto_backup_info,
            commands::backup::data_open_documents_folder,
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
            commands::updater::updater_app_version,
            commands::updater::updater_status,
            commands::updater::updater_check,
            commands::updater::updater_download,
            commands::updater::updater_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Tauri application");
}
