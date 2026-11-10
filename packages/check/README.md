# @storystage/check

The automatic check against the storyboard (WP11.6): what a run did, against what the storyboard planned, from the scene's state rather than pictures, in plain words. It works without the Prompter and without a network.

- **Owner:** S2
- **Workplan:** WP11c (decision 0071)
- **Spec:** `docs/spec/08-export.md`, section 9

So far, the geometry (`geometry.ts`): where a point lands on the picture, whether it's on screen, which way a character faces, and how much of the picture's height it fills, by the stage's conventions (+X on the picture's left, the lens in turns).
