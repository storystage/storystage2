# Board Review: StoryStage 2 plan set — The Visionaries

**Artefacts:** the design doc *StoryStage 2: the next generation* (rev 85, 18 Oct 2026); the system architecture deck *StoryStage-architecture.pptx* (slides 4–12); the workplan *StoryStage2-workplan.md* (25 work packages); supporting: *StoryStage2-crosswalk.md*.

**Objective (Round 0):** give the owner, pilot schools and Claude Code a plan for StoryStage 2 that is worth building, reaches a classroom pilot in spring 2027 and can endure beyond it.

**Depth:** Full board. Round 1 independence was self-imposed, not structural.

**Verdict:** ADOPT WITH CHANGES. The trigger is seven surviving S3 findings; there is no veto and no S4. This is a proposition put up for decision, so read the verdict as adopting the plan with the changes below.

> **Independence warning.** The same model wrote all three artefacts and now reviews them, as Chair and every seat. That is the strongest form of the shared-model bias the protocol's design premise describes. Read this review as a structured self-critique, not as an outside opinion. An external teacher, a school IT manager and a second engineer would each add more than another board run.

---

## Round 0 — Intake

- **Artefact type:** product concept and programme plan (design doc, architecture, delivery plan).
- **Seats:**
  - Jobs `JOB`: seated, because the plan offers an experience.
  - Christensen `CHR`: seated, because success depends on schools adopting it.
  - Jacobs `JAC`: seated, because it acts on an existing community of practice (UK classrooms, Alice teachers, the TR1 pilot).
  - Hopper `HOP`: seated, because the plan has to be built.
  - Ostrom `OST`: seated, because the plan creates multi-party arrangements: an open Story API specification, pilot schools in a study, and commissioned assets. Ostrom's veto (V1) can't be reached here, because no scheme has been constituted yet.
