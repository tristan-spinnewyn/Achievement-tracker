use std::fs;
use std::sync::Mutex;

use serde_json::{json, Value};
use tempfile::TempDir;

use super::*;
use crate::models::settings::Theme;
use crate::store::paths::StorePaths;

/// A state whose store has a Documents folder, in a temporary directory.
fn state_with_documents() -> (AppState, TempDir) {
    let root = tempfile::tempdir().unwrap();
    let paths = StorePaths {
        data_dir: root.path().join("data"),
        documents_dir: Some(root.path().join("docs")),
    };
    let mut store = Store::load(paths).unwrap();
    store.user.settings.theme = Theme::Light;
    (AppState::new(store), root)
}

fn now() -> DateTime<Utc> {
    "2026-11-25T10:00:00Z".parse().unwrap()
}

/// Dialogs answering with fixed paths, recording where they were opened.
#[derive(Default)]
struct FakeDialogs {
    save_path: Option<PathBuf>,
    open_path: Option<PathBuf>,
    requests: Mutex<Vec<(Option<PathBuf>, Option<String>)>>,
}

impl BackupDialogs for FakeDialogs {
    async fn pick_save_path(&self, folder: Option<PathBuf>, file_name: String) -> Option<PathBuf> {
        self.requests
            .lock()
            .unwrap()
            .push((folder, Some(file_name)));
        self.save_path.clone()
    }

    async fn pick_open_path(&self, folder: Option<PathBuf>) -> Option<PathBuf> {
        self.requests.lock().unwrap().push((folder, None));
        self.open_path.clone()
    }
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

#[test]
fn names_the_export_after_the_day() {
    assert_eq!(
        export_file_name(now()),
        "ffxiv-tracker-sauvegarde-2026-11-25.json"
    );
}

#[tokio::test]
async fn exports_the_user_data_where_the_user_chose() {
    let (state, root) = state_with_documents();
    let target = root.path().join("export.json");
    let dialogs = FakeDialogs {
        save_path: Some(target.clone()),
        ..FakeDialogs::default()
    };

    let result = export_user_data(&state, &dialogs, now()).await;

    assert_eq!(result, BackupResult::done(&target));
    let saved = fs::read_to_string(&target).unwrap();
    assert!(
        saved.contains("\n  \"settings\""),
        "pretty-printed: {saved}"
    );
    assert_eq!(read_json(&target)["settings"]["theme"], "light");
    assert_eq!(
        dialogs.requests.lock().unwrap()[0],
        (
            Some(root.path().join("docs")),
            Some("ffxiv-tracker-sauvegarde-2026-11-25.json".into())
        )
    );
}

#[tokio::test]
async fn a_closed_dialog_cancels_the_export_and_the_import() {
    let (state, _root) = state_with_documents();
    let dialogs = FakeDialogs::default();
    assert_eq!(
        export_user_data(&state, &dialogs, now()).await,
        BackupResult::canceled()
    );
    assert_eq!(
        import_user_data(&state, &dialogs).await,
        BackupResult::canceled()
    );
}

#[tokio::test]
async fn reports_an_export_that_cannot_be_written() {
    let (state, root) = state_with_documents();
    let dialogs = FakeDialogs {
        save_path: Some(root.path().join("missing").join("export.json")),
        ..FakeDialogs::default()
    };
    let result = export_user_data(&state, &dialogs, now()).await;
    assert!(!result.ok);
    assert!(result.error.is_some());
}

#[tokio::test]
async fn imports_a_valid_backup_and_saves_it() {
    let (state, root) = state_with_documents();
    let source = root.path().join("backup.json");
    fs::write(
        &source,
        json!({ "settings": { "theme": "dark", "region": "na" }, "progress": {} }).to_string(),
    )
    .unwrap();
    let dialogs = FakeDialogs {
        open_path: Some(source.clone()),
        ..FakeDialogs::default()
    };

    let result = import_user_data(&state, &dialogs).await;

    assert_eq!(result, BackupResult::done(&source));
    assert_eq!(state.store().user.settings.theme, Theme::Dark);
    let saved = read_json(&root.path().join("data").join("userdata.json"));
    assert_eq!(saved["settings"]["region"], "na");
    assert_eq!(
        dialogs.requests.lock().unwrap()[0],
        (Some(root.path().join("docs")), None)
    );
}

#[tokio::test]
async fn rejects_invalid_backups_without_touching_the_data() {
    let (state, root) = state_with_documents();
    let cases = [
        ("not-json.json", "{ nope".to_owned(), None),
        (
            "not-a-backup.json",
            json!({ "hello": 1 }).to_string(),
            Some(INVALID_BACKUP),
        ),
        (
            "wrong-shape.json",
            json!({ "settings": {}, "progress": [] }).to_string(),
            Some(INVALID_BACKUP),
        ),
    ];
    for (name, contents, expected) in cases {
        let source = root.path().join(name);
        fs::write(&source, contents).unwrap();
        let dialogs = FakeDialogs {
            open_path: Some(source),
            ..FakeDialogs::default()
        };

        let result = import_user_data(&state, &dialogs).await;

        assert!(!result.ok, "{name}");
        let error = result.error.unwrap();
        if let Some(expected) = expected {
            assert_eq!(error, expected, "{name}");
        }
        assert_eq!(state.store().user.settings.theme, Theme::Light, "{name}");
    }
}

#[test]
fn refuses_a_backup_over_the_size_limit_before_reading_it() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("huge.json");
    let file = fs::File::create(&source).unwrap();
    file.set_len(MAX_BACKUP_BYTES + 1).unwrap();
    assert_eq!(read_backup(&source), Err(BACKUP_TOO_LARGE.to_owned()));
    assert!(read_backup(&root.path().join("absent.json")).is_err());
}

#[test]
fn describes_the_documents_mirror() {
    let (state, root) = state_with_documents();
    let docs = root.path().join("docs");
    let before = auto_backup_info(&state.store());
    assert_eq!(
        before,
        AutoBackupInfo {
            enabled: true,
            path: docs.join("userdata-backup.json").display().to_string(),
            folder: docs.display().to_string(),
            exists: false,
            last_saved_at: None,
            size_bytes: None,
        }
    );

    state.store().save_user().unwrap();
    let after = auto_backup_info(&state.store());
    let size = fs::metadata(docs.join("userdata-backup.json"))
        .unwrap()
        .len();
    assert!(after.exists);
    assert_eq!(after.size_bytes, Some(size));
    assert!(after.last_saved_at.unwrap().ends_with('Z'));

    state.store().user.settings.auto_backup_documents = false;
    assert!(!auto_backup_info(&state.store()).enabled);
}

#[test]
fn creates_the_documents_folder_on_demand() {
    let (state, root) = state_with_documents();
    let folder = ensure_documents_folder(&state.store()).unwrap();
    assert_eq!(folder, root.path().join("docs"));
    assert!(folder.is_dir());

    let (store, _dir) = crate::repo::test_support::empty_store().into_parts();
    assert!(ensure_documents_folder(&store).is_err());
    assert_eq!(auto_backup_info(&store).folder, "");
}
