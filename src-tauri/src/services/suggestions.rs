//! "What to do next" heuristic over achievements not obtained yet
//! (port of `src/main/services/suggestions.ts`).
//!
//! The Lodestone does not expose partial progress, so the score combines the
//! manual priority, the point value and how close the category is to completion.

use std::collections::HashMap;

use serde::Serialize;

use crate::models::settings::SuggestionWeights;
use crate::models::views::AchievementRow;
use crate::repo::achievements::build_row;
use crate::store::Store;

pub const DEFAULT_LIMIT: usize = 40;
const LEGACY_KIND_ID: u32 = 13;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Suggestion {
    pub achievement: AchievementRow,
    pub score: f64,
    pub reasons: Vec<String>,
}

fn priority_label(priority: u8) -> Option<&'static str> {
    match priority {
        1 => Some("basse"),
        2 => Some("moyenne"),
        3 => Some("haute"),
        _ => None,
    }
}

/// Share of completed achievements per category id.
fn category_completion(store: &Store) -> HashMap<u32, f64> {
    let mut counts: HashMap<u32, (u32, u32)> = HashMap::new();
    for a in &store.catalog.achievements {
        let (total, done) = counts.entry(a.category_id).or_default();
        *total += 1;
        if is_completed(store, a.id) {
            *done += 1;
        }
    }
    counts
        .into_iter()
        .map(|(id, (total, done))| (id, f64::from(done) / f64::from(total)))
        .collect()
}

fn is_completed(store: &Store, id: u32) -> bool {
    store
        .user
        .progress
        .get(&id.to_string())
        .is_some_and(|p| p.completed)
}

