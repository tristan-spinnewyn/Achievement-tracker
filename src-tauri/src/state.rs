//! In-memory application state shared by the Tauri commands.

use std::path::Path;

use crate::models::settings::Settings;
use crate::store::user_data::{load_settings, USER_DATA_FILE};

pub struct AppState {
    pub settings: Settings,
}

impl AppState {
    /// Loads the state from the app data folder.
    pub fn load(data_dir: &Path) -> Self {
        Self { settings: load_settings(&data_dir.join(USER_DATA_FILE)) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::settings::Region;

    #[test]
    fn loads_settings_from_the_user_file_in_the_data_folder() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(USER_DATA_FILE), r#"{"settings":{"region":"ja"}}"#).unwrap();

        assert_eq!(AppState::load(dir.path()).settings.region, Region::Ja);
    }
}
