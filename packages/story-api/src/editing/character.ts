/**
 * A character's own moves (decision 0074, workplan 7.14; spec 14, section 3a): the learner
 * teaches the penguin to waddle, and every penguin in every scene can. As in Alice, there's one
 * class for each model, named after it and extending its Story API class ("Penguin extends
 * Animal"), and every object of that model is of it. The program doesn't know which model an
 * object is, so the editor passes the fields of every object of the model, from the set-ups.
 * Each function gives the edits for one undo step and applies nothing.
 */
import {
  idMinter,
  type EditOperation,
  type NodeId,
  type Program,
  type TypeDecl,
  type TypeRef,
} from '@storystage/ast';
import { indexOf } from './cache.ts';
import { freshName } from './names.ts';
import { fill, word } from './words.ts';

/** A Backstage model, as far as its class needs: its name and its Story API class. */
export interface CharacterModel {
  /** Its name as learners see it: "penguin", "Emperor penguin". */
  readonly name: string;
  /** Its Story API class: "Animal", "Biped", "Prop". */
  readonly storyClass: string;
}

/** "Emperor penguin" → "EmperorPenguin": a model's name as a class's. */
export function classNameFor(model: CharacterModel): string {
  const words = model.name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const joined = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');
  return /^\p{L}/u.test(joined) ? joined : `${model.storyClass}${joined}`;
}

/**
 * The learner's class for `model`, if the program has it. The class an object of the model is
 * of already, when `fields` (the model's objects, from the set-ups) are given: a model's name can
 * change, from a stand-in's label or a missing model's id to Backstage's own name, and its class
 * stays the one its objects are of. Else the class named after it ("Penguin", or "Penguin2" if
 * something else had the name first) and extending its Story API class.
 */
export function classOf(
  program: Program,
  model: CharacterModel,
  fields: readonly NodeId[] = [],
): TypeDecl | null {
  const index = indexOf(program);
  for (const id of fields) {
    const f = index.get(id)?.node;
    if (f?.kind !== 'field' || f.type.kind !== 'user') continue;
    const type = (f.type as { readonly type: NodeId }).type;
    const cls = program.types.find((t) => t.id === type);
    if (cls?.extends.kind === 'story' && cls.extends.name === model.storyClass) return cls;
  }
  const name = classNameFor(model);
  return (
    program.types.find(
      (t) =>
        t.name.startsWith(name) &&
        /^\d*$/.test(t.name.slice(name.length)) &&
        t.extends.kind === 'story' &&
        t.extends.name === model.storyClass,
    ) ?? null
  );
}

/**
 * The type a new object of `model` takes: its class once it has one, else its Story API class.
 * `fields`, the model's other objects, find its class as `classOf` does.
 */
export function fieldTypeFor(
  program: Program,
  model: CharacterModel,
  fields: readonly NodeId[] = [],
): TypeRef {
  const cls = classOf(program, model, fields);
  return cls ? { kind: 'user', type: cls.id } : { kind: 'story', name: model.storyClass };
}

export interface CharacterClass {
  /** Empty when the class is there and every field is of it already. */
  readonly edits: readonly EditOperation[];
  readonly type: NodeId;
}

/**
 * The learner's class for `model`, made if the program hasn't got it, with each of `fields`
 * (every object of the model, in every scene) made of it. A field already of it is left; one
 * of another type is left too, as it isn't this model's. `null` if a field isn't one.
 */
export function classFor(
  program: Program,
  model: CharacterModel,
  fields: readonly NodeId[],
  label?: string,
  mint: () => NodeId = idMinter(program),
): CharacterClass | null {
  const index = indexOf(program);
  const found = fields.map((id) => index.get(id)?.node);
  if (found.some((f) => f?.kind !== 'field')) return null;
  const said = label ?? fill(word('character.class'), { model: model.name });
  const edits: EditOperation[] = [];
  let cls = classOf(program, model, fields);
  if (!cls) {
    cls = {
      id: mint(),
      kind: 'type',
      name: freshName(
        classNameFor(model),
        program.types.map((t) => t.name),
      ),
      extends: { kind: 'story', name: model.storyClass },
      fields: [],
      methods: [],
      listeners: [],
    };
    edits.push({
      kind: 'declare',
      parent: null,
      index: program.types.length,
      node: cls,
      label: said,
    });
  }
  const type: TypeRef = { kind: 'user', type: cls.id };
  for (const f of found)
    if (f?.kind === 'field' && f.type.kind === 'story' && f.type.name === model.storyClass)
      edits.push({ kind: 'retype', node: f.id, type, label: said });
  return { edits, type: cls.id };
}
