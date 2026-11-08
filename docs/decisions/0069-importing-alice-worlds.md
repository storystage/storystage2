# 0069 Importing Alice worlds

- **Status:** settled
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answers on four cards in the S6 session, before spec 19 (WP9b)

## Decision

When StoryStage imports an Alice 3 world (WP9.2), it does four things. `19-alice-import.md` has the detail.

1. **Alice's gallery classes go, unless the learner made them their own.** Alice makes a class for every gallery object (`class Alice extends Biped`). A class with no methods or fields of the learner's isn't kept: the object's field just has its Story API class. A class the learner added methods or fields to is kept, as their own class.
2. **A block StoryStage doesn't have leaves a note in its place.** The note says what the block did in Alice and why StoryStage left it out, and the import report lists it. Nothing disappears silently.
3. **An object whose model isn't in Backstage gets a labelled stand-in,** with the model's name, as the Storyboard already uses (WP10.9). Its code still works on it, and the real model appears once Backstage has it.
4. **A world's start goes into the scene's set-up** (`scenes/<id>.json`): positions, turns, sizes, paints, opacity, vehicles and the camera, where the scene view edits them. Anything the set-up can't hold stays as code at the start of the scene, and is reported.

## Why

The workplan asks that Alice's lessons and teachers have a route in, with every gap reported (WP9). A learner should open an imported world and find their own work, in the places StoryStage keeps it, with nothing silently lost.

- Dozens of empty generated classes would bury the learner's own code.
- A note in place shows where a missing block was.
- Alice's gallery isn't shipped until Carnegie Mellon replies to the licence letter (WP17.1), so refusing worlds without their models would refuse almost every world.
- Starting positions kept as code would leave the scene view empty until the code ran.

## What follows

- **S6:** `19-alice-import.md`, then `@storystage/a3p-import`'s mapping (WP9.2), tested on Alice's 34 starter projects.
- **S4:** Backstage ids are Alice's gallery paths where there is one (`17-backstage.md`), which is how an imported object finds its model.
- **Unchanged:** imported worlds are marked `manifest.origin: 'alice'` (WP9.3, `03-production-format.md`).
