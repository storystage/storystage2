# The editor study: protocol for pre-registration (WP19.5)

- **Status:** **draft**, for the owner to approve with the pilot teachers ("C drafts; U approves with the teachers"). The decision rule (section 8) is co-designed with them at recruitment and published to them before the pilot starts (board review finding OST2). Once agreed, it is **frozen and pre-registered** (section 10) before the first study lesson. Any later change is a recorded deviation (section 11).
- **Written:** 8 November 2026, by session D.
- **Decision being informed:** decision 0009. StoryStage 2's first release has two code editors over the same program: **Blocks** (option B, Blockly styled like Alice's tiles) and **Tiles** (option C, an Alice-style tile editor rebuilt in React). Learners can switch at any time, and the teacher sets each class's default. "A pilot study decides which one continues." The decision is recorded in WP19.8; the other editor is removed or kept for the long term in release 1.1.
- **Builds on:** the study build (7.13, S5 and S6), the study log export (24.6), the pilot (19.3), consent and ethics (19.6, [information-and-consent.md](information-and-consent.md)), the DPIA (`docs/dpia.md`, flow F8 and risk R6), and the Code Bench board review's findings TEST2 and ADV4.
- **Licence:** CC BY 4.0 (decision 0041).

## 1. Why the study

Keeping two editors costs time in every later release: two sets of interfaces to build, test and explain. Each may suit learners differently. Blocks looks like the block editors many already know; Tiles shows a program's structure in rows and stops invalid code by construction. The study asks which one serves learners aged 6 to 13 better in real lessons, so that only one editor need continue, or so that both are kept for a clear reason.

## 2. Research questions

| No. | Question | Main measure |
|---|---|---|
| RQ1 | With which editor do learners more often complete short programming tasks correctly? | Task success (section 5) |
| RQ2 | With which editor do learners reach a correct program faster? | Time to success |
| RQ3 | Does the answer differ by age band (6–8, 9–11, 12–13)? | RQ1 and RQ2 by band |
| RQ4 | Which editor do learners choose when free to switch, and which do they say they prefer? | Switches; preference |
| RQ5 | Which do teachers judge better for their class, and why? | Teacher interviews (19.7) |

**No directional hypothesis** is pre-registered for RQ1 or RQ2: there is no good evidence in advance that either editor is better for this age range. The study is a decision study, not a test of a theory, and section 8 says in advance how its results decide.

## 3. Design

**Setting:** the pilot (WP19.3): 2 or 3 schools in at least two UK nations, plus at least one after-school club, in spring 2027.

**Unit of allocation: the class.** Each class has a default editor set by the teacher (decision 0009). Within each school, classes are paired by year group (or the nearest), and one class in each pair starts with **Blocks** and the other with **Tiles**. A coin toss, recorded before the pilot, decides which. A school with an odd class out alternates against the school's previous pair. The club does the same across its groups. This balances the editors across ages and schools (workplan 19.5: "alternated between classes").

**Two phases, in each class:**

| Phase | Lessons | Editor | What it answers |
|---|---|---|---|
| **A. Assigned** | Study tasks T1 to T3 (section 4) | The class's default, **locked** during the study tasks (`editor.locked`), so the comparison is fair | RQ1 to RQ3 |
| **B. Free** | Study tasks T4 and T5, then normal lessons | Either: the lock is lifted, and learners may switch | RQ4, and RQ1 to RQ2 as a secondary analysis |

Locking during phase A is a **proposal** for the teachers. Without it, learners who switch would mix the two editors in one task, and RQ1 couldn't be answered cleanly. Outside the study tasks, the lock follows the teacher's normal choice.

**Not a controlled trial.** Classes differ in many ways, and allocation is by class, not by learner. The results inform a product decision; they aren't evidence about learning in general, and won't be reported as such.

## 4. The study tasks (built into StoryStage, 7.13)

Each task opens a prepared production with a storyboard and an empty (or, for T5, a broken) frame. It ends when the learner presses **Check my step**, which runs the frame and compares its **end state** with the task's target. The tasks use only blocks that exist in both editors (parity, 7.12).

