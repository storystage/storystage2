# Decisions

What is settled, and what the owner still has to decide. Settled decisions change only by the owner, recorded here with a date. If code or a spec needs a settled decision changed, open an issue labelled `needs-owner`; don't work around it.

## Settled

| Area | Decision | Date |
|---|---|---|
| Product | StoryStage 2: a rewrite on web technology, keeping the ideas, the Prompter design and (subject to licence) Alice's own models | 17 Oct 2026 |
| Start | Immediately | 17 Oct 2026 |
| Delivery | Tauri 2 apps on Windows, macOS, iPad (iOS) and Chromebook (Android, where allowed), all with the Prompter. A browser version on any device, with the Prompter switched off. Linux is not in the first release (decided 18 Oct 2026) | 17 Oct 2026; Linux dropped 18 Oct 2026 |
| Not before the release candidate | WP20 (pathway), WP21 (AR design mode), WP22 (AR for audiences) and WP23 (projection mapping) start only after the release candidate. Their spikes (1.9, 23.1, 23.2) may run earlier | 18 Oct 2026 |
| API key | The user's or school's own key, in the OS secure store (Credential Manager, Keychain, Android Keystore). Claude requests are sent from the app's native layer, so web code never sees the key. Never stored in a settings file. No StoryStage server | 17 Oct 2026 |
| UI | React + TypeScript | 17 Oct 2026 |
| 3D | Babylon.js (Apache-2.0), WebGL2, with WebGPU where available | 17 Oct 2026 |
| Models | glTF 2.0, built from four sources: Alice's own models converted (after the licence check); MakeHuman (CC0) for everyday people; a commissioned cast of public-domain storybook characters; Kenney (CC0) and museum CC0 scans for props and sets. Blender Studio characters (CC-BY) as an optional extra. No Sims 2 models unless EA gives written permission | 17 Oct 2026 |
| Blocks | Two code editors in the first release, over the same program: **option B**, Blockly (Apache-2.0) customised to look and behave like Alice's tiles; **option C**, an Alice-style tile editor rebuilt in React. Learners can switch at any time; the teacher sets each class's default. A pilot study (WP19.5–19.8) decides which one continues. Both have a read-only text view | 18 Oct 2026 (replaces Blockly only, 17 Oct) |
| Language | Typed AST stored as JSON with stable node ids. An interpreter in a Web Worker, with a scheduler for do together | 17 Oct 2026 |
| Project file | `.storystage`: a zip holding the AST JSON, the storyboard, the script, frame layouts and any learner audio. No plain-Alice compatibility needed | 17 Oct 2026 |
| Storyboard | Required: a scene is storyboarded before its code can be started. A teacher can switch this rule off for imported Alice worlds | 17 Oct 2026 |
| Backstage | The library of 3D models is called **Backstage**, in four sections: **Cast** (anything that can act), **Props** (things characters pick up, use or ride), **Set** (scenery: buildings, trees, furniture fixed in place) and **Backdrops** (ground, sky, lighting and fog). Each model has one home section; search covers all four. The sketch library, the Prompter's catalogue and film credits use the same sections | 18 Oct 2026 |
| Drawings | No import of outside drawings. Frames use the sketch library only | 17 Oct 2026 |
| Tabs | Storyboard, Production stage, Screening room. The Code editor is a view inside the Production stage | 17 Oct 2026 |
| Script header | A logline and a synopsis open every script | 17 Oct 2026 |
| Export | MP4 export is in scope for the first release | 17 Oct 2026 |
| Curriculum | Map against all four UK nations' curricula. 3- and 5-part arc templates ship regardless; curriculum templates follow the mapping | 17 Oct 2026 |
| Prompter model | `claude-opus-5-5` (from StoryStage 1 spec 01), configurable in one place | Carried over |
| Speech in | whisper.cpp in WebAssembly, on the device; audio never leaves it | 17 Oct 2026 |
| Speech out | Browser speech synthesis using only voices that run on the device; captions always shown | 17 Oct 2026 |
| Off switches | User switch (off by default); school or exam lock; a build without the Prompter | Carried over |
| Projection mapping | A Projection stage (surfaces, virtual projectors, preview), classroom projection from the desktop app, and Export for projection, including an Export to Pixera package (WP23). Pixera's project file format isn't published, so the export is a package plus a build script for Pixera's API, not a Pixera project file | 18 Oct 2026 |
| AR | AR design mode for learners (WP21), and AR as an audience experience and distribution format (WP22): play a production in AR in StoryStage, export an AR pack (GLB and USDZ, with a web page and QR codes) that opens without StoryStage, and a mixed-reality film. AR trails are on the roadmap, not in the first release | 18 Oct 2026 |
| Prompter: plan before change | Show me how and Build it first show a numbered plan in plain words that the learner can reorder, edit, add to or delete; nothing changes until they press Build these steps. Plan only mode (`prompter.planOnly`) makes the learner build every block. From Roblox Studio's Planning Mode (WP13.9) | 18 Oct 2026 |
| Automatic check against the storyboard | StoryStage rehearses a frame offscreen and reports, in plain words, where the result differs from the storyboard (who is on screen, position, facing, framing, lines said, length, errors). Needs no Prompter or network; runs before export. From Roblox Studio's automated playtesting (WP11.6) | 18 Oct 2026 |
| Roblox | Roblox Studio is in the benchmark (design doc section 2). **No Export to Roblox** | 18 Oct 2026 |
| Backstage sources | Add KayKit, the 100Avatars series (CC0, VRM), Poly Pizza (CC0; CC-BY only with credit), Poly Haven and ambientCG for backdrops. Quaternius only if its licence allows. Not Mixamo or general Sketchfab in the shipped catalogue (WP3) | 18 Oct 2026 |
| Import into Backstage | On the device, no server: reduce to the device budget with glTF Transform, map the skeleton or mark "prop only", draw sketches, record licence and source. CC-BY credits go into film credits; non-commercial or "not sure" items stay in class and block the pathway and public distribution. `backstage.import` = off, teacher (default) or learners. No in-app browsing of open galleries; a Poly Pizza CC0-only search (`backstage.search`) is off until the DPIA decides (WP3.11, 3.12) | 18 Oct 2026 |
| Storyboard sketches | Generated from the 3D models (four facings, standard poses), at build time and in the app for imports. Outside drawings are still not imported (WP10.5) | 18 Oct 2026 |
| Backstage from the Storyboard | Backstage opens in a side panel from the sketch library; missing items are imported there, or placed as a labelled **stand-in** that keeps its code when the real model replaces it (WP10.9) | 18 Oct 2026 |
| Set the stage from the storyboard | The first time a scene opens, offer to place cast, props, set, backdrop and camera from the storyboard; one undo; no Prompter needed (WP10.10) | 18 Oct 2026 |
| Prompter models by mode | A lower-cost model for Explain, the story coach and the script check; a stronger model for Build it and Show me how; re-run the evaluation set before switching (WP24.3) | 18 Oct 2026 |
| Delivery | Eight Claude Code sessions plus a documents session, each owning its own packages (`handover/README.md`) | 20 Oct 2026 |
| Licence | StoryStage 2 is published under the **Apache License 2.0** (`LICENSE`). Permissive, with an explicit patent grant, so schools, partners and a future maintainer can reuse it; it matches the dependency policy. Documentation and curriculum material may take their own licence later (session D, WP17). | 21 Oct 2026 |
| App identifier | The apps keep the identifier `org.storystage.storystage2` (bundle id on iPad and macOS, application id on Android). It can't change after the first store release. It assumes StoryStage controls the `storystage.org` domain; if not, change it before WP15.4–15.6, the first signed store builds. | 21 Oct 2026 |
| Threat model owner | The threat model (WP0.9, `docs/spec/15-security.md`) is written by **S8**, as the session roster says, not by the first session as workplan section 11 suggested. Import code (8.4, 9.1, 10.4) and the transport (15.2) start only after it. | 21 Oct 2026 |
| Host interface | The studio is handed a **host interface** by the build it runs in (files, the Prompter transport or none, the policy in force), rather than detecting whether it is in Tauri or a browser (`docs/spec/00-architecture.md`, sections 1 and 6). S8 and S5 define it together when the studio first needs files or policy; it is a contract like the WP0.8 ones. | 21 Oct 2026 |
| Main branch bypass and merging | The owner, as organisation admin, may bypass the `main` ruleset in an emergency; nobody else can, and sessions acting through the owner's account never use it. S1 squash-merges its own WP0 contract and WP1 spike pull requests once the required checks pass, in stack order, and the owner reviews afterwards; other pull requests wait for the owner unless they say otherwise. | 21 Oct 2026 |
| Age range | Learners aged 6 to 13, **provisional**: tested against the full curriculum review (WP16a) and the teacher interviews (16.7), then confirmed or changed (0030) | 25 Oct 2026 |
| Fonts | Bricolage Grotesque and Atkinson Hyperlegible under OFL-1.1, Material Symbols Rounded (Apache-2.0). OFL-1.1 is allowed for font packages only; fonts are bundled, never loaded from Google Fonts (0031) | 25 Oct 2026 |

