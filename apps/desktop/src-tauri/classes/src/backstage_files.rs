//! What the app's `backstage` protocol serves from the shipped Backstage (decision 0062, spec 05
//! section 7): the rules, kept here so they're tested on any runner. The protocol itself is in
//! the app (`src/backstage.rs`).

/// The longest path the protocol serves.
const PATH_LIMIT: usize = 255;

/// A path inside the shipped Backstage that may be served: `/` between parts, each part letters,
/// digits, `.`, `_` and `-`, never `.` or `..`, and not starting with a dot. Anything else,
/// including anything percent-encoded, is not found.
pub fn is_served(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= PATH_LIMIT
        && path.split('/').all(|part| {
            !part.is_empty()
                && !part.starts_with('.')
                && part.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
        })
}

/// The content type for a file the Backstage ships.
pub fn content_type(path: &str) -> &'static str {
    let extension = path.rsplit_once('.').map(|(_, ext)| ext.to_ascii_lowercase()).unwrap_or_default();
    match extension.as_str() {
        "json" => "application/json",
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        "bin" => "application/octet-stream",
        "webp" => "image/webp",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "ktx2" => "image/ktx2",
        "svg" => "image/svg+xml",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serves_plain_paths_inside_the_backstage() {
        for path in ["backstage.json", "models/kaykit/Biped/knight.glb", "thumbnails/osa_Biped_teddy.webp", "sketches/p01/front.svg", "prompter-catalogue.txt"] {
            assert!(is_served(path), "{path}");
        }
    }

    #[test]
    fn serves_nothing_that_could_leave_it() {
        for path in ["", "/backstage.json", "../tauri.conf.json", "models/../../x", "a//b", ".hidden", "models/.git/config", "%2e%2e/x", "a\\b", "a b.glb", "C:/x", "models/x.glb?y", &"x".repeat(256)] {
            assert!(!is_served(path), "{path:?}");
        }
    }

    #[test]
    fn says_what_each_file_is() {
        assert_eq!(content_type("backstage.json"), "application/json");
        assert_eq!(content_type("models/a/B/c.GLB"), "model/gltf-binary");
        assert_eq!(content_type("thumbnails/x.webp"), "image/webp");
        assert_eq!(content_type("sketches/x.svg"), "image/svg+xml");
        assert_eq!(content_type("no-extension"), "application/octet-stream");
    }
}
