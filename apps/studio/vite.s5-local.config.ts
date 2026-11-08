// Local only, never committed: the studio's Vite config with its cache outside Dropbox, which
// locks `node_modules/.vite` while it syncs and makes Vite fail with EBUSY.
import base from './vite.config.ts';

export default {
  ...base,
  root: import.meta.dirname,
  cacheDir: 'C:/Users/andre/AppData/Local/Temp/s5-vite-cache',
};
