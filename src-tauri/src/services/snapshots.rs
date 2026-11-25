//! Seeding from the snapshots bundled with the app (ports of `seedCatalogIfEmpty`
//! and `seedCollectionsIfEmpty`).
//!
//! The local copy is replaced when it is empty or older than the snapshot (new
//! build), but never when a runtime update (XIVAPI) made it newer. The user's
//! progress lives in `userdata.json` and is never touched.

use std::io;
use std::path::{Path, PathBuf};

use crate::models::catalog::CatalogData;
use crate::models::collections::CollectionsData;
use crate::store::json_file::read_json;
use crate::store::Store;

/// Where the bundled snapshots are.
#[derive(Debug, Clone, PartialEq)]
pub struct Snapshots {
    pub catalog: PathBuf,
    pub collections: PathBuf,
}

impl Snapshots {
    /// The layout of the `resources` folder shipped with the app.
    pub fn in_dir(resources_dir: &Path) -> Self {
        Self {
            catalog: resources_dir.join("catalog-snapshot.json"),
            collections: resources_dir.join("collections-snapshot.json"),
        }
    }
}

/// True when the snapshot should replace the stored copy.
fn snapshot_is_newer(stored_is_empty: bool, stored: Option<&str>, snapshot: Option<&str>) -> bool {
    match stored {
        _ if stored_is_empty => true,
        None => true,
        // ISO dates compare chronologically as strings, like the TS version.
        Some(stored) => snapshot.unwrap_or("") > stored,
    }
}

/// Replaces the catalog with the snapshot when it is newer; true if it did.
pub fn seed_catalog(store: &mut Store, snapshot: &Path) -> io::Result<bool> {
    // An empty snapshot is a broken file, never a reason to wipe the catalog.
    let Some(snap) = read_json::<CatalogData>(snapshot).filter(|s| !s.achievements.is_empty())
    else {
        return Ok(false);
    };
    let catalog = &store.catalog;
    if !snapshot_is_newer(
        catalog.achievements.is_empty(),
        catalog.generated_at.as_deref(),
        snap.generated_at.as_deref(),
    ) {
        return Ok(false);
    }
    store.set_catalog(snap)?;
    Ok(true)
}

/// Replaces the collections catalog with the snapshot when it is newer; true if it did.
pub fn seed_collections(store: &mut Store, snapshot: &Path) -> io::Result<bool> {
    let Some(snap) = read_json::<CollectionsData>(snapshot).filter(|s| !s.items.is_empty()) else {
        return Ok(false);
    };
    let collections = &store.collections;
    if !snapshot_is_newer(
        collections.items.is_empty(),
        collections.generated_at.as_deref(),
        snap.generated_at.as_deref(),
    ) {
        return Ok(false);
    }
    store.set_collections(snap)?;
    Ok(true)
}

