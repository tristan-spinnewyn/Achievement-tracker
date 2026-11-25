//! FFXIV resets, fixed in UTC (port of `src/shared/resets.ts`):
//! daily 15:00 UTC, weekly Tuesday 08:00 UTC, Grand Company supply (`daily22`) 20:00 UTC.

use chrono::{DateTime, Datelike, Days, TimeDelta, Utc};

use crate::models::user::RecurringType;

const DAILY_RESET_UTC_HOUR: u32 = 15;
const WEEKLY_RESET_UTC_HOUR: u32 = 8;
/// Tuesday, counted from Sunday = 0.
const WEEKLY_RESET_DAY_FROM_SUNDAY: u32 = 2;
const SUPPLY_RESET_UTC_HOUR: u32 = 20;

/// Today at the given UTC hour.
fn today_at(now: DateTime<Utc>, hour: u32) -> DateTime<Utc> {
    now.date_naive()
        .and_hms_opt(hour, 0, 0)
        .expect("valid reset hour")
        .and_utc()
}

/// The last time the clock showed `hour` UTC, `now` included.
fn last_daily_at(now: DateTime<Utc>, hour: u32) -> DateTime<Utc> {
    let today = today_at(now, hour);
    if today > now {
        today - Days::new(1)
    } else {
        today
    }
}

fn last_weekly_reset(now: DateTime<Utc>) -> DateTime<Utc> {
    let days_since = (now.weekday().num_days_from_sunday() + 7 - WEEKLY_RESET_DAY_FROM_SUNDAY) % 7;
    let reset = today_at(now, WEEKLY_RESET_UTC_HOUR) - Days::new(days_since.into());
    if reset > now {
        reset - Days::new(7)
    } else {
        reset
    }
}

/// Start of the current period of a recurring task type.
pub fn period_start(kind: RecurringType, now: DateTime<Utc>) -> DateTime<Utc> {
    match kind {
        RecurringType::Daily => last_daily_at(now, DAILY_RESET_UTC_HOUR),
        RecurringType::Weekly => last_weekly_reset(now),
        RecurringType::Daily22 => last_daily_at(now, SUPPLY_RESET_UTC_HOUR),
    }
}

/// Start of the previous period (used for streaks).
pub fn previous_period_start(kind: RecurringType, now: DateTime<Utc>) -> DateTime<Utc> {
    period_start(kind, period_start(kind, now) - TimeDelta::milliseconds(1))
}

/// A task is done when its last check is at or after the start of the current period.
/// A missing or unparsable date counts as not done.
pub fn is_done_this_period(
    kind: RecurringType,
    last_completed_at: Option<&str>,
    now: DateTime<Utc>,
) -> bool {
    last_completed_at
        .and_then(|iso| iso.parse::<DateTime<Utc>>().ok())
        .is_some_and(|last| last >= period_start(kind, now))
}

#[cfg(test)]
mod tests {
    use super::*;
    use RecurringType::{Daily, Daily22, Weekly};

    fn at(iso: &str) -> DateTime<Utc> {
        iso.parse().unwrap()
    }

    #[test]
    fn daily_period_starts_at_the_last_15_00_utc() {
        assert_eq!(
            period_start(Daily, at("2026-06-19T18:00:00Z")),
            at("2026-06-19T15:00:00Z")
        );
        assert_eq!(
            period_start(Daily, at("2026-06-19T10:00:00Z")),
            at("2026-06-18T15:00:00Z")
        );
        assert_eq!(
            period_start(Daily, at("2026-06-19T15:00:00Z")),
            at("2026-06-19T15:00:00Z")
        );
    }

    #[test]
    fn weekly_period_starts_on_the_last_tuesday_08_00_utc() {
        // 2026-06-19 is a Friday.
        assert_eq!(
            period_start(Weekly, at("2026-06-19T18:00:00Z")),
            at("2026-06-16T08:00:00Z")
        );
        // Tuesday before 08:00: the previous Tuesday.
        assert_eq!(
            period_start(Weekly, at("2026-06-16T07:59:00Z")),
            at("2026-06-09T08:00:00Z")
        );
        // Sunday.
        assert_eq!(
            period_start(Weekly, at("2026-06-21T12:00:00Z")),
            at("2026-06-16T08:00:00Z")
        );
    }

    #[test]
    fn supply_period_starts_at_the_last_20_00_utc() {
        assert_eq!(
            period_start(Daily22, at("2026-06-19T21:00:00Z")),
            at("2026-06-19T20:00:00Z")
        );
        assert_eq!(
            period_start(Daily22, at("2026-06-19T19:00:00Z")),
            at("2026-06-18T20:00:00Z")
        );
    }

    #[test]
    fn previous_period_is_one_period_earlier() {
        let now = at("2026-06-19T18:00:00Z");
        assert_eq!(
            previous_period_start(Daily, now),
            at("2026-06-18T15:00:00Z")
        );
        assert_eq!(
            previous_period_start(Weekly, now),
            at("2026-06-09T08:00:00Z")
        );
        assert_eq!(
            previous_period_start(Daily22, now),
            at("2026-06-17T20:00:00Z")
        );
    }

    #[test]
    fn done_this_period_compares_the_last_check_with_the_period_start() {
        let now = at("2026-06-19T18:00:00Z");
        assert!(is_done_this_period(
            Daily,
            Some("2026-06-19T15:00:00.000Z"),
            now
        ));
        assert!(!is_done_this_period(
            Daily,
            Some("2026-06-19T14:59:59.999Z"),
            now
        ));
        assert!(is_done_this_period(
            Weekly,
            Some("2026-06-17T00:00:00Z"),
            now
        ));
        assert!(!is_done_this_period(Daily, None, now));
        assert!(!is_done_this_period(Daily, Some("not a date"), now));
    }
}
