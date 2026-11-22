/**
 * The Code editor's header: "Code", the Blocks | Tiles switch and "⇄ Blocks and Tiles edit the
 * same code." (`14-editors.md` section 4; screen 04), and the first switch's dialog (4.4; screen
 * 05). The switch is a view change, never a conversion: both editors draw the one program.
 */
import type { MethodDecl, ListenerDecl, Program, Statement } from '@storystage/ast';
import type { EditorId } from '@storystage/editor-contract';
import { describer } from '@storystage/story-api/editing';
import { TILE_COLOURS } from '@storystage/tiles';
import { Button, Checkbox, Dialog, Icon, NeutralNote, Segmented } from '@storystage/ui';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { words } from '../strings.ts';
import './editor-switch.css';

export const editorName = (id: EditorId): string => words.t(`production.editor.${id}`);

/** Every statement in a method, in reading order, nested ones included: its "steps". */
export function stepsOf(body: readonly Statement[]): Statement[] {
  return body.flatMap((s) => [s, ...listsOf(s).flatMap(stepsOf)]);
}

/** The lists of statements inside one: an if's two, or a container's body. */
function listsOf(s: Statement): (readonly Statement[])[] {
  if (s.kind === 'if') return [s.then, s.else];
  const body = (s as { body?: unknown }).body;
  return Array.isArray(body) ? [body as readonly Statement[]] : [];
}

export interface EditorSwitchProps {
  readonly shown: EditorId;
  /** The teacher locked the editor (`editor.locked`): the switch shows, but can't change. */
  readonly locked: boolean;
  /** Why it's locked, in place of the teacher's words: a study task's (spec 14 section 6.5). */
  readonly lockNote?: string;
  /** The first switch has been explained, and the learner asked not to again. */
  readonly explained: boolean;
  readonly program: Program;
  /** The open method, for the dialog's preview. */
  readonly method: MethodDecl | ListenerDecl | null;
  /** Switch to `to`; `explained` is the dialog's "Don't explain this again". */
  readonly onSwitch: (to: EditorId, explained: boolean) => void;
  /** The learner stayed, with the tick box as they left it. */
  readonly onStay: (explained: boolean) => void;
}

export function EditorSwitch(props: EditorSwitchProps) {
  const { shown, locked, explained } = props;
  const [asking, setAsking] = useState<EditorId | null>(null);
  const choose = (to: EditorId) => {
    if (locked || to === shown) return;
    if (explained) props.onSwitch(to, true);
    else setAsking(to);
  };
  return (
    <div className="pr-editor-switch">
      {/* Laid out as "Blocks for" is beside it: its word above, the control under. */}
      <div className="pr-picker">
        <span className="pr-picker-label" aria-hidden="true">
          {words.t('production.code')}
        </span>
        <Segmented
          label={words.t('production.codeEditor')}
          options={(['blocks', 'tiles'] as const).map((id) => ({ id, label: editorName(id) }))}
          value={shown}
          onChange={choose}
          isDisabled={locked}
        />
      </div>
      {locked ? (
        <NeutralNote>
          {props.lockNote ?? words.t('production.editorLocked', { editor: editorName(shown) })}
        </NeutralNote>
      ) : (
        <p className="pr-same-code">
          <span aria-hidden="true">⇄ </span>
          {words.t('production.sameCode')}
        </p>
      )}
      {asking && (
        <SwitchDialog
          from={shown}
          to={asking}
          program={props.program}
          method={props.method}
          onSwitch={(tick) => {
            setAsking(null);
            props.onSwitch(asking, tick);
          }}
          onStay={(tick) => {
            setAsking(null);
            props.onStay(tick);
          }}
        />
      )}
    </div>
  );
}

const PREVIEW = 3;

interface SwitchDialogProps {
  readonly from: EditorId;
  readonly to: EditorId;
  readonly program: Program;
  readonly method: MethodDecl | ListenerDecl | null;
  readonly onSwitch: (explained: boolean) => void;
  readonly onStay: (explained: boolean) => void;
}

/** Screen 05: what a switch is, the same steps in each look, and that nothing changes. */
function SwitchDialog({ from, to, program, method, onSwitch, onStay }: SwitchDialogProps) {
  const [tick, setTick] = useState(false);
  // Focus starts on the primary button (4.5): a frame after opening, once the switch that opened
  // the dialog has let go of it.
  const actions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      actions.current?.querySelector<HTMLButtonElement>('[data-variant="primary"]')?.focus(),
    );
    return () => cancelAnimationFrame(id);
  }, []);
  const steps = method ? stepsOf(method.body) : [];
  const describe = describer(program);
  const shown = steps.slice(0, PREVIEW).map((s) => ({ id: s.id, words: describe(s) }));
  const more = steps.length - shown.length;
  const kept =
    steps.length === 0
      ? words.t('switch.noStepsKept')
      : steps.length === 1
        ? words.t('switch.oneStep')
        : words.t('switch.steps', { n: String(steps.length) });
  const side = (id: EditorId) => (
    <section className="pr-switch-side" data-editor={id} aria-label={editorName(id)}>
      <h3 className="pr-switch-name">{editorName(id)}</h3>
      {shown.length === 0 ? (
        <p className="pr-switch-more">{words.t('switch.noSteps')}</p>
      ) : (
        <ul className="pr-switch-steps" style={id === 'tiles' ? TILE_LOOK : undefined}>
          {shown.map((s) => (
            <li key={s.id} className="pr-switch-step">
              {s.words}
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="pr-switch-more">{words.t('switch.more', { n: String(more) })}</p>}
    </section>
  );
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onStay(tick);
      }}
      title={`⇄ ${words.t('switch.title', { editor: editorName(to) })}`}
      width={900}
    >
      <p className="pr-switch-intro">{words.t('switch.intro')}</p>
      <div className="pr-switch-preview">
        {side(from)}
        <span className="pr-switch-arrow" aria-hidden="true">
          →
        </span>
        {side(to)}
      </div>
      <p className="pr-switch-kept">
        <Icon name="check_circle" size={24} />
        <span>
          <strong>{words.t('switch.kept')}</strong> {kept}
        </span>
      </p>
      <div className="pr-switch-actions" ref={actions}>
        <Button variant="primary" onPress={() => onSwitch(tick)}>
          {words.t('switch.show', { editor: editorName(to) })}
        </Button>
        <Button variant="secondary" onPress={() => onStay(tick)}>
          {words.t('switch.stay', { editor: editorName(from) })}
        </Button>
        <span className="pr-switch-tick">
          <Checkbox isSelected={tick} onChange={setTick}>
            {words.t('switch.dontExplain')}
          </Checkbox>
        </span>
      </div>
    </Dialog>
  );
}

/** The preview's Tiles rows, in Tiles' own colours (section 3). */
const TILE_LOOK = {
  '--pr-step': TILE_COLOURS.action,
  '--pr-step-line': TILE_COLOURS['action-line'],
  '--pr-on-step': TILE_COLOURS['action-text'],
  '--pr-step-panel': TILE_COLOURS.panel,
} as CSSProperties;
