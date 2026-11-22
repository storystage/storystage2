//! The native store's rules (spec 05 sections 6.1 and 6.4), on the real file system.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use storystage_classes::{is_safe_part, Code, Store, FILE_LIMIT};

/// A new, empty folder for one test, removed when the test ends.
struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        static COUNT: AtomicU64 = AtomicU64::new(0);
        let name = format!("storystage-classes-{}-{}", std::process::id(), COUNT.fetch_add(1, Ordering::Relaxed));
        let path = std::env::temp_dir().join(name);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    /// The store, in a `classes` folder that doesn't exist yet.
    fn store(&self) -> Store {
        Store::new(self.0.join("classes"))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn path(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|part| part.to_string()).collect()
}

#[test]
fn safe_parts_match_the_studio() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!("../fixtures/parts.json")).unwrap();
    for part in fixture["safe"].as_array().unwrap() {
        assert!(is_safe_part(part.as_str().unwrap()), "should be safe: {part}");
    }
    for part in fixture["unsafe"].as_array().unwrap() {
        assert!(!is_safe_part(part.as_str().unwrap()), "should be refused: {part}");
    }
}

#[test]
fn reads_back_what_it_wrote_and_nothing_where_nothing_is() {
    let scratch = Scratch::new();
    let store = scratch.store();
    assert_eq!(store.read(&path(&["class.json"])), Ok(None));
    assert_eq!(store.read(&path(&["pupils", "pupil-a", "meta.json"])), Ok(None));
    store.write(&path(&["pupils", "pupil-a", "production-b", "meta.json"]), b"{}").unwrap();
    assert_eq!(store.read(&path(&["pupils", "pupil-a", "production-b", "meta.json"])), Ok(Some(b"{}".to_vec())));
    store.write(&path(&["pupils", "pupil-a", "production-b", "meta.json"]), b"{ }").unwrap();
    assert_eq!(store.read(&path(&["pupils", "pupil-a", "production-b", "meta.json"])), Ok(Some(b"{ }".to_vec())));
}

