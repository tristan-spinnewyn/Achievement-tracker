//! Recurring task commands.

use chrono::Utc;
use tauri::State;

use super::error::CommandResult;
use crate::models::user::RecurringTask;
use crate::models::views::PendingRecurring;
use crate::repo::recurring::{self, NewRecurringTask};
use crate::state::AppState;

#[tauri::command]
pub fn recurring_list(state: State<'_, AppState>) -> CommandResult<Vec<RecurringTask>> {
    Ok(recurring::recurring_tasks(&mut state.store())?)
}

#[tauri::command]
pub fn recurring_add(
    state: State<'_, AppState>,
    input: NewRecurringTask,
) -> CommandResult<RecurringTask> {
    Ok(recurring::add_recurring_task(
        &mut state.store(),
        input,
        Utc::now(),
    )?)
}

#[tauri::command]
pub fn recurring_delete(state: State<'_, AppState>, id: String) -> CommandResult<bool> {
    recurring::delete_recurring_task(&mut state.store(), &id)?;
    Ok(true)
}

#[tauri::command]
pub fn recurring_set_done(
    state: State<'_, AppState>,
    id: String,
    done: bool,
) -> CommandResult<bool> {
    recurring::set_recurring_done(&mut state.store(), &id, done, Utc::now())?;
    Ok(true)
}

#[tauri::command]
pub fn recurring_pending(state: State<'_, AppState>) -> CommandResult<PendingRecurring> {
    Ok(recurring::count_pending_recurring(
        &mut state.store(),
        Utc::now(),
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_support::sample_app;
    use crate::models::user::RecurringType;

    #[test]
    fn manages_recurring_tasks() {
        let t = sample_app();
        let input = NewRecurringTask {
            name: "Roulette".into(),
            kind: RecurringType::Daily,
            achievement_id: None,
            icon_path: None,
        };
        let task = recurring_add(t.state(), input).unwrap();
        assert_eq!(recurring_pending(t.state()).unwrap().daily, 1);
        assert!(recurring_set_done(t.state(), task.id.clone(), true).unwrap());
        assert_eq!(recurring_pending(t.state()).unwrap().daily, 0);
        assert!(recurring_delete(t.state(), task.id).unwrap());
        assert!(recurring_list(t.state()).unwrap().is_empty());
    }

    #[test]
    fn rejects_an_invalid_task() {
        let t = sample_app();
        let input = NewRecurringTask {
            name: "x".into(),
            kind: RecurringType::Daily,
            achievement_id: Some(0),
            icon_path: None,
        };
        assert!(recurring_add(t.state(), input).is_err());
    }
}
