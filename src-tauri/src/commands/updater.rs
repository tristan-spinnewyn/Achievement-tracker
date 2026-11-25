//! Update commands (Electron channels `updater:*`).
//!
//! The signed update channel comes with the Tauri release pipeline; until then a
//! check reports the running version as up to date, like the Electron app does
//! when it is not packaged.

use tauri::{AppHandle, Emitter, Runtime, State};

use crate::models::updater::UpdateStatus;
use crate::services::updater::UpdaterState;

/// Event carrying every status change to the renderer.
pub const STATUS_EVENT: &str = "updater:status";

#[tauri::command]
pub fn updater_app_version<R: Runtime>(app: AppHandle<R>) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn updater_status(updater: State<'_, UpdaterState>) -> UpdateStatus {
    updater.status()
}

#[tauri::command]
pub fn updater_check<R: Runtime>(
    app: AppHandle<R>,
    updater: State<'_, UpdaterState>,
) -> UpdateStatus {
    let status = UpdateStatus::NotAvailable {
        version: updater_app_version(app.clone()),
    };
    updater.set(status.clone());
    if let Err(err) = app.emit(STATUS_EVENT, &status) {
        eprintln!("[updater] cannot send the status: {err}");
    }
    status
}

/// Nothing to download before the update channel exists.
#[tauri::command]
pub fn updater_download() {}

/// Nothing to install before the update channel exists.
#[tauri::command]
pub fn updater_install() {}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use tauri::{Listener, Manager};

    use super::*;
    use crate::commands::test_support::sample_app;

    #[test]
    fn reports_the_running_version() {
        let t = sample_app();
        let version = t.app.package_info().version.to_string();
        assert_eq!(updater_app_version(t.app.handle().clone()), version);
    }

    #[test]
    fn is_idle_until_a_check_then_up_to_date() {
        let t = sample_app();
        t.app.manage(UpdaterState::default());
        let events = Arc::new(Mutex::new(Vec::new()));
        let seen = Arc::clone(&events);
        t.app.listen_any(STATUS_EVENT, move |event| {
            seen.lock().unwrap().push(event.payload().to_owned());
        });
        let updater = t.app.state::<UpdaterState>();
        assert_eq!(
            serde_json::to_value(updater_status(updater.clone())).unwrap(),
            json!({ "state": "idle" })
        );

        let checked = updater_check(t.app.handle().clone(), updater.clone());

        let version = t.app.package_info().version.to_string();
        let expected = json!({ "state": "not-available", "version": version });
        assert_eq!(serde_json::to_value(&checked).unwrap(), expected);
        assert_eq!(updater_status(updater), checked);
        assert_eq!(*events.lock().unwrap(), [expected.to_string()]);
        updater_download();
        updater_install();
    }
}
