//! One-time import of the data the Electron app left on this computer.
//!
//! The Electron app kept its files in `%APPDATA%\ffxiv-achievement-tracker`; the
//! Tauri app uses a folder named after its identifier. On the first launch, the
//! files are copied, never moved: the Electron folder stays as it was.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::json_file::{atomic_copy, read_json};
use super::paths::StorePaths;

/// Name of the Electron app's data folder, in the platform config folder
/// (`%APPDATA%` on Windows).
pub const ELECTRON_DATA_FOLDER: &str = "ffxiv-achievement-tracker";

/// Size and position of the main window saved by the Electron app: outer
/// bounds in logical pixels, before any maximization.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct ElectronWindowState {
    pub width: f64,
    pub height: f64,
    pub x: Option<f64>,
    pub y: Option<f64>,
    #[serde(default)]
    pub maximized: bool,
}

/// What the first launch took over from the Electron app.
#[derive(Debug, Clone, PartialEq)]
pub struct ElectronMigration {
    /// Names of the copied data files.
    pub copied: Vec<&'static str>,
    /// Window bounds to restore, if the Electron app saved valid ones.
    pub window: Option<ElectronWindowState>,
}

const USER_FILE: &str = "userdata.json";
const WINDOW_STATE_FILE: &str = "window-state.json";

/// Copies the Electron data files into a data folder that has no user data yet.
/// Files already in the data folder are kept. Returns None when there is
/// nothing to take over.
pub fn migrate_electron_data(
    electron_dir: &Path,
    paths: &StorePaths,
) -> io::Result<Option<ElectronMigration>> {
    let electron_user = electron_dir.join(USER_FILE);
    if paths.user().exists() || !electron_user.is_file() {
        return Ok(None);
    }
    fs::create_dir_all(&paths.data_dir)?;
    // The user data goes last: while it is missing, the next launch tries again.
    let files: [(&'static str, PathBuf); 3] = [
        ("catalog.json", paths.catalog()),
        ("collections.json", paths.collections()),
        (USER_FILE, paths.user()),
    ];
    let mut copied = Vec::new();
    for (name, target) in files {
        let source = electron_dir.join(name);
        if source.is_file() && !target.exists() {
            atomic_copy(&source, &target)?;
            copied.push(name);
        }
    }
    Ok(Some(ElectronMigration {
        copied,
        window: read_window_state(&electron_dir.join(WINDOW_STATE_FILE)),
    }))
}

fn read_window_state(path: &Path) -> Option<ElectronWindowState> {
    read_json::<ElectronWindowState>(path).filter(|state| state.width > 0.0 && state.height > 0.0)
}

#[cfg(test)]
mod tests;
