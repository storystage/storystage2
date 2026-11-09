/**
 * WP11.3 and 11.4: what each frame of an exported film shows, and drawing the parts that aren't
 * the stage's: the title card, the captions on the picture and the credits roll (spec 08,
 * sections 4 to 7). `partAt` is pure; `drawPart` draws on any 2D canvas context, so it's tested
 * with a recorder.
 */
import { micros, type Micros } from '@storystage/story-api';
import { captionsAt, type Caption } from './captions.ts';
import type { CreditBlock } from './credits.ts';
import type { TitleCard } from './titles.ts';

/** About 3 seconds a screenful (spec 08, section 7). */
export const CREDIT_SCREEN_SECONDS = 3;
/** Rows of the credits on one screen, at any resolution. */
export const CREDIT_ROWS_PER_SCREEN = 12;
/** The title card fades in from black and out into the film over this long. */
export const TITLE_FADE = micros(0.5);

export interface FilmPlan {
  readonly title: TitleCard | null;
  readonly filmStart: Micros;
  readonly filmLength: Micros;
  readonly creditsStart: Micros;
  readonly creditsLength: Micros;
  readonly credits: readonly CreditBlock[];
  /** On the exported film's clock, title card included. */
  readonly captions: readonly Caption[];
  readonly captionsOnPicture: boolean;
  readonly total: Micros;
}

export type FramePart =
  | { readonly kind: 'title'; readonly card: TitleCard; readonly opacity: number }
  /** The stage's picture at film time `at`, with these captions over it. */
  | { readonly kind: 'film'; readonly at: Micros; readonly captions: readonly string[] }
  /** `progress` from 0, the first line below the picture, to 1, the last above it. */
  | {
      readonly kind: 'credits';
      readonly blocks: readonly CreditBlock[];
      readonly progress: number;
    };

type Row =
  | { readonly kind: 'heading' | 'line' | 'licence'; readonly text: string }
  | { readonly kind: 'gap' };

/** The credits as rows, top to bottom. */
function rows(blocks: readonly CreditBlock[]): Row[] {
  const out: Row[] = [];
  blocks.forEach((block, i) => {
    if (i > 0) out.push({ kind: 'gap' });
    if (block.heading !== null) out.push({ kind: 'heading', text: block.heading });
    for (const line of block.lines) {
      out.push({ kind: 'line', text: line.imported ? `${line.text} · Imported` : line.text });
      if (line.licence)
        out.push({
          kind: 'licence',
          text: line.licence.url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
        });
    }
  });
  return out;
}

/** How long the roll takes: its rows at 3 seconds a screenful, and a screen to clear. */
export function creditsLength(blocks: readonly CreditBlock[]): Micros {
  const screens = rows(blocks).length / CREDIT_ROWS_PER_SCREEN + 1;
  return micros(screens * CREDIT_SCREEN_SECONDS);
}

export function filmPlan(options: {
  readonly title: TitleCard | null;
  readonly filmLength: Micros;
  readonly credits: readonly CreditBlock[];
  /**
   * On the exported film's clock, title card included, as the caption files have them
   * (`captionsFor(lines, script, { offset: title.duration })`).
   */
  readonly captions: readonly Caption[];
  readonly captionsOnPicture?: boolean;
}): FilmPlan {
  const filmStart = options.title?.duration ?? 0;
  const creditsStart = filmStart + options.filmLength;
  const length = creditsLength(options.credits);
  return {
    title: options.title,
    filmStart,
    filmLength: options.filmLength,
    creditsStart,
    creditsLength: length,
    credits: options.credits,
    captions: options.captions,
    captionsOnPicture: options.captionsOnPicture ?? true,
    total: creditsStart + length,
  };
}

/** What the exported film shows at time `t`. */
export function partAt(plan: FilmPlan, t: Micros): FramePart {
  if (plan.title && t < plan.filmStart) {
    const opacity = Math.max(0, Math.min(1, t / TITLE_FADE, (plan.filmStart - t) / TITLE_FADE));
    return { kind: 'title', card: plan.title, opacity };
  }
  if (t < plan.creditsStart) {
    const at = t - plan.filmStart;
    const showing = plan.captionsOnPicture ? captionsAt(plan.captions, t).map((c) => c.text) : [];
    return { kind: 'film', at, captions: showing };
  }
  const progress = Math.min(1, (t - plan.creditsStart) / Math.max(1, plan.creditsLength));
  return { kind: 'credits', blocks: plan.credits, progress };
}

/** The part of a 2D canvas context the overlay uses. */
export interface Canvas2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { readonly width: number };
}

const CAPTION_FONT = "'Atkinson Hyperlegible', sans-serif";
const TITLE_FONT = "'Bricolage Grotesque Variable', 'Bricolage Grotesque', sans-serif";
const WHITE = '#ffffff';
const BLACK = '#000000';
/** The dark panel behind a caption (decision 0031). */
const PANEL = 'rgba(0, 0, 0, 0.75)';

/**
 * Draws a part that isn't the stage's picture: the title card or the credits on black, or the
 * captions over the stage's picture, which is already on the canvas.
 */
export function drawPart(
  ctx: Canvas2D,
  part: FramePart,
  size: { readonly width: number; readonly height: number },
): void {
  const { width, height } = size;
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  switch (part.kind) {
    case 'title': {
      ctx.fillStyle = BLACK;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = part.opacity;
      ctx.fillStyle = WHITE;
      ctx.font = `800 ${Math.round(height * 0.09)}px ${TITLE_FONT}`;
      ctx.fillText(part.card.title, width / 2, height * (part.card.byline ? 0.45 : 0.5));
      if (part.card.byline) {
        ctx.font = `${Math.round(height * 0.045)}px ${CAPTION_FONT}`;
        ctx.fillText(part.card.byline, width / 2, height * 0.58);
      }
      ctx.globalAlpha = 1;
      return;
    }
    case 'film': {
      // Sized to the picture's height; stacked from the bottom, earliest above.
      const px = Math.round(height * 0.045);
      const lineHeight = Math.round(px * 1.6);
      ctx.font = `${px}px ${CAPTION_FONT}`;
      const bottom = height * 0.92;
      part.captions.forEach((text, i) => {
        const y = bottom - (part.captions.length - 1 - i) * (lineHeight + 4) - lineHeight / 2;
        const w = Math.min(width * 0.9, ctx.measureText(text).width + px);
        ctx.fillStyle = PANEL;
        ctx.fillRect(width / 2 - w / 2, y - lineHeight / 2, w, lineHeight);
        ctx.fillStyle = WHITE;
        ctx.fillText(text, width / 2, y);
      });
      return;
    }
    case 'credits': {
      ctx.fillStyle = BLACK;
      ctx.fillRect(0, 0, width, height);
      const all = rows(part.blocks);
      const row = height / CREDIT_ROWS_PER_SCREEN;
      const travel = height + all.length * row;
      const top = height - part.progress * travel;
      all.forEach((r, i) => {
        const y = top + (i + 0.5) * row;
        if (r.kind === 'gap' || y < -row || y > height + row) return;
        const px = Math.round(
          height * (r.kind === 'heading' ? 0.05 : r.kind === 'licence' ? 0.03 : 0.04),
        );
        ctx.font = `${r.kind === 'heading' ? '700 ' : ''}${px}px ${CAPTION_FONT}`;
        ctx.fillStyle = WHITE;
        ctx.fillText(r.text, width / 2, y);
      });
      return;
    }
  }
}
