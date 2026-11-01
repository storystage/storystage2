//! What happens to a key once it's been typed (spec 05 sections 1.2, 1.3). The dialogs are in
//! the app, and they can only be tried by hand, so everything that can go wrong after them is
//! here, where it can be tested.

use crate::{check_key, Key, KeyCheck};

/// What `key_add` tells the studio. It never says anything about the key itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Saved,
    Cancelled,
    NotAccepted,
    NoClaudeAccess,
    Unreachable,
    StoreUnavailable,
}

impl Outcome {
    /// The word the studio gets (spec 05 section 1.3).
    pub fn name(self) -> &'static str {
        match self {
            Self::Saved => "saved",
            Self::Cancelled => "cancelled",
            Self::NotAccepted => "notAccepted",
            Self::NoClaudeAccess => "noClaudeAccess",
            Self::Unreachable => "unreachable",
            Self::StoreUnavailable => "storeUnavailable",
        }
    }
}

/// Checks what was typed, and stores it only if the check passes. `typed` is `None` if the
/// adult closed the dialog. `save` is the platform's secure store.
pub async fn add_key(
    url: &str,
    typed: Option<String>,
    save: impl FnOnce(&Key) -> bool,
) -> Outcome {
    let Some(key) = typed.and_then(Key::new) else {
        return Outcome::Cancelled;
    };
    match check_key(url, &key).await {
        KeyCheck::Works => {
            if save(&key) {
                Outcome::Saved
            } else {
                Outcome::StoreUnavailable
            }
        }
        KeyCheck::NotAccepted => Outcome::NotAccepted,
        KeyCheck::NoClaudeAccess => Outcome::NoClaudeAccess,
        KeyCheck::Unreachable => Outcome::Unreachable,
    }
}
