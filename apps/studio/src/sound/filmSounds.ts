/**
 * The bytes of the open film's imported sounds (`07-ux.md` section 7.7; decision 0076, workplan
 * 7.17). The production names a sound (`manifest.sounds`); its file is kept here, with the studio,
 * for as long as the film is open, so Undo and Redo bring a sound back with its bytes, across a
 * save too. A save writes only the sounds the production names (`writeProduction`).
 */
import { ZIP_LAYOUT, type Production, type SoundClip } from '@storystage/production';
import type { Pack } from '../lesson/useSaving.ts';

export class FilmSounds {
  readonly #bytes = new Map<string, Uint8Array>();
  // Every id this film has used while open: one undone and imported again would otherwise be
  // given the same id, and Redo would bring back the first sound with the second one's file.
  readonly #ids = new Set<string>();

  /** A newly opened film's sounds, as it opened with them; nothing of the last film's is kept. */
  reset(sounds: ReadonlyMap<string, Uint8Array> | undefined, p: Production): void {
    this.#bytes.clear();
    this.#ids.clear();
    for (const [path, bytes] of sounds ?? []) this.#bytes.set(path, bytes);
    for (const c of p.manifest.sounds ?? []) this.#ids.add(c.id);
  }

  /**
   * `clip` with an id no sound of this film has had while it's been open, and its file named for
   * it: `importSound` gives the next one free in the production, which may be an undone one's.
   */
  fresh(clip: SoundClip, p: Production): SoundClip {
    const taken = new Set([...this.#ids, ...(p.manifest.sounds ?? []).map((c) => c.id)]);
    if (!taken.has(clip.id)) return clip;
    let n = 1;
    while (taken.has(`sn${n}`)) n++;
    const id = `sn${n}`;
    return { ...clip, id, file: clip.file.replace(/^[^.]+/, id) };
  }

  /** Keeps `bytes` as `clip`'s file. */
  add(clip: SoundClip, bytes: Uint8Array): void {
    this.#ids.add(clip.id);
    this.#bytes.set(`${ZIP_LAYOUT.sounds}${clip.file}`, bytes);
  }

  /** `clip`'s file, or `null` when this film hasn't got it. */
  bytes(clip: SoundClip): Uint8Array | null {
    return this.#bytes.get(`${ZIP_LAYOUT.sounds}${clip.file}`) ?? null;
  }

  /** Every file kept, by its path in the film. */
  all(): ReadonlyMap<string, Uint8Array> {
    return this.#bytes;
  }
}

/** `pack`, with the film's sounds given to it: a save then writes those the production names. */
export const packingSounds =
  (pack: Pack, sounds: FilmSounds): Pack =>
  (production, files) =>
    pack(production, {
      ...files,
      sounds: new Map([...(files.sounds ?? []), ...sounds.all()]),
    });

/** `label`, or with the next number when the film has a sound of that name ("Rain 2"). */
export function freeLabel(label: string, p: Production, limit: number): string {
  const taken = new Set((p.manifest.sounds ?? []).map((c) => c.label.toLowerCase()));
  const name = label.trim().slice(0, limit);
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const numbered = `${name.slice(0, limit - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(numbered.toLowerCase())) return numbered;
  }
}
