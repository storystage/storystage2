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
import { Button, Checkbox, Dialog } from '@storystage/ui';
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

/** The block's required settings, keeping any value the step already had. */
function settingsFor(
  entry: ApiEntry | undefined,
  before: PlanStep['details'],
  world: StepWorld,
): PlanStep['details'] {
  if (!entry) return before;
  const required = entry.params.map((p) => ({
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
    details: settingsFor(entry, [], world),
    line: '',
    sketch: '',
    together: false,
    repeat: 1,
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

/** Change step N: who, which block, its settings, which line, together and how many times. */
export function StepEditor({
  step,
  number,
  world,
  onSave,
  onClose,
}: {
  step: PlanStep;
  number: number;
  world: StepWorld;
  /** The step's changed fields. Its words are written again from them by the panel. */
  onSave: (change: Partial<PlanStep>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(step);
  const ids = { who: useId(), what: useId(), line: useId(), repeat: useId() };
  const set = (change: Partial<PlanStep>) => setDraft((d) => ({ ...d, ...change }));
  const cls = world.objects.get(draft.actor);
  const blocks = procedures(cls);
  const entry = blocks.find((e) => e.name === draft.action);
  const isDo = draft.kind === 'do';

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
          onSave({
            actor: draft.actor,
            action: draft.action,
            details: draft.details,
            line: draft.line,
            together: draft.together,
            repeat: draft.repeat,
            // The panel writes the words again from the fields (S7).
            words: '',
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
                    details: settingsFor(keep, draft.details, world),
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
                  set({ action: e.target.value, details: settingsFor(next, draft.details, world) });
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
        <Checkbox
          isSelected={draft.together}
          onChange={(together) => set({ together })}
          isDisabled={number === 1}
        >
          {words.t('prompter.step.together')}
        </Checkbox>
        <div className="pm-field">
          <label htmlFor={ids.repeat}>{words.t('prompter.step.repeat')}</label>
          <input
            id={ids.repeat}
            className="pm-input"
            type="number"
            min={1}
            max={1000}
            step={1}
            value={draft.repeat}
            onChange={(e) =>
              set({ repeat: Math.min(1000, Math.max(1, Math.round(Number(e.target.value) || 1))) })
            }
          />
        </div>
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
