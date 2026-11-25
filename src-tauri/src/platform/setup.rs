//! Application startup: loads the state, opens the main window and starts the
//! background work (icon prefetch, recurring task notifications).

use std::error::Error;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use tauri::{App, AppHandle, Manager, Runtime};

use super::notifier::DesktopNotifier;
use super::window::create_main_window;
use crate::net::network::Network;
use crate::services::icons::{IconCache, PREFETCH_CONCURRENCY};
use crate::services::reminders::{notify_at_next_reset, notify_pending, RESET_KINDS};
use crate::services::snapshots::Snapshots;
use crate::services::updater::UpdaterState;
use crate::state::AppState;
use crate::store::electron_migration::{
    migrate_electron_data, ElectronMigration, ELECTRON_DATA_FOLDER,
};
use crate::store::paths::{StorePaths, DOCUMENTS_FOLDER_NAME};

/// Icons of the first catalog achievements, downloaded in the background at startup.
const STARTUP_PREFETCH_COUNT: usize = 100;
/// Lets the window appear before the pending tasks are notified.
const STARTUP_NOTIFICATION_DELAY: Duration = Duration::from_secs(1);

pub fn setup<R: Runtime>(app: &mut App<R>) -> Result<(), Box<dyn Error>> {
    let paths = StorePaths {
        data_dir: app.path().app_data_dir()?,
        documents_dir: app
            .path()
            .document_dir()
            .ok()
            .map(|d| d.join(DOCUMENTS_FOLDER_NAME)),
    };
    let electron_data = app
        .path()
        .config_dir()
        .ok()
        .and_then(|dir| take_over_electron_data(&dir.join(ELECTRON_DATA_FOLDER), &paths));
    let snapshots = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| Snapshots::in_dir(&dir.join("resources")));
    let icons = IconCache::in_data_dir(&paths.data_dir);
    // The webview may load cached icons through `asset:`, and nothing else.
    std::fs::create_dir_all(icons.dir())?;
    app.asset_protocol_scope()
        .allow_directory(icons.dir(), true)?;
    let state = AppState::load(paths, snapshots.as_ref())?;
    let net = Network::default();
    prefetch_startup_icons(&state, &icons, &net);
    app.manage(state);
    app.manage(net);
    app.manage(icons);
    app.manage(UpdaterState::default());

    let electron_bounds = electron_data.and_then(|migration| migration.window);
    create_main_window(app.handle(), electron_bounds.as_ref())?;
    start_recurring_notifications(app.handle());
    Ok(())
}

/// Copies the Electron app's data on the first launch. A failure is only logged:
/// the app then starts like a new install, and the next launch tries again.
fn take_over_electron_data(electron_dir: &Path, paths: &StorePaths) -> Option<ElectronMigration> {
    migrate_electron_data(electron_dir, paths)
        .inspect_err(|err| eprintln!("[setup] cannot copy the Electron app data: {err}"))
        .ok()
        .flatten()
        .inspect(|migration| {
            eprintln!(
                "[setup] copied from the Electron app: {}",
                migration.copied.join(", ")
            );
        })
}

fn prefetch_startup_icons(state: &AppState, icons: &IconCache, net: &Network) {
    let startup_icons: Vec<String> = state
        .store()
        .catalog
        .achievements
        .iter()
        .take(STARTUP_PREFETCH_COUNT)
        .filter_map(|a| a.icon_path.clone())
        .collect();
    let (icons, net) = (icons.clone(), net.clone());
    tauri::async_runtime::spawn(async move {
        icons
            .prefetch(&net, startup_icons, PREFETCH_CONCURRENCY)
            .await;
    });
}

/// Notifies the pending tasks shortly after startup, then at every reset.
fn start_recurring_notifications<R: Runtime>(app: &AppHandle<R>) {
    let notifier = Arc::new(DesktopNotifier::new(app));
    let (startup_app, startup_notifier) = (app.clone(), Arc::clone(&notifier));
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STARTUP_NOTIFICATION_DELAY).await;
        notify_pending(
            &startup_app.state::<AppState>(),
            &*startup_notifier,
            Utc::now(),
        );
    });
    for kind in RESET_KINDS {
        let (app, notifier) = (app.clone(), Arc::clone(&notifier));
        tauri::async_runtime::spawn(async move {
            let state = app.state::<AppState>();
            loop {
                notify_at_next_reset(&state, &*notifier, kind, &Utc::now).await;
            }
        });
    }
}
