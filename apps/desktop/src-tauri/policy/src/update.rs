//! Which build a device should be on (spec 05 section 4.3). Decisions only, so every row of the
//! table can be tested: fetching and installing are in the app's `updates` module.

use std::cmp::Ordering;

use serde::Deserialize;

use crate::{is_version, UpdateChannel, UpdatePolicy};

/// Update files are static: there is no StoryStage server (4.2).
const UPDATE_HOST: &str = "https://github.com/storystage/storystage2/releases/download";

/// The two fields of ours in a manifest, beside Tauri's own (4.3).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Rollout {
    /// The percentage of devices offered this build.
    #[serde(default = "every_device")]
    pub rollout: u8,
    /// Versions pulled from the channel.
    #[serde(default)]
    pub withdrawn: Vec<String>,
}

fn every_device() -> u8 {
    100
}

impl Default for Rollout {
    fn default() -> Self {
        Self { rollout: every_device(), withdrawn: Vec::new() }
    }
}

/// The file to read for this policy, or `None` if the device shouldn't check at all.
pub fn manifest_url(policy: &UpdatePolicy) -> Option<String> {
    if let Some(pin) = &policy.pin {
        if policy.channel == UpdateChannel::Off {
            return None;
        }
        return Some(format!("{UPDATE_HOST}/v{pin}/latest.json"));
    }
    match policy.channel {
        UpdateChannel::Stable => Some(format!("{UPDATE_HOST}/channel-stable/latest.json")),
        UpdateChannel::Pilot => Some(format!("{UPDATE_HOST}/channel-pilot/latest.json")),
        UpdateChannel::Off => None,
    }
}

fn parts(version: &str) -> Option<[u64; 3]> {
    if !is_version(version) {
        return None;
    }
    let mut numbers = version.split('.').map(|part| part.parse().unwrap_or(0));
    Some([numbers.next()?, numbers.next()?, numbers.next()?])
}

/// How often a device reads the manifest (4.1), so a shared computer that starts all day long
/// doesn't check all day long.
const SECONDS_BETWEEN_CHECKS: u64 = 24 * 60 * 60;

/// Whether to read the manifest now. `stamp` is what the last check wrote: `<seconds> <version>`.
/// A device that has just changed version always checks, so a broken build it took is left as
/// soon as possible, at its next start.
pub fn check_is_due(stamp: Option<&str>, now: u64, installed: &str) -> bool {
    let Some((seconds, version)) = stamp.and_then(|text| text.trim().split_once(' ')) else {
        return true;
    };
    let Ok(checked) = seconds.parse::<u64>() else {
        return true;
    };
    version != installed || now.saturating_sub(checked) >= SECONDS_BETWEEN_CHECKS
}

