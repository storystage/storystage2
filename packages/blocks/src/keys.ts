/**
 * Which keys a key listener is for (spec 02, section 6a): its `keys` detail is a list of keys,
 * shown as a click listener's objects are. An arrow or number listener is for its own keys only
 * (`findEvent(event).keys`), and the program check refuses another, so a key's ▾ inside one offers
 * only those. Outside a listener (or while it's being loaded, before it's joined to one) it offers
 * every key, so a value is never refused for being drawn.
 */
import type * as Blockly from 'blockly/core';
import { findEvent } from '@storystage/story-api';
import { LISTENER } from './shapes.ts';

/** The listener block a block is inside, if any. */
function listenerAround(block: Blockly.Block | null): Blockly.Block | null {
  for (let b = block?.getParent() ?? null; b; b = b.getParent()) if (b.type === LISTENER) return b;
  return null;
}

/** A key's ▾: `all` of them, or its listener's own, with the key it holds. */
export function keyChoices(
  all: readonly [string, string, string?][],
): Blockly.MenuGeneratorFunction {
  return function (this: Blockly.FieldDropdown) {
    const listener = listenerAround(this.getSourceBlock());
    const event = (listener as { ssExtra?: { event?: string } } | null)?.ssExtra?.event;
    const own = event ? findEvent(event)?.keys : undefined;
    if (!own) return all.map((o) => [...o]) as Blockly.MenuOption[];
    const current = this.getValue();
    return all
      .filter(([, v]) => own.includes(v as never) || v === current)
      .map((o) => [...o]) as Blockly.MenuOption[];
  };
}
