# Privacy notice, and the set-up wording (WP17.4)

- **Status:** **draft for the owner's approval** (17.4 is "C drafts; U approves"). It is published only after the DPIA (`docs/dpia.md`, 17.3) is approved and the "Before publishing" list below is done. Not legal advice.
- **Written:** 8 November 2026, by session D, updated from StoryStage 1's notice (`storystage/storystage`, `docs/privacy.md`, 16 October 2026). What changed is listed at the end.
- **Where it goes:** the full notice (part 1) on `storystage.org/privacy` (decision 0046), replacing the short summary in `website/privacy.md`; the learner versions (part 2) on the website and in the app under Settings › Privacy; the set-up wording (part 3) to S5 and S8 for screens 10a–10d (spec 05 §1).
- **Licence:** the text is CC BY 4.0 (decision 0045), so schools can adapt it for their own privacy information.

**Before publishing:**

1. The owner fills in the **[bracketed]** items: the name and contact details, and the effective date.
2. The answers to the DPIA's legal questions (`docs/dpia.md` §8) are reflected, especially Anthropic's retention and transfer terms (Q7) and Bluehost's and GitHub's logs (Q8).
3. A test confirms each claim marked ✔ on the release build: that the apps make no network connections with the Prompter off, other than the update check and the speech model download (as StoryStage 1's TR1 test N1 did), and that the browser version makes no third-party requests (threat B2).
4. The website passes `website/README.md`'s pre-publish check (no tracking).

---

## Part 1: The privacy notice

*For parents, carers, teachers and schools. Effective **[date]**.*

### Who we are

StoryStage is a free app for making 3D animated films, for learners aged 6 to 13. It is provided by **[owner's name], trading as StoryStage** ("we"). Contact: **[email address]**.

### The short version

- **StoryStage has no accounts and no server.** Nothing a learner makes is sent to us. ✔
- **No analytics, adverts or tracking,** in the apps, the browser version or on this website. ✔
- **The Prompter,** the optional AI helper, is **off** until an adult sets it up with their own Claude account. When a learner asks it something, their request goes to **Anthropic**, the company that makes Claude, as text. It never sends pictures, camera images or recordings.
- **Voice input** is turned into text on the device. Recordings aren't kept or sent anywhere.
- **Schools decide** how StoryStage is used in class, including whether learners can use the Prompter at all.

### What stays on the device

| What | Where | Who controls it |
|---|---|---|
| **Productions:** storyboards, scripts, code, films, and any 3D models a teacher imported | A `.storystage` file, saved where the learner, teacher or parent chooses: on the device, or, if a school switches it on, its own Google Drive or OneDrive | The learner and family at home; the school at school |
| **Settings** and the school's lock | The device | The school or family |
| **The day's Prompter count**, used for the daily limit | The device | Cleared each day |
| **The Claude key** | The device's secure store (Windows Credential Manager, the Mac and iPad Keychain, or Android's Keystore). Never in a file, a production or a log, and never shown again after it's added | The adult who added it |
| **Study logs,** only in pilot schools taking part in the editor study | The device, until the teacher exports them | The school, then the study team |

A production is a file, and files can be passed on. Anything a learner types into one (for example their full name in the credits) goes wherever the file goes. We recommend first names or initials, and StoryStage suggests that by default.

**In the browser version,** work is kept in the browser until it's saved to a file. On a shared computer, the next person could find it there, so StoryStage shows a banner until the work is saved, and asks to download it at the end of a session.

### The Prompter

The Prompter is an AI helper in the apps (not the browser version). It explains, asks questions to help learners plan their stories, and, when asked, suggests a plan in plain words before it changes anything. It never writes the learner's story.

**It is off until an adult switches it on.** An adult (18 or over) completes the set-up and adds a key from **their own Claude account** at Anthropic. That adult is Anthropic's customer, and agrees to the sending described here. **[Open: whether a parent at home may hold the key, which Anthropic is asked to confirm (WP17.5).]** At school, the teacher chooses how much of the Prompter each class gets (off, explain only, plan only, or full), and the school can lock it off.

**What is sent to Anthropic,** each time a learner asks the Prompter something:

- the learner's request, as text, typed or turned into text on the device;
- what the Prompter needs to answer it, as text: the storyboard, the script and the code of the production that's open;
- the conversation so far, while that production is open.

**What is never sent:** pictures of the scene, camera images, recordings of anyone's voice, other files, or the key to anyone but Anthropic. ✔ (The app's own checks refuse any request containing an image.)

**What Anthropic does with it:** Anthropic processes it to answer the request, under the key holder's agreement with Anthropic ([Commercial Terms](https://www.anthropic.com/legal/commercial-terms), [Privacy Policy](https://www.anthropic.com/legal/privacy)). Anthropic's Commercial Terms say it doesn't train its models on this content. Anthropic is in the United States. **[To complete from the DPIA's Q7: how long Anthropic keeps it, and the transfer safeguard.]**

