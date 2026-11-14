import { indexProgram, nodeId } from '@storystage/ast';
import { exampleProduction } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import { linkableBlock, liveLinks, withLink } from './links.ts';

// Frames linked to blocks (WP10.8; 03-production-format section 7).

const p = exampleProduction();
const first = p.frames.find((f) => f.scene === p.scenes[0]!.id)!;
const block = first.links[0]!;
const index = indexProgram(p.program);
const inside = [...index].find(([, at]) => at.parent === block)![0];
const method = index.get(block)!.parent!;

describe('which block a choice links', () => {
  it('links a block itself, and a value inside a block links its block', () => {
    expect(linkableBlock(p, block)).toBe(block);
    expect(linkableBlock(p, inside)).toBe(block);
  });

  it('links nothing for a method, or for something not in the program', () => {
    expect(linkableBlock(p, method)).toBeNull();
    expect(linkableBlock(p, nodeId('nowhere'))).toBeNull();
  });
});

describe('a frame’s links', () => {
  it('lists only the blocks still in the program', () => {
    expect(liveLinks(p, first)).toEqual([block]);
    expect(liveLinks(p, { ...first, links: [nodeId('gone'), block] })).toEqual([block]);
    expect(liveLinks(p, { ...first, links: [] })).toEqual([]);
  });

  it('links and unlinks a block, leaving the other frames alone', () => {
    const unlinked = withLink(p, first.id, block, false);
    expect(unlinked.frames.find((f) => f.id === first.id)!.links).toEqual([]);
    const relinked = withLink(unlinked, first.id, block, true);
    expect(relinked.frames.find((f) => f.id === first.id)!.links).toEqual([block]);
    for (const f of p.frames.filter((f) => f.id !== first.id))
      expect(relinked.frames.find((g) => g.id === f.id)).toBe(f);
  });

  it('gives back the same film when nothing changes', () => {
    expect(withLink(p, first.id, block, true)).toBe(p);
    expect(withLink(p, first.id, inside, false)).toBe(p);
  });
});
