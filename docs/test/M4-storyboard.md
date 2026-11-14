# M4 Storyboard: manual test script

**Gate (workplan section 5):** a production is planned in the Storyboard, frames link to code, and the cast is placed from frames. WP10 is done when a film can be planned end to end by keyboard alone and this script passes; when a missing character can be found, imported or stood in for without leaving the Storyboard; and when a five-sketch frame sets the stage correctly (side, facing, backdrop, shot) in one undo. Playwright runs the path on every pull request (`apps/studio/e2e/gates/m4-storyboard.e2e.ts`); this script adds what only a person can judge. **Who:** the owner, with S1 writing up. Record no personal data.

**Where:** the browser version (Chrome on Windows, Chrome on the reference Chromebook, Safari on the reference iPad, once chosen). **Before you start:** open `/` for a new film. Steps marked _(WP10b, S5)_ need frames linked to code, and _(WP10c, S5)_ the cast placed from frames, and the Storyboard's Backstage; leave them until those land.

## 1. Plan a film, by keyboard alone

Unplug the mouse, or don't touch the trackpad, for this section.

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Type a **Title**, a **Logline** and a **Synopsis**. Choose the **5-part** arc. | **Add a scene** is unavailable, saying "Write a logline and a synopsis first.", until both are written. Each is one undo step ("Write logline"). | |
| 2 | **Add a scene** three times, giving each a **Heading**, a **Part of the arc**, and how it **Ends with**. | Each scene reads "N · heading" in **Scenes**. | |
| 3 | Move scene 3 before scene 2 (**Move scene 3**, Enter, the arrow keys, Enter), then undo. | One undo step each way. | |
| 4 | In scene 1, **Add a frame** twice. For each, choose a **Shot** (and **More shots**), set its **Length**, and write a **Caption**. | Frames read "1.1", "1.2". **Shorter** and **Longer** change the length. | |
| 5 | Put sketches on frame 1.1 from **Sketches**: a backdrop, a mark (a speech bubble), and a stand-in once the cast has one _(WP10c)_. Pick one up with Enter, move it with the arrow keys, make it bigger with =, **Flip** it, put it down with Enter. | Each sketch reads, for example, "Trees, on the left"; flipped, "…, facing the other way". Each change is one undo step. | |
| 6 | In **Script**, write three lines, with **Who says it**, and pin one to frame 1.1. | The pinned line shows under the frame, for example "Owl: Here is the key." | |
| 7 | **Print storyboard**. | A4 landscape, black on white: frames with their captions and pinned lines, three to a row. | |

## 2. The storyboard rule

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Add a fourth scene with no heading and no frame, and open the **Production stage** on it. | "Storyboard scene 4 first": **Logline and synopsis** Done, **A heading for scene 4** To do, **At least one frame** To do. The Code editor is closed. | |
| 2 | **Go to the Storyboard**, give scene 4 a heading and a frame, and come back. | The Code editor opens on scene 4's method. The frame strip shows "Frame 4.1 Planned". | |

## 3. Frames link to code _(WP10b, S5)_

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Link frame 1.1 to the blocks that play it. | The blocks show the link, headed "When frame 1.1 starts". The strip shows frame 1.1 **Coded**. | |
| 2 | Delete one of those blocks. | The frame shows as not linked, with no error. | |
| 3 | **Rehearse** scene 1, then **Check this frame**. | Frame 1.1 is **Rehearsed**, then **Checked** or **Look at**. "Go to the sketch" and "Go to the block" lead between the Storyboard and the code. | |

## 4. The cast placed from frames _(WP10c, S5)_

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | In scene 1's card, find a character in the Storyboard's Backstage, or stand one in, without leaving the Storyboard. | It joins the cast, and its stand-in appears in **Sketches**. | |
| 2 | Put five sketches on frame 1.1: two characters on either side, one flipped, a prop, and a backdrop. Choose the **Wide** shot. | | |
| 3 | Open the Production stage. To "Set up this scene from your storyboard?", choose **Place everything**. | The characters stand on the side and at the depth their sketches show, facing as sketched; the backdrop and the camera's shot match. Cast who only appear in later frames wait just off stage. | |
| 4 | Undo once. | Everything placed goes, in one step. | |
| 5 | Do it again with **Choose what to place**, and then with **Not now**. | Only what you chose is placed; Not now places nothing, and **Set up from storyboard** stays in the toolbar. | |

## 5. Screen reader, zoom and touch

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | With NVDA (Windows) or VoiceOver (iPad), plan a scene and a frame. | Every control is read by its name; sketches are read with where they are; moves and drops are announced. | |
| 2 | At 200% zoom, plan a frame. | Nothing is cut off or overlaps; the page scrolls rather than hiding things. | |
| 3 | On the iPad and the Chromebook, by touch: add a sketch, drag it across the frame, pin a line. | Nothing needs hover; drags don't stutter at the start. | |

## Record

For each device: the date, the build, which steps passed, and for each that didn't, what happened. Note anything slow or confusing even where it passed. Then, on each device, run **Settings › Self-test** › **Run the self-test**, and record its last line (`SELFTEST PASS` or `SELFTEST FAIL`); if it fails, paste its report into the results.
