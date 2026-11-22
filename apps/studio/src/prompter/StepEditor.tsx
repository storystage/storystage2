/**
 * Changing a plan step (spec 04 section 6.1 step 5, 6.2; 07-ux 2.4; WP13c): who does it, which
 * block, and each of its settings, from the same choices the blocks offer: a direction's words,
 * a number, the words to say, which object, which script line. Nothing is built and nothing is
 * asked of the Prompter; the panel checks the step again and writes its words from its fields.
 */
import type { PlanStep } from '@storystage/prompter';
import {
  DETAILS,
  TEXT_REFERENCES,
  classOfType,
  entriesOf,
  enumValues,
  isEnumName,
  isKindOf,
  type ApiClass,
  type ApiEntry,
  type TypeName,
} from '@storystage/story-api';
import { arrowOf, word } from '@storystage/story-api/editing';
import { Button, Checkbox, Dialog, heldWords } from '@storystage/ui';
import { useId, useState } from 'react';
import { words } from '../strings.ts';

/** What a step is edited against: the scene's objects by name (`this` is the scene) and its lines. */
export interface StepWorld {
  readonly objects: ReadonlyMap<string, ApiClass>;
  /** The scene's script lines, in order, with their words. */
  readonly lines: readonly { readonly id: string; readonly words: string }[];
}

const procedures = (cls: ApiClass | undefined): readonly ApiEntry[] =>
  cls ? entriesOf(cls).filter((e) => e.kind === 'procedure') : [];

/** A block's name as the blocks show it: its phrase up to its first value ("move"). */
export function blockWords(entry: ApiEntry): string {
  const phrase = word(`entry.${entry.on}.${entry.name}`);
  const short = phrase.split('{')[0]!.trim();
  return short === '' || phrase.startsWith('entry.') ? entry.name : short;
}

/** A setting's name as the blocks show it ("amount", "how long"). */
export const settingWords = (name: string): string => {
  const param = word(`param.${name}`);
  if (param !== `param.${name}`) return param;
  const detail = word(`detail.${name}`);
  return detail !== `detail.${name}` ? detail : name;
};

/** What a setting holds, from the block's parameter or the detail's own type. */
const typeOf = (entry: ApiEntry | undefined, name: string): TypeName | undefined =>
  entry?.params.find((p) => p.name === name)?.type ?? DETAILS[name]?.type;

/**
 * A number left empty keeps the value it had, or the block's first, so the step's words and its
 * build never read "move forward ." (S7, #519).
 */
function filledNumber(
  d: PlanStep['details'][number],
  type: TypeName | undefined,
  before: PlanStep['details'],
  world: StepWorld,
): PlanStep['details'][number] {
  if ((type !== 'Number' && type !== 'WholeNumber') || d.value.trim() !== '') return d;
  const was = before.find((b) => b.name === d.name)?.value ?? '';
  return { ...d, value: was.trim() !== '' ? was : startValue(type, world) };
}

/** A first value for a setting a block needs, as `propose_plan` would write it. */
function startValue(type: TypeName | undefined, world: StepWorld): string {
  if (!type) return '';
  if (isEnumName(type)) return enumValues(type)[0] ?? '';
  if (type === 'Number' || type === 'WholeNumber') return '1';
  if (type === 'Boolean') return 'true';
  const cls = classOfType(type);
  if (cls) return [...world.objects].find(([, c]) => isKindOf(c, cls))?.[0] ?? '';
  return '';
}

/**
 * The block's required settings, keeping any value the step already had. A setting the step's
 * line or target fills (a say's words, the block's object) is left to them, as the plan check
 * reads them (spec 04 section 6.3).
 */
function settingsFor(
  entry: ApiEntry | undefined,
  before: PlanStep['details'],
  world: StepWorld,
  step: Pick<PlanStep, 'line' | 'target'>,
): PlanStep['details'] {
  if (!entry) return before;
  const filledByStep = (p: ApiEntry['params'][number]) =>
    !before.some((d) => d.name === p.name) &&
    ((p.name === 'text' && step.line !== '') ||
      (classOfType(p.type) !== null && step.target !== ''));
  const required = entry.params
    .filter((p) => !filledByStep(p))
    .map((p) => ({
      name: p.name,
      value: before.find((d) => d.name === p.name)?.value ?? startValue(p.type, world),
    }));
  // Details the step had that this block can take too (how long, and the rest).
  const extra = before.filter(
    (d) => !entry.params.some((p) => p.name === d.name) && entry.details.includes(d.name),
  );
  return [...required, ...extra];
}