/// Best suggestions first; the user's settings weights are used when none are given.
pub fn suggestions(
    store: &Store,
    weights: Option<&SuggestionWeights>,
    limit: usize,
) -> Vec<Suggestion> {
    let weights = weights.unwrap_or(&store.user.settings.suggestion_weights);
    let completion = category_completion(store);
    let max_points = store
        .catalog
        .achievements
        .iter()
        .map(|a| a.points)
        .max()
        .unwrap_or(1)
        .max(1);

    let mut list: Vec<Suggestion> = store
        .catalog
        .achievements
        .iter()
        .filter(|a| a.obtainable && a.kind_id != LEGACY_KIND_ID && !is_completed(store, a.id))
        .filter_map(|a| {
            let priority = store
                .user
                .user_meta
                .get(&a.id.to_string())
                .map_or(0, |m| m.priority);
            let proximity = completion.get(&a.category_id).copied().unwrap_or(0.0);
            let score = f64::from(priority) / 3.0 * weights.priority
                + f64::from(a.points) / f64::from(max_points) * weights.points
                + proximity * weights.category_proximity;
            if score <= 0.0 {
                return None;
            }
            let mut reasons = Vec::new();
            if let Some(label) = priority_label(priority) {
                reasons.push(format!("Priorité {label}"));
            }
            if proximity >= 0.7 {
                reasons.push(format!("Catégorie à {}%", (proximity * 100.0).round()));
            }
            if a.points >= 20 {
                reasons.push(format!("{} points", a.points));
            }
            Some(Suggestion {
                achievement: build_row(store, a),
                score,
                reasons,
            })
        })
        .collect();
    list.sort_by(|x, y| y.score.total_cmp(&x.score));
    list.truncate(limit);
    list
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::catalog::{Achievement, AchievementCategory, AchievementKind, CatalogData};
    use crate::models::user::{Progress, UserMeta};
    use crate::repo::test_support::{achievement, empty_store, TestStore};

    fn ach(id: u32, points: u32, category_id: u32) -> Achievement {
        Achievement {
            points,
            category_id,
            ..achievement(id, &format!("HF {id}"))
        }
    }

    /// Same data set as `test/suggestions.test.ts`.
    fn store() -> TestStore {
        let mut t = empty_store();
        t.store.catalog = CatalogData {
            kinds: vec![AchievementKind {
                id: 1,
                name: "Combat".into(),
                order: 1,
            }],
            categories: vec![
                AchievementCategory {
                    id: 1,
                    kind_id: 1,
                    name: "Donjons".into(),
                    order: 1,
                },
                AchievementCategory {
                    id: 2,
                    kind_id: 1,
                    name: "Raids".into(),
                    order: 2,
                },
            ],
            achievements: vec![
                ach(1, 5, 1),
                ach(2, 5, 1),
                ach(3, 5, 1),
                ach(4, 5, 1),
                ach(5, 40, 2),
                Achievement {
                    obtainable: false,
                    ..ach(6, 10, 3)
                },
                Achievement {
                    kind_id: LEGACY_KIND_ID,
                    ..ach(7, 10, 3)
                },
            ],
            ..CatalogData::default()
        };
        t.store.reindex();
        t
    }

    fn done(store: &mut Store, id: u32) {
        store.user.progress.insert(
            id.to_string(),
            Progress {
                completed: true,
                ..Default::default()
            },
        );
    }

    fn weights(priority: f64, points: f64, category_proximity: f64) -> SuggestionWeights {
        SuggestionWeights {
            priority,
            points,
            category_proximity,
        }
    }

    fn ids(list: &[Suggestion]) -> Vec<u32> {
        list.iter().map(|s| s.achievement.achievement.id).collect()
    }

    #[test]
    fn excludes_obtained_unobtainable_and_legacy_achievements() {
        let mut t = store();
        done(&mut t.store, 1);
        let ids = ids(&suggestions(
            &t.store,
            Some(&weights(1.0, 1.0, 1.0)),
            DEFAULT_LIMIT,
        ));
        assert!(!ids.contains(&1) && !ids.contains(&6) && !ids.contains(&7));
        assert!(ids.contains(&5));
    }

    #[test]
    fn ranks_by_descending_score_and_explains_the_reasons() {
        let mut t = store();
        for id in 1..=3 {
            done(&mut t.store, id);
        }
        t.store.user.user_meta.insert(
            "4".into(),
            UserMeta {
                priority: 3,
                ..Default::default()
            },
        );

        let res = suggestions(&t.store, Some(&weights(3.0, 1.0, 2.0)), DEFAULT_LIMIT);

        assert_eq!(res[0].achievement.achievement.id, 4);
        assert_eq!(res[0].reasons, ["Priorité haute", "Catégorie à 75%"]);
        let big = res
            .iter()
            .find(|s| s.achievement.achievement.id == 5)
            .unwrap();
        assert!(big.reasons.contains(&"40 points".to_owned()));
        assert!(res.windows(2).all(|w| w[0].score >= w[1].score));
    }

    #[test]
    fn skips_zero_scores_and_honours_the_limit() {
        let t = store();
        assert!(suggestions(&t.store, Some(&weights(0.0, 0.0, 0.0)), DEFAULT_LIMIT).is_empty());
        assert_eq!(
            suggestions(&t.store, Some(&weights(0.0, 1.0, 0.0)), 2).len(),
            2
        );
    }

    #[test]
    fn uses_the_user_settings_weights_by_default() {
        let mut t = store();
        t.store.user.settings.suggestion_weights = weights(0.0, 0.0, 0.0);
        assert!(suggestions(&t.store, None, DEFAULT_LIMIT).is_empty());
        t.store.user.settings.suggestion_weights = weights(0.0, 1.0, 0.0);
        assert!(!suggestions(&t.store, None, DEFAULT_LIMIT).is_empty());
    }

    #[test]
    fn an_out_of_range_stored_priority_has_no_label() {
        let mut t = store();
        t.store.user.user_meta.insert(
            "4".into(),
            UserMeta {
                priority: 9,
                ..Default::default()
            },
        );
        let res = suggestions(&t.store, Some(&weights(1.0, 0.0, 0.0)), DEFAULT_LIMIT);
        assert_eq!(res[0].achievement.achievement.id, 4);
        assert!(res[0].reasons.is_empty());
    }
}
