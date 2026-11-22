# 0065 Where a pupil's work lives between lessons

- **Status:** settled, to be confirmed after the TR1 lessons and IT managers (1.11)
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answers in the S8 session, on the WP24.2 options paper (`wp24.2-work-between-lessons.md`, #179)

## Decision

- **Pupil folders in the app, by default.** The teacher adds the class once (screen 11), and each pupil opens their own folder by choosing their name. Autosave keeps work there. The folders live inside the device user's own app data, so where a school has per-pupil sign-in, the operating system keeps pupils apart as well.
- **Work moves between devices through files.** The teacher can **Collect** a class's work into a folder and **Hand back** from one: on the device, a school drive, OneDrive or Google Drive, through the system's file picker. A pupil can **Save a copy to** and **Open** a file the same way. StoryStage itself has no sign-in.
- **No signed-in cloud saving in the first release.** Workplan 8.5 (StoryStage signing in to Google or Microsoft itself) moves to the roadmap.
- **Decided now so save and open (8.4) can be built, and confirmed after 1.11.** If the TR1 lessons show pupils rarely get the same device, files become the main route.

## What follows

- **S4 (8.4):** autosave writes to the pupil's folder; the production list is per folder.
- **S5:** **Pupils and folders** on screen 11, a name picker at the start of a lesson, and **Collect** and **Hand back** in Settings.
- **S8 (24.4):** the folders' storage and separation, Collect and Hand back, and threat rows PS1 to PS6 (spec 15 section 2.10).
- **D (17.3):** the class list on the device, and that folders don't stop a determined pupil reading files on a shared desktop login. Nothing new for files in the school's own storage.
- **The owner (1.11):** also ask whether a pupil gets the same device each lesson.