/** A step for the end of the plan, to change from there: the first object's first block. */
export function newStep(world: StepWorld): PlanStep {
  const [actor, cls] = [...world.objects].find(([name]) => name !== 'this') ??
    [...world.objects][0] ?? ['this'];
  const entry = procedures(cls as ApiClass | undefined)[0];
  return {
    words: '',
    kind: 'do',
    actor: actor as string,
    action: entry?.name ?? '',
    target: '',
    details: settingsFor(entry, [], world, { line: '', target: '' }),
    line: '',
    sketch: '',
    together: false,
    repeat: 1,
    holds: 0,
    why: '',
  };
}

const objectWords = (name: string) => (name === 'this' ? word('words.scene') : name);

/** One setting's control: the block's own choices for its type. */
function Setting({
  name,
  type,
  value,
  world,
  onChange,
}: {
  name: string;
  type: TypeName | undefined;
  value: string;
  world: StepWorld;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const label = settingWords(name);
  let control;
  if (type && isEnumName(type)) {
    control = (
      <select
        id={id}
        className="pm-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {enumValues(type).map((v) => (
          <option key={v} value={v}>
            {[arrowOf(type, v), word(`value.${type}.${v}`)].filter(Boolean).join(' ')}
          </option>
        ))}
      </select>
    );
  } else if (type === 'Boolean') {
    control = (
      <select
        id={id}
        className="pm-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="true">{word('words.true')}</option>
        <option value="false">{word('words.false')}</option>
      </select>
    );
  } else if (type && classOfType(type)) {
    const wanted = classOfType(type)!;
    control = (
      <select
        id={id}
        className="pm-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {[...world.objects]
          .filter(([, cls]) => isKindOf(cls, wanted))
          .map(([n]) => (
            <option key={n} value={n}>
              {objectWords(n)}
            </option>
          ))}
      </select>
    );
  } else {
    const number = type === 'Number' || type === 'WholeNumber';
    control = (
      <input
        id={id}
        className="pm-input"
        type={number ? 'number' : 'text'}
        {...(number ? { step: type === 'WholeNumber' ? 1 : 'any' } : {})}
        value={value}
        maxLength={300}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const textual = !type || type === 'Text' || TEXT_REFERENCES.includes(type);
  return (
    <div className="pm-field" data-text={textual || undefined}>
      <label htmlFor={id}>{label}</label>
      {control}
    </div>
  );
}

/** A number as typed, as a whole number from `min` to `max`; `min` when it isn't one. */
const clamp = (typed: string, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number(typed)) || min));

/**
 * Change step N: who, which block, its settings, which line, together and how many times. A
 * repeat step (spec 04 section 6.8) has How many times and Steps inside, with the steps it holds
 * listed under it; a step inside a repeat repeats with it, so has no How many times of its own.
 */
