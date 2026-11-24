use serde_json::json;

use super::*;
use crate::models::user::SyncSource;
use crate::repo::test_support::{empty_store, sample_store};
use CollectionType::{Minion, Mount};

fn now() -> DateTime<Utc> {
    "2026-06-19T18:00:00Z".parse().unwrap()
}

fn ids(store: &Store, filter: serde_json::Value) -> Vec<u32> {
    let filter: CollectionFilter = serde_json::from_value(filter).unwrap();
    list_collection(store, &filter)
        .iter()
        .map(|r| r.item.id)
        .collect()
}

#[test]
fn lists_filters_and_computes_progress() {
    let mut t = sample_store();
    let s = &mut t.store;
    set_collection_owned(s, Mount, 1, true, now()).unwrap();

    let status = collections_status(s);
    assert!(status.seeded);
    assert_eq!(status.counts[&Mount], 3);
    assert_eq!(status.counts[&CollectionType::Beast], 0);
    assert_eq!(pending_by_type(s)[&Mount], 1);
    assert_eq!(pending_by_type(s)[&Minion], 1);
    assert_eq!(collection_patches(s, Mount), ["7.1", "6.0"]);
    assert_eq!(
        collection_categories(s, Mount)
            .iter()
            .map(|c| c.name.as_str())
            .collect::<Vec<_>>(),
        ["Raid"]
    );
    assert_eq!(
        collection_progress(s, Mount),
        CollectionProgress {
            kind: Mount,
            total: 3,
            owned: 1
        }
    );
    let all = all_collections_progress(s);
    assert_eq!(all.len(), 12);
    assert_eq!(
        all.iter().find(|p| p.kind == Minion),
        Some(&CollectionProgress {
            kind: Minion,
            total: 1,
            owned: 0
        })
    );

    assert_eq!(ids(s, json!({ "type": "mount" })), [1, 2, 3]);
    let owned = list_collection(
        s,
        &serde_json::from_value(json!({ "type": "mount", "status": "owned" })).unwrap(),
    );
    assert_eq!(
        (owned[0].item.id, owned[0].category_name.as_str()),
        (1, "Raid")
    );
    assert_eq!(owned[0].owned_date.as_deref(), Some("2026-06-19"));
    assert_eq!(owned[0].source, Some(SyncSource::Manual));
    assert_eq!(
        ids(
            s,
            json!({ "type": "mount", "status": "missing", "patch": "7.1" })
        ),
        [2]
    );
    assert_eq!(
        ids(s, json!({ "type": "mount", "search": "MONTURE 3" })),
        [3]
    );
    assert_eq!(
        ids(s, json!({ "type": "mount", "search": "  " })),
        [1, 2, 3]
    );
    assert_eq!(ids(s, json!({ "type": "mount", "categoryId": 1 })), [1]);

    set_collection_owned(s, Mount, 1, false, now()).unwrap();
    assert_eq!(collection_progress(s, Mount).owned, 0);
}

#[test]
fn sorts_by_patch_then_order_then_name() {
    let mut t = sample_store();
    t.store.collections.items[1].order = 0;
    assert_eq!(ids(&t.store, json!({ "type": "mount" })), [2, 1, 3]);
}

#[test]
fn re_owning_keeps_the_first_date() {
    let mut t = sample_store();
    let s = &mut t.store;
    set_collection_owned(s, Mount, 2, true, now()).unwrap();
    set_collection_owned(s, Mount, 2, true, "2026-07-01T00:00:00Z".parse().unwrap()).unwrap();
    assert_eq!(
        s.user.collections["mount:2"].owned_date.as_deref(),
        Some("2026-06-19")
    );
}

#[test]
fn matches_lodestone_names_through_normalised_aliases() {
    let mut t = sample_store();
    let s = &mut t.store;
    let names = ["Monture  2", "MONTURE 3", "Inconnue"].map(String::from);
    assert_eq!(
        apply_lodestone_collection(s, Mount, &names, now()).unwrap(),
        CollectionMatchSummary {
            matched: 2,
            unmatched: 1,
            newly: 2
        }
    );
    assert_eq!(s.user.collections["mount:2"].source, SyncSource::Lodestone);
    assert_eq!(
        apply_lodestone_collection(s, Mount, &["monture 2".into()], now())
            .unwrap()
            .newly,
        0
    );
}

#[test]
fn an_empty_store_has_no_collections() {
    let t = empty_store();
    assert!(!collections_status(&t.store).seeded);
    assert!(pending_by_type(&t.store).values().all(|n| *n == 0));
    assert!(collection_patches(&t.store, Mount).is_empty());
}
