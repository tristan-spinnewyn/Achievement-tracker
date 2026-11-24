//! Settings commands (Electron channels `settings:*`).

use tauri::State;

use crate::models::settings::Settings;
use crate::state::AppState;

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Settings {
    state.store().user.settings.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::settings::Theme;
    use crate::store::paths::StorePaths;
    use crate::store::Store;
    use tauri::Manager;

    #[test]
    fn settings_get_returns_the_stored_settings() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::load(StorePaths {
            data_dir: dir.path().to_path_buf(),
            documents_dir: None,
        })
        .unwrap();
        store.user.settings.theme = Theme::Light;
        let app = tauri::test::mock_app();
        app.manage(AppState::new(store));

        assert_eq!(settings_get(app.state::<AppState>()).theme, Theme::Light);
    }
}