/// Seeds both, logging failures instead of stopping the app start.
pub fn seed_all(store: &mut Store, snapshots: &Snapshots) {
    if let Err(err) = seed_catalog(store, &snapshots.catalog) {
        eprintln!("[catalog] cannot write the seeded catalog: {err}");
    }
    if let Err(err) = seed_collections(store, &snapshots.collections) {
        eprintln!("[collections] cannot write the seeded collections: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::test_support::{achievement, empty_store};
    use serde_json::json;

    fn write(dir: &Path, name: &str, value: serde_json::Value) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, value.to_string()).unwrap();
        path
    }

    fn catalog_snapshot(generated_at: &str) -> serde_json::Value {
        json!({
            "generatedAt": generated_at, "gameVersion": "7.5", "kinds": [], "categories": [],
            "achievements": [{ "id": 1, "name": "A", "description": "", "points": 10, "categoryId": 1,
                "kindId": 1, "iconPath": null, "obtainable": true, "patch": "7.5" }]
        })
    }

    #[test]
    fn newer_means_empty_undated_or_strictly_more_recent() {
        assert!(snapshot_is_newer(
            true,
            Some("2026-09-01"),
            Some("2026-01-01")
        ));
        assert!(snapshot_is_newer(false, None, Some("2026-01-01")));
        assert!(snapshot_is_newer(
            false,
            Some("2026-01-01"),
            Some("2026-09-01")
        ));
        assert!(!snapshot_is_newer(
            false,
            Some("2026-09-01"),
            Some("2026-01-01")
        ));
        assert!(!snapshot_is_newer(
            false,
            Some("2026-09-01"),
            Some("2026-09-01")
        ));
        assert!(!snapshot_is_newer(false, Some("2026-09-01"), None));
    }

    #[test]
    fn seeds_an_empty_catalog_and_saves_it() {
        let mut t = empty_store();
        let dir = tempfile::tempdir().unwrap();
        let snapshot = write(
            dir.path(),
            "catalog-snapshot.json",
            catalog_snapshot("2026-09-18"),
        );

        assert!(seed_catalog(&mut t.store, &snapshot).unwrap());

        assert_eq!(t.store.catalog.achievements.len(), 1);
        assert!(t.store.achievement_by_id.contains_key(&1));
        assert!(t.dir_path().join("catalog.json").exists());
    }

    #[test]
    fn keeps_a_catalog_updated_after_the_snapshot() {
        let mut t = empty_store();
        t.store.catalog.generated_at = Some("2026-11-01T00:00:00.000Z".into());
        t.store.catalog.achievements = vec![achievement(1, "A"), achievement(2, "B")];
        let dir = tempfile::tempdir().unwrap();
        let snapshot = write(
            dir.path(),
            "catalog-snapshot.json",
            catalog_snapshot("2026-09-18"),
        );

        assert!(!seed_catalog(&mut t.store, &snapshot).unwrap());
        assert_eq!(t.store.catalog.achievements.len(), 2);
    }

    #[test]
    fn a_missing_or_invalid_snapshot_changes_nothing() {
        let mut t = empty_store();
        let dir = tempfile::tempdir().unwrap();
        assert!(!seed_catalog(&mut t.store, &dir.path().join("missing.json")).unwrap());
        let broken = write(dir.path(), "broken.json", json!({ "items": "oops" }));
        assert!(!seed_collections(&mut t.store, &broken).unwrap());
        assert!(t.store.catalog.achievements.is_empty());
    }

    #[test]
    fn an_empty_snapshot_never_wipes_the_data() {
        let mut t = empty_store();
        t.store.catalog.achievements = vec![achievement(1, "A")];
        let dir = tempfile::tempdir().unwrap();
        let empty = write(
            dir.path(),
            "empty.json",
            json!({ "generatedAt": "2099-01-01", "achievements": [], "items": [] }),
        );

        assert!(!seed_catalog(&mut t.store, &empty).unwrap());
        assert!(!seed_collections(&mut t.store, &empty).unwrap());
        assert_eq!(t.store.catalog.achievements.len(), 1);
    }

    #[test]
    fn seeds_the_collections() {
        let mut t = empty_store();
        let dir = tempfile::tempdir().unwrap();
        let snapshot = write(
            dir.path(),
            "collections-snapshot.json",
            json!({ "generatedAt": "2026-09-20", "gameVersion": "7.5", "categories": [], "items": [{
                "type": "mount", "id": 1, "name": "Chocobo", "description": "", "iconPath": null,
                "categoryId": null, "order": 1, "patch": "2.0" }] }),
        );

        assert!(seed_collections(&mut t.store, &snapshot).unwrap());
        assert!(t.store.collection_item_by_key.contains_key("mount:1"));
    }

    #[test]
    fn seed_all_uses_the_resources_layout() {
        let mut t = empty_store();
        let dir = tempfile::tempdir().unwrap();
        write(
            dir.path(),
            "catalog-snapshot.json",
            catalog_snapshot("2026-09-18"),
        );

        seed_all(&mut t.store, &Snapshots::in_dir(dir.path()));

        assert_eq!(t.store.catalog.achievements.len(), 1);
        assert!(t.store.collections.items.is_empty());
    }
}
