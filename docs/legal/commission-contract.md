# Commissioning contract for 3D artists (WP17.9)

- **Status:** template, for the owner to approve **with legal advice** before first use.
- **Workplan:** 17.9, "a short contract template for 3D artists that assigns copyright to the project, grants a credit, and confirms the work is original. (C drafts; U approves, with legal advice)". Used for the storybook cast (WP3.6) and any later commission.
- **Written for:** the law of England and Wales. If the owner or the artist is in Scotland or Northern Ireland, ask the solicitor whether to change clause 15. Not legal advice.

## Notes for the owner (not part of the contract)

### Why each part is there

| Clause | Why |
|---|---|
| 5 Assignment | A freelance artist owns the copyright in what they make, even when paid for it, unless they assign it in writing, signed (Copyright, Designs and Patents Act 1988, section 90(3)). The assignment also covers future work (section 91), so it applies the moment each model is made, and UK design right, which since 2014 belongs to the designer of a commissioned design, not the commissioner. |
| 6 Moral rights | StoryStage will reduce, re-rig and recolour the models, and learners will animate them in ways nobody can predict, so the artist waives the right to object to "derogatory treatment" (section 80; a waiver must be in writing, section 87). The artist keeps their credit through clause 7 instead. |
| 8 Originality | The rights check (17.8) only works if the artist designs from public-domain sources and can show it: the reference log is part of the delivery. |
| 8.4 No generative AI | AI-made images and meshes bring unclear copyright (section 9(3)) and a risk of copying protected designs. Change it only if you decide to allow it, and then require the tool and prompts to be logged. |
| 9 Licence back | Artists need a portfolio. This lets them show the work without owning it. |
| 11 Liability | Proportionate for a freelancer: capped at the fee, except for the originality promise. |

### Decisions before first use

1. **Who is "the Commissioner"?** "The project" is not a legal person. Until an organisation exists (the open decision on who runs StoryStage after the pilot), the contract has to name you personally, trading as StoryStage. Clause 5.3 lets you pass the rights on to a charity, company or university partner later without asking the artist again.
2. **The licence the cast is published under.** Clause 5.4 lets you publish the models under any licence. Choose one before the first release (for example CC BY 4.0, so schools and other projects can reuse them with credit, matching the Apache-2.0 spirit of decision 0025), and record it as a decision.
3. **Fee and payment** (Schedule 2): the budget is an open owner decision (WP3.6, due at M2).
4. **Legal review:** a solicitor checks the template once; after that, each commission fills in the schedules only.

### After signing

