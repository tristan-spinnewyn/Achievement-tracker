pub mod commands;
pub mod models;
pub mod state;
pub mod store;

use tauri::Manager;

use state::AppState;

/// Application entry point: loads the state and registers the commands.
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            app.manage(AppState::load(&data_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::settings::settings_get])
        .run(tauri::generate_context!())
        .expect("error while running the Tauri application");
}
