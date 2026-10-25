# Website drafts (WP19.1) and the teacher guide (WP19.2)

Session D keeps this folder. It holds the draft pages for `storystage.org.uk`. The owner publishes them (19.1 is "C drafts; U publishes").

- **Status:** drafts, written from the approved mock-ups (decision 0044). Nothing here is published yet.
- **Workplan:** 19.1 (website pages: downloads per device, the browser version, a set-up guide for keys and the school lock, privacy, credits), 19.2 (teacher guide), and the teacher's-guide pages that 24.7 adds for each step of the teacher's journey.

## Pages

| Page | What it is | Waiting for |
|---|---|---|
| [index.md](index.md) | Home: what StoryStage is, who it's for, and where to go next | — |
| [download.md](download.md) | The apps for each device, and the browser version | Signed builds and store listings (WP15.4–15.6, M6) |
| [set-up.md](set-up.md) | Getting started: a learner on their own, an adult adding the Prompter, a school or club | How the Prompter reaches a whole class (WP24.3, M1); the policy file's details (WP15.3) |
| [privacy.md](privacy.md) | Privacy at a glance | The DPIA and the full privacy notice (WP17.3, 17.4) |
| [credits.md](credits.md) | Who made what StoryStage is built from | The Alice credit wording (CMU's reply, WP17.1); the Backstage credits (WP3.4) |
| `teacher-guide/` | The teacher guide (19.2), in its own pull request | — |

## Format

Each page is Markdown with a short header block (`title`, `description`, `order`), so it can go into any static site generator, or be pasted into a hosted site builder, without rewriting. Pictures are the approved mock-up screenshots in `docs/design/direction-a/screenshots/`; when the app exists, real screenshots replace them.

## Rules for the website itself

The site makes the same promises as the app, so it has to keep them:

- **No analytics, no tracking, no adverts, no cookies.** Then it needs no cookie banner.
- **Nothing loaded from third parties:** fonts and images are served from the site itself (the app's fonts are bundled, decision 0031), and there are no embedded videos or social media widgets. Links to other sites are plain links.
- **Accessible:** WCAG 2.2 AA, like the app (CLAUDE.md rule 7), with text alternatives for every picture, and a page that works with the keyboard alone.
- **Plain words:** UK English, short sentences, product terms used exactly (Storyboard, Production stage, Screening room, Backstage, Cast, Props, Set, Backdrops, the Prompter, Rehearse, frame, shot). The site is for adults, so it may say "AI" and, once, that Anthropic calls the Claude key an "API key"; the app never does.
- **No promises ahead of the decisions.** Anything still open is marked like this: **[Open: what is waiting, and the workplan item]**. Remove the mark when the decision lands.
- **The host's own logs:** whoever hosts the site (and the browser version, 15.6) will keep ordinary server logs, such as visitors' IP addresses. The privacy notice (17.4) must cover them, and the host should keep them as briefly as it allows.

## Still to decide (owner)

- Where the site is hosted, and with what tool. The browser version is static files on the same site (15.6).
- The licence for the website and teacher-guide text. Decision 0041 put `docs/curriculum/` under CC BY 4.0 and said other documentation may follow.
- The contact address for the site (privacy questions, problem reports, schools).
