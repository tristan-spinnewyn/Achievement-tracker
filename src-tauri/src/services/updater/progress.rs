//! Download progress reported to the renderer, at most once per percent.

use std::time::Instant;

use crate::models::updater::UpdateProgress;

/// Without a known size, progress is reported once per mebibyte.
const UNKNOWN_SIZE_STEP: u64 = 1024 * 1024;

pub struct ProgressTracker {
    started: Instant,
    transferred: u64,
    last_step: Option<u64>,
}

impl ProgressTracker {
    pub fn new(started: Instant) -> Self {
        Self {
            started,
            transferred: 0,
            last_step: None,
        }
    }

    /// Adds a downloaded chunk; returns the progress when it is worth reporting.
    pub fn on_chunk(
        &mut self,
        chunk: usize,
        total: Option<u64>,
        now: Instant,
    ) -> Option<UpdateProgress> {
        self.transferred += chunk as u64;
        let percent = total.map_or(0, |total| percent(self.transferred, total));
        let step = total.map_or(self.transferred / UNKNOWN_SIZE_STEP, |_| u64::from(percent));
        if self.last_step == Some(step) {
            return None;
        }
        self.last_step = Some(step);
        Some(UpdateProgress {
            percent,
            bytes_per_second: self.bytes_per_second(now),
            transferred: self.transferred,
            total: total.unwrap_or(0),
        })
    }

    fn bytes_per_second(&self, now: Instant) -> u64 {
        let seconds = now.saturating_duration_since(self.started).as_secs_f64();
        if seconds > 0.0 {
            (self.transferred as f64 / seconds) as u64
        } else {
            0
        }
    }
}

fn percent(transferred: u64, total: u64) -> u32 {
    if total == 0 {
        return 0;
    }
    (transferred.saturating_mul(100) / total).min(100) as u32
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    #[test]
    fn reports_the_percent_speed_and_sizes() {
        let start = Instant::now();
        let mut tracker = ProgressTracker::new(start);

        let progress = tracker.on_chunk(2_500, Some(10_000), start + Duration::from_secs(2));

        assert_eq!(
            progress,
            Some(UpdateProgress {
                percent: 25,
                bytes_per_second: 1_250,
                transferred: 2_500,
                total: 10_000,
            })
        );
    }

    #[test]
    fn reports_once_per_percent() {
        let start = Instant::now();
        let mut tracker = ProgressTracker::new(start);
        let at = start + Duration::from_secs(1);

        assert!(tracker.on_chunk(100, Some(1_000_000), at).is_some());
        assert!(tracker.on_chunk(100, Some(1_000_000), at).is_none());
        let next = tracker.on_chunk(10_000, Some(1_000_000), at).unwrap();
        assert_eq!(next.percent, 1);
        assert_eq!(next.transferred, 10_200);
    }

    #[test]
    fn ends_at_one_hundred_percent() {
        let start = Instant::now();
        let mut tracker = ProgressTracker::new(start);
        tracker.on_chunk(999, Some(1_000), start);

        let last = tracker.on_chunk(1, Some(1_000), start).unwrap();

        assert_eq!(last.percent, 100);
        // No elapsed time yet: the speed is unknown, not infinite.
        assert_eq!(last.bytes_per_second, 0);
    }

    #[test]
    fn reports_once_per_mebibyte_without_a_known_size() {
        let start = Instant::now();
        let mut tracker = ProgressTracker::new(start);
        let at = start + Duration::from_secs(1);

        let first = tracker.on_chunk(1_000, None, at).unwrap();
        assert_eq!((first.percent, first.total), (0, 0));
        assert!(tracker.on_chunk(500_000, None, at).is_none());
        assert_eq!(
            tracker.on_chunk(600_000, None, at).unwrap().transferred,
            1_101_000
        );
    }

    #[test]
    fn caps_the_percent_when_the_server_sends_more_than_announced() {
        let start = Instant::now();
        let mut tracker = ProgressTracker::new(start);
        assert_eq!(
            tracker.on_chunk(2_000, Some(1_000), start).unwrap().percent,
            100
        );
    }
}
