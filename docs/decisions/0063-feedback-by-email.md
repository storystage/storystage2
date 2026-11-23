# 0063 Feedback by email

- **Status:** settled
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answer in session D, on WP19.4 (the feedback form), by card

## Decision

Teachers, parents and schools send feedback and problem reports **by email**, to a dedicated StoryStage address (for example `feedback@storystage.org`; the owner sets it up). There is no form on the website and no StoryStage server. A teacher can attach the file that **Report a problem** makes (18.5); nothing is ever sent from the app automatically.

The owner (or whoever runs StoryStage) **triages each email into a GitHub issue** with the issue templates, writing it so that it names no one: no names, schools, pupils, addresses or attachments that could identify anyone. Developers and contributors can file GitHub issues directly. Security problems go privately through GitHub's vulnerability reporting (`SECURITY.md`).

## What follows

- **`website/feedback.md`** tells teachers what to send, and what never to send (pupils' names, photos of pupils, films that identify them).
- **`docs/feedback.md`** is the triage guide: from email to an anonymised issue, labels and severity, into the next release, and how long emails are kept (until the issue is closed, plus 12 months, as the DPIA proposes).
- **The DPIA (17.3)** names the email host as a processor once the owner chooses it (flow F9); **the privacy notice (17.4)** gives the address.
- **The pre-publish check** for the website (`website/README.md`) is unaffected: there's no form plugin.