- **Coverage gaps:**
  - Things this board never examines: financial modelling, legal review (CMU/EA licences, Children's code compliance), reception and press, and a detailed risk audit.
  - Things no board in the framework closes: counsel-grade legal advice, safeguarding professional review, and audited costs.
  - Things not examined in this run: learning-science evidence beyond the one study the doc cites, and accessibility conformance.
- **What didn't extract:**
  - **Doc drawings:** the three drawings (architecture, roadmap, milestone timeline) don't come through as text. The Chair viewed their renders, and their labels match the prose and slide 4.
  - **Deck:** shapes were extracted as text and the renders were viewed.
  - **Gantt chart:** the one-slide Gantt was not reviewed separately; its data comes from `schedule.py`, which the workplan's section 5a reproduces.
- **Finding budget:** at most 8 per critic across the set. Allocated as doc 3, deck 1, workplan 4, and moved on request; no reallocations were requested.

---

## Round 1 — Independent passes

### Jobs `JOB` — focus and end-to-end experience

**Preservation:**
1. **The storyboard-before-code rule** (doc §3 principle 3, §5): a brave exclusion that gives the product its point of view.
2. **"The story is the learner's"** (doc §1, §3 principle 2; workplan 13.5): the Prompter coaches, it doesn't write. This is the product's ethical spine.
3. **The theatre vocabulary run end to end:** Storyboard → Production stage → Screening room, Backstage, Rehearse.

**Findings:**

- **JOB1 — S3 — Unfocused first release; later strands compete for the binding constraint.**
  - *Location:* workplan §5a, wave 3 ("pathway, AR design mode, AR baker and the Projection stage start here"); doc §9 ("Your reviews and decisions are the real limit").
  - *Failure mode:* unfocused proposition.
  - *Grounds:* the release candidate carries three tabs, Backstage, two code editors, Prompter, speech in and out, MP4, five native targets plus a browser version, and `.a3p` import. On top of that, WP20–WP23 start from week 8.5–11.5 and draw on the same owner review time the doc names as the limit. The only explicit "no" in the set is the public showcase (workplan §6b).
  - *Repair (subtraction):* add a "Not before the release candidate" list. Hold WP20, WP21, WP22 and WP23 starts until the release candidate (their spikes 1.9 and 23.1–23.2 may run), and drop the Linux target from the first release. Then re-run `schedule.py` at six sessions.
  - *Test:* the critical path and the release-candidate date should not move, while owner review load in weeks 8–18 falls.

- **JOB2 — S3 — The teacher's journey is an unowned seam.**
  - *Location:* doc §5 ("What the learner sees" only); workplan 13.6 (the key is pasted per device in the set-up wizard); 15.3 (managed configuration carries policy keys, not the Claude key); 19.1 (website set-up guide).
  - *Failure mode:* experience seam.
  - *Grounds:* walking a teacher through it:
    1. Install on 30 iPads through device management.
    2. Put the Prompter key on each one.
    3. Set the school lock.
    4. Start a class.
    5. Pupils return to their work next lesson on a shared device.
    6. Collect the films.
    7. Export the study logs.
    8. Mark the work.

    Steps 2, 5 and 7 are owned by no task, and step 2 collides with the fixed decision "never stored in a settings file". The core experience still happens, because the browser version needs no key, so this is S3, not S4.
  - *Repair:* add doc §5a "What the teacher does", and a workplan task "class set-up and work between lessons" with a named owner. Record a decision on how a school puts one key on a class set of devices.

- **JOB3 — S2 — The vision promises strands the plan defers.**
  - *Location:* doc §1, vision.
  - *Failure mode:* committee compromise. The sentence lists cinema, AR, a building and industry tools to keep every strand represented.
  - *Repair:* cut the vision to the story → screen → next step arc, and leave AR and projection to the roadmap. For example: "Every young person in the UK can turn an idea into a story they have coded themselves, screen it for an audience, and carry what they learned into the next tools they use."

### Christensen `CHR` — demand and disruption

**Preservation:**
1. **The browser version with no Prompter:** a zero-friction entry point that serves non-consumers (schools that will never buy a key).
2. **The pilot as an adoption probe,** with a study built in (WP19).
3. **Alice `.a3p` import:** a bridge for existing Alice teachers, an honest nod to the installed base.

**Findings:**

- **CHR1 — S3 — The adopter's job is undefined.**
  - *Location:* doc §1 (purpose is written for the learner); workplan WP16 (curriculum mapping runs in parallel; templates and use cases arrive at weeks 5–8); WP12.1 (mock-ups at weeks 0–2).
  - *Failure mode:* job undefined.
  - *Grounds:* the adopter is the school or teacher, who chooses software, provisions devices and pays for any key. Their circumstance-based job is never stated. Something like "deliver KS3 computing and English or drama outcomes in N lessons, without a specialist, on the devices we have." The interface is designed before the job is known.
  - *Repair:* add a teacher job statement to doc §1, and make WP16.6's use cases an input to the WP12.1 mock-up review rather than a parallel output.
  - *Test:* five teacher interviews (computing, English, drama) before the mock-ups are approved.

- **CHR2 — S3 — No answer to "why would a school switch?"**
  - *Location:* doc §§1–2 (main body); CoSpaces appears only in appendix A1, as a feature source; Minecraft Education is absent.
  - *Failure mode:* best-customer capture and misclassified play.
  - *Grounds:*
    - The incumbents UK schools already use (Scratch at KS2, Python at KS3, CoSpaces Edu for 3D and AR coding, Minecraft Education) are not positioned against.
    - The distinctive features are storyboard-first and the Prompter. The Prompter needs a paid key and an adult account (doc §1 open question; workplan 13.6), so the differentiator carries the highest adoption friction.
  - *Repair:* add a short positioning paragraph to doc §2 (who is the non-consumer, and what job no incumbent does: story-first film-making with code and coaching). Make "would your school provide a key?" a recruitment question in WP19.3.
  - *Test:* the share of approached schools willing to fund a key.

- **CHR3 — S2 — Overshoot in pre-pilot work.**
  - *Location:* workplan WP20.5 (MetaHuman trial), WP23.6–23.7 (HAP sidecar, Pixera build script), WP22.3 (USDZ spike), all scheduled before the release candidate in §5a.
  - *Failure mode:* overshoot.
  - *Grounds:* no target adopter has asked for these, and the 11–14 classroom job doesn't need them before the pilot.
  - *Repair:* move them behind the pilot gate; keep the spikes only where they de-risk a first-release decision.

### Jacobs `JAC` — ground truth and place

**Preservation:**
1. **Builds on existing material:** Alice's vocabulary, its lessons through `.a3p` import, and its unfinished multi-scene work (doc §5 "What carries over").
2. **Measured on the devices schools have:** principle 4, and spikes on reference devices (WP1).
3. **Museum CC0 scans and AR trails** with partner venues: rooted in real places.

**Findings:**

- **JAC1 — S3 — Plan-view blindness about the classroom.**
  - *Location:* doc §3 principle 4; workplan 8.4 (local save, Safari download/upload fallback, Drive off by default); WP1.1 (reference devices not yet chosen). TR1 appears in the doc only as a memory figure (§5, 380 MB).
  - *Failure mode:* plan-view blindness.
  - *Grounds:* the TR1 pilot is running now, yet no observation from it shapes the design. Unobserved assumptions include lesson length, how many lessons a production spans, whether devices are shared between classes, where a pupil's work lives between lessons without accounts, and whether managed Chromebooks allow Android apps.
  - *Repair:* add WP1.11, "classroom ground truth": observe TR1 lessons and talk to two school IT managers. Decide "where a pupil's work lives between lessons" before WP8.4.
  - *Test:* minutes lost per lesson to finding and saving work; share of devices shared across classes.

- **JAC2 — S2 — The pathway skips the next step most UK learners actually take.**
  - *Location:* doc §1 ("on into the tools the creative industries use"), §8 (pathway to Unreal, Unity, Godot); workplan WP20.4.
  - *Failure mode:* unadapted transplant. An industry pathway is imported ahead of the local one.
  - *Grounds:* after KS3, most UK learners meet text programming for GCSE computer science (commonly Python). The plan's Python-like text view is the natural first step, but the pathway guide leads with Unreal Blueprints.
  - *Repair:* make "text view → Python" the first rung of the pathway guide, mapped to KS3 and GCSE in WP16. Keep Unreal and Unity as the later rung.

### Hopper `HOP` — implementation and accessibility

**Preservation:**
1. **Spikes on real devices before building** (WP1): the smallest demonstrations, in week 4.5.
2. **Open standards throughout:** glTF, VRM and H-Anim names, Fountain, the open Story API specification.
3. **Contracts first** (WP0.8), with a fake stage: parallel work made concrete.

**Findings:**

- **HOP1 — S3 — The schedule rests on an unmeasured capacity assumption.**
  - *Location:* doc lead and §9 (release candidate "26 Feb 2027"); workplan §5a ("8 (recommended)"); constraint §3.1 (development PC: 4 GB RAM, 2 cores, about 7 GB disk).
  - *Failure mode:* tradition-bound assumption. Durations are guessed, then treated as a plan.
  - *Grounds:* the plan doesn't say where eight Claude Code sessions run (local worktrees aren't feasible on the stated PC) or what owner review time it assumes, and no actuals are recorded. The doc lead states the date without the estimate caveat, which appears only in §9.
  - *Repair (probe):* run WP0 plus two spike lanes for two weeks, record actual durations and review hours, then recalibrate `schedule.py` at M1. Put "estimate, recalibrated at M1" in the doc lead.
  - *Test:* the M1 actuals against the plan.

