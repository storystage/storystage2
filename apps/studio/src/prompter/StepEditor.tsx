/**
 * Changing a plan step (spec 04 sections 6.1 step 5, 6.2 and 6.9; 07-ux 2.4; WP13c): who does it,
 * which block, and each of its settings, from the same choices the plan check takes. The panel
 * gives who can do a step there and every block each of them can use, the learner's own first
 * (`stepActors`, `stepBlocks`), so a step can call "waddle" as the Prompter can. A change step
 * sets its value and a when step its objects and number, so every problem the check marks can be
 * put right here. Nothing is built and nothing is asked of the Prompter; the panel checks the step
 * again and writes its words from its fields.
 */
import {
  SETTABLE_PROPERTIES,
  settingWords,
  type PlanStep,
  type StepBlock,
  type StepInput,
} from '@storystage/prompter';
import { DETAILS, enumValues, findEvent, isEnumName, type TypeName } from '@storystage/story-api';
import { arrowOf, word } from '@storystage/story-api/editing';
import { Button, Checkbox, Dialog, heldWords } from '@storystage/ui';
import { useId, useState } from 'react';
import { words } from '../strings.ts';

/** What a step is edited against beyond what the panel gives: the scene's script lines. */
export interface StepWorld {
  /** The scene's script lines, in order, with their words. */
  readonly lines: readonly { readonly id: string; readonly words: string }[];
}

/** What the panel gives for one place in the plan (spec 04 section 6.9, "The studio's half"). */
export interface StepChoices {
  /** Who can do a step there: `this`, the scene's objects and those earlier steps add. */
  readonly actors: readonly string[];
  /** Every block a `do` step of that actor's can use there, the learner's own first. */
  readonly blocks: (actor: string) => readonly StepBlock[];
}

type Detail = PlanStep['details'][number];

/** One setting the editor shows: a block's input or an optional detail the step has. */
interface Shown {
  readonly name: string;
  readonly words: string;
  readonly type: TypeName | null;
  readonly objects: readonly string[] | null;
  /** Whether it edits the step's target, not one of its details. */
  readonly isTarget?: boolean;
}

/** A first value for a setting a block needs, as `propose_plan` would write it. */
function startValue(input: Pick<StepInput, 'type' | 'objects' | 'start'>): string {
  if (input.start !== undefined) return input.start;
  if (input.objects) return input.objects.find((n) => n !== 'this') ?? input.objects[0] ?? '';
  const { type } = input;
  if (!type) return '';
  if (isEnumName(type)) return enumValues(type)[0] ?? '';
  if (type === 'Number' || type === 'WholeNumber') return '1';
  if (type === 'Boolean') return 'true';
  return '';
}

/** Whether a step's field fills this input, as the plan check reads it (spec 04 section 6.3). */
const filledByStep = (
  input: StepInput,
  before: readonly Detail[],
  step: Pick<PlanStep, 'line' | 'target'>,
) =>
  !before.some((d) => d.name === input.name) &&
  ((input.filledBy === 'line' && step.line !== '') ||
    (input.filledBy === 'target' && step.target !== ''));

/**
 * The block's inputs as details, keeping any value the step already had, then the optional
 * details it had that this block takes too. An input the step's line or target fills is left to
 * them; a block of the learner's takes no optional details.
 */
function settingsFor(
  block: StepBlock | undefined,
  before: readonly Detail[],
  step: Pick<PlanStep, 'line' | 'target'>,
): Detail[] {
  if (!block) return [...before];
  const inputs = block.inputs
    .filter((i) => !filledByStep(i, before, step))
    .map((i) => ({
      name: i.name,
      value: before.find((d) => d.name === i.name)?.value ?? startValue(i),
    }));
  const extra = before.filter(
    (d) => !block.inputs.some((i) => i.name === d.name) && block.details.includes(d.name),
  );
  return [...inputs, ...extra];
}

/**
 * The target a step keeps with this block: its own when an input of the block is filled by it,
 * else none, so a step moved to a block that acts on nothing doesn't keep "on the fox".
 */
const targetFor = (block: StepBlock | undefined, details: readonly Detail[], target: string) =>
  block?.inputs.some((i) => i.filledBy === 'target' && !details.some((d) => d.name === i.name))
    ? target
    : '';

/** A step for the end of the plan, to change from there: the first object's first block. */
export function newStep(choices: StepChoices): PlanStep {
  const actor = choices.actors.find((n) => n !== 'this') ?? choices.actors[0] ?? 'this';
  const block = choices.blocks(actor)[0];
  return {
    words: '',
    kind: 'do',
    actor,
    action: block?.name ?? '',
    target: '',
    details: settingsFor(block, [], { line: '', target: '' }),
    line: '',
    sketch: '',
    together: false,
    repeat: 1,
    holds: 0,
    why: '',
  };
}

const objectWords = (name: string) =>
  name === 'this' || name === 'scene' ? word('words.scene') : name;

/** The names to choose from, with the one the step has kept even when it no longer fits. */
const withCurrent = (names: readonly string[], current: string) =>
  current === '' || names.includes(current) ? names : [current, ...names];

