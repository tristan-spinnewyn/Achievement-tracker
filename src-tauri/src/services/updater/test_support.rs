//! A scripted update channel and a status recorder, for the updater tests.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use super::{ChannelFuture, ChunkCallback, ReleaseInfo, StatusListener, UpdateChannel};
use crate::models::updater::UpdateStatus;

pub const CURRENT_VERSION: &str = "2.1.1";

pub fn release() -> ReleaseInfo {
    ReleaseInfo {
        version: "3.0.0".into(),
        date: Some("2026-12-01T10:00:00Z".into()),
        notes: Some("Tauri".into()),
    }
}

/// What the fake channel did, shared with the test.
#[derive(Default)]
pub struct ChannelCalls {
    pub checks: AtomicUsize,
    pub downloads: AtomicUsize,
    /// The `restart` flag of every install.
    pub installs: Mutex<Vec<bool>>,
}

pub struct FakeChannel {
    pub check_result: Result<Option<ReleaseInfo>, String>,
    /// Chunk lengths sent during a download.
    pub chunks: Vec<usize>,
    pub total: Option<u64>,
    pub download_error: Option<String>,
    pub install_error: Option<String>,
    pub calls: Arc<ChannelCalls>,
}

impl FakeChannel {
    /// A feed announcing `release()`, downloaded in two halves.
    pub fn with_release() -> Self {
        Self {
            check_result: Ok(Some(release())),
            chunks: vec![500, 500],
            total: Some(1_000),
            download_error: None,
            install_error: None,
            calls: Arc::default(),
        }
    }

    pub fn up_to_date() -> Self {
        Self {
            check_result: Ok(None),
            ..Self::with_release()
        }
    }
}

impl UpdateChannel for FakeChannel {
    fn check(&self) -> ChannelFuture<'_, Option<ReleaseInfo>> {
        self.calls.checks.fetch_add(1, Ordering::SeqCst);
        let result = self.check_result.clone();
        Box::pin(async move { result })
    }

    fn download<'a>(&'a self, mut on_chunk: ChunkCallback<'a>) -> ChannelFuture<'a, ()> {
        self.calls.downloads.fetch_add(1, Ordering::SeqCst);
        Box::pin(async move {
            for &chunk in &self.chunks {
                on_chunk(chunk, self.total);
            }
            self.download_error.clone().map_or(Ok(()), Err)
        })
    }

    fn install(&self, restart: bool) -> Result<(), String> {
        self.calls.installs.lock().unwrap().push(restart);
        self.install_error.clone().map_or(Ok(()), Err)
    }
}

/// A status listener keeping every status it is told about.
pub fn recorder() -> (StatusListener, Arc<Mutex<Vec<UpdateStatus>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&seen);
    let listener: StatusListener =
        Box::new(move |status| sink.lock().unwrap().push(status.clone()));
    (listener, seen)
}
