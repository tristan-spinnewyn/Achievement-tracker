use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use super::test_support::{recorder, release, ChannelCalls, FakeChannel, CURRENT_VERSION};
use super::*;
use crate::models::updater::UpdateProgress;

struct Fixture {
    updater: UpdaterState,
    seen: Arc<Mutex<Vec<UpdateStatus>>>,
    calls: Arc<ChannelCalls>,
}

fn updater(channel: FakeChannel) -> Fixture {
    let calls = Arc::clone(&channel.calls);
    let (listener, seen) = recorder();
    Fixture {
        updater: UpdaterState::new(CURRENT_VERSION.into(), Box::new(channel), listener),
        seen,
        calls,
    }
}

fn seen(f: &Fixture) -> Vec<UpdateStatus> {
    f.seen.lock().unwrap().clone()
}

fn available() -> UpdateStatus {
    let release = release();
    UpdateStatus::Available {
        version: release.version,
        release_date: release.date,
        release_notes: release.notes,
    }
}

fn downloading(percent: u32, transferred: u64, total: u64) -> UpdateStatus {
    UpdateStatus::Downloading {
        version: "3.0.0".into(),
        progress: UpdateProgress {
            percent,
            transferred,
            total,
            ..UpdateProgress::default()
        },
    }
}

fn downloaded() -> UpdateStatus {
    UpdateStatus::Downloaded {
        version: "3.0.0".into(),
    }
}

/// The download speed depends on the clock: tests compare everything else.
fn without_speed(statuses: Vec<UpdateStatus>) -> Vec<UpdateStatus> {
    statuses
        .into_iter()
        .map(|status| match status {
            UpdateStatus::Downloading { version, progress } => UpdateStatus::Downloading {
                version,
                progress: UpdateProgress {
                    bytes_per_second: 0,
                    ..progress
                },
            },
            other => other,
        })
        .collect()
}

#[test]
fn is_idle_before_any_check() {
    let f = updater(FakeChannel::with_release());
    assert_eq!(f.updater.status(), UpdateStatus::Idle);
    assert!(seen(&f).is_empty());
}

#[tokio::test]
async fn reports_an_available_release() {
    let f = updater(FakeChannel::with_release());

    let status = f.updater.check().await;

    assert_eq!(status, available());
    assert_eq!(f.updater.status(), available());
    assert_eq!(seen(&f), [UpdateStatus::Checking, available()]);
}

#[tokio::test]
async fn reports_the_running_version_when_it_is_the_latest() {
    let f = updater(FakeChannel::up_to_date());

    let status = f.updater.check().await;

    let latest = UpdateStatus::NotAvailable {
        version: CURRENT_VERSION.into(),
    };
    assert_eq!(status, latest);
    assert_eq!(seen(&f), [UpdateStatus::Checking, latest]);
}

#[tokio::test]
async fn turns_a_failed_check_into_an_error_status() {
    let f = updater(FakeChannel {
        check_result: Err("offline".into()),
        ..FakeChannel::with_release()
    });

    let status = f.updater.check().await;

    let error = UpdateStatus::Error {
        message: "offline".into(),
    };
    assert_eq!(status, error);
    assert_eq!(seen(&f), [UpdateStatus::Checking, error]);
}

#[tokio::test]
async fn downloads_the_available_release_with_its_progress() {
    let f = updater(FakeChannel::with_release());
    f.updater.check().await;

    f.updater.download().await;

    assert_eq!(f.updater.status(), downloaded());
    assert_eq!(
        without_speed(seen(&f)[2..].to_vec()),
        [
            downloading(0, 0, 0),
            downloading(50, 500, 1_000),
            downloading(100, 1_000, 1_000),
            downloaded(),
        ]
    );
}

#[tokio::test]
async fn downloads_nothing_without_an_available_release() {
    let f = updater(FakeChannel::up_to_date());
    f.updater.download().await;
    f.updater.check().await;
    f.updater.download().await;

    assert_eq!(f.calls.downloads.load(Ordering::SeqCst), 0);
    assert_eq!(seen(&f).len(), 2);
}

#[tokio::test]
async fn turns_a_failed_download_into_an_error_status() {
    let f = updater(FakeChannel {
        download_error: Some("bad signature".into()),
        ..FakeChannel::with_release()
    });
    f.updater.check().await;

    f.updater.download().await;

    assert_eq!(
        f.updater.status(),
        UpdateStatus::Error {
            message: "bad signature".into()
        }
    );
}

#[tokio::test]
async fn a_check_keeps_an_update_being_downloaded_or_ready() {
    let f = updater(FakeChannel::with_release());
    f.updater.check_and_download().await;

    let status = f.updater.check().await;

    assert_eq!(status, downloaded());
    assert_eq!(f.calls.checks.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn checks_then_downloads_a_new_version() {
    let f = updater(FakeChannel::with_release());

    f.updater.check_and_download().await;

    assert_eq!(f.updater.status(), downloaded());
    assert_eq!(f.calls.downloads.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn checks_without_downloading_when_up_to_date() {
    let f = updater(FakeChannel::up_to_date());
    f.updater.check_and_download().await;
    assert_eq!(f.calls.downloads.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn installs_a_downloaded_update_and_restarts() {
    let f = updater(FakeChannel::with_release());
    f.updater.install();
    assert!(f.calls.installs.lock().unwrap().is_empty());

    f.updater.check_and_download().await;
    f.updater.install();

    assert_eq!(*f.calls.installs.lock().unwrap(), [true]);
}

#[tokio::test]
async fn turns_a_failed_install_into_an_error_status() {
    let f = updater(FakeChannel {
        install_error: Some("installer missing".into()),
        ..FakeChannel::with_release()
    });
    f.updater.check_and_download().await;

    f.updater.install();

    assert_eq!(
        f.updater.status(),
        UpdateStatus::Error {
            message: "installer missing".into()
        }
    );
}

#[tokio::test]
async fn installs_on_exit_only_a_downloaded_update_without_restarting() {
    let f = updater(FakeChannel {
        install_error: Some("ignored on exit".into()),
        ..FakeChannel::with_release()
    });
    f.updater.install_on_exit();
    f.updater.check().await;
    f.updater.install_on_exit();
    assert!(f.calls.installs.lock().unwrap().is_empty());

    f.updater.download().await;
    f.updater.install_on_exit();

    assert_eq!(*f.calls.installs.lock().unwrap(), [false]);
    // The app is quitting: the failure is only logged.
    assert_eq!(f.updater.status(), downloaded());
}
