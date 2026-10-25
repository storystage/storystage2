# Website drafts (WP19.1) and the teacher guide (WP19.2)

Session D keeps this folder. It holds the draft pages for **storystage.org**, and the teacher guide. The owner publishes them (19.1 is "C drafts; U publishes").

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

## Where it goes (decision 0046)

- **The website, `storystage.org`,** is the existing WordPress site on Bluehost, built with Elementor. Each reviewed page here becomes a WordPress page, updated through WPVibe. The `title` and `description` in each page's header block become the page title and its meta description, and `order` its place in the menu.
- **The browser version, `app.storystage.org`,** is a separate subdomain with its own clean folder on the same Bluehost account: the static build of `apps/studio` (15.6), and nothing else. No WordPress there. Builds are uploaded through Bluehost's file manager.
- **Pictures** are the approved mock-up screenshots in `docs/design/direction-a/screenshots/`, uploaded to the WordPress media library with their alt text. Real screenshots replace them when the app exists.
- **Licence:** the text is CC BY 4.0 (decision 0045). Each page's footer says so: "Text: CC BY 4.0. From StoryStage (storystage.org)".

## Rules for the website itself

The site makes the same promises as the app, so it has to keep them:

- **No analytics, no tracking, no adverts, no cookies for visitors.** Then it needs no cookie banner. (WordPress sets cookies only for people logged in to edit the site.)
- **Nothing loaded from third parties:** fonts and images are served from the site itself (the app's fonts are bundled, decision 0031), and there are no embedded videos or social media widgets. Links to other sites are plain links.
- **Accessible:** WCAG 2.2 AA, like the app (CLAUDE.md rule 7), with text alternatives for every picture, and a page that works with the keyboard alone.
- **Plain words:** UK English, short sentences, product terms used exactly (Storyboard, Production stage, Screening room, Backstage, Cast, Props, Set, Backdrops, the Prompter, Rehearse, frame, shot). The site is for adults, so it may say "AI" and, once, that Anthropic calls the Claude key an "API key"; the app never does.
- **No promises ahead of the decisions.** Anything still open is marked like this: **[Open: what is waiting, and the workplan item]**. Remove the mark when the decision lands.
- **The host's own logs:** Bluehost keeps ordinary server logs for both the site and the browser version, such as visitors' IP addresses. The privacy notice (17.4) covers them.

## Before the first page goes up: check the WordPress site

WordPress, Elementor and Bluehost's own plugins can quietly break the rules above. Check, and fix where needed:

1. **Plugins:** no statistics or analytics plugins (for example Jetpack Stats, Site Kit, MonsterInsights), no marketing or chat widgets, nothing that adds a cookie banner. Bluehost installs some plugins by default; review them.
2. **Elementor:** switch off Google Fonts loading (Elementor › Settings › Advanced) and Font Awesome from a CDN, and host the fonts on the site.
3. **Theme:** no Google Fonts or other external loads in the theme.
4. **Comments, emojis and embeds:** comments off; WordPress's emoji and oEmbed scripts off if they load from elsewhere.
5. **Look at a page as a visitor:** load it with the browser's developer tools open, and confirm every request goes to `storystage.org` and no cookies are set.

The site isn't connected to WPVibe yet; connecting it is a one-click authorisation by the owner.

## Still to decide (owner)

- The contact address for the site (privacy questions, problem reports, schools).
- Connecting `storystage.org` to WPVibe, and setting up the `app.storystage.org` subdomain on Bluehost, when the first pages and builds are ready.
