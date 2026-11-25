//! Notifications about the recurring tasks, at startup and at each FFXIV reset
//! (port of `showPendingRecurringNotification` and `src/main/services/reminders.ts`).

use std::time::Duration;

use chrono::{DateTime, Utc};

use crate::models::user::RecurringType;
use crate::models::views::PendingRecurring;
use crate::repo::recurring::count_pending_recurring;
use crate::shared::resets::next_reset;
use crate::state::AppState;

/// Shows a desktop notification.
pub trait Notifier: Send + Sync {
    fn notify(&self, body: &str);
}

/// Every reset type, in the order the reminders are scheduled.
pub const RESET_KINDS: [RecurringType; 3] = [
    RecurringType::Daily,
    RecurringType::Daily22,
    RecurringType::Weekly,
];

/// Margin after a reset, so the new period has started when the tasks are counted.
const RESET_MARGIN: Duration = Duration::from_secs(1);

/// Summary shown at startup, when some tasks are pending.
pub fn startup_message(pending: &PendingRecurring) -> Option<String> {
    let daily = pending.daily + pending.daily22;
    (daily + pending.weekly > 0).then(|| {
        format!(
            "{daily} quotidienne(s) et {} hebdomadaire(s) en attente.",
            pending.weekly
        )
    })
}

/// Message for a reset, when tasks of that type are to redo.
pub fn reset_message(kind: RecurringType, pending: &PendingRecurring) -> Option<String> {
    let (count, label) = match kind {
        RecurringType::Daily => (pending.daily, "quotidienne(s)"),
        RecurringType::Daily22 => (pending.daily22, "de ravitaillement"),
        RecurringType::Weekly => (pending.weekly, "hebdomadaire(s)"),
    };
    (count > 0).then(|| format!("Reset : {count} tâche(s) {label} à refaire."))
}

/// Time to wait until just after the next reset of a type.
pub fn delay_until_reset(kind: RecurringType, now: DateTime<Utc>) -> Duration {
    (next_reset(kind, now) - now).to_std().unwrap_or_default() + RESET_MARGIN
}

/// Pending tasks per type; a store that cannot be saved is only logged.
fn pending_tasks(state: &AppState, now: DateTime<Utc>) -> Option<PendingRecurring> {
    count_pending_recurring(&mut state.store(), now)
        .map_err(|err| eprintln!("[reminders] cannot count the pending tasks: {err}"))
        .ok()
}

/// Notifies the tasks pending at startup, if any.
pub fn notify_pending<N: Notifier>(state: &AppState, notifier: &N, now: DateTime<Utc>) {
    if let Some(message) = pending_tasks(state, now).as_ref().and_then(startup_message) {
        notifier.notify(&message);
    }
}

/// Waits for the next reset of a type, then notifies the tasks of that type to redo.
pub async fn notify_at_next_reset<N, C>(
    state: &AppState,
    notifier: &N,
    kind: RecurringType,
    clock: &C,
) where
    N: Notifier,
    C: Fn() -> DateTime<Utc> + Sync,
{
    tokio::time::sleep(delay_until_reset(kind, clock())).await;
    let message = pending_tasks(state, clock()).and_then(|pending| reset_message(kind, &pending));
    if let Some(message) = message {
        notifier.notify(&message);
    }
}

#[cfg(test)]
mod tests;
