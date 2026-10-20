# 0005 API key

- **Status:** settled
- **Decided:** 17 Oct 2026
- **Source:** workplan section 2 (fixed decisions)

## Decision

The user's or school's own key, in the OS secure store (Credential Manager, Keychain, Android Keystore). Claude requests are sent from the app's native layer, so web code never sees the key. Never stored in a settings file. No StoryStage server.
