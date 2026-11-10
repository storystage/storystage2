/**
 * The browser version's shipped Backstage (decision 0062; spec 05 section 7): the folder that
 * `pnpm backstage:fetch` makes at the repository's root, `.backstage/`, served at `backstage/`
 * beside the app, where `browserBackstageFolder()` in `@storystage/host` looks for it.
 *
 * - `vite` and `vite preview` serve it from where it was fetched.
 * - `vite build` copies it into `dist/backstage/`, for the browser version only. Tauri runs the
 *   same build for the apps, which serve the Backstage through their own protocol instead, so
 *   when Tauri is building (it sets `TAURI_ENV_PLATFORM`) nothing is copied: 96 MB would
 *   otherwise go into every app.
 * - Without a fetched folder, nothing is served and the studio shows stand-ins, as it does today.
 *
 * The path rule and content types are the apps' protocol's, in TypeScript
 * (`apps/desktop/src-tauri/classes/src/backstage_files.rs`), so both serve the same files.
 */
import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const PATH_LIMIT = 255;
const PREFIX = '/backstage/';

/** A plain path inside the Backstage, as the apps' protocol allows: see `is_served`. */
export function isServed(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= PATH_LIMIT &&
    path
      .split('/')
      .every((part) => part.length > 0 && !part.startsWith('.') && /^[A-Za-z0-9._-]+$/.test(part))
  );
}

const TYPES: Record<string, string> = {
  json: 'application/json',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  bin: 'application/octet-stream',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  ktx2: 'image/ktx2',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
};

/** The content type for a file the Backstage ships: see `content_type`. */
export function contentType(path: string): string {
  const dot = path.lastIndexOf('.');
  return (dot >= 0 && TYPES[path.slice(dot + 1).toLowerCase()]) || 'application/octet-stream';
}

/** Answers a request under `/backstage/` from `folder`; anything else is passed on. */
export function serveFrom(folder: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    if (!url.startsWith(PREFIX)) return next();
    const path = url.slice(PREFIX.length);
    const file = join(folder, path);
    const found =
      (req.method === 'GET' || req.method === 'HEAD') &&
      isServed(path) &&
      existsSync(file) &&
      statSync(file).isFile();
    if (!found) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const body = readFileSync(file);
    res.setHeader('Content-Type', contentType(path));
    res.setHeader('Content-Length', body.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}

/** The Vite plugin: serves the fetched Backstage in dev and preview, and copies it on build. */
export function shippedBackstage(
  folder = resolve(import.meta.dirname, '../../../.backstage'),
): Plugin {
  const fetched = () => existsSync(join(folder, 'backstage.json'));
  const warn = (what: string) =>
    console.warn(
      `[backstage] No shipped Backstage at ${folder}, so ${what} shows stand-ins. Run \`pnpm backstage:fetch\` first.`,
    );
  let outDir = 'dist';
  return {
    name: 'storystage-shipped-backstage',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      if (!fetched()) warn('the dev server');
      server.middlewares.use(serveFrom(folder));
    },
    configurePreviewServer(server) {
      if (!fetched()) warn('the preview');
      server.middlewares.use(serveFrom(folder));
    },
    closeBundle() {
      if (process.env.TAURI_ENV_PLATFORM) return; // the apps serve it through their protocol
      if (!fetched()) return warn('this browser build');
      cpSync(folder, join(outDir, 'backstage'), {
        recursive: true,
        filter: (src) => {
          const inside = src.slice(folder.length).replace(/\\/g, '/').replace(/^\//, '');
          return inside === '' || isServed(inside);
        },
      });
      console.log(`[backstage] Copied the shipped Backstage into ${join(outDir, 'backstage')}.`);
    },
  };
}
