/**
 * Marks painted out of a model's pictures in the shipped copy (the owner's choice of 21 Nov 2026,
 * for NASA's models: NASA's guidelines, `docs/legal/public-domain/nasa.md`, forbid using its
 * insignia, so the meatball and JPL's logo are covered). A source list gives each box in the
 * picture's own pixels, as fetched; the build fills it with the colour around it, or with the
 * colour given where there is nothing around it (a picture that is all logo). The fetched file
 * is never changed, and provenance keeps its hash.
 */
import type { Document } from '@gltf-transform/core';

export interface Cover {
  /** The picture's name in the model (its glTF texture's `name`); every texture so named. */
  readonly texture: string;
  /** The box to cover, in the picture's pixels: left, top, width, height. */
  readonly at: readonly [number, number, number, number];
  /** Its colour, `#rrggbb`; otherwise the average of a band of pixels just around the box. */
  readonly colour?: string;
}

/** Paints boxes over one picture and gives it back in the same format. */
export type Painter = (
  image: Uint8Array,
  mimeType: string,
  boxes: readonly Pick<Cover, 'at' | 'colour'>[],
) => Promise<Uint8Array>;

/** What's wrong with a `cover` list, or null. */
export function coverProblem(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return 'cover must be a list of boxes to paint out.';
  for (const c of v) {
    if (typeof c !== 'object' || c === null || Array.isArray(c))
      return 'each cover must be { texture, at, colour? }.';
    const { texture, at, colour, ...rest } = c as Record<string, unknown>;
    if (Object.keys(rest).length) return 'each cover has only texture, at and colour.';
    if (typeof texture !== 'string' || !texture.trim()) return 'a cover needs its texture name.';
    if (
      !Array.isArray(at) ||
      at.length !== 4 ||
      !at.every((x) => Number.isInteger(x) && x >= 0) ||
      at[2] === 0 ||
      at[3] === 0
    )
      return `cover ${texture}: at must be four whole numbers, left, top, width and height, the size above 0.`;
    if (colour !== undefined && (typeof colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(colour)))
      return `cover ${texture}: colour must be #rrggbb.`;
  }
  return null;
}

/**
 * Paints each picture's boxes, once a picture; a name no texture has throws, so a list can't
 * silently miss a mark.
 */
export async function coverTextures(
  doc: Document,
  covers: readonly Cover[],
  paint: Painter,
): Promise<void> {
  const textures = doc.getRoot().listTextures();
  const byName = new Map<string, Cover[]>();
  for (const c of covers) byName.set(c.texture, [...(byName.get(c.texture) ?? []), c]);
  for (const [name, boxes] of byName) {
    const named = textures.filter((t) => t.getName() === name);
    if (named.length === 0) throw new Error(`cover: the model has no texture called "${name}".`);
    // Textures sharing one picture are painted once.
    const done = new Map<Uint8Array, Uint8Array>();
    for (const t of named) {
      const image = t.getImage();
      if (!image) throw new Error(`cover: the texture "${name}" has no picture.`);
      const mime = t.getMimeType();
      const painted =
        done.get(image) ??
        (await paint(
          image,
          mime,
          boxes.map(({ at, colour }) => (colour === undefined ? { at } : { at, colour })),
        ));
      done.set(image, painted);
      t.setImage(painted).setMimeType(mime);
    }
  }
}
