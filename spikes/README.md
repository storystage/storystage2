# Spikes (WP1)

Throwaway code that proves or disproves a platform choice before anything is built on it. Owner: S1.

- One folder per spike, named after its workplan task (`1.4-scheduler`).
- Never imported by `apps/` or `packages/`, never shipped. Dependencies go in `devDependencies`.
- Not linted and not in the required checks; `.github/workflows/spikes.yml` runs each spike's tests and measurements and keeps the numbers as an artifact.
- Results go in `docs/spikes/REPORT.md`, and each spike's go/no-go record goes in `docs/decisions/` (WP1.10).
