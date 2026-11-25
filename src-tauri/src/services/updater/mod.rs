//! Update flow (port of `src/main/services/updater.ts`): looks for a new
//! version, downloads it and installs it, reporting every step to the renderer.

pub mod progress;
#[cfg(test)]
pub mod test_support;

use std::future::Future;
use std::pin::Pin;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Instant;

use crate::models::updater::{UpdateProgress, UpdateStatus};
use progress::ProgressTracker;

pub type ChannelFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'a>>;
/// Called for every downloaded chunk with its length and the announced total size.
pub type ChunkCallback<'a> = Box<dyn FnMut(usize, Option<u64>) + Send + 'a>;
/// Told about every status change (the app sends it to the renderer).
pub type StatusListener = Box<dyn Fn(&UpdateStatus) + Send + Sync>;

/// A release newer than the running version, as the release feed announces it.
#[derive(Debug, Clone, PartialEq)]
pub struct ReleaseInfo {
    pub version: String,
    pub date: Option<String>,
    pub notes: Option<String>,
}

/// Where the updates come from: the signed release feed in the app
/// (`platform::updater`), a fake in the tests. The channel keeps the release
/// its last check found, and that release's download.
pub trait UpdateChannel: Send + Sync {
    fn check(&self) -> ChannelFuture<'_, Option<ReleaseInfo>>;
    fn download<'a>(&'a self, on_chunk: ChunkCallback<'a>) -> ChannelFuture<'a, ()>;
    /// Starts the installer of the downloaded release; on Windows the app exits
    /// right after. `restart`: open the app again once installed.
    fn install(&self, restart: bool) -> Result<(), String>;
}

pub struct UpdaterState {
    current_version: String,
    channel: Box<dyn UpdateChannel>,
    status: Mutex<UpdateStatus>,
    on_status: StatusListener,
}

impl UpdaterState {
    pub fn new(
        current_version: String,
        channel: Box<dyn UpdateChannel>,
        on_status: StatusListener,
    ) -> Self {
        Self {
            current_version,
            channel,
            status: Mutex::new(UpdateStatus::Idle),
            on_status,
        }
    }

    pub fn status(&self) -> UpdateStatus {
        self.lock().clone()
    }

    /// Looks for a new version, unless a check or a download is under way or
    /// an update is ready: the current status is then returned as it is.
    pub async fn check(&self) -> UpdateStatus {
        let started = self.transition(|status| match status {
            UpdateStatus::Checking
            | UpdateStatus::Downloading { .. }
            | UpdateStatus::Downloaded { .. } => None,
            _ => Some(UpdateStatus::Checking),
        });
        if started.is_none() {
            return self.status();
        }
        let status = match self.channel.check().await {
            Ok(Some(release)) => UpdateStatus::Available {
                version: release.version,
                release_date: release.date,
                release_notes: release.notes,
            },
            Ok(None) => UpdateStatus::NotAvailable {
                version: self.current_version.clone(),
            },
            Err(message) => UpdateStatus::Error { message },
        };
        self.set(status.clone());
        status
    }

    /// Downloads the available version; does nothing without one.
    pub async fn download(&self) {
        let started = self.transition(|status| match status {
            UpdateStatus::Available { version, .. } => Some(UpdateStatus::Downloading {
                version: version.clone(),
                progress: UpdateProgress::default(),
            }),
            _ => None,
        });
        let Some(UpdateStatus::Downloading { version, .. }) = started else {
            return;
        };
        let mut tracker = ProgressTracker::new(Instant::now());
        let result = self
            .channel
            .download(Box::new(|chunk, total| {
                if let Some(progress) = tracker.on_chunk(chunk, total, Instant::now()) {
                    self.set(UpdateStatus::Downloading {
                        version: version.clone(),
                        progress,
                    });
                }
            }))
            .await;
        self.set(match result {
            Ok(()) => UpdateStatus::Downloaded { version },
            Err(message) => UpdateStatus::Error { message },
        });
    }

    /// Checks, then downloads the new version if there is one.
    pub async fn check_and_download(&self) {
        if let UpdateStatus::Available { .. } = self.check().await {
            self.download().await;
        }
    }

    /// Installs the downloaded version now; the app restarts on it.
    pub fn install(&self) {
        if !self.is_downloaded() {
            return;
        }
        if let Err(message) = self.channel.install(true) {
            self.set(UpdateStatus::Error { message });
        }
    }

    /// When the app quits: installs a downloaded version, without restarting the app.
    pub fn install_on_exit(&self) {
        if !self.is_downloaded() {
            return;
        }
        if let Err(err) = self.channel.install(false) {
            eprintln!("[updater] cannot install the update on exit: {err}");
        }
    }

    fn is_downloaded(&self) -> bool {
        matches!(*self.lock(), UpdateStatus::Downloaded { .. })
    }

    fn lock(&self) -> MutexGuard<'_, UpdateStatus> {
        self.status.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn set(&self, status: UpdateStatus) {
        *self.lock() = status.clone();
        (self.on_status)(&status);
    }

    /// Moves to the status `next` gives for the current one, if any, in a single
    /// step: two concurrent calls cannot both start a check or a download.
    fn transition(
        &self,
        next: impl FnOnce(&UpdateStatus) -> Option<UpdateStatus>,
    ) -> Option<UpdateStatus> {
        let changed = {
            let mut status = self.lock();
            let changed = next(&status)?;
            *status = changed.clone();
            changed
        };
        (self.on_status)(&changed);
        Some(changed)
    }
}

#[cfg(test)]
mod tests;
