//! The transport against a real local server: each failure in spec 05 section 2.5, and the
//! retry storm from WP15's done-when.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use storystage_gate::{PrompterEvent, PrompterRequest};
use storystage_transport::{check_key, send, Key, KeyCheck};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::watch;

const OK_STREAM: &str = "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\nconnection: close\r\n\r\n\
    data: {\"type\":\"message_start\"}\n\ndata: {\"type\":\"message_stop\"}\n\n";

fn status(line: &str) -> String {
    format!("HTTP/1.1 {line}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n")
}

fn status_with_retry(line: &str, seconds: u64) -> String {
    format!("HTTP/1.1 {line}\r\nretry-after: {seconds}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n")
}

/// What the server saw of one request: its headers and when it arrived.
struct Seen {
    head: String,
    at: Instant,
}

struct Server {
    url: String,
    seen: Arc<Mutex<Vec<Seen>>>,
}

impl Server {
    fn hits(&self) -> usize {
        self.seen.lock().unwrap().len()
    }
}

async fn read_request(socket: &mut tokio::net::TcpStream) -> String {
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        let Ok(count) = socket.read(&mut chunk).await else { break };
        if count == 0 {
            break;
        }
        bytes.extend_from_slice(&chunk[..count]);
        let text = String::from_utf8_lossy(&bytes);
        if let Some(end) = text.find("\r\n\r\n") {
            let length = text[..end]
                .lines()
                .find_map(|line| line.to_ascii_lowercase().strip_prefix("content-length: ")?.parse::<usize>().ok())
                .unwrap_or(0);
            if bytes.len() >= end + 4 + length {
                return text[..end].to_string();
            }
        }
    }
    String::new()
}

/// A server that answers the nth request with `reply(n)`, counting from 0.
async fn serve(reply: impl Fn(usize) -> String + Send + Sync + 'static) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = seen.clone();
    let reply = Arc::new(reply);
    let count = Arc::new(AtomicUsize::new(0));
    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            let (log, reply, count) = (log.clone(), reply.clone(), count.clone());
            tokio::spawn(async move {
                let head = read_request(&mut socket).await;
                let number = count.fetch_add(1, Ordering::SeqCst);
                log.lock().unwrap().push(Seen { head, at: Instant::now() });
                let _ = socket.write_all(reply(number).as_bytes()).await;
                let _ = socket.shutdown().await;
            });
        }
    });
    Server { url, seen }
}

fn request(betas: &[&str]) -> PrompterRequest {
    PrompterRequest {
        id: "r1".to_string(),
        mode: "explain".to_string(),
        body: json!({ "model": "claude-opus-5-5", "stream": true }),
        betas: betas.iter().map(|beta| beta.to_string()).collect(),
    }
}

fn key() -> Key {
    Key::new("test-value".to_string()).unwrap()
}

async fn run(url: &str, betas: &[&str]) -> Vec<Value> {
    let (_stop, cancel) = watch::channel(false);
    let events = Arc::new(Mutex::new(Vec::new()));
    let log = events.clone();
    send(url, &key(), &request(betas), cancel, move |event: PrompterEvent| {
        log.lock().unwrap().push(serde_json::to_value(event).unwrap());
    })
    .await;
    Arc::try_unwrap(events).unwrap().into_inner().unwrap()
}

#[tokio::test]
async fn a_reply_streams_and_ends_once() {
    let server = serve(|_| OK_STREAM.to_string()).await;
    let events = run(&server.url, &[]).await;
    assert_eq!(
        events,
        vec![
            json!({ "type": "event", "event": { "type": "message_start" } }),
            json!({ "type": "event", "event": { "type": "message_stop" } }),
            json!({ "type": "end" }),
        ]
    );
    assert_eq!(server.hits(), 1);
}

#[tokio::test]
async fn the_key_and_betas_go_in_headers() {
    let server = serve(|_| OK_STREAM.to_string()).await;
    run(&server.url, &["one", "two"]).await;
    let seen = server.seen.lock().unwrap();
    let head = seen[0].head.to_ascii_lowercase();
    assert!(head.contains("x-api-key: test-value"), "{head}");
    assert!(head.contains("anthropic-version: 2023-06-01"));
    assert!(head.contains("anthropic-beta: one,two"));
}

#[tokio::test]
async fn no_betas_means_no_header() {
    let server = serve(|_| OK_STREAM.to_string()).await;
    run(&server.url, &[]).await;
    assert!(!server.seen.lock().unwrap()[0].head.to_ascii_lowercase().contains("anthropic-beta"));
}

#[tokio::test]
async fn each_status_reports_once_with_no_retry() {
    for (line, code) in [
        ("401 Unauthorized", "key_revoked"),
        ("403 Forbidden", "key_revoked"),
        ("402 Payment Required", "no_credit"),
        ("400 Bad Request", "internal"),
        ("404 Not Found", "internal"),
    ] {
        let server = serve(move |_| status(line)).await;
        assert_eq!(run(&server.url, &[]).await, vec![json!({ "type": "error", "code": code })]);
        assert_eq!(server.hits(), 1, "{line}");
    }
}

#[tokio::test]
async fn rate_limits_retry_twice_then_report_when_to_try_again() {
    let server = serve(|_| status_with_retry("429 Too Many Requests", 1)).await;
    let events = run(&server.url, &[]).await;
    assert_eq!(events, vec![json!({ "type": "error", "code": "rate_limited", "retryAfterSeconds": 1 })]);
    assert_eq!(server.hits(), 3);
}

