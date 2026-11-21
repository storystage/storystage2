import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CATALOGUE_INDEX_TOKEN_BUDGET, renderIndex } from '@storystage/backstage';
import { catalogText } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { MODE_SETTINGS } from './models.ts';
import {
  STORY_API_TOKEN_LIMIT,
  canonicalJson,
  makePins,
  releaseRequest,
  releaseSystem,
  releaseTools,
} from './pins.ts';
import { SHIPPED_CATALOGUE, SHIPPED_CATALOGUE_COMMIT } from './shipped-catalogue.ts';
import { pinnedSystemMessages } from './system-prompt.ts';
import { PROMPTER_MODES, type Json } from './transport.ts';

const estimateTokens = (text: string) => Math.ceil(text.length / 3);
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const fromRoot = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')) as unknown;

const FIX =
  'Run `pnpm prompter:pins` (with `--fetch` if backstage.lock.json changed), and commit what it writes.';

describe('canonicalJson (spec 04, section 1.9)', () => {
  it("hashes the gate's shared fixture to the gate's hash", () => {
    const fixture = fromRoot('apps/desktop/src-tauri/gate/fixtures/hash.json') as {
      value: Json;
      sha256: string;
    };
    expect(sha256(canonicalJson(fixture.value))).toBe(fixture.sha256);
  });

  it('sorts keys at every depth, keeps array order and leaves no spaces', () => {
    expect(canonicalJson({ b: [3, { z: 1, a: null }], a: 'x y' })).toBe(
      '{"a":"x y","b":[3,{"a":null,"z":1}]}',
    );
  });
});

describe('the shipped Backstage catalogue', () => {
  const lock = fromRoot('backstage.lock.json') as {
    commit: string;
    catalogueJsonSha256?: string;
  };

  it('is exactly the one backstage.lock.json pins (section 2.7)', () => {
    expect(SHIPPED_CATALOGUE_COMMIT, FIX).toBe(lock.commit);
    // Kept compact; printed as the build prints it, it is the pinned file byte for byte.
    const file = `${JSON.stringify(SHIPPED_CATALOGUE, null, 2)}\n`;
    expect(sha256(file), FIX).toBe(lock.catalogueJsonSha256);
  });

  it('keeps the index and the Story API catalog to their budgets (section 2.1)', () => {
    expect(estimateTokens(renderIndex(SHIPPED_CATALOGUE))).toBeLessThanOrEqual(
      CATALOGUE_INDEX_TOKEN_BUDGET,
    );
    expect(estimateTokens(catalogText())).toBeLessThanOrEqual(STORY_API_TOKEN_LIMIT);
  });

  it('sends the index, never a full line, in system', () => {
    const system = JSON.stringify(releaseSystem());
    const [item] = SHIPPED_CATALOGUE.items.filter((i) => i.section === 'cast');
    expect(system).toContain(JSON.stringify(item!.short).slice(1, -1));
    expect(system).not.toContain(JSON.stringify(item!.line).slice(1, -1));
  });
});

describe('pins.json', () => {
  const pins = makePins(sha256);

  it('is up to date, with the request the gate tests it on', () => {
    expect(fromRoot('apps/desktop/src-tauri/gate/pins.json'), FIX).toEqual(pins);
    expect(fromRoot('apps/desktop/src-tauri/gate/fixtures/release-request.json'), FIX).toEqual(
      releaseRequest(),
    );
  });

  it("pins each mode's model and ceiling, and every mode message", () => {
    for (const mode of PROMPTER_MODES) {
      expect(pins.modes[mode]).toEqual({
        models: [MODE_SETTINGS[mode].model],
        maxTokens: MODE_SETTINGS[mode].maxTokens,
      });
    }
    expect(pins.modeMessages).toHaveLength(new Set(pinnedSystemMessages()).size);
    expect(pins.modeMessages).toContain(sha256(pinnedSystemMessages()[0]!));
  });

  it('changes when the prompt or a tool does', () => {
    const system = releaseSystem();
    expect(sha256(canonicalJson(system))).toBe(pins.system);
    expect(sha256(canonicalJson([...system, { type: 'text', text: '.' }]))).not.toBe(pins.system);
    expect(sha256(canonicalJson(releaseTools().slice(1)))).not.toBe(pins.tools);
  });
});
