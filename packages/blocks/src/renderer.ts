/**
 * The Alice-like look (`14-editors.md` section 3i.5; WP7.6): statement rows that read like a line
 * of code, rounded, with values as chips. Built on Blockly's rounded renderer ("zelos"), keeping
 * its notch where statements stack, as Blockly's appearance guide and Blockly Games do (the
 * owner's choice, 16 Nov), so stacking is found and a row can't be mistaken for a value. Each block is tagged with its family
 * (`ss-family-move`), and the studio's stylesheet colours it from `@storystage/ui`'s tokens, so the
 * colours follow the theme and the contrast test checks them.
 */
import * as Blockly from 'blockly/core';
import { CATEGORIES } from '@storystage/story-api/editing';
import {
  FROM_SCRIPT,
  SOUND,
  LISTENER,
  METHOD,
  STATEMENT_KINDS,
  USER_CALL,
  USER_FUNCTION,
} from './shapes.ts';

export const RENDERER = 'storystage';

/**
 * A block's family, which sets its colour: screen 02's moves (blue), speech (pink) and camera
 * (amber), then looks, sound and time, questions, the learner's own procedures, loops (a colour
 * apart from `if`, as Blockly's block guide asks), the other control statements and the method
 * around them, and values, which are chips. The four not on screen 02 take Blockly Games' hues,
 * darkened to 4.5:1 (the owner's choice, 16 Nov).
 */
export const FAMILIES = [
  'move',
  'speech',
  'camera',
  'look',
  'sound',
  'question',
  'yours',
  'loop',
  'control',
  'method',
  'value',
] as const;
export type Family = (typeof FAMILIES)[number];

/** The palette's action categories (`editing/palette.ts`), by family. */
const BY_CATEGORY: Readonly<Record<string, Family>> = {
  sayThink: 'speech',
  words: 'speech',
  position: 'move',
  orientation: 'move',
  positionAndOrientation: 'move',
  rideOn: 'move',
  body: 'move',
  movingAbout: 'move',
  hands: 'move',
  size: 'look',
  appearance: 'look',
  skyAndLight: 'look',
  timing: 'sound',
  sound: 'sound',
  camera: 'camera',
  scenes: 'camera',
};

const ACTIONS = new Map<string, Family>();
for (const c of CATEGORIES)
  if (c.tab === 'actions') for (const b of c.blocks) ACTIONS.set(b, BY_CATEGORY[c.key] ?? 'move');

/** The loops, coloured apart from `if`. */
const LOOPS = ['count', 'while', 'forEach', 'eachTogether'] as const;

/** The family of a block type. */
export function familyOf(type: string): Family {
  if (type === METHOD || type === LISTENER) return 'method';
  if (type === USER_CALL) return 'yours';
  if (type === USER_FUNCTION || type.startsWith('ss_storyfn_')) return 'question';
  if (type.startsWith('ss_story_')) return ACTIONS.get(type.slice('ss_story_'.length)) ?? 'move';
  if (type === FROM_SCRIPT || type === SOUND || type.startsWith('ss_enum_')) return 'value';
  const kind = type.slice('ss_'.length);
  if ((LOOPS as readonly string[]).includes(kind)) return 'loop';
  return (STATEMENT_KINDS as readonly string[]).includes(kind) ? 'control' : 'value';
}

/** A block style per family, named for it: Blockly needs colours, which the stylesheet replaces. */
const STYLE_PREFIX = 'ss_family_';
export const styleOf = (type: string) => `${STYLE_PREFIX}${familyOf(type)}`;

/** Blockly's theme: block styles by family, the font, and no start hats. */
export function storyTheme(): Blockly.Theme {
  const existing = Blockly.registry.getObject(Blockly.registry.Type.THEME, RENDERER);
  if (existing) return existing as Blockly.Theme;
  const style = { colourPrimary: '#5A4B3D', colourSecondary: '#FFFFFF', colourTertiary: '#8A7B6A' };
  return Blockly.Theme.defineTheme(RENDERER, {
    name: RENDERER,
    base: Blockly.Themes.Classic,
    blockStyles: Object.fromEntries(FAMILIES.map((f) => [`${STYLE_PREFIX}${f}`, style])),
    // Blockly's size is in points: 12 pt is the studio's 16 px body text.
    fontStyle: {
      family: "'Atkinson Hyperlegible', system-ui, sans-serif",
      weight: 'bold',
      size: 12,
    },
    startHats: false,
  });
}

class Constants extends Blockly.zelos.ConstantProvider {
  constructor() {
    super();
    // Rows as tall as a touch target (44 px), with screen 02's rounded corners.
    this.MIN_BLOCK_HEIGHT = 44;
    this.CORNER_RADIUS = 10;
  }

  /** Every value is a rounded chip, never zelos's hexagon. */
  override shapeFor(connection: Blockly.RenderedConnection) {
    const type = connection.type;
    if (type === Blockly.ConnectionType.INPUT_VALUE || type === Blockly.ConnectionType.OUTPUT_VALUE)
      return this.ROUNDED!;
    return super.shapeFor(connection);
  }
}

/** Tags each block with its family, for the stylesheet. */
class PathObject extends Blockly.zelos.PathObject {
  override applyColour(block: Blockly.BlockSvg) {
    super.applyColour(block);
    const name = block.getStyleName();
    for (const c of [...this.svgRoot.classList])
      if (c.startsWith('ss-family-')) this.svgRoot.classList.remove(c);
    if (name.startsWith(STYLE_PREFIX))
      this.svgRoot.classList.add(`ss-family-${name.slice(STYLE_PREFIX.length)}`);
  }
}

class Renderer extends Blockly.zelos.Renderer {
  protected override makeConstants_() {
    return new Constants();
  }

  override makePathObject(root: SVGElement, style: Blockly.Theme.BlockStyle) {
    return new PathObject(root, style, this.getConstants() as Blockly.zelos.ConstantProvider);
  }
}

/** Registers the renderer with Blockly. Safe to call more than once. */
export function registerRenderer(): void {
  if (!Blockly.registry.hasItem(Blockly.registry.Type.RENDERER, RENDERER))
    Blockly.blockRendering.register(RENDERER, Renderer);
}
