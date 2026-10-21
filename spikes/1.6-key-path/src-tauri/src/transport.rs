//! The Claude transport: sends the checked request with the key added, and streams the reply
//! as `PrompterEvent`s (the shape in `packages/prompter/src/transport.ts`).

use crate::sse::SseParser;
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PrompterEvent {
    Event {
        event: Value,
    },
    Error {
        code: &'static str,
        #[serde(rename = "retryAfterSeconds", skip_serializing_if = "Option::is_none")]
        retry_after_seconds: Option<u64>,
    },
    End,
}

pub fn error(code: &'static str) -> PrompterEvent {
    PrompterEvent::Error { code, retry_after_seconds: None }
}

/// One error code per HTTP status (WP15.2). `None` means success.
pub fn code_for_status(status: u16) -> Option<&'static str> {
    match status {
        200..=299 => None,
        401 | 403 => Some("key_revoked"),
        402 => Some("no_credit"),
        429 => Some("rate_limited"),
        500..=599 => Some("overloaded"),
        _ => Some("internal"),
    }
}

const RETRIES: u32 = 2;

/// Streams one request. `emit` is called for every event, and always last with `End` or `Error`.
pub async fn stream(base_url: &str, key: &str, body: &Value, emit: impl Fn(PrompterEvent)) {
    let client = reqwest::Client::new();
    let mut attempt = 0;
    let response = loop {
        let sent = client
            .post(format!("{base_url}/v1/messages"))
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .timeout(Duration::from_secs(120))
            .body(body.to_string())
            .send()
            .await;
        let response = match sent {
            Ok(r) => r,
            Err(e) if e.is_connect() || e.is_timeout() => return emit(error("offline")),
            Err(_) => return emit(error("internal")),
        };
        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok());
        match code_for_status(status) {
            None => break response,
            // Exponential backoff with jitter, at most two retries (WP15.2).
            Some("rate_limited" | "overloaded") if attempt < RETRIES => {
                attempt += 1;
                let jitter = (std::process::id() as u64 + attempt as u64 * 37) % 100;
                let wait = retry_after.map(|s| s.min(2) * 1000).unwrap_or(200 * 2u64.pow(attempt) + jitter);
                sleep(Duration::from_millis(wait)).await;
            }
            Some(code) => {
                return emit(PrompterEvent::Error { code, retry_after_seconds: retry_after });
            }
        }
    };
    let mut bytes = response.bytes_stream();
    let mut parser = SseParser::default();
    while let Some(chunk) = bytes.next().await {
        match chunk {
            Ok(b) => {
                for event in parser.push(&b) {
                    emit(PrompterEvent::Event { event });
                }
            }
            Err(_) => return emit(error("offline")),
        }
    }
    emit(PrompterEvent::End);
}

/// Waits without blocking the async runtime (Tauri's runtime is Tokio; the spike doesn't name it).
async fn sleep(d: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_each_status_to_one_code() {
        assert_eq!(code_for_status(200), None);
        assert_eq!(code_for_status(401), Some("key_revoked"));
        assert_eq!(code_for_status(402), Some("no_credit"));
        assert_eq!(code_for_status(429), Some("rate_limited"));
        assert_eq!(code_for_status(529), Some("overloaded"));
        assert_eq!(code_for_status(418), Some("internal"));
    }

    #[test]
    fn events_serialise_to_the_contract_shape() {
        let e = serde_json::to_value(PrompterEvent::Error { code: "rate_limited", retry_after_seconds: Some(3) }).unwrap();
        assert_eq!(e, serde_json::json!({ "type": "error", "code": "rate_limited", "retryAfterSeconds": 3 }));
        assert_eq!(serde_json::to_value(PrompterEvent::End).unwrap(), serde_json::json!({ "type": "end" }));
        let ev = serde_json::to_value(PrompterEvent::Event { event: serde_json::json!({ "type": "ping" }) }).unwrap();
        assert_eq!(ev, serde_json::json!({ "type": "event", "event": { "type": "ping" } }));
    }
}
