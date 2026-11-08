# 0066 Two packages for playing productions and the Screening room

- **Status:** settled
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answer in the S2 session, at the start of WP11b

## Decision

Two new workspace packages, both owned by S2:

- **`packages/playback`** (`@storystage/playback`): the driver that plays a production on the page. It joins the runtime worker, the stage and the production's player (`packages/production`, WP8.3). Rehearse (WP7.4), the Screening room (WP11.1) and the export (WP11.3) all use it. It can't be in `runtime`, which may not import the stage (`00-architecture.md`).
- **`packages/screening`** (`@storystage/screening`): the Screening room's screen. The studio mounts it on its Screening room tab, as it mounts the Blocks and Tiles editors. S5 reviews the change that mounts it in `apps/studio`.

Workplan section 4 lists both.

The other option was the driver in `packages/export` and the screen in S5's `apps/studio`. It was set aside because Rehearse would then import the export package, and S2's screen would sit in S5's app.
