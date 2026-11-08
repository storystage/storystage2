/**
 * The tile editor on its own, over a test host, for the end-to-end tests and for looking at it
 * (spec 14, section 7). `pnpm --filter @storystage/tiles harness`, then http://localhost:4183/.
 * `?statements=500` opens a method that long instead (spec 14, 3h).
 */
import { applyEdits } from '@storystage/ast';
import { TestHost } from '@storystage/editor-contract/testing';
import { TileEditor } from '../src/editor.tsx';
import { fixture, large } from '../src/fixture.ts';

const size = Number(new URLSearchParams(location.search).get('statements') ?? 0);
const program = size > 0 ? large(size) : fixture();
const host = new TestHost(program, { apply: (p, edits) => applyEdits(p, edits) });
const editor = new TileEditor();
editor.mount(document.getElementById('tiles')!, host);

// For the end-to-end tests, which drive the editor through the contract as the studio would.
Object.assign(window, { tiles: { editor, host } });
