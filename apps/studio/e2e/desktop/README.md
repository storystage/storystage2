# Gate tests in the desktop app

The parts of a milestone gate that only the real app can show: the studio inside the Windows app, on the app's own native layer, not the browser version's. They run in the `app-gate` job in `.github/workflows/desktop.yml`, on every desktop build.

- `tauri.conf.json` here adds a DevTools port (9223) to the app's window, and is used only with `--config` for the test build. The leak scan's job fails if the shipped config mentions a debugging port, and the release workflow never uses this file. **None of this reaches a release.**
- `m5-desktop.app.ts` starts the test build, connects Playwright to its WebView2 over that port, and checks the M5 gate's app steps. The suffix `.app.ts` keeps it out of the browser e2e run.

To run it on a Windows PC, from the repository's root, after `node apps/desktop/scripts/fetch-models.mjs` and `pnpm backstage:fetch`:

```bash
cd apps/desktop && pnpm tauri build --debug --no-bundle --config ../studio/e2e/desktop/tauri.conf.json
```

```bash
pnpm exec playwright test -c apps/studio/e2e/desktop/playwright.config.ts
```

The test build has the installed app's identifier, so it uses the same data folders: on a PC with StoryStage 2 installed and in use, run it on a spare Windows account. `STORYSTAGE_APP` names another build to test.
