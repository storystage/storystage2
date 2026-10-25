# Trade mark clearance for "StoryStage" (WP17.6)

- **Status:** brief ready for the owner; clearance not started.
- **Workplan:** 17.6 (carried over from StoryStage 1 WP15.2, "Trade mark attorney clearance for StoryStage; EUIPO if used outside the UK"). U task: session D prepares, the owner and an attorney do it.
- **Checked:** 25 October 2026, by web search only. The UK IPO register blocks automated searches, so **no register search has been done**. Not legal advice.

## 1. Why it matters now

- **Store builds fix the name.** The app identifier `org.storystage.storystage2` can't change after the first store release (decision 0026, WP15.4–15.6, planned for M6). A rename after that means new store listings.
- **The pilot puts the name in front of schools.** Renaming after the pilot (WP19) costs goodwill, printed guides and website pages.
- **StoryStage 1's own answer:** "Keep the branding in one place so a rename is cheap". StoryStage 2 should do the same (handed to S5: the product name lives in one constant and one set of icon files).

## 2. What to protect

| Item | Detail |
|---|---|
| The mark | The word **STORYSTAGE** (one word). A logo can follow once the design (WP12) settles; a word mark covers any lettering. |
| Owner of the mark | Whoever will own StoryStage after the pilot (an open owner decision: maintainer, charity or university partner, design doc section 10). Filing in the owner's personal name and assigning later is possible but costs a second step. |
| Territory | The UK first (UK IPO). The EU (EUIPO) only if StoryStage is offered outside the UK; the US only if the apps go into US stores (see [anthropic-terms-under-18s.md](anthropic-terms-under-18s.md), decision 2). |
| Classes (Nice) | **9**: downloadable software and apps for education, animation and programming; downloadable teaching materials. **41**: education, teaching and training services; providing online non-downloadable teaching materials; organising workshops and clubs. **42**: providing temporary use of online non-downloadable software (the browser version); design and development of software. Optional **16**: printed teaching materials (the teacher guide, if printed). |
| UK fees | Online filing was due to rise to £205 for one class and £60 for each extra class on 1 April 2026 ([CITMA](https://www.citma.org.uk/resources/the-countdown-to-new-uk-ipo-fees-mb26.html)). Classes 9, 41 and 42 would then be £325. Check the UK IPO's fee page before filing. Attorney fees are extra. |

## 3. First knock-out findings (web search, not a register search)

| Found | Where | How close | Note |
|---|---|---|---|
| **Story Stage**, Scholastic Ltd | UK; a CD-ROM series, 2010 (for example *Story Stage: Jack and the Beanstalk*, ISBN 9781407113616), for ages 5–7: "a collaborative interactive … puppet-based literacy resource", children working together at one computer | **Very close:** same words, the same kind of goods (children's storytelling software), the same audience (UK primary schools) | Scholastic's shop says "not currently available". Whether Scholastic registered the name, and whether it still uses it, is the first thing for the attorney to check. A dormant, unregistered name is a much smaller risk than a registered one. |
| **STORY STAGE**, US application 98855490 | US Patent and Trademark Office; filed 15 November 2024, class 28 (educational card games; children's games for speech, reading, writing and language), first use claimed 30 November 2019 | Close in audience; different goods (games, not software) | US only; matters only if StoryStage goes into US stores. |
| **Story Stage** app | Apple App Store; an emoji storytelling game from an individual developer, first released October 2025 | Same words; software; groups and some education | No registration found. |
| **StoryStage 1** | Our own earlier use, in the TR1 pilot (`storystage/storystage`) | — | Our use gives some evidence of use (useful if someone else files later) but no registered right. |

**Distinctiveness.** "Story" plus "stage" comes close to describing a storytelling tool. The UK IPO may object that the mark is descriptive or not distinctive for storytelling software and education (Trade Marks Act 1994, section 3(1)(b) and (c)). Writing it as one word helps a little; a distinctive logo helps more. Ask the attorney.

**Overall:** medium risk. The Scholastic product is the main question.

## 4. What the owner does

1. **Search the registers yourself first** (free, about 30 minutes):
   - the UK IPO's [search for a trade mark](https://www.gov.uk/search-for-trademark): STORYSTAGE, STORY STAGE, STORY-STAGE, STORYSTAGES, in classes 9, 41 and 42, with similar words included;
   - [TMview](https://www.tmdn.org/tmview/), which covers the UK, the EU and most national registers at once;
   - note anything owned by Scholastic.
2. **Book a chartered trade mark attorney** (the [CITMA directory](https://www.citma.org.uk/) lists them; many give a free first call). Send them this page and your search results.
3. **Ask the attorney:**
   1. Does Scholastic, or anyone else, hold or use a right in "Story Stage" for software or education in the UK? Is a 2010 product that is no longer sold a risk (passing off, or a registered mark open to revocation for five years' non-use)?
   2. Is STORYSTAGE registrable in classes 9, 41 and 42, or will the UK IPO object that it describes the goods? Would a logo mark be safer?
   3. Which classes and wording should the specification use, for a free, non-commercial product that may later be run by a charity or university?
   4. Whose name should it be filed in, given that the long-term owner isn't settled?
   5. Do we need EU or US protection before offering the apps outside the UK?
   6. What does a clearance search and opinion cost, and how long does it take?
4. **Decide:** file, rename, or carry on unregistered with the known risk. Record the outcome as a decision in `docs/decisions/`.
5. **Domains:** confirm who controls `storystage.org` (decision 0026 assumes StoryStage does) and `storystage.org.uk` (the website, WP19.1).

## 5. If the answer is "rename"

Rename before the first signed store builds (WP15.4–15.6) and before the pilot's printed material. Session D drafts the shortlist with the same checks; S5 changes the name in its one place; S8 changes the app identifier while it still can.
