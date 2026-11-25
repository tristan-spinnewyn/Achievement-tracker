//! Undo / redo history of the achievement mutations.

use serde_json::{Map, Value};

use super::error::RepoResult;
use super::meta::{check_achievement_id, check_priority, ensure_meta};
use crate::models::user::{Priority, Progress, UndoableAction, UserData};
use crate::store::Store;

pub const MAX_HISTORY: usize = 50;

/// Pushes onto a stack, dropping the oldest entry beyond `MAX_HISTORY`.
fn push_capped(stack: &mut Vec<UndoableAction>, action: UndoableAction) {
    if stack.len() >= MAX_HISTORY {
        stack.remove(0);
    }
    stack.push(action);
}

/// Records an action (the caller saves) and clears the redo stack.
pub fn push_undo_action(user: &mut UserData, action: UndoableAction) {
    push_capped(&mut user.undo_stack, action);
    user.redo_stack.clear();
}

/// Undoes the last action; false when there is none.
pub fn undo(store: &mut Store) -> RepoResult<bool> {
    let Some(action) = store.user.undo_stack.pop() else {
        return Ok(false);
    };
    restore_action_state(
        &mut store.user,
        &action.previous_data,
        action.achievement_id,
    );
    push_capped(&mut store.user.redo_stack, action);
    store.save_user()?;
    Ok(true)
}

/// Redoes the last undone action; false when there is none.
pub fn redo(store: &mut Store) -> RepoResult<bool> {
    let Some(action) = store.user.redo_stack.pop() else {
        return Ok(false);
    };
    restore_action_state(&mut store.user, &action.new_data, action.achievement_id);
    push_capped(&mut store.user.undo_stack, action);
    store.save_user()?;
    Ok(true)
}

pub fn can_undo(store: &Store) -> bool {
    !store.user.undo_stack.is_empty()
}

pub fn can_redo(store: &Store) -> bool {
    !store.user.redo_stack.is_empty()
}

/// Applies saved state to an achievement. The history is persisted on disk, so
/// each field is type-checked and ignored when malformed.
fn restore_action_state(user: &mut UserData, data: &Map<String, Value>, id: u32) {
    if check_achievement_id(id).is_err() {
        return;
    }
    let key = id.to_string();
    match data.get("completed") {
        Some(Value::Bool(true)) => {
            let progress = user
                .progress
                .entry(key.clone())
                .or_insert_with(|| Progress {
                    achievement_id: id,
                    ..Progress::default()
                });
            progress.completed = true;
        }
        Some(Value::Bool(false)) => {
            user.progress.remove(&key);
        }
        _ => {}
    }
    restore_meta(user, data, id);
    if let Some(tags) = data.get("tags").and_then(Value::as_array) {
        let tags: Vec<String> = tags
            .iter()
            .filter_map(|t| t.as_str().map(str::to_owned))
            .collect();
        if tags.is_empty() {
            user.tags_by_achievement.remove(&key);
        } else {
            user.tags_by_achievement.insert(key, tags);
        }
    }
}

/// `Some(None)` for null, `Some(Some(s))` for a string, None otherwise.
fn nullable_string(value: Option<&Value>) -> Option<Option<String>> {
    match value? {
        Value::Null => Some(None),
        Value::String(s) => Some(Some(s.clone())),
        _ => None,
    }
}

fn restore_meta(user: &mut UserData, data: &Map<String, Value>, id: u32) {
    let priority = data
        .get("priority")
        .and_then(Value::as_u64)
        .and_then(|p| Priority::try_from(p).ok())
        .filter(|p| check_priority(*p).is_ok());
    let in_focus = data.get("inFocus").and_then(Value::as_bool);
    let focus_order = match data.get("focusOrder") {
        Some(Value::Null) => Some(None),
        Some(v) => v.as_i64().map(Some),
        None => None,
    };
    let note = nullable_string(data.get("note"));
    let deadline = nullable_string(data.get("deadline"));
    let has_changes = priority.is_some()
        || in_focus.is_some()
        || focus_order.is_some()
        || note.is_some()
        || deadline.is_some();
    if !has_changes {
        return;
    }
    let Ok(meta) = ensure_meta(user, id) else {
        return;
    };
    if let Some(v) = priority {
        meta.priority = v;
    }
    if let Some(v) = in_focus {
        meta.in_focus = v;
    }
    if let Some(v) = focus_order {
        meta.focus_order = v;
    }
    if let Some(v) = note {
        meta.note = v;
    }
    if let Some(v) = deadline {
        meta.deadline = v;
    }
}

#[cfg(test)]
mod tests;