/** One setting's control: the block's own choices for its type. */
function Setting({
  shown,
  value,
  onChange,
}: {
  shown: Shown;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const { type, objects } = shown;
  let control;
  const select = (options: readonly (readonly [string, string])[]) => (
    <select id={id} className="pm-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
  if (objects) {
    control = select(withCurrent(objects, value).map((n) => [n, objectWords(n)] as const));
  } else if (type && isEnumName(type)) {
    control = select(
      enumValues(type).map(
        (v) =>
          [v, [arrowOf(type, v), word(`value.${type}.${v}`)].filter(Boolean).join(' ')] as const,
      ),
    );
  } else if (type === 'Boolean') {
    control = select([
      ['true', word('words.true')],
      ['false', word('words.false')],
    ]);
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
  const textual = !objects && (!type || type === 'Text');
  return (
    <div className="pm-field" data-text={textual || undefined}>
      <label htmlFor={id}>{shown.words}</label>
      {control}
    </div>
  );
}

/** What a block's settings are, to show: each input, the target's in its place, then extras. */
function shownFor(block: StepBlock | undefined, draft: PlanStep): Shown[] {
  if (!block)
    return draft.details.map((d) => ({
      name: d.name,
      words: settingWords(d.name),
      type: DETAILS[d.name]?.type ?? null,
      objects: null,
    }));
  const inputs = block.inputs.flatMap((i): Shown[] => {
    if (draft.details.some((d) => d.name === i.name))
      return [{ name: i.name, words: i.words, type: i.type, objects: i.objects }];
    if (i.filledBy === 'target' && draft.target !== '')
      return [{ name: i.name, words: i.words, type: i.type, objects: i.objects, isTarget: true }];
    // The line, chosen at Which line, or nothing yet.
    return [];
  });
  const extra = draft.details
    .filter((d) => !block.inputs.some((i) => i.name === d.name))
    .map((d) => ({
      name: d.name,
      words: settingWords(d.name),
      type: DETAILS[d.name]?.type ?? null,
      objects: null,
    }));
  return [...inputs, ...extra];
}

/**
 * A number left empty keeps the value it had, or the block's first, so the step's words and its
 * build never read "move forward ." (S7, #519).
 */
function filledNumber(d: Detail, type: TypeName | null, before: readonly Detail[]): Detail {
  if ((type !== 'Number' && type !== 'WholeNumber') || d.value.trim() !== '') return d;
  const was = before.find((b) => b.name === d.name)?.value ?? '';
  return { ...d, value: was.trim() !== '' ? was : '1' };
}

/** A detail's value set, added at the end when the step hasn't got it. */
const withDetail = (details: readonly Detail[], name: string, value: string): Detail[] =>
  details.some((d) => d.name === name)
    ? details.map((d) => (d.name === name ? { ...d, value } : d))
    : [...details, { name, value }];

/** The detail a change step's value is in: by the property's name, or as `value` (S7's check). */
const changeDetail = (step: PlanStep) =>
  step.details.find((d) => d.name === 'value') ? 'value' : step.action;

/** A when step's event: how many objects it's about, and the number it takes, if any. */
function eventOf(step: PlanStep) {
  const event = findEvent(step.action);
  if (!event) return null;
  const objects = event.args.filter((a) => a.type !== 'Number');
  return {
    who: event.details.includes('setOfVisuals') || objects.length > 0,
    meets: objects.length === 2,
    number: event.args.find((a) => a.type === 'Number')?.name ?? null,
  };
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
  choices,
  insideMax = null,
  held = null,
  following = number + 1,
  onSave,
  onClose,
}: {
  step: PlanStep;
  number: number;
  world: StepWorld;
  /** Who and which blocks, from the panel at this step's place in the plan. */
  choices: StepChoices;
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
    meets: useId(),
    line: useId(),
    repeat: useId(),
    inside: useId(),
    list: useId(),
  };
  const isRepeat = draft.kind === 'repeat';
  const most = Math.max(1, insideMax ?? 1);
  const holds = clamp(inside, 1, most);
  const set = (change: Partial<PlanStep>) => setDraft((d) => ({ ...d, ...change }));
  const isDo = draft.kind === 'do';
  const blocks = isDo ? choices.blocks(draft.actor) : [];
  const block = blocks.find((b) => b.name === draft.action);
  const shown = isDo ? shownFor(block, draft) : [];
  const event = draft.kind === 'when' ? eventOf(draft) : null;
  // Who can do it: a change step sets an object's own setting, so not the scene's.
  const actors = withCurrent(
    choices.actors.filter((n) => draft.kind !== 'change' || n !== 'this'),
    draft.actor,
  );
  const own = blocks.filter((b) => b.own);
  const builtIn = blocks.filter((b) => !b.own);
  const option = (b: StepBlock) => (
    <option key={b.name} value={b.name}>
      {b.words}
    </option>
  );

  /** Who does it changed: the block kept if they have it, else their first. */
  const changeWho = (actor: string) => {
    if (!isDo) return set({ actor });
    const next = choices.blocks(actor);
    const keep = next.find((b) => b.name === draft.action) ?? next[0];
    const details = settingsFor(keep, draft.details, draft);
    set({
      actor,
      action: keep?.name ?? '',
      details,
      target: targetFor(keep, details, draft.target),
    });
  };

  const save = () => {
    if (isRepeat) return onSave({ repeat: clamp(times, 2, 1000), holds });
    const typeOf = (name: string) =>
      block?.inputs.find((i) => i.name === name)?.type ?? DETAILS[name]?.type ?? null;
    const details = draft.details.map((d) => filledNumber(d, typeOf(d.name), step.details));
    onSave({
      actor: draft.actor,
      action: draft.action,
      // A block that acts on nothing keeps no target; one whose block went keeps its own.
      target: isDo && block ? targetFor(block, details, draft.target) : draft.target,
      details,
      line: draft.line,
      together: draft.together,
      repeat: held ? 1 : clamp(times, 1, 1000),
      // No words: the panel writes them again from what the step now does (S7).
    });
  };

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
          save();
        }}
      >
        {(isDo || draft.kind === 'change' || event?.who) && (
          <div className="pm-field">
            <label htmlFor={ids.who}>{words.t('prompter.step.who')}</label>
            <select
              id={ids.who}
              className="pm-select"
              value={draft.actor}
              onChange={(e) => changeWho(e.target.value)}
            >
              {actors.map((n) => (
                <option key={n} value={n}>
                  {choices.actors.includes(n)
                    ? objectWords(n)
                    : words.t('prompter.step.notHere', { name: n })}
                </option>
              ))}
            </select>
          </div>
        )}
        {isDo && (
          <>
            <div className="pm-field">
              <label htmlFor={ids.what}>{words.t('prompter.step.what')}</label>
              <select
                id={ids.what}
                className="pm-select"
                value={draft.action}
                onChange={(e) => {
                  const next = blocks.find((b) => b.name === e.target.value);
                  const details = settingsFor(next, draft.details, draft);
                  set({
                    action: e.target.value,
                    details,
                    target: targetFor(next, details, draft.target),
                  });
                }}
              >
                {/* One that no longer resolves stays chosen, and says so, until it's changed. */}
                {!block && draft.action !== '' && (
                  <option value={draft.action}>
                    {words.t('prompter.step.missingBlock', { name: draft.action })}
                  </option>
                )}
                {own.length > 0 ? (
                  <>
                    <optgroup label={words.t('prompter.step.yourOwn')}>{own.map(option)}</optgroup>
                    <optgroup label={words.t('prompter.step.builtIn')}>
                      {builtIn.map(option)}
                    </optgroup>
                  </>
                ) : (
                  builtIn.map(option)
                )}
              </select>
            </div>
            {shown.map((s) => (
              <Setting
                key={s.name}
                shown={s}
                value={
                  s.isTarget
                    ? draft.target
                    : (draft.details.find((d) => d.name === s.name)?.value ?? '')
                }
                onChange={(value) =>
                  s.isTarget
                    ? set({ target: value })
                    : set({ details: withDetail(draft.details, s.name, value) })
                }
              />
            ))}
          </>
        )}
        {draft.kind === 'change' &&
          (SETTABLE_PROPERTIES as readonly string[]).includes(draft.action) && (
            <Setting
              shown={{
                name: changeDetail(draft),
                words: words.t('prompter.step.value', {
                  setting: settingWords(draft.action === 'turn_degrees' ? 'turn' : draft.action),
                }),
                type: null,
                // Riding on nothing is "scene" to the build's set_property, which refuses "this".
                objects:
                  draft.action === 'vehicle'
                    ? choices.actors.map((n) => (n === 'this' ? 'scene' : n))
                    : null,
              }}
              value={draft.details.find((d) => d.name === changeDetail(draft))?.value ?? ''}
              onChange={(value) =>
                set({ details: withDetail(draft.details, changeDetail(draft), value) })
              }
            />
          )}
        {event?.meets && (
          <div className="pm-field">
            <label htmlFor={ids.meets}>{words.t('prompter.step.meets')}</label>
            <select
              id={ids.meets}
              className="pm-select"
              value={draft.target}
              onChange={(e) => set({ target: e.target.value })}
            >
              {draft.target === '' && <option value="">{words.t('prompter.step.choose')}</option>}
              {withCurrent(
                choices.actors.filter((n) => n !== 'this'),
                draft.target,
              ).map((n) => (
                <option key={n} value={n}>
                  {objectWords(n)}
                </option>
              ))}
            </select>
          </div>
        )}
        {event?.number && (
          <Setting
            shown={{
              name: event.number,
              words: settingWords(event.number),
              type: 'Number',
              objects: null,
            }}
            value={draft.details.find((d) => d.name === event.number)?.value ?? ''}
            onChange={(value) => set({ details: withDetail(draft.details, event.number!, value) })}
          />
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
            // Nothing is before the first step, nor before a repeat's first step inside it. One
            // already ticked there can be unticked, or the plan couldn't be built (S7, #629). It
            // goes by the step as opened, so unticking doesn't take keyboard focus off the box.
            isDisabled={!step.together && (number === 1 || held === 'first')}
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
