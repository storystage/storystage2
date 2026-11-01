# 0049 Key entry

- **Status:** settled
- **Decided:** 1 Nov 2026, by the owner
- **Source:** the owner's answer in the S8 session, at the start of WP15k

## Decision

**The Claude key is typed into a system dialog, never into the studio.** Screen 10c keeps its steps and wording, but its masked field becomes an **Add key** button, which opens a small dialog made from the platform's own controls. The key never enters a webview, so CLAUDE.md rule 1 and spec 00 section 5 hold exactly.

The alternatives were a separate locked window (the key would still pass through a webview), and the field as drawn (the page that runs all the app's code).

## What follows

- **Direction A's screen 10c changes.** S5 draws an **Add key** button, with the outcome words in spec 05 section 1.3. The dialogs are plainer than the mock-up, and have no Show button.
- **The dialogs can only be tried by hand** on each platform. What happens after them is tested in CI.
- **The iPad's dialog waits for the Apple developer account** (WP15.5), because it can't be built or run before that. Until then the iPad's Prompter stays off.
