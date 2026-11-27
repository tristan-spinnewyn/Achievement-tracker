//! Backup export/import commands.

use chrono::Utc;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use super::error::CommandResult;
use crate::models::backup::{AutoBackupInfo, BackupResult};
use crate::services::backup;
use crate::state::AppState;

/// Exports the user data to a file chosen in a save dialog.
#[tauri::command]
pub async fn data_export<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> CommandResult<BackupResult> {
    Ok(backup::export_user_data(&state, &app, Utc::now()).await)
}

/// Replaces the user data with a backup chosen in an open dialog.
#[tauri::command]
pub async fn data_import<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> CommandResult<BackupResult> {
    Ok(backup::import_user_data(&state, &app).await)
}

#[tauri::command]
pub fn data_auto_backup_info(state: State<'_, AppState>) -> AutoBackupInfo {
    backup::auto_backup_info(&state.store())
}

/// Opens the Documents backup folder in the file explorer and returns its path.
#[tauri::command]
pub fn data_open_documents_folder<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> CommandResult<String> {
    let folder = backup::ensure_documents_folder(&state.store())?
        .display()
        .to_string();
    app.opener().open_path(&folder, None::<&str>)?;
    Ok(folder)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::test_support::sample_app;

    #[test]
    fn describes_the_mirror_of_the_current_store() {
        let t = sample_app();
        let info = data_auto_backup_info(t.state());
        assert!(info.enabled);
        assert!(!info.exists);
    }
}
