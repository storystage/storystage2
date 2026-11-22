//! Files and folders the person picked (spec 05 section 6.5), on the real file system.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use storystage_classes::picked::{
    collect, decode_header, film_parts, film_stem, hand_back, is_plain_name, is_production_name, read, save,
    save_film, FilmPart, Found,
};
use storystage_classes::{Code, FILE_LIMIT};

struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        static COUNT: AtomicU64 = AtomicU64::new(0);
        let name = format!("storystage-picked-{}-{}", std::process::id(), COUNT.fetch_add(1, Ordering::Relaxed));
        let path = std::env::temp_dir().join(name);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn plain_names_are_what_the_studio_gives() {
    // What `safeFileName` gives for device names (S4's review of #218) must pass too.
    for name in ["Ava", "Zoë O’Brien", "The Owl (2).storystage", "con_", "陈 小明", "a.b", "CON_", "con_.txt", "Aux_. notes", "nul_.storystage", "Con_.txt"] {
        assert!(is_plain_name(name), "should be plain: {name}");
    }
    let long = "x".repeat(81);
    for name in ["", ".", "..", ".hidden", "a/b", "a\\b", "a:b", "a\tb", "trailing.", "trailing ", " leading", "con", "NUL.txt", "Com1", "con.txt_", "Aux. notes_", "nul.storystage_", "con .txt", long.as_str()] {
        assert!(!is_plain_name(name), "should be refused: {name:?}");
    }
    assert!(is_production_name("Film.storystage"));
    assert!(!is_production_name(".storystage"));
    assert!(!is_production_name("Film.txt"));
}

#[test]
fn saves_a_whole_file_and_reads_it_back() {
    let scratch = Scratch::new();
    let path = scratch.0.join("The Owl.storystage");
    save(&path, b"one").unwrap();
    save(&path, b"two").unwrap();
    assert_eq!(read(&path), Ok(b"two".to_vec()));
    assert_eq!(fs::read_dir(&scratch.0).unwrap().count(), 1, "no temporary file is left");
    assert_eq!(save(&scratch.0, b"x"), Err(Code::Unreadable), "a folder isn't overwritten");
    assert_eq!(read(&scratch.0), Err(Code::Unreadable));
}

#[test]
fn refuses_a_file_over_the_limit() {
    let scratch = Scratch::new();
    assert_eq!(save(&scratch.0.join("big.storystage"), &vec![0u8; FILE_LIMIT + 1]), Err(Code::TooBig));
    let big = scratch.0.join("big.storystage");
    fs::File::create(&big).unwrap().set_len(FILE_LIMIT as u64 + 1).unwrap();
    assert_eq!(read(&big), Err(Code::TooBig));
}

#[test]
fn collects_into_one_folder_per_pupil_and_nowhere_else() {
    let scratch = Scratch::new();
    collect(&scratch.0, "Ava", "Film.storystage", b"a").unwrap();
    collect(&scratch.0, "Ava", "Owl.storystage", b"b").unwrap();
    collect(&scratch.0, "Ben", "Film.storystage", b"c").unwrap();
    assert_eq!(fs::read(scratch.0.join("Ava").join("Owl.storystage")).unwrap(), b"b");
    for (folder, file) in [("..", "Film.storystage"), ("Ava", "../Film.storystage"), ("a/b", "Film.storystage"), ("Ava", "Film.exe"), ("con", "Film.storystage")] {
        assert_eq!(collect(&scratch.0, folder, file, b"x"), Err(Code::Invalid), "{folder}/{file}");
    }
    assert!(!scratch.0.parent().unwrap().join("Film.storystage").exists());
}

#[test]
fn hands_back_what_is_one_level_down_and_nothing_else() {
    let scratch = Scratch::new();
    collect(&scratch.0, "Ava", "Film.storystage", b"a").unwrap();
    collect(&scratch.0, "Ben", "Owl.storystage", b"b").unwrap();
    fs::write(scratch.0.join("loose.storystage"), b"c").unwrap();
    fs::write(scratch.0.join("Ben").join("notes.txt"), b"d").unwrap();
    fs::create_dir_all(scratch.0.join("Ben").join("old")).unwrap();
    fs::write(scratch.0.join("Ben").join("old").join("Older.storystage"), b"e").unwrap();
    let found = hand_back(&scratch.0).unwrap();
    let names: Vec<String> = found.iter().map(|Found { folder, file, .. }| format!("{folder}/{file}")).collect();
    assert_eq!(names, ["Ava/Film.storystage", "Ben/Owl.storystage"]);
    assert_eq!(read(&found[1].path), Ok(b"b".to_vec()));
}

#[test]
fn hands_back_nothing_if_any_file_is_over_the_limit() {
    let scratch = Scratch::new();
    collect(&scratch.0, "Ava", "Film.storystage", b"a").unwrap();
    fs::create_dir_all(scratch.0.join("Ben")).unwrap();
    fs::File::create(scratch.0.join("Ben").join("Huge.storystage")).unwrap().set_len(FILE_LIMIT as u64 + 1).unwrap();
    assert_eq!(hand_back(&scratch.0), Err(Code::TooBig));
}

