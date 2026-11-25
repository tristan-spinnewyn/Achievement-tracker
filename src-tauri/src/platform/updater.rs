//! The update channel of the app: the signed release feed read by
//! tauri-plugin-updater (endpoint and public key in `tauri.conf.json`).

use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::services::updater::{
    ChannelFuture, ChunkCallback, ReleaseInfo, UpdateChannel, UpdaterState,
};

/// Lets the window appear before the first check, like the Electron app.
const STARTUP_CHECK_DELAY: Duration = Duration::from_secs(3);

pub struct PluginChannel<R: Runtime> {
    app: AppHandle<R>,
    /// The release found by the last check, and its verified download.
    release: Mutex<Option<Update>>,
    package: Mutex<Option<Vec<u8>>>,
}

impl<R: Runtime> PluginChannel<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self {
            app,
            release: Mutex::new(None),
            package: Mutex::new(None),
        }
    }

    fn release(&self) -> Result<Update, String> {
        lock(&self.release)
            .clone()
            .ok_or_else(|| "no update was found".to_owned())
    }
}

impl<R: Runtime> UpdateChannel for PluginChannel<R> {
    fn check(&self) -> ChannelFuture<'_, Option<ReleaseInfo>> {
        Box::pin(async move {
            let updater = self.app.updater().map_err(|err| err.to_string())?;
            let update = updater.check().await.map_err(|err| err.to_string())?;
            let info = update.as_ref().map(|update| ReleaseInfo {
                version: update.version.clone(),
                date: update.raw_json["pub_date"].as_str().map(str::to_owned),
                notes: update.body.clone(),
            });
            *lock(&self.release) = update;
            *lock(&self.package) = None;
            Ok(info)
        })
    }

    fn download<'a>(&'a self, mut on_chunk: ChunkCallback<'a>) -> ChannelFuture<'a, ()> {
        Box::pin(async move {
            let update = self.release()?;
            // The plugin verifies the signature before returning the bytes.
            let package = update
                .download(&mut on_chunk, || {})
                .await
                .map_err(|err| err.to_string())?;
            *lock(&self.package) = Some(package);
            Ok(())
        })
    }

    fn install(&self, restart: bool) -> Result<(), String> {
        let update = self.release()?.restart_after_install(restart);
        let package = lock(&self.package)
            .take()
            .ok_or_else(|| "the update is not downloaded".to_owned())?;
        update.install(package).map_err(|err| err.to_string())
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Checks for a new version shortly after startup and downloads it, outside
/// `tauri dev` (the Electron app skipped it when not packaged).
pub fn start_update_check<R: Runtime>(app: &AppHandle<R>) {
    if tauri::is_dev() {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STARTUP_CHECK_DELAY).await;
        app.state::<UpdaterState>().check_and_download().await;
    });
}

/// When the app quits, installs an update already downloaded.
pub fn install_update_on_exit<R: Runtime>(app: &AppHandle<R>) {
    if let Some(updater) = app.try_state::<UpdaterState>() {
        updater.install_on_exit();
    }
}

#[cfg(test)]
mod tests {
    use tauri::test::mock_app;

    use super::*;
    use crate::services::updater::test_support::{recorder, FakeChannel, CURRENT_VERSION};

    #[test]
    fn has_nothing_to_download_or_install_before_a_check() {
        let app = mock_app();
        let channel = PluginChannel::new(app.handle().clone());

        let download = tauri::async_runtime::block_on(channel.download(Box::new(|_, _| {})));

        assert_eq!(download, Err("no update was found".to_owned()));
        assert_eq!(channel.install(true), Err("no update was found".to_owned()));
    }

    #[test]
    fn installs_on_exit_the_update_downloaded_by_the_app() {
        let app = mock_app();
        // Nothing managed yet: quitting must not fail.
        install_update_on_exit(app.handle());

        let channel = FakeChannel::with_release();
        let calls = std::sync::Arc::clone(&channel.calls);
        let (listener, _) = recorder();
        app.manage(UpdaterState::new(
            CURRENT_VERSION.into(),
            Box::new(channel),
            listener,
        ));
        let updater = app.state::<UpdaterState>();
        tauri::async_runtime::block_on(updater.check_and_download());

        install_update_on_exit(app.handle());

        assert_eq!(*calls.installs.lock().unwrap(), [false]);
    }

    #[test]
    fn does_not_check_for_updates_in_development() {
        let app = mock_app();
        // The tests run without the `custom-protocol` feature, like `tauri dev`:
        // no check is started, so no updater state is needed.
        start_update_check(app.handle());
        assert!(app.try_state::<UpdaterState>().is_none());
    }
}
