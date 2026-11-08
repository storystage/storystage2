/**
 * What the native layer pins (`docs/spec/04-prompter.md` section 1.9, spec 05 section 2.3):
 * `system`, `tools` and the mode messages, hashed exactly as the gate hashes them, and each
 * mode's model and token ceiling. `pnpm prompter:pins` writes them to the gate's `pins.json`.
 */
import { catalogText } from '@storystage/story-api';
import { learnerTurn } from './data.ts';
import { MODE_SETTINGS } from './models.ts';
import { buildRequest } from './request.ts';
import { SHIPPED_CATALOGUE } from './shipped-catalogue.ts';
import { buildSystem, modeMessage, pinnedSystemMessages } from './system-prompt.ts';
import { TOOLS } from './tools.ts';
import {
  ALLOWED_BETAS,
  PROMPTER_MODES,
  type Json,
  type PrompterMode,
  type PrompterRequest,
} from './transport.ts';

/** Section 2.1: a unit test fails above these. */
export const STORY_API_TOKEN_LIMIT = 45_000;
export const BACKSTAGE_TOKEN_BUDGET = 12_000;

/** JSON with keys sorted and no spaces, as the gate writes it before hashing. */
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const object = value as { readonly [key: string]: Json };
    const keys = Object.keys(object)
      .filter((k) => object[k] !== undefined)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(object[k]!)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The request's `system` for this release: the instructions and both catalogs. */
export function releaseSystem(): readonly Json[] {
  return buildSystem({ storyApi: catalogText(), backstage: SHIPPED_CATALOGUE });
}

/** The request's `tools` for this release. */
export const releaseTools = (): readonly Json[] => TOOLS as unknown as readonly Json[];

/** `pins.json`, as the gate reads it (`Pins` in `gate/src/check.rs`). */
export interface PinsFile {
  readonly modes: Readonly<
    Record<PrompterMode, { readonly models: readonly string[]; readonly maxTokens: number }>
  >;
  readonly betas: readonly string[];
  readonly system: string;
  readonly tools: string;
  readonly modeMessages: readonly string[];
}

/** The pins for this release. `sha256` gives the hex digest of some UTF-8 text. */
export function makePins(sha256: (text: string) => string): PinsFile {
  const modes = Object.fromEntries(
    PROMPTER_MODES.map((mode) => {
      const { model, maxTokens } = MODE_SETTINGS[mode];
      return [mode, { models: [model], maxTokens }];
    }),
  ) as unknown as PinsFile['modes'];
  return {
    modes,
    betas: [...ALLOWED_BETAS],
    system: sha256(canonicalJson(releaseSystem())),
    tools: sha256(canonicalJson(releaseTools())),
    modeMessages: [...new Set(pinnedSystemMessages())].map(sha256),
  };
}

/** A real request with this release's `system` and `tools`, for the gate's test to pass. */
export function releaseRequest(): PrompterRequest {
  return buildRequest({
    id: 'release-request',
    mode: 'buildIt',
    system: releaseSystem(),
    tools: releaseTools(),
    messages: [
      learnerTurn({ request: 'Make the owl say hello' }) as unknown as Json,
      { role: 'system', content: modeMessage('buildIt') },
    ],
  });
}
