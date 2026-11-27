//! Settings and sync log commands.

use serde_json::Value;
use tauri::State;

use super::error::CommandResult;
use crate::models::settings::Settings;
use crate::models::user::SyncLogEntry;
use crate::repo::settings;
use crate::state::AppState;

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Settings {
    state.store().user.settings.clone()
}

/// The partial update is validated key by key (unknown or mistyped keys are ignored).
#[tauri::command]
pub fn settings_update(state: State<'_, AppState>, partial: Value) -> CommandResult<Settings> {
    Ok(settings::update_settings(&mut state.store(), &partial)?)
}

#[tauri::command]
pub fn lodestone_sync_log(state: State<'_, AppState>) -> Vec<SyncLogEntry> {
    state.store().user.sync_log.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_support::sample_app;
    use crate::models::settings::Theme;
    use serde_json::json;

    #[test]
    fn reads_and_updates_settings() {
        let t = sample_app();
        assert_eq!(settings_get(t.state()).theme, Theme::Dark);
        let updated =
            settings_update(t.state(), json!({ "theme": "light", "region": "mars" })).unwrap();
        assert_eq!(updated.theme, Theme::Light);
        assert_eq!(settings_get(t.state()), updated);
        assert!(lodestone_sync_log(t.state()).is_empty());
    }
}
