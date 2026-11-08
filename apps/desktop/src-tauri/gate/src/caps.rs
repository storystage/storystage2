//! The caps (spec 05 section 2.4). The per-minute window is kept in memory, and the day's count
//! by the app, on the device. Time is passed in, so every boundary can be tested.

use std::collections::{BTreeMap, VecDeque};

use storystage_policy::{CapAction, PrompterLevel, PrompterPolicy};

pub const PER_MINUTE: usize = 10;
const WINDOW_SECONDS: u64 = 60;

/// The last minute's requests on this device.
#[derive(Debug, Default)]
pub struct Minute {
    sent: VecDeque<u64>,
}

impl Minute {
    /// Takes a slot, or says how many seconds until one frees.
    pub fn take(&mut self, now: u64) -> Result<(), u64> {
        while self.sent.front().is_some_and(|sent| now.saturating_sub(*sent) >= WINDOW_SECONDS) {
            self.sent.pop_front();
        }
        if self.sent.len() >= PER_MINUTE {
            let oldest = self.sent.front().copied().unwrap_or(now);
            return Err((oldest + WINDOW_SECONDS).saturating_sub(now).max(1));
        }
        self.sent.push_back(now);
        Ok(())
    }
}

/// The level for today, given how many requests have reached the network. Past the cap,
/// `explainOnly` allows a further half of it, and then nothing: the graduated limit in 24.5.
pub fn day_level(policy: &PrompterPolicy, used: u32) -> PrompterLevel {
    let Some(cap) = policy.daily_cap else {
        return policy.level;
    };
    if used < cap {
        return policy.level;
    }
    match policy.cap_action {
        CapAction::ExplainOnly if used < cap + cap / 2 => match policy.level {
            PrompterLevel::Off => PrompterLevel::Off,
            _ => PrompterLevel::ExplainOnly,
        },
        _ => PrompterLevel::Off,
    }
}

/// Who a request counts against: the pupil whose folder is open, or the device when nobody's
/// is (spec 05 section 2.4).
pub const DEVICE: &str = "device";

/// Today's counts on this device, one per pupil and one for the device. As the app stores them:
/// the date on the first line, then `<who> <count>` on each line after. A file from another
/// day, or one that can't be read, starts again at nothing. The count before 24.5, `<date>
/// <count>` on one line, is read as the device's.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DayCounts {
    counts: BTreeMap<String, u32>,
}

/// A name that can be a key in the file: a pupil id is a safe path part (spec 05 section 6.1).
fn is_who(who: &str) -> bool {
    !who.is_empty()
        && who.len() <= 64
        && who.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-'))
}

impl DayCounts {
    pub fn read(stored: Option<&str>, today: &str) -> Self {
        let mut counts = BTreeMap::new();
        let mut lines = stored.unwrap_or("").lines();
        let first = lines.next().unwrap_or("").trim();
        match first.split_once(' ') {
            // Before 24.5: one line, `<date> <count>`, for the whole device.
            Some((date, count)) if date == today => {
                if let Ok(count) = count.trim().parse() {
                    counts.insert(DEVICE.to_string(), count);
                }
            }
            None if first == today => {
                for line in lines {
                    let Some((who, count)) = line.trim().split_once(' ') else { continue };
                    if let (true, Ok(count)) = (is_who(who), count.trim().parse::<u32>()) {
                        counts.insert(who.to_string(), count);
                    }
                }
            }
            _ => {}
        }
        Self { counts }
    }

    pub fn used(&self, who: &str) -> u32 {
        self.counts.get(who).copied().unwrap_or(0)
    }

    /// Counts one more request against `who`. A name that can't be a key counts as the device's.
    pub fn add(&mut self, who: &str) {
        let who = if is_who(who) { who } else { DEVICE };
        let count = self.counts.entry(who.to_string()).or_insert(0);
        *count = count.saturating_add(1);
    }

    pub fn write(&self, today: &str) -> String {
        let mut text = format!("{today}\n");
        for (who, count) in &self.counts {
            text.push_str(&format!("{who} {count}\n"));
        }
        text
    }

