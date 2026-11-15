# The browser version's hosting (WP15.6)

The browser version is the studio's own build, as static files at `app.storystage.org`, in the subdomain's own folder on Bluehost, apart from the WordPress site (decision 0046). It has no Prompter, no key and no dictation (0022, 0060), and no server code.

- **`htaccess`** is uploaded with the build as `.htaccess`, and sets how Apache serves it:
  - cross-origin isolation, for speak line's engine on several threads;
  - the same content security policy as the apps, with nothing remote;
  - the right type for WebAssembly, glTF and the speech files;
  - no folder listings, and nothing starting with a dot;
  - HTTPS only on the real site;
  - caching: the page always fresh, Vite's content-named files kept for a year, and the Backstage and voices for an hour.
- **The `browser` workflow** builds it with the shipped Backstage and speak line's engine, serves it from a real Apache with that file, and checks each rule and the studio itself in Chromium (`hosting.hosting.ts`). It keeps the result as one zip, with its SHA-256, for 90 days. It runs on a release tag, by hand (**Actions › browser › Run workflow**), and on changes to this folder.

## Putting a build on app.storystage.org (the owner)

1. In GitHub, open the **browser** workflow's latest run, for the release you're putting up, and download `storystage-browser-<version>-<commit>` from **Artifacts**. It holds the zip and its `.sha256`.
2. In Bluehost's **File Manager**, open the folder `app.storystage.org` points at. Show hidden files (**Settings › Show Hidden Files**).
3. Move what's there now into a folder named after its version, outside the subdomain's folder, so it can go back if needed.
4. Upload the zip into the empty folder, and **Extract** it there. Check `.htaccess` is in the folder, beside `index.html`, `assets/`, `backstage/` and `speech/`. Then delete the zip.
   - The zip is about 200 MB. If the File Manager won't take it, use FTP (Bluehost's **FTP accounts**) to upload it, then extract it in the File Manager.
5. Open `https://app.storystage.org` in Chrome or Edge and check:
   - the studio opens;
   - a speak line plays after its voices download;
   - the Prompter, the key and the microphone buttons aren't there;
   - in the developer tools, `crossOriginIsolated` is `true` on the Console.

   M6's script (`docs/test/M6-distribution.md`) has the rest.

**To go back:** delete the folder's contents, and move the previous version's files back in.
