//! Recurring tasks (daily / weekly / supply) and their streaks.

use chrono::{DateTime, Utc};
use serde::Deserialize;
use uuid::Uuid;

use super::error::RepoResult;
use super::meta::{check_achievement_id, check_text};
use crate::models::user::{RecurringTask, RecurringType};
use crate::models::views::PendingRecurring;
use crate::sanitize::primitives::is_safe_icon_path;
use crate::shared::resets::{is_done_this_period, period_start, previous_period_start};
use crate::shared::timestamps::iso_timestamp;
use crate::store::Store;

/// A task created from the UI.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewRecurringTask {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: RecurringType,
    #[serde(default)]
    pub achievement_id: Option<u32>,
    #[serde(default)]
    pub icon_path: Option<String>,
}

/// Removes the tasks linked to an achievement now obtained (saves only if something changed).
fn prune_completed(store: &mut Store) -> RepoResult<()> {
    let progress = &store.user.progress;
    let before = store.user.recurring_tasks.len();
    store.user.recurring_tasks.retain(|t| {
        t.achievement_id
            .is_none_or(|id| !progress.get(&id.to_string()).is_some_and(|p| p.completed))
    });
    if store.user.recurring_tasks.len() != before {
        store.save_user()?;
    }
    Ok(())
}

/// The tasks, after removing those linked to an achievement now obtained.
pub fn recurring_tasks(store: &mut Store) -> RepoResult<Vec<RecurringTask>> {
    prune_completed(store)?;
    Ok(store.user.recurring_tasks.clone())
}

pub fn add_recurring_task(
    store: &mut Store,
    input: NewRecurringTask,
    now: DateTime<Utc>,
) -> RepoResult<RecurringTask> {
    check_text(&input.name, "task name")?;
    if let Some(id) = input.achievement_id {
        check_achievement_id(id)?;
    }
    let task = RecurringTask {
        id: Uuid::new_v4().to_string(),
        name: input.name.trim().to_owned(),
        kind: input.kind,
        achievement_id: input.achievement_id,
        icon_path: input.icon_path.filter(|p| is_safe_icon_path(p)),
        last_completed_at: None,
        streak: Some(0),
        created_at: iso_timestamp(now),
    };
    store.user.recurring_tasks.push(task.clone());
    store.save_user()?;
    Ok(task)
}

pub fn delete_recurring_task(store: &mut Store, id: &str) -> RepoResult<()> {
    store.user.recurring_tasks.retain(|t| t.id != id);
    Ok(store.save_user()?)
}

/// Checks or unchecks a task for the current period (idempotent) and updates its streak.
pub fn set_recurring_done(
    store: &mut Store,
    id: &str,
    done: bool,
    now: DateTime<Utc>,
) -> RepoResult<()> {
    let Some(task) = store.user.recurring_tasks.iter_mut().find(|t| t.id == id) else {
        return Ok(());
    };
    let already_done = is_done_this_period(task.kind, task.last_completed_at.as_deref(), now);
    if done == already_done {
        return Ok(());
    }
    let streak = task.streak.unwrap_or(0);
    if done {
        let previous_start = previous_period_start(task.kind, now);
        let current_start = period_start(task.kind, now);
        let last = task
            .last_completed_at
            .as_deref()
            .and_then(|iso| iso.parse::<DateTime<Utc>>().ok());
        let continued = last.is_some_and(|last| last >= previous_start && last < current_start);
        task.streak = Some(if continued { streak + 1 } else { 1 });
        task.last_completed_at = Some(iso_timestamp(now));
    } else {
        task.streak = Some(streak.saturating_sub(1));
        task.last_completed_at = None;
    }
    Ok(store.save_user()?)
}

/// Tasks not done in their current period, per type.
pub fn count_pending_recurring(
    store: &mut Store,
    now: DateTime<Utc>,
) -> RepoResult<PendingRecurring> {
    prune_completed(store)?;
    let mut pending = PendingRecurring::default();
    for task in &store.user.recurring_tasks {
        if is_done_this_period(task.kind, task.last_completed_at.as_deref(), now) {
            continue;
        }
        match task.kind {
            RecurringType::Daily => pending.daily += 1,
            RecurringType::Weekly => pending.weekly += 1,
            RecurringType::Daily22 => pending.daily22 += 1,
        }
    }
    Ok(pending)
}

#[cfg(test)]
mod tests;