export function StepEditor({
  step,
  number,
  world,
  insideMax = null,
  held = null,
  following = number + 1,
  onSave,
  onClose,
}: {
  step: PlanStep;
  number: number;
  world: StepWorld;
  /** For a repeat step, the most its Steps inside can be: the run of block steps after it. */
  insideMax?: number | null;
  /** Inside a repeat: its first step (nothing in the loop is before it), or a later one. */
  held?: 'first' | 'later' | null;
  /** For a repeat step, the number of the step right after it, its first held step. */
  following?: number;
  /** The step's changed fields, without words: the panel writes them again from these. */
  onSave: (change: Partial<PlanStep>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(step);
  // How many times, as typed: clamped to 1 to 1000 only on Save, so the field can be cleared.
  const [times, setTimes] = useState(String(step.repeat));
  // Steps inside, as typed, clamped to 1 to the most it can be on Save.
  const [inside, setInside] = useState(String(step.holds));
  const ids = {
    who: useId(),
    what: useId(),
    line: useId(),
    repeat: useId(),
    inside: useId(),
    list: useId(),
  };
  const isRepeat = draft.kind === 'repeat';
  const most = Math.max(1, insideMax ?? 1);
  const holds = clamp(inside, 1, most);
  const set = (change: Partial<PlanStep>) => setDraft((d) => ({ ...d, ...change }));
  const cls = world.objects.get(draft.actor);
  const blocks = procedures(cls);
  const entry = blocks.find((e) => e.name === draft.action);
  const isDo = draft.kind === 'do';
  const filled = (d: PlanStep['details'][number], type: TypeName | undefined) =>
    filledNumber(d, type, step.details, world);

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={words.t('prompter.changeStep', { n: number })}
      icon="edit"
      width={520}
    >
      <form
        className="pm-editor"
        onSubmit={(e) => {
          e.preventDefault();
          if (isRepeat) return onSave({ repeat: clamp(times, 2, 1000), holds });
          onSave({
            actor: draft.actor,
            action: draft.action,
            details: draft.details.map((d) => filled(d, typeOf(entry, d.name))),
            line: draft.line,
            together: draft.together,
            repeat: held ? 1 : clamp(times, 1, 1000),
            // No words: the panel writes them again from what the step now does (S7).
          });
        }}
      >
        {isDo && (
          <>
            <div className="pm-field">
              <label htmlFor={ids.who}>{words.t('prompter.step.who')}</label>
              <select
                id={ids.who}
                className="pm-select"
                value={draft.actor}
                onChange={(e) => {
                  const actor = e.target.value;
                  const next = procedures(world.objects.get(actor));
                  // Keep the block if the new actor has it; else its first.
                  const keep = next.find((b) => b.name === draft.action) ?? next[0];
                  set({
                    actor,
                    action: keep?.name ?? '',
                    details: settingsFor(keep, draft.details, world, draft),
                  });
                }}
              >
                {[...world.objects.keys()].map((n) => (
                  <option key={n} value={n}>
                    {objectWords(n)}
                  </option>
                ))}
              </select>
            </div>
            <div className="pm-field">
              <label htmlFor={ids.what}>{words.t('prompter.step.what')}</label>
              <select
                id={ids.what}
                className="pm-select"
                value={draft.action}
                onChange={(e) => {
                  const next = blocks.find((b) => b.name === e.target.value);
                  set({
                    action: e.target.value,
                    details: settingsFor(next, draft.details, world, draft),
                  });
                }}
              >
                {blocks.map((b) => (
                  <option key={b.name} value={b.name}>
                    {blockWords(b)}
                  </option>
                ))}
              </select>
            </div>
            {draft.details.map((d, i) => (
              <Setting
                key={d.name}
                name={d.name}
                type={typeOf(entry, d.name)}
                value={d.value}
                world={world}
                onChange={(value) =>
                  set({
                    details: draft.details.map((x, j) => (j === i ? { ...x, value } : x)),
                  })
                }
              />
            ))}
          </>
        )}
        {draft.line !== '' && world.lines.length > 0 && (
          <div className="pm-field" data-text>
            <label htmlFor={ids.line}>{words.t('prompter.step.line')}</label>
            <select
              id={ids.line}
              className="pm-select"
              value={draft.line}
              onChange={(e) => set({ line: e.target.value })}
            >
              {world.lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.words}
                </option>
              ))}
            </select>
          </div>
        )}
        {!isRepeat && (
          <Checkbox
            isSelected={draft.together}
            onChange={(together) => set({ together })}
            // Nothing is before the first step, nor before a repeat's first step inside it.
            isDisabled={number === 1 || held === 'first'}
          >
            {words.t('prompter.step.together')}
          </Checkbox>
        )}
        {held === null && (
          <div className="pm-field">
            <label htmlFor={ids.repeat}>{words.t('prompter.step.repeat')}</label>
            <input
              id={ids.repeat}
              className="pm-input"
              type="number"
              // A repeat repeats at least twice, as the count block's number field.
              min={isRepeat ? 2 : 1}
              max={1000}
              step={1}
              value={times}
              onChange={(e) => setTimes(e.target.value)}
            />
          </div>
        )}
        {isRepeat && (
          <div className="pm-field">
            <label htmlFor={ids.inside}>{words.t('prompter.step.inside')}</label>
            <input
              id={ids.inside}
              className="pm-input"
              type="number"
              min={1}
              max={most}
              step={1}
              value={inside}
              aria-describedby={ids.list}
              onChange={(e) => setInside(e.target.value)}
            />
            {/* Which steps, so a child sees them: "Repeats steps 2 and 3." */}
            <p className="pm-field-note" id={ids.list} aria-live="polite">
              {words.t('prompter.step.insideList', {
                steps: heldWords(Array.from({ length: holds }, (_, k) => following + k)),
              })}
            </p>
          </div>
        )}
        <div className="st-actions">
          <Button variant="primary" icon="check_circle" type="submit">
            {words.t('prompter.step.save')}
          </Button>
          <Button variant="secondary" onPress={onClose}>
            {words.t('prompter.step.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