#[tokio::test]
async fn overload_retries_twice_then_reports() {
    let server = serve(|_| status("529 Overloaded")).await;
    assert_eq!(run(&server.url, &[]).await, vec![json!({ "type": "error", "code": "overloaded" })]);
    assert_eq!(server.hits(), 3);
}

#[tokio::test]
async fn a_retry_that_works_streams_as_normal() {
    let server = serve(|number| match number {
        0 => status("429 Too Many Requests"),
        _ => OK_STREAM.to_string(),
    })
    .await;
    let events = run(&server.url, &[]).await;
    assert_eq!(events.last(), Some(&json!({ "type": "end" })));
    assert_eq!(server.hits(), 2);
}

#[tokio::test]
async fn a_long_retry_after_is_reported_without_waiting() {
    let server = serve(|_| status_with_retry("429 Too Many Requests", 120)).await;
    let started = Instant::now();
    let events = run(&server.url, &[]).await;
    assert_eq!(events, vec![json!({ "type": "error", "code": "rate_limited", "retryAfterSeconds": 120 })]);
    assert_eq!(server.hits(), 1);
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[tokio::test]
async fn no_connection_is_offline() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    assert_eq!(run(&url, &[]).await, vec![json!({ "type": "error", "code": "offline" })]);
}

#[tokio::test]
async fn a_stream_that_drops_is_offline_and_is_not_retried() {
    let server = serve(|_| {
        "HTTP/1.1 200 OK\r\ncontent-length: 5000\r\nconnection: close\r\n\r\n\
         data: {\"type\":\"message_start\"}\n\n"
            .to_string()
    })
    .await;
    let events = run(&server.url, &[]).await;
    assert_eq!(events.last(), Some(&json!({ "type": "error", "code": "offline" })));
    assert_eq!(server.hits(), 1);
}

#[tokio::test]
async fn cancelling_stops_a_retry_and_reports_once() {
    let server = serve(|_| status("429 Too Many Requests")).await;
    let (stop, cancel) = watch::channel(false);
    let events = Arc::new(Mutex::new(Vec::new()));
    let log = events.clone();
    let url = server.url.clone();
    let task = tokio::spawn(async move {
        send(&url, &key(), &request(&[]), cancel, move |event: PrompterEvent| {
            log.lock().unwrap().push(serde_json::to_value(event).unwrap());
        })
        .await;
    });
    tokio::time::sleep(Duration::from_millis(300)).await;
    stop.send(true).unwrap();
    task.await.unwrap();
    assert_eq!(*events.lock().unwrap(), vec![json!({ "type": "error", "code": "cancelled" })]);
    assert_eq!(server.hits(), 1);
}

#[tokio::test]
async fn nobody_left_to_cancel_does_not_stop_a_request() {
    let server = serve(|_| OK_STREAM.to_string()).await;
    let (stop, cancel) = watch::channel(false);
    drop(stop);
    let events = Arc::new(Mutex::new(Vec::new()));
    let log = events.clone();
    send(&server.url, &key(), &request(&[]), cancel, move |event: PrompterEvent| {
        log.lock().unwrap().push(serde_json::to_value(event).unwrap());
    })
    .await;
    assert_eq!(events.lock().unwrap().last(), Some(&json!({ "type": "end" })));
}

/// WP15's done-when: 30 simulated clients hitting rate limits back off without a retry storm.
#[tokio::test(flavor = "multi_thread")]
async fn thirty_clients_back_off_without_a_storm() {
    let server = serve(|_| status("429 Too Many Requests")).await;
    let started = Instant::now();
    let mut clients = Vec::new();
    for _ in 0..30 {
        let url = server.url.clone();
        clients.push(tokio::spawn(async move { run(&url, &[]).await }));
    }
    for client in clients {
        let events = client.await.unwrap();
        assert_eq!(events, vec![json!({ "type": "error", "code": "rate_limited" })]);
    }

    let seen = server.seen.lock().unwrap();
    assert_eq!(seen.len(), 90, "each client tries three times, and no more");

    // The first tries all land together. The retries mustn't: they spread over the jitter.
    let mut retries: Vec<Duration> = seen.iter().map(|hit| hit.at - started).collect();
    retries.sort_unstable();
    let first_retry = &retries[30..60];
    let spread = first_retry[29] - first_retry[0];
    assert!(spread > Duration::from_millis(400), "first retries came within {spread:?}");
    assert!(first_retry[0] >= Duration::from_millis(900), "nobody retried early");
}

#[tokio::test]
async fn a_new_key_is_checked_without_using_tokens() {
    for (line, expected) in [
        ("200 OK", KeyCheck::Works),
        ("401 Unauthorized", KeyCheck::NotAccepted),
        ("403 Forbidden", KeyCheck::NoClaudeAccess),
        ("404 Not Found", KeyCheck::NoClaudeAccess),
        ("500 Internal Server Error", KeyCheck::Unreachable),
    ] {
        let server = serve(move |_| status(line)).await;
        assert_eq!(check_key(&server.url, &key()).await, expected, "{line}");
        let seen = server.seen.lock().unwrap();
        assert!(seen[0].head.starts_with("GET /v1/models"), "{}", seen[0].head);
    }
}

#[tokio::test]
async fn no_connection_is_reported_for_a_new_key() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    assert_eq!(check_key(&url, &key()).await, KeyCheck::Unreachable);
}
