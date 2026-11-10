import {
  exampleProduction,
  type CheckItem,
  type Frame,
  type Production,
} from '@storystage/production';
import { describe, expect, it } from 'vitest';
import { basisFor, checkState, frameStatus, keepFlag } from './status.ts';

const flag = (id: string) => ({
  id,
  kind: 'onScreen' as const,
  outcome: 'flag' as const,
  words: id,
});
const passed = (id: string) => ({
  id,
  kind: 'length' as const,
  outcome: 'passed' as const,
  words: id,
});

/** The example with its first frame's result saved as checked now. */
function checked(items: CheckItem[] = [passed('length')], kept: string[] = []): Production {
  const p = exampleProduction();
  const f1 = p.frames[0]!;
  const frame: Frame = { ...f1, check: { basis: basisFor(p, f1), items, kept } };
  return { ...p, frames: [frame, ...p.frames.slice(1)] };
}

describe('frame status', () => {
  it('is null with no result', () => {
    const p = exampleProduction();
    expect(frameStatus(p.frames[0]!, p)).toBeNull();
    expect(checkState(p.frames[0]!, p)).toBeNull();
  });

  it('is Checked with a current result and no flags', () => {
    const p = checked();
    expect(frameStatus(p.frames[0]!, p)).toBe('checked');
    expect(checkState(p.frames[0]!, p)).toEqual({ stale: false, flags: 0, kept: 0 });
  });

  it('is Look at with a flag not kept, and Checked once it is kept', () => {
    const p = checked([flag('onScreen:k1'), passed('length')]);
    expect(frameStatus(p.frames[0]!, p)).toBe('lookAt');
    const kept = keepFlag(p, p.frames[0]!.id, 'onScreen:k1', true);
    expect(frameStatus(kept.frames[0]!, kept)).toBe('checked');
    expect(checkState(kept.frames[0]!, kept)).toEqual({ stale: false, flags: 0, kept: 1 });
    const letGo = keepFlag(kept, p.frames[0]!.id, 'onScreen:k1', false);
    expect(frameStatus(letGo.frames[0]!, letGo)).toBe('lookAt');
  });

  it('is stale, and so null, after the program or the frame changes', () => {
    const p = checked();
    const program = { ...p.program, types: [...p.program.types] };
    const changed: Production = { ...p, program };
    // The same program, but a changed copy: stale only if its content differs.
    expect(frameStatus(changed.frames[0]!, changed)).toBe('checked');
    const edited: Production = {
      ...p,
      frames: p.frames.map((f, i) => (i === 0 ? { ...f, lengthSeconds: f.lengthSeconds + 1 } : f)),
    };
    expect(checkState(edited.frames[0]!, edited)?.stale).toBe(true);
    expect(frameStatus(edited.frames[0]!, edited)).toBeNull();
  });

  it("doesn't count the result itself in the basis", () => {
    const p = checked([flag('a')]);
    const again = checked([passed('b')]);
    expect(basisFor(p, p.frames[0]!)).toBe(basisFor(again, again.frames[0]!));
  });
});
