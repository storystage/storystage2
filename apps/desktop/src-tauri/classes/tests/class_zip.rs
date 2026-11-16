//! Collect and Hand back as one zip (decision 0070): what's written, and every way a zip that
//! comes back is refused (spec 15 sections 3.1 and 3.2).

use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use storystage_classes::class_zip::{write_film_zip, ClassZip, ClassZipWriter, ENTRY_LIMIT};
use storystage_classes::picked::film_parts;
use storystage_classes::Code;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        static COUNT: AtomicU64 = AtomicU64::new(0);
        let name = format!("storystage-zip-{}-{}", std::process::id(), COUNT.fetch_add(1, Ordering::Relaxed));
        let path = std::env::temp_dir().join(name);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    fn zip(&self) -> PathBuf {
        self.0.join("class.zip")
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// A zip made by something other than StoryStage: entries as given, stored or deflated.
fn handmade(path: &PathBuf, entries: &[(&str, &[u8])], method: CompressionMethod) {
    let mut zip = ZipWriter::new(File::create(path).unwrap());
    let options = SimpleFileOptions::default().compression_method(method);
    for (name, bytes) in entries {
        zip.start_file(*name, options).unwrap();
        zip.write_all(bytes).unwrap();
    }
    zip.finish().unwrap();
}

fn names(found: &[storystage_classes::class_zip::ZipFound]) -> Vec<String> {
    found.iter().map(|f| format!("{}/{}", f.folder, f.file)).collect()
}

#[test]
fn collects_a_folder_per_pupil_and_hands_it_back() {
    let scratch = Scratch::new();
    let mut writer = ClassZipWriter::create(&scratch.zip()).unwrap();
    writer.add("Zoë", "The Owl.storystage", b"owl").unwrap();
    writer.add("Ava", "Film.storystage", b"film").unwrap();
    writer.finish().unwrap();

    let (mut zip, found) = ClassZip::open(&scratch.zip()).unwrap();
    assert_eq!(names(&found), ["Ava/Film.storystage", "Zoë/The Owl.storystage"]);
    assert_eq!(zip.read(&found[1]).unwrap(), b"owl");
    assert_eq!(zip.read(&found[0]).unwrap(), b"film");
}

#[test]
fn writes_only_plain_names_and_never_one_twice() {
    let scratch = Scratch::new();
    let mut writer = ClassZipWriter::create(&scratch.zip()).unwrap();
    for (folder, file) in [("..", "Film.storystage"), ("Ava", "../Film.storystage"), ("a/b", "Film.storystage"), ("Ava", "Film.exe"), ("con", "Film.storystage")] {
        assert_eq!(writer.add(folder, file, b"x"), Err(Code::Invalid), "{folder}/{file}");
    }
    writer.add("Sam", "Pip.storystage", b"x").unwrap();
    assert_eq!(writer.add("sam", "pip.storystage", b"y"), Err(Code::Invalid));
    writer.finish().unwrap();
}

#[test]
fn hands_back_only_films_one_level_down_and_reads_a_rezipped_folder() {
    let scratch = Scratch::new();
    // As Windows' "Send to compressed folder" makes it: deflated, with folders and other files.
    let film: Vec<u8> = (0..2 * 1024 * 1024u32).map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8).collect();
    handmade(
        &scratch.zip(),
        &[
            ("Ava/", b""),
            ("Ava/Film.storystage", &film),
            ("Ava/notes.txt", b"not a film"),
            ("Ava/old/Older.storystage", b"too deep"),
            ("loose.storystage", b"not in a folder"),
            ("__MACOSX/Ava/._Film.storystage", b"mac"),
        ],
        CompressionMethod::Deflated,
    );
    let (mut zip, found) = ClassZip::open(&scratch.zip()).unwrap();
    assert_eq!(names(&found), ["Ava/Film.storystage"]);
    assert_eq!(zip.read(&found[0]).unwrap(), film);
}

