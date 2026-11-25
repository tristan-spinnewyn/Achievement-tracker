//! Settings updates and the Lodestone sync log.

use serde_json::Value;

use super::error::RepoResult;
use crate::models::settings::Settings;
use crate::models::user::SyncLogEntry;
use crate::sanitize::settings::sanitize_settings;
use crate::store::Store;

const MAX_SYNC_LOG: usize = 50;

/// Applies the valid keys of an untrusted partial update and saves.
pub fn update_settings(store: &mut Store, partial: &Value) -> RepoResult<Settings> {
    store.user.settings.apply(sanitize_settings(partial));
    store.save_user()?;
    Ok(store.user.settings.clone())
}

/// Adds an entry at the top of the log, keeping the 50 most recent.
pub fn add_sync_log(store: &mut Store, entry: SyncLogEntry) -> RepoResult<()> {
    store.user.sync_log.insert(0, entry);
    store.user.sync_log.truncate(MAX_SYNC_LOG);
    Ok(store.save_user()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::settings::{Region, Theme};
    use crate::repo::test_support::empty_store;
    use serde_json::json;

    #[test]
    fn applies_only_known_settings_with_the_right_type() {
        let mut t = empty_store();
        let s = update_settings(
            &mut t.store,
            &json!({ "region": "mars", "theme": "light", "injected": true, "lodestoneCharacterId": { "$": 1 } }),
        )
        .unwrap();

        assert_eq!(s.region, Region::Eu);
        assert_eq!(s.theme, Theme::Light);
        assert_eq!(s.lodestone_character_id, None);
        assert_eq!(t.store.user.settings, s);
        let saved = std::fs::read_to_string(t.dir_path().join("userdata.json")).unwrap();
        assert!(saved.contains("\"theme\":\"light\""));
    }

    #[test]
    fn ignores_a_non_object_update() {
        let mut t = empty_store();
        assert_eq!(
            update_settings(&mut t.store, &json!(null)).unwrap(),
            Settings::default()
        );
    }

    #[test]
    fn keeps_the_most_recent_sync_entries_first() {
        let mut t = empty_store();
        for n in 0..(MAX_SYNC_LOG + 3) {
            let entry = SyncLogEntry {
                message: format!("sync {n}"),
                ..Default::default()
            };
            add_sync_log(&mut t.store, entry).unwrap();
        }
        let log = &t.store.user.sync_log;
        assert_eq!(log.len(), MAX_SYNC_LOG);
        assert_eq!(log[0].message, format!("sync {}", MAX_SYNC_LOG + 2));
    }
}