## Still to decide (owner)

| Decision | Needed by | Where |
|---|---|---|
| Approve or rewrite the purpose and vision statements; confirm the provisional age range (0030) after the curriculum review | M0; age range after WP16a | Design doc section 1 |
| Choose the reference Chromebook and iPad | Week 1.5, before the spikes (slack 0.5 weeks) | WP1.1 |
| Watch two or three TR1 lessons; talk to two school IT managers | M1 | WP1.11 |
| Interview five teachers on the job they'd hire StoryStage for | M1 | WP16.7 |
| How the Prompter reaches a group: A clubs and home (pilot default), B classroom relay, C keys by device management | M1 | WP24.3 |
| Where a pupil's work lives between lessons on shared devices | M1, before saving (8.4) is built | WP24.2 |
| Send the CMU and EA letters | Day one | WP17.1, 17.7 |
| Whether Quaternius's current licence allows shipping in Backstage | With the licence audit | WP3.1 |
| Budget for the storybook cast commission | M2 | WP3.6 |
| Record review hours for two weeks; confirm how many parallel sessions you can review | End of week 2 | WP1.12 |
| Default for `backstage.search` (Poly Pizza CC0-only search) | After the DPIA | WP3.12, WP17 |
| Approve the editor study design, co-designed with pilot teachers; look for a university partner | M2–M7 | WP19.5, 19.6 |
| Arrange a human security review of the key handling | Before the pilot | WP15.2 |
| Buy code-signing certificates; open Apple and Google developer accounts | M6 | WP15.4, 15.5 |
| Choose the pilot window around the Easter holidays | M7 | WP19 |
| Who runs StoryStage after the pilot (maintainer, funding, support) | Before the pilot | Design doc section 10 |
| Find a Windows PC with an NVIDIA card, or a venue partner, to test Export to Pixera | M11 | WP23 |
| Whether StoryStage 2.1 adds a soundtrack (import or create music and sound effects) | Before planning release 1.1 | Workplan 6b |
| Which code editor continues, from the study | M12 | WP19.8 |
