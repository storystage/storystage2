# M5 Prompter and speech: manual test script

**Gate (workplan section 5):** the Prompter works in the desktop app with the owner's key; voice in and out work on the device. WP13 is done when the Prompter scores at least 75% on the owner's live run, with no failure in refusals, "doesn't write the story" or "build matches the plan", and a plan is edited, built and undone in one step. Playwright checks what it can on every pull request (`apps/studio/e2e/gates/m5-prompter-speech.e2e.ts`), and the leak scan checks the native layer with a key made at run time. Most of this gate is yours, on the devices. **Who:** the owner, with S1 and S7 writing up.

**Your key stays yours.** Type or paste it only into the system's own dialog that **Add key** opens. Never into the studio, a chat, a file or these results. Record what the studio says, never the key.

**Where:** the desktop app on Windows first, then the Mac and the Chromebook (and the iPad once it has a key dialog); a browser for section 5's browser rows. **Before you start:** the build the pull request names, installed; Wi-Fi; a microphone. Steps marked _(native host)_ need the studio connected to the app's native layer (the Prompter, the key, the mic and the bundled voices), which isn't built yet; leave them until it lands.

## 1. Set up the Prompter with your key _(native host; 13.6, S7 and S5)_

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Open the Prompter's set-up as an adult (10a, 10b). | It says the Claude account must belong to an adult, and what the Prompter does and doesn't do. | |
| 2 | **Add key**. | The system's own dialog: a masked field, Cancel and Add, no Show. The studio has no key field of its own. | |
| 3 | Press Cancel. | Nothing is stored; set-up says the Prompter isn't set up yet. | |
| 4 | **Add key** again and paste a key that's wrong on purpose (change one character). | "That key wasn't accepted." | |
| 5 | **Add key** and paste your key. | "Key works. Checked just now." The key isn't shown anywhere, now or later. | |
| 6 | Turn Wi-Fi off and **Add key** again. | "Couldn't reach Anthropic: check the internet connection or school proxy." Turn Wi-Fi back on. | |
| 7 | Close and reopen the app. | The Prompter is still ready: the key is kept by the system (Credential Manager, Keychain, or Android's keystore). | |

## 2. The Prompter at each level _(native host; WP13c, S7 and S5)_

Set the level in Settings, or with the school policy file (decision 0034).

| # | Level | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Off | Look for the Prompter. | No Prompter anywhere; everything else works. | |
| 2 | Explain only | Ask "What does a do together block do?" Then ask it to write your logline. | A plain answer. The story coach says the logline is yours to write, and asks you one question about your story instead. | |
| 3 | Plan only | Ask it to make the penguin walk to the fox and say hello. | A plan of steps, marked **Nothing built yet**, and no **Build these steps**. | |
| 4 | Full | The same, then edit one step, then **Build these steps**. | It builds what the plan says, as one undo step. | |
| 5 | Full | **Undo this request**. | Everything it built goes, in one step. | |
| 6 | Full | Ask something long, then **Stop**. | "Stopped." Nothing half-built is left. | |
| 7 | Full | Turn Wi-Fi off and ask. | Plain words that it can't reach Anthropic; nothing else breaks. | |
| 8 | Any | Ask it to look at a photo, or to use the camera. | It can't: camera, mic and pictures never go to the Prompter. | |

Then, with S7, the live evaluation: the eval set on your key, scored (at least 75%, and no failures in the three critical categories).

## 3. Voice in: Talk to type _(native host; whisper bundled in the app, S8)_

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Settings › **Talk to type: a mic beside every place you write**: turn it on. | A mic appears beside the Title, Logline, Synopsis, Heading, Caption and script lines. | |
| 2 | Tap **Say it: Logline**, allow the microphone when asked, say "A shy owl must find a lost key", and tap again. | "Listening…", then "Working out the words…", then the words in the field, as one undo step. The mic light goes off. | |
| 3 | Start again and press Esc. | Nothing is added; the mic light goes off. | |
| 4 | Talk for longer than 30 seconds. | It stops at 30 seconds and puts in what it heard. | |
| 5 | Turn on airplane mode and do step 2 again. | It still works: speech never needs the network. | |
| 6 | On the Chromebook, do step 2 five times. | No slowdown or reload (memory, spec 06 section 1.9). | |

## 4. Voice out: the Prompter's steps read aloud _(native host; WP13c, S5)_

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Turn on **Spoken steps** and ask the Prompter for a plan. | Its steps are read aloud in an English voice from the device itself (British first), with captions. | |
| 2 | Press Stop, or Esc, while it reads. | It stops at once and reads nothing more. | |
| 3 | On a device with no English voice, if you have one. | "This device has no voice StoryStage can use. Captions still show." | |

## 5. Voice out: speak lines in Rehearse

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | In a film, add a **speak line** block for two characters, and Rehearse. In the app _(native host)_: | Each line is heard as its block starts, with its caption; the two characters sound different. Stop and pause silence it at once. No download is asked for: the voices come with the app. | |
| 2 | The same in the browser version, the first time. | It asks first: "Speak lines need their voices on this device: a … MB download, once." Until you choose **Download the voices**, the lines are silent with their captions. Then a progress bar, and the lines are heard. | |
| 3 | Reload and Rehearse again in the browser. | No download is asked for again. | |
| 4 | Settings › Voices: **Accent for speak lines**. | British English by default. Choose American English and **Change this film's voices to American English**: the lines are heard again in American voices. | |
| 5 | Settings › Voices: change a character's voice, and **Hear it**. | A sample in the new voice; the next Rehearse uses it. | |
| 6 | On the Chromebook: note how long a ten-line film takes to get its lines ready (M1 checklist, row 5a). | Rehearse never waits: lines not ready yet are silent, with their captions. | |

## 6. Nothing leaves the device but what should

If you can watch the network (a router page, or a tool S1 suggests):

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Use Talk to type, Spoken steps and speak lines. | No network traffic for any of them, apart from the voices' one download in the browser version. | |
| 2 | Ask the Prompter. | Traffic only to Anthropic. | |

## Record

For each device: the date, the build, which steps passed, and for each that didn't, what happened, in the studio's own words. Never record your key or paste it into the results. Then, on each device, run **Settings › Self-test** › **Run the self-test**, and record its last line (`SELFTEST PASS` or `SELFTEST FAIL`); if it fails, paste its report into the results.
