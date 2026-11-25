//! Backup export/import results and the Documents mirror information.

use std::path::Path;

use serde::Serialize;

/// Outcome of an export or an import, as shown by the settings page.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct BackupResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canceled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl BackupResult {
    /// The user closed the file dialog.
    pub fn canceled() -> Self {
        Self {
            canceled: Some(true),
            ..Self::default()
        }
    }

    pub fn done(path: &Path) -> Self {
        Self {
            ok: true,
            path: Some(path.display().to_string()),
            ..Self::default()
        }
    }

    pub fn failed(error: impl Into<String>) -> Self {
        Self {
            error: Some(error.into()),
            ..Self::default()
        }
    }
}

/// State of the automatic mirror in the Documents folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupInfo {
    pub enabled: bool,
    pub path: String,
    pub folder: String,
    pub exists: bool,
    pub last_saved_at: Option<String>,
    pub size_bytes: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn serializes_only_the_fields_that_apply() {
        let to_json = |r: BackupResult| serde_json::to_value(r).unwrap();
        assert_eq!(
            to_json(BackupResult::canceled()),
            json!({ "ok": false, "canceled": true })
        );
        assert_eq!(
            to_json(BackupResult::done(Path::new("a.json"))),
            json!({ "ok": true, "path": "a.json" })
        );
        assert_eq!(
            to_json(BackupResult::failed("boom")),
            json!({ "ok": false, "error": "boom" })
        );
    }
}
