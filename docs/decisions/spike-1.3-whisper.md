# Spike 1.3: whisper.cpp in WebAssembly

- **Status:** decided: **go** (owner, 8 Nov 2026), on the CI evidence, before the device runs. Proposed by S7 on 8 Nov 2026.
- **Evidence:** `docs/spikes/REPORT.md`, section 1.3; code in `spikes/1.3-whisper/`.

## Proposal

Go: build speech input (WP14.1) on whisper.cpp in WebAssembly, in a worker, with the tiny English model, as in the spike. Clear speech came out right in CI with no server. The risk is memory on the 4 GB Chromebook (644 to 758 MB in the spike), so WP14.1 builds in the spike's mitigations: the quantised model, a smaller starting reservation, and ending the worker when it isn't needed. The device runs (#6) still happen, and check these on the reference devices.

## Owner decision

Go now, without waiting for the device runs, so WP14a can start alongside WP13b. The M1 device runs measure memory, speed and the owner's own voice, and can still change the default model or the memory settings (`docs/spec/06-speech.md`, section 1.9).

Recorded by S7 from the owner's answer in the S7 session, 8 Nov 2026.
