/**
 * Backstage's models as data for the Alice import (`ImportOptions.models`), since the import runs
 * in a worker that can't call back to the page (spec 19, section 4.2). Light: it loads nothing,
 * so the page can import it (`@storystage/a3p-import/models`) without the importer.
 */
import type { BackstageItem } from '@storystage/backstage';
import type { AliceModel } from './import.ts';

/**
 * An Alice gallery path's import key: its folder and its model, without the theme folder Backstage
 * adds (`Quadruped/Cat/AbyssinianCat` is `Quadruped/AbyssinianCat`), or null for an id that isn't
 * an Alice gallery path (`kaykit/Biped/knight`: those start with their source, in lower case).
 */
export function aliceKeyOf(id: string): string | null {
  const parts = id.split('/');
  if (parts.length < 2 || !/^[A-Z][A-Za-z]*$/.test(parts[0]!)) return null;
  const name = parts.at(-1)!;
  return /^[A-Za-z0-9]+$/.test(name) ? `${parts[0]}/${name}` : null;
}

/**
 * Every Backstage item that is an Alice gallery model, by the key the import asks for, with its
 * id and its height at scale 1 (`defaultSize.height`). Pass it as `importAliceInWorker`'s
 * `models`. Should two items share a key, the first by id is kept, so the answer doesn't depend
 * on the order the items came in.
 */
export function aliceModelsFrom(backstage: {
  readonly items: readonly Pick<BackstageItem, 'id' | 'defaultSize'>[];
}): ReadonlyMap<string, AliceModel> {
  const models = new Map<string, AliceModel>();
  const items = [...backstage.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const item of items) {
    const key = aliceKeyOf(item.id);
    if (key === null || models.has(key)) continue;
    const height = item.defaultSize.height;
    models.set(key, { id: item.id, height: Number.isFinite(height) && height > 0 ? height : null });
  }
  return models;
}
