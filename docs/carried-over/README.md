# Carried over from StoryStage 1

WP0.7. StoryStage 2 keeps StoryStage 1's designs, not its code. These files are copied unchanged from `storystage/storystage` at commit `325c73d` (17 Oct 2026). Each one starts with a note on what changes in StoryStage 2, and the StoryStage 2 spec that replaces it is written by the session named. Treat these files as references and don't edit them. Corrections go in the StoryStage 2 specs.

| File | What it is | Replaced by | Owner |
|---|---|---|---|
| [spec/01-prompter-protocol.md](spec/01-prompter-protocol.md) | Prompter protocol: request shape, context, tools, system prompt, errors | `docs/spec/04-prompter.md` | S7 |
| [spec/02-keys-privacy-switches.md](spec/02-keys-privacy-switches.md) | Set-up wizard, key storage, usage meter, off switches, privacy notice | `docs/spec/05-keys-privacy-switches.md` | S8 |
| [spec/03-speech.md](spec/03-speech.md) | Speech in (whisper.cpp), speech out, narration queue | `docs/spec/06-speech.md` | S7 (14.3: S1) |
| [spec/04-ux.md](spec/04-ux.md) | Branding, Prompter panel, states, accessibility, words | `docs/spec/07-ux.md`; words in `CLAUDE.md` rule 9 | S5 |
| [spec/05-testing.md](spec/05-testing.md) | Test levels, evaluation set format, recordings, TR1 done-when | `docs/spec/09-testing.md` | S1 |
| [eval/requests.jsonl](eval/requests.jsonl) | The evaluation set: 47 learner-style requests in nine categories | `docs/eval/` | S7 |
| [eval/README.md](eval/README.md) | How to run the evaluation set: starting worlds, modes, checks | `docs/eval/` | S7 |
| [test/TR1-manual.md](test/TR1-manual.md) | The TR1 manual test script (Windows) | `docs/test/`, one script per milestone (WP18.4) | S1 |

## The evaluation set (`eval/requests.jsonl`)

A JSON Lines file can't carry a note, so its note is here. What changes in StoryStage 2:

- Requests name Alice starting worlds (`grass`, `penguin`, `two-animals`, `penguin-animated`). In StoryStage 2 these become starting productions in `.storystage` files.
- Checks name Alice classes (`SQuadruped`, `SBiped`, `SFlyer`, `SProp`, `STransport`). They map to the Story API classes (WP4.2), and the gallery items they imply map to Backstage.
- New categories are needed for the storyboard tools, the story coach (which must not write the learner's story) and prompt injection through shared productions (13.7, 13.8).
- Requests that rely on the Prompter seeing the scene are rewritten, because no pictures are ever sent (CLAUDE.md rule 3).
- Results stay comparable across runs; the TR1 pass marks were 85% on recorded responses and 75% live.
