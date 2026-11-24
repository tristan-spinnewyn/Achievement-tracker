//! Application state shared by the Tauri commands.

use std::io;
use std::sync::{Mutex, MutexGuard};

use crate::store::paths::StorePaths;
use crate::store::Store;

pub struct AppState {
    store: Mutex<Store>,
}

impl AppState {
    pub fn new(store: Store) -> Self {
        Self {
            store: Mutex::new(store),
        }
    }

    /// Loads the store from its files.
    pub fn load(paths: StorePaths) -> io::Result<Self> {
        Store::load(paths).map(Self::new)
    }

    /// Exclusive access to the store. A panic in another command does not
    /// make the data unusable: the lock is recovered instead of propagating it.
    pub fn store(&self) -> MutexGuard<'_, Store> {
        self.store
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::settings::Region;

    fn paths(dir: &tempfile::TempDir) -> StorePaths {
        StorePaths {
            data_dir: dir.path().to_path_buf(),
            documents_dir: None,
        }
    }

    #[test]
    fn loads_the_store_from_the_data_folder() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("userdata.json"),
            r#"{"settings":{"region":"ja"}}"#,
        )
        .unwrap();

        let state = AppState::load(paths(&dir)).unwrap();

        assert_eq!(state.store().user.settings.region, Region::Ja);
    }

    #[test]
    fn store_stays_usable_after_a_panic_while_locked() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::load(paths(&dir)).unwrap();

        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = state.store();
            panic!("command failed");
        }));

        assert_eq!(state.store().user.settings.region, Region::Eu);
    }
}
