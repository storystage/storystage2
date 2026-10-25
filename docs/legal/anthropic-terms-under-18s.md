# Anthropic's terms for products used by under-18s (WP17.5)

- **Status:** research done; the owner's decisions are open (section 4).
- **Workplan:** 17.5 (carried over from StoryStage 1 WP15.3): "Anthropic's terms for products used by under-18s, reflected in the wizard. (C researches; U decides)".
- **Checked:** 25 October 2026. Anthropic changes these pages; re-check before the pilot (WP19), when the Usage Policy version below takes effect, and whenever the Prompter's data flow changes. Not legal advice.

## 1. What the terms say

| Source | What it says that matters here |
|---|---|
| [Usage Policy](https://www.anthropic.com/legal/aup) (the version shown is effective 12 November 2026) | A minor is "any individual under the age of 18 years old, regardless of jurisdiction". Products serving minors must follow the additional guidelines in Anthropic's support article and all applicable laws. Chatbots that talk directly to users must "disclose to users that they are interacting with AI rather than a human", at least at the start of each chat session or in the product interface. Education is a high-risk area only for admitting, ranking or disciplining students. |
| [Guidelines for organisations serving minors](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors) (updated 16 March 2026) | Organisations may let minors use products built on the API if they add safeguards suited to the product, for example age verification, content moderation and filtering, monitoring and reporting, and educational resources for minors. Anthropic "may provide a child-safety system prompt, which organizations serving minors should implement". Organisations must comply with child-safety and data-protection law and say so publicly (on their website or similar). They must tell users they are talking to an AI. Anthropic audits; a persistently high violation rate can lead to suspension. No minimum age is given. |
| [Child safety guidance for developers](https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers) (updated 26 June 2026) | Anthropic's own consumer services are 18 and over. The Usage Policy bans anything that compromises children's safety; the developer is responsible for safeguards on their deployment. Platforms outside the US check their local reporting duties. Suggests logging for transparency reporting. |
| [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) (effective 17 June 2025) | The API is "not for consumer use". The customer "is responsible for all activity under its account", must tell its users that outputs should be checked before being relied on, and someone accepting for an organisation needs authority to bind it. "Anthropic may not train models on Customer Content from Services." No age rule for end users. |

## 2. What this means for StoryStage 2

1. **Under-18s may use the Prompter**, as long as the safeguards are built in. There is no age floor in Anthropic's terms; the ICO Children's code (WP17.3) sets the stricter bar.
2. **The key holder, not StoryStage, is Anthropic's customer.** Each school, club or adult uses their own Claude account, so the duties in the guidelines fall on them. StoryStage has no server and no Anthropic account of its own in this flow. StoryStage's job is therefore to **build the safeguards in, so a key holder who uses StoryStage as designed meets Anthropic's guidelines without extra work**, and to tell them plainly what they are agreeing to.
3. **A learner can never hold the key.** Anthropic's own services are 18 and over, and the API is not for consumer use. The adult rule carried over from StoryStage 1 ("The Claude account must belong to an adult (18 or over): a parent, teacher or school") stays. A parent at home is the grey case (section 4, decision 1).
4. **No training on learners' text.** The Commercial Terms forbid Anthropic training on customer content. The privacy notice (17.4) can say so, with a link.

## 3. Requirements for the build

Each requirement names the session that owns the work. Session D checks them again in the DPIA (17.3).

| No. | Requirement | Anthropic's ask | Owner |
|---|---|---|---|
| R1 | **The adult gate.** The wizard's first page says the Claude account must belong to an adult (18 or over) acting for a school, club or family, and that they are Anthropic's customer, responsible under their own agreement with Anthropic. The adult ticks a box to confirm both before going on. Learners never see the key steps. | Age verification (proportionate: no accounts, so this is age assurance for the key holder, not the learner) | S8 (wizard, spec 05) |
| R2 | **Always say it's an AI.** The Prompter panel says, in words a six-year-old understands, that the Prompter is a computer helper, not a person ("The Prompter is a computer program. It isn't a person."), at the top of every new conversation and on the panel itself. Spoken replies say it too. | AI disclosure at the start of each session or in the interface | S7 (Prompter), S5 (panel) |
| R3 | **Child-safety instructions in the system prompt.** The Prompter's instructions include child-safety rules: age-appropriate language, never asking for personal information, steering away from unsafe topics, suggesting a trusted adult if a learner seems upset (carried over from StoryStage 1's privacy notice). If Anthropic supplies a child-safety system prompt, it is added in full. | The child-safety system prompt | S7 (13.x, spec 04) |
| R4 | **Narrow by design.** The Prompter only coaches and builds the learner's production with StoryStage's own tools; it sees text only (rule 3: no camera images, audio or pictures); it never writes the story (rule 4); learner text is passed as delimited data (13.2). The evaluation set has child-safety and prompt-injection categories (13.7). | Content moderation and filtering | S7 |
| R5 | **The teacher can see and switch off.** The school or exam lock and Explain-only mode stay (decision 0022). A teacher can read the Prompter conversations held on the device and remove them; nothing is sent to StoryStage. The learner is told plainly, on the panel, that their teacher can read them (ICO Children's code, standard 11, parental controls). | Monitoring | S8 (policy), S7 (history) |
| R6 | **Report a problem** (18.5) covers a worrying Prompter reply: the teacher gets a local bundle and plain guidance on where to report (Anthropic's route, and UK safeguarding routes such as the school's designated safeguarding lead). Nothing is sent automatically. | Reporting | S1 (18.5), D (teacher guide 19.2) |
| R7 | **Teach what the Prompter is.** The teacher guide and a short in-app explainer cover what the Prompter is, what it sees, why it can be wrong, and that its suggestions should be checked. | Educational resources; the Commercial Terms' "check outputs" notice | D (19.2), S5 |
| R8 | **Say publicly that we comply.** The privacy page on the website states how StoryStage meets UK GDPR and the ICO Children's code, and links the DPIA summary. | Public statement of compliance | D (17.4, 19.1) |
| R9 | **No grading.** The Prompter never ranks, marks or judges learners' work for assessment, so StoryStage stays outside Anthropic's high-risk education uses. Any future assessment feature needs a fresh check. | High-risk area: education | S7 |

**Handed on:** StoryStage 1's wizard had a "let the Prompter see the scene" option (carried-over spec 02, page 4). StoryStage 2's rule 3 forbids pictures going to the Prompter, so that option doesn't carry over; S8 to note it in spec 05.

## 4. Decisions for the owner

1. **May a parent at home hold the key?** Route A (clubs and home) is the pilot default in 24.3, but the Commercial Terms say the API is "not for consumer use". *Recommended:* allow it, with the adult gate (R1) wording the parent as responsible under their own agreement, and ask Anthropic to confirm (draft below). If Anthropic says no, the wizard drops "family" and home use waits.
2. **Where are the apps offered?** Anthropic's guidelines name US law (COPPA) as an example; apps in every country's store bring every country's children's law. *Recommended:* the first release and the pilot in the UK app stores only; widen later after a check.
3. **Ask Anthropic for its child-safety system prompt?** *Recommended:* yes, in the same email.

### Draft question to Anthropic (for the owner to send, if decision 1 or 3 is yes)

Send through Anthropic's support or sales contact form from the Claude account you will use for the pilot.

> **Subject:** Children's education product built on the API: key holders and the child-safety system prompt
>
> Hello. I run StoryStage, a free, non-commercial app that helps children aged 6 to 13 in UK schools and clubs make 3D animated films. It has an optional Claude assistant, the Prompter. StoryStage has no server: each school, club or adult enters their own API key, which stays in the device's secure store, and requests go straight from the device to Anthropic. We follow your guidelines for organisations serving minors: AI disclosure, child-safety instructions, text-only requests, a teacher lock, and no grading.
>
> 1. Is it within your terms for a teacher, a club leader or a parent to use their own Console account and key with StoryStage for children in their care, with each of them as your customer?
> 2. Your guidelines mention a child-safety system prompt. Could you share it, so we can build it into the Prompter?
>
> Thank you.
