//! Shared fixtures for the repo and service tests.

use tempfile::TempDir;

use crate::models::catalog::{Achievement, AchievementCategory, AchievementKind, CatalogData};
use crate::models::collections::{
    CollectionCategory, CollectionItem, CollectionType, CollectionsData,
};
use crate::models::views::AchievementRow;
use crate::store::paths::StorePaths;
use crate::store::Store;

/// A store backed by a temporary folder, without Documents mirror.
pub struct TestStore {
    pub store: Store,
    _dir: TempDir,
}

impl TestStore {
    /// Folder holding the store files (to check what was saved).
    pub fn dir_path(&self) -> &std::path::Path {
        self._dir.path()
    }

    /// The store and the folder guard that must outlive it.
    pub fn into_parts(self) -> (Store, TempDir) {
        (self.store, self._dir)
    }
}

pub fn achievement(id: u32, name: &str) -> Achievement {
    Achievement {
        id,
        name: name.into(),
        description: String::new(),
        points: 10,
        category_id: 1,
        kind_id: 1,
        icon_path: None,
        obtainable: true,
        patch: Some("7.0".into()),
        is_seasonal: None,
        seasonal_event: None,
        seasonal_end_date: None,
    }
}

pub fn item(kind: CollectionType, id: u32, patch: &str) -> CollectionItem {
    CollectionItem {
        kind,
        id,
        name: format!("Monture {id}"),
        description: String::new(),
        icon_path: None,
        category_id: None,
        order: i64::from(id),
        patch: Some(patch.into()),
        sources: vec![],
        aliases: vec![format!("monture {id}")],
    }
}

/// Same data set as `test/repo.test.ts`.
pub fn sample_store() -> TestStore {
    let mut t = empty_store();
    let store = &mut t.store;
    store.catalog = CatalogData {
        generated_at: None,
        game_version: None,
        kinds: vec![
            AchievementKind {
                id: 1,
                name: "Combat".into(),
                order: 2,
            },
            AchievementKind {
                id: 2,
                name: "Quêtes".into(),
                order: 1,
            },
        ],
        categories: vec![
            AchievementCategory {
                id: 1,
                kind_id: 1,
                name: "Donjons".into(),
                order: 1,
            },
            AchievementCategory {
                id: 2,
                kind_id: 2,
                name: "Scénario".into(),
                order: 2,
            },
        ],
        achievements: vec![
            Achievement {
                points: 5,
                patch: Some("7.1".into()),
                ..achievement(1, "Alpha")
            },
            Achievement {
                points: 20,
                category_id: 2,
                kind_id: 2,
                patch: Some("6.5".into()),
                is_seasonal: Some(true),
                seasonal_event: Some("Halloween".into()),
                ..achievement(2, "Bravo")
            },
            Achievement {
                obtainable: false,
                patch: Some("7.1".into()),
                ..achievement(3, "Charlie")
            },
        ],
    };
    store.collections = CollectionsData {
        generated_at: None,
        game_version: None,
        categories: vec![CollectionCategory {
            kind: CollectionType::Mount,
            id: 1,
            name: "Raid".into(),
            order: 1,
        }],
        items: vec![
            CollectionItem {
                category_id: Some(1),
                ..item(CollectionType::Mount, 1, "7.1")
            },
            item(CollectionType::Mount, 2, "7.1"),
            item(CollectionType::Mount, 3, "6.0"),
            item(CollectionType::Minion, 1, "7.0"),
        ],
    };
    store.reindex();
    t
}

pub fn empty_store() -> TestStore {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::load(StorePaths {
        data_dir: dir.path().to_path_buf(),
        documents_dir: None,
    })
    .unwrap();
    TestStore { store, _dir: dir }
}

/// A bare row for the search tests.
pub fn row(id: u32, name: &str, description: &str, category: &str, kind: &str) -> AchievementRow {
    AchievementRow {
        achievement: Achievement {
            description: description.into(),
            ..achievement(id, name)
        },
        category_name: category.into(),
        kind_name: kind.into(),
        completed: false,
        completed_date: None,
        source: None,
        priority: 0,
        in_focus: false,
        focus_order: None,
        note: None,
        deadline: None,
        tags: vec![],
    }
}
