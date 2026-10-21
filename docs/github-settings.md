# GitHub settings (WP0.1)

What is set on `storystage/storystage2` and what the owner still needs to change. Repository settings were applied by S1 on 20 Oct 2026, with the owner's approval to create the repository. **Organisation settings are the owner's** (WP0.1: "U approves the org settings").

## Set on the repository

| Setting | Value | Why |
|---|---|---|
| Visibility | Public | Same as StoryStage 1. Secret scanning and push protection are free on public repositories |
| Merging | Squash only; title and body from the pull request; head branches deleted after merge | One workplan task per squashed commit |
| Ruleset `main` | No deletion, no force push, linear history, pull request required (0 approvals, conversations resolved), required checks `check` and `e2e` (GitHub Actions), the owner, as organisation admin, may bypass it in an emergency (decision 0029); nobody else | A pull request with a failing test can't merge (WP0 done-when, shown on #3) |
| Secret scanning and push protection | On | CLAUDE.md rule 1 |
| Dependabot alerts and security updates | On. Version updates for GitHub Actions only (`.github/dependabot.yml`) | npm and Cargo updates need a licence check and a `NOTICE` entry, so they're done by hand |
| Private vulnerability reporting | On | `SECURITY.md` |
| Actions | Only GitHub's own actions plus `pnpm/action-setup`, `dtolnay/rust-toolchain`, `Swatinem/rust-cache`, `EmbarkStudios/cargo-deny-action`; **full-length SHA pinning required** | Supply chain (threat model, WP0.9) |
| Workflow token | Read-only by default; workflows can't approve pull requests | Least privilege |
| Wiki | Off | Docs live in `docs/` |
| GitHub Pages | On, published by Actions (`.github/workflows/spike-pages.yml`) at https://storystage.github.io/storystage2/; the `github-pages` environment accepts deployments from `main` and `lane/s1-wp1-*` | The owner's device runs of the spikes (M1). Added 21 Oct 2026 with the owner's approval. Static pages only; nothing collected |
| Labels | `wp-0` … `wp-24`, `type:bug`, `type:task`, `needs-owner`, `spike`, `critical`, `contract`, `lane:s1` … `lane:s8`, `lane:d` | Workplan section 10; the lane labels and `contract` are additions |

The required checks run on `push`, not `pull_request`. A `pull_request` trigger added skipped runs with the same names, and GitHub counts a skipped required check as passed. Pull requests from forks therefore get no CI and can't merge.

## For the owner to change (organisation `storystage`)

These need organisation-admin rights (the `admin:org` scope), which this session doesn't use. In rough order of importance:

1. **Require two-factor authentication** for everyone in the organisation (currently off). Every session's pull requests and the release builds depend on these accounts.
2. **Turn on push protection and Dependabot alerts for new repositories** by default (currently off), so later repositories (website, Backstage assets) start protected.
3. **Actions policy for the organisation:** allow only GitHub's actions and selected actions, and require SHA pinning, to match this repository.
4. **Restrict who can create public repositories** (currently any member can), so nothing children's-data-adjacent is published by mistake.
5. ~~Decide whether an emergency bypass is wanted~~: done 21 Oct 2026, the owner (organisation admin) can bypass `main` (decision 0029).
6. **Later, for WP15:** environments and secrets for code signing (Windows certificate, Apple), and the repository variable `APPLE_DEVELOPMENT_TEAM`, which switches on the iOS build.

## Decisions raised as `needs-owner` issues

- [#19](https://github.com/storystage/storystage2/issues/19) StoryStage 2's own licence: the repository is public with no `LICENSE` file, so all rights are reserved.
- [#20](https://github.com/storystage/storystage2/issues/20) The app identifier `org.storystage.storystage2` in `apps/desktop/src-tauri/tauri.conf.json`, which can't change once the app is in the stores.
