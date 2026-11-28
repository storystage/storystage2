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

1. **Read it.** If it raises **safeguarding** (a worrying Prompter reply, anything about a child's safety), deal with it first: reply to the sender, confirm they've followed their school's procedure, and follow the safeguarding steps (section 7) the same day. Record a Prompter reply as an evaluation case for S7 (13.7), with no personal details.
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

The feedback mailbox holds teachers' and parents' emails, and sometimes, despite the guidance, pupils' details. The DPIA (17.3, flow F9) covers it: the mail host as processor, the retention above, and the triage step that keeps personal data out of public issues.

**The mailbox** (owner, 28 Nov 2026): **feedback@storystage.org**, and **andrew@storystage.org**, the code of conduct's address, are forwarded by **Bluehost**, the domain's host, to a **Microsoft 365** mailbox the owner keeps. Both are processors in the DPIA. Replies go out **as feedback@storystage.org**, so the mailbox's own address is never shown or published. Keep feedback emails in their own folder, so that deleting them 12 months after their issue closes is easy.

## 7. Safeguarding steps

**Draft by session D (28 Nov 2026), for the owner to approve and, ideally, for a safeguarding adviser to check before the pilot.** The code of conduct ("Children and safeguarding") points here.

StoryStage isn't a school and never meets the children who use it. Its part in safeguarding is to **pass a concern quickly to the people who can act on it** (the school, the police or the local authority), to stop harm spreading through the project's own spaces, and to fix the app when the app is the cause. It never investigates.

### Who

- **The project's safeguarding lead** is the owner. **[Open: a deputy, so that a concern is never stuck in one inbox; and basic safeguarding training for both, before the pilot.]**
- A safeguarding concern goes to the lead **the same day it arrives**, before any other feedback, from any address (feedback@, andrew@, a GitHub report or a comment).

### First, in every case

1. **Is a child in immediate danger?** Call the emergency services: **999** in the UK, **911** in the US. Then carry on below.
2. **Don't investigate,** question a child, or contact a child. Act on what you've been told.
3. **Don't copy or spread it.** No forwarding beyond the people who need it, no screenshots in public places, no pasting into an AI tool.
4. **Write it down** in the safeguarding log (below): the date and time, what was reported and by whom (their role), and what you did.

### Then, by kind of concern

| What | What to do |
|---|---|
| **A worrying reply from the Prompter** (unsafe, upsetting, or unsuitable for a child) | Reply to the sender the same day: thank them, ask that they've told their school's designated safeguarding lead, and ask for the exact words if they haven't sent them. File an issue at severity **S1: stop** (section 4) with the words and the setting, but no child's or school's details, and give it to S7 as an evaluation case (13.7). If it could happen to other learners before it's fixed, tell pilot schools how to switch the Prompter off with the school lock (decision 0022) until it is. Report it to Anthropic if its own safeguards failed |
| **A child may be at risk of harm** (something a child wrote or said in a story, or something an adult reports) | Ask the sender to follow their school's or club's safeguarding procedure, or, if they're a parent, to contact the local authority's children's services or the police. If the child can't be linked to a school or family who'll act, report it yourself: the police (**101** in the UK, or local police in the US), or for advice the **NSPCC helpline** (0808 800 5000, UK) or **Childhelp** (1-800-422-4453, US) |
| **A child's details in public** (a name, face, voice, school or named work in an issue, pull request, comment or file) | Hide or delete it at once; GitHub lets the repository's maintainers edit, hide and delete comments and issues. If it reached a commit, ask GitHub Support to remove it from the history. Tell the person who posted it, privately and kindly. If it was a child posting, delete it and don't reply to the child |
| **Sexual images or content involving a child** | **Don't open it again, download, forward or screenshot it.** Report it to the **Internet Watch Foundation** (UK) or **NCMEC's CyberTipline** (US), and to GitHub if it's on GitHub; tell the police. Ban the account under the code of conduct |
| **An adult behaving in a way that may harm children** (grooming, trying to contact a child through the project, sharing unsuitable content with children) | Remove the content and ban the account straight away (code of conduct, "Children and safeguarding"). Report it to the police, or to **CEOP** (UK) or **NCMEC** (US) if it's online abuse, and to GitHub |
| **A concern about someone who works with children** (a teacher, a club leader, a contributor who works in a school) | Pass it to the school's or club's designated safeguarding lead, or its head if the concern is about the lead. In England, the local authority's designated officer (**LADO**) takes allegations about adults who work with children; elsewhere, the local authority. Don't tell the person concerned |

### The safeguarding log

- Kept by the lead, **privately**: never in the feedback folder, a GitHub issue, this repository or an AI tool. One entry per concern: date, the role of who reported it, what was reported, who was told and when, and the outcome.
- Kept securely, and for as long as safeguarding advice says (**[open: ask the safeguarding adviser or DPO; often much longer than the 12 months for feedback emails]**).
- Reviewed after each concern: does the app, the teacher guide or these steps need to change?
