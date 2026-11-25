//! Achievement mutations from the UI (each one is undoable) and Lodestone completions.

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{json, Map, Value};

use super::achievements::count_completed;
use super::error::RepoResult;
use super::history::push_undo_action;
use super::meta::{check_achievement_id, check_priority, check_text, ensure_meta};
use crate::models::user::{Priority, Progress, SyncSource, UndoActionType, UndoableAction};
use crate::shared::timestamps::{iso_date, iso_timestamp};
use crate::store::Store;

/// Records the change in the history, then saves.
fn record(
    store: &mut Store,
    kind: UndoActionType,
    id: u32,
    previous: Value,
    new: Value,
    now: DateTime<Utc>,
) -> RepoResult<()> {
    let as_map = |v: Value| match v {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    let action = UndoableAction {
        kind,
        achievement_id: id,
        timestamp: iso_timestamp(now),
        previous_data: as_map(previous),
        new_data: as_map(new),
    };
    push_undo_action(&mut store.user, action);
    Ok(store.save_user()?)
}

/// An achievement obtained on the Lodestone, with its date when known.
#[derive(Debug, Clone, PartialEq)]
pub struct LodestoneCompletion {
    pub id: u32,
    pub date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CompletionSummary {
    pub newly: u32,
    pub total: u32,
}

/// Checks or unchecks an achievement by hand. An achievement obtained via the
/// Lodestone cannot be unchecked.
pub fn set_manual_completion(
    store: &mut Store,
    id: u32,
    completed: bool,
    now: DateTime<Utc>,
) -> RepoResult<()> {
    check_achievement_id(id)?;
    let key = id.to_string();
    let existing = store.user.progress.get(&key);
    if !completed && existing.is_some_and(|p| p.source == SyncSource::Lodestone) {
        return Ok(());
    }
    let was_completed = existing.is_some_and(|p| p.completed);
    if completed {
        let completed_date = existing
            .and_then(|p| p.completed_date.clone())
            .or_else(|| Some(iso_date(now)));
        let progress = Progress {
            achievement_id: id,
            completed: true,
            completed_date,
            source: SyncSource::Manual,
            updated_at: iso_timestamp(now),
        };
        store.user.progress.insert(key, progress);
    } else {
        store.user.progress.remove(&key);
    }
    let (previous, new) = (
        json!({ "completed": was_completed }),
        json!({ "completed": completed }),
    );
    record(store, UndoActionType::SetCompletion, id, previous, new, now)
}

/// The Lodestone only lists obtained achievements: they are added, never removed.
pub fn apply_lodestone_completions(
    store: &mut Store,
    items: &[LodestoneCompletion],
    now: DateTime<Utc>,
) -> RepoResult<CompletionSummary> {
    let mut newly = 0;
    for item in items.iter().filter(|i| check_achievement_id(i.id).is_ok()) {
        let key = item.id.to_string();
        let existing = store.user.progress.get(&key);
        if !existing.is_some_and(|p| p.completed) {
            newly += 1;
        }
        let completed_date = item
            .date
            .clone()
            .or_else(|| existing.and_then(|p| p.completed_date.clone()));
        let progress = Progress {
            achievement_id: item.id,
            completed: true,
            completed_date,
            source: SyncSource::Lodestone,
            updated_at: iso_timestamp(now),
        };
        store.user.progress.insert(key, progress);
    }
    store.save_user()?;
    Ok(CompletionSummary {
        newly,
        total: count_completed(store),
    })
}

pub fn set_priority(
    store: &mut Store,
    id: u32,
    priority: Priority,
    now: DateTime<Utc>,
) -> RepoResult<()> {
    check_priority(priority)?;
    let meta = ensure_meta(&mut store.user, id)?;
    let previous = json!({ "priority": meta.priority });
    meta.priority = priority;
    record(
        store,
        UndoActionType::SetPriority,
        id,
        previous,
        json!({ "priority": priority }),
        now,
    )
}

/// Adds to the focus list (at the end) or removes from it.
pub fn set_focus(store: &mut Store, id: u32, in_focus: bool, now: DateTime<Utc>) -> RepoResult<()> {
    let last_order = store
        .user
        .user_meta
        .values()
        .filter_map(|m| m.focus_order)
        .max()
        .unwrap_or(0)
        .max(0);
    let meta = ensure_meta(&mut store.user, id)?;
    let previous = json!({ "inFocus": meta.in_focus, "focusOrder": meta.focus_order });
    meta.in_focus = in_focus;
    meta.focus_order = in_focus.then_some(last_order + 1);
    let new = json!({ "inFocus": in_focus, "focusOrder": meta.focus_order });
    record(store, UndoActionType::SetFocus, id, previous, new, now)
}

/// Gives the focus order 1, 2, 3… to the ids, in order (not undoable).
pub fn reorder_focus(store: &mut Store, ids: &[u32]) -> RepoResult<()> {
    ids.iter().try_for_each(|id| check_achievement_id(*id))?;
    for (order, id) in (1..).zip(ids) {
        ensure_meta(&mut store.user, *id)?.focus_order = Some(order);
    }
    Ok(store.save_user()?)
}

/// A blank note is stored as no note.
pub fn set_note(
    store: &mut Store,
    id: u32,
    note: Option<String>,
    now: DateTime<Utc>,
) -> RepoResult<()> {
    if let Some(text) = &note {
        check_text(text, "note")?;
    }
    let meta = ensure_meta(&mut store.user, id)?;
    let previous = json!({ "note": meta.note });
    meta.note = note.filter(|n| !n.trim().is_empty());
    let new = json!({ "note": meta.note });
    record(store, UndoActionType::SetNote, id, previous, new, now)
}

/// An empty deadline is stored as no deadline.
pub fn set_deadline(
    store: &mut Store,
    id: u32,
    deadline: Option<String>,
    now: DateTime<Utc>,
) -> RepoResult<()> {
    if let Some(text) = &deadline {
        check_text(text, "deadline")?;
    }
    let meta = ensure_meta(&mut store.user, id)?;
    let previous = json!({ "deadline": meta.deadline });
    meta.deadline = deadline.filter(|d| !d.is_empty());
    let new = json!({ "deadline": meta.deadline });
    record(store, UndoActionType::SetDeadline, id, previous, new, now)
}

/// Tags are trimmed, deduplicated (first occurrence kept) and empty ones dropped.
pub fn set_achievement_tags(
    store: &mut Store,
    id: u32,
    tags: &[String],
    now: DateTime<Utc>,
) -> RepoResult<()> {
    check_achievement_id(id)?;
    tags.iter().try_for_each(|t| check_text(t, "tag"))?;
    let key = id.to_string();
    let previous =
        json!({ "tags": store.user.tags_by_achievement.get(&key).cloned().unwrap_or_default() });
    let mut clean: Vec<String> = Vec::new();
    for tag in tags.iter().map(|t| t.trim()).filter(|t| !t.is_empty()) {
        if !clean.iter().any(|c| c == tag) {
            clean.push(tag.to_owned());
        }
    }
    let new = json!({ "tags": clean });
    if clean.is_empty() {
        store.user.tags_by_achievement.remove(&key);
    } else {
        store.user.tags_by_achievement.insert(key, clean);
    }
    record(store, UndoActionType::SetTags, id, previous, new, now)
}

#[cfg(test)]
mod tests;
