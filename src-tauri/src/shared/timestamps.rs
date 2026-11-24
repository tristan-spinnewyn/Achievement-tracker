//! Timestamps in the formats stored by the TS app.

use chrono::{DateTime, SecondsFormat, Utc};

/// Like `Date.toISOString()`: `2026-06-19T18:00:00.000Z`.
pub fn iso_timestamp(now: DateTime<Utc>) -> String {
    now.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Like `toISOString().slice(0, 10)`: `2026-06-19`.
pub fn iso_date(now: DateTime<Utc>) -> String {
    now.format("%Y-%m-%d").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_like_javascript_to_iso_string() {
        let now: DateTime<Utc> = "2026-06-19T18:00:05.25Z".parse().unwrap();
        assert_eq!(iso_timestamp(now), "2026-06-19T18:00:05.250Z");
        assert_eq!(iso_date(now), "2026-06-19");
    }
}
