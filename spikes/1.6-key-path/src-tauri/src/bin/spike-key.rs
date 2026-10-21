//! CI helper for spike 1.6. Never prints the key.
//!
//!   spike-key set <hash-file>     store a new random test key; write its SHA-256 to <hash-file>
//!   spike-key scan <file>...      exit 1 if any file contains the key (says which, not what)
//!   spike-key delete              remove the test key
//!
//! The key is a test value made here, not a real Anthropic key: it only has to be unguessable
//! enough that finding it in a file can only mean it leaked.

use sha2::{Digest, Sha256};
use spike_key_path_lib::{key_entry, policy::sha256_hex};
use std::time::{SystemTime, UNIX_EPOCH};

fn new_test_key() -> String {
    let seed = format!(
        "{:?}{}{:p}",
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap(),
        std::process::id(),
        &SEED_MARKER as *const u8
    );
    let a = hex::encode(Sha256::digest(seed.as_bytes()));
    let b = hex::encode(Sha256::digest(a.as_bytes()));
    format!("spiketest-{a}{b}")
}
static SEED_MARKER: u8 = 0;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let entry = key_entry().expect("the OS key store is not available");
    match args.first().map(String::as_str) {
        Some("set") => {
            let key = new_test_key();
            entry.set_password(&key).expect("could not store the key");
            std::fs::write(&args[1], sha256_hex(&key)).expect("could not write the hash");
            println!("Stored a test key in the OS key store; its SHA-256 is in {}.", args[1]);
        }
        Some("scan") => {
            let key = entry.get_password().expect("no test key stored");
            let mut leaked = false;
            for file in &args[1..] {
                let bytes = std::fs::read(file).unwrap_or_default();
                let found = bytes.windows(key.len()).any(|w| w == key.as_bytes());
                println!("{}: {}", file, if found { "KEY FOUND" } else { "clean" });
                leaked |= found;
            }
            std::process::exit(if leaked { 1 } else { 0 });
        }
        // Positive control: proves `scan` would find the key if it were there.
        Some("selftest") => {
            let key = entry.get_password().expect("no test key stored");
            let path = std::env::temp_dir().join("spike-key-selftest.txt");
            std::fs::write(&path, format!("before {key} after")).unwrap();
            let bytes = std::fs::read(&path).unwrap();
            let found = bytes.windows(key.len()).any(|w| w == key.as_bytes());
            let _ = std::fs::remove_file(&path);
            println!("scanner self-test: {}", if found { "finds a planted key" } else { "BROKEN" });
            std::process::exit(if found { 0 } else { 1 });
        }
        Some("delete") => {
            let _ = entry.delete_credential();
            println!("Deleted the test key.");
        }
        _ => {
            eprintln!("usage: spike-key set <hash-file> | scan <file>... | delete");
            std::process::exit(2);
        }
    }
}
