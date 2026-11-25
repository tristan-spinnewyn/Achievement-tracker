//! Update status shown by the renderer (same shape as `UpdateStatus` in `src/shared/types.ts`).

use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum UpdateStatus {
    #[default]
    Idle,
    Checking,
    #[serde(rename_all = "camelCase")]
    Available {
        version: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        release_date: Option<String>,
        release_notes: Option<String>,
    },
    /// `version` is the running version, which is the latest.
    NotAvailable {
        version: String,
    },
    Downloading {
        version: String,
        progress: UpdateProgress,
    },
    Downloaded {
        version: String,
    },
    Error {
        message: String,
    },
}

impl UpdateStatus {
    /// Version of the update being offered, downloaded or ready to install.
    pub fn update_version(&self) -> Option<&str> {
        match self {
            Self::Available { version, .. }
            | Self::Downloading { version, .. }
            | Self::Downloaded { version } => Some(version),
            Self::Idle | Self::Checking | Self::NotAvailable { .. } | Self::Error { .. } => None,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    /// 0 to 100.
    pub percent: u32,
    pub bytes_per_second: u64,
    pub transferred: u64,
    /// 0 when the server does not announce the size.
    pub total: u64,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn to_json(status: UpdateStatus) -> serde_json::Value {
        serde_json::to_value(status).unwrap()
    }

    #[test]
    fn serializes_every_state_like_the_renderer_type() {
        assert_eq!(to_json(UpdateStatus::Idle), json!({ "state": "idle" }));
        assert_eq!(
            to_json(UpdateStatus::Checking),
            json!({ "state": "checking" })
        );
        assert_eq!(
            to_json(UpdateStatus::Available {
                version: "3.0.0".into(),
                release_date: Some("2026-12-01T10:00:00Z".into()),
                release_notes: None,
            }),
            json!({
                "state": "available", "version": "3.0.0",
                "releaseDate": "2026-12-01T10:00:00Z", "releaseNotes": null
            })
        );
        assert_eq!(
            to_json(UpdateStatus::NotAvailable {
                version: "2.1.1".into()
            }),
            json!({ "state": "not-available", "version": "2.1.1" })
        );
        assert_eq!(
            to_json(UpdateStatus::Downloading {
                version: "3.0.0".into(),
                progress: UpdateProgress {
                    percent: 42,
                    bytes_per_second: 1000,
                    transferred: 4200,
                    total: 10000,
                },
            }),
            json!({
                "state": "downloading", "version": "3.0.0",
                "progress": { "percent": 42, "bytesPerSecond": 1000, "transferred": 4200, "total": 10000 }
            })
        );
        assert_eq!(
            to_json(UpdateStatus::Downloaded {
                version: "3.0.0".into()
            }),
            json!({ "state": "downloaded", "version": "3.0.0" })
        );
        assert_eq!(
            to_json(UpdateStatus::Error {
                message: "offline".into()
            }),
            json!({ "state": "error", "message": "offline" })
        );
    }

    #[test]
    fn omits_an_unknown_release_date() {
        let status = UpdateStatus::Available {
            version: "3.0.0".into(),
            release_date: None,
            release_notes: Some("Notes".into()),
        };
        assert_eq!(
            to_json(status),
            json!({ "state": "available", "version": "3.0.0", "releaseNotes": "Notes" })
        );
    }

    #[test]
    fn names_the_version_of_the_update_in_progress() {
        let version = |status: UpdateStatus| status.update_version().map(str::to_owned);
        assert_eq!(version(UpdateStatus::Idle), None);
        assert_eq!(version(UpdateStatus::Checking), None);
        assert_eq!(
            version(UpdateStatus::Error {
                message: "x".into()
            }),
            None
        );
        assert_eq!(
            version(UpdateStatus::NotAvailable {
                version: "2.1.1".into()
            }),
            None
        );
        assert_eq!(
            version(UpdateStatus::Available {
                version: "3.0.0".into(),
                release_date: None,
                release_notes: None
            }),
            Some("3.0.0".into())
        );
        assert_eq!(
            version(UpdateStatus::Downloaded {
                version: "3.0.0".into()
            }),
            Some("3.0.0".into())
        );
    }
}
