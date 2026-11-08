//! The Claude transport (WP15.2, spec 05 sections 2.1, 2.2 and 2.5). This crate is the only code
//! that handles the key. It runs after the gate has passed a request, adds the key, streams the
//! reply and reports one code per cause. No API here returns the key.

pub mod key;
mod stream;

pub use key::Key;
pub use stream::{check_key, send, KeyCheck, ANTHROPIC};
