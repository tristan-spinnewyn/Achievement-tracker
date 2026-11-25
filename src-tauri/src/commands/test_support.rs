//! Mock Tauri app holding a sample store, for the command tests.

use tauri::test::{mock_app, MockRuntime};
use tauri::{App, Manager};
use tempfile::TempDir;

use crate::repo::test_support::sample_store;
use crate::state::AppState;

pub struct TestApp {
    pub app: App<MockRuntime>,
    _store_dir: TempDir,
}

impl TestApp {
    pub fn state(&self) -> tauri::State<'_, AppState> {
        self.app.state::<AppState>()
    }
}

/// An app whose state holds the data set of `repo::test_support::sample_store`.
pub fn sample_app() -> TestApp {
    let (store, dir) = sample_store().into_parts();
    let app = mock_app();
    app.manage(AppState::new(store));
    TestApp {
        app,
        _store_dir: dir,
    }
}
