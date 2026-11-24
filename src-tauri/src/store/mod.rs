//! In-memory data store persisted as JSON files (port of `src/main/data/store.ts`).

pub mod json_file;
pub mod paths;

use std::collections::HashMap;
use std::fs;
use std::io;

use serde::Serialize;

use crate::models::catalog::{Achievement, AchievementCategory, AchievementKind, CatalogData};
use crate::models::collections::{collection_key, CollectionItem, CollectionsData};
use crate::models::user::UserData;
use crate::sanitize::user_data::{parse_user_lenient, sanitize_imported_user};
use json_file::{atomic_write, read_json, read_json_value};
use paths::StorePaths;

pub struct Store {
    paths: StorePaths,
    pub catalog: CatalogData,
    pub collections: CollectionsData,
    pub user: UserData,
    pub kind_by_id: HashMap<u32, AchievementKind>,
    pub category_by_id: HashMap<u32, AchievementCategory>,
    pub achievement_by_id: HashMap<u32, Achievement>,
    /// Keyed `{type}:{id}`.
    pub collection_item_by_key: HashMap<String, CollectionItem>,
}

impl Store {
    /// Loads every file; with no local progress, restores the Documents mirror (sanitized).
    pub fn load(paths: StorePaths) -> io::Result<Self> {
        fs::create_dir_all(&paths.data_dir)?;
        let local_user = read_json_value(&paths.user())
            .map(|raw| parse_user_lenient(&raw))
            .unwrap_or_default();
        let user = if local_user.has_data() {
            local_user
        } else {
            restore_documents_mirror(&paths).unwrap_or(local_user)
        };
        let mut store = Self {
            catalog: read_json(&paths.catalog()).unwrap_or_default(),
            collections: read_json(&paths.collections()).unwrap_or_default(),
            user,
            paths,
            kind_by_id: HashMap::new(),
            category_by_id: HashMap::new(),
            achievement_by_id: HashMap::new(),
            collection_item_by_key: HashMap::new(),
        };
        store.reindex();
        Ok(store)
    }

    /// Rebuilds the lookup maps after the catalog or the collections changed.
    pub fn reindex(&mut self) {
        self.kind_by_id = self
            .catalog
            .kinds
            .iter()
            .map(|k| (k.id, k.clone()))
            .collect();
        self.category_by_id = self
            .catalog
            .categories
            .iter()
            .map(|c| (c.id, c.clone()))
            .collect();
        self.achievement_by_id = self
            .catalog
            .achievements
            .iter()
            .map(|a| (a.id, a.clone()))
            .collect();
        self.collection_item_by_key = self
            .collections
            .items
            .iter()
            .map(|i| (collection_key(i.kind, i.id), i.clone()))
            .collect();
    }

    pub fn set_catalog(&mut self, catalog: CatalogData) -> io::Result<()> {
        self.catalog = catalog;
        self.reindex();
        atomic_write(&self.paths.catalog(), &to_json(&self.catalog))
    }

    pub fn set_collections(&mut self, collections: CollectionsData) -> io::Result<()> {
        self.collections = collections;
        self.reindex();
        atomic_write(&self.paths.collections(), &to_json(&self.collections))
    }

    /// Saves the user data, then the Documents mirror when enabled (its failure is only logged).
    pub fn save_user(&self) -> io::Result<()> {
        atomic_write(&self.paths.user(), &to_json(&self.user))?;
        if self.user.settings.auto_backup_documents {
            if let Err(err) = self.save_documents_mirror() {
                eprintln!("[store] cannot write the Documents backup: {err}");
            }
        }
        Ok(())
    }

    /// Replaces the user data (backup import) and saves it.
    pub fn replace_user(&mut self, user: UserData) -> io::Result<()> {
        self.user = user;
        self.save_user()
    }

    fn save_documents_mirror(&self) -> io::Result<()> {
        let (Some(dir), Some(path)) = (&self.paths.documents_dir, self.paths.documents_backup())
        else {
            return Ok(());
        };
        fs::create_dir_all(dir)?;
        let pretty = serde_json::to_string_pretty(&self.user).expect("user data always serializes");
        atomic_write(&path, &pretty)
    }
}

/// The Documents folder is shared with other programs: its file is treated as untrusted.
fn restore_documents_mirror(paths: &StorePaths) -> Option<UserData> {
    let path = paths.documents_backup()?;
    let user = sanitize_imported_user(&read_json_value(&path)?)?;
    eprintln!(
        "[store] restoring from the Documents backup: {}",
        path.display()
    );
    Some(user)
}

fn to_json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("store data always serializes")
}

#[cfg(test)]
mod tests;
