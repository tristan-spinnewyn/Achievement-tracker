//! Dashboard aggregates: totals, progress by kind and category, recent completions.

use std::collections::HashMap;

use super::achievements::focus_list;
use crate::models::views::{CategoryProgress, DashboardData, KindProgress, RecentCompletion};
use crate::store::Store;

const MAX_RECENT_COMPLETIONS: usize = 12;

/// Totals shared by kind and category progress.
#[derive(Default)]
struct Tally {
    total: u32,
    completed: u32,
    points: u32,
    earned_points: u32,
}

impl Tally {
    fn add(&mut self, points: u32, done: bool) {
        self.total += 1;
        self.points += points;
        if done {
            self.completed += 1;
            self.earned_points += points;
        }
    }
}

pub fn dashboard(store: &Store) -> DashboardData {
    let mut kinds: HashMap<u32, Tally> = HashMap::new();
    let mut categories: HashMap<u32, Tally> = HashMap::new();
    let mut overall = Tally::default();
    let mut recent = Vec::new();

    for a in &store.catalog.achievements {
        let progress = store.user.progress.get(&a.id.to_string());
        let done = progress.is_some_and(|p| p.completed);
        overall.add(a.points, done);
        if store
            .kind_by_id
            .get(&a.kind_id)
            .is_some_and(|k| !k.name.trim().is_empty())
        {
            kinds.entry(a.kind_id).or_default().add(a.points, done);
        }
        if store
            .category_by_id
            .get(&a.category_id)
            .is_some_and(|c| !c.name.trim().is_empty())
        {
            categories
                .entry(a.category_id)
                .or_default()
                .add(a.points, done);
        }
        if let Some(date) = progress
            .filter(|_| done)
            .and_then(|p| p.completed_date.clone())
        {
            recent.push(RecentCompletion {
                id: a.id,
                name: a.name.clone(),
                completed_date: Some(date),
                points: a.points,
            });
        }
    }
    recent.sort_by(|x, y| y.completed_date.cmp(&x.completed_date));
    recent.truncate(MAX_RECENT_COMPLETIONS);

    DashboardData {
        total_achievements: overall.total,
        completed_achievements: overall.completed,
        total_points: overall.points,
        earned_points: overall.earned_points,
        focus_count: u32::try_from(focus_list(store).len()).unwrap_or(u32::MAX),
        by_kind: kind_progress(store, kinds),
        by_category: category_progress(store, categories),
        recent_completions: recent,
    }
}

fn kind_progress(store: &Store, kinds: HashMap<u32, Tally>) -> Vec<KindProgress> {
    let mut rows: Vec<KindProgress> = kinds
        .into_iter()
        .map(|(kind_id, t)| KindProgress {
            kind_id,
            kind_name: store.kind_by_id[&kind_id].name.clone(),
            total: t.total,
            completed: t.completed,
            points: t.points,
            earned_points: t.earned_points,
        })
        .collect();
    rows.sort_by_key(|k| (store.kind_by_id[&k.kind_id].order, k.kind_id));
    rows
}

fn category_progress(store: &Store, categories: HashMap<u32, Tally>) -> Vec<CategoryProgress> {
    let mut rows: Vec<CategoryProgress> = categories
        .into_iter()
        .map(|(category_id, t)| {
            let category = &store.category_by_id[&category_id];
            CategoryProgress {
                category_id,
                category_name: category.name.clone(),
                kind_id: category.kind_id,
                kind_name: store
                    .kind_by_id
                    .get(&category.kind_id)
                    .map(|k| k.name.clone())
                    .unwrap_or_default(),
                total: t.total,
                completed: t.completed,
                points: t.points,
                earned_points: t.earned_points,
            }
        })
        .collect();
    rows.sort_by_key(|c| (store.category_by_id[&c.category_id].order, c.category_id));
    rows
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::user::{Progress, UserMeta};
    use crate::repo::test_support::sample_store;

    fn complete(store: &mut Store, id: &str, date: Option<&str>) {
        let progress = Progress {
            completed: true,
            completed_date: date.map(Into::into),
            ..Default::default()
        };
        store.user.progress.insert(id.into(), progress);
    }

    #[test]
    fn aggregates_points_and_progress_by_kind_and_category() {
        let mut t = sample_store();
        complete(&mut t.store, "2", Some("2026-01-01"));
        t.store.user.user_meta.insert(
            "1".into(),
            UserMeta {
                in_focus: true,
                ..Default::default()
            },
        );

        let d = dashboard(&t.store);

        assert_eq!((d.total_achievements, d.completed_achievements), (3, 1));
        assert_eq!((d.total_points, d.earned_points), (35, 20));
        assert_eq!(d.focus_count, 1);
        assert_eq!(
            d.by_kind.iter().map(|k| k.kind_id).collect::<Vec<_>>(),
            [2, 1]
        );
        let quests = d.by_category.iter().find(|c| c.category_id == 2).unwrap();
        assert_eq!(
            (quests.completed, quests.total, quests.kind_name.as_str()),
            (1, 1, "Quêtes")
        );
        assert_eq!(quests.earned_points, 20);
        let combat = d.by_kind.iter().find(|k| k.kind_id == 1).unwrap();
        assert_eq!((combat.total, combat.points, combat.completed), (2, 15, 0));
        assert_eq!(d.recent_completions[0].id, 2);
    }

    #[test]
    fn recent_completions_are_dated_newest_first_and_capped() {
        let mut t = sample_store();
        let achievements = (10..30).map(|id| crate::repo::test_support::achievement(id, "x"));
        t.store.catalog.achievements.extend(achievements);
        for id in 10..30 {
            complete(
                &mut t.store,
                &id.to_string(),
                Some(&format!("2026-01-{id:02}")),
            );
        }
        complete(&mut t.store, "1", None);

        let d = dashboard(&t.store);

        assert_eq!(d.completed_achievements, 21);
        assert_eq!(d.recent_completions.len(), MAX_RECENT_COMPLETIONS);
        assert_eq!(d.recent_completions[0].id, 29);
        assert!(d.recent_completions.iter().all(|r| r.id != 1));
    }

    #[test]
    fn skips_unnamed_kinds_and_categories() {
        let mut t = sample_store();
        t.store.catalog.kinds[0].name = String::new();
        t.store.catalog.categories[0].name = " ".into();
        t.store.reindex();

        let d = dashboard(&t.store);

        assert_eq!(d.by_kind.iter().map(|k| k.kind_id).collect::<Vec<_>>(), [2]);
        assert_eq!(
            d.by_category
                .iter()
                .map(|c| c.category_id)
                .collect::<Vec<_>>(),
            [2]
        );
    }
}
