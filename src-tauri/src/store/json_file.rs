//! JSON file helpers: tolerant reads and atomic writes.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde_json::Value;

/// Reads a JSON file; a missing or unreadable file yields None.
pub fn read_json_value(path: &Path) -> Option<Value> {
    read_json(path)
}

/// Reads and deserializes a JSON file; a missing, unreadable or mismatched file yields None.
pub fn read_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw)
        .inspect_err(|err| eprintln!("[store] cannot read {}: {err}", path.display()))
        .ok()
}

/// Writes through a temporary file then renames it, so a crash never leaves a truncated file.
pub fn atomic_write(path: &Path, contents: &str) -> io::Result<()> {
    let tmp = temporary_path(path);
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, path)
}

/// Copies a file through a temporary file then renames it, like [`atomic_write`].
pub fn atomic_copy(from: &Path, to: &Path) -> io::Result<()> {
    let tmp = temporary_path(to);
    fs::copy(from, &tmp)?;
    fs::rename(&tmp, to)
}

fn temporary_path(path: &Path) -> PathBuf {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    tmp.into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn read_returns_none_for_a_missing_or_invalid_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("x.json");
        assert_eq!(read_json_value(&path), None);
        fs::write(&path, "{ nope").unwrap();
        assert_eq!(read_json_value(&path), None);
    }

    #[test]
    fn read_json_deserializes_or_returns_none_on_type_mismatch() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("x.json");
        fs::write(&path, "[1, 2]").unwrap();
        assert_eq!(read_json::<Vec<u8>>(&path), Some(vec![1, 2]));
        assert_eq!(read_json::<String>(&path), None);
    }

    #[test]
    fn atomic_write_replaces_the_file_and_leaves_no_temporary_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("x.json");
        fs::write(&path, "old").unwrap();

        atomic_write(&path, r#"{"a":1}"#).unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"a":1}"#);
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn atomic_write_fails_when_the_folder_does_not_exist() {
        let dir = tempfile::tempdir().unwrap();
        assert!(atomic_write(&dir.path().join("missing/x.json"), "{}").is_err());
    }

    #[test]
    fn atomic_copy_copies_the_file_and_leaves_no_temporary_file() {
        let dir = tempfile::tempdir().unwrap();
        let (from, to) = (dir.path().join("from.json"), dir.path().join("to.json"));
        fs::write(&from, r#"{"a":1}"#).unwrap();

        atomic_copy(&from, &to).unwrap();

        assert_eq!(fs::read_to_string(&to).unwrap(), r#"{"a":1}"#);
        assert_eq!(fs::read_to_string(&from).unwrap(), r#"{"a":1}"#);
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 2);
    }

    #[test]
    fn atomic_copy_fails_when_the_source_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        let to = dir.path().join("to.json");
        assert!(atomic_copy(&dir.path().join("missing.json"), &to).is_err());
        assert!(!to.exists());
    }
}
