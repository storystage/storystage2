# @storystage/diagnostics

Report a problem (WP18.5). Owner: S1.

- `startProblemLog()` keeps the studio's recent problems from start-up: what went to `console.error` and `console.warn`, and errors nothing caught. It keeps them in memory only, the newest 200, each scrubbed.
- `problemReport(input)` makes the plain-text report a teacher reads before attaching it to the feedback email (`website/feedback.md`): versions, what the device can do, the settings in force, the self-test's report and the recent problems.
- `scrub(text, names)` takes out Claude keys and other key-shaped strings, email addresses, user names in file paths, web addresses' queries, and pupils' names.

Nothing here sends anything anywhere.
