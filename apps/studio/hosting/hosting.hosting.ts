/**
 * The browser version as it will be hosted (WP15.6, decision 0046): the build, with `htaccess`
 * as `.htaccess`, served by a real Apache (the `browser` workflow). Bluehost serves it the same
 * way, so each rule in that file is checked here, then the page itself in Chromium.
 */
import { request as httpRequest } from 'node:http';
import { expect, test } from '@playwright/test';

/** One request's status and headers, sent with a Host header of our choosing. */
function head(path: string, host?: string) {
  const url = new URL(path, test.info().project.use.baseURL);
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>(
    (resolve, reject) => {
      const req = httpRequest(
        {
          host: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'HEAD',
          headers: host ? { Host: host } : {},
        },
        (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers }),
      );
      req.on('error', reject);
      req.end();
    },
  );
}

test('the page comes with cross-origin isolation, a strict policy and no caching', async ({
  request,
}) => {
  const reply = await request.get('/');
  expect(reply.status()).toBe(200);
  const headers = reply.headers();
  expect(headers['content-type']).toMatch(/^text\/html/);
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).not.toMatch(/https?:/);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['permissions-policy']).toContain('microphone=()');
  expect(headers['cache-control']).toBe('no-cache');
});

test('the studio opens, cross-origin isolated, with nothing refused by the policy', async ({
  page,
}) => {
  const refused: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy|blocked/i.test(message.text())) {
      refused.push(message.text());
    }
  });
  await page.goto('/');
  await expect(page.locator('#root > *').first()).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
  expect(refused).toEqual([]);
});

test('the shipped Backstage is beside the app, with its models as glTF', async ({ request }) => {
  const manifest = await request.get('/backstage/backstage.json');
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()['content-type']).toMatch(/^application\/json/);
  const text = await manifest.text();
  const model = /"(models\/[^"]+\.glb)"/.exec(text)?.[1];
  expect(model, 'a model in backstage.json').toBeTruthy();
  const glb = await head(`/backstage/${model}`);
  expect(glb.status).toBe(200);
  expect(glb.headers['content-type']).toBe('model/gltf-binary');
  expect(String(glb.headers['cache-control'])).toContain('max-age=3600');
});

test('speak line’s engine is beside the app, its WebAssembly as WebAssembly', async ({
  request,
}) => {
  const files = await request.get('/speech/kokoro/files.json');
  expect(files.status()).toBe(200);
  const wasm = await head('/speech/ort/ort-wasm-simd-threaded.wasm');
  expect(wasm.status).toBe(200);
  expect(wasm.headers['content-type']).toBe('application/wasm');
  const model = await head('/speech/kokoro/model_quantized.onnx');
  expect(model.status).toBe(200);
  expect(model.headers['content-type']).toBe('application/octet-stream');
});

test('the files Vite names by their content are kept for a year', async ({ request }) => {
  const page = await (await request.get('/')).text();
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(page)?.[1];
  expect(script, 'the page’s script').toBeTruthy();
  const reply = await head(script ?? '');
  expect(reply.status).toBe(200);
  expect(String(reply.headers['cache-control'])).toContain('immutable');
  expect(reply.headers['content-type']).toMatch(/^text\/javascript/);
});

test('no folder is listed, and nothing starting with a dot is served', async () => {
  expect((await head('/backstage/models/')).status).toBe(403);
  expect((await head('/.htaccess')).status).toBe(403);
});

test('the real site is HTTPS only; a test server on another name isn’t sent there', async () => {
  const real = await head('/backstage/backstage.json', 'app.storystage.org');
  expect(real.status).toBe(301);
  expect(real.headers.location).toBe('https://app.storystage.org/backstage/backstage.json');
  expect((await head('/backstage/backstage.json')).status).toBe(200);
});
