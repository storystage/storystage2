# Owner's brief

What only you can do, when, and how to keep eight sessions moving.

## In the first two weeks

1. **Create the repository** `storystage/storystage2`, commit this pack as laid out in `handover/README.md`, and start S1 with its kickoff prompt (it includes the first-session instructions in workplan section 11).
2. **Send the CMU and EA letters** (WP17.1, 17.7). Session D drafts them on day one; the commissioned cast and the shipped Alice models wait on the answers.
3. **Choose the reference Chromebook and iPad** (WP1.1). It has only half a week of slack: the spikes can't run on devices without it.
4. **Approve the interface mock-ups** (WP12.1) when S5 sends them.
5. **Book two or three TR1 lessons and two school IT managers** (WP1.11), and five teacher interviews (WP16.7).
6. **Record your review hours** for the first two weeks (WP1.12). If you can't review eight sessions' pull requests within a day or two, cut to six (pause S6, the Tile editor, first); workplan section 5a shows the cost.

## Reviewing

- Review pull requests labelled `critical` first, then `needs-owner` questions, then the rest.
- Keep contract pull requests (WP0.8, and any later contract change) at the top: other sessions code against them.
- Glance at `docs/lanes.md` daily; it shows who is blocked on whom.

## Items that need you, in date order

From the schedule with the session roster in `handover/README.md`. "Owner only" items have no Claude Code session.

| Item | What | Session | Planned | Status |
|---|---|---|---|---|
| WP1.1 | Choose reference devices (1.1) | owner only | wk 0 (19 Oct 2026) | 0.5 weeks of slack |
| WP1g | Classroom ground truth: TR1 lessons, school IT managers (1.11) | owner only | wk 0 (19 Oct 2026) | 9.5 weeks of slack |
| WP3a | Licence audit and joint map (3.1, 3.3) | S4 | wk 0 (19 Oct 2026) | 3 weeks of slack |
| WP12a | Interface mock-ups (12.1) | S5 | wk 0 (19 Oct 2026) | 3 weeks of slack |
| WP17a | CMU/EA letters, rights checks, contract (17.1, 17.5–17.9) | D | wk 0 (19 Oct 2026) | 11.5 weeks of slack |
| WP1 | Spikes 1.2–1.9, go/no-go per spike (1.10) | S1 | wk 1.5 (29 Oct 2026) | **critical path** |
| WP4d | Publish Story API open specification (4.8) | S6 | wk 3.5 (12 Nov 2026) | 20 weeks of slack |
| WP16b | Curriculum templates and use cases (16.6) | D | wk 8 (14 Dec 2026) | 10.5 weeks of slack |
| WP3d | Storybook cast commissioned and delivered (3.6) | owner only | wk 8 (14 Dec 2026) | 9.5 weeks of slack |
| WP24a | Teacher journey, Prompter access model, relay spike (24.1–24.3) | S8 | wk 8 (14 Dec 2026) | 5.5 weeks of slack |
| WP15b | Signing, stores, browser hosting (15.4–15.6) | S8 | wk 10 (28 Dec 2026) | 10 weeks of slack |
| WP23a | Projection spike: surface bake renderer, Pixera build script (23.1, 23.2) | S1 | wk 10 (28 Dec 2026) | after the release candidate |
| WP19a | Website and teacher guide drafts (19.1, 19.2) | D | wk 11 (4 Jan 2027) | 13.5 weeks of slack |
| WP17b | DPIA and privacy notice (17.3, 17.4) | D | wk 14 (25 Jan 2027) | 3.5 weeks of slack |
| WP13c | Prompter panel, storyboard tools, story coach, live eval | S7 | wk 14.5 (29 Jan 2027) | **critical path** |
| WP18b | Milestone gate tests and device runs (18.2, 18.3) | S1 | wk 16.5 (12 Feb 2027) | **critical path** |
| WP19 | Pilot in schools (19.3, 19.4) | owner only | wk 18.5 (26 Feb 2027) | **critical path** |
| WP20 | Pathway: Unreal, Unity, Godot export; guide; MetaHuman trial | S2 | wk 18.5 (26 Feb 2027) | after the release candidate |
| WP21 | AR design mode | S1 | wk 18.5 (26 Feb 2027) | after the release candidate |
| WP23d | Export for projection and Export to Pixera, flash check, guide (23.6–23.9) | S3 | wk 21.5 (18 Mar 2027) | after the release candidate |
| WP22c | Mixed-reality film and safeguards (22.8, 22.9) | S1 | wk 27.5 (29 Apr 2027) | after the release candidate |

## By milestone (workplan section 8)

| When | What | Why only the owner |
|---|---|---|
| M0 | Approve the new repository and organisation settings; send the CMU email, including the EA question (WP17.1, 17.7) | Accounts; correspondence in the owner's name |
| M1 | Choose reference devices; run spikes on them; go/no-go decisions | Devices; product decisions |
| M2–M4 | Approve the interface mock-ups (WP12.1); review the curriculum mapping with teachers (WP16.6); review the MakeHuman people (WP3.5); budget and commission the storybook cast (WP3.6, 17.8, 17.9) | Product and teaching judgement |
| M5 | Live Prompter runs with the owner's key | Costs and key stay with the owner |
| M6 | Code-signing certificate; Apple developer account; Google Play account; hosting the browser version | Purchases and accounts |
| M7 | Approve the DPIA and privacy notice; recruit pilot schools | Legal responsibility and relationships |
| M2–M7 | Agree the editor study design and decision rule; arrange consent and, ideally, an academic partner for ethical review (WP19.5, 19.6) | Research ethics; relationships with schools |
| M10 | Test AR packs on an Android phone and an iPad; decide the default credit setting for AR packs; agree hosting guidance for schools; approve the mixed-reality film safeguards | Devices; safeguarding judgement |
| M11 | Find a Windows PC with an NVIDIA graphics card, and ideally a venue or college partner with licensed Pixera, to test Export to Pixera; try a classroom projection | Hardware and partners |
| M0–M1 | Classroom ground truth (1.11); teacher interviews (16.7); decide how the Prompter reaches a group (24.3) and where pupils' work lives (24.2); record your review hours for the capacity probe (1.12) | Relationships with schools; product decisions |
| Before the pilot | Decide who runs StoryStage after the pilot (maintainer, funding, support), for example a university partner, an education charity, or a relationship with CMU's Alice team | Long-term ownership |
| Throughout | Review pull requests from up to about eight parallel lanes (section 5a); answer `needs-owner` questions within a day or two, because the critical path waits on them | Review capacity sets the pace |

## Decisions still open

See `docs/decisions.md`, "Still to decide".
