# The leak scan

Proves the key can't be found in anything the webview can see (spec 05 section 2.7, threat W1, the owner's decision on spike 1.6). It runs in the `leak-scan` job in `.github/workflows/desktop.yml`, on every desktop build.

A random test key made in CI goes into the real OS store, and a test build sends a real request with it to `fake-server.mjs`, so the key path really runs. DevTools then saves the page and a full heap snapshot, and `test-key scan` searches them, with a planted key as a positive control. The server only ever holds a PBKDF2 value of the key, never the key.

**None of this reaches a release.** The DevTools port is in `tauri.conf.json` here, used only with `--config`. The `test-endpoint` feature, which lets the app talk to a fake server and read test pins, is off in `desktop.yml`'s build and in `Release`. The job fails if the shipped config mentions the port.
