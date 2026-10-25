/**
 * WP3.1: list Alice's gallery for the licence audit (`docs/legal/licence-audit.md`, appendix A),
 * from a StoryStage 1 checkout:
 * - `core/i18n/.../GalleryNames.properties` names every model in the installed gallery;
 * - `core/models/.../resources/<package>/<Name>Resource.java` gives each model's variants
 *   (textures and sizes) where StoryStage 1 has its source, and marks variants drawn from The
 *   Sims 2's art (`ImplementationAndVisualType.SIMS2`), which never ship (WP17.7).
 *
 * The converter itself (3.2) comes with WP3b.
 */

export interface GalleryName {
  /** Alice's class folder, as the gallery shows it (`MarineMammal`). */
  readonly folder: string;
  /** Alice's package for the class (`marinemammal`). */
  readonly pkg: string;
  readonly name: string;
  /** The English name in Alice's gallery. */
  readonly aliceName: string;
}

export interface Variant {
  readonly name: string;
  readonly sims2: boolean;
}

export interface GalleryModel extends GalleryName {
  /** Provisional key, `<folder>/<name>`; the converter (3.2) adds the gallery's theme folder. */
  readonly key: string;
  readonly storyClass: string;
  readonly section: 'cast' | 'props' | 'props or set';
  /** Null where StoryStage 1 has no source for the model's resource class. */
  readonly variants: readonly Variant[] | null;
  readonly verdict: string;
}

const PREFIX = 'org.lgna.story.resources.';

export function parseGalleryNames(text: string): GalleryName[] {
  const folders = new Map<string, string>();
  const models: { pkg: string; name: string; aliceName: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith(PREFIX)) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(PREFIX.length, eq).trim();
    const value = line.slice(eq + 1).trim();
    const parts = key.split('.');
    if (parts.length === 1 && /^[A-Z]/.test(parts[0]!))
      folders.set(parts[0]!.toLowerCase(), parts[0]!);
    else if (parts.length === 2 && /^[a-z]+$/.test(parts[0]!) && /^[A-Z]/.test(parts[1]!))
      models.push({ pkg: parts[0]!, name: parts[1]!, aliceName: value });
  }
  return models.map((m) => ({ folder: folders.get(m.pkg) ?? m.pkg, ...m }));
}

/** The enum constants of a gallery resource class: its variants. */
export function parseResource(java: string): Variant[] | null {
  const m = /public\s+enum\s+\w+Resource\s+implements\s+[\w.]+\s*\{([^;]*);/.exec(java);
  if (!m) return null;
  return m[1]!
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => ({ name: s.replace(/\(.*$/s, '').trim(), sims2: /SIMS2/.test(s) }));
}

const CLASS_OF: Record<string, string> = {
  biped: 'Biped',
  quadruped: 'Quadruped',
  flyer: 'Flyer',
  fish: 'Swimmer',
  marinemammal: 'Swimmer',
  slitherer: 'Slitherer',
  prop: 'Prop',
  aircraft: 'Transport',
  automobile: 'Transport',
  train: 'Transport',
  watercraft: 'Transport',
};

/** The Story API class for one of Alice's model packages. */
export const storyClassOf = (pkg: string): string => CLASS_OF[pkg] ?? 'Prop';

/**
 * The home section by the rules in workplan WP3: anything that can act is Cast, vehicles are
 * Props, and Alice's props are split between Props and Set item by item (3.10).
 */
export function homeSection(pkg: string): GalleryModel['section'] {
  const cls = storyClassOf(pkg);
  if (cls === 'Transport') return 'props';
  if (cls === 'Prop') return 'props or set';
  return 'cast';
}

const WAIT = 'Not yet: convert for testing only; ship only if CMU confirms (WP17.1)';

export function galleryList(
  names: readonly GalleryName[],
  resources: ReadonlyMap<string, string>,
): GalleryModel[] {
  return names.map((n) => {
    const java = resources.get(`${n.pkg}/${n.name}`);
    const variants = java === undefined ? null : parseResource(java);
    const sims = (variants ?? []).filter((v) => v.sims2).map((v) => v.name);
    return {
      ...n,
      key: `${n.folder}/${n.name}`,
      storyClass: storyClassOf(n.pkg),
      section: homeSection(n.pkg),
      variants,
      verdict: sims.length
        ? `Never ship the Sims 2 variants (${sims.join(', ')}; WP17.7). Others: ${WAIT}`
        : WAIT,
    };
  });
}

/** Appendix A of the licence audit: one numbered row per model. */
export function renderGalleryTable(models: readonly GalleryModel[]): string {
  const rows = models.map(
    (m, i) =>
      `| ${i + 1} | \`${m.key}\` | ${m.aliceName} | ${m.storyClass} | ${m.section} | ${
        m.variants === null ? 'not in source' : m.variants.length
      } | ${m.verdict} |`,
  );
  return [
    '| # | Key | Name in Alice | Class | Home section | Variants | Ship? |',
    '|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}
