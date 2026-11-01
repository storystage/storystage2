# Classroom ground truth: questions (WP1.11)

The owner watches two or three TR1 lessons and talks to two school IT managers (workplan 1.11). S1 prepared these questions. The answers feed where pupils' work lives (24.2), how the Prompter reaches a group (24.3), saving (8.4), the reference devices (1.1) and the performance budgets (18.3).

Please write the answers into this file, or into a copy per school with the school named only as "School A", "School B". Record **no pupil names or other personal data**.

## A. Watching a TR1 lesson

Time and flow:
1. How long is the lesson, and how much of it is hands-on with StoryStage?
2. How long from "open the laptop" to a pupil actually working? Where does that time go (logging in, finding the app, finding last week's work)?
3. How many lessons does one production take? Do pupils finish, or does the work carry on next week?

Devices and saving:
4. Which devices are used (make, model, Chromebook or Windows), and are they shared with other classes?
5. How do pupils find and save their work? Where does it end up (the device, a USB stick, a school drive, Google Drive, OneDrive)?
6. Does any pupil lose work in the lesson? How?

Working together:
7. Do pupils work alone, in pairs or in groups? Who holds the mouse?
8. What does the teacher do while pupils work: circulate, demonstrate at the front, help one group?

The Prompter (if it's used in the lesson):
9. Who asks it things: pupils, the teacher, or the teacher for a pupil?
10. How long do pupils wait for an answer, and what do they do while they wait?
11. Does anyone try to make it write their story, or say something it shouldn't?

Where people get stuck:
12. Where do pupils get stuck or ask for help? Note the words they use for things on screen.
13. Noise and space: could pupils use voice input in this room? Do they have headphones?

## B. Talking to a school IT manager

Devices:
1. Which devices do pupils use (models, how old, how much memory), and how many per class? Any **Android tablets**, and how many? (Decides whether AR is tested on Android, decision 0042.)
2. Are devices shared between classes or year groups? Is a device wiped or reset between users?
3. Chromebooks only: are they managed (Google Admin)? Are Android apps allowed through managed Google Play? Who approves a new app, and how long does that take?
4. iPads only: are they managed (which MDM)? Can you push an app and its settings (managed app configuration)?
5. Windows only: how is software installed (Intune, Group Policy, by hand)? Can you deploy a policy file to `C:\ProgramData`?

Network:
6. Does the Wi-Fi let devices in one room see each other? (Client isolation decides whether a classroom relay, option B in 24.3, can work.)
7. Is there a web filter or proxy? Would it allow `api.anthropic.com`, and model downloads (whisper, about 75 MB, once per device)?
8. Is bandwidth limited when a whole class downloads at once?

Accounts and saving:
9. Do pupils have school Google or Microsoft accounts? Can they save to Drive or OneDrive from an app?
10. Where would you want pupils' work to live between lessons: on the device, in their school account, or on a shared drive?
11. What happens to pupils' files at the end of the year?

Policy and approval:
12. What does the school need before it will approve a new app (a DPIA, a privacy notice, a data processing agreement)? Who signs it off?
13. Would the school ever hold a Claude API key for a class? Who would own the account and pay?
14. Are cameras allowed on pupils' devices (for AR, WP21)? Microphones?

## Answers

_To be filled in by the owner._
