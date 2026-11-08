//! The optional model's download against a real local server (spec 05 section 5.3, threats M1
//! and M3): it's kept only if it matches its pin, and nothing is left behind otherwise.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use sha2::{Digest, Sha256};
use storystage_speech::{download, load_downloaded, Code, Model};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::watch;

const BODY: &[u8] = b"a stand-in for a speech model, long enough to come in pieces";

fn model() -> Model {
    Model {
        name: "test".to_string(),
        file: "test.bin".to_string(),
        bytes: BODY.len() as u64,
        sha256: hex::encode(Sha256::digest(BODY)),
        bundled: false,
    }
}

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let name = format!("storystage-download-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed));
        Self(std::env::temp_dir().join(name))
    }

    /// What's left in the folder, by name.
    fn left(&self) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(&self.0)
            .map(|entries| entries.filter_map(|e| e.ok()?.file_name().into_string().ok()).collect())
            .unwrap_or_default();
        names.sort();
        names
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// A server that answers every request with `head`, then `body`, then closes. With `hold`, it
/// waits after the first part of the body, so a test can cancel mid-download.
async fn serve(head: String, body: Vec<u8>, hold: bool) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/test.bin", listener.local_addr().unwrap());
    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            let (head, body) = (head.clone(), body.clone());
            tokio::spawn(async move {
                let mut request = [0u8; 4096];
                let _ = socket.read(&mut request).await;
                let _ = socket.write_all(head.as_bytes()).await;
                if hold {
                    let _ = socket.write_all(&body[..8]).await;
                    tokio::time::sleep(Duration::from_secs(30)).await;
                }
                let _ = socket.write_all(&body).await;
                let _ = socket.shutdown().await;
            });
        }
    });
    url
}

fn ok_with_length(length: usize) -> String {
    format!("HTTP/1.1 200 OK\r\ncontent-length: {length}\r\nconnection: close\r\n\r\n")
}

/// No length announced, so only the running count can stop a long reply.
const OK_NO_LENGTH: &str = "HTTP/1.1 200 OK\r\nconnection: close\r\n\r\n";

async fn run(url: &str, dir: &TempDir) -> (Result<(), Code>, Vec<(u64, u64)>) {
    let (_stop, cancel) = watch::channel(false);
    let progress = Mutex::new(Vec::new());
    let result = download(url, &model(), &dir.0, |received, total| progress.lock().unwrap().push((received, total)), cancel).await;
    (result, progress.into_inner().unwrap())
}

#[tokio::test]
async fn a_matching_download_is_kept_and_loads() {
    let url = serve(ok_with_length(BODY.len()), BODY.to_vec(), false).await;
    let dir = TempDir::new();
    let (result, progress) = run(&url, &dir).await;
    assert_eq!(result, Ok(()));
    assert_eq!(dir.left(), ["test.bin"]);
    assert_eq!(load_downloaded(&dir.0, &model()).unwrap(), BODY);
    assert_eq!(progress.last(), Some(&(BODY.len() as u64, BODY.len() as u64)));
}

#[tokio::test]
async fn the_wrong_bytes_are_refused_and_nothing_is_kept() {
    let mut changed = BODY.to_vec();
    changed[10] ^= 1;
    let url = serve(ok_with_length(changed.len()), changed, false).await;
    let dir = TempDir::new();
    assert_eq!(run(&url, &dir).await.0, Err(Code::CheckFailed));
    assert!(dir.left().is_empty(), "{:?}", dir.left());
}

#[tokio::test]
async fn a_different_announced_size_is_refused_before_anything_is_written() {
    let url = serve(ok_with_length(BODY.len() + 1), [BODY, b"!"].concat(), false).await;
    let dir = TempDir::new();
    let (result, progress) = run(&url, &dir).await;
    assert_eq!(result, Err(Code::CheckFailed));
    assert!(progress.is_empty());
    assert!(dir.left().is_empty());
}

#[tokio::test]
async fn a_reply_longer_than_the_pin_is_stopped() {
    let long: Vec<u8> = BODY.iter().copied().cycle().take(BODY.len() * 50).collect();
    let url = serve(OK_NO_LENGTH.to_string(), long, false).await;
    let dir = TempDir::new();
    let (result, progress) = run(&url, &dir).await;
    assert_eq!(result, Err(Code::CheckFailed));
    assert!(progress.iter().all(|(received, _)| *received <= BODY.len() as u64));
    assert!(dir.left().is_empty());
}

#[tokio::test]
async fn a_reply_shorter_than_the_pin_is_refused() {
    let url = serve(OK_NO_LENGTH.to_string(), BODY[..20].to_vec(), false).await;
    let dir = TempDir::new();
    assert_eq!(run(&url, &dir).await.0, Err(Code::CheckFailed));
    assert!(dir.left().is_empty());
}

#[tokio::test]
async fn a_file_not_on_the_server_is_offline() {
    let head = "HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\nconnection: close\r\n\r\n".to_string();
    let url = serve(head, Vec::new(), false).await;
    let dir = TempDir::new();
    assert_eq!(run(&url, &dir).await.0, Err(Code::Offline));
    assert!(dir.left().is_empty());
}

#[tokio::test]
async fn no_connection_is_offline() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/test.bin", listener.local_addr().unwrap());
    drop(listener);
    let dir = TempDir::new();
    assert_eq!(run(&url, &dir).await.0, Err(Code::Offline));
}

#[tokio::test]
async fn cancelling_stops_the_download_and_keeps_nothing() {
    let url = serve(ok_with_length(BODY.len()), BODY.to_vec(), true).await;
    let dir = TempDir::new();
    let (stop, cancel) = watch::channel(false);
    let dir_path = dir.0.clone();
    let task = tokio::spawn(async move { download(&url, &model(), &dir_path, |_, _| {}, cancel).await });
    tokio::time::sleep(Duration::from_millis(500)).await;
    stop.send(true).unwrap();
    let result = tokio::time::timeout(Duration::from_secs(5), task).await.expect("stopped in time").unwrap();
    assert_eq!(result, Err(Code::Cancelled));
    assert!(dir.left().is_empty(), "{:?}", dir.left());
}

#[tokio::test]
async fn a_bundled_model_is_never_downloaded() {
    let dir = TempDir::new();
    let (_stop, cancel) = watch::channel(false);
    let bundled = Model { bundled: true, ..model() };
    let hits = Arc::new(AtomicUsize::new(0));
    let seen = hits.clone();
    let result = download("http://127.0.0.1:9/never", &bundled, &dir.0, move |_, _| { seen.fetch_add(1, Ordering::SeqCst); }, cancel).await;
    assert_eq!(result, Err(Code::Internal));
    assert_eq!(hits.load(Ordering::SeqCst), 0);
}
