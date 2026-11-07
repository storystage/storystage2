# Legal: letters, rights checks and contracts

Session D keeps this folder (WP17). It holds the drafts the owner sends or signs, the answers that come back, and the rights decisions that let StoryStage 2 ship an asset. None of it is legal advice: where a document says "legal advice", the owner gets it before acting.

## What is here

| File | Workplan | What it is | Who finishes it |
|---|---|---|---|
| [cmu-ea-letter.md](cmu-ea-letter.md) | 17.1, 17.7 | The email to CMU's Alice team: may we convert and ship Alice's own models, the credit wording, and whether EA's permission for the Sims 2 assets can extend to StoryStage 2 | Owner sends |
| [correspondence.md](correspondence.md) | 17.1, 17.7 | The log of what was sent, when, and what came back (or that nothing did) | Owner files answers; D keeps it tidy |
| [anthropic-terms-under-18s.md](anthropic-terms-under-18s.md) | 17.5 | What Anthropic's terms say about products used by under-18s, and what the set-up wizard and privacy notice must say because of it | Owner decides |
| [trade-mark-storystage.md](trade-mark-storystage.md) | 17.6 | A clearance brief for a trade mark attorney: the classes, a first knock-out search, and the questions to ask | Owner |
| [storybook-characters.md](storybook-characters.md) | 17.8 | The rights check for each candidate storybook character, with a recommendation and the owner's decision | Owner decides |
| [commission-contract.md](commission-contract.md) | 17.9 | A short contract template for 3D artists: assigns copyright to the project, credits the artist, confirms the work is original | Owner approves, with legal advice |
| `permissions/` | 17.1, 17.7, 17.9 | One record per written permission, created when it arrives (see below) | D, from the owner's filed answer |

Files without a link yet arrive in their own pull requests.

## Permission records

The Backstage manifest (WP0.8, `packages/backstage/src/manifest.ts`) lets a model carry `licence: "permission"` only if its `permission` field names a record here. When a written permission arrives (CMU's answer, EA's answer, a signed commissioning contract), D adds one record:

- **Where:** `docs/legal/permissions/<who>-<what>.md`, for example `docs/legal/permissions/cmu-alice-models.md`. The manifest's `permission` field holds that path from the repository root.
- **What it says:**
  - who granted it, their role, and the date;
  - exactly what it covers (which models, or "all of the commissioned cast"), and what it leaves out;
  - what it allows: converting, reducing, renaming joints, shipping in the apps and the browser version, appearing in learners' exported films and AR packs, the pathway exports (WP20);
  - any conditions (non-commercial only, notices to keep, how long);
  - the credit line, word for word, as it goes into `credit` in the manifest and into film credits;
  - where the original is kept. The owner keeps the email or the signed contract; the record quotes only the parts that grant the permission, and leaves out personal email addresses and signatures.
- **No answer:** if nobody replies, `correspondence.md` says so with the dates, and the models stay unshipped. "No answer" is a filed answer for WP17's done-when; it is not a permission.

## Rules

- **Plan without it until it's in writing.** Alice's own models and anything from the Sims 2 set may be converted for testing (WP3.2) but don't ship until a permission record exists (WP3 depends-on).
- **Leave out anything doubtful.** A character or asset with an open rights question is left out of the shipped catalogue, not shipped and fixed later (17.8).
- **Personal data.** This folder is in a public repository. No home addresses, phone numbers or signatures; work email addresses only where the person publishes them for this purpose.
