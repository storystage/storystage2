//! Managed app configuration on iPad (spec 05 section 3.2): the dictionary device management
//! writes into the app's user defaults.

use objc2_foundation::{ns_string, NSNumber, NSString, NSUserDefaults};

/// The settings the school pushed, as strings, so they get the same checks as a line in the
/// policy file (3.5). A value of any other type becomes text no key accepts, so it fails closed.
pub fn managed_configuration() -> Vec<(String, String)> {
    let defaults = NSUserDefaults::standardUserDefaults();
    let managed = defaults.dictionaryForKey(ns_string!("com.apple.configuration.managed"));
    let Some(managed) = managed else {
        return Vec::new();
    };
    let (keys, values) = managed.to_vecs();
    keys.iter()
        .zip(values.iter())
        .map(|(key, value)| {
            let text = if let Some(text) = value.downcast_ref::<NSString>() {
                text.to_string()
            } else if let Some(number) = value.downcast_ref::<NSNumber>() {
                number_as_text(number)
            } else {
                "unsupported".to_string()
            };
            (key.to_string(), text)
        })
        .collect()
}

/// A property list `true` arrives as an `NSNumber` of type `c`, and would otherwise read as `1`.
fn number_as_text(number: &NSNumber) -> String {
    match number.encoding() {
        objc2::Encoding::Char | objc2::Encoding::Bool => number.as_bool().to_string(),
        _ => number.stringValue().to_string(),
    }
}
