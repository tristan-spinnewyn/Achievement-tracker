//! Catalog metadata: status, kinds, categories, patches, seasonal events, tags.

use std::collections::BTreeSet;

use crate::models::catalog::{AchievementCategory, AchievementKind};
use crate::models::views::{CatalogStatus, LatestPatchSummary};
use crate::shared::names::{compare_fr, patch_sort_key};
use crate::store::Store;

pub fn catalog_status(store: &Store) -> CatalogStatus {
    let count = store.catalog.achievements.len();
    CatalogStatus {
        seeded: count > 0,
        achievement_count: u32::try_from(count).unwrap_or(u32::MAX),
        game_version: store.catalog.game_version.clone(),
        generated_at: store.catalog.generated_at.clone(),
    }
}

/// Kinds with a name (the catalog has unnamed placeholder rows).
pub fn kinds(store: &Store) -> Vec<AchievementKind> {
    store
        .catalog
        .kinds
        .iter()
        .filter(|k| !k.name.trim().is_empty())
        .cloned()
        .collect()
}

/// Categories with a name.
pub fn categories(store: &Store) -> Vec<AchievementCategory> {
    store
        .catalog
        .categories
        .iter()
        .filter(|c| !c.name.trim().is_empty())
        .cloned()
        .collect()
}

/// Distinct patches, most recent first.
pub fn sorted_patches<'a>(patches: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut patches: Vec<String> = patches
        .collect::<BTreeSet<_>>()
        .into_iter()
        .map(str::to_owned)
        .collect();
    patches.sort_by(|a, b| patch_sort_key(Some(b)).total_cmp(&patch_sort_key(Some(a))));
    patches
}

/// Distinct strings in French alphabetical order.
fn sorted_fr<'a>(values: impl Iterator<Item = &'a String>) -> Vec<String> {
    let mut values: Vec<String> = values
        .collect::<BTreeSet<_>>()
        .into_iter()
        .cloned()
        .collect();
    values.sort_by(|a, b| compare_fr(a, b));
    values
}

/// Patches present in the catalog, most recent first.
pub fn achievement_patches(store: &Store) -> Vec<String> {
    sorted_patches(
        store
            .catalog
            .achievements
            .iter()
            .filter_map(|a| a.patch.as_deref()),
    )
}

/// Seasonal events present in the catalog, alphabetically.
pub fn seasonal_events(store: &Store) -> Vec<String> {
    sorted_fr(
        store
            .catalog
            .achievements
            .iter()
            .filter_map(|a| a.seasonal_event.as_ref()),
    )
}

pub fn latest_patch_summary(store: &Store) -> LatestPatchSummary {
    let Some(latest) = achievement_patches(store).into_iter().next() else {
        return LatestPatchSummary {
            patch: None,
            pending: 0,
            total: 0,
        };
    };
    let (mut total, mut pending) = (0, 0);
    for a in store
        .catalog
        .achievements
        .iter()
        .filter(|a| a.patch.as_deref() == Some(&latest))
    {
        total += 1;
        if !store
            .user
            .progress
            .get(&a.id.to_string())
            .is_some_and(|p| p.completed)
        {
            pending += 1;
        }
    }
    LatestPatchSummary {
        patch: Some(latest),
        pending,
        total,
    }
}

/// Every tag used by the user, alphabetically.
pub fn all_tags(store: &Store) -> Vec<String> {
    sorted_fr(store.user.tags_by_achievement.values().flatten())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::user::Progress;
    use crate::repo::test_support::{empty_store, sample_store};

    #[test]
    fn exposes_patches_seasonal_events_and_the_latest_patch() {
        let t = sample_store();
        let s = &t.store;
        assert_eq!(achievement_patches(s), ["7.1", "6.5"]);
        assert_eq!(seasonal_events(s), ["Halloween"]);
        assert_eq!(
            latest_patch_summary(s),
            LatestPatchSummary {
                patch: Some("7.1".into()),
                pending: 2,
                total: 2
            }
        );
        assert_eq!(catalog_status(s).achievement_count, 3);
        assert!(catalog_status(s).seeded);
        assert_eq!(kinds(s).iter().map(|k| k.id).collect::<Vec<_>>(), [1, 2]);
        assert_eq!(categories(s).len(), 2);
    }

    #[test]
    fn completed_achievements_are_not_pending_in_the_latest_patch() {
        let mut t = sample_store();
        t.store.user.progress.insert(
            "1".into(),
            Progress {
                completed: true,
                ..Default::default()
            },
        );
        assert_eq!(latest_patch_summary(&t.store).pending, 1);
    }

    #[test]
    fn hides_unnamed_kinds_and_categories() {
        let mut t = sample_store();
        t.store.catalog.kinds[0].name = "  ".into();
        t.store.catalog.categories[1].name = String::new();
        assert_eq!(kinds(&t.store).len(), 1);
        assert_eq!(categories(&t.store).len(), 1);
    }

    #[test]
    fn an_empty_catalog_has_no_latest_patch() {
        let t = empty_store();
        assert_eq!(
            latest_patch_summary(&t.store),
            LatestPatchSummary {
                patch: None,
                pending: 0,
                total: 0
            }
        );
        assert!(!catalog_status(&t.store).seeded);
    }

    #[test]
    fn all_tags_are_unique_and_sorted() {
        let mut t = empty_store();
        let tags = &mut t.store.user.tags_by_achievement;
        tags.insert("1".into(), vec!["solo".into(), "raid".into()]);
        tags.insert("2".into(), vec!["Été".into(), "raid".into()]);
        assert_eq!(all_tags(&t.store), ["Été", "raid", "solo"]);
    }
}
