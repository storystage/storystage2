# The code editors with a screen reader: manual test script

**What it checks (workplan 7.8; spec 14 sections 3f, 4.5 and 6.9):** that a learner who uses a screen reader can read, change and move code in **Tiles** and in **Blocks**, can switch between them, and can do a study task. Playwright already checks the names, the keyboard paths and axe on every pull request (`packages/tiles/e2e/`, `apps/studio/e2e/production.e2e.ts`, `switch.e2e.ts` and `study.e2e.ts`). This script adds what only a person can judge: what the screen reader actually says, whether it makes sense in that order, and whether anything is said twice, too late or not at all. **Who:** the owner, or anyone used to the screen reader, with S6 writing up. Record no personal data.

**Where:**

- **NVDA** (the current release) with **Edge or Chrome on Windows**, in the browser version.
- **VoiceOver** with **Safari on the reference iPad**, once it's chosen (#6), in the browser version.
- Section 4 needs study mode, which only a school's policy switches on: run it in the desktop app with a policy file that has `study.enabled` (M6 script, section 2), or leave it until then.

**Before you start:**

- Open `/?example`. Choose **Production stage**. The example's scene 1 has a penguin and a fox, and code that makes them speak.
- **NVDA:** NVDA switches to focus mode by itself in the editors. If it doesn't, press **NVDA+Space**. Don't use browse-mode quick keys (H, B, K) inside the editors: the editors' own keys do the work there.
- **VoiceOver:** swipe right and left to move, double-tap to choose, and double-tap and hold for a long press. With a keyboard attached, the NVDA steps work as written.
- **Expected words** are given in quotes, but the screen reader's own words around them ("tree view", "button", "2 of 5", "level 1") vary with the screen reader and its settings. A step passes when the words StoryStage gives are said, make sense and come when you'd expect them.

## 1. Tiles, with NVDA

