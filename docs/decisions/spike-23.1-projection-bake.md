# Spike 23.1: the surface bake renderer

- **Status:** proposed by S1, 8 Nov 2026. Waiting for the owner.
- **Evidence:** `docs/spikes/REPORT.md`, section 23.1; code in `spikes/23.1-projection/`.

## Proposal

Go: bake projection-mapping media by rendering each frame from the audience's sweet spot and drawing each surface flat in its texture layout, looking each texel up in that picture, with a depth check (slope-scaled bias) so hidden parts stay empty. On a box and a building front, the result through a virtual projector matched the show on over 99% of lit pixels from the sweet spot, at about 15 ms a frame in software.

For S3's Projection stage (23.3, 23.4) and exports (23.6, 23.7), from the findings:
- show the sweet spot, and let learners look from elsewhere;
- show projector shadows, and suggest a second projector;
- leave faces the audience can't see empty, and say so;
- render the show at least as sharp as the texture;
- improve the texture packing for boxes.

23.2 (the Pixera build script) is separate. It needs a Windows PC with an NVIDIA graphics card and Pixera Creator, from the owner or a partner.

## Owner decision

_Not yet decided._
