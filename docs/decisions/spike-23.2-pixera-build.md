# Spike 23.2: the Pixera build script

- **Status:** decided: **go** (owner, 21 Nov 2026). Proposed by S3 on 21 Nov 2026.
- **Evidence:** `docs/spikes/REPORT.md`, section 23.2; code in `spikes/23.2-pixera/`.

## Proposal

Go: export to Pixera (23.7) with a build script that drives Pixera's API (JSON-RPC over TCP, revision 481). With Pixera Creator 26.1 on the owner's PC, the spike's script added the media, made a timeline, layers sent to screens by name, clips at the media's own length, a cue layer with Play, Pause and Stop cues at the right frames, and saved the project. The result played in Pixera, and the Pause cue stopped it at exactly 2 s.

For S3's exports (23.6, 23.7), from the findings:
- make VP9 in WebM the media for Pixera, at a constant frame rate equal to the show's and exactly its length: it imports and plays with no one at Pixera;
- keep PNG sequences as the media every version can write, with a step in the operator guide: Pixera asks for each sequence's frame rate in a dialog the API can't answer;
- have the operator import each surface as a screen named as in the package before running the script, and place projectors, map outputs and calibrate afterwards: the API can't do these;
- keep the client's rules: check commands with `getHasFunction`, one call at a time, wait for dialogs rather than giving up, and save as `.avp`.

## Owner decision

Go, as proposed. The same day the owner settled how the export reaches Pixera: a guided Build in Pixera step in the Windows desktop app, with the operator guide, and no script in the package ([0072](0072-export-to-pixera-from-the-windows-app.md)).

Recorded by S3 from the owner's answer in the S3 session, 21 Nov 2026.