- **HOP2 — S3 — No one is named to run StoryStage after the pilot.**
  - *Location:* doc §10 decisions (purchases listed as one-off owner tasks); workplan §8 (owner as the sole person for accounts, certificates and hosting).
  - *Failure mode:* orphaned operation.
  - *Grounds:* app-store accounts, certificates, hosting, commissioning, school support, security updates and the next release all rest on one person. No maintainer, organisation or funding route is named. The governance question goes to Ostrom.
  - *Repair:* add a one-page "Who runs StoryStage after the pilot" to doc §10, with options: a university partner, an education charity or CIC, or a relationship with CMU's Alice team. Add the decision to the owner checklist.

- **HOP3 — S2 — Jargon in a scene-setting doc.**
  - *Location:* doc §4 ("typed tree (the AST)", "WebXR", "glTF").
  - *Failure mode:* jargon barrier for partner and teacher readers.
  - *Repair:* a one-line gloss on first use of each term.

### Ostrom `OST` — governance and collective action

**Preservation:**
1. **The teacher-controlled policy locks** (`ar.enabled`, `ar.recording`, `study.enabled`, `editor.locked`): graduated controls that sit with the people governed.
2. **The study's consent, withdrawal and data-retention provisions** (WP19.6).
3. **Clear boundaries on Backstage contributions:** no outside drawings, licence-checked assets only.

