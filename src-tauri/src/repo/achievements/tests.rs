use serde_json::json;

use super::*;
use crate::models::difficulty::{AchievementDifficulty, DifficultyLevel};
use crate::models::user::{Progress, SyncSource, UserMeta};
use crate::repo::test_support::sample_store;

fn ids(store: &Store, filter: serde_json::Value) -> Vec<u32> {
    let filter: AchievementFilter = serde_json::from_value(filter).unwrap();
    list_achievements(store, &filter)
        .iter()
        .map(|r| r.achievement.id)
        .collect()
}

fn difficulty(score: f64, level: DifficultyLevel) -> AchievementDifficulty {
    AchievementDifficulty {
        score,
        level,
        level_name: String::new(),
        color: String::new(),
        stars: String::new(),
    }
}

#[test]
fn filters_achievements() {
    let t = sample_store();
    let s = &t.store;
    assert_eq!(ids(s, json!({})), [1, 2, 3]);
    assert_eq!(ids(s, json!({ "obtainableOnly": true })), [1, 2]);
    assert_eq!(ids(s, json!({ "kindId": 2 })), [2]);
    assert_eq!(ids(s, json!({ "categoryId": 1 })), [1, 3]);
    assert_eq!(ids(s, json!({ "minPoints": 10, "maxPoints": 15 })), [3]);
    assert_eq!(
        ids(
            s,
            json!({ "seasonalOnly": true, "seasonalEvent": "Halloween" })
        ),
        [2]
    );
    assert_eq!(
        ids(s, json!({ "seasonalEvent": "Noël" })),
        Vec::<u32>::new()
    );
    assert_eq!(ids(s, json!({ "patch": "7.1" })), [1, 3]);
    assert_eq!(ids(s, json!({ "search": "bravo" })), [2]);
    assert_eq!(ids(s, json!({ "kindId": null, "search": null })), [1, 2, 3]);
}

#[test]
fn sorts_achievements() {
    let mut t = sample_store();
    let s = &mut t.store;
    s.user.progress.insert(
        "1".into(),
        Progress {
            completed: true,
            completed_date: Some("2026-02-01".into()),
            ..Default::default()
        },
    );
    s.user.progress.insert(
        "3".into(),
        Progress {
            completed: true,
            completed_date: Some("2026-01-01".into()),
            ..Default::default()
        },
    );
    assert_eq!(
        ids(s, json!({ "sortBy": "points", "sortDir": "desc" })),
        [2, 3, 1]
    );
    assert_eq!(ids(s, json!({ "sortBy": "patch" })), [2, 1, 3]);
    assert_eq!(
        ids(s, json!({ "sortBy": "patch", "sortDir": "desc" })),
        [1, 3, 2]
    );
    assert_eq!(ids(s, json!({ "sortBy": "category" })), [1, 3, 2]);
    assert_eq!(
        ids(s, json!({ "sortBy": "name", "sortDir": "desc" })),
        [3, 2, 1]
    );
    assert_eq!(ids(s, json!({ "sortBy": "completedDate" })), [2, 3, 1]);
}

#[test]
fn paginates_after_sorting() {
    let t = sample_store();
    assert_eq!(ids(&t.store, json!({ "offset": 1, "limit": 1 })), [2]);
    assert_eq!(ids(&t.store, json!({ "offset": 2 })), [3]);
    assert_eq!(ids(&t.store, json!({ "limit": 2 })), [1, 2]);
    assert_eq!(ids(&t.store, json!({ "offset": 10 })), Vec::<u32>::new());
}