    /// Each pupil's count today, and the device's, in a steady order.
    pub fn entries(&self) -> impl Iterator<Item = (&str, u32)> {
        self.counts.iter().map(|(who, count)| (who.as_str(), *count))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(level: PrompterLevel, cap: Option<u32>, action: CapAction) -> PrompterPolicy {
        PrompterPolicy { level, voice_input: true, daily_cap: cap, cap_action: action }
    }

    #[test]
    fn the_minute_allows_ten_then_says_when_a_slot_frees() {
        let mut minute = Minute::default();
        for second in 0..10 {
            assert_eq!(minute.take(100 + second), Ok(()));
        }
        assert_eq!(minute.take(110), Err(50));
        assert_eq!(minute.take(159), Err(1));
        assert_eq!(minute.take(160), Ok(()));
    }

    #[test]
    fn a_refused_request_does_not_use_a_slot() {
        let mut minute = Minute::default();
        for _ in 0..10 {
            minute.take(0).unwrap();
        }
        for _ in 0..50 {
            assert!(minute.take(30).is_err());
        }
        assert_eq!(minute.take(60), Ok(()));
    }

    #[test]
    fn with_no_cap_the_level_stands() {
        let policy = policy(PrompterLevel::Full, None, CapAction::Off);
        assert_eq!(day_level(&policy, 1_000_000), PrompterLevel::Full);
    }

    #[test]
    fn under_the_cap_the_level_stands() {
        let policy = policy(PrompterLevel::PlanOnly, Some(20), CapAction::Off);
        assert_eq!(day_level(&policy, 19), PrompterLevel::PlanOnly);
    }

    #[test]
    fn the_off_action_stops_at_the_cap() {
        let policy = policy(PrompterLevel::Full, Some(20), CapAction::Off);
        assert_eq!(day_level(&policy, 20), PrompterLevel::Off);
    }

    #[test]
    fn the_explain_action_allows_half_as_much_again_then_stops() {
        let policy = policy(PrompterLevel::Full, Some(20), CapAction::ExplainOnly);
        assert_eq!(day_level(&policy, 20), PrompterLevel::ExplainOnly);
        assert_eq!(day_level(&policy, 29), PrompterLevel::ExplainOnly);
        assert_eq!(day_level(&policy, 30), PrompterLevel::Off);
    }

    #[test]
    fn a_cap_of_nothing_allows_nothing() {
        let policy = policy(PrompterLevel::Full, Some(0), CapAction::ExplainOnly);
        assert_eq!(day_level(&policy, 0), PrompterLevel::Off);
    }

    #[test]
    fn the_cap_never_raises_the_level() {
        let policy = policy(PrompterLevel::Off, Some(20), CapAction::ExplainOnly);
        assert_eq!(day_level(&policy, 20), PrompterLevel::Off);
    }

    #[test]
    fn the_count_starts_again_each_day() {
        let stored = "2026-11-01\ndevice 2\npupil-ava 7\n";
        assert_eq!(DayCounts::read(Some(stored), "2026-11-01").used("pupil-ava"), 7);
        assert_eq!(DayCounts::read(Some(stored), "2026-11-02").used("pupil-ava"), 0);
        assert_eq!(DayCounts::read(None, "2026-11-01"), DayCounts::default());
        assert_eq!(DayCounts::read(Some("rubbish"), "2026-11-01"), DayCounts::default());
    }

    #[test]
    fn each_pupil_has_their_own_count() {
        let mut counts = DayCounts::default();
        counts.add("pupil-ava");
        counts.add("pupil-ava");
        counts.add("pupil-ben");
        counts.add(DEVICE);
        assert_eq!(counts.used("pupil-ava"), 2);
        assert_eq!(counts.used("pupil-ben"), 1);
        assert_eq!(counts.used(DEVICE), 1);
        assert_eq!(counts.used("pupil-cai"), 0);
        let again = DayCounts::read(Some(&counts.write("2026-11-08")), "2026-11-08");
        assert_eq!(again, counts);
        assert_eq!(counts.entries().collect::<Vec<_>>(), [("device", 1), ("pupil-ava", 2), ("pupil-ben", 1)]);
    }

    #[test]
    fn the_count_from_before_is_the_devices() {
        assert_eq!(DayCounts::read(Some("2026-11-01 7"), "2026-11-01").used(DEVICE), 7);
        assert_eq!(DayCounts::read(Some("2026-11-01 7"), "2026-11-02").used(DEVICE), 0);
    }

    #[test]
    fn a_name_that_cant_be_a_key_counts_as_the_devices() {
        let mut counts = DayCounts::default();
        counts.add("Ava Smith\ndevice 0");
        assert_eq!(counts.used(DEVICE), 1);
        let stored = "2026-11-01\nAva 5\npupil-ben lots\npupil-cai 3\n";
        let read = DayCounts::read(Some(stored), "2026-11-01");
        assert_eq!(read.entries().collect::<Vec<_>>(), [("pupil-cai", 3)]);
    }
}