**Findings:**

- **OST1 — S2 — The open specification has no rule-making process.**
  - *Location:* workplan 4.8 (publish the Story API as an open specification); WP3.3 (the animal joint sets published as an open extension).
  - *Failure mode:* imposed rules.
  - *Grounds:* it isn't stated who may change the specification, how proposals are made, how versions and deprecation work, or how teachers or the Alice community take part. The arrangement isn't constituted yet, so V1 can't be reached and this is advice.
  - *Repair:* a governance paragraph in `02-story-api.md`: maintainers, a lightweight proposal process, versioning, and the licence.

- **OST2 — S2 — The governed have no part in the study's decision rule.**
  - *Location:* doc §6 step 5; workplan 19.5 ("agreed before the pilot"; the owner approves).
  - *Failure mode:* imposed rules.
  - *Grounds:* pilot teachers run the study, yet have no voice in the rule that decides which editor their pupils keep.
  - *Repair:* co-design the decision rule with pilot teachers at recruitment, and publish it to them before the pilot starts.

- **OST3 — S2 — A shared key budget with no monitoring or graduated limits.**
  - *Location:* workplan 13.6 (a usage meter per device); 15.3 (no spending policy keys).
  - *Failure mode:* free-rider exposure.
  - *Grounds:* one school key on a class set is a common pool. Any pupil can use it up, and the only monitor is a meter on one device.
  - *Repair:* a class-level view of usage and graduated policy limits: a per-device daily cap, then Explain-only, then off.

**Vetoes:** none. Jobs's V1 was considered for JOB2 and not invoked, because the core experience still happens through the browser version. Ostrom's V1 can't be reached, because nothing has been constituted.

---

## Round 2 — Cross-examination

