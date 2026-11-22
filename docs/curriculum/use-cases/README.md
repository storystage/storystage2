# Classroom use cases (WP16.6, part 2)

Eight lesson sequences built on the curriculum mapping ([../mapping.md](../mapping.md), section 6) and the curriculum arc templates ([../arc-templates.md](../arc-templates.md)). Between them they cover all four UK nations and ages 6 to 13.

- **Workplan:** 16.6, "6–10 classroom use cases with lesson outlines (C drafts; U reviews with teachers)". They feed the teacher guide (19.2) and the pilot (WP19).
- **Status:** draft, for the owner to review with teachers. The timings are estimates, to be tested in the pilot.
- **Licence:** CC BY 4.0 (decision 0041). Teachers may copy and adapt them.

## The eight

| No. | Use case | Ages | Template | Main curriculum fit | Lessons |
|---|---|---|---|---|---|
| 1 | [A traditional tale in scenes](01-tale-in-scenes.md) | 6–8 | `tale` | Retelling tales; first programs | 4 |
| 2 | [Make it match the storyboard](02-match-the-storyboard.md) | 7–9 | 3-part | Algorithms, prediction, debugging | 3 |
| 3 | [Myths and legends](03-myths-and-legends.md) | 8–11 | `myth` | Myths and legends; settings, characters, plot | 5 |
| 4 | [Dialogue that moves the action on](04-dialogue-moves-action.md) | 9–11 | 5-part | Dialogue, performance, review | 4 |
| 5 | [Day and night](05-day-and-night.md) | 9–13 | `explain` | Earth and space; models; explanation | 3 |
| 6 | [Step into the past](06-historical-setting.md) | 6–9 | 3-part | Recreating a historical setting | 3 |
| 7 | [The same scene, staged two ways](07-two-stagings.md) | 11–13 | `scene` | Shakespeare; staging and interpretation; media | 4 |
| 8 | [Credit where it's due](08-credits-and-copyright.md) | 8–13 | any | Digital rights, licensing and ownership | 2 |

## Where each one fits

| No. | England | Scotland | Wales | Northern Ireland |
|---|---|---|---|---|
| 1 | Years 1–3: English (fairy stories, traditional tales); computing KS1 | First level: `ENG 1-31a`, `TCH 1-15a` | Steps 1–2: literature; computation | KS1: talking and listening, reading; Using ICT |
| 2 | Computing KS1–KS2 | First and Second level: `TCH 1-14a`, `2-14a`, `2-15a` | Steps 2–3: computation; DCF problem-solving | KS1–2: Using ICT (Explore); maths |
| 3 | Years 3–6: English (myths, legends); history KS2 | Second level: `ENG 2-31a`, `ENG 2-19a` | Steps 2–3: literature | KS2: talking and listening, reading |
| 4 | Years 5–6: English (dialogue, performance) | Second level: `ENG 2-03a`, `EXA 2-14a` | Step 3: expressing ourselves | KS2: writing, drama |
| 5 | Year 5 and KS3: science (Earth and space) | First and Second level: `SCN 1-06a`, `SCN 2-06a` | Step 3: forces and energy | KS2: the world around us |
| 6 | KS1–KS2: history | First level: `SOC 1-03a`, `SOC 1-04a` | Steps 2–3: humanities | KS1–2: the world around us |
| 7 | KS3: English (Shakespeare) | Third level: `EXA 3-14a`, `ENG 3-31a` | Step 4: literature; expressive arts | KS3: English with Media Education; drama |
| 8 | Computing KS2–KS3 (respectful use) | `TCH 2-02a`, `3-02a` | DCF: digital rights, licensing and ownership | Using ICT (e-safety) |

Each use case gives the full list of ids, which link back to the nation pages.

## Common to all eight

- **Devices and groups:** one device per pair or three works best: one learner "drives" and the others direct, swapping each lesson. StoryStage runs in the apps or the browser version.
- **Storyboard first:** a scene's code editor opens only once the scene has a heading and a frame (decision 0012). That is the point, not an obstacle: every lesson plans before it builds.
- **Sketches, not drawings:** frames are built from the sketch library, which mirrors Backstage (decision 0014). If a character isn't in Backstage, learners place a labelled **stand-in** ("dragon") that keeps its code when the real model arrives.
- **The Prompter is optional.** Every use case works with the Prompter **Off**, and the browser version has none. Where a teacher has a key, each use case suggests a level (decision 0034: Off, Explain only, Plan only, Full). The story coach asks questions; it never writes the learner's story or lines.
- **Voices:** characters speak script lines with the device's own voices, with captions always on. Recording learners' own voices comes in a later release (WP14.4).
- **The check:** the "check against the storyboard" (WP11.6) works without the Prompter or the internet. Use it at the end of every coding lesson.
- **Personal information:** learners don't type real full names, addresses or other personal details into stories, scripts or the Prompter. Film credits use first names or initials, as the school's policy allows; sharing a film outside the school follows the school's consent arrangements.
- **Block names** follow Alice's vocabulary (move, turn, turn to face, say, delay, count, do together), as the Story API keeps it; the final names come from the Story API spec (`docs/spec/02-story-api.md`, WP4.1).
- **Accessibility:** both code editors work by keyboard; text size can be increased (decision 0035); captions are always on; voice input can stand in for typing for learners who find typing hard.
