use std::fs;
use std::path::{Path, PathBuf};

use tempfile::TempDir;

use super::*;

const USER: &str = r#"{"progress":{"100":{"completed":true}}}"#;
const CATALOG: &str = r#"{"achievements":[]}"#;
const COLLECTIONS: &str = r#"{"items":[]}"#;
const WINDOW: &str = r#"{"width":1280,"height":868,"x":640,"y":190,"maximized":false}"#;

struct Dirs {
    _root: TempDir,
    electron: PathBuf,
    paths: StorePaths,
}

fn dirs() -> Dirs {
    let root = tempfile::tempdir().unwrap();
    let electron = root.path().join(ELECTRON_DATA_FOLDER);
    let paths = StorePaths {
        data_dir: root.path().join("com.shin.ffxiv-achievement-tracker"),
        documents_dir: None,
    };
    Dirs {
        _root: root,
        electron,
        paths,
    }
}

fn write(path: &Path, contents: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, contents).unwrap();
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap()
}

fn electron_app_files(electron: &Path) {
    write(&electron.join("userdata.json"), USER);
    write(&electron.join("catalog.json"), CATALOG);
    write(&electron.join("collections.json"), COLLECTIONS);
    write(&electron.join("window-state.json"), WINDOW);
}

fn file_names(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

fn window_state(json: &str) -> Option<ElectronWindowState> {
    let d = dirs();
    electron_app_files(&d.electron);
    write(&d.electron.join("window-state.json"), json);
    migrate_electron_data(&d.electron, &d.paths)
        .unwrap()
        .unwrap()
        .window
}

#[test]
fn copies_the_electron_files_into_an_empty_data_folder() {
    let d = dirs();
    electron_app_files(&d.electron);

    let migration = migrate_electron_data(&d.electron, &d.paths).unwrap();

    assert_eq!(
        migration,
        Some(ElectronMigration {
            copied: vec!["catalog.json", "collections.json", "userdata.json"],
            window: Some(ElectronWindowState {
                width: 1280.0,
                height: 868.0,
                x: Some(640.0),
                y: Some(190.0),
                maximized: false,
            }),
        })
    );
    assert_eq!(read(&d.paths.user()), USER);
    assert_eq!(read(&d.paths.catalog()), CATALOG);
    assert_eq!(read(&d.paths.collections()), COLLECTIONS);
    // No temporary file left behind, and the window state stays with the plugin's own file.
    assert_eq!(
        file_names(&d.paths.data_dir),
        ["catalog.json", "collections.json", "userdata.json"]
    );
}

#[test]
fn leaves_the_electron_folder_untouched() {
    let d = dirs();
    electron_app_files(&d.electron);

    migrate_electron_data(&d.electron, &d.paths).unwrap();

    assert_eq!(
        file_names(&d.electron),
        [
            "catalog.json",
            "collections.json",
            "userdata.json",
            "window-state.json"
        ]
    );
    assert_eq!(read(&d.electron.join("userdata.json")), USER);
    assert_eq!(read(&d.electron.join("window-state.json")), WINDOW);
}

#[test]
fn does_nothing_once_the_data_folder_has_user_data() {
    let d = dirs();
    electron_app_files(&d.electron);
    write(&d.paths.user(), "{}");

    let migration = migrate_electron_data(&d.electron, &d.paths).unwrap();

    assert_eq!(migration, None);
    assert_eq!(read(&d.paths.user()), "{}");
    assert!(!d.paths.catalog().exists());
}

#[test]
fn does_nothing_without_electron_user_data() {
    let d = dirs();
    write(&d.electron.join("catalog.json"), CATALOG);

    let migration = migrate_electron_data(&d.electron, &d.paths).unwrap();

    assert_eq!(migration, None);
    assert!(!d.paths.data_dir.exists());
}

#[test]
fn does_nothing_without_an_electron_folder() {
    let d = dirs();
    assert_eq!(migrate_electron_data(&d.electron, &d.paths).unwrap(), None);
}

#[test]
fn keeps_the_files_already_in_the_data_folder() {
    let d = dirs();
    electron_app_files(&d.electron);
    write(&d.paths.catalog(), r#"{"newer":true}"#);

    let migration = migrate_electron_data(&d.electron, &d.paths)
        .unwrap()
        .unwrap();

    assert_eq!(migration.copied, ["collections.json", "userdata.json"]);
    assert_eq!(read(&d.paths.catalog()), r#"{"newer":true}"#);
    assert_eq!(read(&d.paths.user()), USER);
}

#[test]
fn copies_only_the_files_the_electron_app_wrote() {
    let d = dirs();
    write(&d.electron.join("userdata.json"), USER);

    let migration = migrate_electron_data(&d.electron, &d.paths)
        .unwrap()
        .unwrap();

    assert_eq!(migration.copied, ["userdata.json"]);
    assert_eq!(migration.window, None);
    assert_eq!(file_names(&d.paths.data_dir), ["userdata.json"]);
}

#[test]
fn fails_when_the_data_folder_cannot_be_created() {
    let d = dirs();
    electron_app_files(&d.electron);
    // A file where the data folder should be.
    write(&d.paths.data_dir, "");

    assert!(migrate_electron_data(&d.electron, &d.paths).is_err());
}

#[test]
fn reads_a_window_state_without_position_or_maximized_flag() {
    assert_eq!(
        window_state(r#"{"width":1200,"height":800}"#),
        Some(ElectronWindowState {
            width: 1200.0,
            height: 800.0,
            x: None,
            y: None,
            maximized: false,
        })
    );
    assert_eq!(
        window_state(r#"{"width":1200,"height":800,"x":-1920,"y":0,"maximized":true}"#),
        Some(ElectronWindowState {
            width: 1200.0,
            height: 800.0,
            x: Some(-1920.0),
            y: Some(0.0),
            maximized: true,
        })
    );
}

#[test]
fn ignores_an_unreadable_or_invalid_window_state() {
    assert_eq!(window_state("{ nope"), None);
    assert_eq!(window_state(r#"{"width":"wide","height":800}"#), None);
    assert_eq!(window_state(r#"{"width":0,"height":800}"#), None);
    assert_eq!(window_state(r#"{"width":1200,"height":-5}"#), None);
}
