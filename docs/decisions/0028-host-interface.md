# 0028 Host interface

- **Status:** settled
- **Decided:** 21 Oct 2026, by the owner
- **Source:** the owner's answers in the S1 session

## Decision

The studio is handed a **host interface** by the build it runs in (files, the Prompter transport or none, the policy in force), rather than detecting whether it is in Tauri or a browser (`docs/spec/00-architecture.md`, sections 1 and 6). S8 and S5 define it together when the studio first needs files or policy; it is a contract like the WP0.8 ones.
