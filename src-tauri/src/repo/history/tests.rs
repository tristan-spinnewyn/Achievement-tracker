use serde_json::json;

use super::*;
use crate::models::user::{Progress, UndoActionType};
use crate::repo::test_support::sample_store;

fn action(kind: UndoActionType, id: u32, previous: Value, new: Value) -> UndoableAction {
    UndoableAction {
        kind,
        achievement_id: id,
        timestamp: String::new(),
        previous_data: previous.as_object().unwrap().clone(),
        new_data: new.as_object().unwrap().clone(),
    }
}

#[test]
fn push_caps_the_history_and_clears_redo() {
    let mut user = UserData::default();
    user.redo_stack
        .push(action(UndoActionType::SetNote, 1, json!({}), json!({})));
    for id in 1..=(MAX_HISTORY as u32 + 5) {
        push_undo_action(
            &mut user,
            action(UndoActionType::SetNote, id, json!({}), json!({})),
        );
    }
    assert_eq!(user.undo_stack.len(), MAX_HISTORY);
    assert_eq!(user.undo_stack[0].achievement_id, 6);
    assert!(user.redo_stack.is_empty());
}

#[test]
fn undo_and_redo_move_actions_between_stacks_and_save() {
    let mut t = sample_store();
    let s = &mut t.store;
    assert!(!undo(s).unwrap());
    assert!(!redo(s).unwrap());
    s.user.undo_stack.push(action(
        UndoActionType::SetNote,
        1,
        json!({ "note": null }),
        json!({ "note": "x" }),
    ));

    assert!(undo(s).unwrap());
    assert!(!can_undo(s) && can_redo(s));
    assert!(redo(s).unwrap());
    assert!(can_undo(s) && !can_redo(s));
    assert_eq!(s.user.user_meta["1"].note.as_deref(), Some("x"));
    let saved = std::fs::read_to_string(t.dir_path().join("userdata.json")).unwrap();
    assert!(saved.contains("\"note\":\"x\""));
}

#[test]
fn restores_completion_meta_and_tags() {
    let mut user = UserData::default();
    let data = json!({
        "completed": true, "priority": 2, "inFocus": true, "focusOrder": 4,
        "note": "n", "deadline": "2026-12-31", "tags": ["raid"]
    });
    restore_action_state(&mut user, data.as_object().unwrap(), 5);

    assert!(user.progress["5"].completed);
    assert_eq!(user.progress["5"].achievement_id, 5);
    let meta = &user.user_meta["5"];
    assert_eq!(
        (meta.priority, meta.in_focus, meta.focus_order),
        (2, true, Some(4))
    );
    assert_eq!(
        (meta.note.as_deref(), meta.deadline.as_deref()),
        (Some("n"), Some("2026-12-31"))
    );
    assert_eq!(user.tags_by_achievement["5"], ["raid"]);

    let cleared = json!({ "completed": false, "focusOrder": null, "note": null, "deadline": null, "tags": [] });
    restore_action_state(&mut user, cleared.as_object().unwrap(), 5);
    assert!(!user.progress.contains_key("5"));
    assert_eq!(user.user_meta["5"].focus_order, None);
    assert_eq!(user.user_meta["5"].note, None);
    assert!(!user.tags_by_achievement.contains_key("5"));
}

#[test]
fn restoring_completion_keeps_the_existing_progress_entry() {
    let mut user = UserData::default();
    let existing = Progress {
        completed: false,
        completed_date: Some("2026-01-01".into()),
        ..Default::default()
    };
    user.progress.insert("5".into(), existing);

    restore_action_state(
        &mut user,
        json!({ "completed": true }).as_object().unwrap(),
        5,
    );

    assert!(user.progress["5"].completed);
    assert_eq!(
        user.progress["5"].completed_date.as_deref(),
        Some("2026-01-01")
    );
}

#[test]
fn ignores_malformed_fields_and_invalid_ids() {
    let mut user = UserData::default();
    let data = json!({ "completed": "yes", "priority": 9, "inFocus": 1, "focusOrder": "x", "note": 3, "deadline": [], "tags": "raid" });
    restore_action_state(&mut user, data.as_object().unwrap(), 5);
    assert!(user.progress.is_empty());
    assert!(user.tags_by_achievement.is_empty());
    let meta = user.user_meta.get("5").cloned().unwrap_or_default();
    assert_eq!(
        (meta.priority, meta.in_focus, meta.focus_order, meta.note),
        (0, false, None, None)
    );

    restore_action_state(&mut user, json!({ "note": "x" }).as_object().unwrap(), 0);
    assert!(!user.user_meta.contains_key("0"));
}
