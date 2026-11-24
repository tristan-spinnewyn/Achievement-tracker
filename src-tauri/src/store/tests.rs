use std::fs;
use std::path::Path;

use serde_json::{json, Value};
use tempfile::TempDir;

use super::*;
use crate::models::collections::{CollectionOwnership, CollectionType};
use crate::models::settings::{Region, Theme};
use crate::models::user::Progress;

struct Dirs {
    _root: TempDir,
    paths: StorePaths,
}

fn dirs() -> Dirs {
    let root = tempfile::tempdir().unwrap();
    let paths = StorePaths {
        data_dir: root.path().join("data"),
        documents_dir: Some(root.path().join("docs")),
    };
    Dirs { _root: root, paths }
}

fn write_json(path: &Path, value: &Value) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, value.to_string()).unwrap();
}

fn read_json_file(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

fn sample_catalog() -> Value {
    json!({
        "generatedAt": "2026-11-01", "gameVersion": "7.5",
        "kinds": [{ "id": 1, "name": "Battle", "order": 1 }],
        "categories": [{ "id": 10, "kindId": 1, "name": "Raids", "order": 1 }],
        "achievements": [{
            "id": 100, "name": "Raider", "description": "", "points": 10, "categoryId": 10,
            "kindId": 1, "iconPath": null, "obtainable": true, "patch": "7.5"
        }]
    })
}

fn sample_collections() -> Value {
    json!({
        "generatedAt": null, "gameVersion": null, "categories": [],
        "items": [{
            "type": "mount", "id": 1, "name": "Chocobo", "description": "", "iconPath": null,
            "categoryId": null, "order": 1, "patch": null
        }]
    })
}

fn user_with_progress() -> UserData {
    let mut user = UserData::default();
    user.progress.insert(
        "100".into(),
        Progress {
            achievement_id: 100,
            completed: true,
            ..Progress::default()
        },
    );
    user
}

#[test]
fn load_from_an_empty_folder_yields_empty_data_and_creates_the_folder() {
    let d = dirs();
    let store = Store::load(d.paths.clone()).unwrap();

    assert!(d.paths.data_dir.is_dir());
    assert_eq!(store.catalog, CatalogData::default());
    assert_eq!(store.collections, CollectionsData::default());
    assert_eq!(store.user, UserData::default());
}

#[test]
fn load_reads_the_files_and_builds_the_indexes() {
    let d = dirs();
    write_json(&d.paths.catalog(), &sample_catalog());
    write_json(&d.paths.collections(), &sample_collections());
    write_json(
        &d.paths.user(),
        &json!({ "settings": { "theme": "light" }, "progress": { "100": { "completed": true } } }),
    );

    let store = Store::load(d.paths.clone()).unwrap();

    assert_eq!(store.catalog.achievements.len(), 1);
    assert_eq!(store.kind_by_id[&1].name, "Battle");
    assert_eq!(store.category_by_id[&10].name, "Raids");
    assert_eq!(store.achievement_by_id[&100].points, 10);
    assert_eq!(
        store.collection_item_by_key["mount:1"].kind,
        CollectionType::Mount
    );
    assert_eq!(store.user.settings.theme, Theme::Light);
    assert!(store.user.progress["100"].completed);
}

#[test]
fn load_ignores_unreadable_catalog_and_collections() {
    let d = dirs();
    fs::create_dir_all(&d.paths.data_dir).unwrap();
    fs::write(d.paths.catalog(), "{ broken").unwrap();
    write_json(&d.paths.collections(), &json!({ "items": "oops" }));

    let store = Store::load(d.paths.clone()).unwrap();

    assert_eq!(store.catalog, CatalogData::default());
    assert_eq!(store.collections, CollectionsData::default());
}

#[test]
fn load_restores_the_sanitized_documents_mirror_when_there_is_no_local_progress() {
    let d = dirs();
    write_json(
        &d.paths.documents_backup().unwrap(),
        &json!({
            "settings": { "region": "mars", "theme": "light", "injected": true },
            "progress": { "1": { "achievementId": 1, "completed": true } },
            "undoStack": [{ "type": "setNote", "achievementId": "__proto__", "previousData": {}, "newData": {} }]
        }),
    );

    let store = Store::load(d.paths.clone()).unwrap();

    assert_eq!(store.user.settings.region, Region::Eu);
    assert_eq!(store.user.settings.theme, Theme::Light);
    assert!(store.user.progress["1"].completed);
    assert!(store.user.undo_stack.is_empty());
}

#[test]
fn load_keeps_local_progress_over_the_documents_mirror() {
    let d = dirs();
    write_json(
        &d.paths.user(),
        &json!({ "progress": { "5": { "completed": true } } }),
    );
    write_json(
        &d.paths.documents_backup().unwrap(),
        &json!({ "progress": { "1": { "completed": true } } }),
    );

    let store = Store::load(d.paths.clone()).unwrap();

    assert_eq!(store.user.progress.keys().collect::<Vec<_>>(), ["5"]);
}

#[test]
fn load_ignores_a_documents_mirror_that_is_not_a_backup() {
    let d = dirs();
    write_json(
        &d.paths.documents_backup().unwrap(),
        &json!({ "progress": [] }),
    );

    let store = Store::load(d.paths.clone()).unwrap();

    assert_eq!(store.user, UserData::default());
}

#[test]
fn load_fails_when_the_data_folder_cannot_be_created() {
    let d = dirs();
    fs::create_dir_all(d.paths.data_dir.parent().unwrap()).unwrap();
    fs::write(&d.paths.data_dir, "a file, not a folder").unwrap();

    assert!(Store::load(d.paths.clone()).is_err());
}

#[test]
fn save_user_writes_the_user_file_and_the_pretty_printed_documents_mirror() {
    let d = dirs();
    let mut store = Store::load(d.paths.clone()).unwrap();
    store.user = user_with_progress();

    store.save_user().unwrap();

    assert_eq!(
        read_json_file(&d.paths.user())["progress"]["100"]["completed"],
        true
    );
    let mirror = fs::read_to_string(d.paths.documents_backup().unwrap()).unwrap();
    assert!(
        mirror.contains("\n  \"settings\""),
        "mirror is not pretty-printed"
    );
}

#[test]
fn save_user_skips_the_mirror_when_disabled_or_without_documents_folder() {
    let d = dirs();
    let mut store = Store::load(d.paths.clone()).unwrap();
    store.user.settings.auto_backup_documents = false;
    store.save_user().unwrap();
    assert!(!d.paths.documents_backup().unwrap().exists());

    let no_docs = StorePaths {
        documents_dir: None,
        ..d.paths.clone()
    };
    let store = Store::load(no_docs).unwrap();
    store.save_user().unwrap();
    assert!(!d.paths.documents_backup().unwrap().exists());
}

#[test]
fn save_user_succeeds_even_when_the_mirror_cannot_be_written() {
    let d = dirs();
    let docs = d.paths.documents_dir.clone().unwrap();
    fs::create_dir_all(docs.parent().unwrap()).unwrap();
    fs::write(&docs, "a file, not a folder").unwrap();
    let store = Store::load(d.paths.clone()).unwrap();

    store.save_user().unwrap();

    assert!(d.paths.user().exists());
}

#[test]
fn replace_user_swaps_and_saves_the_user_data() {
    let d = dirs();
    let mut store = Store::load(d.paths.clone()).unwrap();
    let mut user = user_with_progress();
    user.collections.insert(
        "mount:1".into(),
        CollectionOwnership {
            owned: true,
            ..Default::default()
        },
    );

    store.replace_user(user.clone()).unwrap();

    assert_eq!(store.user, user);
    assert_eq!(
        read_json_file(&d.paths.user())["collections"]["mount:1"]["owned"],
        true
    );
}

#[test]
fn set_catalog_and_set_collections_save_and_reindex() {
    let d = dirs();
    let mut store = Store::load(d.paths.clone()).unwrap();

    store
        .set_catalog(serde_json::from_value(sample_catalog()).unwrap())
        .unwrap();
    store
        .set_collections(serde_json::from_value(sample_collections()).unwrap())
        .unwrap();

    assert!(store.achievement_by_id.contains_key(&100));
    assert!(store.collection_item_by_key.contains_key("mount:1"));
    assert_eq!(read_json_file(&d.paths.catalog())["gameVersion"], "7.5");
    assert_eq!(
        read_json_file(&d.paths.collections())["items"][0]["name"],
        "Chocobo"
    );
}