Choose **Tiles** in the **Code editor** switch, at the top of the code.

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Tab to the code. | It's read as a tree named for the method, then the first statement by its words, such as "penguin say Hello", with where it is ("1 of 3"). | |
| 2 | Down and up arrows through the statements. | Each is read by exactly the words on screen, details included ("… how long 2"). A switched-off statement says "(switched off)". A "do together" is read as one item, by its header. | |
| 3 | On a statement with a container, press the right arrow to go into it, and the left arrow to come back out. | The level changes, and "do together" or "count" is said as you enter. You never land on something unnamed. | |
| 4 | On a statement, press the right arrow to reach its values. | Each value is read by what it is, then what it's for: "forward, direction", "1, amount". The last is "add detail". | |
| 5 | On a value, press **Enter**. Choose another with the arrows, then press **Enter**. | The menu is read with its name ("direction") and the current choice. After choosing, the change is said in the same words as Undo ("Change forward to backward in penguin move"), and focus is back on the value. | |
| 6 | Escape out of the code. Open **Blocks for**, choose an object, and add a block by keyboard. Answer each value the menu asks for (**Enter** takes the suggestion). | Each question is read by its name ("direction", "amount"). When it's in, "Add penguin move forward 1" is said, and focus is on the new statement. | |
| 7 | On a statement, press **Space**, then the down arrow twice, then **Space**. | "Moving penguin say Hello. Use the up and down arrows…" is said once. Each step says where it would go ("Drops at 3 of 4 in …"), and putting it down says the move ("Move penguin say Hello …"). | |
| 8 | Do it again, and press **Escape** before putting it down. | "Left where it was" is said, and nothing changes. | |
| 9 | Press **Alt+Down arrow**, then **Alt+Up arrow**. At the end of the list, press **Alt+Down arrow** again. | Each move is said. At the end, "That's already at the bottom." is said and nothing moves. | |
| 10 | Press **Ctrl+C**, move down one, and press **Ctrl+V**. | "Copied …", then the paste is said, with focus on the new statement. | |
| 11 | Press **Ctrl+/** on a statement, then again. | "Switch off …" and "Switch on …" are said, and the statement's name says "(switched off)" in between. | |
| 12 | Press the **Menu key** (or **Shift+F10**) on a statement. | Its menu is read by name ("Menu for …"), with each item: Switch off, Add detail, Move up, Move down, Duplicate, Delete. **Escape** closes it, and focus is back on the statement. | |
| 13 | Press **Delete** on a statement, then **Ctrl+Z**, then **Ctrl+Shift+Z**. | The delete, the undo and the redo are each said in words that name the statement. | |
| 14 | From the control blocks, add a **variable**. Leave its name empty and choose **Use it**, then type a name that's already used. | Each problem is read as it appears ("Give it a name.", "… is already used here."), without your having to look for it. | |

## 2. Blocks, with NVDA

Choose **Blocks** in the switch.

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Tab from **New** to the palette, then Tab again into the workspace. | The palette's blocks are read as you arrow down. The workspace says how many stacks it has. | |
| 2 | Down arrow into the method, then through its blocks. | Each block is read in order ("this, penguin, say, Hello…"), and the method's own block by its name. Nothing is read as an unnamed "figure". | |
| 3 | On a block, press the right arrow to reach its values, then **Enter** on one. Choose another and press **Enter**. | The value is read as a drop-down with its value ("dropdown: forward"). The change is said in the same words as Undo. | |
| 4 | In the palette, arrow to a block and press **Enter**. Press the down arrow, then **Enter** to put it in, and answer its questions. | "Use the arrow keys to move…" is said once while it's moving. The questions are Tiles' own, read by name. When it's in, it's said, and focus is on the new block. | |
| 5 | On a block, press **Alt+Down arrow**, then **Alt+Up arrow**. | Each move is said, as in Tiles. At the end of the list, "It's already at the bottom." is said. | |
| 6 | Press **Ctrl+/**, **Ctrl+D**, then **Delete** on a block. | Switch off, duplicate and delete are each said, and focus stays on a block. | |
| 7 | Press **Ctrl+Z**. | The undo is said, naming the block. | |

## 3. The switch, with NVDA

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | In Tiles, put focus on the second statement. Tab to the **Code editor** switch and choose **Blocks** with the arrows. | The switch is read as a radio group named "Code editor". The first time, a dialog opens with focus on its main button, and its words are read. | |
| 2 | Choose **Show me Blocks**. | "Now showing Blocks. Your program is the same." is said. Focus is on the same statement, now a block. | |
| 3 | Switch back to Tiles. | It's said the same way, and focus is on the same statement. | |
| 4 | Under a class policy that locks the editor (M6 script, section 2), Tab to the switch. | Both names are read, the switch can't be changed, and the note beside it is read. | |

## 4. A study task, with NVDA _(needs study mode: a policy with `study.enabled`)_

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Open a ticked pupil's folder (or answer **Yes** on a device with no class list). | The question, if asked, is read with **No** first and focused. The study bar is a region named "Study", with "Study session" and its code. | |
| 2 | Open **Study tasks** and start **Say hello**. | The list is read with each task's number and name. The task card is a region named "Study task: Say hello", with the instruction, **Read it to me**, **Hint**, **Check my step** and **Stop this task**. | |
| 3 | Tab to the editor switch. | It's read as unavailable, with "Set to Blocks for this study task". | |
| 4 | Choose **Hint**, then **Check my step**. | The hint is read, and focus isn't lost (it stays on or near the hint, not back at the top of the page). The check's result is said when it's ready ("Not quite yet…"), without moving focus. | |
| 5 | Choose **Stop this task**. | "Two quick questions" opens with focus on the first answer. Each question is one Tab stop, the arrows choose, and **Skip** is one of the answers. **Done** closes it, and focus goes back to the studio. | |
| 6 | Start **Fix it** and fix it by keyboard. Choose **Check my step**. | "You did it!" is said, and the questions open as above. | |

## 5. Tiles on the iPad, with VoiceOver

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Swipe to the code and through its statements. | Each statement is read by its words, with where it is. Containers' statements come after their header. | |
| 2 | Swipe to a value and double-tap. Choose another. | The menu is read by name, the change is said, and VoiceOver's focus comes back to the value. | |
| 3 | On a statement, double-tap and hold to open its menu. Choose **Move down**. | The menu is read, and the move is said. | |
| 4 | Add a block from **Blocks for** by double-tapping it, and answer its questions. | As in section 1, step 6. | |
| 5 | Turn VoiceOver off, and tap a value, a statement's grip and **add detail** with a finger. | Each is easy to hit first time (44 points or more), with nothing chosen by mistake. | |
| 6 | Turn VoiceOver back on. Switch to **Blocks** and swipe through a few blocks. | Blocks are read as on Windows. If Blockly's workspace can't be reached by swiping, note it: Blocks on the iPad by screen reader may need Tiles instead, and that's a finding for the study (19.5). | |

## Record

For each screen reader and device: the date, the build, the screen reader's version, which steps passed, and for each that didn't, what was said (or not said) and what you expected. Note anything said twice, said too late, or said in words a child wouldn't follow, even where the step passed. Results go in `docs/test/results/editors-screen-reader-<date>.md`. S6 fixes what can be fixed and reports Blockly's own issues upstream (spec 14 section 3i, item 12).
