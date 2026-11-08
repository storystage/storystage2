//! The caps (spec 05 section 2.4). The per-minute window is kept in memory, and the day's count
//! by the app, on the device. Time is passed in, so every boundary can be tested.

use std::collections::VecDeque;

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

/// The day's count as the app stores it: `<date> <count>`. A different date, or a file that
/// can't be read, starts again at nothing.
pub fn used_today(stored: Option<&str>, today: &str) -> u32 {
    stored
        .and_then(|text| text.trim().split_once(' '))
        .filter(|(date, _)| *date == today)
        .and_then(|(_, count)| count.parse().ok())
        .unwrap_or(0)
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
        assert_eq!(used_today(Some("2026-11-01 7"), "2026-11-01"), 7);
        assert_eq!(used_today(Some("2026-11-01 7"), "2026-11-02"), 0);
        assert_eq!(used_today(None, "2026-11-01"), 0);
        assert_eq!(used_today(Some("rubbish"), "2026-11-01"), 0);
    }
}
