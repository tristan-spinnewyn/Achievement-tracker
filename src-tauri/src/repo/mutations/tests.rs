use super::*;
use crate::models::user::SyncSource;
use crate::repo::achievements::{achievement_row, focus_list};
use crate::repo::catalog::all_tags;
use crate::repo::error::RepoError;
use crate::repo::history::{can_undo, redo, undo};
use crate::repo::test_support::sample_store;
use crate::sanitize::primitives::MAX_TEXT_LENGTH;

fn now() -> DateTime<Utc> {
    "2026-06-19T18:00:00Z".parse().unwrap()
}

fn row(store: &Store, id: u32) -> crate::models::views::AchievementRow {
    achievement_row(store, id).unwrap()
}

#[test]
fn checks_and_unchecks_with_undo_and_redo() {
    let mut t = sample_store();
    let s = &mut t.store;

    set_manual_completion(s, 1, true, now()).unwrap();
    let r = row(s, 1);
    assert!(r.completed);
    assert_eq!(r.completed_date.as_deref(), Some("2026-06-19"));
    assert_eq!(r.source, Some(SyncSource::Manual));
    assert!(can_undo(s));

    assert!(undo(s).unwrap());
    assert!(!row(s, 1).completed);
    assert!(redo(s).unwrap());
    assert!(row(s, 1).completed);

    set_manual_completion(s, 1, false, now()).unwrap();
    assert!(!row(s, 1).completed);
    let saved = std::fs::read_to_string(t.dir_path().join("userdata.json")).unwrap();
    assert!(saved.contains("setCompletion"));
}

#[test]
fn re_checking_keeps_the_first_completion_date() {
    let mut t = sample_store();
    let s = &mut t.store;
    set_manual_completion(s, 1, true, now()).unwrap();
    set_manual_completion(s, 1, true, "2026-07-01T00:00:00Z".parse().unwrap()).unwrap();
    assert_eq!(row(s, 1).completed_date.as_deref(), Some("2026-06-19"));
}

#[test]
fn a_lodestone_completion_cannot_be_unchecked() {
    let mut t = sample_store();
    let s = &mut t.store;
    let items = [
        LodestoneCompletion {
            id: 2,
            date: Some("2026-01-01".into()),
        },
        LodestoneCompletion { id: 3, date: None },
    ];
    assert_eq!(
        apply_lodestone_completions(s, &items, now()).unwrap(),
        CompletionSummary { newly: 2, total: 2 }
    );

    set_manual_completion(s, 2, false, now()).unwrap();

    assert!(row(s, 2).completed);
    assert!(!can_undo(s));
    let again = [LodestoneCompletion { id: 2, date: None }];
    assert_eq!(
        apply_lodestone_completions(s, &again, now()).unwrap().newly,
        0
    );
    assert_eq!(row(s, 2).completed_date.as_deref(), Some("2026-01-01"));
}

#[test]
fn handles_priority_focus_note_deadline_and_tags_with_undo() {
    let mut t = sample_store();
    let s = &mut t.store;
    set_priority(s, 1, 3, now()).unwrap();
    set_focus(s, 1, true, now()).unwrap();
    set_focus(s, 2, true, now()).unwrap();
    reorder_focus(s, &[2, 1]).unwrap();
    set_note(s, 1, Some("  ".into()), now()).unwrap();
    set_note(s, 2, Some("à faire".into()), now()).unwrap();
    set_deadline(s, 2, Some("2026-12-31".into()), now()).unwrap();
    set_achievement_tags(
        s,
        2,
        &[" raid ".into(), "raid".into(), String::new(), "solo".into()],
        now(),
    )
    .unwrap();

    assert_eq!(row(s, 1).priority, 3);
    assert_eq!(
        focus_list(s)
            .iter()
            .map(|r| r.achievement.id)
            .collect::<Vec<_>>(),
        [2, 1]
    );
    assert_eq!(row(s, 1).note, None);
    assert_eq!(row(s, 2).note.as_deref(), Some("à faire"));
    assert_eq!(all_tags(s), ["raid", "solo"]);

    assert!(undo(s).unwrap());
    assert!(row(s, 2).tags.is_empty());
    assert!(undo(s).unwrap());
    assert_eq!(row(s, 2).deadline, None);
    assert!(undo(s).unwrap());
    assert_eq!(row(s, 2).note, None);
}

#[test]
fn focus_goes_to_the_end_and_leaving_it_clears_the_order() {
    let mut t = sample_store();
    let s = &mut t.store;
    set_focus(s, 1, true, now()).unwrap();
    set_focus(s, 2, true, now()).unwrap();
    assert_eq!(row(s, 2).focus_order, Some(2));

    set_focus(s, 1, false, now()).unwrap();
    assert_eq!(row(s, 1).focus_order, None);
    assert!(!row(s, 1).in_focus);
    assert!(undo(s).unwrap());
    assert_eq!(row(s, 1).focus_order, Some(1));
}

#[test]
fn empty_values_clear_note_deadline_and_tags() {
    let mut t = sample_store();
    let s = &mut t.store;
    set_deadline(s, 1, Some(String::new()), now()).unwrap();
    set_note(s, 1, None, now()).unwrap();
    set_achievement_tags(s, 1, &["x".into()], now()).unwrap();
    set_achievement_tags(s, 1, &[" ".into()], now()).unwrap();
    assert_eq!(row(s, 1).deadline, None);
    assert!(!s.user.tags_by_achievement.contains_key("1"));
}

#[test]
fn rejects_invalid_arguments_without_changing_anything() {
    let mut t = sample_store();
    let s = &mut t.store;
    let invalid = |r: RepoResult<()>| matches!(r, Err(RepoError::InvalidInput(_)));
    assert!(invalid(set_manual_completion(s, 0, true, now())));
    assert!(invalid(set_priority(s, 0, 1, now())));
    assert!(invalid(set_priority(s, 1, 4, now())));
    assert!(invalid(set_focus(s, 0, true, now())));
    assert!(invalid(reorder_focus(s, &[1, 0])));
    assert!(invalid(set_note(s, 0, Some("x".into()), now())));
    assert!(invalid(set_note(
        s,
        1,
        Some("x".repeat(MAX_TEXT_LENGTH + 1)),
        now()
    )));
    assert!(invalid(set_deadline(s, 0, None, now())));
    assert!(invalid(set_achievement_tags(s, 0, &[], now())));
    assert!(invalid(set_achievement_tags(
        s,
        1,
        &["x".repeat(MAX_TEXT_LENGTH + 1)],
        now()
    )));
    assert!(s.user.user_meta.is_empty());
    assert!(s.user.progress.is_empty());
    assert!(!can_undo(s));
}
