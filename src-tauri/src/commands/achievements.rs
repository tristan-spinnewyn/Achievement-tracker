//! Achievement, dashboard and undo/redo history commands.

use chrono::Utc;
use tauri::State;

use super::error::CommandResult;
use crate::models::user::Priority;
use crate::models::views::{AchievementFilter, AchievementRow, DashboardData, LatestPatchSummary};
use crate::repo::{achievements, catalog, dashboard, history, mutations};
use crate::state::AppState;

#[tauri::command]
pub fn achievements_list(
    state: State<'_, AppState>,
    filter: Option<AchievementFilter>,
) -> Vec<AchievementRow> {
    achievements::list_achievements(&state.store(), &filter.unwrap_or_default())
}

#[tauri::command]
pub fn achievements_get(state: State<'_, AppState>, id: u32) -> Option<AchievementRow> {
    achievements::achievement_row(&state.store(), id)
}

#[tauri::command]
pub fn achievements_focus_list(state: State<'_, AppState>) -> Vec<AchievementRow> {
    achievements::focus_list(&state.store())
}

#[tauri::command]
pub fn achievements_latest_patch(state: State<'_, AppState>) -> LatestPatchSummary {
    catalog::latest_patch_summary(&state.store())
}

#[tauri::command]
pub fn achievements_set_completion(
    state: State<'_, AppState>,
    id: u32,
    completed: bool,
) -> CommandResult<bool> {
    mutations::set_manual_completion(&mut state.store(), id, completed, Utc::now())?;
    Ok(true)
}

#[tauri::command]
pub fn achievements_set_priority(
    state: State<'_, AppState>,
    id: u32,
    priority: Priority,
) -> CommandResult<bool> {
    mutations::set_priority(&mut state.store(), id, priority, Utc::now())?;
    Ok(true)
}

#[tauri::command]
pub fn achievements_set_focus(
    state: State<'_, AppState>,
    id: u32,
    in_focus: bool,
) -> CommandResult<bool> {
    mutations::set_focus(&mut state.store(), id, in_focus, Utc::now())?;
    Ok(true)
}

#[tauri::command]
pub fn achievements_reorder_focus(
    state: State<'_, AppState>,
    ids: Vec<u32>,
) -> CommandResult<bool> {
    mutations::reorder_focus(&mut state.store(), &ids)?;
    Ok(true)
}

#[tauri::command]
pub fn achievements_set_note(
    state: State<'_, AppState>,
    id: u32,
    note: Option<String>,
) -> CommandResult<bool> {
    mutations::set_note(&mut state.store(), id, note, Utc::now())?;
    Ok(true)
}

#[tauri::command]
pub fn achievements_set_deadline(
    state: State<'_, AppState>,
    id: u32,
    deadline: Option<String>,
) -> CommandResult<bool> {
    mutations::set_deadline(&mut state.store(), id, deadline, Utc::now())?;
    Ok(true)
}

#[tauri::command]
pub fn achievements_set_tags(
    state: State<'_, AppState>,
    id: u32,
    tags: Vec<String>,
) -> CommandResult<bool> {
    mutations::set_achievement_tags(&mut state.store(), id, &tags, Utc::now())?;
    Ok(true)
}

#[tauri::command]
pub fn dashboard_get(state: State<'_, AppState>) -> DashboardData {
    dashboard::dashboard(&state.store())
}

#[tauri::command]
pub fn history_undo(state: State<'_, AppState>) -> CommandResult<bool> {
    Ok(history::undo(&mut state.store())?)
}

#[tauri::command]
pub fn history_redo(state: State<'_, AppState>) -> CommandResult<bool> {
    Ok(history::redo(&mut state.store())?)
}

#[tauri::command]
pub fn history_can_undo(state: State<'_, AppState>) -> bool {
    history::can_undo(&state.store())
}

#[tauri::command]
pub fn history_can_redo(state: State<'_, AppState>) -> bool {
    history::can_redo(&state.store())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_support::sample_app;

    #[test]
    fn reads_achievements_focus_and_dashboard() {
        let t = sample_app();
        assert_eq!(achievements_list(t.state(), None).len(), 3);
        let filter = AchievementFilter {
            kind_id: Some(2),
            ..Default::default()
        };
        assert_eq!(achievements_list(t.state(), Some(filter)).len(), 1);
        assert_eq!(
            achievements_get(t.state(), 2).unwrap().achievement.name,
            "Bravo"
        );
        assert!(achievements_focus_list(t.state()).is_empty());
        assert_eq!(achievements_latest_patch(t.state()).total, 2);
        assert_eq!(dashboard_get(t.state()).total_achievements, 3);
    }

    #[test]
    fn mutates_and_undoes_through_the_commands() {
        let t = sample_app();
        assert!(achievements_set_completion(t.state(), 1, true).unwrap());
        assert!(achievements_set_priority(t.state(), 1, 2).unwrap());
        assert!(achievements_set_focus(t.state(), 1, true).unwrap());
        assert!(achievements_reorder_focus(t.state(), vec![1]).unwrap());
        assert!(achievements_set_note(t.state(), 1, Some("n".into())).unwrap());
        assert!(achievements_set_deadline(t.state(), 1, None).unwrap());
        assert!(achievements_set_tags(t.state(), 1, vec!["raid".into()]).unwrap());
        let row = achievements_get(t.state(), 1).unwrap();
        assert!(row.completed && row.in_focus);
        assert_eq!(row.tags, ["raid"]);

        assert!(history_can_undo(t.state()));
        assert!(history_undo(t.state()).unwrap());
        assert!(history_can_redo(t.state()));
        assert!(history_redo(t.state()).unwrap());
    }

    #[test]
    fn rejects_invalid_arguments_with_a_message() {
        let t = sample_app();
        let err = achievements_set_priority(t.state(), 1, 9).unwrap_err();
        assert_eq!(
            serde_json::to_value(err).unwrap(),
            "invalid input: priority 9"
        );
        assert!(achievements_set_completion(t.state(), 0, true).is_err());
    }
}