/// The table in 4.3. `bucket` is this install's random number from 0 to 99. Anything that
/// can't be understood means stay where you are.
pub fn should_move(
    policy: &UpdatePolicy,
    installed: &str,
    offered: &str,
    fields: &Rollout,
    bucket: u8,
) -> bool {
    if policy.channel == UpdateChannel::Off || fields.rollout > 100 {
        return false;
    }
    let (Some(installed_parts), Some(offered_parts)) = (parts(installed), parts(offered)) else {
        return false;
    };
    if let Some(pin) = &policy.pin {
        return offered == pin && offered != installed;
    }
    match offered_parts.cmp(&installed_parts) {
        Ordering::Greater => bucket < fields.rollout,
        Ordering::Less => fields.withdrawn.iter().any(|version| version == installed),
        Ordering::Equal => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(channel: UpdateChannel, pin: Option<&str>) -> UpdatePolicy {
        UpdatePolicy { channel, pin: pin.map(str::to_string) }
    }

    fn fields(rollout: u8, withdrawn: &[&str]) -> Rollout {
        Rollout { rollout, withdrawn: withdrawn.iter().map(|v| v.to_string()).collect() }
    }

    const STABLE: UpdateChannel = UpdateChannel::Stable;

    #[test]
    fn a_check_is_due_once_a_day_or_after_a_version_change() {
        let day = 24 * 60 * 60;
        assert!(check_is_due(None, 1000, "1.0.0"), "never checked");
        assert!(check_is_due(Some("rubbish"), 1000, "1.0.0"));
        assert!(!check_is_due(Some("1000 1.0.0"), 1000 + day - 1, "1.0.0"));
        assert!(check_is_due(Some("1000 1.0.0"), 1000 + day, "1.0.0"));
        assert!(check_is_due(Some("1000 1.0.0"), 1001, "1.0.1"), "just changed version");
        assert!(!check_is_due(Some("1000 1.0.0"), 999, "1.0.0"), "a clock set back");
    }

    #[test]
    fn each_channel_has_its_own_file() {
        let url = |channel| manifest_url(&policy(channel, None));
        assert_eq!(
            url(UpdateChannel::Stable).as_deref(),
            Some("https://github.com/storystage/storystage2/releases/download/channel-stable/latest.json")
        );
        assert_eq!(
            url(UpdateChannel::Pilot).as_deref(),
            Some("https://github.com/storystage/storystage2/releases/download/channel-pilot/latest.json")
        );
        assert_eq!(url(UpdateChannel::Off), None);
    }

    #[test]
    fn a_pin_reads_that_version_on_any_channel() {
        for channel in [UpdateChannel::Stable, UpdateChannel::Pilot] {
            assert_eq!(
                manifest_url(&policy(channel, Some("1.4.2"))).as_deref(),
                Some("https://github.com/storystage/storystage2/releases/download/v1.4.2/latest.json")
            );
        }
    }

    #[test]
    fn off_means_no_check_even_with_a_pin() {
        let off = policy(UpdateChannel::Off, Some("1.4.2"));
        assert_eq!(manifest_url(&off), None);
        assert!(!should_move(&off, "1.0.0", "1.4.2", &Rollout::default(), 0));
    }

    #[test]
    fn a_pin_moves_up_or_down_to_exactly_that_build() {
        let pinned = policy(STABLE, Some("1.4.2"));
        let all = Rollout::default();
        assert!(should_move(&pinned, "1.3.0", "1.4.2", &all, 99));
        assert!(should_move(&pinned, "1.5.0", "1.4.2", &all, 99));
        assert!(!should_move(&pinned, "1.4.2", "1.4.2", &all, 99));
        assert!(!should_move(&pinned, "1.3.0", "1.5.0", &all, 99), "not the pinned build");
    }

    #[test]
    fn a_newer_build_follows_the_rollout() {
        let stable = policy(STABLE, None);
        assert!(should_move(&stable, "1.0.0", "1.0.1", &Rollout::default(), 99));
        assert!(should_move(&stable, "1.0.0", "1.0.1", &fields(25, &[]), 24));
        assert!(!should_move(&stable, "1.0.0", "1.0.1", &fields(25, &[]), 25));
        assert!(!should_move(&stable, "1.0.0", "1.0.1", &fields(0, &[]), 0));
    }

    #[test]
    fn versions_compare_as_numbers() {
        let stable = policy(STABLE, None);
        assert!(should_move(&stable, "1.9.0", "1.10.0", &Rollout::default(), 0));
        assert!(!should_move(&stable, "1.10.0", "1.9.0", &Rollout::default(), 0));
    }

    #[test]
    fn an_older_build_is_a_rollback_only_if_this_one_was_withdrawn() {
        let stable = policy(STABLE, None);
        assert!(should_move(&stable, "1.0.1", "1.0.0", &fields(100, &["1.0.1"]), 0));
        assert!(should_move(&stable, "1.0.1", "1.0.0", &fields(0, &["1.0.1"]), 99), "rollout ignored");
        assert!(!should_move(&stable, "1.0.1", "1.0.0", &fields(100, &["1.0.2"]), 0));
        assert!(!should_move(&stable, "1.0.1", "1.0.0", &Rollout::default(), 0));
    }

    #[test]
    fn the_same_build_stays() {
        assert!(!should_move(&policy(STABLE, None), "1.0.0", "1.0.0", &Rollout::default(), 0));
    }

    #[test]
    fn anything_not_understood_stays() {
        let stable = policy(STABLE, None);
        let all = Rollout::default();
        assert!(!should_move(&stable, "1.0.0", "latest", &all, 0));
        assert!(!should_move(&stable, "unknown", "1.0.1", &all, 0));
        assert!(!should_move(&stable, "1.0.0", "1.0.1", &fields(101, &[]), 0));
    }

    #[test]
    fn a_manifest_with_no_fields_of_ours_goes_to_every_device() {
        let fields: Rollout = serde_json::from_str(r#"{"version": "1.0.1"}"#).unwrap();
        assert_eq!(fields, Rollout::default());
    }

    #[test]
    fn a_manifest_with_bad_fields_is_refused() {
        assert!(serde_json::from_str::<Rollout>(r#"{"rollout": "most"}"#).is_err());
        assert!(serde_json::from_str::<Rollout>(r#"{"rollout": 300}"#).is_err());
        assert!(serde_json::from_str::<Rollout>(r#"{"withdrawn": "1.0.0"}"#).is_err());
    }
}
