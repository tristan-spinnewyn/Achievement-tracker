//! Reading user data from JSON: every record key is constrained, every value
//! type-checked, suspicious ids and icon paths neutralised.

use std::collections::BTreeMap;

use serde::de::DeserializeOwned;
use serde_json::{Map, Value};

use super::primitives::{is_achievement_id, is_collection_key, is_numeric_key, is_safe_icon_path};
use crate::models::settings::Settings;
use crate::models::user::{RecurringTask, UndoableAction, UserData};

/// What to do with a section whose container has the wrong type.
#[derive(Clone, Copy, PartialEq)]
enum Mode {
    /// Reject the whole file (untrusted backup).
    Strict,
    /// Keep the section's default (the app's own file).
    Lenient,
}

/// Wrong-shaped section found in strict mode.
struct InvalidSection;

/// Validates an untrusted backup (import, Documents mirror).
/// Returns None when the file does not look like a backup or a section has the wrong shape.
pub fn sanitize_imported_user(raw: &Value) -> Option<UserData> {
    let raw = raw.as_object()?;
    let looks_like_backup = ["settings", "progress", "collections"]
        .iter()
        .any(|key| raw.get(*key).is_some_and(is_truthy));
    if !looks_like_backup {
        return None;
    }
    parse_user(raw, Mode::Strict).ok()
}

/// Reads the app's own `userdata.json`: invalid entries are dropped, a section
/// with the wrong shape falls back to its default instead of rejecting the file.
pub fn parse_user_lenient(raw: &Value) -> UserData {
    raw.as_object()
        .and_then(|raw| parse_user(raw, Mode::Lenient).ok())
        .unwrap_or_default()
}

fn parse_user(raw: &Map<String, Value>, mode: Mode) -> Result<UserData, InvalidSection> {
    let mut user = UserData::default();
    let section = |key: &str| raw.get(key);

    if let Some(v) = read(section("settings"), mode, |v| {
        v.as_object().map(|_| Settings::from_untrusted(v))
    })? {
        user.settings = v;
    }
    if let Some(v) = read(section("progress"), mode, |v| {
        record(v, is_numeric_key, object_as)
    })? {
        user.progress = v;
    }
    if let Some(v) = read(section("userMeta"), mode, |v| {
        record(v, is_numeric_key, object_as)
    })? {
        user.user_meta = v;
    }
    if let Some(v) = read(section("tagsByAchievement"), mode, |v| {
        record(v, is_numeric_key, string_tags)
    })? {
        user.tags_by_achievement = v;
    }
    if let Some(v) = read(section("collections"), mode, |v| {
        record(v, is_collection_key, object_as)
    })? {
        user.collections = v;
    }
    if let Some(v) = read(section("collectionHashCache"), mode, |v| {
        record(v, is_collection_key, |v| v.as_str().map(str::to_owned))
    })? {
        user.collection_hash_cache = v;
    }
    if let Some(v) = read(section("syncLog"), mode, |v| list(v, object_as))? {
        user.sync_log = v;
    }
    if let Some(v) = read(section("undoStack"), mode, |v| list(v, undo_action))? {
        user.undo_stack = v;
    }
    if let Some(v) = read(section("redoStack"), mode, |v| list(v, undo_action))? {
        user.redo_stack = v;
    }
    if let Some(v) = read(section("recurringTasks"), mode, |v| list(v, recurring_task))? {
        user.recurring_tasks = v;
    }
    Ok(user)
}

/// Reads one section: `Ok(None)` when absent (or wrong-shaped in lenient mode).
fn read<T>(
    value: Option<&Value>,
    mode: Mode,
    extract: impl Fn(&Value) -> Option<T>,
) -> Result<Option<T>, InvalidSection> {
    let Some(value) = value else {
        return Ok(None);
    };
    match extract(value) {
        Some(parsed) => Ok(Some(parsed)),
        None if mode == Mode::Strict => Err(InvalidSection),
        None => Ok(None),
    }
}

/// An object whose valid keys and values are kept; None if not an object.
fn record<T>(
    value: &Value,
    is_valid_key: fn(&str) -> bool,
    parse_value: impl Fn(&Value) -> Option<T>,
) -> Option<BTreeMap<String, T>> {
    let entries = value.as_object()?;
    Some(
        entries
            .iter()
            .filter(|(key, _)| is_valid_key(key))
            .filter_map(|(key, v)| Some((key.clone(), parse_value(v)?)))
            .collect(),
    )
}

/// An array whose valid items are kept; None if not an array.
fn list<T>(value: &Value, parse_item: impl Fn(&Value) -> Option<T>) -> Option<Vec<T>> {
    Some(value.as_array()?.iter().filter_map(parse_item).collect())
}

fn object_as<T: DeserializeOwned>(value: &Value) -> Option<T> {
    value
        .is_object()
        .then(|| serde_json::from_value(value.clone()).ok())
        .flatten()
}

/// The string items of an array, None if there are none.
fn string_tags(value: &Value) -> Option<Vec<String>> {
    let tags: Vec<String> = value
        .as_array()?
        .iter()
        .filter_map(|t| t.as_str().map(str::to_owned))
        .collect();
    (!tags.is_empty()).then_some(tags)
}

fn undo_action(value: &Value) -> Option<UndoableAction> {
    is_achievement_id(value.get("achievementId")?)
        .then(|| object_as(value))
        .flatten()
}

fn recurring_task(value: &Value) -> Option<RecurringTask> {
    let has_identity = value.get("id")?.is_string() && value.get("name")?.is_string();
    let mut task: RecurringTask = has_identity.then(|| object_as(value)).flatten()?;
    task.icon_path = task.icon_path.filter(|p| is_safe_icon_path(p));
    Some(task)
}

/// JavaScript truthiness, as used by the TS backup check.
fn is_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

#[cfg(test)]
mod tests;
