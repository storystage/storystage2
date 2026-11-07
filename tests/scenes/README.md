# Reference scenes

The scenes WP5's done-when names. Each file has a `setup` (`SceneSetup`), `commands` (`StageCommand[]`) and its length in `seconds`.

- `packages/stage/e2e` renders each one twice at a fixed time step, in CI, and checks that the two runs match pixel for pixel.
- The frame rate on the reference devices (30 fps or better at "low") is an owner check, and waits for the devices (#6) and the quality setting (WP5.6).

They use stand-ins and a small model made in code (`test/Biped/robot`, in the harness), so there are no model files here. Real models come with WP3. Add them here only once their licence allows it.
