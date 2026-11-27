//! Update commands. The flow itself lives in `services::updater`; every
//! status change is sent to the renderer.

use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::models::updater::UpdateStatus;
use crate::services::updater::{StatusListener, UpdaterState};

/// Event carrying every status change to the renderer.
pub const STATUS_EVENT: &str = "updater:status";

/// Sends each status change to the renderer.
pub fn emit_status<R: Runtime>(app: AppHandle<R>) -> StatusListener {
    Box::new(move |status| {
        if let Err(err) = app.emit(STATUS_EVENT, status) {
            eprintln!("[updater] cannot send the status: {err}");
        }
    })
}

#[tauri::command]
pub fn updater_app_version<R: Runtime>(app: AppHandle<R>) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn updater_status(updater: State<'_, UpdaterState>) -> UpdateStatus {
    updater.status()
}

#[tauri::command]
pub async fn updater_check<R: Runtime>(app: AppHandle<R>) -> UpdateStatus {
    app.state::<UpdaterState>().check().await
}

#[tauri::command]
pub async fn updater_download<R: Runtime>(app: AppHandle<R>) {
    app.state::<UpdaterState>().download().await;
}

#[tauri::command]
pub fn updater_install(updater: State<'_, UpdaterState>) {
    updater.install();
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use tauri::Listener;

    use super::*;
    use crate::commands::test_support::{sample_app, TestApp};
    use crate::services::updater::test_support::{ChannelCalls, FakeChannel};

    fn app_with(channel: FakeChannel) -> (TestApp, Arc<ChannelCalls>) {
        let t = sample_app();
        let calls = Arc::clone(&channel.calls);
        let version = t.app.package_info().version.to_string();
        t.app.manage(UpdaterState::new(
            version,
            Box::new(channel),
            emit_status(t.app.handle().clone()),
        ));
        (t, calls)
    }

    fn sent_statuses(t: &TestApp) -> Arc<Mutex<Vec<serde_json::Value>>> {
        let events = Arc::new(Mutex::new(Vec::new()));
        let seen = Arc::clone(&events);
        t.app.listen_any(STATUS_EVENT, move |event| {
            seen.lock()
                .unwrap()
                .push(serde_json::from_str(event.payload()).unwrap());
        });
        events
    }

    #[test]
    fn reports_the_running_version() {
        let t = sample_app();
        let version = t.app.package_info().version.to_string();
        assert_eq!(updater_app_version(t.app.handle().clone()), version);
    }

    #[test]
    fn is_idle_until_a_check_then_up_to_date() {
        let (t, _) = app_with(FakeChannel::up_to_date());
        let events = sent_statuses(&t);
        let updater = t.app.state::<UpdaterState>();
        assert_eq!(
            serde_json::to_value(updater_status(updater.clone())).unwrap(),
            json!({ "state": "idle" })
        );

        let checked = tauri::async_runtime::block_on(updater_check(t.app.handle().clone()));

        let version = t.app.package_info().version.to_string();
        let expected = json!({ "state": "not-available", "version": version });
        assert_eq!(serde_json::to_value(&checked).unwrap(), expected);
        assert_eq!(updater_status(updater), checked);
        assert_eq!(
            *events.lock().unwrap(),
            [json!({ "state": "checking" }), expected]
        );
    }

    #[test]
    fn downloads_then_installs_a_new_version() {
        let (t, calls) = app_with(FakeChannel::with_release());
        let handle = t.app.handle().clone();
        tauri::async_runtime::block_on(updater_check(handle.clone()));

        tauri::async_runtime::block_on(updater_download(handle));
        updater_install(t.app.state::<UpdaterState>());

        assert_eq!(
            serde_json::to_value(updater_status(t.app.state::<UpdaterState>())).unwrap(),
            json!({ "state": "downloaded", "version": "3.0.0" })
        );
        assert_eq!(*calls.installs.lock().unwrap(), [true]);
    }
}
