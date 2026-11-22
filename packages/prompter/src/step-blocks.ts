/**
 * The blocks a `do` step can use (`docs/spec/04-prompter.md` section 6.9, "The studio's half"),
 * for the panel's step editor: the learner's own first, then the Story API's, each with its
 * settings and, where a setting is an object, the objects that fit it.
 */
import { classOfType, entriesOf, isKindOf, type TypeName } from '@storystage/story-api';
import { word } from '@storystage/story-api/editing';
import { ownMove, ownNames, typesIn, unplannable } from './own-moves.ts';
import type { Stage } from './plan-stage.ts';
import { settingWords, type PlanWorld } from './plans.ts';
import { plainText } from './values.ts';

export interface StepInput {
  /** As a step's details name it. */
  readonly name: string;
  /** As the learner reads it. */
  readonly words: string;
  /** Its type; for an input of a learner's class, the Story API class that builds on. */
  readonly type: TypeName | null;
  /** For an object, the names that fit it, the scene (`this`) included where it does; else null. */
  readonly objects: readonly string[] | null;
  /** A value to start from: the input's own default, when that's a plain value. */
  readonly start?: string;
  /** What the step's own field fills, when it isn't among the details. */
  readonly filledBy: 'target' | 'line' | null;
}

export interface StepBlock {
  /** The step's `action`. */
  readonly name: string;
  /** Its short words: "waddle", "move". */
  readonly words: string;
  /** Whether it's the learner's own, for the "your own" group. */
  readonly own: boolean;
  readonly inputs: readonly StepInput[];
  /** The optional details it takes. The learner's own take none. */
  readonly details: readonly string[];
}

function ownBlocks(actor: string, stage: Stage, world: PlanWorld): StepBlock[] {
  const { code } = world;
  if (!code) return [];
  const { program } = code;
  const type = stage.types.get(actor) ?? null;
  const fields = new Map(code.scene.fields.map((f) => [f.id, f.name] as const));
  return ownNames(program, type).flatMap((name) => {
    // Only what the name resolves to: one a built-in or a nearer class hides isn't listed.
    const move = ownMove(program, type, name);
    if (!move || unplannable(code, move) !== null) return [];
    const only = (kind: string) => move.inputs.filter((i) => i.kind === kind).length === 1;
    const inputs = move.inputs.map((input): StepInput => {
      const start = input.default === null ? null : plainText(input.default, fields);
      const object = input.kind === 'object';
      return {
        name: input.name,
        words: input.name,
        type: input.storyType,
        objects: object
          ? [...stage.types]
              .filter(([, has]) => typesIn(program).typeFits(has, input.type))
              .map(([who]) => who)
          : null,
        ...(start === null ? {} : { start }),
        filledBy:
          object && only('object')
            ? 'target'
            : input.kind === 'text' && only('text')
              ? 'line'
              : null,
      };
    });
    return [{ name, words: name, own: true, inputs, details: [] }];
  });
}

function builtInBlocks(actor: string, stage: Stage): StepBlock[] {
  const cls = stage.objects.get(actor);
  if (!cls) return [];
  return entriesOf(cls)
    .filter((e) => e.kind === 'procedure')
    .map((entry) => {
      const phrase = word(`entry.${entry.on}.${entry.name}`);
      const short = phrase.startsWith('entry.') ? '' : phrase.split('{')[0]!.trim();
      const inputs = entry.params.map((p): StepInput => {
        const wanted = classOfType(p.type);
        return {
          name: p.name,
          words: settingWords(p.name),
          type: p.type,
          objects: wanted
            ? [...stage.objects]
                .filter(([, has]) => has !== null && isKindOf(has, wanted))
                .map(([who]) => who)
            : null,
          filledBy: wanted ? 'target' : p.name === 'text' ? 'line' : null,
        };
      });
      return {
        name: entry.name,
        words: short || entry.name,
        own: false,
        inputs,
        details: entry.details,
      };
    });
}

/** Who can do a step: the scene (`this`), its objects, and those the steps before it add. */
export const stepActors = (stage: Stage): string[] => [...stage.objects.keys()];

/** Every block a `do` step of `actor`'s can use, with the stage as it is at that step. */
export const stepBlocks = (actor: string, stage: Stage, world: PlanWorld): StepBlock[] => [
  ...ownBlocks(actor, stage, world),
  ...builtInBlocks(actor, stage),
];
