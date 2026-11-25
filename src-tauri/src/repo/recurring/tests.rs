use chrono::TimeDelta;

use super::*;
use crate::models::user::Progress;
use crate::repo::error::RepoError;
use crate::repo::test_support::sample_store;
use crate::sanitize::primitives::MAX_TEXT_LENGTH;

fn now() -> DateTime<Utc> {
    "2026-06-19T18:00:00Z".parse().unwrap()
}

fn task(name: &str, kind: RecurringType) -> NewRecurringTask {
    NewRecurringTask {
        name: name.into(),
        kind,
        achievement_id: None,
        icon_path: None,
    }
}

fn streak(store: &mut Store, id: &str) -> Option<u32> {
    recurring_tasks(store)
        .unwrap()
        .into_iter()
        .find(|t| t.id == id)
        .unwrap()
        .streak
}

#[test]
fn adds_checks_unchecks_deletes_and_counts_pending_tasks() {
    let mut t = sample_store();
    let s = &mut t.store;
    let daily = add_recurring_task(s, task("  Roulette  ", RecurringType::Daily), now()).unwrap();
    let weekly = add_recurring_task(s, task("Raid", RecurringType::Weekly), now()).unwrap();
    add_recurring_task(s, task("Ravitaillement", RecurringType::Daily22), now()).unwrap();
    assert_eq!(daily.name, "Roulette");
    assert_eq!(daily.streak, Some(0));
    assert_eq!(daily.created_at, "2026-06-19T18:00:00.000Z");
    assert_ne!(daily.id, weekly.id);
    let all = PendingRecurring {
        daily: 1,
        weekly: 1,
        daily22: 1,
    };
    assert_eq!(count_pending_recurring(s, now()).unwrap(), all);

    set_recurring_done(s, &daily.id, true, now()).unwrap();
    set_recurring_done(s, &daily.id, true, now()).unwrap();
    assert_eq!(streak(s, &daily.id), Some(1));
    assert_eq!(count_pending_recurring(s, now()).unwrap().daily, 0);

    set_recurring_done(s, &daily.id, false, now()).unwrap();
    set_recurring_done(s, &daily.id, false, now()).unwrap();
    assert_eq!(count_pending_recurring(s, now()).unwrap().daily, 1);
    assert_eq!(streak(s, &daily.id), Some(0));

    delete_recurring_task(s, &weekly.id).unwrap();
    set_recurring_done(s, "unknown", true, now()).unwrap();
    assert_eq!(recurring_tasks(s).unwrap().len(), 2);
}

#[test]
fn the_streak_continues_only_from_the_previous_period() {
    let mut t = sample_store();
    let s = &mut t.store;
    let daily = add_recurring_task(s, task("Roulette", RecurringType::Daily), now()).unwrap();

    set_recurring_done(s, &daily.id, true, now() - TimeDelta::days(1)).unwrap();
    set_recurring_done(s, &daily.id, true, now()).unwrap();
    assert_eq!(streak(s, &daily.id), Some(2));

    set_recurring_done(s, &daily.id, true, now() + TimeDelta::days(3)).unwrap();
    assert_eq!(streak(s, &daily.id), Some(1));
}

#[test]
fn removes_a_task_linked_to_an_obtained_achievement() {
    let mut t = sample_store();
    let s = &mut t.store;
    let linked = NewRecurringTask {
        achievement_id: Some(1),
        ..task("Lié", RecurringType::Daily)
    };
    add_recurring_task(s, linked, now()).unwrap();
    s.user.progress.insert(
        "1".into(),
        Progress {
            completed: true,
            ..Default::default()
        },
    );

    assert_eq!(
        count_pending_recurring(s, now()).unwrap(),
        PendingRecurring::default()
    );
    assert!(recurring_tasks(s).unwrap().is_empty());
}

#[test]
fn validates_new_tasks() {
    let mut t = sample_store();
    let s = &mut t.store;
    let too_long = task(&"x".repeat(MAX_TEXT_LENGTH + 1), RecurringType::Daily);
    assert!(matches!(
        add_recurring_task(s, too_long, now()),
        Err(RepoError::InvalidInput(_))
    ));
    let bad_id = NewRecurringTask {
        achievement_id: Some(0),
        ..task("ok", RecurringType::Daily)
    };
    assert!(add_recurring_task(s, bad_id, now()).is_err());

    let unsafe_icon = NewRecurringTask {
        icon_path: Some("../../etc/passwd".into()),
        ..task("ok", RecurringType::Weekly)
    };
    assert_eq!(
        add_recurring_task(s, unsafe_icon, now()).unwrap().icon_path,
        None
    );
    let safe_icon = NewRecurringTask {
        icon_path: Some("ui/icon/1.tex".into()),
        ..task("ok", RecurringType::Weekly)
    };
    assert_eq!(
        add_recurring_task(s, safe_icon, now())
            .unwrap()
            .icon_path
            .as_deref(),
        Some("ui/icon/1.tex")
    );
}

#[test]
fn a_new_task_is_read_from_the_renderer_json() {
    let input: NewRecurringTask =
        serde_json::from_str(r#"{"name":"Raid","type":"weekly","achievementId":3}"#).unwrap();
    assert_eq!(input.kind, RecurringType::Weekly);
    assert_eq!(input.achievement_id, Some(3));
    assert!(serde_json::from_str::<NewRecurringTask>(r#"{"name":"x","type":"hourly"}"#).is_err());
    assert!(serde_json::from_str::<NewRecurringTask>(r#"{"name":42,"type":"daily"}"#).is_err());
}
