# 0047 Update hosting and the updater key

- **Status:** settled
- **Decided:** 1 Nov 2026, by the owner
- **Source:** the owner's answers in the S8 session, on spec 05 section 4 (#86, #99)

## Decision

- **Update files are hosted on GitHub Releases** on `storystage/storystage2`. They are static files, so there is still no StoryStage server. Publishing and rollback run from CI, which the hand-uploaded Bluehost site can't do.
- **The owner generates the updater signing key** on their own PC. The private key goes straight into a GitHub Actions secret in the `release` environment and never passes through a Claude session. The owner keeps an offline copy, because the key can't be replaced without reinstalling every copy of the app.

## What follows

- **Privacy:** GitHub sees the IP address of each update check, so the DPIA (WP17.3) and the privacy notice (17.4) name it. Session D records this. A school can stop the check altogether with `update.channel=off`.
- **The threat model (WP0.9)** records that the manifest isn't signed, only the builds it points to (spec 05 section 4.5).
