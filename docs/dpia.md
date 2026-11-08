# Data protection impact assessment (WP17.3)

- **Status:** **draft for the owner's approval** (17.3 is "C drafts; U approves"). Not legal advice: section 8 lists the questions for a solicitor or data protection officer before the pilot.
- **Written:** 8 November 2026, by session D, from the specs and decisions as they stand that day. Sections marked **To verify** describe things specified but not yet built; they are checked against the build before the pilot (WP19), and this document is updated then.
- **Covers:** StoryStage 2 as the first release will ship it (the apps for Windows, macOS, iPad and Android, and the browser version), the website `storystage.org`, updates, and the features planned for after the release candidate that the workplan says the DPIA must cover (AR, 21.5 and 22.8–22.9). Workplan 17.3 lists them; section 2.4 maps each one.
- **Follows** the structure of the ICO's DPIA template: the need (1), the processing (2), consultation (3), necessity and proportionality (4), risks (5), measures (6), sign-off (7). Annex A reviews the ICO Children's code's 15 standards. Annex B covers the US, because the apps are offered in US stores (decision 0043).
- **Ids:** F1–F17 are the data flows (section 2.1), R1–R16 the risks (section 5), Q1–Q12 the legal questions (section 8). Ids such as W8, L5, B2 or U6 are threats in the threat model (`docs/spec/15-security.md`). "The Anthropic note" is `docs/legal/anthropic-terms-under-18s.md` (#52), whose own requirements are also numbered R1–R10; they are always called "requirement Rn in the Anthropic note" here.
- **Feeds:** the privacy notice and the set-up wizard's consent text (17.4, `docs/privacy.md`), the app-store privacy labels (15.5), the teacher guide (19.2), and the pilot's consent and information sheets (19.6).

## 1. Why a DPIA is needed

StoryStage is used by children aged 6 to 13 (decision 0039), in schools and at home. The ICO lists processing children's personal data, and offering online services to children, among the cases where a DPIA is expected, and the Children's code (standard 2) asks for one. The design also involves:

- an AI service (Anthropic's Claude) receiving children's free text, in the United States;
- optional research use (the editor study, 7.13 and 19.5);
- camera use, in the AR features after the release candidate.

So a DPIA is required, and it is written before the features are built rather than after.

## 2. The processing

### 2.1 Nature: what StoryStage does with data

StoryStage is designed to process almost everything **on the device**. There are no accounts, no StoryStage server, no analytics and no advertising (CLAUDE.md rule 2). The only data that leaves a device does so in the flows marked **leaves the device** in the table below, and none of it goes to the StoryStage project.

| No. | Flow | Data | Where it goes | When | Status |
|---|---|---|---|---|---|
| F1 | **Productions** | The learner's own words (title, logline, synopsis, script, captions, names they type, credits), the program, frame layouts, any imported models with their licence and source | A `.storystage` file on the device, or where the learner or teacher saves it (8.4; and, if switched on, the school's Google Drive or OneDrive, 8.5) | Always | Specified (spec 03); building |
| F2 | **The Prompter** | The learner's request as text; the production, storyboard and program as text (spec 04 §2); the conversation so far | **Leaves the device:** to Anthropic's API (`api.anthropic.com`), under the Claude account of the adult who added the key | Only in the apps, only after an adult completes set-up, only at a level the teacher allows, only when the learner asks | The gate, key store and transport are built (#108, #109, #110, the leak scan #111), and building a request (#133); **to verify:** the Prompter panel and modes (WP13b) |
| F3 | **The Claude key** | The adult's API key, typed into the system's own dialog, never the studio (decision 0056) | The device's secure store; sent only to Anthropic with each request | When the Prompter is set up | Built (#109, #110), with the leak scan in CI (#111) |
| F4 | **Voice input** | Microphone audio while the learner holds a microphone button, at most 30 seconds | Turned into text on the device by whisper.cpp, in memory only, then zeroed and discarded. The text goes into the field for the learner to check (spec 06 §1.5–1.7) | In the apps, beside every text field except the key, with or without the Prompter (decision 0059); a school can turn it off. The browser version: only if S8 and S7 allow it (0059) | Specified (spec 06); **to verify** in the build |
| F5 | **The speech model** | None | Built into the app (decision 0058): **no download, so speech makes no network traffic at all** | — | Decided |
| F6 | **Speech output** | Text to be read aloud | The device's own voices only (voices marked `localService`) | When text is read aloud | Specified (14.2) |
| F7 | **Recorded lines** | The learner's recorded voice, for lines they choose to record | Inside the production file (spec 03 §1) | Release 1.2 (14.4), not the first release | Later |
| F8 | **Study logs** | A random id per session; which editor, switches, time per study task, errors, undos, help requests, and answers to two short questions per task. No names, program content, camera or voice | On the device until the teacher exports them as a file, then to the study team | Pilot schools only, when a school switches the study on (`study.enabled`) | Specified (7.13); spec 14 §5 not yet written |
| F9 | **Report a problem** | Scrubbed logs, the self-test result, versions, the policy in force | A file on the device that the teacher may attach to the feedback form | When a teacher asks | Specified (18.5); the form is open (19.4) |
| F10 | **Settings, policy and counters** | The class's settings, the policy in force, the day's Prompter count, the update rollout bucket | The device only | Always | Specified (spec 05) |
| F11 | **Update checks** | None about the learner. The request reveals the device's IP address | **Leaves the device:** GitHub Releases (decision 0047), once a day at most | Desktop apps, unless the school sets `update.channel=off` | Specified (spec 05 §4) |
| F12 | **App stores** | What Apple and Google collect as stores | Apple and Google, under their own terms | When the app is installed or updated | Outside StoryStage's control |
| F13 | **The website** | Visitors' IP addresses and requests, in the host's server logs | **Leaves the device:** Bluehost (Newfold Digital), which hosts `storystage.org` and `app.storystage.org` (0046) | When anyone visits | Live host; pages not yet published |
| F14 | **Backstage search** | A teacher's search words | **Leaves the device:** Poly Pizza's API | Teachers only, on unless the school sets `backstage.search=false`; models about guns screened out (decision 0055) | Specified; not built |
| F15 | **AR camera** | Camera images, used to place the set on a table | The device only; never to the Prompter | After the release candidate (21.5); `ar.enabled` | Later |
| F16 | **Mixed-reality films** | Video from the camera, with the performance on top | An MP4 on the device | After the release candidate (22.8); off unless the teacher sets `ar.recording` | Later |
| F17 | **AR packs** | 3D files of the production, with credits | Shared as the school chooses (a website, Drive or OneDrive links) | After the release candidate (22.9) | Later |

**Never collected or sent anywhere:** location; contacts; device identifiers; advertising identifiers; usage analytics; crash reports sent automatically; camera images or audio to the Prompter (rule 3); anything to a StoryStage server (there is none).

### 2.2 Scope

- **Who:** learners aged 6 to 13; their teachers and club leaders; parents; the adult who holds the Claude key.
- **Personal data:**
  - **Ordinary:** whatever learners type into their productions (often first names in credits, sometimes more), the Prompter requests, pseudonymous study logs, IP addresses seen by hosts.
  - **Special category:** not sought. But free text can contain anything a child chooses to type (health, family, beliefs), and voice is processed transiently (F4). The design keeps both on the device, except free text the learner chooses to send to the Prompter (F2): risk R1.
  - **Biometric data:** none. Voice audio is turned into text and discarded; it isn't used to identify anyone. Camera images in AR (F15) aren't used for recognition.
- **Volume:** the pilot is 2 to 3 schools and a club (WP19.3); the first release could reach many schools in the UK and US.
- **Retention:** section 4.4.

### 2.3 Context

- **Children** are the main users, so the Children's code applies to the service as a matter of good practice at least; whether it applies in law to the parts that never leave the device is question Q1 (section 8).
- **Schools** decide whether and how StoryStage is used, on their own devices, under their own data protection policies. They are most likely the **controllers** of pupils' data processed in class (section 2.5).
- **AI:** children, and many adults, don't know how an AI reaches its answers, or that it can be wrong. The Prompter is optional and off by default (decision 0022). The four class levels (decision 0034) let a teacher choose how much of it pupils get.
- **Shared devices** are common in schools: risks R4 and R10.
- **Public concern:** AI tools for children and data leaving schools draw scrutiny. StoryStage's no-server design is an answer to that, and should be said plainly.
- **Codes and standards:** UK GDPR and the Data Protection Act 2018, as amended by the Data (Use and Access) Act 2025; the ICO's Children's code; the Department for Education's data protection guidance for schools; WCAG 2.2 AA; Anthropic's terms for products used by minors (`docs/legal/anthropic-terms-under-18s.md`); in the US, COPPA and state laws (Annex B).

### 2.4 The items workplan 17.3 lists

| Item in 17.3 | Where it is covered |
|---|---|
| The Prompter's data flow to Anthropic under the user's account | F2, F3; risks R1–R3, R9 |
| Scene pictures | **None are sent.** StoryStage 1 had an option to send a small picture of the scene; StoryStage 2 doesn't (rule 3; spec 04 §2.1; the gate refuses image content, spec 05 §2.3) |
| Speech, on the device | F4, F5, F6, F7; risk R11 |
| Shared devices and the Prompter route (24.2, 24.3) | R4, R10; section 8, Q5–Q6 |
| The AR camera (21.5) | F15; R8 |
| AR packs and mixed-reality films (22.8, 22.9) | F16, F17; R8 |
| The editor study (7.13, 19.5–19.6) | F8; R6 |
| Drive and OneDrive | F1; R13 |
| App-store privacy labels | Section 6.3 |
| The US (decision 0043) | Annex B |
| The website and update host (0046, 0047) | F11, F13; R12 |
| Backstage search (3.12, deferred to the DPIA) | F14; R14; decided in 0055 |

### 2.5 Who is responsible for what (proposed; question Q2)

| Party | Role | For |
|---|---|---|
| **A school** (or club) using StoryStage | Controller | Pupils' data processed on its devices for its teaching: productions, study logs it exports, Prompter use under a key it holds, AR recordings |
| **The adult who holds the Claude key** (a teacher, club leader or, if Anthropic confirms, a parent) | Anthropic's customer; for a school's key, acting for the school | The Prompter requests sent under their key (F2) |
| **Anthropic** | Processor for the key holder's organisation, under Anthropic's Commercial Terms and data processing addendum | F2 |
| **A parent** using StoryStage at home | Likely within the household exemption | Their own family's use |
| **The StoryStage project** (today the owner, trading as StoryStage; who runs it after the pilot is open) | Controller | The website (F13), update checks (F11), the feedback form (F9), and the editor study's data once received (F8) |
| **The StoryStage project** | Designer and provider | The design of everything else. It receives none of that data, but it decides what the app does with it, so it carries the duty to build privacy in: this DPIA |
| **Bluehost (Newfold Digital), GitHub (Microsoft)** | Processors or independent controllers of their own logs, per their terms | F11, F13 |
| **Apple, Google** | Independent controllers | F12 |
| **Google, Microsoft** (Drive, OneDrive) | The school's processors, under the school's existing agreements | F1, if switched on |

## 3. Consultation

| Who | How | When | Status |
|---|---|---|---|
| Teachers | The five interviews (16.7) and the pilot teachers' review of the use cases (16.6) | Before the pilot | Planned |
| School IT managers | Classroom ground truth (1.11): devices, filters, device management, where work is kept | M1 | Planned |
| A school data protection officer | Review of this DPIA and the privacy notice, ideally a pilot school's DPO | Before the pilot | **To arrange** (owner) |
| Children | Through the pilot: whether they understand the Prompter's "AI" label and the privacy information written for them (section 6.2) | Pilot | Planned |
| Parents | The information sheets and consent for the editor study (19.6) | Before the pilot | Drafting (19.6) |
| A solicitor or privacy specialist | Section 8's questions | Before the pilot | **To arrange** (owner) |
| A US privacy specialist | Annex B | Before the US store listings | **To arrange** (owner) |
| An academic partner | Ethical review of the editor study (19.5–19.6) | Before the pilot | Being sought (owner) |

## 4. Necessity and proportionality

### 4.1 Lawful basis (proposed; question Q3)

| Processing | Who is controller | Proposed basis |
|---|---|---|
| Productions and settings, in class | The school | Public task (state schools), or legitimate interests (independent schools and clubs): teaching the curriculum (`docs/curriculum/`) |
| The Prompter, in class or a club | The school or club | As above. **Not consent:** a pupil can't freely refuse a classroom tool, and children can't agree to Anthropic's terms. The adult who sets up the Prompter agrees as Anthropic's customer, which is a contract matter, not the pupil's lawful basis |
| The editor study | The study team (the StoryStage project, with any university partner) | Public task (if a university leads) or legitimate interests, with the research safeguards of UK GDPR Article 89. **Research consent** (19.6) is still asked, as an ethical requirement, separate from the lawful basis |
| Website and update logs | The StoryStage project | Legitimate interests: delivering and securing the site and the apps |
| At home | The parent | Household use; outside UK GDPR for the parent |

### 4.2 Data minimisation

- **Nothing is collected** that the feature doesn't need: no accounts, names, emails, ages, device identifiers or analytics.
- **The Prompter gets text, not pictures** (rule 3), and only what it needs: the current scene in full, other scenes summarised over budget (spec 04 §2.3).
- **Conversations aren't kept:** a conversation lives in memory and ends when the production closes (spec 04 §1, "never stored in a production").
- **Voice audio is discarded** after transcription (14.1).
- **Study logs** carry no names, program content, camera or voice (7.13), and use a fresh random id per session.
- **The update check** sends only a channel or version (spec 05 §4.1), and the rollout bucket stays on the device.

### 4.3 Accuracy

The Prompter can be wrong. It never decides anything about a learner: no marks, grades or assessments (requirement R9 in the Anthropic note), so its errors affect a production, not a person's record. Its changes are labelled undo steps (L8), and learners are taught to check them (teacher guide, page 5).

### 4.4 Retention

| Data | Kept for |
|---|---|
| Prompter conversations | The open production only; never saved |
| Voice audio | Seconds; discarded after transcription |
| Productions | As long as the learner, school or parent keeps the file. The school's retention policy applies to school devices |
| Daily Prompter counts | The current day, on the device |
| Study logs on the device | Until exported. **Proposed:** the app deletes them from the device when the teacher confirms the export, and offers to delete unexported logs at the end of the study (to add to 7.13) |
| Study logs with the study team | **Open:** set by the study protocol (19.6). Proposed: pseudonymous logs kept until the editor decision (19.8) plus 12 months, then deleted |
| Diagnostic bundles | Until the teacher deletes the file. Feedback received: **open** (19.4); proposed: until the issue is closed, plus 12 months |
| Data sent to Anthropic | Anthropic's retention under the key holder's terms. **To check** (Q7) |
| Website and update-check logs | The host's own retention. **To check** with Bluehost and GitHub (Q8) |

### 4.5 People's rights

Because StoryStage holds nothing centrally, most rights are exercised **on the device or with the school**:

- **Access, erasure, rectification:** the learner, teacher or parent opens, edits or deletes the production file. Requests about pupils' data go to the school as controller.
- **Prompter requests:** the key holder deals with Anthropic, under their account.
- **Study logs:** they are pseudonymous, and the study team can't link a log to a child without the session id. The information sheet (19.6) says how to withdraw: the teacher can delete a pupil's sessions before export, and, if the school keeps a key between session ids and pupils, the study team deletes on request.
- **Website and feedback:** the contact address (**open**).
- **Complaints:** the ICO.

### 4.6 Transfers outside the UK

- **Anthropic** (US): a restricted transfer, made by the key holder's organisation. It relies on Anthropic's terms and data processing addendum. **To check** (Q7): the transfer mechanism (the UK Extension to the EU–US Data Privacy Framework, or the IDTA or UK Addendum in Anthropic's DPA), and say which in the privacy notice.
- **GitHub** (US) for update checks: IP addresses only.
- **Bluehost:** **to check** where it hosts `storystage.org` (Q8).

### 4.7 Processors and suppliers

Each must be named in the privacy notice: Anthropic (F2), Bluehost (F13), GitHub (F11), Poly Pizza only if search is switched on (F14), and Google or Microsoft only if a school switches on Drive or OneDrive (F1).

## 5. Risks

Likelihood and severity before the measures in section 6: **remote**, **possible** or **probable**; **minimal**, **significant** or **severe**.

| No. | Risk to individuals | Likelihood | Severity | Before |
|---|---|---|---|---|
| R1 | A child types personal details (their name, school, address, worries) into the Prompter, and they go to Anthropic in the US (threat L5) | Probable | Significant | **High** |
| R2 | The Prompter shows a child something inappropriate, frightening or misleading, or a crafted production steers it (L2, L6) | Possible | Significant | Medium |
| R3 | The adult's key leaks or is misused (for example on a shared Windows login, W10), running up cost or exposing other data in that account | Possible | Significant | Medium |
| R4 | On a shared device, a pupil opens another pupil's work, or finds it in browser storage (B5) | Probable | Minimal to significant | Medium |
| R5 | A film shared publicly carries a child's full name, voice, face (in AR films) or school | Possible | Significant | Medium |
| R6 | Study logs are linked back to a child, or used beyond the study | Remote | Significant | Low |
| R7 | A diagnostic bundle carries personal data or the key to whoever receives it | Possible | Significant | Medium |
| R8 | AR camera images or mixed-reality films capture bystanders, a child's home, or children who didn't agree | Possible | Significant | Medium |
| R9 | Data sent to Anthropic is kept, used or disclosed beyond what the school expects | Remote | Significant | Low |
| R10 | Children or parents don't understand what the Prompter is or what it sees (transparency), or a child uses it without an adult's agreement | Possible | Significant | Medium |
| R11 | The microphone records more than the child meant, or audio leaves the device | Remote | Significant | Low |
| R12 | The website or update host tracks visitors (for example through WordPress plugins, Elementor's Google Fonts, or analytics) | Probable without checks | Minimal | Medium |
| R13 | Drive or OneDrive access is broader than needed, or links pupils' work to accounts unexpectedly | Possible | Significant | Medium |
| R14 | Backstage search sends search words to a third party, and shows models that aren't moderated for children | Possible | Significant | Medium |
| R15 | The Prompter writes the child's story, or the child relies on it, against the child's best interests (standard 1) | Possible | Minimal | Low |
| R16 | Pupils' work is lost between lessons, or the school can't meet its retention policy, because where work lives isn't settled (24.2) | Probable until decided | Significant | Medium |

## 6. Measures

### 6.1 Measures for each risk

| Risk | Measures | Who | Residual |
|---|---|---|---|
| R1 | Prompter off by default; a teacher chooses its level, or off (0034); plain words on the panel: "Don't type your name, address or other personal details" (requirement for S5); the system prompt tells it never to ask for personal details (13.8); text only, never pictures or audio (gate, spec 05 §2.3); conversations never saved; the adult's set-up says what is sent; teacher guide and lesson rules (use cases' common rules) | S5, S7, S8, D | **Medium.** Free text can't be filtered reliably, so this can be reduced, not removed. Accepted with the measures, because the Prompter is optional and the curriculum value doesn't depend on it (`docs/curriculum/mapping.md` §4). **Proposed extra** for S7: a local check that warns before sending text that looks like a phone number, email or postcode |
| R2 | Anthropic's child-safety measures and the guidelines for organisations serving minors (R1–R10 in the Anthropic note); the system prompt's safety rules; learner text passed as delimited data (spec 04 §2.4); no tool can write the story (L2); replies shown as plain text with no links (L6); the evaluation set's safety and injection categories (13.7); Stop and Undo; safeguarding guidance for teachers (teacher guide, page 5) | S7, D | Low |
| R3 | Key in the OS secure store, never in a file, never shown again (spec 05 §2); the gate (2.3); caps (2.4); the wizard asks for a spend-limited workspace and says the key belongs on the adult's own login (W10); Remove key | S8 | Low |
| R4 | Decide 24.2 before 8.4 is built; class and pupil separation (24.4); in the browser version, a banner while work isn't saved to a file, and a prompt to download (B5, 8.4) | Owner, S4, S8 | Low once 24.2 is built; **medium until then** |
| R5 | Credits use first names or initials by default (export and AR packs, 22.9); licences block public export where they must (3.12); teacher guide and use cases on school consent arrangements; key-shaped text is scanned before save and export (threat F11 in `docs/spec/15-security.md`) | S1, S2, D | Low |
| R6 | Pseudonymous logs with a fresh id per session, no names, content, camera or voice (7.13); on the device until a teacher exports; the study's information sheets and consent (19.6); ethical review; deletion on the device after export (proposed, 4.4) | S5, S6, D, owner | Low |
| R7 | Logs scrubbed, key never formatted (W8); the bundle is a file the teacher sees before sending; nothing sent automatically (18.5). **Proposed:** the bundle lists its contents in plain text, and leaves out production content unless the teacher adds it | S1 | Low |
| R8 | Camera images never leave the device and never go to the Prompter (21.5); recording off by default, teacher setting (`ar.recording`); a reminder about filming people before recording (22.8); no location data stored (22.9); `ar.enabled` lets a school turn AR off. **To revisit** when WP21–22 are specified | S2, S3, owner | Low (to revisit) |
| R9 | Anthropic's Commercial Terms: no training on customer content; the DPA; the key holder is the customer and can delete their workspace; the privacy notice names Anthropic and links its terms | Owner (Q7) | Low |
| R10 | An adult must complete set-up; the "AI" badge always shown, and its colour used for nothing else; "a computer program, not a person" (10b); privacy information written for children (6.2); the teacher guide; Learn's guided films | S5, S8, D | Low |
| R11 | The microphone is used only while the button is held, for at most 30 seconds, and its tracks stop on release, on blur and when the page is hidden, so the system's microphone light goes off; audio stays in memory, is never written, logged or sent, and is zeroed after transcription; the text goes into the field for the learner to check, and nothing is sent to the Prompter until they press Send; the system's own microphone permission is asked the first time; the model is in the app, so nothing is downloaded (0058); a school can turn voice input off; no microphone on the key field (spec 06; decisions 0058, 0059) | S7, S8 | Low (**to verify**, WP14a) |
| R12 | `website/README.md`'s pre-publish check (no statistics plugins, no Google Fonts or Font Awesome from a CDN, no visitor cookies, nothing from third parties); the browser version on its own origin with no third-party requests (B2); the update check holds nothing about the device (U6); `update.channel=off` | Owner, S8 | Low once the check is done |
| R13 | Off by default; Google Drive's narrowest scope (`drive.file`), and the equivalent for OneDrive; through the school's own Google or Microsoft accounts, under its agreements (8.5) | S4, owner | Low |
| R14 | **Decided (0055):** search is for teachers only, never learners, so no child's search words leave the device; models about guns are screened out by whole-word and compound match; every import still shows its report before reaching a class (3.11); a school can switch search off. The owner chose "on for teachers by default" over the recommended "off by default". The screen is a keyword filter, not moderation | S4, S8 | Low |
| R15 | No tool can write the logline, synopsis or script (spec 04 §3.4); the story coach only asks; plan before change; the teacher levels | S7 | Low |
| R16 | Decide 24.2 at M1, before 8.4 | Owner | Low once decided |

### 6.2 Transparency (Children's code standard 4)

- **For adults:** the full privacy notice (`docs/privacy.md`), the website's privacy summary, the set-up wizard (10b), and the teacher guide.
- **For learners:** short, plain statements where the data is used, not just in a notice. For example:
  - on the Prompter panel: "The Prompter is a computer program. Your words go to a company called Anthropic to get an answer. Don't type your name or where you live";
  - by the microphone, the first time: "Your voice is turned into words on this device. The recording isn't kept";
  - in study mode: "Your teacher is helping with a study about the two code editors. It records which editor you use and how long tasks take, not your name or your film".
- A learner version of the privacy notice, for ages 6 to 9 and 10 to 13, is in `docs/privacy.md`.

### 6.3 App-store privacy labels (15.5)

**Proposed, for the owner and S8, to confirm with each store's current rules:**

- **Apple (App Privacy):** declare **"User Content: Other User Content"**, used for **App Functionality**, **not linked** to the user's identity, **not used for tracking**. The Prompter sends the learner's text to Anthropic, a third party that keeps it for a time, so it counts as collected even though StoryStage never sees it. Nothing else is collected. Being open here is safer than "Data Not Collected".
- **Google Play (Data safety):** declare **"App activity: other user-generated content"**, shared with Anthropic for app functionality, encrypted in transit, **optional** (the Prompter can be off), and say users can delete it (the key holder, through Anthropic).
- **Both:** no analytics SDKs, no advertising identifiers. If the apps join Apple's **Kids category** or Google's **Families** programme (Annex B), a parental gate guards the set-up wizard and every link that leaves the app.

## 7. Sign-off

| Item | Name and date | Notes |
|---|---|---|
| Measures approved by | **[owner]** | Integrate them into the work packages named in section 6 |
| Residual risks approved by | **[owner]** | R1 stays **medium** with the measures; no residual risk is high, so prior consultation with the ICO isn't expected (to confirm, Q10) |
| DPO or specialist advice | **[to arrange]** | Section 8 |
| Summary of advice | | |
| Advice accepted or overruled by | | If overruled, record why |
| Consultation responses reviewed by | | Section 3 |
| Kept under review by | Session D, then the owner | Reviewed: before the pilot (verifying "To verify" items); at each release; when WP21–22 (AR) are specified; when 24.2 and 24.3 are decided; and when any new third party is proposed |

## 8. Questions for legal advice (before the pilot)

| No. | Question |
|---|---|
| Q1 | Does the Children's code apply in law to the parts of StoryStage that run only on the device and send the StoryStage project nothing? (This DPIA follows it throughout either way.) |
| Q2 | Are the roles in section 2.5 right, especially: the school as controller of Prompter use under its own key; the StoryStage project's position as a provider that receives no learner data; and a parent at home? |
| Q3 | Are the lawful bases in 4.1 right, especially for the Prompter in class, and for the editor study? |
| Q4 | What should the StoryStage project offer schools so they can do their own DPIAs: this document, a summary, a data processing statement? |
| Q5 | Where pupils' work lives between lessons (24.2): which option best suits schools' retention and access duties? |
| Q6 | How the Prompter reaches a group (24.3): what changes for the DPIA under option B (the classroom relay) or C (keys on devices)? |
| Q7 | Anthropic: how long it keeps API inputs and outputs under the current Commercial Terms, and which UK transfer mechanism its DPA uses. |
| Q8 | Bluehost and GitHub: where the logs are held, for how long, and under which terms. |
| Q9 | *Answered:* the speech model ships inside the app (decision 0058), so there is no download and no host. |
| Q10 | With R1 at medium after measures, is prior consultation with the ICO needed? |
| Q11 | The Data (Use and Access) Act 2025's changes for services likely to be used by children: has anything commenced that changes this assessment? |
| Q12 | The US: Annex B. |

## Annex A: the ICO Children's code, standard by standard

| No. | Standard (paraphrased) | How StoryStage meets it | Gap or action |
|---|---|---|---|
| 1 | **Best interests of the child** come first in design | Storyboard first; the story stays the learner's; no ads, no engagement loops; a free tool for learning; accessibility to WCAG 2.2 AA | None |
| 2 | **Do a DPIA** | This document | Approve, then keep it under review (section 7) |
| 3 | **Age-appropriate application:** fit the protections to the ages using it | One design protects the youngest (6), with no age checks on children needed: the only adult gate is for the Claude key (17.5, R1) | None |
| 4 | **Transparency:** clear, prominent, age-appropriate privacy information, with "bite-sized" explanations at the point of use | Section 6.2; the learner version of the notice; the AI label | S5 to place the point-of-use explanations; test with children in the pilot |
| 5 | **Detrimental use of data:** no uses shown to be harmful to children's wellbeing | No profiling, ads, rankings or streaks; the Prompter doesn't grade (R9 in the Anthropic note) | None |
| 6 | **Policies and community standards:** uphold your own published terms | The privacy notice describes only what the app does; tests check the claims (for example that the browser build makes no third-party request, B2) | Publish terms of use with the release (owner) |
| 7 | **Default settings:** high privacy by default | Prompter off; voice input only while a button is held, on the device, with nothing downloaded or sent; study off; search for teachers only (0055); Drive and OneDrive off; AR recording off; first-name credits | None |
| 8 | **Data minimisation** | Section 4.2 | None |
| 9 | **Data sharing:** don't disclose children's data unless there's a compelling reason | Only to Anthropic, only when the learner asks the Prompter, only at a level the teacher allows, under the adult's agreement | None |
| 10 | **Geolocation:** off by default, obvious when on | No location is collected, including in AR (22.9) | None |
| 11 | **Parental controls:** tell the child when they're being monitored | The teacher levels, the school lock and study mode are controls. The learner is told when the study is on (6.2), and that a teacher can see Prompter plans saved with a frame (spec 04 §6.7) | S5: the learner-facing study notice and the plan-visibility note |
| 12 | **Profiling:** off by default | None at all | None |
| 13 | **Nudge techniques:** don't nudge children to give more data or weaken protections | No dark patterns; "Skip" is always offered in set-up; nothing rewards using the Prompter | S5 to keep the set-up's Skip as visible as Continue |
| 14 | **Connected toys and devices** | Not applicable | None |
| 15 | **Online tools:** help children exercise their rights and report concerns | Report a problem (18.5); the teacher guide's safeguarding steps; a contact address (**open**) | Owner: contact address; the feedback form (19.4) |

## Annex B: the United States (decision 0043)

**For review by a US privacy specialist before the US store listings.**

| Law or rule | What it asks | StoryStage's position | Question |
|---|---|---|---|
| **COPPA** (with the FTC's 2025 amendments) | An "operator" of an online service directed to children under 13 that collects their personal information needs verifiable parental consent, a notice, and security and retention rules | StoryStage collects nothing itself. The Prompter sends a child's text to Anthropic under an adult's key | Is StoryStage, the school, the adult key holder or Anthropic the operator for the Prompter flow? Does the adult's set-up count as consent, or does the school-authorisation route apply for schools? |
| **FERPA** | Schools' control of education records | Productions and study logs stay with the school | Are study logs education records once a school exports them? |
| **State student privacy laws** (for example California's SOPIPA) | No targeted ads, no selling or profiling of students' data by school services | StoryStage does none of these | Any state needing a signed data privacy agreement with schools (for example through the Student Data Privacy Consortium)? |
| **State children's design codes** | Vary by state, some under legal challenge | Annex A goes further than most | Which apply? |
| **Apple's Kids category** | No third-party analytics or ads; a parental gate before links leave the app or purchases | No analytics or ads; parental gate needed on set-up and links | Whether to join the Kids category (owner, with S8) |
| **Google Play's Families policy** | Similar, plus the Teacher Approved programme | As above | As above |

## Annex C: what changed from StoryStage 1

- **No scene pictures** go to the Prompter (StoryStage 1 had an opt-in picture).
- **No Linux,** so no Secret Service key store; no DPAPI fallback file (spec 05 §2.1).
- **New flows:** update checks (GitHub), the browser version on its own origin, study logs, Drive and OneDrive, Backstage import and search, and later AR.
- **Speech:** StoryStage 1 downloaded its model from Hugging Face; StoryStage 2 ships it in the app, so speech makes no network traffic (0058). Voice input now works in every text field, not only for the Prompter (0059).
- **Problem reports:** StoryStage 1 opened a GitHub issue in the browser; StoryStage 2 builds a local bundle for a feedback form (18.5).
