//! Sends one checked request and streams the reply (spec 05 section 2.5).

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::{Client, Response, StatusCode};
use storystage_gate::retry::wait_ms;
use storystage_gate::sse::SseParser;
use storystage_gate::{code_for_status, Code, PrompterEvent, PrompterRequest};
use tokio::sync::watch;
use tokio::time::{sleep, timeout};

use crate::Key;

/// Where the key may go. Only a test build can change it (spec 05 section 2.2).
pub const ANTHROPIC: &str = "https://api.anthropic.com";

const API_VERSION: &str = "2023-06-01";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const SILENCE_TIMEOUT: Duration = Duration::from_secs(120);

fn base_url(given: &str) -> &str {
    if cfg!(feature = "test-endpoint") {
        given
    } else {
        ANTHROPIC
    }
}

fn client() -> Option<Client> {
    Client::builder().connect_timeout(CONNECT_TIMEOUT).build().ok()
}

/// A number from 0 to 1, different for each device and each try.
fn jitter() -> f64 {
    let bits = RandomState::new().build_hasher().finish();
    (bits % 10_000) as f64 / 10_000.0
}

fn retry_after(response: &Response) -> Option<u64> {
    response.headers().get("retry-after")?.to_str().ok()?.trim().parse().ok()
}

fn request_error(error: &reqwest::Error) -> Code {
    if error.is_connect() || error.is_timeout() {
        Code::Offline
    } else {
        Code::Internal
    }
}

async fn post(client: &Client, url: &str, key: &Key, request: &PrompterRequest) -> Result<Response, reqwest::Error> {
    let mut builder = client
        .post(format!("{url}/v1/messages"))
        .header("anthropic-version", API_VERSION)
        .header("content-type", "application/json")
        .body(request.body.to_string());
    if !request.betas.is_empty() {
        builder = builder.header("anthropic-beta", request.betas.join(","));
    }
    builder.header("x-api-key", key.expose()).send().await
}

/// Resolves when `cancel` becomes true. If whoever could cancel has gone, it never resolves: a
/// closed channel mustn't stop a request that nobody asked to stop.
async fn cancelled(cancel: &mut watch::Receiver<bool>) {
    if cancel.wait_for(|stop| *stop).await.is_err() {
        std::future::pending::<()>().await;
    }
}

/// Gets a reply, retrying only here, before its first byte has been read.
async fn connect(
    client: &Client,
    url: &str,
    key: &Key,
    request: &PrompterRequest,
) -> Result<Response, PrompterEvent> {
    let mut attempt = 0;
    loop {
        let response = post(client, url, key, request)
            .await
            .map_err(|error| PrompterEvent::error(request_error(&error)))?;
        let status = response.status().as_u16();
        let Some(code) = code_for_status(status) else {
            return Ok(response);
        };
        let seconds = retry_after(&response);
        drop(response);
        attempt += 1;
        let wait = match code {
            Code::RateLimited | Code::Overloaded => wait_ms(attempt, seconds, jitter()),
            _ => None,
        };
        match wait {
            Some(wait) => sleep(Duration::from_millis(wait)).await,
            None => {
                return Err(PrompterEvent::Error {
                    code,
                    retry_after_seconds: seconds.filter(|_| code == Code::RateLimited),
                })
            }
        }
    }
}

async fn relay(response: Response, emit: &impl Fn(PrompterEvent)) -> PrompterEvent {
    let mut bytes = response.bytes_stream();
    let mut parser = SseParser::default();
    loop {
        let next = match timeout(SILENCE_TIMEOUT, bytes.next()).await {
            Ok(next) => next,
            Err(_) => return PrompterEvent::error(Code::Offline),
        };
        match next {
            Some(Ok(chunk)) => {
                for event in parser.push(&chunk) {
                    emit(PrompterEvent::Event { event });
                }
            }
            Some(Err(_)) => return PrompterEvent::error(Code::Offline),
            None => return PrompterEvent::End,
        }
    }
}

/// Sends one request. `emit` gets every event, and always ends with exactly one `End` or
/// `Error`. Only call this with a request the gate has passed.
pub async fn send(
    url: &str,
    key: &Key,
    request: &PrompterRequest,
    mut cancel: watch::Receiver<bool>,
    emit: impl Fn(PrompterEvent),
) {
    let Some(client) = client() else {
        return emit(PrompterEvent::error(Code::Internal));
    };
    let url = base_url(url);
    let work = async {
        match connect(&client, url, key, request).await {
            Ok(response) => relay(response, &emit).await,
            Err(event) => event,
        }
    };
    let last = tokio::select! {
        last = work => last,
        () = cancelled(&mut cancel) => PrompterEvent::error(Code::Cancelled),
    };
    emit(last);
}

/// What a check of a new key found (spec 05 section 1.3). It uses no tokens.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyCheck {
    Works,
    NotAccepted,
    NoClaudeAccess,
    Unreachable,
}

pub async fn check_key(url: &str, key: &Key) -> KeyCheck {
    let Some(client) = client() else {
        return KeyCheck::Unreachable;
    };
    let sent = client
        .get(format!("{}/v1/models", base_url(url)))
        .header("anthropic-version", API_VERSION)
        .header("x-api-key", key.expose())
        .send()
        .await;
    match sent.map(|response| response.status()) {
        Ok(status) if status.is_success() => KeyCheck::Works,
        Ok(StatusCode::UNAUTHORIZED) => KeyCheck::NotAccepted,
        Ok(StatusCode::FORBIDDEN | StatusCode::NOT_FOUND) => KeyCheck::NoClaudeAccess,
        _ => KeyCheck::Unreachable,
    }
}
