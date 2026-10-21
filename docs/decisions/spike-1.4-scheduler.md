# Spike 1.4: interpreter and scheduler

- **Status:** proposed: **go** (S1, 20 Oct 2026). Waiting for the owner's decision.
- **Evidence:** `docs/spikes/REPORT.md`, section 1.4; code in `spikes/1.4-scheduler/`.

## Proposal

Go: build the runtime (WP6) as a cooperative, discrete-event scheduler in a Web Worker, sending relative, timestamped stage commands ahead of the clock, as in the spike. Adopt the six design rules in the report. WP6 settles the open points listed there.

## Owner decision

_Go / no-go, date:_
