//! Backup export/import and the Documents mirror (port of `src/main/services/backup.ts`).

use std::fs;
use std::future::Future;
use std::io;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::models::backup::{AutoBackupInfo, BackupResult};
use crate::models::user::UserData;
use crate::sanitize::user_data::sanitize_imported_user;
use crate::shared::timestamps::{iso_date, iso_timestamp};
use crate::state::AppState;
use crate::store::json_file::atomic_write;
use crate::store::Store;

/// Largest backup accepted (real ones weigh a few hundred KB).
pub const MAX_BACKUP_BYTES: u64 = 50 * 1024 * 1024;
pub const BACKUP_TOO_LARGE: &str = "Fichier de sauvegarde invalide (trop volumineux).";
pub const INVALID_BACKUP: &str = "Fichier de sauvegarde invalide.";

/// File dialogs used to choose where to export and what to import.
pub trait BackupDialogs: Sync {
    fn pick_save_path(
        &self,
        folder: Option<PathBuf>,
        file_name: String,
    ) -> impl Future<Output = Option<PathBuf>> + Send;

    fn pick_open_path(
        &self,
        folder: Option<PathBuf>,
    ) -> impl Future<Output = Option<PathBuf>> + Send;
}

pub fn export_file_name(now: DateTime<Utc>) -> String {
    format!("ffxiv-tracker-sauvegarde-{}.json", iso_date(now))
}

fn documents_folder(state: &AppState) -> Option<PathBuf> {
    state.store().paths().documents_dir.clone()
}

/// Asks where to save, then writes every user data, pretty-printed.
pub async fn export_user_data<D: BackupDialogs>(
    state: &AppState,
    dialogs: &D,
    now: DateTime<Utc>,
) -> BackupResult {
    let folder = documents_folder(state);
    let Some(path) = dialogs.pick_save_path(folder, export_file_name(now)).await else {
        return BackupResult::canceled();
    };
    let contents =
        serde_json::to_string_pretty(&state.store().user).expect("user data always serializes");
    match atomic_write(&path, &contents) {
        Ok(()) => BackupResult::done(&path),
        Err(err) => BackupResult::failed(err.to_string()),
    }
}

/// Reads and validates an untrusted backup file.
pub fn read_backup(path: &Path) -> Result<UserData, String> {
    let size = fs::metadata(path).map_err(|err| err.to_string())?.len();
    if size > MAX_BACKUP_BYTES {
        return Err(BACKUP_TOO_LARGE.to_owned());
    }
    let text = fs::read_to_string(path).map_err(|err| err.to_string())?;
    let raw: Value = serde_json::from_str(&text).map_err(|err| err.to_string())?;
    sanitize_imported_user(&raw).ok_or_else(|| INVALID_BACKUP.to_owned())
}

/// Asks for a backup file, then replaces the user data with it.
pub async fn import_user_data<D: BackupDialogs>(state: &AppState, dialogs: &D) -> BackupResult {
    let folder = documents_folder(state);
    let Some(path) = dialogs.pick_open_path(folder).await else {
        return BackupResult::canceled();
    };
    let imported = read_backup(&path).and_then(|user| {
        state
            .store()
            .replace_user(user)
            .map_err(|err| err.to_string())
    });
    match imported {
        Ok(()) => BackupResult::done(&path),
        Err(error) => BackupResult::failed(error),
    }
}

/// Where the mirror lives, whether it exists, when it was last written and its size.
pub fn auto_backup_info(store: &Store) -> AutoBackupInfo {
    let display = |path: Option<PathBuf>| path.map(|p| p.display().to_string());
    let path = store.paths().documents_backup();
    let metadata = path.as_ref().and_then(|p| fs::metadata(p).ok());
    AutoBackupInfo {
        enabled: store.user.settings.auto_backup_documents,
        folder: display(store.paths().documents_dir.clone()).unwrap_or_default(),
        path: display(path).unwrap_or_default(),
        exists: metadata.is_some(),
        last_saved_at: metadata
            .as_ref()
            .and_then(|m| m.modified().ok())
            .map(|modified| iso_timestamp(modified.into())),
        size_bytes: metadata.map(|m| m.len()),
    }
}

/// Creates the Documents backup folder if needed, so it can be opened.
pub fn ensure_documents_folder(store: &Store) -> io::Result<PathBuf> {
    let folder = store
        .paths()
        .documents_dir
        .clone()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Documents folder not found"))?;
    fs::create_dir_all(&folder)?;
    Ok(folder)
}

#[cfg(test)]
mod tests;
