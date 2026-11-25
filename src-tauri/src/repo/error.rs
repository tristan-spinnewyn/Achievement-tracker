//! Errors of the data access layer.

use std::fmt;
use std::io;

#[derive(Debug)]
pub enum RepoError {
    /// An argument from the renderer failed validation.
    InvalidInput(String),
    /// The user data could not be saved.
    Io(io::Error),
}

impl fmt::Display for RepoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(message) => write!(f, "invalid input: {message}"),
            Self::Io(err) => write!(f, "cannot save the data: {err}"),
        }
    }
}

impl std::error::Error for RepoError {}

impl From<io::Error> for RepoError {
    fn from(err: io::Error) -> Self {
        Self::Io(err)
    }
}

pub type RepoResult<T> = Result<T, RepoError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn displays_a_readable_message() {
        assert_eq!(
            RepoError::InvalidInput("id 0".into()).to_string(),
            "invalid input: id 0"
        );
        let io = RepoError::from(io::Error::other("disk full"));
        assert_eq!(io.to_string(), "cannot save the data: disk full");
    }
}
