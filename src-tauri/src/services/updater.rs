//! Last known update status, shared by the update commands.

use std::sync::{Mutex, PoisonError};

use crate::models::updater::UpdateStatus;

#[derive(Default)]
pub struct UpdaterState {
    status: Mutex<UpdateStatus>,
}

impl UpdaterState {
    pub fn status(&self) -> UpdateStatus {
        self.status
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    pub fn set(&self, status: UpdateStatus) {
        *self.status.lock().unwrap_or_else(PoisonError::into_inner) = status;
    }
}
