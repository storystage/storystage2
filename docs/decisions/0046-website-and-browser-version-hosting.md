# 0046 Website and browser version: domain and hosting

- **Status:** settled
- **Decided:** 25 Oct 2026, by the owner
- **Source:** the owner's answers in session D, on the WP19a drafts (#79)

## Decision

- **The website is `storystage.org`**, the domain registered on 21 Oct 2026 with Bluehost's name servers (the app identifier, 0026, already assumes it). It runs on the existing Bluehost hosting as a **WordPress site built with Elementor**, and is updated through **WPVibe**. Session D's drafts in `website/` become its pages once reviewed.
- **The browser version (WP15.6) is static files at `app.storystage.org`**, a subdomain pointing at its own clean folder on the same Bluehost account. Being a separate origin, it shares no cookies or storage with WordPress, so a flaw in a WordPress plugin can't reach the work learners save in the browser. Builds are uploaded through Bluehost's file manager.
- **`storystage.org.uk` is not used.** It was never registered (Nominet, 25 Oct 2026), and the owner chose not to register it. The workplan's mentions of it (15.6, 19.1) now say `storystage.org` and `app.storystage.org`.

## What follows

- **The WordPress site has to keep the website's promises** (`website/README.md`): no analytics or statistics plugins, no tracking or advertising cookies, Elementor's Google Fonts and Font Awesome loading switched off (fonts served from the site), and no embedded third-party media. It is checked before the first StoryStage page is published.
- **The privacy notice (17.4)** names Bluehost (Newfold Digital) as the host of both, and covers its server logs.
- **The threat model (S8, `docs/spec/15-security.md`)** records the browser version's origin: `app.storystage.org`, with no WordPress on it, and a strict content security policy.
- **The trade mark brief (17.6)** no longer lists `storystage.org.uk`; someone else could register it, which the attorney can weigh up.
