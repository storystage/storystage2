/**
 * Models' own sketches from Backstage (WP10.9; `07-ux.md` section 6.5): their names, and the
 * sketch files for each facing and pose that `tools/make-sketches` drew (WP10.5). The App gives
 * the source from the model source, so the library, the frame, the print and the Screening room
 * all draw the same sketch. With no source, or a model with no sketches, a model is the labelled
 * outline it was.
 *
 * Each sketch file is drawn as an image, never put into the page, so a class's imported sketch
 * can't run anything. Its shape is measured when it first loads, so the frame's box fits it.
 */
import type { BackstageItem, Facing } from '@storystage/backstage';
import type { BackstageId } from '@storystage/story-api';
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { sketchAspect, sketchName, type SketchItem } from './sketchItems.ts';

export interface SketchSource {
  /** A model's catalogue entry: its name, and which sketches it has. */
  item(id: BackstageId): BackstageItem | undefined;
  /** The address of a model's sketch for this facing and pose (`null` standing), or `null`. */
  sketch(id: BackstageId, facing: Facing, pose: string | null): string | null;
}

const Source = createContext<SketchSource | null>(null);

export function SketchSourceProvider({
  source,
  children,
}: {
  source: SketchSource | null;
  children: ReactNode;
}) {
  return <Source.Provider value={source}>{children}</Source.Provider>;
}

/** How a sketch is drawn: which way it faces, and its pose (`null` standing). */
export interface Look {
  readonly facing: Facing;
  readonly pose: string | null;
}

/**
 * The look a model has nearest the one asked for: that one, or standing in that facing, or its
 * first sketch. `null` for a model with no sketches.
 */
export function lookOf(item: BackstageItem | undefined, want: Look): Look | null {
  const sketches = item?.sketches ?? [];
  const has = (facing: Facing, pose: string | null) =>
    sketches.some((s) => s.facing === facing && (s.pose ?? null) === pose);
  if (has(want.facing, want.pose)) return want;
  if (has(want.facing, null)) return { facing: want.facing, pose: null };
  const first = sketches[0];
  return first ? { facing: first.facing, pose: first.pose ?? null } : null;
}

/** The poses a model has sketches for, beyond standing. */
export const posesOf = (item: BackstageItem | undefined): string[] => [
  ...new Set((item?.sketches ?? []).flatMap((s) => (s.pose ? [s.pose] : []))),
];

// Each sketch file's shape, width over height, measured once when it first loads.
const aspects = new Map<string, number>();
const failed = new Set<string>();
const measuring = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;

function measure(url: string) {
  if (measuring.has(url) || typeof Image === 'undefined') return;
  measuring.add(url);
  const image = new Image();
  image.onload = () => {
    if (image.naturalWidth > 0 && image.naturalHeight > 0)
      aspects.set(url, image.naturalWidth / image.naturalHeight);
    changed();
  };
  image.onerror = () => {
    failed.add(url);
    changed();
  };
  image.src = url;
}

export interface Sketches {
  /** A sketch's name: a model's from Backstage, or a mark's, backdrop's or stand-in's. */
  name(item: SketchItem): string;
  /** A model's sketch file for this look, or `null`: a mark, a stand-in, or none to draw. */
  url(item: SketchItem, look: Look): string | null;
  /** Width over height, so the frame can size a sketch's box. */
  aspect(item: SketchItem, look: Look): number;
  /** The model's catalogue entry, if it's a model Backstage knows. */
  item(item: SketchItem): BackstageItem | undefined;
}

/** Sketches' names, files and shapes, drawn again as each file's shape is learnt. */
export function useSketches(): Sketches {
  const source = useContext(Source);
  const seen = useSyncExternalStore(subscribe, getVersion, getVersion);
  return useMemo(() => {
    const item = (s: SketchItem) => (source && typeof s === 'string' ? source.item(s) : undefined);
    const url = (s: SketchItem, want: Look) => {
      if (!source || typeof s !== 'string') return null;
      const look = lookOf(source.item(s), want);
      const at = look && source.sketch(s, look.facing, look.pose);
      if (!at || failed.has(at)) return null;
      measure(at);
      return at;
    };
    return {
      item,
      name: (s) => item(s)?.displayName ?? sketchName(s),
      url,
      aspect: (s, look) => {
        const at = url(s, look);
        return at ? (aspects.get(at) ?? sketchAspect(s)) : sketchAspect(s);
      },
    };
    // `seen` draws again as shapes are learnt and files fail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, seen]);
}
