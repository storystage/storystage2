// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentType, isServed, serveFrom } from './backstage.ts';

describe('isServed (the same rule as the apps’ protocol)', () => {
  it.each([
    'backstage.json',
    'models/kaykit/Biped/knight.glb',
    'thumbnails/osa_Biped_teddy.webp',
    'sketches/p01/front.svg',
    'prompter-catalogue.txt',
  ])('serves %s', (path) => expect(isServed(path)).toBe(true));

  it.each([
    '',
    '/backstage.json',
    '../tauri.conf.json',
    'models/../../x',
    'a//b',
    '.hidden',
    'models/.git/config',
    '%2e%2e/x',
    'a\\b',
    'a b.glb',
    'C:/x',
    'models/x.glb?y',
    'x'.repeat(256),
  ])('refuses %j', (path) => expect(isServed(path)).toBe(false));
});

describe('contentType', () => {
  it('says what each file is', () => {
    expect(contentType('backstage.json')).toBe('application/json');
    expect(contentType('models/a/B/c.GLB')).toBe('model/gltf-binary');
    expect(contentType('x.unknown')).toBe('application/octet-stream');
  });
});

describe('serveFrom', () => {
  const folder = mkdtempSync(join(tmpdir(), 'backstage-'));
  writeFileSync(join(folder, 'backstage.json'), '{"items":[]}');
  mkdirSync(join(folder, 'models'));
  writeFileSync(join(folder, 'models', 'a.glb'), 'glb');
  writeFileSync(join(folder, '..', 'secret.txt'), 'no');

  const call = (url: string, method = 'GET') =>
    new Promise<{ status: number; type?: string; body?: string; passed?: boolean }>((done) => {
      const headers: Record<string, string> = {};
      const res = {
        statusCode: 200,
        setHeader: (k: string, v: string) => (headers[k] = String(v)),
        end: (b?: Buffer) =>
          done({ status: res.statusCode, type: headers['Content-Type'], body: b?.toString() }),
      };
      serveFrom(folder)({ url, method } as IncomingMessage, res as unknown as ServerResponse, () =>
        done({ status: 0, passed: true }),
      );
    });

  it('serves the manifest and models, with their types', async () => {
    expect(await call('/backstage/backstage.json')).toEqual({
      status: 200,
      type: 'application/json',
      body: '{"items":[]}',
    });
    expect(await call('/backstage/models/a.glb')).toMatchObject({
      status: 200,
      type: 'model/gltf-binary',
    });
  });

  it('answers HEAD without a body', async () => {
    expect(await call('/backstage/backstage.json', 'HEAD')).toMatchObject({
      status: 200,
      body: undefined,
    });
  });

  it('refuses a way out of the folder, other methods, and what isn’t there', async () => {
    for (const url of [
      '/backstage/../secret.txt',
      '/backstage/%2e%2e/secret.txt',
      '/backstage/models',
      '/backstage/missing.json',
    ])
      expect((await call(url)).status, url).toBe(404);
    expect((await call('/backstage/backstage.json', 'POST')).status).toBe(404);
  });

  it('leaves every other address to the app', async () => {
    expect(await call('/index.html')).toEqual({ status: 0, passed: true });
  });
});
