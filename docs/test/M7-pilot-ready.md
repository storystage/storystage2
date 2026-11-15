# M7 Pilot ready: manual test script

**Gate (workplan section 5):** curriculum mapping published; DPIA done; pilot schools recruited; a class can be set up (WP24). WP24 is done when, in a test with 30 devices, a teacher sets up a class in under 15 minutes, every pupil reopens their own production next lesson and no one else's, the chosen Prompter route works within its caps, and the study logs export. **Who:** the owner, with a pilot teacher where the steps say so; S1 writes up.

**What CI already checks on every pull request** (`apps/studio/e2e/gates/m7-pilot-ready.e2e.ts`), so these steps don't repeat it in one browser: a class of 30 imported on an empty device; two pupils' films, each found by its own pupil after a reload and not by the other; and Collect and Hand back, one folder for each pupil, with each film handed back beside the pupil's own. What CI can't check is many devices, a real teacher's time, and the documents.

**Where:** a classroom or a room set up like one: the teacher's device and as many pupils' devices as you have (30 for WP24's done-when; start with 3), on the school's own Wi-Fi, with the build the run names. Steps marked _(waits)_ need work not built yet; the step says what.

## 1. The documents _(owner)_

| # | Check | Where | ✓ |
|---|---|---|---|
| 1 | The curriculum mapping is published, cited to each nation's official documents, and you've chosen the arc templates to ship (WP16's done-when). | `docs/curriculum/` (mapping, arc templates); the use cases (16.6) | |
| 2 | The DPIA is approved, with the review against the ICO Children's code (17.3). | The DPIA draft (17.3) | |
| 3 | The privacy notice and the set-up wizard's wording are approved (17.4). | The privacy notice draft (17.4) | |
| 4 | The information sheets and consent forms are ready, with parental consent for under-16s and how to withdraw (19.6). | The study protocol and consent sheets (19.5, 19.6) | |

## 2. The schools _(owner; 19.3)_

| # | Check | ✓ |
|---|---|---|
| 1 | Two or three schools across at least two UK nations, and at least one after-school club, have agreed. | |
| 2 | For each: whether it would fund a Prompter key, and which Prompter route suits it (24.3). | |
| 3 | For each: its devices (Windows, Mac, iPad, Chromebook), and whether they're shared between classes. | |

## 3. Set up a class, and the next lesson _(WP24)_

With a pilot teacher if you can, using their own class list (record no names in the results).

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | On each device, install the app through the school's device management, or open the browser version (M6). Start a stopwatch. | The studio opens on its own film, with no class yet. | |
| 2 | On the teacher's device: **Settings › Class set-up › Import class list**, paste the class's names, one a line, and **Add … pupils**. Wait a moment before closing anything. | "… pupils". Names already there aren't added twice. | |
| 3 | Put the class on each pupils' device: the same import, or Class set-up on each. Stop the stopwatch when every device shows the names. | Every device opens on **Who's making films today?** with the class's names. Under 15 minutes for the class. Record the time and the number of devices. | |
| 4 | Each pupil finds their name and makes a film with a title of their own. | "Saved" each time. | |
| 5 | Close everything. Next lesson (or an hour later), each pupil finds their name again. | **…'s films** shows their own film, and opens it as they left it. No one sees anyone else's film. | |
| 6 | Two pupils share a device and swap: **Film › Switch pupil**. | Each sees only their own films. | |
| 7 | A pupil deletes a film; the teacher finds it in **Settings › The bin** and puts it back. | It's back in that pupil's films. | |

## 4. Collect and hand back _(8.4)_

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | On a pupils' device: **Settings › Collect and hand back › Collect…**, and choose a folder (a USB stick or the school's shared drive). | "Collected … films." The folder has a folder for each pupil, each holding their `.storystage` files. | |
| 2 | On the teacher's device, **Film › Open a copy…** one of them, add a mark to its logline, and **Save a copy…** back into the same pupil's folder. | The file in that folder is the marked one. | |
| 3 | Back on the pupils' device: **Hand back…** and choose the same folder. | "Handed back … films." Each pupil finds "… (handed back)" beside their own film, which is unchanged. | |
| 4 | Put a file that isn't a film in one pupil's folder, and hand back again. | It's listed under **Not handed back**, with the reason. | |

## 5. The Prompter for the class _(waits: the route, 24.3, and class caps, 24.5)_

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Set up the route chosen for the pilot (24.3): the adult's own key on their device, for a club or small group, by default. | The Prompter works for that group, and nowhere else. | |
| 2 | With `prompter.dailyCap` set low in the policy file (M6 section 2), use the Prompter until the cap. | It steps down as `prompter.capAction` says (Explain only, then off), in plain words. | |
| 3 | Look at the class's usage view. | Usage per class and per device. | |

## 6. Study logs _(waits: 24.6)_

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Export the class's study logs. | A file with pseudonymous session ids, and no pupil's name. | |

## Record

The date, the build, the number and kinds of devices, the set-up time, which steps passed, and for each that didn't, what happened, in the studio's own words. No pupils' names. Then, on each kind of device, run **Settings › Self-test** › **Run the self-test**, and record its last line (`SELFTEST PASS` or `SELFTEST FAIL`); if it fails, paste its report into the results.
