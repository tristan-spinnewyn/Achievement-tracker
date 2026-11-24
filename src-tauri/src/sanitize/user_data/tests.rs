use super::*;
use crate::models::settings::{Region, Theme};
use serde_json::json;

#[test]
fn rejects_values_that_do_not_look_like_a_backup() {
    for raw in [
        json!(null),
        json!([]),
        json!("x"),
        json!({}),
        json!({ "syncLog": [] }),
    ] {
        assert!(sanitize_imported_user(&raw).is_none(), "{raw} accepted");
    }
}

#[test]
fn rejects_a_backup_whose_main_sections_are_all_falsy() {
    for raw in [
        json!({ "settings": null, "progress": false, "collections": 0 }),
        json!({ "settings": "" }),
    ] {
        assert!(sanitize_imported_user(&raw).is_none(), "{raw} accepted");
    }
    // Truthy but wrong-shaped: passes the backup check, then fails the section check.
    assert!(sanitize_imported_user(&json!({ "progress": 1 })).is_none());
    assert!(sanitize_imported_user(&json!({ "settings": true })).is_none());
}

#[test]
fn rejects_a_backup_whose_section_has_the_wrong_shape() {
    for raw in [
        json!({ "settings": [] }),
        json!({ "progress": [] }),
        json!({ "progress": {}, "userMeta": 3 }),
        json!({ "progress": {}, "tagsByAchievement": [] }),
        json!({ "progress": {}, "collections": "x" }),
        json!({ "progress": {}, "collectionHashCache": "x" }),
        json!({ "progress": {}, "syncLog": {} }),
        json!({ "progress": {}, "undoStack": {} }),
        json!({ "progress": {}, "redoStack": 1 }),
        json!({ "progress": {}, "recurringTasks": {} }),
    ] {
        assert!(sanitize_imported_user(&raw).is_none(), "{raw} accepted");
    }
}

#[test]
fn keeps_valid_settings_and_drops_the_rest() {
    let user = sanitize_imported_user(&json!({
        "settings": { "region": "mars", "theme": "light", "injected": true }
    }))
    .unwrap();
    assert_eq!(user.settings.region, Region::Eu);
    assert_eq!(user.settings.theme, Theme::Light);
}

#[test]
fn keeps_progress_and_meta_only_under_numeric_keys() {
    let user = sanitize_imported_user(&json!({
        "progress": {
            "1": { "achievementId": 1, "completed": true },
            "__proto__": { "completed": true },
            "2": "oops"
        },
        "userMeta": { "3": { "achievementId": 3, "priority": 2 }, "x": {} }
    }))
    .unwrap();

    assert_eq!(user.progress.keys().collect::<Vec<_>>(), ["1"]);
    assert!(user.progress["1"].completed);
    assert_eq!(user.user_meta.keys().collect::<Vec<_>>(), ["3"]);
    assert_eq!(user.user_meta["3"].priority, 2);
}

#[test]
fn keeps_only_string_arrays_in_tags() {
    let user = sanitize_imported_user(&json!({
        "progress": {},
        "tagsByAchievement": { "1": ["raid", 3, "pvp"], "2": "oops", "3": [4], "__proto__": ["x"] }
    }))
    .unwrap();
    assert_eq!(user.tags_by_achievement.len(), 1);
    assert_eq!(user.tags_by_achievement["1"], ["raid", "pvp"]);
}

#[test]
fn keeps_only_well_keyed_collection_entries_and_string_hash_names() {
    let user = sanitize_imported_user(&json!({
        "collections": { "mount:1": { "owned": true }, "constructor": { "owned": true }, "mount:2": "oops" },
        "collectionHashCache": { "mount:ab12": "Chocobo", "mount:cd34": 7 }
    }))
    .unwrap();
    assert_eq!(user.collections.keys().collect::<Vec<_>>(), ["mount:1"]);
    assert!(user.collections["mount:1"].owned);
    assert_eq!(user.collection_hash_cache.len(), 1);
    assert_eq!(user.collection_hash_cache["mount:ab12"], "Chocobo");
}

#[test]
fn drops_undo_entries_whose_achievement_id_is_not_a_positive_integer() {
    let user = sanitize_imported_user(&json!({
        "progress": {},
        "undoStack": [
            { "type": "setNote", "achievementId": "__proto__", "timestamp": "", "previousData": { "note": "x" }, "newData": {} },
            { "type": "setNote", "achievementId": 12, "timestamp": "", "previousData": { "note": "ok" }, "newData": { "note": null } },
            { "type": "unknown", "achievementId": 12, "previousData": {}, "newData": {} },
            "garbage"
        ],
        "redoStack": [{ "type": "setPriority", "achievementId": 0, "previousData": {}, "newData": {} }]
    }))
    .unwrap();

    assert_eq!(user.undo_stack.len(), 1);
    assert_eq!(user.undo_stack[0].achievement_id, 12);
    assert_eq!(user.undo_stack[0].previous_data["note"], "ok");
    assert!(user.redo_stack.is_empty());
}

#[test]
fn keeps_recurring_tasks_with_string_id_and_name_and_neutralises_icon_paths() {
    let user = sanitize_imported_user(&json!({
        "progress": {},
        "recurringTasks": [
            { "id": "a", "name": "Roulette", "type": "daily", "iconPath": "../../etc/passwd", "createdAt": "" },
            { "id": "b", "name": "Cactpot", "type": "weekly", "iconPath": "ui/icon/1.tex", "createdAt": "" },
            { "id": 3, "name": "no id" },
            { "id": "c" }
        ]
    }))
    .unwrap();

    assert_eq!(user.recurring_tasks.len(), 2);
    assert_eq!(user.recurring_tasks[0].icon_path, None);
    assert_eq!(
        user.recurring_tasks[1].icon_path.as_deref(),
        Some("ui/icon/1.tex")
    );
}

#[test]
fn keeps_sync_log_objects_only() {
    let user = sanitize_imported_user(&json!({
        "progress": {},
        "syncLog": [{ "at": "2026-01-01", "ok": true, "newlyCompleted": 2 }, "x", 3]
    }))
    .unwrap();
    assert_eq!(user.sync_log.len(), 1);
    assert_eq!(user.sync_log[0].newly_completed, 2);
}

#[test]
fn lenient_parse_falls_back_per_section_instead_of_rejecting() {
    let user = parse_user_lenient(&json!({
        "settings": { "region": "na" },
        "progress": [],
        "tagsByAchievement": { "1": ["raid"] },
        "undoStack": "oops"
    }));
    assert_eq!(user.settings.region, Region::Na);
    assert!(user.progress.is_empty());
    assert_eq!(user.tags_by_achievement["1"], ["raid"]);
    assert!(user.undo_stack.is_empty());
}

#[test]
fn lenient_parse_of_a_non_object_yields_empty_user_data() {
    assert_eq!(parse_user_lenient(&json!(42)), UserData::default());
}