**What we see:** nothing. Requests go straight from the device to Anthropic. The conversation isn't saved: it ends when the production is closed.

**Please** help learners not to type names, addresses, or other personal details into the Prompter. It is told never to ask for them, and it always says it is a computer program, not a person.

**Cost:** requests are charged to the key holder's Claude account. We recommend a monthly spending limit in the Claude Console, and teachers can set a daily limit per pupil.

### Voice

Voice input is optional, in the apps only. The microphone is used only while the learner holds the microphone button. The sound is turned into text on the device and then discarded. It is never saved or sent anywhere. ✔ A school can turn voice input off.

The speech model (about 75 MB) is downloaded once per device, after the learner or an adult agrees, from **[host: the update host, GitHub, if the DPIA's Q9 recommendation is accepted]**, and checked before use. The host sees the device's IP address, as any download does.

Reading aloud uses the device's own voices. Nothing is sent anywhere to read text aloud.

### The editor study (pilot schools only)

In the pilot, some schools help study which of StoryStage's two code editors works better for which learners. A school takes part only if it chooses to, and families are given an information sheet and asked for consent. **[Link: the information sheets (WP19.6).]**

When the study is on, StoryStage records, on the device: which editor is used, when learners switch, how long study tasks take, errors, undos, requests for help, and answers to two short questions after each task. It records these under a random code that changes every session. **It doesn't record names, the learner's film or code, camera images or voice.** The teacher exports the records as a file and sends them to the study team. Nothing is sent automatically.

### Updates

The Windows and Mac apps check for updates at most once a day, by reading a file from **GitHub**, where updates are published. The check says nothing about the device or the learner. GitHub sees the device's IP address, as any website does. A school can turn the check off. The iPad and Android apps are updated by the App Store and Google Play.

### Problem reports

**Report a problem** (in Settings) makes a file on the device with information that helps fix problems: versions, the settings in force, and a check of the app. The Claude key and personal details are removed. Nothing is sent automatically; a teacher can attach the file to our feedback form. **[Link: the feedback form (WP19.4); how long reports are kept.]**

### Optional features a school can switch on

- **Google Drive or OneDrive:** save and open productions in the school's own accounts. The app asks only for access to the files it creates or opens. Google or Microsoft holds the files under the school's agreement with them.
- **Model search (Poly Pizza):** **[Open: the owner's decision on `backstage.search`. The DPIA recommends keeping it off.]** If switched on, the search words go to Poly Pizza.
- **AR (augmented reality), in a later release:** placing a film's set on a real table using the camera. Camera images stay on the device and never go to the Prompter. Recording a film with the camera background is off unless a teacher allows it, and no location is stored.

### This website

`storystage.org` and the browser version at `app.storystage.org` are hosted by **Bluehost** (Newfold Digital). Like any web host, Bluehost keeps server logs, including visitors' IP addresses. **[To complete from the DPIA's Q8: where, and for how long.]** This website sets no cookies for visitors, uses no analytics and loads nothing from other companies. ✔

### Schools

Schools using StoryStage in class decide how pupils' data on their devices is used, and are responsible for it under their own data protection policies. We provide a data protection impact assessment to help schools with their own. **[Link: the published DPIA, or a summary.]**

### Legal basis

We process personal data ourselves only for the website, update checks, problem reports and, for pilot schools taking part, the editor study. Our legal basis is **legitimate interests** in providing and securing StoryStage, and for the study **[public task or legitimate interests, from the DPIA's Q3]**, with research safeguards. Schools set their own legal basis for using StoryStage in class, usually their public task.

### Your rights

You have rights to see, correct and delete your personal data, and to object to or restrict how it's used. Because StoryStage keeps learners' work on their own devices, you can usually see, change or delete it there yourself. For work on school devices, ask the school. For Prompter requests, the key holder can manage them with Anthropic. For anything we hold, contact **[email address]**.

If you're unhappy with how your data has been handled, you can complain to the Information Commissioner's Office (ico.org.uk, 0303 123 1113).

### Families in the United States

StoryStage doesn't collect personal information from children itself. The Prompter sends a child's request to Anthropic only after an adult sets it up with their own Claude account and agrees. **[Open: the DPIA's Annex B, US review.]**

### Changes

We'll update this notice when StoryStage changes how it handles data, and say what changed and when at the top.

---

## Part 2: For learners

*Two versions, to show in the app and on the website. Each is short on purpose: the Children's code asks for information that suits the child's age.*

### Ages 6 to 9

> **Your films are yours.**
>
> - Your films stay on this computer or tablet, or wherever your teacher saves them. We don't get them.
> - **The Prompter** is a computer helper, not a person. When you ask it something, your words go to a company called Anthropic so it can answer. It doesn't see pictures or hear you.
> - Don't tell the Prompter your name, where you live, or your school.
> - When you talk into the microphone, the computer turns it into words. It doesn't keep the recording.
> - If something worries you, tell your teacher or a grown-up you trust.

### Ages 10 to 13

> **What happens to your information**
>
> - **Your work stays with you.** Your films, storyboards and code are saved on this device or wherever you or your teacher save them. StoryStage doesn't have a server and doesn't collect your work.
> - **No tracking.** StoryStage doesn't track what you do, show you adverts or collect statistics about you.
> - **The Prompter is an AI, not a person.** When you ask it something, your question and your production (as words, never pictures) go to Anthropic, the company that runs the AI, so it can answer. Your teacher decides how much of the Prompter your class can use. Don't put your full name, address, school or anything private in a question.
> - **Your voice stays here.** The microphone turns your voice into words on this device, then the recording is deleted.
> - **Sharing films:** if you share a film, everything in it goes too, including the credits. Use your first name, and check with your teacher first.
> - **The study:** if your class is in the study about the code editors, StoryStage notes which editor you use and how long tasks take, with a code instead of your name. Your teacher will tell you, and you can say no.
> - If anything worries you, tell your teacher or a trusted adult.

---

## Part 3: The set-up wording (screens 10a–10d)

*Proposed wording for S5 (the screens) and S8 (spec 05 §1). It brings in the requirements of the Anthropic note (`docs/legal/anthropic-terms-under-18s.md`: the adult gate R1, the AI disclosure R2), the threat model's W10 (the key on the adult's own login), and the system dialog for the key (spec 05 §1.2). Direction A's wording is kept where it already says this.*

### 10a Who is setting up StoryStage?

- **I'm a learner.** "Start making films straight away. An adult can add the Prompter later."
- **I'm the adult who owns the Claude key.** "Set up the Prompter, the optional AI helper. You'll need your own Claude account."

### 10b Meet the Prompter

"Please read this with the learner if you can."

1. The Prompter is an AI helper: a computer program, not a person. It always wears the AI label.
2. It suggests a plan in plain words. Nothing changes until the learner chooses **Build these steps**.
3. It never writes the learner's story. The ideas stay theirs.
4. When the learner asks it something, their request and their production go to **Anthropic**, which runs Claude, as text, using your key. It never sends pictures, camera images or voice recordings. The conversation isn't saved.
5. Help the learner not to type names, addresses or other personal details.
6. **Stop**, **Undo this request**, or switch it off at any time in Settings.

**Consent (two tick boxes, both needed to continue):**

- [ ] "I'm 18 or over, and the Claude account is mine (or my school's or club's). I'm Anthropic's customer for what the Prompter sends, under my agreement with Anthropic."
- [ ] "I agree the Prompter can be used on this device as described above."

Links: "What is sent, and privacy" (Part 1), "Anthropic's terms".

Buttons: **Back**; **Skip: use StoryStage without the Prompter** (as visible as Continue: Children's code standard 13); **I agree, continue**.

### 10c Add your Claude key

"Adults only. Learners never see or type the key."

1. "In the Claude Console, create a workspace called StoryStage, and **set a monthly spending limit** on it."
2. "Create a key in that workspace."
3. "Add it here, on **your own login** on this device, not one that pupils share." (Threat W10.)

Button: **Add key** (opens the system's own secure box; spec 05 §1.2).

Results, as spec 05 §1.3: "Key works. Checked just now." · "That key wasn't accepted." · "That key works but can't use Claude models." · "Couldn't reach Anthropic: check the internet connection or school proxy." · "This device can't keep the key safely, so the Prompter stays off."

Below: "Kept in this device's secure store. It won't appear on screen again, and it's never saved in films, exports, study logs or problem reports." "No key? You can still use everything else."

### 10d You're ready

The summary as Direction A draws it, with **Key: in this device's secure store** (never the key), and a link: "How StoryStage handles information" (Part 1).

### Group devices

On a school device where the school manages the Prompter, 10b and 10c are replaced by: "Your school manages the Prompter on this device." **[Open: until WP24.3 decides how the Prompter reaches a group.]**

---

## What changed from StoryStage 1's notice

| StoryStage 1 | StoryStage 2 |
|---|---|
| "Based on Alice 3" | Written from scratch; no Alice code |
| An optional small picture of the scene could go to the Prompter | **No pictures ever go to the Prompter** (rule 3) |
| Linux Secret Service key store | No Linux in the first release; iPad and Android stores added |
| Problem reports opened a GitHub issue | A local file for the feedback form; nothing sent automatically |
| No updates, study, browser version or Drive | Update checks (GitHub), the editor study, the browser version, optional Drive and OneDrive |
| Speech model from Hugging Face | **[From the update host, if Q9 is accepted]** |
| Policy file keys: 3 | 14 keys, and managed configuration on iPad and Android (spec 05 §3) |
| Learner wording: none | Part 2, for ages 6 to 9 and 10 to 13 |
| One consent tick | Two: the adult's age and responsibility, and consent (the Anthropic note, R1) |
