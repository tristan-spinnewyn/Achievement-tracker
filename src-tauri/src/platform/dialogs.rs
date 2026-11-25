//! Native file dialogs for the backups (tauri-plugin-dialog).

use std::future::Future;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};
use tokio::sync::oneshot;

use super::window::MAIN_WINDOW;
use crate::services::backup::BackupDialogs;

const BACKUP_FILTER: &str = "Sauvegarde JSON";

/// A dialog in the backup folder, modal to the main window when it exists.
fn backup_dialog<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
    folder: Option<PathBuf>,
) -> FileDialogBuilder<R> {
    let mut dialog = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter(BACKUP_FILTER, &["json"]);
    if let Some(folder) = folder {
        dialog = dialog.set_directory(folder);
    }
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        dialog = dialog.set_parent(&window);
    }
    dialog
}

/// Resolves once the dialog callback has answered.
fn answer() -> (
    impl FnOnce(Option<FilePath>) + Send + 'static,
    impl Future<Output = Option<PathBuf>> + Send,
) {
    let (sender, receiver) = oneshot::channel();
    let reply = move |path: Option<FilePath>| {
        let _ = sender.send(path.and_then(|p| p.into_path().ok()));
    };
    (reply, async move { receiver.await.ok().flatten() })
}

impl<R: Runtime> BackupDialogs for AppHandle<R> {
    fn pick_save_path(
        &self,
        folder: Option<PathBuf>,
        file_name: String,
    ) -> impl Future<Output = Option<PathBuf>> + Send {
        let (reply, path) = answer();
        backup_dialog(self, "Exporter mes données", folder)
            .set_file_name(file_name)
            .save_file(reply);
        path
    }

    fn pick_open_path(
        &self,
        folder: Option<PathBuf>,
    ) -> impl Future<Output = Option<PathBuf>> + Send {
        let (reply, path) = answer();
        backup_dialog(self, "Importer une sauvegarde", folder).pick_file(reply);
        path
    }
}
