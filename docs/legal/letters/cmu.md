# The CMU and EA email (WP17.1, 17.7)

- **Status:** **sent** by the owner (by 8 Nov 2026). CMU replied that it is seeking advice from its legal department; no permission yet. See [`../correspondence.md`](../correspondence.md).
- **One letter:** this combines S4's request from the licence audit (#60: the model list and the question about the tile editor) with session D's (#51: EA, StoryStage 1, exports and credit). It replaces both earlier drafts.
- **To:** the Alice Project at Carnegie Mellon University, Entertainment Technology Center, 700 Technology Drive, Pittsburgh, PA 15219. The director (Melanie Lam, as listed on [alice.org/about/the-team](https://www.alice.org/about/the-team/), October 2026) by email, with a copy through the [alice.org contact form](https://www.alice.org/contact/) in case the address has changed.
- **From:** the owner, in their own name, from an email address they will keep (the reply becomes a permission record).
- **Attach** two spreadsheets (CSV, opens in Excel), from this folder:
  - `cmu-models.csv`: the **340** gallery models we ask about, with their texture variants;
  - `cmu-sims2-models-left-out.csv`: the **95** models Alice itself marks as drawn from The Sims 2's art, which we leave out.

  Both come from Alice 3.9's own files (`tools/convert-alice-models`, `list-gallery-cli.ts --csv`), the same data as the licence audit's appendix A (`docs/legal/licence-audit.md`).
- **Workplan:** 17.1 (CMU: Alice's own models, credit wording), 17.7 (EA: the Sims 2 assets, in the same email), and StoryStage 1's WP15.1, which was never sent (owner, 25 Oct 2026).

## Notes for the owner (not part of the email)

1. **Fill in** your name and email address at the end.
2. **Send it,** attach the two spreadsheets, and log the date in [`../correspondence.md`](../correspondence.md).
3. **When the reply comes,** paste it into a pull request or tell session D. D writes the permission record (`docs/legal/README.md`, "Permission records"), and S4 updates the audit's verdicts and `backstage.json`.
4. **Chase it** after three weeks with a short reply to your own email. With nothing six weeks after sending, D files "no answer" and Backstage plans without Alice's models (workplan section 9).
5. **Until then:** S4 may convert Alice's models for testing (WP3.2), but none ships. Nothing from the Sims 2 art is planned unless EA agrees in writing.

### What each question is for

| No. | Question | Why | What we can live with |
|---|---|---|---|
| 1 | Which of the 340 models are CMU's to license? | Clause 5 calls the gallery EA-contributed, but Alice keeps its own models apart from those it marks as Sims 2 art, and its credits name CMU's model builders | A list, or "all 340" |
| 2 | May we convert, reduce, ship, and let learners use them in films, AR scenes and the pathway exports? | StoryStage 2 converts every model to glTF, reduces it for 4 GB devices (WP3.9) and renames joints (WP3.3); films (WP11), AR packs (WP22) and Unreal, Unity and Godot exports (WP20) carry models outside the app | Converting and shipping are essential, and so are films; AR and the pathway exports can be left out for Alice's models |
| 3 | The tile editor, and "inspired by Alice" | Option C rebuilds Alice's tile grammar from scratch (decision 0009), and clause 3 concerns the name "Alice" | Any wording CMU prefers; a design change if they object |
| 4 | Terms and credit | A written permission is enough; an open licence would help other projects | Whatever CMU asks |
| 5 | Starter-world textures and the sound gallery | Backdrops reuse Alice's starting templates; a soundtrack is open for release 1.1 | A no is fine |
| 6 | The Sims 2 art (EA) | The Art Gallery Licence allows it only "without modification" and "solely with programs written with Alice 3.0"; StoryStage 2 meets neither | We plan without it (decision 0008); a contact at EA is the realistic best |
| 7 | StoryStage 1 | Its own CMU email (WP15.1) was never sent; it ships the Sims 2 assets unmodified in a renamed Alice 3 | It has a build without the Sims assets to fall back on |

---

## The email

**Subject:** StoryStage 2: may we use Alice 3's own gallery models? And questions about the Sims 2 art and StoryStage 1

Dear Melanie,

I lead StoryStage, a free, open-source tool that helps young people aged 6 to 13 in UK schools and clubs make short 3D animated films, the way the film industry does: they plan a story on a storyboard, set each scene and program it, then screen and export the film. It grew out of Alice. StoryStage 1, in use in UK schools today, is a fork of Alice 3.9.1.0 (https://github.com/storystage/storystage) that keeps Alice's licence and notices.

We are now building StoryStage 2 on web technology, so that it runs on the Chromebooks and iPads UK schools mostly have (Apache-2.0, https://github.com/storystage/storystage2). It contains no Alice code. It keeps Alice's ideas: the names of the procedures, functions and joints, "do in order" and "do together", writing code in tiles, and teaching programming through storytelling. It also opens Alice 3 worlds. StoryStage has no server, no accounts, no adverts and no analytics, and collects nothing from children.

Alice's models are a big part of what children love about it, so I'd like to ask about them, and about a few related things.

1. **Which models are CMU's?** Clause 5 of the Alice 3 licence describes the gallery as contributed by Electronic Arts. But Alice 3.9 keeps its own models apart from those it marks as drawn from The Sims 2's art, and the Alice 3 credits name CMU's own model builders. The first attached spreadsheet lists the **340 gallery models** Alice does not mark as Sims 2 art: animals, fairy-tale characters, props, vehicles and scenery. Are these CMU's to license? If any came from EA or someone else, which ones?

2. **May StoryStage 2 use them?** For those models, may we:
   - convert them to glTF and simplify them, so they run on low-cost school devices, giving their joints standard bone names (VRM 1.0) with Alice's joint names kept as the labels children see;
   - include them, free, in StoryStage 2 on Windows, macOS, iPad, Chromebook and in the browser, with a licence and credit line recorded for each;
   - let learners use them in the films they make, and share those films outside school, for example with family or at a film festival;
   - in later releases, let learners export a production as a simple AR scene that plays on a phone or tablet, and as a first step into industry tools (Unreal, Unity or Godot)?

   If you would rather the models stayed inside StoryStage and its films, we will respect that.

3. **The way StoryStage 2 writes code.** Besides blocks, StoryStage 2 offers a tile editor built from scratch in the spirit of Alice's: statements as rows of tiles, "do in order" and "do together", choosing a value when a tile is dropped, and "add detail". It uses no Alice code, icons or artwork, and Alice's procedure names ("move", "turn to face", "say") appear on the tiles. Do you have any objection to this? May we describe it as "Alice-style", or StoryStage as "inspired by Alice (alice.org)", with credit to CMU? StoryStage doesn't use "Alice" in its name.

4. **Terms and credit.** A written permission for StoryStage 2, for non-commercial use, would be enough for us. If CMU were willing to put its own models under an open licence such as CC BY 4.0, other education projects could use them too, and we would gladly share our glTF conversions back with you. How would you like CMU credited? We propose "Models from Alice 3, © Carnegie Mellon University, used with permission" in the app's credits and in every exported film's credits.

5. **Smaller things.** May we also use the ground and sky textures from Alice 3's starter worlds, and the sound gallery, on the same terms? A no is fine.

6. **The Sims 2 art.** We will not use anything Alice marks as Sims 2 art: the Alice 3 people, the 95 models in the second spreadsheet (mostly cars, furniture and house plants) and two Bamboo variants. We understand the Alice 3.0 Art Gallery Licence allows that art only without modification and only with programs written with Alice 3.0, which StoryStage 2 isn't. If you think Electronic Arts might extend its permission to a free education project like this one, could you tell us who at EA to ask, or pass this on? The Alice 3 credits thank Steve Seabolt and JoAnn Covington for arranging the original donation.

7. **StoryStage 1, the fork in use today.** StoryStage 1 is Alice 3.9.1.0 with an added assistant, renamed StoryStage, and described as "a free, non-commercial fork of Alice 3". It keeps the Alice 3 licence, CMU's acknowledgement, and the Sims 2 assets unmodified, with the Art Gallery Licence and EA's acknowledgement. I should have written about this sooner. Are you content with the name and that description, and does CMU see StoryStage 1's use of the Sims 2 assets as within "programs written with Alice 3.0"? If not, we will ship StoryStage 1 without them.

Until we hear from you, we will convert models only for testing and ship none of them. I'd be very happy to talk this through on a call, and to show you StoryStage 2 as it develops. Thank you for Alice, and for considering this.

With best wishes,

[Name]
StoryStage, https://storystage.org
[email address you will keep]
