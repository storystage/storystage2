# 0076 Sound: a library, your own sounds, and three tracks

- **Status:** settled
- **Decided:** 21 Nov 2026, by the owner
- **Source:** the owner's answers in the S8 session, on S8's comparison of StoryStage 2 with Alice 3; confirmed in the S1 session the same day. It replaces the open question "Whether StoryStage 2.1 adds a soundtrack" and brings sound forward from the roadmap (workplan 6b) into this version.

## Decision

1. **A Backstage shelf of sound:** openly licensed effects and music.
2. **Your own sound files,** imported on the device and trimmed once, on import.
3. **Three tracks:** Speech, Music and Sound FX, each with its own volume. The export lowers the music under speech.
4. **How sound is placed:**
    - speech and sound effects by their blocks (the speak line, and `playAudio`), as the code runs;
    - music on a scene's **Sound view** timeline: where it starts, its trim, fades, loop and volume.
5. **Music across a cut:** a music clip can carry on over a scene cut until another clip starts, crossfading at the cut.

## Who does what

- **S4:** the Backstage sound shelf, and importing sound files into a film.
- **S8:** the native picker for sound files.
- **S5:** the Sound view timeline in the studio.
- **S3:** `playAudio` playing in Rehearse and on the stage, and music in Rehearse.
- **S2:** the runtime's `playAudio` timing, and the export's three-track mix with music lowered under speech and crossfades at cuts (spec 08 section 4 lists music as "not yet").
- **D:** imported sound in the DPIA (17.3) and in the licences.

## Still on the roadmap

Making music in StoryStage (a loop maker, or music from other free tools or AI) stays on the roadmap (workplan 6b).
