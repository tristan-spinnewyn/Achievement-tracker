//! Validation of settings coming from the renderer or from a file.

use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::models::settings::{Language, Region, Settings, SuggestionWeights, Theme};

/// Validated subset of the settings: only known keys with the right type.
/// `Some(None)` sets a nullable field to null.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct SettingsPatch {
    pub lodestone_character_id: Option<Option<String>>,
    pub region: Option<Region>,
    pub language: Option<Language>,
    pub last_sync_at: Option<Option<String>>,
    pub theme: Option<Theme>,
    pub auto_sync: Option<bool>,
    pub auto_backup_documents: Option<bool>,
    pub suggestion_weights: Option<SuggestionWeights>,
}

/// `Some(value)` when the key holds a string or null.
fn nullable_string(value: Option<&Value>) -> Option<Option<String>> {
    match value? {
        Value::Null => Some(None),
        Value::String(s) => Some(Some(s.clone())),
        _ => None,
    }
}

/// `Some(variant)` when the key holds one of the enum's string values.
fn string_enum<T: DeserializeOwned>(value: Option<&Value>) -> Option<T> {
    value
        .filter(|v| v.is_string())
        .and_then(|v| serde_json::from_value(v.clone()).ok())
}

/// All three weights must be finite numbers, otherwise the weights are ignored.
fn suggestion_weights(value: Option<&Value>) -> Option<SuggestionWeights> {
    let weights = value?.as_object()?;
    let weight = |key: &str| weights.get(key)?.as_f64().filter(|w| w.is_finite());
    Some(SuggestionWeights {
        priority: weight("priority")?,
        points: weight("points")?,
        category_proximity: weight("categoryProximity")?,
    })
}

/// Keeps only known settings with the right type; anything else is dropped.
pub fn sanitize_settings(raw: &Value) -> SettingsPatch {
    let Some(raw) = raw.as_object() else {
        return SettingsPatch::default();
    };
    SettingsPatch {
        lodestone_character_id: nullable_string(raw.get("lodestoneCharacterId")),
        region: string_enum(raw.get("region")),
        language: string_enum(raw.get("language")),
        last_sync_at: nullable_string(raw.get("lastSyncAt")),
        theme: string_enum(raw.get("theme")),
        auto_sync: raw.get("autoSync").and_then(Value::as_bool),
        auto_backup_documents: raw.get("autoBackupDocuments").and_then(Value::as_bool),
        suggestion_weights: suggestion_weights(raw.get("suggestionWeights")),
    }
}

impl Settings {
    /// Applies a validated patch, like `{ ...settings, ...patch }` in TS.
    pub fn apply(&mut self, patch: SettingsPatch) {
        if let Some(v) = patch.lodestone_character_id {
            self.lodestone_character_id = v;
        }
        if let Some(v) = patch.region {
            self.region = v;
        }
        if let Some(v) = patch.language {
            self.language = v;
        }
        if let Some(v) = patch.last_sync_at {
            self.last_sync_at = v;
        }
        if let Some(v) = patch.theme {
            self.theme = v;
        }
        if let Some(v) = patch.auto_sync {
            self.auto_sync = v;
        }
        if let Some(v) = patch.auto_backup_documents {
            self.auto_backup_documents = v;
        }
        if let Some(v) = patch.suggestion_weights {
            self.suggestion_weights = v;
        }
    }

    /// Settings read from an untrusted value: defaults overridden by the valid keys.
    pub fn from_untrusted(raw: &Value) -> Self {
        let mut settings = Self::default();
        settings.apply(sanitize_settings(raw));
        settings
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keeps_known_settings_with_the_right_type() {
        let patch = sanitize_settings(&json!({
            "lodestoneCharacterId": "123",
            "region": "na",
            "language": "en",
            "lastSyncAt": null,
            "theme": "light",
            "autoSync": true,
            "autoBackupDocuments": false,
            "suggestionWeights": { "priority": 1, "points": 2.5, "categoryProximity": 0 }
        }));

        assert_eq!(patch.lodestone_character_id, Some(Some("123".into())));
        assert_eq!(patch.region, Some(Region::Na));
        assert_eq!(patch.language, Some(Language::En));
        assert_eq!(patch.last_sync_at, Some(None));
        assert_eq!(patch.theme, Some(Theme::Light));
        assert_eq!(patch.auto_sync, Some(true));
        assert_eq!(patch.auto_backup_documents, Some(false));
        assert_eq!(
            patch.suggestion_weights,
            Some(SuggestionWeights {
                priority: 1.0,
                points: 2.5,
                category_proximity: 0.0
            })
        );
    }

    #[test]
    fn drops_unknown_values_wrong_types_and_incomplete_weights() {
        let patch = sanitize_settings(&json!({
            "region": "mars",
            "language": 3,
            "theme": "blue",
            "autoSync": "yes",
            "lodestoneCharacterId": { "$": 1 },
            "lastSyncAt": 12,
            "injected": true,
            "suggestionWeights": { "priority": 1, "points": "2" }
        }));
        assert_eq!(patch, SettingsPatch::default());
    }

    #[test]
    fn a_non_object_yields_an_empty_patch() {
        assert_eq!(sanitize_settings(&json!(null)), SettingsPatch::default());
        assert_eq!(sanitize_settings(&json!([1, 2])), SettingsPatch::default());
    }

    #[test]
    fn apply_overrides_only_the_patched_fields() {
        let mut settings = Settings {
            lodestone_character_id: Some("1".into()),
            ..Settings::default()
        };
        settings.apply(SettingsPatch {
            theme: Some(Theme::Light),
            lodestone_character_id: Some(None),
            ..SettingsPatch::default()
        });

        assert_eq!(settings.theme, Theme::Light);
        assert_eq!(settings.lodestone_character_id, None);
        assert_eq!(settings.region, Region::Eu);
    }

    #[test]
    fn apply_sets_every_patchable_field() {
        let mut settings = Settings::default();
        let weights = SuggestionWeights {
            priority: 9.0,
            points: 8.0,
            category_proximity: 7.0,
        };
        settings.apply(SettingsPatch {
            lodestone_character_id: Some(Some("42".into())),
            region: Some(Region::Ja),
            language: Some(Language::De),
            last_sync_at: Some(Some("2026-01-01".into())),
            theme: Some(Theme::Light),
            auto_sync: Some(true),
            auto_backup_documents: Some(false),
            suggestion_weights: Some(weights.clone()),
        });

        assert_eq!(
            settings,
            Settings {
                lodestone_character_id: Some("42".into()),
                region: Region::Ja,
                language: Language::De,
                last_sync_at: Some("2026-01-01".into()),
                theme: Theme::Light,
                auto_sync: true,
                suggestion_weights: weights,
                auto_backup_documents: false,
            }
        );
    }

    #[test]
    fn from_untrusted_keeps_defaults_for_invalid_keys() {
        let settings = Settings::from_untrusted(&json!({ "region": "mars", "theme": "light" }));
        assert_eq!(settings.region, Region::Eu);
        assert_eq!(settings.theme, Theme::Light);
    }
}