#[test]
fn refuses_every_unsafe_path_before_touching_anything() {
    let scratch = Scratch::new();
    let store = scratch.store();
    for bad in [vec![], path(&[".."]), path(&["pupils", "..", "x"]), path(&["A"]), path(&["con"]), path(&["a/b"])] {
        assert_eq!(store.write(&bad, b"x"), Err(Code::Internal));
        assert_eq!(store.read(&bad), Err(Code::Internal));
        assert_eq!(store.remove(&bad), Err(Code::Internal));
        assert_eq!(store.list(&bad), Err(Code::Internal));
        assert_eq!(store.r#move(&bad, &path(&["x"])), Err(Code::Internal));
    }
    assert!(!scratch.0.join("classes").exists(), "nothing should have been made");
}

#[test]
fn refuses_a_file_over_the_limit_before_writing() {
    let scratch = Scratch::new();
    let store = scratch.store();
    let big = vec![0u8; FILE_LIMIT + 1];
    assert_eq!(store.write(&path(&["pupils", "pupil-a", "v-1.storystage"]), &big), Err(Code::TooBig));
    assert!(!scratch.0.join("classes").exists());
}

#[test]
fn leaves_no_temporary_file_behind_and_lists_only_safe_names() {
    let scratch = Scratch::new();
    let store = scratch.store();
    store.write(&path(&["pupils", "pupil-a", "meta.json"]), b"1").unwrap();
    store.write(&path(&["pupils", "pupil-a", "v-1.storystage"]), b"2").unwrap();
    let folder = scratch.0.join("classes").join("pupils").join("pupil-a");
    fs::write(folder.join("Stray File.txt"), b"?").unwrap();
    fs::write(folder.join(".tmp-from-a-crash"), b"?").unwrap();
    assert_eq!(store.list(&path(&["pupils", "pupil-a"])), Ok(path(&["meta.json", "v-1.storystage"])));
    let on_disk = fs::read_dir(&folder).unwrap().count();
    assert_eq!(on_disk, 4, "two files, the stray one and the crash's");
    assert_eq!(store.list(&path(&["pupils", "pupil-z"])), Ok(vec![]));
}

#[test]
fn removes_files_and_folders_and_is_fine_when_nothing_is_there() {
    let scratch = Scratch::new();
    let store = scratch.store();
    store.write(&path(&["bin", "pupil-a", "production-b", "meta.json"]), b"1").unwrap();
    store.write(&path(&["bin", "pupil-a", "production-b", "v-1.storystage"]), b"2").unwrap();
    store.remove(&path(&["bin", "pupil-a", "production-b", "v-1.storystage"])).unwrap();
    assert_eq!(store.list(&path(&["bin", "pupil-a", "production-b"])), Ok(path(&["meta.json"])));
    store.remove(&path(&["bin"])).unwrap();
    assert_eq!(store.list(&path(&["bin"])), Ok(vec![]));
    store.remove(&path(&["bin"])).unwrap();
    store.remove(&path(&["nothing", "here"])).unwrap();
}

#[test]
fn moves_a_folder_but_never_onto_something() {
    let scratch = Scratch::new();
    let store = scratch.store();
    store.write(&path(&["pupils", "pupil-a", "production-b", "meta.json"]), b"1").unwrap();
    store.r#move(&path(&["pupils", "pupil-a", "production-b"]), &path(&["bin", "pupil-a", "production-b"])).unwrap();
    assert_eq!(store.read(&path(&["bin", "pupil-a", "production-b", "meta.json"])), Ok(Some(b"1".to_vec())));
    assert_eq!(store.list(&path(&["pupils", "pupil-a"])), Ok(vec![]));

    store.write(&path(&["pupils", "pupil-a", "production-b", "meta.json"]), b"2").unwrap();
    assert_eq!(
        store.r#move(&path(&["pupils", "pupil-a", "production-b"]), &path(&["bin", "pupil-a", "production-b"])),
        Err(Code::Internal)
    );
    assert_eq!(store.read(&path(&["bin", "pupil-a", "production-b", "meta.json"])), Ok(Some(b"1".to_vec())));
    store.r#move(&path(&["pupils", "nobody"]), &path(&["bin", "nobody"])).unwrap();
}

#[test]
fn a_file_where_a_folder_should_be_is_unreadable() {
    let scratch = Scratch::new();
    let store = scratch.store();
    store.write(&path(&["pupils"]), b"not a folder").unwrap();
    assert_eq!(store.read(&path(&["pupils", "pupil-a"])), Err(Code::Unreadable));
    assert_eq!(store.write(&path(&["pupils", "pupil-a"]), b"x"), Err(Code::Unreadable));
    assert_eq!(store.list(&path(&["pupils"])), Err(Code::Unreadable));
    store.write(&path(&["bin", "pupil-a", "meta.json"]), b"x").unwrap();
    assert_eq!(store.read(&path(&["bin", "pupil-a"])), Err(Code::Unreadable));
}

/// A link inside the store, to a folder outside it with a file in it.
fn plant_link(scratch: &Scratch) -> Option<PathBuf> {
    let outside = scratch.0.join("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("meta.json"), b"secret").unwrap();
    let pupils = scratch.0.join("classes").join("pupils");
    fs::create_dir_all(&pupils).unwrap();
    let link = pupils.join("pupil-a");
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, &link).ok()?;
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&outside, &link).ok()?;
    Some(outside)
}

#[test]
fn never_follows_a_link() {
    let scratch = Scratch::new();
    let store = scratch.store();
    // Windows needs a privilege to make a link; without it there's nothing to test.
    let Some(outside) = plant_link(&scratch) else { return };
    assert_eq!(store.read(&path(&["pupils", "pupil-a", "meta.json"])), Err(Code::Unreadable));
    assert_eq!(store.write(&path(&["pupils", "pupil-a", "meta.json"]), b"x"), Err(Code::Unreadable));
    assert_eq!(store.list(&path(&["pupils", "pupil-a"])), Err(Code::Unreadable));
    assert_eq!(store.list(&path(&["pupils"])), Ok(vec![]), "a link isn't listed");
    assert_eq!(store.r#move(&path(&["pupils", "pupil-a"]), &path(&["bin", "pupil-a"])), Err(Code::Unreadable));
    store.remove(&path(&["pupils"])).unwrap();
    assert_eq!(fs::read(outside.join("meta.json")).unwrap(), b"secret", "only the link is removed");
}