#[test]
fn filters_and_sorts_by_user_state() {
    let mut t = sample_store();
    let s = &mut t.store;
    s.user.progress.insert(
        "1".into(),
        Progress {
            completed: true,
            source: SyncSource::Manual,
            ..Default::default()
        },
    );
    let meta = |priority, focus_order: Option<i64>, note: Option<&str>| UserMeta {
        priority,
        in_focus: focus_order.is_some(),
        focus_order,
        note: note.map(Into::into),
        ..Default::default()
    };
    s.user.user_meta.insert("1".into(), meta(3, Some(2), None));
    s.user
        .user_meta
        .insert("2".into(), meta(1, Some(1), Some("à faire")));
    s.user
        .tags_by_achievement
        .insert("2".into(), vec!["raid".into(), "solo".into()]);

    assert_eq!(ids(s, json!({ "status": "completed" })), [1]);
    assert_eq!(ids(s, json!({ "status": "todo" })), [2, 3]);
    assert_eq!(
        ids(s, json!({ "status": "focus", "sortBy": "focusOrder" })),
        [2, 1]
    );
    assert_eq!(ids(s, json!({ "sortBy": "focusOrder" })), [2, 1, 3]);
    assert_eq!(
        ids(s, json!({ "sortBy": "priority", "sortDir": "desc" })),
        [1, 2, 3]
    );
    assert_eq!(ids(s, json!({ "priority": 3 })), [1]);
    assert_eq!(ids(s, json!({ "hasNote": true })), [2]);
    assert_eq!(ids(s, json!({ "tags": ["raid", "solo"] })), [2]);
    assert_eq!(
        ids(s, json!({ "tags": ["raid", "pvp"] })),
        Vec::<u32>::new()
    );
    assert_eq!(
        focus_list(s)
            .iter()
            .map(|r| r.achievement.id)
            .collect::<Vec<_>>(),
        [2, 1]
    );
}

#[test]
fn filters_and_sorts_by_difficulty() {
    let mut t = sample_store();
    let s = &mut t.store;
    s.difficulties
        .insert(1, difficulty(80.0, DifficultyLevel::Hard));
    s.difficulties
        .insert(2, difficulty(10.0, DifficultyLevel::Easy));

    assert_eq!(ids(s, json!({ "difficultyLevel": "hard" })), [1]);
    assert_eq!(ids(s, json!({ "sortBy": "difficulty" })), [3, 2, 1]);
}

#[test]
fn builds_rows_with_names_progress_and_meta() {
    let mut t = sample_store();
    let s = &mut t.store;
    s.user.progress.insert(
        "2".into(),
        Progress {
            completed: true,
            completed_date: Some("2026-01-01".into()),
            source: SyncSource::Lodestone,
            ..Default::default()
        },
    );
    s.user.user_meta.insert(
        "2".into(),
        UserMeta {
            deadline: Some("2026-12-31".into()),
            ..Default::default()
        },
    );

    let row = achievement_row(s, 2).unwrap();

    assert_eq!(row.category_name, "Scénario");
    assert_eq!(row.kind_name, "Quêtes");
    assert!(row.completed);
    assert_eq!(row.source, Some(SyncSource::Lodestone));
    assert_eq!(row.deadline.as_deref(), Some("2026-12-31"));
    assert!(achievement_row(s, 999).is_none());
    let json = serde_json::to_value(&row).unwrap();
    assert_eq!(json["name"], "Bravo");
    assert_eq!(json["categoryName"], "Scénario");
}

#[test]
fn rows_of_unknown_category_or_kind_have_empty_names() {
    let mut t = sample_store();
    t.store.catalog.achievements[0].category_id = 99;
    t.store.catalog.achievements[0].kind_id = 99;
    let a = t.store.catalog.achievements[0].clone();

    let row = build_row(&t.store, &a);

    assert_eq!(row.category_name, "");
    assert_eq!(row.kind_name, "");
}

#[test]
fn counts_completed_progress_entries() {
    let mut t = sample_store();
    t.store.user.progress.insert(
        "1".into(),
        Progress {
            completed: true,
            ..Default::default()
        },
    );
    t.store.user.progress.insert(
        "2".into(),
        Progress {
            completed: false,
            ..Default::default()
        },
    );
    assert_eq!(count_completed(&t.store), 1);
}
