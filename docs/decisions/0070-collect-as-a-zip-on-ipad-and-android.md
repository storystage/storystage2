# 0070 Collect and Hand back as one zip on iPad and Android

- **Status:** settled
- **Decided:** 9 Nov 2026, by the owner
- **Source:** the owner's answer in the S8 session, while building the native file picker on iPad and Android (24.4)

## Context

Collect writes a folder per pupil into a folder the teacher picks, and Hand back reads one (decision 0065, spec 05 section 6.5). On iPad and Android, neither the system nor Tauri's dialog plugin lets an app pick a folder: only a file, to open or to save. Pupils' work is on those devices in schools with iPad carts and Android tablets.

## Decision

- **On iPad and Android, Collect saves one zip file**, with a folder per pupil inside, wherever the teacher picks it: the device, Files, Google Drive or OneDrive. **Hand back opens a zip** the same way.
- **Desktop and Chromebooks keep folders**, as now.
- The zip **stores** each film as it is, since a production is already compressed. Hand back also reads deflated zips, as Windows and macOS make when a teacher compresses a folder.
- Reading a zip that comes back follows spec 15 sections 3.1 and 3.2. Any bad name refuses the whole zip, sizes are counted while reading, and anything but `<pupil>/<production>.storystage` is left out.

## What follows

- **S8 (24.4):**
  - the zip writer and reader in `storystage-classes` (`class_zip`);
  - the native picker on Android, through the dialog plugin and the fs plugin's content URIs;
  - on iPad, an export step of its own, because the dialog plugin's save can't write a file iPadOS has already exported;
  - spec 05 section 6.5.
- **S5:** Collect and Hand back stay the same buttons. On iPad and Android, the words say a zip file.
- **S4:** nothing. `FilePicker.collect` and `handBack` keep their shape.