| Task | What the learner does | Concept | End state checked | Ages |
|---|---|---|---|---|
| T1 Say hello | Make the cat walk to the tree, then say "Hello" | Sequence | The cat is at the tree, facing it, and has said "Hello" | All |
| T2 Together | Make the owl fly to the gate while the cat turns to watch | Do together | Both actions overlap in time; both end in place | All |
| T3 Three hops | Make the rabbit hop three times | Repetition (count) | Three hops recorded; the rabbit ends three hops along | All |
| T4 Click me | When the learner clicks the dog, it barks | Events | A simulated click triggers "bark" | 9–13 (6–8: optional) |
| T5 Fix it | A frame where the fox turns the wrong way; make it match the storyboard | Debugging | The fox faces the hen at the end | All |

- **About 10 minutes each** for a 9-year-old, to be tested before the pilot (section 10).
- **Same wording, pictures and production in both editors.** Only the editor differs.
- **Reading support:** each task's instruction can be read aloud, for the youngest learners.

## 5. Measures

Each one is recorded on the device in the pseudonymous study log (7.13), except teacher views.

| Measure | Definition | Notes |
|---|---|---|
| **Task success (primary)** | The learner's last **Check my step** in the task shows the target end state, within 15 minutes | Checked by the runtime, not judged by a person. An **error** means an observably wrong end state at a Check, **not** an invalid edit: Tiles prevents invalid edits by construction, so counting them would measure the editor's design, not the learner (board finding TEST2) |
| **Time to success** | From the task opening to the first successful Check | Learners who don't succeed are censored at 15 minutes |
| **Checks before success** | Number of unsuccessful Checks | A secondary sign of difficulty |
| **Help requests** | Opening a guided step's **Show me where**, or Learn, during the task | The Prompter is **Off** during study tasks, so it can't confound help (`prompter.enabled` locked off for phase A and B tasks) |
| **Undo rate** | Undo steps per minute of task | |
| **Switches** | Changes of editor, and the direction, in phase B | RQ4 |
| **Ease** | After each task: "How easy was that?" (three faces: hard, OK, easy) | One of 7.13's two questions |
| **Preference** | After T5: "Which way of coding would you choose next time?" (Blocks, Tiles, don't mind) | The other question |
| **Teacher views** | A short interview with each pilot teacher (19.7) | Recorded as in the 16.7 kit |

**Not recorded** (7.13; the DPIA, F8): names, program content, camera images, voice, or any device identifier. Each session has a new random id, so a learner can't be followed across sessions. That is a deliberate limit: analysis is per task attempt, not per child.

## 6. Who takes part

- **Schools and clubs** in the pilot that agree to the study (a school can pilot StoryStage without it).
- **Classes** whose teacher agrees.
- **Learners** whose parent or carer gives written consent, and who themselves agree (assent) on the day ([information-and-consent.md](information-and-consent.md)). Others do the same lessons, but **their sessions aren't logged**: a "taking part in the study" choice at the start of each session, set to "no" for them, means no log is kept (a requirement for the study build, 7.13).
- **Expected numbers:** roughly 6 to 10 classes, 150 to 250 learners, and 600 to 1,000 task attempts. Too few for fine-grained statistics, enough to see a clear difference if there is one (section 7).

## 7. Analysis

Pre-registered now, so the results can't steer the method:

1. **Descriptive, by editor:** task success rate and median time to success, for each task, overall and by age band, with 95% intervals that allow for classes (a cluster bootstrap over classes).
2. **Model, if numbers allow** (at least 6 classes and 400 attempts in phase A): a mixed-effects logistic regression of success on editor, task and age band, with class and school as random effects; and a survival model for time to success.
3. **Phase B:** the proportion of learners who switch, in each direction, and the preference answers, by default editor (to see the effect of starting with one).
4. **Teacher views:** themes from the interviews, reported with quotes that identify nobody.
5. **Data quality:** attempts shorter than 30 seconds, or with no edits, are excluded as "not attempted", and counted. Sessions are excluded only by these rules.
6. **Report:** a short report against the decision rule (19.8), with every exclusion and deviation listed.

## 8. The decision rule (co-designed with the pilot teachers)

**Proposed,** to be agreed with the teachers at recruitment and frozen before the pilot. The thresholds are proposals; the teachers may change them before the freeze.

Applied in order, stopping at the first that decides:

1. **Accessibility first.** An editor that fails the accessibility checks (WCAG 2.2 AA, and every task by keyboard alone, from WP12 and WP18) can't be the only editor kept.
2. **Keep both** only if each clearly suits a different group: in one age band, one editor's task success is at least **10 percentage points** higher, and in another band the other editor's is at least 10 points higher, and both differences hold in at least two schools. The teacher guide then recommends a default by age.
3. **Otherwise keep the editor with higher task success** in phase A, if the difference is at least **5 percentage points** and its 95% interval excludes zero.
4. **Otherwise, the faster median time to success,** if at least **15% faster**.
5. **Otherwise, learner preference** at the end of phase B, if one editor is chosen by a majority of those expressing a preference.
6. **Otherwise, teacher views,** if most pilot teachers prefer one.
7. **Otherwise, the lower cost of keeping it,** judged by the owner and recorded: maintenance, accessibility, and how well it serves the pathway to text code (16.8, WP20).

The owner records the outcome as a decision (19.8), and plans the other editor's removal, or its long-term support, for release 1.1.

## 9. Ethics

- **Review:** ideally by a university partner's ethics committee (workplan 19.5–19.6; the owner is seeking one). Without one, by an independent reviewer with research-ethics experience in education, before the pilot. The owner records which.
- **Guidance followed:** the British Educational Research Association's *Ethical Guidelines for Educational Research* (current edition), and the DPIA.
- **Consent and assent:** [information-and-consent.md](information-and-consent.md).
- **Burden:** five tasks of about 10 minutes each, inside normal lessons that teach the curriculum anyway (`docs/curriculum/`). No extra homework, testing or time out of class.
- **No disadvantage:** every learner can use either editor outside the locked study tasks, and the editor kept after the study will be the better-supported one.
- **The Prompter is off** during the study tasks, so no learner's request goes to Anthropic as part of the study.

## 10. Before the pilot

| Step | Who | When |
|---|---|---|
| Recruit schools; co-design and agree the decision rule with the teachers | Owner, with D | Recruitment (19.3) |
| Ethics review | Owner (partner or reviewer) | Before pre-registration |
| Try the five tasks with a few learners (not in the study) in each age band; adjust the timing and wording | Owner, D | Before pre-registration |
| Build and test the study tasks, the log, the "taking part" choice and the export (7.13, 24.6) | S5, S6 | WP7t |
| **Pre-register:** freeze this protocol, with the agreed rule and the coin tosses, on the Open Science Framework (osf.io), and tag the commit here | Owner, D | Before the first study lesson |

## 11. Deviations

Any change after pre-registration is listed here with its date, reason, and whether it was made before or after seeing any results.

| Date | Change | Why | Before results? |
|---|---|---|---|
| | | | |

## 12. Requirements for the study build (7.13, 24.6)

For S5 and S6, from this protocol and the DPIA. They are requirements on 7.13, not changes to their packages.

1. **The five tasks** (section 4), each with a target end state checked by the runtime, the same in both editors.
2. **"Taking part in the study?"** at the start of each session, set by the teacher or learner; "no" keeps no log for that session.
3. **The log** records only section 5's measures, under a new random id per session, with no device identifier, names, program content, camera or voice.
4. **The Prompter is held Off** during study tasks.
5. **Export** gives the teacher one file; **after a confirmed export, the logs are deleted from the device**, and unexported logs can be deleted at any time (DPIA §4.4).
6. **The teacher can delete a session** before export (withdrawal).
