// @vitest-environment node
import { checkReferences, exampleProduction, sceneId } from '@storystage/production';
import { validateProgram } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { ARC_TEMPLATES } from './arc.ts';
import {
  LIMITS,
  canAddScene,
  newProduction,
  planLength,
  setArc,
  setCardArcPart,
  setLogline,
  setSynopsis,
  setTitle,
} from './edits.ts';

const [free, threePart, fivePart] = ARC_TEMPLATES as [
  (typeof ARC_TEMPLATES)[number],
  (typeof ARC_TEMPLATES)[number],
  (typeof ARC_TEMPLATES)[number],
];

describe('newProduction', () => {
  it('is empty and sound, waiting for its script header', () => {
    const p = newProduction();
    expect(p.scenes).toEqual([]);
    expect(p.storyboard.logline).toBe('');
    expect(checkReferences(p)).toEqual([]);
    expect(validateProgram(p.program)).toEqual([]);
  });
});

describe('the script header (10.1)', () => {
  it('sets the title, logline and synopsis', () => {
    let p = newProduction();
    p = setTitle(p, 'The Owl and the Key');
    p = setLogline(p, 'A shy owl must find a lost key.');
    p = setSynopsis(p, 'The cat is locked out.\nThe owl searches.');
    expect(p.manifest.title).toBe('The Owl and the Key');
    expect(p.storyboard.logline).toBe('A shy owl must find a lost key.');
    expect(p.storyboard.synopsis).toBe('The cat is locked out.\nThe owl searches.');
  });

  it('stops each at its limit, counting characters, not bytes', () => {
    const p = newProduction();
    expect(setTitle(p, 'x'.repeat(100)).manifest.title).toHaveLength(LIMITS.title);
    expect(setLogline(p, 'é'.repeat(300)).storyboard.logline).toBe('é'.repeat(LIMITS.logline));
    expect([...setSynopsis(p, '🦉'.repeat(1200)).storyboard.synopsis]).toHaveLength(
      LIMITS.synopsis,
    );
  });

  it('lets scenes be added only once the logline and synopsis are written', () => {
    let p = newProduction();
    expect(canAddScene(p.storyboard)).toBe(false);
    p = setLogline(p, 'A logline.');
    expect(canAddScene(p.storyboard)).toBe(false);
    p = setSynopsis(p, '   ');
    expect(canAddScene(p.storyboard)).toBe(false);
    p = setSynopsis(p, 'A synopsis.');
    expect(canAddScene(p.storyboard)).toBe(true);
  });

  it('adds up the scenes and the frames’ planned lengths', () => {
    expect(planLength(exampleProduction())).toEqual({
      scenes: 3,
      seconds: exampleProduction().frames.reduce((s, f) => s + f.lengthSeconds, 0),
    });
  });
});

describe('the arc (10.2)', () => {
  it('has free, 3-part and 5-part templates', () => {
    expect(free.parts).toEqual([]);
    expect(threePart.parts).toEqual(['beginning', 'middle', 'end']);
    expect(fivePart.parts).toEqual(['setup', 'conflict', 'challenge', 'climax', 'resolution']);
  });

  it('keeps a card’s part only if the new arc has a part of that name', () => {
    const p = exampleProduction();
    const withSetup = setCardArcPart(setArc(p, fivePart), sceneId('s1'), 'setup');
    expect(withSetup.storyboard.cards.map((c) => c.arcPart)).toEqual(['setup', null, null]);
    const back = setArc(withSetup, threePart);
    expect(back.storyboard.arc).toEqual({ template: 'threePart', parts: threePart.parts });
    expect(back.storyboard.cards.map((c) => c.arcPart)).toEqual([null, null, null]);
  });

  it('keeps every part when the arc doesn’t change', () => {
    const p = exampleProduction();
    expect(setArc(p, threePart)).toBe(p);
  });

  it('takes a curriculum template like any other', () => {
    const p = setArc(exampleProduction(), {
      template: { curriculum: 'wales-cfw-narrative' },
      parts: ['opening', 'build-up', 'problem', 'resolution', 'ending'],
    });
    expect(p.storyboard.arc.template).toEqual({ curriculum: 'wales-cfw-narrative' });
    expect(setCardArcPart(p, sceneId('s2'), 'problem').storyboard.cards[1]!.arcPart).toBe(
      'problem',
    );
  });

  it('ignores a part the arc hasn’t got', () => {
    const p = exampleProduction();
    expect(setCardArcPart(p, sceneId('s1'), 'climax')).toBe(p);
  });

  it('leaves the production sound', () => {
    const p = setCardArcPart(setArc(exampleProduction(), fivePart), sceneId('s3'), 'climax');
    expect(checkReferences(p)).toEqual([]);
  });
});