#[test]
fn refuses_the_whole_zip_for_any_name_that_could_escape_or_clash() {
    for bad in ["../Ava/Film.storystage", "/Ava/Film.storystage", "C:/Ava/Film.storystage", "Ava\\Film.storystage", "con/Film.storystage", "Ava./Film.storystage", "Ava /Film.storystage", "Ava/Fi\u{7}lm.storystage"] {
        let scratch = Scratch::new();
        handmade(&scratch.zip(), &[("Ben/Owl.storystage", b"ok"), (bad, b"x")], CompressionMethod::Stored);
        assert_eq!(ClassZip::open(&scratch.zip()).err(), Some(Code::Unreadable), "{bad}");
    }
    let scratch = Scratch::new();
    handmade(&scratch.zip(), &[("Sam/Pip.storystage", b"a"), ("sam/pip.storystage", b"b")], CompressionMethod::Stored);
    assert_eq!(ClassZip::open(&scratch.zip()).err(), Some(Code::Unreadable), "a clash ignoring case");
}

#[test]
fn refuses_a_link_in_the_zip() {
    let scratch = Scratch::new();
    let mut zip = ZipWriter::new(File::create(scratch.zip()).unwrap());
    zip.add_symlink("Ava/Film.storystage", "/etc/passwd", SimpleFileOptions::default()).unwrap();
    zip.finish().unwrap();
    assert_eq!(ClassZip::open(&scratch.zip()).err(), Some(Code::Unreadable));
}

#[test]
fn stops_a_zip_bomb_while_reading() {
    let scratch = Scratch::new();
    let zeros = vec![0u8; 4 * 1024 * 1024];
    handmade(&scratch.zip(), &[("Ava/Film.storystage", &zeros)], CompressionMethod::Deflated);
    let (mut zip, found) = ClassZip::open(&scratch.zip()).unwrap();
    assert_eq!(zip.read(&found[0]), Err(Code::Unreadable));
}

#[test]
fn refuses_too_many_entries() {
    let scratch = Scratch::new();
    let names: Vec<String> = (0..=ENTRY_LIMIT).map(|i| format!("Ava/{i}.txt")).collect();
    let entries: Vec<(&str, &[u8])> = names.iter().map(|name| (name.as_str(), &b""[..])).collect();
    handmade(&scratch.zip(), &entries, CompressionMethod::Stored);
    assert_eq!(ClassZip::open(&scratch.zip()).err(), Some(Code::Unreadable));
}

#[test]
fn says_unreadable_for_a_file_that_isnt_a_zip() {
    let scratch = Scratch::new();
    fs::write(scratch.zip(), b"not a zip at all").unwrap();
    assert_eq!(ClassZip::open(&scratch.zip()).err(), Some(Code::Unreadable));
}

#[test]
fn a_film_zips_with_its_captions_side_by_side() {
    let scratch = Scratch::new();
    let path = scratch.0.join("film.zip");
    let body = b"videoWEBVTT1";
    let parts = film_parts("mp4:5,vtt:6,srt:1", body.len()).unwrap();
    write_film_zip(&path, "Our film", body, &parts).unwrap();
    let mut zip = zip::ZipArchive::new(File::open(&path).unwrap()).unwrap();
    let mut found = Vec::new();
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).unwrap();
        let name = entry.name().unwrap().to_string();
        let mut text = String::new();
        std::io::Read::read_to_string(&mut entry, &mut text).unwrap();
        found.push(format!("{name}={text}"));
    }
    assert_eq!(found, ["Our film.mp4=video", "Our film.vtt=WEBVTT", "Our film.srt=1"]);
    for name in ["con", "a/b", "", "Our film.mp4"] {
        assert_eq!(write_film_zip(&path, name, body, &parts), Err(Code::Invalid), "should be refused: {name:?}");
    }
    assert_eq!(write_film_zip(&path, "Our film", b"short", &parts), Err(Code::Invalid));
}
