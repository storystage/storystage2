import { micros } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { Caption } from './captions.ts';
import type { CreditBlock } from './credits.ts';
import {
  CREDIT_SCREEN_SECONDS,
  creditsLength,
  drawPart,
  filmPlan,
  partAt,
  type Canvas2D,
} from './overlay.ts';
import { TITLE_CARD } from './titles.ts';

const blocks: CreditBlock[] = [
  { heading: 'Story and code', lines: [{ text: 'Ana' }, { text: 'Sam' }] },
  { heading: null, lines: [{ text: 'Made with StoryStage 2' }] },
];
const captions: Caption[] = [{ start: micros(5), end: micros(7), text: 'PIP: Hello.' }];
const card = { title: 'The Lost Kite', byline: 'A film by Ana', duration: TITLE_CARD };

describe('filmPlan and partAt', () => {
  const plan = filmPlan({ title: card, filmLength: micros(10), credits: blocks, captions });

  it('puts the title card first, then the film, then the credits', () => {
    expect(plan.filmStart).toBe(micros(4));
    expect(plan.creditsStart).toBe(micros(14));
    expect(plan.total).toBe(micros(14) + creditsLength(blocks));
    expect(partAt(plan, 0).kind).toBe('title');
    expect(partAt(plan, micros(4))).toEqual({ kind: 'film', at: 0, captions: [] });
    expect(partAt(plan, micros(5.5))).toEqual({
      kind: 'film',
      at: micros(1.5),
      captions: ['PIP: Hello.'],
    });
    expect(partAt(plan, micros(14)).kind).toBe('credits');
  });

  it('fades the title card in from black and out into the film', () => {
    const opacity = (t: number) => {
      const part = partAt(plan, micros(t));
      return part.kind === 'title' ? part.opacity : null;
    };
    expect(opacity(0)).toBe(0);
    expect(opacity(0.25)).toBeCloseTo(0.5);
    expect(opacity(2)).toBe(1);
    expect(opacity(3.75)).toBeCloseTo(0.5);
  });

  it('starts with the film when there is no title card', () => {
    const none = filmPlan({ title: null, filmLength: micros(10), credits: blocks, captions });
    expect(none.filmStart).toBe(0);
    expect(partAt(none, 0)).toEqual({ kind: 'film', at: 0, captions: [] });
  });

  it('leaves the captions off the picture when asked', () => {
    const off = filmPlan({
      title: card,
      filmLength: micros(10),
      credits: blocks,
      captions,
      captionsOnPicture: false,
    });
    expect(partAt(off, micros(5.5))).toEqual({ kind: 'film', at: micros(1.5), captions: [] });
  });

  it('rolls the credits from below the picture to above it', () => {
    const at = (fraction: number) => {
      const part = partAt(plan, plan.creditsStart + Math.round(fraction * creditsLength(blocks)));
      return part.kind === 'credits' ? part.progress : null;
    };
    expect(at(0)).toBe(0);
    expect(at(0.5)).toBeCloseTo(0.5);
  });
});

describe('creditsLength', () => {
  it('is about 3 seconds a screenful, and one screen to clear', () => {
    expect(CREDIT_SCREEN_SECONDS).toBe(3);
    // 6 rows (2 headings and gaps, 3 lines... ) is half a screen, plus the screen to clear.
    expect(creditsLength(blocks)).toBeGreaterThanOrEqual(micros(3));
    const many: CreditBlock[] = [
      { heading: 'Cast', lines: Array.from({ length: 48 }, (_, i) => ({ text: `${i}` })) },
    ];
    expect(creditsLength(many)).toBeGreaterThan(creditsLength(blocks));
  });
});

/** A 2D context that records the words drawn and where. */
function recorder() {
  const text: { text: string; x: number; y: number; alpha: number; font: string }[] = [];
  const rects: { x: number; y: number; w: number; h: number; fill: string }[] = [];
  const ctx: Canvas2D = {
    fillStyle: '',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    fillRect(x, y, w, h) {
      rects.push({ x, y, w, h, fill: String(this.fillStyle) });
    },
    fillText(t, x, y) {
      text.push({ text: t, x, y, alpha: this.globalAlpha, font: this.font });
    },
    measureText: (t) => ({ width: t.length * 10 }),
  };
  return { ctx, text, rects };
}

describe('drawPart', () => {
  const size = { width: 1280, height: 720 };

  it('draws the title and the byline on black, at the card opacity', () => {
    const { ctx, text, rects } = recorder();
    drawPart(ctx, { kind: 'title', card, opacity: 0.5 }, size);
    expect(rects[0]).toMatchObject({ x: 0, y: 0, w: 1280, h: 720, fill: '#000000' });
    expect(text.map((t) => t.text)).toEqual(['The Lost Kite', 'A film by Ana']);
    expect(text.every((t) => t.alpha === 0.5)).toBe(true);
  });

  it('draws captions centred near the bottom on a dark panel, earliest above', () => {
    const { ctx, text, rects } = recorder();
    drawPart(ctx, { kind: 'film', at: 0, captions: ['PIP: Hello.', 'FOX: Hi.'] }, size);
    expect(text.map((t) => t.text)).toEqual(['PIP: Hello.', 'FOX: Hi.']);
    expect(text[0]!.y).toBeLessThan(text[1]!.y);
    expect(text.every((t) => t.x === 640 && t.y > 720 * 0.7)).toBe(true);
    expect(text[0]!.font).toContain('Atkinson Hyperlegible');
    expect(rects).toHaveLength(2);
  });

  it('draws nothing over a film frame with no captions', () => {
    const { ctx, text, rects } = recorder();
    drawPart(ctx, { kind: 'film', at: 0, captions: [] }, size);
    expect(text).toEqual([]);
    expect(rects).toEqual([]);
  });

  it('rolls the credits upwards as they go on', () => {
    const first = recorder();
    drawPart(first.ctx, { kind: 'credits', blocks, progress: 0.1 }, size);
    const later = recorder();
    drawPart(later.ctx, { kind: 'credits', blocks, progress: 0.4 }, size);
    const y = (r: ReturnType<typeof recorder>, t: string) => r.text.find((x) => x.text === t)?.y;
    expect(first.text.map((t) => t.text)).toContain('Story and code');
    expect(y(later, 'Story and code')!).toBeLessThan(y(first, 'Story and code')!);
  });

  it('writes a licence beside its credit line, and marks an imported model', () => {
    const { ctx, text } = recorder();
    drawPart(
      ctx,
      {
        kind: 'credits',
        blocks: [
          {
            heading: 'Cast',
            lines: [
              {
                text: 'Knight by Kay (CC BY 4.0)',
                licence: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
              },
              { text: 'Gran (CC0)', imported: true },
            ],
          },
        ],
        progress: 0.3,
      },
      size,
    );
    const words = text.map((t) => t.text);
    expect(words).toContain('creativecommons.org/licenses/by/4.0');
    expect(words).toContain('Gran (CC0) · Imported');
  });
});
