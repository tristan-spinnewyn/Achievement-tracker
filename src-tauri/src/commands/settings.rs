//! Settings commands (Electron channels `settings:*`).

use tauri::State;

use crate::models::settings::Settings;
use crate::state::AppState;

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Settings {
    state.settings.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::settings::Theme;
    use tauri::Manager;

    #[test]
    fn settings_get_returns_the_loaded_settings() {
        let app = tauri::test::mock_app();
        let settings = Settings { theme: Theme::Light, ..Settings::default() };
        app.manage(AppState { settings: settings.clone() });

        assert_eq!(settings_get(app.state::<AppState>()), settings);
    }
}
