# @storystage/runtime

Interpreter in a Web Worker with a scheduler (do in order, do together, loops, events) and a fixed time step.

- **Owner:** S2
- **Workplan:** WP6
- **Spec:** `docs/spec/18-runtime.md`
- **Status:** the language, events, limits, Rehearse controls and fixed-step mode (WP6). It runs nothing on the stage until the Story API's procedures exist (WP4.3).

**In a worker:** `serve(port, library)` runs one scene, speaking `messages.ts`. The worker file itself, and passing in the real library, come with WP7.4.

**For S3 (WP4.3):** a `StoryLibrary` has one function per block. Each takes the call and a `StoryContext`, emits stage commands, yields `{kind: 'sleep', duration}` and `{kind: 'ask', query}`, and returns its value. A question resumes with the stage's whole answer (a `StageQueryResult`, `kind` and `value`). `serve.test.ts` has small examples.
