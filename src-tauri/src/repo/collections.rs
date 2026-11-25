//! Collections: status, listing, progress, ownership, Lodestone matching.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Serialize;

use super::catalog::sorted_patches;
use super::error::RepoResult;
use crate::models::collections::{
    collection_key, CollectionCategory, CollectionItem, CollectionOwnership, CollectionType,
};
use crate::models::user::SyncSource;
use crate::models::views::{
    CollectionFilter, CollectionItemRow, CollectionProgress, CollectionStatus, CollectionsStatus,
    CountsByType,
};
use crate::shared::names::{compare_fr, normalize_name, patch_sort_key};
use crate::shared::timestamps::{iso_date, iso_timestamp};
use crate::store::Store;

fn items_of(store: &Store, kind: CollectionType) -> impl Iterator<Item = &CollectionItem> {
    store
        .collections
        .items
        .iter()
        .filter(move |it| it.kind == kind)
}

fn ownership<'a>(store: &'a Store, item: &CollectionItem) -> Option<&'a CollectionOwnership> {
    store
        .user
        .collections
        .get(&collection_key(item.kind, item.id))
}

fn is_owned(store: &Store, item: &CollectionItem) -> bool {
    ownership(store, item).is_some_and(|o| o.owned)
}

fn count(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

/// Marks an item owned, keeping the first ownership date.
fn mark_owned(
    store: &mut Store,
    kind: CollectionType,
    id: u32,
    source: SyncSource,
    now: DateTime<Utc>,
) {
    let key = collection_key(kind, id);
    let owned_date = store
        .user
        .collections
        .get(&key)
        .and_then(|o| o.owned_date.clone());
    let ownership = CollectionOwnership {
        owned: true,
        owned_date: owned_date.or_else(|| Some(iso_date(now))),
        source,
        updated_at: iso_timestamp(now),
    };
    store.user.collections.insert(key, ownership);
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CollectionMatchSummary {
    pub matched: u32,
    pub unmatched: u32,
    pub newly: u32,
}

pub fn collections_status(store: &Store) -> CollectionsStatus {
    let counts = CollectionType::ALL
        .iter()
        .map(|k| (*k, count(items_of(store, *k).count())))
        .collect();
    CollectionsStatus {
        seeded: !store.collections.items.is_empty(),
        counts,
        generated_at: store.collections.generated_at.clone(),
        game_version: store.collections.game_version.clone(),
    }
}

/// Items of the latest patch not owned yet, per type (sidebar badges).
pub fn pending_by_type(store: &Store) -> CountsByType {
    CollectionType::ALL
        .iter()
        .map(|kind| {
            let latest = collection_patches(store, *kind).into_iter().next();
            let pending = items_of(store, *kind)
                .filter(|it| latest.is_some() && it.patch == latest && !is_owned(store, it))
                .count();
            (*kind, count(pending))
        })
        .collect()
}

pub fn collection_categories(store: &Store, kind: CollectionType) -> Vec<CollectionCategory> {
    let mut categories: Vec<CollectionCategory> = store
        .collections
        .categories
        .iter()
        .filter(|c| c.kind == kind)
        .cloned()
        .collect();
    categories.sort_by_key(|c| c.order);
    categories
}

fn build_row(store: &Store, item: &CollectionItem) -> CollectionItemRow {
    let own = ownership(store, item);
    let category_name = item
        .category_id
        .and_then(|id| {
            store
                .collections
                .categories
                .iter()
                .find(|c| c.kind == item.kind && c.id == id)
        })
        .map(|c| c.name.clone())
        .unwrap_or_default();
    CollectionItemRow {
        item: item.clone(),
        category_name,
        owned: own.is_some_and(|o| o.owned),
        owned_date: own.and_then(|o| o.owned_date.clone()),
        source: own.map(|o| o.source),
    }
}

/// Rows sorted by patch (most recent first), then internal order, then name.
pub fn list_collection(store: &Store, filter: &CollectionFilter) -> Vec<CollectionItemRow> {
    let search = filter
        .search
        .as_deref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());
    let mut rows: Vec<CollectionItemRow> = items_of(store, filter.kind)
        .filter(|it| {
            filter
                .category_id
                .is_none_or(|id| it.category_id == Some(id))
        })
        .filter(|it| filter.patch.is_none() || it.patch == filter.patch)
        .map(|it| build_row(store, it))
        .filter(|row| match filter.status {
            CollectionStatus::All => true,
            CollectionStatus::Owned => row.owned,
            CollectionStatus::Missing => !row.owned,
        })
        .filter(|row| {
            search.as_ref().is_none_or(|q| {
                row.item.name.to_lowercase().contains(q)
                    || row.item.description.to_lowercase().contains(q)
            })
        })
        .collect();
    rows.sort_by(|a, b| {
        patch_sort_key(b.item.patch.as_deref())
            .total_cmp(&patch_sort_key(a.item.patch.as_deref()))
            .then(a.item.order.cmp(&b.item.order))
            .then_with(|| compare_fr(&a.item.name, &b.item.name))
    });
    rows
}

/// Owned / total for every type, in the canonical type order.
pub fn all_collections_progress(store: &Store) -> Vec<CollectionProgress> {
    CollectionType::ALL
        .iter()
        .map(|kind| collection_progress(store, *kind))
        .collect()
}

/// Patches of a collection, most recent first.
pub fn collection_patches(store: &Store, kind: CollectionType) -> Vec<String> {
    sorted_patches(items_of(store, kind).filter_map(|it| it.patch.as_deref()))
}

pub fn collection_progress(store: &Store, kind: CollectionType) -> CollectionProgress {
    CollectionProgress {
        kind,
        total: count(items_of(store, kind).count()),
        owned: count(
            items_of(store, kind)
                .filter(|it| is_owned(store, it))
                .count(),
        ),
    }
}

pub fn set_collection_owned(
    store: &mut Store,
    kind: CollectionType,
    id: u32,
    owned: bool,
    now: DateTime<Utc>,
) -> RepoResult<()> {
    if owned {
        mark_owned(store, kind, id, SyncSource::Manual, now);
    } else {
        store.user.collections.remove(&collection_key(kind, id));
    }
    Ok(store.save_user()?)
}

/// Matches names scraped from the Lodestone through the normalised aliases.
/// Never removes anything: the Lodestone only lists what is owned.
pub fn apply_lodestone_collection(
    store: &mut Store,
    kind: CollectionType,
    names: &[String],
    now: DateTime<Utc>,
) -> RepoResult<CollectionMatchSummary> {
    let mut alias_to_id: HashMap<&str, u32> = HashMap::new();
    for item in items_of(store, kind) {
        for alias in &item.aliases {
            alias_to_id.entry(alias.as_str()).or_insert(item.id);
        }
    }
    let matched_ids: Vec<Option<u32>> = names
        .iter()
        .map(|n| alias_to_id.get(normalize_name(n).as_str()).copied())
        .collect();

    let mut summary = CollectionMatchSummary {
        matched: 0,
        unmatched: 0,
        newly: 0,
    };
    for id in matched_ids {
        let Some(id) = id else {
            summary.unmatched += 1;
            continue;
        };
        summary.matched += 1;
        if !store
            .user
            .collections
            .get(&collection_key(kind, id))
            .is_some_and(|o| o.owned)
        {
            summary.newly += 1;
        }
        mark_owned(store, kind, id, SyncSource::Lodestone, now);
    }
    store.save_user()?;
    Ok(summary)
}

#[cfg(test)]
mod tests;
