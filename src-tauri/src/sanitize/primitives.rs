//! Basic checks for values that cross a trust boundary (IPC arguments, files on disk).

use serde_json::Value;

/// Maximum length of free text (notes, tags, names).
pub const MAX_TEXT_LENGTH: usize = 10_000;
const MAX_ICON_PATH_LENGTH: usize = 256;

/// An achievement id is a positive integer.
pub fn is_achievement_id(value: &Value) -> bool {
    value
        .as_u64()
        .is_some_and(|id| id > 0 && id <= u64::from(u32::MAX))
}

/// Keys of the records indexed by achievement id: digits only.
pub fn is_numeric_key(key: &str) -> bool {
    !key.is_empty() && key.bytes().all(|b| b.is_ascii_digit())
}

/// Collection keys are `{type}:{id}` or `{type}:{hash}`.
pub fn is_collection_key(key: &str) -> bool {
    key.split_once(':').is_some_and(|(kind, id)| {
        !kind.is_empty()
            && kind.bytes().all(|b| b.is_ascii_lowercase())
            && !id.is_empty()
            && id.bytes().all(|b| b.is_ascii_alphanumeric())
    })
}

/// Icon path usable as a cache file name and as a query parameter: alphanumeric
/// segments separated by "/" and an extension. Rejects "..", "\", ":" and URLs.
pub fn is_safe_icon_path(path: &str) -> bool {
    if path.len() > MAX_ICON_PATH_LENGTH {
        return false;
    }
    let relative = path.strip_prefix('/').unwrap_or(path);
    let Some((stem, extension)) = relative.rsplit_once('.') else {
        return false;
    };
    let is_segment = |s: &str| {
        !s.is_empty()
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    };
    !extension.is_empty()
        && extension.bytes().all(|b| b.is_ascii_alphanumeric())
        && stem.split('/').all(is_segment)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn achievement_ids_are_positive_integers() {
        assert!(is_achievement_id(&json!(12)));
        for bad in [
            json!(0),
            json!(-1),
            json!(1.5),
            json!("12"),
            json!("__proto__"),
            json!(null),
        ] {
            assert!(!is_achievement_id(&bad), "{bad} accepted");
        }
        assert!(!is_achievement_id(&json!(u64::from(u32::MAX) + 1)));
    }

    #[test]
    fn numeric_keys_contain_only_digits() {
        assert!(is_numeric_key("123"));
        for bad in ["", "12a", "__proto__", "-1", "1.5"] {
            assert!(!is_numeric_key(bad), "{bad} accepted");
        }
    }

    #[test]
    fn collection_keys_are_lowercase_type_and_alphanumeric_id() {
        assert!(is_collection_key("mount:1"));
        assert!(is_collection_key("faceaccessory:ab12CD"));
        for bad in [
            "constructor",
            "Mount:1",
            "mount:",
            ":1",
            "mount:1:2",
            "mount:a-b",
        ] {
            assert!(!is_collection_key(bad), "{bad} accepted");
        }
    }

    #[test]
    fn safe_icon_paths_accept_cache_like_paths() {
        assert!(is_safe_icon_path("ui/icon/062000/062904.tex"));
        assert!(is_safe_icon_path("/i/000000/000123.png"));
        assert!(is_safe_icon_path("icon_a-b.png"));
    }

    #[test]
    fn safe_icon_paths_reject_traversal_urls_and_oddities() {
        let too_long = format!("{}.png", "a".repeat(MAX_ICON_PATH_LENGTH));
        for bad in [
            "../../etc/passwd",
            "..\\x.png",
            "C:/x.png",
            "https://evil/x.png",
            "a//b.png",
            "a/b",
            "a/b.",
            ".png",
            "a.b.png",
            "",
            too_long.as_str(),
        ] {
            assert!(!is_safe_icon_path(bad), "{bad} accepted");
        }
    }
}
