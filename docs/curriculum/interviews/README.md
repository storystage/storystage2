# Teacher interviews: the teacher's job (WP16.7)

Five conversations with teachers and a club leader, to find out **what a teacher would hire StoryStage to do**, in their own words and circumstances. The owner runs them; session D prepared this kit and writes them up (16.7 is "U interviews; C prepares questions and writes up").

- **Workplan:** 16.7. The findings go into the design doc's purpose section (`docs/design.md` §1, "The teacher's job"), and check other decisions (below).
- **Status:** kit ready. Interviews not yet held. Due at M1 (workplan section 8).
- **Licence:** CC BY 4.0 (decision 0041).

## What's here

| File | Use it |
|---|---|
| [guide.md](guide.md) | During the interview: the questions, in order, with timings and prompts |
| [information-and-consent.md](information-and-consent.md) | Before the interview: send it, and get the consent form back |
| [write-up-template.md](write-up-template.md) | Within a day of each interview: one write-up per interview |
| [synthesis-template.md](synthesis-template.md) | After all five: what they add up to, and what changes |

## What the interviews test

The design doc's draft of the teacher's job:

> *Help my class plan, build and present a story with code in a few lessons, on the devices we have, without my being a specialist, and with work I can mark.*

The interviews either confirm it, sharpen it, or replace it. They also check:

| Question | Current position | Where it's recorded |
|---|---|---|
| Is 6 to 13 the right age range? | Confirmed after the curriculum review | Decision 0039 (16.7 can reopen it) |
| Do the four curriculum templates and the eight use cases fit real lessons? | Drafts, for review with teachers | 16.6; `docs/curriculum/arc-templates.md`, `use-cases/` |
| Does storyboard first help or get in the way? | Settled | Decision 0012 |
| How much of the Prompter would a teacher let pupils use? | Four levels, teacher's choice | Decision 0034 |
| What would a teacher need to assess the work? | Not yet designed | Feeds 24.1 (the teacher's journey: "mark") |
| What do the mock-ups get wrong? | Approved before the interviews | Decision 0044 (changes come back as design change requests) |

**Not covered here:** devices, networks, accounts and approval, which the classroom ground-truth questions (`docs/spikes/classroom-questions.md`, 1.11) ask school IT managers. If a teacher raises them, note it and pass it on.

## Who to interview

Five people, as the workplan asks: computing, English, and drama or media teachers, and a club leader. A suggested spread:

| No. | Role | Phase | Why |
|---|---|---|---|
| 1 | Class teacher who leads computing | Primary (Years 3–6, P4–P7) | The strongest computing fit (KS1–KS2, First and Second level) |
| 2 | Class teacher, English or literacy focus | Primary (Years 1–4, P2–P5) | The youngest learners; traditional tales |
| 3 | English or drama teacher | Lower secondary (Years 7–9, S1–S3) | Shakespeare and staging; media education |
| 4 | Computing teacher | Lower secondary | The KS3 gap and the pathway to text code |
| 5 | Leader of an after-school coding, film or drama club | Any | Where the Prompter starts (route A, 24.3) |

**Across at least two nations,** to match the pilot (19.3), and ideally one teacher who teaches in Wales, where StoryStage fits best (`docs/curriculum/wales.md`). Former StoryStage 1 (TR1) pilot teachers are welcome, but include at least two who haven't seen StoryStage, so the answers aren't shaped by it.

## How to run them

- **45 minutes,** by video call or in person, at a time that suits the teacher. One interviewer; a second person to take notes if possible.
- **Talk about what they actually did,** not what they would do. Ask about a specific recent lesson or project. People are poor at predicting their own behaviour and good at describing it.
- **Show StoryStage only in Part C,** after they've described their own job, so the product doesn't shape the answers.
- **Don't sell.** If they ask "would it do X?", say what it does today, then ask why X matters to them.
- **Write it up the same day,** in the template, while it's fresh.

## Data protection

The interviews collect teachers' views, not pupils' data. To keep it simple and safe:

- **Consent first:** the information sheet and consent form ([information-and-consent.md](information-and-consent.md)), returned before the interview.
- **Recording is optional.** If the teacher agrees, record on the owner's own device, use it only to check the write-up, and delete it within 30 days. Never upload recordings to the repository or to an AI service.
- **The repository is public,** so write-ups name nobody: no names, schools, local authorities or towns. Use "Teacher A" to "Teacher E", their role, phase and nation. Quotes must not identify them or their pupils.
- **Keep the key** (which teacher is which letter, and contact details) privately, off the repository, and delete it when the study ends or a teacher asks.
- **Pupils:** ask teachers not to name or describe individual pupils. If they do, leave it out of the write-up.
- **AI tools:** don't paste notes containing names into an AI tool. Session D works from the anonymised write-ups only.

## What happens next

1. The owner holds the five interviews and fills in a write-up for each (`write-ups/teacher-a.md` and so on, created from the template).
2. Session D writes the synthesis from the write-ups, and proposes:
   - a revised "teacher's job" for `docs/design.md` §1, for the owner to approve;
   - changes to the templates and use cases (16.6);
   - any decision to reopen (for example the age range, 0039), as a `needs-owner` item;
   - design change requests for S5, if the mock-ups miss something.
