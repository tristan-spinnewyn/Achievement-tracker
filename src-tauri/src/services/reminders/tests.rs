use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use super::*;
use crate::models::user::RecurringTask;
use crate::repo::test_support::empty_store;

fn at(iso: &str) -> DateTime<Utc> {
    iso.parse().unwrap()
}

fn pending(daily: u32, weekly: u32, daily22: u32) -> PendingRecurring {
    PendingRecurring {
        daily,
        weekly,
        daily22,
    }
}

/// Keeps the notified messages.
#[derive(Default)]
struct RecordingNotifier(Mutex<Vec<String>>);

impl RecordingNotifier {
    fn messages(&self) -> Vec<String> {
        self.0.lock().unwrap().clone()
    }
}

impl Notifier for RecordingNotifier {
    fn notify(&self, body: &str) {
        self.0.lock().unwrap().push(body.to_owned());
    }
}

/// A state with one task per type; the daily one is checked at `checked_at`.
fn state_with_tasks(checked_at: &str) -> (AppState, tempfile::TempDir) {
    let (mut store, dir) = empty_store().into_parts();
    let task = |id: &str, kind, last: Option<&str>| RecurringTask {
        id: id.into(),
        name: id.into(),
        kind,
        last_completed_at: last.map(Into::into),
        ..RecurringTask::default()
    };
    store.user.recurring_tasks = vec![
        task("roulette", RecurringType::Daily, Some(checked_at)),
        task("raid", RecurringType::Weekly, None),
        task("supply", RecurringType::Daily22, None),
    ];
    (AppState::new(store), dir)
}

#[test]
fn startup_message_sums_the_daily_types() {
    assert_eq!(startup_message(&pending(0, 0, 0)), None);
    assert_eq!(
        startup_message(&pending(2, 1, 1)).as_deref(),
        Some("3 quotidienne(s) et 1 hebdomadaire(s) en attente.")
    );
    assert_eq!(
        startup_message(&pending(0, 4, 0)).as_deref(),
        Some("0 quotidienne(s) et 4 hebdomadaire(s) en attente.")
    );
}

#[test]
fn reset_message_names_the_tasks_of_the_type() {
    let p = pending(2, 0, 1);
    assert_eq!(
        reset_message(RecurringType::Daily, &p).as_deref(),
        Some("Reset : 2 tâche(s) quotidienne(s) à refaire.")
    );
    assert_eq!(
        reset_message(RecurringType::Daily22, &p).as_deref(),
        Some("Reset : 1 tâche(s) de ravitaillement à refaire.")
    );
    assert_eq!(reset_message(RecurringType::Weekly, &p), None);
    assert_eq!(
        reset_message(RecurringType::Weekly, &pending(0, 3, 0)).as_deref(),
        Some("Reset : 3 tâche(s) hebdomadaire(s) à refaire.")
    );
}

#[test]
fn waits_until_one_second_after_the_next_reset() {
    let now = at("2026-06-19T14:59:00Z");
    assert_eq!(
        delay_until_reset(RecurringType::Daily, now),
        Duration::from_secs(61)
    );
    assert_eq!(
        delay_until_reset(RecurringType::Daily22, now),
        Duration::from_secs(5 * 3600 + 61)
    );
}

#[test]
fn notifies_what_is_pending_at_startup_only_when_something_is() {
    let (state, _dir) = state_with_tasks("2026-06-19T15:30:00Z");
    let notifier = RecordingNotifier::default();
    notify_pending(&state, &notifier, at("2026-06-19T16:00:00Z"));
    assert_eq!(
        notifier.messages(),
        ["1 quotidienne(s) et 1 hebdomadaire(s) en attente."]
    );

    let (store, _empty_dir) = empty_store().into_parts();
    let empty = AppState::new(store);
    let quiet = RecordingNotifier::default();
    notify_pending(&empty, &quiet, at("2026-06-19T16:00:00Z"));
    assert!(quiet.messages().is_empty());
}

#[tokio::test(start_paused = true)]
async fn notifies_the_tasks_to_redo_right_after_the_reset() {
    // Checked during the period that ends at 15:00: pending again after the reset.
    let (state, _dir) = state_with_tasks("2026-06-18T16:00:00Z");
    let notifier = RecordingNotifier::default();
    let times = [at("2026-06-19T14:59:00Z"), at("2026-06-19T15:00:01Z")];
    let calls = AtomicUsize::new(0);
    let clock = || times[calls.fetch_add(1, Ordering::SeqCst)];
    let started = tokio::time::Instant::now();

    notify_at_next_reset(&state, &notifier, RecurringType::Daily, &clock).await;

    assert_eq!(started.elapsed(), Duration::from_secs(61));
    assert_eq!(
        notifier.messages(),
        ["Reset : 1 tâche(s) quotidienne(s) à refaire."]
    );
}

#[tokio::test(start_paused = true)]
async fn only_reports_the_type_that_was_reset() {
    let (state, _dir) = state_with_tasks("2026-06-19T15:30:00Z");
    let notifier = RecordingNotifier::default();
    let clock = || at("2026-06-19T23:00:00Z");

    notify_at_next_reset(&state, &notifier, RecurringType::Weekly, &clock).await;
    // The supply task is pending too, but only the weekly reset happened.
    assert_eq!(
        notifier.messages(),
        ["Reset : 1 tâche(s) hebdomadaire(s) à refaire."]
    );

    let (store, _empty_dir) = empty_store().into_parts();
    let empty = AppState::new(store);
    let quiet = RecordingNotifier::default();
    notify_at_next_reset(&empty, &quiet, RecurringType::Daily, &clock).await;
    assert!(quiet.messages().is_empty());
}
