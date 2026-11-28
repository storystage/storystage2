# Contributing to StoryStage 2

Thank you for helping. StoryStage 2 lets young people aged 6 to 13 make 3D animated films the way the film industry does: Storyboard, Production stage, Screening room. It is free and open source, and it runs in schools, clubs and homes.

Everyone here follows the [code of conduct](CODE_OF_CONDUCT.md), including its section on children and safeguarding.

## Who goes where

| You are… | Please… |
|---|---|
| A **teacher, parent, school or club** | Email **feedback@storystage.org**, rather than opening an issue. We file it here without your name or school ([how](website/feedback.md)). |
| A **learner** | Ask your teacher or a parent to tell us. Please don't post here yourself. |
| Reporting a **security problem** | Report it privately: see [SECURITY.md](SECURITY.md). Never in a public issue. |
| Worried about a **child's safety** | Follow "Children and safeguarding" in the [code of conduct](CODE_OF_CONDUCT.md) first. |
| A **developer, designer, translator or teacher** who wants to help with the work | Read on. |

For help using StoryStage, see [SUPPORT.md](SUPPORT.md).

## Protect learners

- **No child's details, ever:** no names, faces, voices, schools or towns, and no screenshots or recordings of a real child's work. Make up an example instead ("a Year 5 pupil's two-scene film about a fox").
- **No API key, token or password** anywhere: not in code, tests, issues, logs or screenshots. Tests use the fake Claude server in `tools/fake-claude`.
- **No learner data** in a change, a test fixture or a report.

## The rules that never change

The full list is in [CLAUDE.md](CLAUDE.md). In short:

1. **No StoryStage server, no accounts, no analytics.** StoryStage collects nothing from children. Children's data comes under UK GDPR and the ICO's Children's code, so anything that adds a third party needs the data protection impact assessment (workplan 17.3) updated first.
2. **The story is the learner's.** The Prompter, the optional Claude assistant, coaches; it never writes the logline, synopsis or script. It sees text only: camera images, microphone audio and pictures never go to it.
3. **Storyboard first.** A scene's code opens only once it has a heading and a frame.
4. **Low-end devices first.** Anything touching rendering, speech or memory is measured on a 4 GB Chromebook and a non-Pro iPad.
5. **Accessible:** WCAG 2.2 AA, full keyboard paths, captions for all speech.
6. **Plain words on screen.** No "AST", "node", "token", "schema" or "API" in anything a learner sees. Name each step after what changed ("Add cat").

## Issues

- **Search first.** If the issue exists, add what's new in a comment.
- **Use the forms:** Something went wrong, Something gets in a learner's way, A lesson or the curriculum, or An idea. Blank issues are off.
- **One problem per issue.** Say what happened, what you expected, the steps, and the device and version.

## Pull requests

1. **Talk first.** For anything bigger than a typo, open or comment on an issue before you start, so work isn't wasted. The plan of work is [docs/WORKPLAN.md](docs/WORKPLAN.md), the specs are in [docs/spec/](docs/spec/), and settled decisions are in [docs/decisions/](docs/decisions/).
2. **Set up:** Node 24 and pnpm, then:
   ```
   pnpm install
   pnpm dev          # the studio in the browser
   pnpm test         # unit tests
   pnpm lint && pnpm typecheck
   ```
3. **One change per pull request,** on its own branch, against `main`.
4. **Tests:** write the tests first in `packages/ast`, `runtime`, `production` and `prompter`. Every bug fix comes with a test that failed before it.
5. **Dependencies:** prefer MIT, BSD or Apache-2.0; MPL-2.0 unmodified is fine; OFL-1.1 for fonts only; GPL only for offline build tools, never in the app. Run `pnpm notice` to record each new one in `NOTICE` in the same pull request.
6. **Fill in the template.** Its "Session" line and the `docs/lanes.md` box are for the project's Claude Code sessions (below); outside contributors can leave them out.
7. **CI must be green.** A maintainer reviews, and merges with a squash.

## Models, sounds and pictures

Backstage, StoryStage's library of models and sounds, lives in [storystage/backstage-assets](https://github.com/storystage/backstage-assets).

- **Every asset needs a licence, a credit line and its source,** in that repository's `backstage.json`. CC0 or CC BY 4.0 are best. "Not sure" isn't enough to ship.
- **Suitable for ages 6 to 13:** no weapons (no swords or shields, even museum pieces), no blood, nothing frightening beyond a storybook villain.
- **Alice 3's models** are for testing only until Carnegie Mellon University agrees in writing. **The Sims 2's art** is never used.

## Lessons, curriculum and translation

Teachers' knowledge matters as much as code. Corrections to the curriculum mapping, story templates, use cases and the teacher guide are welcome, by the "A lesson or the curriculum" form or by email. Welsh comes first among other languages, from release 1.1.

## Using AI

Much of StoryStage 2 is built by Claude Code sessions, each owning part of the project (see [handover/README.md](handover/README.md)); their pull requests carry a `Co-Authored-By` line. If AI helped with your contribution, say so in the pull request. You are responsible for every line, as if you had written it yourself.

## Licence of contributions

- **Code** is under the [Apache License 2.0](LICENSE). As its section 5 says, what you contribute is under the same licence, so there is no contributor agreement to sign.
- **The curriculum material** in `docs/curriculum/` and **the website and teacher guide** in `website/` are under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (decisions 0041 and 0045). Contributions there are under CC BY 4.0 too.
- Only contribute what you have the right to.

## What to expect

StoryStage has one maintainer, so replies can take a while; we aim to respond to new issues within a week. Decisions are recorded in [docs/decisions/](docs/decisions/), and a "no" comes with a reason.
