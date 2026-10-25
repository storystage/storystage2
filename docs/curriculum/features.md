# Features, activities and arc templates

The fixed list the mapping rows point to. Features are as the workplan plans them for the first release. **Later** marks features planned for after the release candidate (decision 0004), which the pilot won't have. "Prompter" marks features that need the optional Prompter, which needs a key and is off in the browser version; the mapping never relies on the Prompter alone for a statement.

## Features (`F-`)

| Id | Feature | Where it comes from |
|---|---|---|
| `F-LOG` | **Title, logline and synopsis**: one sentence on who wants what and what stops them, then a short summary, before any scene | Storyboard; script header (decision 0016) |
| `F-ARC` | **Arc template**: free, 3-part, 5-part, then curriculum templates; each scene card belongs to an arc part | Storyboard (decision 0018) |
| `F-SCN` | **Scene cards**: a strip of scenes, each with a heading (place and time), cast, arc part and transition; reorder them | Storyboard (WP10) |
| `F-SCR` | **Script**: dialogue and directions written against each scene; Fountain import and export | Storyboard (WP10, WP8) |
| `F-FRM` | **Sketch frames**: shots built by dragging black-and-white sketches of Backstage models (no outside drawings), choosing framing and facing | Storyboard (decision 0014, WP10.5) |
| `F-BKS` | **Backstage**: the model library in four sections (Cast, Props, Set, Backdrops), including everyday people, a storybook cast and museum scans of real historical and scientific objects | WP3 |
| `F-LIC` | **Licences and credits**: every model has a licence and credit line; imports record their licence; CC BY credits go into the film's credits; "not sure" items stay in class | WP3.11, 3.12, WP11.4 |
| `F-SET` | **Set the stage**: place cast, props, set, backdrop and camera in the 3D scene, starting from the storyboard | Production stage (WP5, WP10.10) |
| `F-CODE` | **Code editor** (Blocks or Tiles): procedures and functions on each character (move, turn, say, walk to, joints); do in order, do together, count, while, for each, if, variables, and events (when clicked, when a key is pressed) | Production stage (WP2, WP4, WP7, WP7c) |
| `F-TXT` | **Text view**: the same program as read-only, Python-like text, highlighted as it runs | WP2.5, text-view |
| `F-RUN` | **Rehearse**: run a scene, watch each block light up as it runs, stop, step, undo with named steps | Runtime and Production stage (WP6, WP7) |
| `F-CHK` | **Check against the storyboard**: StoryStage rehearses each frame and says in plain words where the scene differs from the storyboard (who is on screen, position, facing, framing, lines, length) | WP11.6; no Prompter needed |
| `F-VOX` | **Voices and captions**: speak lines with on-device voices, record a learner's own voice, captions always shown; voice input to type | WP14 |
| `F-SCRN` | **Screening room**: the rough cut of every scene in order with transitions, compared side by side with the storyboard, with notes | WP11 |
| `F-EXP` | **Export**: an MP4 film with title card, credits and captions | WP11 (decision 0017) |
| `F-A3P` | **Open Alice worlds** (`.a3p`) | WP9 |
| `F-COACH` | **Story coach** (Prompter): asks questions about the logline, synopsis and arc; never writes the learner's words | WP13 |
| `F-PLAN` | **Plan before change** (Prompter): a numbered plan in plain words the learner edits before anything is built; the plan is pseudocode | WP13.9 |
| `F-AR` | **AR** (later): place the set on a table through a tablet; AR packs | WP21, WP22 |
| `F-PATH` | **Pathway** (later): "under the hood" notes, export to Unreal, Unity and Godot; the text view as a first step to Python (16.8) | WP20 |

## Activities (`A-`)

What a class does with the features. WP16b turns the strongest of these into use cases with lesson outlines.

| Id | Activity | Main features |
|---|---|---|
| `A-RETELL` | Retell a traditional tale, myth or legend as a short film | `F-LOG`, `F-ARC`, `F-SCN`, `F-BKS` |
| `A-PLAN` | Plan an original story: logline, synopsis, arc, scenes | `F-LOG`, `F-ARC`, `F-SCN`, `F-COACH` |
| `A-SCRIPT` | Write the script: dialogue that shows character and moves the action on | `F-SCR`, `F-VOX` |
| `A-BOARD` | Storyboard the shots: who is where, facing which way, how close the camera is | `F-FRM`, `F-SCN` |
| `A-STAGE` | Stage a scene from the storyboard: place the cast, set and camera | `F-SET`, `F-BKS` |
| `A-CODE` | Code the action: break each scene into steps, in order and together, with loops and events | `F-CODE`, `F-PLAN`, `F-TXT` |
| `A-DEBUG` | Predict, rehearse, compare with the storyboard, find and fix the difference | `F-RUN`, `F-CHK` |
| `A-PERFORM` | Voice the characters, or record narration, with intonation, volume and timing | `F-VOX`, `F-CODE` |
| `A-SCREEN` | Screen the rough cut, compare with the storyboard, give and act on peer feedback | `F-SCRN`, `F-CHK` |
| `A-PUBLISH` | Export and show the film, with credits for every model and voice | `F-EXP`, `F-LIC` |
| `A-EXPLAIN` | Explain a science process with an animated model (day and night, a skeleton moving, a lever) | `F-SET`, `F-CODE`, `F-VOX` |
| `A-HISTORY` | Recreate a historical event or way of life, using museum scans | `F-BKS`, `F-SET`, `F-SCR` |
| `A-SHAKES` | Stage a scene from Shakespeare or another play: the same lines, staged two ways | `F-SCR`, `F-SET`, `F-FRM`, `F-SCRN` |
| `A-TEXT` | Read the text view: how the blocks look as text code | `F-TXT`, `F-PATH` |

## Arc templates (`ARC-`)

`ARC-3` and `ARC-5` ship regardless (decision 0018). The others are **candidates** this mapping proposes for WP16b; the owner chooses which ship (WP16's done-when).

| Id | Parts | Status |
|---|---|---|
| `ARC-FREE` | No fixed parts | Ships |
| `ARC-3` | Beginning, middle, end | Ships |
| `ARC-5` | Set-up, conflict, challenge, climax, resolution (after Toontastic) | Ships |
| `ARC-TALE` | Once upon a time, a problem, three tries, it works, happily ever after (traditional tales) | Candidate |
| `ARC-MYTH` | The call, the journey, the trial, the return (myths, legends, quests) | Candidate |
| `ARC-EXPLAIN` | The question, what we see, why it happens, what it means (science explanation) | Candidate |
| `ARC-RECOUNT` | Setting the scene, what happened in order, what changed (history recount) | Candidate |
| `ARC-SCENE` | Entrance, conflict, turning point, exit (a scene from a play) | Candidate |
