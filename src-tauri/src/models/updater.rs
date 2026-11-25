//! Update status shown by the renderer (same shape as `UpdateStatus` in `src/shared/types.ts`).

use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum UpdateStatus {
    #[default]
    Idle,
    NotAvailable {
        version: String,
    },
}
