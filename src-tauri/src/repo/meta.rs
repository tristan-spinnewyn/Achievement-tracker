//! Per-achievement user metadata and the shared input checks.

use super::error::{RepoError, RepoResult};
use crate::models::user::{Priority, UserData, UserMeta};
use crate::sanitize::primitives::MAX_TEXT_LENGTH;

pub const MAX_PRIORITY: Priority = 3;

/// Achievement ids are positive.
pub fn check_achievement_id(id: u32) -> RepoResult<()> {
    if id == 0 {
        return Err(RepoError::InvalidInput("achievement id 0".into()));
    }
    Ok(())
}

/// Free text is limited in length.
pub fn check_text(text: &str, label: &str) -> RepoResult<()> {
    if text.chars().count() > MAX_TEXT_LENGTH {
        return Err(RepoError::InvalidInput(format!("{label} too long")));
    }
    Ok(())
}

pub fn check_priority(priority: Priority) -> RepoResult<()> {
    if priority > MAX_PRIORITY {
        return Err(RepoError::InvalidInput(format!("priority {priority}")));
    }
    Ok(())
}

/// The user metadata of an achievement, created with defaults when missing.
pub fn ensure_meta(user: &mut UserData, id: u32) -> RepoResult<&mut UserMeta> {
    check_achievement_id(id)?;
    Ok(user
        .user_meta
        .entry(id.to_string())
        .or_insert_with(|| UserMeta {
            achievement_id: id,
            ..UserMeta::default()
        }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_achievement_id_zero() {
        assert!(check_achievement_id(1).is_ok());
        assert!(matches!(
            check_achievement_id(0),
            Err(RepoError::InvalidInput(_))
        ));
    }

    #[test]
    fn rejects_text_over_the_length_limit() {
        assert!(check_text(&"a".repeat(MAX_TEXT_LENGTH), "note").is_ok());
        assert!(check_text(&"a".repeat(MAX_TEXT_LENGTH + 1), "note").is_err());
    }

    #[test]
    fn priorities_go_from_zero_to_three() {
        assert!(check_priority(0).is_ok());
        assert!(check_priority(MAX_PRIORITY).is_ok());
        assert!(check_priority(4).is_err());
    }

    #[test]
    fn ensure_meta_creates_default_metadata_once() {
        let mut user = UserData::default();
        ensure_meta(&mut user, 7).unwrap().priority = 2;

        let meta = ensure_meta(&mut user, 7).unwrap();

        assert_eq!(meta.achievement_id, 7);
        assert_eq!(meta.priority, 2);
        assert!(!meta.in_focus);
        assert_eq!(user.user_meta.len(), 1);
        assert!(ensure_meta(&mut user, 0).is_err());
    }
}
