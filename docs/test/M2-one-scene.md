# M2 One scene, coded: manual test script

**Gate (workplan section 3):** in the browser, add models to a scene, code it with blocks, Rehearse it. WP7 is done when this passes (its done-when), and WP7c when Tiles passes the same steps. Playwright runs the steps it can on every pull request (`07-ux.md` section 5); this script adds what only a person can judge: whether it feels right, by pointer, touch, keyboard and screen reader. **Who:** the owner, or a teacher with the owner. Results: `docs/test/results/M2-<date>.md`, with each device's model, OS version and browser version.

**Where:** the browser version (Chrome on Windows, Chrome on the reference Chromebook, Safari on the reference iPad), from the build the pull request names. **Before you start:** a new production with a logline, a synopsis and one scene with a heading and one frame (the Storyboard, section 6), so the Code editor is open (`07-ux.md` section 1.4).

This script is written with the spec (`07-ux.md` section 7, `14-editors.md` section 2.2), before the code. Steps marked _(WP6)_ need the runtime, and _(S3)_ the stage's editing additions; leave them until those land.

## 1. Set the scene, by pointer or touch

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Open the Production stage. | The frame strip shows frame 1.1, current. The scene view shows the empty scene through its camera. The Code editor shows the scene's method, empty. Rehearse is unavailable. | |
| 2 | Open **Cast**, and drag a character onto the stage. | It lands where you dropped it, on the ground. Undo says "Undo: Add …" with its name. "In this shot:" names it. | |
| 3 | Add a second character by focusing it in Cast and pressing Enter. | It lands in front of the camera, facing it. | |
| 4 | Drag the first character along the ground, turn it with its handle, and make it bigger. _(S3)_ | It moves, turns and grows smoothly under your finger or pointer. Each drag is one undo step. The x, y, z, turn and size fields follow. | |
| 5 | Type a new x into its field. | It moves there. | |
| 6 | Choose **Look around** and orbit the scene, then **Camera view**. | Look around never moves anything in the scene; Camera view is as it was. | |
| 7 | Undo four times, then redo four times. | Each step undoes and redoes exactly, named for what it did. | |

## 2. Code it with blocks

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | In the palette, choose the first character, and drag **say** into the method. | The cascade asks what it says. Type "Hello" and confirm. The block reads "… say Hello". | |
| 2 | Drag **move** in below it. | The cascade asks which way, then how far. Esc on the second question adds nothing. Do it again and answer both. | |
| 3 | Drag a number from a function onto the move's object chip, or anything else that can't go there. | It is refused, and you are told why in plain words. | |
| 4 | Drag a block onto empty space outside the method. | It doesn't stay there (the rule in `14-editors.md` section 2.2, once decided). | |
| 5 | Wrap the say and the move in **do together**. | Both sit inside it, in order. | |
| 6 | On the move, **+ detail**, then **duration** 2 seconds. | A duration chip appears; **remove detail** takes it away again. | |
| 7 | Switch the say off from its menu, then on again. | It fades and dashes while off. | |
| 8 | **Show as text**. | The text view matches the blocks, Python-like; switch it to Java-like. | |
| 9 | Undo everything in this section, then redo it. | Each step is named for what changed, and the blocks come back exactly. | |

## 3. Rehearse it _(WP6)_

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | **Rehearse**. | The scene plays in the scene view; the running blocks are outlined in amber, in time. | |
| 2 | Pause, play, double speed, restart. | Each does what it says, at once. | |
| 3 | **Rehearse to here** on the last block. | It jumps there and carries on. | |
| 4 | Change a value while it plays. | Rehearse stops, and says so. | |
| 5 | **Stop**. | The scene is back exactly as it was set. | |
| 6 | Make an error on purpose (move an object that has been removed, if the program allows it, or the error the build notes describe). | The run stops; the block is highlighted with the error in plain words beside it. | |

## 4. Keyboard alone

Unplug the mouse (or don't touch the trackpad) and repeat sections 1 to 3 with the keyboard only.

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Add a character from Cast; in **Objects in this scene**, Enter to pick it up, the arrow keys, Page Up, [ and ], + and −, then Enter. _(S3)_ | It moves, rises, turns and grows; putting it down says where it is; one undo step. | |
| 2 | Tab to the palette; Enter on **say**; answer the cascade from the keyboard. | It goes after the block with focus. | |
| 3 | Move between blocks with the arrow keys; switch one off; add a detail; delete one. | The focus ring is always visible. | |
| 4 | Rehearse, pause and stop from the keyboard. _(WP6)_ | | |

## 5. Screen reader and touch

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | With NVDA (Windows) or VoiceOver (iPad), move through the palette and the method. | Each block is read as its row ("owl move forward 1 metre"); a switched-off block says so; drops and refusals are announced. | |
| 2 | On the iPad and the Chromebook, by touch: add a block, move it, answer the cascade, add a detail. | Nothing needs hover; every target is easy to hit; drags don't stutter at the start (note any that do). | |

## Record

For each device: the date, the build, which steps passed, and for each that didn't, what happened. Note anything that felt slow or confusing even where it passed.
