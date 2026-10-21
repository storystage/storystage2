# Spike 1.4: interpreter and scheduler

- **Status:** decided: **go** (owner, 21 Oct 2026). Proposed by S1 on 20 Oct 2026.
- **Evidence:** `docs/spikes/REPORT.md`, section 1.4; code in `spikes/1.4-scheduler/`.

## Proposal

Go: build the runtime (WP6) as a cooperative, discrete-event scheduler in a Web Worker, sending relative, timestamped stage commands ahead of the clock, as in the spike. Adopt the six design rules in the report. WP6 settles the open points listed there.

## Owner decision

Go. Build the runtime (WP6) as proposed, with the six design rules in the report.

Recorded by S1 from the owner's answer in the S1 session, 21 Oct 2026.
