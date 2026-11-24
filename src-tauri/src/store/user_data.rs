//! Reading `userdata.json`, the user's file kept in the app data folder.

use std::fs;
use std::path::Path;

use serde::Deserialize;

use crate::models::settings::Settings;

pub const USER_DATA_FILE: &str = "userdata.json";

/// Only the part of `userdata.json` ported so far; other keys are ignored.
#[derive(Deserialize, Default)]
#[serde(default)]
struct UserFile {
    settings: Settings,
}

/// Loads the settings from a `userdata.json` file.
/// A missing or unreadable file yields the default settings.
pub fn load_settings(path: &Path) -> Settings {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<UserFile>(&raw).ok())
        .unwrap_or_default()
        .settings
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::settings::{Language, Region, Theme};
    use std::fs;

    fn write_user_file(content: &str) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(USER_DATA_FILE), content).unwrap();
        dir
    }

    #[test]
    fn missing_file_yields_default_settings() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load_settings(&dir.path().join(USER_DATA_FILE)), Settings::default());
    }

    #[test]
    fn invalid_json_yields_default_settings() {
        let dir = write_user_file("{ not json");
        assert_eq!(load_settings(&dir.path().join(USER_DATA_FILE)), Settings::default());
    }

    #[test]
    fn stored_values_override_defaults_and_missing_keys_keep_them() {
        let dir = write_user_file(
            r#"{
                "progress": {},
                "settings": {
                    "lodestoneCharacterId": "12345",
                    "region": "na",
                    "theme": "light",
                    "suggestionWeights": { "points": 5 }
                }
            }"#,
        );

        let settings = load_settings(&dir.path().join(USER_DATA_FILE));

        assert_eq!(settings.lodestone_character_id.as_deref(), Some("12345"));
        assert_eq!(settings.region, Region::Na);
        assert_eq!(settings.theme, Theme::Light);
        assert_eq!(settings.language, Language::Fr);
        assert!(settings.auto_backup_documents);
        assert_eq!(settings.suggestion_weights.points, 5.0);
        assert_eq!(settings.suggestion_weights.priority, 3.0);
    }

    #[test]
    fn file_without_settings_yields_default_settings() {
        let dir = write_user_file(r#"{ "progress": {} }"#);
        assert_eq!(load_settings(&dir.path().join(USER_DATA_FILE)), Settings::default());
    }

    #[test]
    fn settings_serialize_with_the_frontend_field_names() {
        let json = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(json["region"], "eu");
        assert_eq!(json["lodestoneCharacterId"], serde_json::Value::Null);
        assert_eq!(json["suggestionWeights"]["categoryProximity"], 2.0);
        assert_eq!(json["autoBackupDocuments"], true);
    }
}