#[test]
fn decodes_names_from_a_header() {
    assert_eq!(decode_header("Zo%C3%AB%20O%E2%80%99Brien").as_deref(), Some("Zoë O’Brien"));
    assert_eq!(decode_header("Ava%2FFilm.storystage").as_deref(), Some("Ava/Film.storystage"));
    assert_eq!(decode_header("%E2%82"), None, "not UTF-8");
    assert_eq!(decode_header("%G1"), None);
    assert_eq!(decode_header("%4"), None);
}

#[cfg(unix)]
#[test]
fn never_follows_a_link_out_of_the_picked_folder() {
    let scratch = Scratch::new();
    let outside = scratch.0.join("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("Secret.storystage"), b"secret").unwrap();
    let chosen = scratch.0.join("chosen");
    fs::create_dir_all(&chosen).unwrap();
    std::os::unix::fs::symlink(&outside, chosen.join("Ava")).unwrap();
    assert_eq!(hand_back(&chosen), Ok(vec![]));
    assert_eq!(collect(&chosen, "Ava", "Film.storystage", b"x"), Err(Code::Unreadable));
    assert!(!outside.join("Film.storystage").exists());
}

fn part(extension: &str, start: usize, end: usize) -> FilmPart {
    FilmPart { extension: extension.to_string(), start, end }
}

#[test]
fn a_films_files_are_read_from_their_list() {
    assert_eq!(
        film_parts("mp4:5,vtt:6,srt:1", 12),
        Ok(vec![part("mp4", 0, 5), part("vtt", 5, 11), part("srt", 11, 12)])
    );
    assert_eq!(film_parts("mp4:0", 0), Ok(vec![part("mp4", 0, 0)]));
    let over = format!("mp4:{}", FILE_LIMIT + 1);
    assert_eq!(film_parts(&over, FILE_LIMIT + 1), Err(Code::TooBig));
    assert_eq!(film_parts("mp4:99999999999999999999999", 1), Err(Code::TooBig));
    for list in ["", "mp4", "mp4:", "mp4:-1", "mp4:+1", "mov:1", "MP4:1", "mp4:1,mp4:1", "mp4:1,", "storystage:1"] {
        assert_eq!(film_parts(list, 1), Err(Code::Invalid), "should be refused: {list:?}");
    }
    assert_eq!(film_parts("mp4:5,vtt:6", 12), Err(Code::Invalid), "a body longer than its list");
    assert_eq!(film_parts("mp4:5,vtt:6", 10), Err(Code::Invalid), "a body shorter than its list");
}

#[test]
fn a_films_name_is_the_one_chosen_without_its_extension() {
    let parts = [part("mp4", 0, 1), part("vtt", 1, 2)];
    assert_eq!(film_stem("Our film.mp4", &parts).as_deref(), Some("Our film"));
    assert_eq!(film_stem("Our film.MP4", &parts).as_deref(), Some("Our film"));
    assert_eq!(film_stem("Our film", &parts).as_deref(), Some("Our film"));
    assert_eq!(film_stem("Zoë’s owl.mp4", &parts).as_deref(), Some("Zoë’s owl"));
    for chosen in [".mp4", "con.mp4", "a/b.mp4", "", "trailing .mp4"] {
        assert_eq!(film_stem(chosen, &parts), None, "should be refused: {chosen:?}");
    }
    assert_eq!(film_stem("x".repeat(77).as_str(), &parts), None, "too long once .mp4 is added");
}

#[test]
fn saves_a_film_with_its_captions_beside_it() {
    let scratch = Scratch::new();
    let body = b"videoWEBVTT1";
    let parts = film_parts("mp4:5,vtt:6,srt:1", body.len()).unwrap();
    fs::write(scratch.0.join("Our film.vtt"), b"old captions").unwrap();
    save_film(&scratch.0.join("Our film.MP4"), body, &parts).unwrap();
    assert_eq!(fs::read(scratch.0.join("Our film.mp4")).unwrap(), b"video");
    assert_eq!(fs::read(scratch.0.join("Our film.vtt")).unwrap(), b"WEBVTT", "captions of the same name replaced");
    assert_eq!(fs::read(scratch.0.join("Our film.srt")).unwrap(), b"1");
    let mut names: Vec<String> =
        fs::read_dir(&scratch.0).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
    names.sort();
    assert_eq!(names, ["Our film.mp4", "Our film.srt", "Our film.vtt"], "no temporary file is left");
}

#[test]
fn refuses_a_film_it_cant_name_or_whose_body_doesnt_match() {
    let scratch = Scratch::new();
    let parts = film_parts("mp4:5", 5).unwrap();
    assert_eq!(save_film(&scratch.0.join("con.mp4"), b"video", &parts), Err(Code::Invalid));
    assert_eq!(save_film(&scratch.0.join("Film.mp4"), b"video!", &parts), Err(Code::Invalid));
    fs::create_dir(scratch.0.join("Film.mp4")).unwrap();
    assert_eq!(save_film(&scratch.0.join("Film.mp4"), b"video", &parts), Err(Code::Unreadable));
    assert_eq!(fs::read_dir(&scratch.0).unwrap().count(), 1, "nothing else was written");
}
