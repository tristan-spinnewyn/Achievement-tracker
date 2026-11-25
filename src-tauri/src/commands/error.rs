//! Error returned to the renderer by the commands (a plain message, like a rejected IPC call).

use std::io;

use serde::Serialize;

use crate::net::http::FetchError;
use crate::net::xivapi::XivapiError;
use crate::repo::error::RepoError;

#[derive(Debug, PartialEq, Serialize)]
#[serde(transparent)]
pub struct CommandError(String);

impl From<RepoError> for CommandError {
    fn from(err: RepoError) -> Self {
        Self(err.to_string())
    }
}

impl From<FetchError> for CommandError {
    fn from(err: FetchError) -> Self {
        Self(err.to_string())
    }
}

impl From<XivapiError> for CommandError {
    fn from(err: XivapiError) -> Self {
        Self(err.to_string())
    }
}

impl From<io::Error> for CommandError {
    fn from(err: io::Error) -> Self {
        Self(err.to_string())
    }
}

impl From<tauri_plugin_opener::Error> for CommandError {
    fn from(err: tauri_plugin_opener::Error) -> Self {
        Self(err.to_string())
    }
}

pub type CommandResult<T> = Result<T, CommandError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_the_error_message() {
        let err = CommandError::from(RepoError::InvalidInput("priority 9".into()));
        assert_eq!(
            serde_json::to_value(err).unwrap(),
            "invalid input: priority 9"
        );
        let io = CommandError::from(io::Error::new(io::ErrorKind::NotFound, "no folder"));
        assert_eq!(serde_json::to_value(io).unwrap(), "no folder");
    }
}