The owner keeps the signed copy. Session D writes a permission record, `docs/legal/permissions/commission-<artist>-<year>.md` (format in [README.md](README.md#permission-records)), quoting clauses 5, 6 and 7, with the credit line word for word. Every delivered model then goes into `backstage.json` with `licence: "permission"`, `permission` pointing at that record, and `credit` set from clause 7 (S4, WP3.4). The artist's name and work email may appear in the record only if the artist agrees (clause 13).

---

# Commission agreement: StoryStage character models

**This agreement is made on** [date]

**between**

1. **[Name], trading as StoryStage,** of [address for notices] (**"the Commissioner"**); and
2. **[Artist's name]** of [address for notices] (**"the Artist"**).

## 1. What this agreement is for

1.1 StoryStage is a free, non-commercial tool for young people to make 3D animated films. The Commissioner wants original 3D character models for StoryStage's model library ("Backstage"), and the Artist agrees to make them on the terms below.

1.2 The models, their designs and everything the Artist delivers under this agreement are called **"the Work"**. Schedule 1 (the brief) lists what the Work is.

## 2. The Work

2.1 The Artist will make and deliver the Work as described in Schedule 1, by the dates in Schedule 1.

2.2 The Artist will do the Work personally and will not subcontract any part of it without the Commissioner's written agreement.

2.3 The Artist is an independent contractor, not an employee, and is responsible for their own tax and National Insurance.

## 3. Review and acceptance

3.1 Within 10 working days of each delivery, the Commissioner will either accept it or tell the Artist in writing what doesn't meet Schedule 1.

3.2 The Artist will make the changes and deliver again. The fee covers two rounds of changes for each model; further changes are paid at the day rate in Schedule 2, if agreed in writing first.

3.3 If the Commissioner says nothing within 10 working days, the delivery is accepted.

## 4. Fee

4.1 The Commissioner will pay the fee in Schedule 2, at the stages in Schedule 2, within 30 days of receiving a valid invoice.

4.2 The fee covers everything in this agreement, including the assignment in clause 5 and the waiver in clause 6.

## 5. Copyright and other rights

5.1 The Artist assigns to the Commissioner, with full title guarantee, all copyright, design rights (registered and unregistered) and all other intellectual property rights in the Work, everywhere in the world, for their full term and any renewal or extension. This assignment includes rights in Work not yet made: it takes effect for each part of the Work as it is created.

5.2 The Artist will sign any further document the Commissioner reasonably asks for to confirm or record the assignment, at the Commissioner's cost.

5.3 The Commissioner may pass the rights on to any person or organisation that takes over StoryStage (for example a charity, company or university), without the Artist's further agreement.

5.4 The Commissioner may use, change, adapt, reduce, re-rig, animate, combine, translate and publish the Work, in any form and under any licence, including open licences that let others reuse it. Young people using StoryStage may animate the Work in their own films and share those films.

## 6. Moral rights

6.1 The Artist unconditionally and irrevocably waives, in favour of the Commissioner, everyone it passes the rights to, and everyone using the Work under a licence from them, the right to object to derogatory treatment of the Work (section 80 of the Copyright, Designs and Patents Act 1988), and any similar right anywhere in the world.

6.2 The Artist asserts the right to be identified as the author of the Work (section 77), which the Commissioner will meet through the credit in clause 7.

## 7. Credit

7.1 The Commissioner will credit the Artist, in the words the Artist chooses in Schedule 1 (a name, a pseudonym, or no credit), wherever StoryStage lists credits for its models: the app's credits screen, the credits generated for learners' exported films, and the website.

7.2 A failure to credit by mistake is not a breach if the Commissioner puts it right within 30 days of being told.

## 8. Originality

8.1 The Artist promises that the Work is their own original work, and that using it as this agreement allows will not infringe anyone's copyright, design right, trade mark or other right.

8.2 The Artist will design each character only from the public-domain sources named for it in Schedule 1, and will not copy, trace or refer to any film, television programme, game, toy or modern book version of the character.

8.3 The Artist will keep a reference log (Schedule 3) listing every reference image or text used, with its source and date, and deliver it with the Work.

8.4 The Artist will not use generative AI tools to make any part of the Work (designs, meshes, textures or rigs) unless the Commissioner agrees in writing first.

8.5 The Artist will not include anyone else's material (textures, meshes, rigs, fonts) except material listed in Schedule 1 as allowed (for example CC0 textures), recorded with its source in the reference log.

8.6 If the Artist learns that any part of the Work may infringe someone's rights, they will tell the Commissioner straight away.

## 9. The Artist's portfolio

9.1 The Commissioner grants the Artist a free, non-exclusive, permanent licence to show images and videos of the Work in their portfolio, on their website and social media, and in applications for work, with a mention of StoryStage. This licence does not allow selling the Work or licensing it to anyone else.

9.2 The Artist may start showing the Work once it is accepted, or earlier with the Commissioner's agreement.

## 10. Ending the agreement

10.1 Either party may end this agreement by writing to the other if the other seriously breaks it and does not put it right within 14 days of being asked to.

10.2 The Commissioner may end this agreement at any time by writing to the Artist. The Commissioner will then pay for Work accepted, plus a fair share of the fee for Work in progress, based on the time spent at the day rate in Schedule 2, up to the fee for that model.

10.3 When the agreement ends, the Artist will deliver all the Work done so far. The assignment (clause 5) covers all Work paid for. Clauses 5 to 9, 11 and 13 continue after the agreement ends.

## 11. Liability

11.1 Neither party is liable to the other for indirect or consequential loss.

11.2 Each party's total liability to the other under this agreement is limited to the total fee in Schedule 2, except for:
- (a) a breach of the Artist's promises in clause 8;
- (b) the Commissioner's duty to pay the fee;
- (c) anything the law doesn't allow to be limited, such as death or personal injury caused by negligence, or fraud.

## 12. Confidentiality

12.1 Until StoryStage publishes the Work, the Artist will keep the brief and the unpublished Work confidential, apart from what clause 9 allows.

## 13. Personal information

13.1 The Commissioner will use the Artist's personal information only to run this agreement and to give the credit in clause 7. StoryStage's source code and records are public, so the Artist's name appears there only as the credit in Schedule 1 chooses, and their contact details never appear there unless the Artist agrees in writing.

## 14. Everything else

14.1 This agreement is the whole agreement between the parties about the Work. Changes must be in writing and signed by both.

14.2 Notices are given by email to the addresses in Schedule 2, or by post to the addresses at the top.

14.3 Nobody other than the parties and anyone the rights pass to under clause 5.3 may enforce this agreement (Contracts (Rights of Third Parties) Act 1999).

## 15. Law

15.1 This agreement is governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.

**Signed** (the assignment in clause 5 needs both signatures; an electronic signature is fine)

| | The Commissioner | The Artist |
|---|---|---|
| Signature | | |
| Name | | |
| Date | | |

---

## Schedule 1: The brief

| Item | Detail |
|---|---|
| Characters | [List each character, with the public-domain sources to design from and what to avoid, copied from `docs/legal/storybook-characters.md`] |
| Style | [One consistent style for the whole cast, from the design brief, WP3.6] |
| Format | glTF 2.0 (`.glb`), with the source files (for example `.blend`) |
| Rig | Humanoids rigged to VRM 1.0 bone names, including a mouth joint for lip sync; animals rigged to StoryStage's quadruped, flyer, swimmer or slitherer joint sets (`docs/spec/10-crosswalk.md`) |
| Budget | At most [n] triangles and [n] px textures per character (set from WP3.9) |
| Also deliver | Turnaround renders from four sides; a T-pose or A-pose; the reference log (Schedule 3) |
| Allowed outside material | [For example CC0 textures from Poly Haven or ambientCG, logged with their source; otherwise none] |
| Delivery dates | [Per character, or in batches] |
| Credit | [Exactly as the Artist wants it, for example "Character design and model by A. Artist"; or a pseudonym; or "no credit"] |

## Schedule 2: Fee and payment

| Item | Detail |
|---|---|
| Fee | £[amount] for the Work, or £[amount] per character |
| Stages | [For example 30% on signing; 70% on acceptance of each character] |
| Day rate for extra changes | £[amount] |
| VAT | [Added if the Artist is VAT-registered] |
| Email for notices | Commissioner: [email]. Artist: [email] |

## Schedule 3: Reference log

One row for every reference used, delivered with the Work.

| Character | Reference (title, illustrator or author, year) | Where it came from (URL, library, book) | Public domain because | Used for |
|---|---|---|---|---|
| | | | | |
