//! The gate (WP15.2, spec 05 section 2.3): the policy enforcement point for the Prompter. Every
//! request passes here before the key is read. A compromised webview can only ask for what
//! this allows (threat W2), so the checks assume the request is hostile.
//!
//! Decisions only: nothing here touches the network, the key or Tauri.

pub mod caps;
mod check;
pub mod retry;
pub mod sse;

pub use check::{canonical_hash, check, contains_secret, hash_text, Pins, PrompterRequest};

use serde::Serialize;
use serde_json::Value;

/// One code per cause (spec 05 section 2.5). `TRANSPORT_ERROR_CODES` in `packages/prompter` is
/// the same list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Code {
    PrompterOff,
    Offline,
    NoKey,
    KeyRevoked,
    NoCredit,
    RateLimited,
    Overloaded,
    RefusedByPolicy,
    RefusedByAllowlist,
    CapReached,
    Cancelled,
    Internal,
}

/// The Messages API's HTTP status as a code. `None` means success.
pub fn code_for_status(status: u16) -> Option<Code> {
    match status {
        200..=299 => None,
        401 | 403 => Some(Code::KeyRevoked),
        402 => Some(Code::NoCredit),
        429 => Some(Code::RateLimited),
        500..=599 => Some(Code::Overloaded),
        _ => Some(Code::Internal),
    }
}

/// What the webview receives on the channel, in the shape of `PrompterEvent` in the transport
/// contract.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PrompterEvent {
    Event {
        event: Value,
    },
    Error {
        code: Code,
        #[serde(rename = "retryAfterSeconds", skip_serializing_if = "Option::is_none")]
        retry_after_seconds: Option<u64>,
    },
    End,
}

impl PrompterEvent {
    pub fn error(code: Code) -> Self {
        Self::Error { code, retry_after_seconds: None }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn each_status_has_one_code() {
        assert_eq!(code_for_status(200), None);
        assert_eq!(code_for_status(401), Some(Code::KeyRevoked));
        assert_eq!(code_for_status(403), Some(Code::KeyRevoked));
        assert_eq!(code_for_status(402), Some(Code::NoCredit));
        assert_eq!(code_for_status(429), Some(Code::RateLimited));
        assert_eq!(code_for_status(500), Some(Code::Overloaded));
        assert_eq!(code_for_status(529), Some(Code::Overloaded));
        assert_eq!(code_for_status(400), Some(Code::Internal));
        assert_eq!(code_for_status(404), Some(Code::Internal));
    }

    #[test]
    fn events_have_the_contract_shape() {
        let error = PrompterEvent::Error {
            code: Code::RateLimited,
            retry_after_seconds: Some(3),
        };
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            json!({ "type": "error", "code": "rate_limited", "retryAfterSeconds": 3 })
        );
        assert_eq!(
            serde_json::to_value(PrompterEvent::error(Code::NoKey)).unwrap(),
            json!({ "type": "error", "code": "no_key" })
        );
        assert_eq!(serde_json::to_value(PrompterEvent::End).unwrap(), json!({ "type": "end" }));
        assert_eq!(
            serde_json::to_value(PrompterEvent::Event { event: json!({ "type": "ping" }) }).unwrap(),
            json!({ "type": "event", "event": { "type": "ping" } })
        );
    }

    /// The other half of this test is in `packages/prompter`, against the same list.
    #[test]
    fn the_codes_match_the_contract() {
        use Code::*;
        let codes = [
            PrompterOff, Offline, NoKey, KeyRevoked, NoCredit, RateLimited, Overloaded,
            RefusedByPolicy, RefusedByAllowlist, CapReached, Cancelled, Internal,
        ];
        let names = serde_json::to_value(codes).unwrap();
        assert_eq!(
            names,
            json!([
                "prompter_off", "offline", "no_key", "key_revoked", "no_credit", "rate_limited",
                "overloaded", "refused_by_policy", "refused_by_allowlist", "cap_reached",
                "cancelled", "internal"
            ])
        );
    }
}
