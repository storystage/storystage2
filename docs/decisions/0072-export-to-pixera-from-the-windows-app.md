# 0072 Export to Pixera: a guided step in the Windows app

- **Status:** settled
- **Decided:** 21 Nov 2026, by the owner
- **Source:** the owner's answers in the S3 session, after spike 23.2 (`docs/spikes/REPORT.md`, section 23.2)

## Decision

1. **Export to Pixera (23.7) is a guided "Build in Pixera" step in the Windows desktop app.** The app talks to Pixera's API on the same network. It checks that each surface has a screen of the same name, warns when the timeline's frame rate isn't the show's, adds the media, and builds the timeline: layers sent to their screens, clips and cues. It waits while Pixera asks for a PNG sequence's frame rate, saying what to type, then saves the project and reports what it did.
2. **A one-page operator guide stays,** for the steps done in Pixera itself:
    - import each surface's model as a screen, named as in the export;
    - place the projectors;
    - set the timeline's frame rate, if wanted;
    - answer the frame-rate question for PNG sequences;
    - map outputs and calibrate.
3. **The browser and Chromebook versions don't export to Pixera.** They point learners and teachers to the Windows version of StoryStage. Export for projection (23.6) stays in every version.

This refines 0023: decision 0023's "package plus a build script" becomes a step in the Windows app, not a script shipped in the package.

## Options set aside

- **A build script shipped in the package** (Node.js, as in the spike, or PowerShell, which every Windows PC has). It's another thing to run and support, and Pixera only runs on Windows, where the Windows app can run instead.
- **A wizard in place of the guide.** Pixera's own steps (screens, projectors, calibration) happen in Pixera, so the operator needs the guide whatever the app does.
