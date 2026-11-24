pub mod commands;
pub mod models;
pub mod sanitize;
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
        .invoke_handler(tauri::generate_handler![commands::settings::settings_get])
        .run(tauri::generate_context!())
        .expect("error while running the Tauri application");
}
