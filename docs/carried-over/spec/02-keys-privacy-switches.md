> **StoryStage 2 note (WP0.7).** Copied unchanged from storystage/storystage@325c73d (17 Oct 2026). It is a reference, not a StoryStage 2 spec.
> Replaced by: docs/spec/05-keys-privacy-switches.md. Owner: S8. Work package: WP15.
>
> What changes in StoryStage 2:
> - The wizard is a native screen in `apps/desktop`: the key is typed into native UI and goes straight to the OS secure store (Credential Manager, Keychain, Android Keystore), never through the webview.
> - Linux and the Secret Service are out (no Linux in the first release). The DPAPI fallback is reconsidered in the threat model (WP0.9).
> - Page 1 no longer mentions scene pictures, because none are ever sent. Costs are re-measured with the per-mode models (WP24.3).
> - Policy and managed configuration work per platform: a policy file on Windows and macOS, and managed app configuration on iPad and Android (WP15.3). The keys `prompter.enabled`, `prompter.explainOnly` and `prompter.voiceInput` carry over; `prompter.planOnly` is new (13.9).
> - The off switches stay: the user switch (off by default), the school or exam lock, and a build without the Prompter. In StoryStage 2 that build is the browser version, which has no transport at all.
> - The privacy notice moves to session D and the DPIA (WP17).

---

# 02 Keys, privacy and off switches

Implements workplan WP1.5 (key and privacy) and WP1.7 (off switches).

## 1. Set-up wizard

A Croquet wizard (`WizardDialogCoreComposite` with `WizardPageComposite` pages), opened from **Preferences → StoryStage Prompter → Set up…** or from the panel's **Set up** button. Completing it is the only way to switch the Prompter on.

| Page | Content | Leaves when |
|---|---|---|
| 1 What the Prompter does | Plain-language summary; what is sent to Anthropic (the world's code, scene pictures when allowed, the typed or transcribed request); what is never sent (audio, files, the key to anyone but Anthropic); typical cost per request (10 to 30 US cents on the default model, up to about 50 cents for the first request in a session, as measured in TR1); "The Claude account must belong to an adult (18 or over): a parent, teacher or school." | **Next** |
| 2 Create your Claude account | Steps with the Console address shown as copyable text: sign up; add credit or billing; create a workspace called "StoryStage" and set a monthly spend limit; create an API key in that workspace (choosing **Continue with an API key** when the Console offers identity federation, which is for cloud workloads); copy it at once, as it is shown only once | **Next** |
| 3 Enter your key | Password-style field (masked, with a show toggle), paste allowed. **Check key** lists models with the key (no tokens used) | The check succeeds |
| 4 Options | Mode default ("Show me how" or "Build it"); voice input on/off; spoken steps on/off; "let the Prompter see the scene" on/off | **Finish** |

Key check results: success; "That key wasn't accepted" (401); "That key works but can't use Claude models" (403/404); "Couldn't reach Anthropic: check the internet connection or school proxy" (network). The key is stored only after a successful check.

## 2. Key storage

```java
interface KeyStore {
  Optional<String> read();
  void write(String key);   // replaces any existing key
  void delete();
}
```

| Platform | Implementation | Location |
|---|---|---|
| Windows | `com.github.javakeyring:java-keyring` (Windows Credential Manager) | Credential "StoryStage/anthropic-api-key" |
| macOS | same library (Keychain) | Service "StoryStage", account "anthropic-api-key" |
| Linux | same library (Secret Service) | same |
| Fallback when the keyring is unavailable | Windows: DPAPI (`Crypt32Util.cryptProtectData` via JNA) to `%APPDATA%\StoryStage\key.bin`; other platforms: no storage, and the key is asked for each session | Encrypted to the Windows user account |

The licence of `java-keyring` and its dependencies (JNA, jkeychain, secret-service) is confirmed before it's added, and recorded in NOTICE.

**Rules (each has a test):**
- The key is held in memory only while a request is being built, and is never logged. `toString()` of any object holding it returns `sk-ant-…(hidden)`.
- It never appears in preferences, projects, backups, crash reports or the issue reporter. The reporter scrubs `sk-ant-[A-Za-z0-9_-]{20,}` from all text before sending.
- The `ANTHROPIC_API_KEY` environment variable is ignored. The client is built with the stored key only.
- **Remove key** in Preferences deletes it from the store and switches the Prompter off.

## 3. Usage meter

Each response's `usage` (input, cache read, cache write, output tokens) is added to a per-month total in preferences. The panel shows "This month: N requests, about £X" using prices from `prompter-prices.json`, which is shipped with the app and updated each release. The figure is labelled an estimate, with a pointer to the Console for exact billing.

## 4. Off switches

| Level | Mechanism | Effect |
|---|---|---|
| User | `PrompterEnabledState` (Croquet `PreferenceBooleanState`, default **false**); also `VoiceInputState`, `SpokenStepsState`, `SceneImagesState`, `ExplainOnlyState` | Off: panel hidden, no Claude client created, no microphone opened, no network calls |
| Administrator / exam | Policy file, read at start-up: Windows `%PROGRAMDATA%\StoryStage\policy.properties`; macOS `/Library/Application Support/StoryStage/policy.properties`; Linux `/etc/storystage/policy.properties`. Keys: `prompter.enabled=false`, `prompter.explainOnly=true`, `prompter.voiceInput=false`. Also a JVM option `-Dstorystage.prompter.enabled=false` for packaged launchers | Overrides user preferences; the related menu items are shown disabled with "Turned off by your school" |
| Build | No `core/prompter` on the classpath (`-DincludePrompter=false`) | No provider found; no Prompter menus or panel |

The policy file is plain text so a school can deploy it with its usual tools. Unknown keys are ignored, and a malformed file means "Prompter off".

**Create it as an administrator** (an elevated PowerShell, Group Policy or the school's deployment tool). With the default permissions on `C:\ProgramData`, a standard user can create files there but cannot change or delete a file an administrator created, so learners cannot undo the policy. A file a learner creates only restricts that learner. TR1 found that the file can be written without admin rights when it does not exist yet.

## 5. Privacy notice (website and wizard page 1)

Draft points for WP12.4:
- StoryStage runs on your computer. The StoryStage project runs no servers and receives none of your data.
- If you switch the Prompter on, your requests and your world's code (and scene pictures, if allowed) go from your computer to Anthropic under your own Claude account and its terms. Link to Anthropic's commercial terms and privacy policy.
- Speech is turned into text on your computer; audio is never sent.
- Your Claude key is kept in your computer's secure credential store and sent only to Anthropic.
- Schools can turn the Prompter off for all users.
