//! The key's type, and the OS secure store on Windows, macOS and iPad. Android's store is in the
//! app, because it needs Android Keystore through a plugin.

use std::fmt;

use zeroize::Zeroizing;

/// The key. Its memory is cleared when it's dropped, and it can't be printed.
pub struct Key(Zeroizing<String>);

impl Key {
    /// Trims what was typed or pasted. Empty text is no key.
    pub fn new(text: String) -> Option<Self> {
        let text = Zeroizing::new(text);
        let trimmed = text.trim();
        (!trimmed.is_empty()).then(|| Self(Zeroizing::new(trimmed.to_string())))
    }

    /// For the one header that needs it. Private to this crate.
    pub(crate) fn expose(&self) -> &str {
        &self.0
    }

    /// For Android's store, which is in a plugin rather than in this crate.
    #[cfg(target_os = "android")]
    pub fn for_android_store(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Key {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("(hidden)")
    }
}

#[cfg(not(target_os = "android"))]
pub use store::{delete, is_present, load, save};

#[cfg(not(target_os = "android"))]
mod store {
    use keyring::Entry;

    use super::Key;

    const SERVICE: &str = "StoryStage2";
    const ACCOUNT: &str = "anthropic-api-key";

    /// The store refused, or isn't there. There is no fallback (spec 05 section 2.1).
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct StoreUnavailable;

    fn entry(service: &str) -> Result<Entry, StoreUnavailable> {
        Entry::new(service, ACCOUNT).map_err(|_| StoreUnavailable)
    }

    pub fn save(key: &Key) -> Result<(), StoreUnavailable> {
        save_in(SERVICE, key)
    }

    pub fn load() -> Result<Option<Key>, StoreUnavailable> {
        load_from(SERVICE)
    }

    pub fn is_present() -> Result<bool, StoreUnavailable> {
        Ok(load()?.is_some())
    }

    /// Deleting a key that isn't there is fine.
    pub fn delete() -> Result<(), StoreUnavailable> {
        delete_from(SERVICE)
    }

    fn save_in(service: &str, key: &Key) -> Result<(), StoreUnavailable> {
        entry(service)?.set_password(key.expose()).map_err(|_| StoreUnavailable)
    }

    fn load_from(service: &str) -> Result<Option<Key>, StoreUnavailable> {
        match entry(service)?.get_password() {
            Ok(text) => Ok(Key::new(text)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(StoreUnavailable),
        }
    }

    fn delete_from(service: &str) -> Result<(), StoreUnavailable> {
        match entry(service)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(StoreUnavailable),
        }
    }

    #[cfg(all(test, any(windows, target_os = "macos")))]
    mod tests {
        use super::*;

        /// A test-only entry, so a run never touches a real key.
        #[test]
        fn store_read_replace_and_delete() {
            let service = format!("StoryStage2-test-{}", std::process::id());
            assert!(load_from(&service).unwrap().is_none());

            let first = Key::new("test-value-one".to_string()).unwrap();
            save_in(&service, &first).unwrap();
            assert_eq!(load_from(&service).unwrap().unwrap().expose(), "test-value-one");

            let second = Key::new("test-value-two".to_string()).unwrap();
            save_in(&service, &second).unwrap();
            assert_eq!(load_from(&service).unwrap().unwrap().expose(), "test-value-two");

            delete_from(&service).unwrap();
            assert!(load_from(&service).unwrap().is_none());
            delete_from(&service).unwrap();
        }
    }
}

#[cfg(not(target_os = "android"))]
pub use store::StoreUnavailable;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_key_is_never_printed() {
        let key = Key::new("sk-ant-test-value".to_string()).unwrap();
        assert_eq!(format!("{key:?}"), "(hidden)");
        assert_eq!(format!("{:?}", Some(&key)), "Some((hidden))");
    }

    #[test]
    fn what_was_pasted_is_trimmed() {
        assert_eq!(Key::new("  value\r\n".to_string()).unwrap().expose(), "value");
    }

    #[test]
    fn nothing_typed_is_no_key() {
        assert!(Key::new("   ".to_string()).is_none());
        assert!(Key::new(String::new()).is_none());
    }
}
