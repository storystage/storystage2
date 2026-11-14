# M3 Productions: manual test script

**Gate (workplan section 5):** several scenes in one `.storystage` file play in order with cuts and fades. WP8 is done when a three-scene production saves, reopens identically and plays through with each transition type; WP11.1 when the rough cut plays the whole running order. Playwright runs the path on every pull request (`apps/studio/e2e/gates/m3-productions.e2e.ts`); this script adds what only a person can judge: whether the transitions look right, and whether a file really travels between devices. **Who:** the owner, with S1 writing up. Record no personal data.

**Where:** the browser version (Chrome on Windows, Chrome on the reference Chromebook, Safari on the reference iPad, once chosen), from the build the pull request names. **Before you start:** open `/?example` for sections 1 and 2 (the demo film, "The Lost Penguin (demo)": scene 1 ends with a cut, scene 2 with a fade to black, scene 3 is last). For section 3 open `/`, so the studio keeps films in the browser and the **Film** menu is there.

## 1. The running order and its transitions (Storyboard)

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Choose scene 1 in **Scenes**. Under **Ends with**, choose **Crossfade**. | Undo says "Undo: End scene 1 with crossfade". | |
| 2 | Choose scene 3. | **Ends with** shows "The last scene just ends." | |
| 3 | Drag scene 3 before scene 2 by its handle, then undo. | It moves, and one undo puts it back ("Undo: Move scene 3"). | |
| 4 | Do the same with the keyboard: focus **Move scene 3**, Enter, the arrow keys, Enter. | The same, with the focus ring always visible. | |
| 5 | Set scene 1 back to **Cut**. | The demo's order is 1, 2, 3 again: a cut, then a fade to black. | |

## 2. The film plays in order (Screening room)

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Open the **Screening room**. | "Getting the film ready…" for a moment, then the first frame, not black. The running order lists "1. Ice shelf, morning", "2. Forest, night", "3. Ice shelf, evening". | |
| 2 | **Play**, and watch to the end. | The label goes "Scene 1 · Frame 1.1", "Scene 2 · Frame 2.1", "Scene 3 · Frame 3.1"; each scene's line shows as a caption. Scene 1 to 2 is a cut: no gap, no flash. Scene 2 to 3 fades to black over half a second and fades in from black over the next half. At the end, **Play** is offered again. | |
| 3 | Make scene 1 end with **Crossfade** (Storyboard), and play again. | Scene 1 fades out over scene 2 for half a second: both show at once, not black between. | |
| 4 | Choose "2. Forest, night" in the running order; then use the bar: the arrow keys, **Home**, **End**. | It plays from scene 2's start. The arrows move 5 seconds; Home and End go to the ends. A screen reader reads the bar as, for example, "0:05 of 0:12". | |
| 5 | **Full screen**, then Esc. | The film fills the screen, captions included, and comes back. | |
| 6 | Pause halfway through the fade between scenes 2 and 3, and step back and forth with the arrow keys. | The picture at each point is the same each time you land on it. | |

## 3. One file, saved and opened again

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | **Film** › **Open a copy…**, and choose a `.storystage` file (S1 can send the demo's). | It opens as a new film; the Film menu shows its title. | |
| 2 | Change scene 2's **Ends with** to **Crossfade**. Wait for "Saved". | "Saving…", then "Saved", under the title. | |
| 3 | **Film** › **Save a copy…**. | The system asks where (or, in Safari, it downloads). The name suggested is the film's title with `.storystage`. | |
| 4 | Open that file on another device (Chromebook to iPad, or the other way), with **Open a copy…**. | The same film: three scenes in the same order, scene 2 ending with a crossfade, the same lines, frames and code. Play it: it looks the same as on the first device. | |
| 5 | Reload the page. | **My films** lists the film; choosing it opens it as you left it. | |
| 6 | **Open a copy…** on a file that isn't a production (a photo, renamed). | A plain note says it can't be opened; nothing else changes. | |
| 7 | **Film** › **Open an Alice world…**, and choose one of Alice's starter worlds (WP9). | It opens as a new one-scene film, with a note of anything that didn't come across. | |

## 4. Keyboard alone, and a screen reader

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Repeat sections 1 and 2 with the keyboard only. | Everything is reachable; Space plays and pauses in the player. | |
| 2 | With NVDA (Windows) or VoiceOver (iPad), move through the running order and the player. | Each card is read as its number and heading; the label and captions are read as they change. | |

## Record

For each device: the date, the build, which steps passed, and for each that didn't, what happened. Note anything about the transitions that looked wrong even where the step passed (a flash, a jump, a black frame where none belongs). Then, on each device, run **Settings › Self-test** › **Run the self-test**, and record its last line (`SELFTEST PASS` or `SELFTEST FAIL`); if it fails, paste its report into the results.
