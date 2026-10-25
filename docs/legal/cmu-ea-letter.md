# The CMU and EA email (WP17.1, 17.7)

- **Status:** draft, for the owner to send. Not yet sent.
- **To:** the Alice Project at Carnegie Mellon University, Entertainment Technology Center, 700 Technology Drive, Pittsburgh, PA 15219. The director (Melanie Lam, as listed on [alice.org/about/the-team](https://www.alice.org/about/the-team/), October 2026) by email, with a copy through the [alice.org contact form](https://www.alice.org/contact/) in case the address has changed.
- **From:** the owner, in their own name.
- **Workplan:** 17.1 (CMU: Alice's own gallery models, credit wording) and 17.7 (EA: the Sims 2 assets), in one email as 17.7 asks. Section 8: "M0, send the CMU email". It is on the owner's list as "Day one".

## Notes for the owner (not part of the email)

1. **Fill in** the three bracketed places: your email signature, and the StoryStage 1 sentence, which depends on whether StoryStage 1's own CMU email (its WP15.1, about the Sims 2 assets in a renamed fork) was ever sent. If it was, say so and quote any reply; if not, delete that sentence.
2. **Send it** from an address you will keep, because the reply becomes a permission record. Plain text is fine; the GitHub links are enough, with no attachments.
3. **File it** in [correspondence.md](correspondence.md): the date you sent it, and later the reply. Paste the reply into the pull request or an issue, or tell session D what it says, and D writes the permission record (see [README.md](README.md#permission-records)).
4. **Chase it** after three weeks with a short reply to your own email. If there is still nothing six weeks after sending, D files "no answer" and Backstage plans without Alice's models (workplan section 9, the first risk).
5. **Until then:** session S4 may convert Alice's models for testing (WP3.2), but none ships. Nothing from the Sims 2 set is planned at all unless EA agrees in writing.

### What the email asks, and why

| Question | Why we need it | What we can live with |
|---|---|---|
| 1. Which of the 343 models in Alice 3's own gallery (`aliceModelResources`) did CMU make, and may StoryStage 2 convert and ship them? | Clause 5 of the Alice 3 licence says the gallery "is contributed by Electronic Arts Inc. and may be used for personal, non-commercial, and academic use only". The Alice 3 credits name CMU's own model builders, so we think these models are CMU's, not EA's, but only CMU can say. | A written yes for StoryStage 2, non-commercial, is enough. An open licence (CC BY 4.0) would be better for everyone. |
| 2. Converting, reducing and renaming joints | StoryStage 2 converts every model to glTF 2.0, reduces triangles and textures for 4 GB Chromebooks (WP3.9), and names joints with VRM 1.0 bone names, keeping Alice's names on the blocks (WP3.3). | Needed. Without it we can't use the models at all. |
| 3. Learners' films, AR packs and the pathway exports | Exported films (WP11) and AR packs (WP22) carry the models' images or the models themselves outside StoryStage; the pathway exports (WP20) copy models into Unreal, Unity and Godot projects. | Films are essential. AR packs and the pathway exports can be left out for Alice's models if CMU prefers; the app would say why. |
| 4. Credit wording | Clauses 3 and 4 of the Alice 3 licence concern the name "Alice" and an acknowledgement. StoryStage 2 contains no Alice code, so they may not apply, but we want to credit Alice properly and in CMU's words. | Whatever CMU asks for. |
| 5. Starter worlds and the sound gallery (lower priority) | Backdrops reuse Alice's starting templates (WP3, the Backstage sections table). A soundtrack is an open owner decision for release 1.1. | A no is fine. |
| 6. The Sims 2 assets (EA) | The Alice 3.0 Art Gallery Licence allows redistribution only "without modification" and "solely with programs written with Alice 3.0". StoryStage 2 converts models and has no Alice code, so it meets neither. Only EA can extend it. | We plan without them (decision 0008). A route to the right person at EA is the realistic best case. |

The figures in the email come from StoryStage 1's checkout (`C:\dev\storystage`, release 3.9.1.0): 343 model folders in Alice's own gallery (42 bipeds, 39 quadrupeds, 14 flyers, 7 fish, 5 marine mammals, 3 slitherers, 225 props, 8 vehicles), and the Sims 2 set (the people, and 97 props, cars and aircraft in `nebulousModelResources`).

---

## The email

**Subject:** StoryStage 2: may we convert and ship Alice 3's own gallery models? And a question about the Sims 2 assets

Dear Melanie,

I run StoryStage, a free, non-commercial tool that helps young people aged 6 to 13 in UK schools and clubs make short 3D animated films, the way the film industry does: storyboard first, then build and code each scene, then screen and export the film. It grew out of Alice. StoryStage 1 is a fork of Alice 3.9.1.0 (https://github.com/storystage/storystage) and is being piloted in UK schools now. [If StoryStage 1's email was sent: "I wrote to the team on [date] about the Sims 2 assets in that fork; [what came back]."]

We are now writing StoryStage 2 on web technology, so it runs on the Chromebooks and iPads that UK schools mostly have. It contains no Alice code. It keeps Alice's ideas: the names of the procedures, functions and joints, do in order and do together, the tile editor's design, and it opens Alice 3 worlds (.a3p). The code is open source under Apache 2.0 (https://github.com/storystage/storystage2). StoryStage has no server, no accounts and no analytics, and collects nothing from children.

I'd like to ask about Alice's models, because they are the heart of what children loved in Alice.

1. **Alice's own gallery.** Alice 3's licence (clause 5) describes the gallery as contributed by Electronic Arts. The Alice 3 credits also name CMU's own model builders, and Alice 3.9.1.0 keeps two sets apart: 343 models in Alice's own gallery (animals, fairy-tale characters, props, vehicles and scenery) and the Sims 2 people and objects. Are the 343 CMU's to license? If any came from EA or someone else, which ones?
2. **May StoryStage 2 convert and ship them?** We would convert each model to glTF 2.0, reduce its triangles and textures so it runs on low-end devices, and give its joints standard bone names (VRM 1.0), with Alice's joint names kept as the labels children see. The models would ship free inside the StoryStage 2 apps and browser version, with a licence and credit line recorded for each one.
3. **What children make with them.** Learners export their films as MP4s to show at school and share with families. Later releases would also export an "AR pack" (the scene as a 3D file that plays on a phone or tablet), and a "pathway" export that opens a production in Unreal, Unity or Godot as a first step into industry tools. Could the models appear in all of these? If CMU would rather they stay inside StoryStage and its films, we would respect that.
4. **Terms and credit.** A written permission for StoryStage 2, for non-commercial use, would be enough for us. If CMU were willing to put its own models under an open licence such as CC BY 4.0, other education projects could use them too, and we would gladly share our glTF conversions back with you. Either way, how would you like Alice and CMU credited? We would propose "Models from Alice 3, © Carnegie Mellon University, used with permission" in the app's credits and in every exported film's credits, and "StoryStage is inspired by Alice (alice.org)" on the website and the About screen. StoryStage 2 doesn't use "Alice" in its name.
5. **Smaller things.** May we also use the ground and sky textures from Alice 3's starter worlds, and the sound gallery, on the same terms? A no is fine.
6. **The Sims 2 assets.** We understand the Alice 3.0 Art Gallery Licence allows them to be redistributed only without modification and only with programs written with Alice 3.0. StoryStage 2 meets neither, so we are planning without them. If you think EA might extend its permission to a non-commercial project like this one, could you tell us who at EA to ask, or pass this on? The Alice 3 credits thank Steve Seabolt and JoAnn Covington for arranging the original donation.

Until we hear from you, we will convert models only for testing and ship none of them. I'd be very happy to talk this through on a call, and to show you StoryStage 2 as it develops.

With thanks and best wishes,

[Name]
StoryStage, https://storystage.org.uk
[email address you will keep]
