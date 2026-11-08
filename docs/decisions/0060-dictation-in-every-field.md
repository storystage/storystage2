# 0060 Dictation in every field

- **Status:** settled
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answer in the S5 session, on S8's contract pull request #152 (speech models in the host interface)

## Decision

**Learners can dictate into every field they type in,** as Direction A draws: a mic button beside each one, including the logline, synopsis, scene headings, script lines and captions, as well as requests to the Prompter. This is speech recognised **on the device** (decision 0020): the words go into the field, and the audio never leaves the device or reaches the Prompter (rule 3).

Dictation **doesn't depend on the Prompter.** It works when the Prompter is off or not set up, so speech input is no longer only "a way to give the Prompter a request without typing" (spec 06 section 1, before this decision).

## What follows

- **S7** widens spec 06: dictation into any text field, with the same capture, transcription and error rules; the Prompter's Hold to talk becomes one use of it. The learner's own switch (spec 06 section 1.1) stays, worded for dictation in general.
- **S8** gives dictation a policy key of its own, separate from the Prompter's level, so a school can allow dictation while the Prompter is off, or switch it off on its own. `HostInterface.speech` then follows that key instead of the Prompter's level (#152). S8 names the key in spec 05 and workplan 15.3.
- **S5** shows the mic beside each text field when `HostInterface.speech` isn't `null` (`TextField`'s `onSpeak`), as Direction A's hard rules say. The Claude key is still never spoken: it is entered in a system dialog (decision 0056).
- **Unchanged:** the browser version has no speech input (15.6). Speech models are bundled or downloaded as decision 0057 says.