| Challenge | By → on | Ground | Defence | Outcome |
|---|---|---|---|---|
| C1 | CHR → JOB1 | Repair viability (creates a new defect) | An earlier draft of JOB1's repair also deferred speech input. That would remove a protected accessibility path for young and weaker readers (Hopper's "tools non-specialists can use"). Jobs narrows: speech input stays; only the Linux target and the WP20–23 starts are held. | **Sustained, repair narrowed.** Severity unchanged. |
| C2 | JOB → CHR3 | Scope (duplicate of JOB1) | Christensen: the evidence differs (no adopter demand), but the repair is the same subtraction. | **Merged** into JOB1 as `JOB1 [Jobs/Christensen]`, kept at S3. CHR3's ID is retired. |
| C3 | JAC → HOP3 | Severity (over-graded) | Hopper: the doc's readers are the owner and Claude Code, and §1 is plain. The jargon sits in an engineering section. Amends to S1. | **Struck** under the S0/S1 rule. |
| C4 | HOP → JAC1 | Repair viability (doesn't fix the defect) | TR1 classrooms run StoryStage 1 on Windows PCs, so watching them won't show iPad or Chromebook sharing. Jacobs narrows: TR1 observation for lesson length and persistence, plus two IT-manager conversations for device fleets and sharing. | **Sustained, repair amended.** |
| C5 | OST → JOB2 | Escalation (S3 → S4) | Ostrom argues the Prompter, a headline feature, can't be used by a class as described. Jobs declines: the storyboard → code → screen experience works without it. | **Declined** by the Chair: the promised core experience is achievable. Minority note recorded. |

---

## Chair's reframing

C1 and C2 together turn JOB1 from "cut features" into "protect the binding constraint." The surviving repair removes no learner-facing feature. It only holds later strands back until the release candidate, so the owner's review time goes to the critical path.

## Protected elements

- The storyboard-first rule.
- The Prompter that never writes the story.
- The theatre vocabulary.
- The browser version with no Prompter.
- The pilot with a built-in study, and its consent, withdrawal and retention provisions.
- `.a3p` import.
- Spikes on real devices before building.
- Open standards.
- Contracts first.
- The teacher-controlled policy locks.
- Licence-checked Backstage.

## Findings by severity

**S3**
- **JOB1 [Jobs/Christensen]** — workplan §5a wave 3, doc §9 — unfocused first release; later strands compete for owner review.
  - *Repair:* a "Not before the release candidate" list: hold the WP20–23 starts until the release candidate (spikes 1.9 and 23.1–23.2 may run) and drop the Linux target; keep speech input. Re-run `schedule.py` at six sessions. (C1 narrowed; C2 merged in CHR3.)
- **JOB2 [Jobs]** — doc §5; workplan 13.6, 15.3 — the teacher's journey is unowned (key on a class set, work between lessons, log export).
  - *Repair:* doc §5a "What the teacher does", a class set-up task with an owner, and a decision on putting one key on a class set. (Escalation C5 declined.) `repairs: OST3` (in part).
- **CHR1 [Christensen]** — doc §1; WP16, WP12.1 — the adopter's job is undefined.
  - *Repair:* a teacher job statement, WP16.6 as an input to the mock-up review, and five teacher interviews.
- **CHR2 [Christensen]** — doc §§1–2 — no positioning against Scratch, CoSpaces Edu or Minecraft Education; the differentiator carries a paid key.
  - *Repair:* a positioning paragraph, and a recruitment question on funding a key.
- **JAC1 [Jacobs]** — doc §3 principle 4; workplan 8.4, WP1.1 — classroom reality unobserved.
  - *Repair (amended in C4):* WP1.11 classroom ground truth (TR1 lessons for timing and persistence, two IT managers for fleets and sharing), and decide where work lives between lessons before WP8.4. `repairs: JOB2` (in part).
- **HOP1 [Hopper]** — doc lead, §9; workplan §5a, §3.1 — the schedule rests on unmeasured capacity.
  - *Repair:* a two-week probe, recalibration at M1, and the caveat in the doc lead.
- **HOP2 [Hopper]** — doc §10; workplan §8 — no one is named to run StoryStage after the pilot.
  - *Repair:* a one-page "who runs it after the pilot" with options, added to the owner's checklist.

**S2**
- **JOB3** — doc §1 — the vision lists deferred strands.
  - *Repair:* cut it to story → screen → next step.
- **JAC2** — doc §1, §8; WP20.4 — the pathway skips Python and GCSE.
  - *Repair:* text view → Python as the first rung.
- **OST1** — WP4.8, 3.3 — the open specification has no rule-making process.
  - *Repair:* a governance paragraph.
- **OST2** — doc §6; WP19.5 — teachers have no voice in the decision rule.
  - *Repair:* co-design it at recruitment.
- **OST3** — WP13.6, 15.3 — a shared key budget with no monitoring.
  - *Repair:* class usage view and graduated caps. `repairs:` partly discharged by JOB2's class set-up task.

**Struck:** HOP3 (C3).

## Minority notes

- **Ostrom, on JOB2:** "The doc sells the Prompter as the coach that makes StoryStage different. If no school can get it onto a class of devices, the promised experience is the browser version, and the plan should say so plainly."

## Coverage gaps

These carry forward to the next board:
- financial modelling;
- legal review (licences, Children's code);
- reception and press;
- detailed risk audit;
- learning-science evidence;
- accessibility conformance;
- review by anyone other than the authoring model.

## Suggested revision order

1. **HOP1:** recalibrate the capacity assumption first; every date depends on it.
2. **JOB1 [Jobs/Christensen]:** the "Not before the release candidate" list, then re-run the schedule.
3. **JAC1 → JOB2 → OST3**, as one block: observe classroom reality, then design the teacher journey and class set-up, then the key-budget limits.
4. **CHR1 → CHR2:** the teacher's job, then positioning; both feed the mock-up review (WP12.1).
5. **HOP2:** decide who runs it after the pilot.
6. **S2 batch:** JOB3, JAC2, OST1, OST2.

## Chair's process notes

- **Self-review:** the authoring model chaired and filled every seat. Convergence risk is at its maximum, and the mandatory challenges were the main counterweight. C1 and C4 changed repairs, so not every challenge was token.
- **Seams:** the Jobs/Christensen seam produced the expected duplicate (C2). The Jacobs/Jobs boundary was crossed by JAC1 repairing part of JOB2. That pair isn't declared in the board file, so a "teacher journey" class may want an explicit owner.
