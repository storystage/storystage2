//! Backing off (spec 05 section 2.5). `jitter` is passed in, from 0 to 1, so a test can hold it
//! still, and so 30 classroom devices can be shown not to retry together.

const RETRIES: u32 = 2;
const FIRST_WAIT_MS: u64 = 1000;
const LONGEST_RETRY_AFTER_SECONDS: u64 = 60;

/// How long to wait before retry number `attempt` (from 1), or `None` to stop and report.
pub fn wait_ms(attempt: u32, retry_after_seconds: Option<u64>, jitter: f64) -> Option<u64> {
    if attempt == 0 || attempt > RETRIES {
        return None;
    }
    if retry_after_seconds.is_some_and(|seconds| seconds > LONGEST_RETRY_AFTER_SECONDS) {
        return None;
    }
    let base = FIRST_WAIT_MS << (attempt - 1);
    let backoff = base + (base as f64 * jitter.clamp(0.0, 1.0)) as u64;
    Some(backoff.max(retry_after_seconds.unwrap_or(0) * 1000))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_wait_doubles() {
        assert_eq!(wait_ms(1, None, 0.0), Some(1000));
        assert_eq!(wait_ms(2, None, 0.0), Some(2000));
    }

    #[test]
    fn jitter_adds_up_to_the_same_again() {
        assert_eq!(wait_ms(1, None, 1.0), Some(2000));
        assert_eq!(wait_ms(2, None, 0.5), Some(3000));
        assert_eq!(wait_ms(1, None, 7.0), Some(2000), "held to the range");
        assert_eq!(wait_ms(1, None, -1.0), Some(1000), "held to the range");
    }

    #[test]
    fn at_most_two_retries() {
        assert_eq!(wait_ms(3, None, 0.0), None);
        assert_eq!(wait_ms(0, None, 0.0), None);
    }

    #[test]
    fn retry_after_is_honoured_if_longer() {
        assert_eq!(wait_ms(1, Some(30), 0.0), Some(30_000));
        assert_eq!(wait_ms(2, Some(1), 0.5), Some(3000));
    }

    #[test]
    fn a_long_retry_after_is_reported_rather_than_waited_for() {
        assert_eq!(wait_ms(1, Some(60), 0.0), Some(60_000));
        assert_eq!(wait_ms(1, Some(61), 0.0), None);
    }

    #[test]
    fn thirty_clients_do_not_retry_together() {
        // Thirty evenly spread jitter values, as random ones would spread over many devices.
        let mut waits: Vec<u64> = (0..30)
            .map(|client| wait_ms(1, None, f64::from(client) / 30.0).unwrap())
            .collect();
        waits.sort_unstable();
        waits.dedup();
        assert_eq!(waits.len(), 30);
        assert!(waits[29] - waits[0] >= 900, "spread over most of a second");
    }
}
