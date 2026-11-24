//! User data (`userdata.json`), mirroring `UserData` in `src/main/data/store.ts`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::collections::CollectionOwnership;
use super::settings::Settings;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncSource {
    Lodestone,
    #[default]
    Manual,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Progress {
    pub achievement_id: u32,
    pub completed: bool,
    pub completed_date: Option<String>,
    pub source: SyncSource,
    pub updated_at: String,
}

/// Priority: 0 = none, 1 = low, 2 = medium, 3 = high.
pub type Priority = u8;

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UserMeta {
    pub achievement_id: u32,
    pub priority: Priority,
    pub in_focus: bool,
    pub focus_order: Option<i64>,
    pub note: Option<String>,
    pub deadline: Option<String>,
}

/// `daily` = game reset (15:00 UTC), `weekly` = Tuesday 08:00 UTC, `daily22` = 22:00 local time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecurringType {
    #[default]
    Daily,
    Weekly,
    Daily22,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RecurringTask {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: RecurringType,
    pub achievement_id: Option<u32>,
    pub icon_path: Option<String>,
    pub last_completed_at: Option<String>,
    /// Consecutive checked periods; missing in old data (= 0).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streak: Option<u32>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SyncLogEntry {
    pub at: String,
    pub ok: bool,
    pub newly_completed: u32,
    pub total_completed: u32,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UndoActionType {
    SetCompletion,
    SetPriority,
    SetFocus,
    SetNote,
    SetTags,
    SetDeadline,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoableAction {
    #[serde(rename = "type")]
    pub kind: UndoActionType,
    pub achievement_id: u32,
    #[serde(default)]
    pub timestamp: String,
    /// Data before the change (for undo).
    pub previous_data: Map<String, Value>,
    /// Data after the change (for redo).
    pub new_data: Map<String, Value>,
}

/// Records are keyed by achievement id (as a string) or by `{type}:{id}` for collections.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UserData {
    pub settings: Settings,
    pub progress: BTreeMap<String, Progress>,
    pub user_meta: BTreeMap<String, UserMeta>,
    pub tags_by_achievement: BTreeMap<String, Vec<String>>,
    pub recurring_tasks: Vec<RecurringTask>,
    pub sync_log: Vec<SyncLogEntry>,
    pub collections: BTreeMap<String, CollectionOwnership>,
    /// Lodestone cache: `{type}:{hash}` -> item name.
    pub collection_hash_cache: BTreeMap<String, String>,
    pub undo_stack: Vec<UndoableAction>,
    pub redo_stack: Vec<UndoableAction>,
}

impl UserData {
    /// True when the file holds real user progress (not just default settings).
    pub fn has_data(&self) -> bool {
        !self.progress.is_empty()
            || !self.collections.is_empty()
            || !self.recurring_tasks.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_data_is_false_for_an_empty_user() {
        assert!(!UserData::default().has_data());
    }

    #[test]
    fn has_data_is_true_as_soon_as_one_kind_of_progress_exists() {
        let mut with_progress = UserData::default();
        with_progress
            .progress
            .insert("1".into(), Progress::default());
        let mut with_collection = UserData::default();
        with_collection
            .collections
            .insert("mount:1".into(), CollectionOwnership::default());
        let mut with_task = UserData::default();
        with_task.recurring_tasks.push(RecurringTask::default());

        assert!(with_progress.has_data());
        assert!(with_collection.has_data());
        assert!(with_task.has_data());
    }

    #[test]
    fn user_data_round_trips_with_the_frontend_field_names() {
        let json = serde_json::to_value(UserData::default()).unwrap();
        for key in [
            "userMeta",
            "tagsByAchievement",
            "recurringTasks",
            "collectionHashCache",
            "undoStack",
        ] {
            assert!(json.get(key).is_some(), "missing key {key}");
        }
        let back: UserData = serde_json::from_value(json).unwrap();
        assert_eq!(back, UserData::default());
    }
}
