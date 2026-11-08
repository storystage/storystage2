//! The leak scan's helper (`apps/desktop/leak-scan`). Never prints the key.
//!
//!   test-key set <hash-file>   store a new random test key, and write a PBKDF2 value of it to
//!                              <hash-file>, for the fake server to compare against
//!   test-key scan <file>...    exit 1 if any file holds the key, saying which but not what
//!   test-key selftest          prove `scan` would find a planted key
//!   test-key delete            remove the test key
//!
//! The key is a test value made here, not a real one: it only has to be unguessable enough that
//! finding it in a file can only mean it leaked. Only a test build has this at all.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::num::NonZeroU32;

use ring::pbkdf2;
use storystage_transport::key;
use storystage_transport::Key;

/// The same as `fake-server.mjs`: PBKDF2-HMAC-SHA256, this salt, this many rounds, 32 bytes.
fn derive(text: &str) -> String {
    let rounds = NonZeroU32::new(100_000).expect("not zero");
    let mut out = [0u8; 32];
    let salt = b"storystage-leak-scan";
    pbkdf2::derive(pbkdf2::PBKDF2_HMAC_SHA256, rounds, salt, text.as_bytes(), &mut out);
    out.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn new_test_key() -> String {
    let part = || RandomState::new().build_hasher().finish();
    format!("leakscan{:016x}{:016x}{:016x}{:016x}", part(), part(), part(), part())
}

fn holds(bytes: &[u8], key: &[u8]) -> bool {
    bytes.windows(key.len()).any(|window| window == key)
}

fn stored() -> String {
    let key = key::load().expect("the store is unavailable").expect("no test key is stored");
    key.for_scanning().to_string()
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("set") => {
            let text = new_test_key();
            let derived = derive(&text);
            key::save(&Key::new(text).expect("the test key isn't empty")).expect("store refused");
            std::fs::write(&args[1], derived).expect("could not write the derived value");
            println!("Stored a test key. A PBKDF2 value of it is in {}.", args[1]);
        }
        Some("scan") => {
            let text = stored();
            let mut leaked = false;
            for file in &args[1..] {
                let found = holds(&std::fs::read(file).expect("file to scan"), text.as_bytes());
                println!("{file}: {}", if found { "KEY FOUND" } else { "clean" });
                leaked |= found;
            }
            std::process::exit(i32::from(leaked));
        }
        Some("selftest") => {
            let text = stored();
            let found = holds(format!("before {text} after").as_bytes(), text.as_bytes());
            println!("The scan {} a planted key.", if found { "finds" } else { "MISSES" });
            std::process::exit(i32::from(!found));
        }
        Some("delete") => {
            key::delete().expect("store refused");
            println!("Deleted the test key.");
        }
        _ => {
            eprintln!("usage: test-key set <hash-file> | scan <file>... | selftest | delete");
            std::process::exit(2);
        }
    }
}
