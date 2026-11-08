# Feedback and triage (WP19.4)

How feedback reaches the project and becomes work in the next release. Session D wrote it; whoever runs StoryStage follows it. Decision 0063 sets the route: **email in, anonymised GitHub issues out.**

## 1. Where feedback comes from

| Source | Route | Who files the issue |
|---|---|---|
| Teachers, parents, schools, clubs | Email to the feedback address (`website/feedback.md`) | The triager, anonymised |
| Pilot schools (WP19) | Email, and the teacher interviews (19.7) | The triager |
| Developers and contributors | GitHub issues, with the templates | Themselves |
| Security problems | GitHub's private vulnerability reporting (`SECURITY.md`) | Never a public issue |

## 2. From email to issue

For each email, within a week:

1. **Read it.** If it raises **safeguarding** (a worrying Prompter reply, anything about a child's safety), deal with it first: reply to the sender, confirm they've followed their school's procedure, and follow the project's own safeguarding steps **[owner to write, before the pilot]**. Record a Prompter reply as an evaluation case for S7 (13.7), with no personal details.
2. **Strip personal data.** The issue names no one: no sender, school, town, pupil, email address or attachment that could identify anyone. Describe the device ("a Chromebook"), the nation and age group if they matter, and what happened. Don't attach their Report a problem file; copy the relevant lines, after checking they hold nothing personal.
3. **Check for a duplicate.** Search the issues; if one exists, add a comment with the new detail ("Seen again, on an iPad, Year 5").
4. **File it** with the matching template (section 3), and label it (section 4).
5. **Reply** briefly if the sender asked a question, or if the issue changes something for them.
6. **Keep the email** in the feedback mailbox until the issue is closed, plus 12 months, then delete it (DPIA §4.4). Don't forward emails with personal data to anyone outside the project, and don't paste them into an AI tool.

## 3. The issue templates (`.github/ISSUE_TEMPLATE/`)

| Template | For | Label |
|---|---|---|
| Something went wrong | A bug: what happened, what was expected, steps, device and version | `bug` |
| Something gets in a learner's way | An accessibility barrier: the task, the barrier, assistive technology | `accessibility` |
| A lesson or the curriculum | A use case, template or curriculum mapping that needs changing | `wp-16` |
| An idea | A suggestion, with who it helps and why | `enhancement` |

Blank issues are turned off; the template chooser also links to the feedback email, the teacher guide and security reporting.

## 4. Labels and severity

Add the owning session's label (`lane:s1` … `lane:s8`, `lane:d`) and the work package (`wp-N`). Then a severity, in the issue's first line:

| Severity | Means | Example | When |
|---|---|---|---|
| **S1: stop** | Harm to a child, a data leak, a key leak, or the school lock failing | The Prompter shows something inappropriate; a key appears on screen | Now: a fix or a rollback (spec 05 §4.7) before anything else |
| **S2: blocks a lesson** | A class can't do the lesson, and there's no workaround | Export fails on every Chromebook | The next pilot or patch release |
| **S3: gets in the way** | There's a workaround, or it affects some learners | One keyboard path is missing; a slow scene | Planned into the next release |
| **S4: polish or idea** | Wording, looks, suggestions | A clearer label | The backlog, reviewed each release |

**Accessibility barriers** are never lower than S3, and S2 if a learner can't complete a task at all (CLAUDE.md rule 7).

## 5. Into the next release

- **Each week in the pilot:** the triager reviews new issues with severity S1 and S2, and the owning session picks them up.
- **Before each release:** the owner reviews S3 and S4 issues, and chooses what goes in. The release notes list the issues it fixes, by number.
- **After the pilot:** the issues and the teacher interviews feed the editor decision (19.8) and the plan for release 1.1 (workplan 6b).
- **Close the loop:** when an emailed issue is fixed, tell the sender if they asked to hear back.

## 6. What the DPIA covers

The feedback mailbox holds teachers' and parents' emails, and sometimes, despite the guidance, pupils' details. The DPIA (17.3, flow F9) covers it: the mail host as processor, the retention above, and the triage step that keeps personal data out of public issues. **[The DPIA names the host once the owner chooses it.]**
