/**
 * The Prompter panel (07-ux section 2.4, Direction A screen 02; WP13c): S7's `PrompterPanel`
 * drawn beside the scene view and the code. Its state says what to show; every control calls the
 * panel. The browser version has no panel (`usePrompter` gives none).
 */
import { PLAN_LIMITS, type FrameId } from '@storystage/production';
import {
  BUILD_REQUEST,
  FRESH_CONVERSATION,
  type PanelEntry,
  type PanelState,
  type PrompterMode,
  type PrompterPanel,
} from '@storystage/prompter';
import { AiBadge, Button, Icon, NeutralNote, PlanSteps, TextField, messages } from '@storystage/ui';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useFieldSpeech } from '../speech/talkToType.tsx';
import type { StudioSource } from '../studio.ts';
import { words } from '../strings.ts';
import { StepEditor, newStep, type StepWorld } from './StepEditor.tsx';

const BUILDS: readonly PrompterMode[] = ['showMeHow', 'buildIt'];

export interface PrompterAsideProps {
  panel: PrompterPanel<StudioSource>;
  /** The current frame, for Code this frame: its id and its number, such as "2.3". */
  frame: { readonly id: FrameId; readonly number: string } | null;
  /** Says something in the studio's polite live region. */
  onAnnounce: (text: string) => void;
  /** False while nothing may change the film (one opened read-only): only explaining is offered. */
  canChange?: boolean;
  /** Closes the studio's open step (typing in a field) before a request opens its own. */
  seal?: () => void;
  /** The scene's objects and lines, for changing and adding plan steps. Without it, neither. */
  world?: StepWorld;
  /** Opens the set-up wizard: Set up… shows while there's no key (WP13.6). */
  onSetUp?: () => void;
  /** Whether the panel is open or folded to its rail, when the stage holds it. Default: its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function usePanelState(panel: PrompterPanel<StudioSource>): PanelState {
  return useSyncExternalStore(
    (l) => panel.subscribe(l),
    () => panel.state,
  );
}

/** The words an entry says aloud once it's complete, or null for the learner's own. */
function spoken(entry: PanelEntry): string | null {
  if (entry.kind === 'asked') return null;
  if (entry.kind === 'fresh') return FRESH_CONVERSATION;
  return entry.text;
}

/**
 * What the panel says in the polite live region (07-ux 7.6): each change as it lands, a reply once
 * it's whole (read once, not as it streams), the plan being ready, and what went wrong.
 */
function useAnnouncements(state: PanelState, onAnnounce: (text: string) => void) {
  const seen = useRef({ said: state.entries.length, phase: state.phase, message: state.message });
  useEffect(() => {
    const before = seen.current;
    // A new conversation starts the count again.
    let said = Math.min(before.said, state.entries.length);
    const out: string[] = [];
    for (const entry of state.entries.slice(said)) {
      if (entry.kind === 'reply' && !entry.done) break;
      const text = spoken(entry);
      if (text) out.push(text);
      said++;
    }
    if (state.phase === 'planned' && before.phase !== 'planned')
      out.push(words.t('prompter.planReady'));
    if (state.message && state.message !== before.message) out.push(state.message.text);
    seen.current = { said, phase: state.phase, message: state.message };
    if (out.length > 0) onAnnounce(out.join(' '));
  }, [state, onAnnounce]);
}

/** The one step moved, from where to where, that turns `steps` into `next`. */
export function oneMove(
  steps: readonly { id: string }[],
  next: readonly { id: string }[],
): { from: number; to: number } | null {
  const order = next.map((s) => s.id).join(' ');
  for (const [from, step] of steps.entries()) {
    const to = next.findIndex((s) => s.id === step.id);
    if (to === from) continue;
    const moved = steps.filter((_, i) => i !== from);
    moved.splice(to, 0, step);
    if (moved.map((s) => s.id).join(' ') === order) return { from, to };
  }
  return null;
}

/**
 * Where a repeat goes when its row is moved to `to` (`oneMove`'s place for the row alone): its
 * place among the other steps once it and the `holds` steps it carries are lifted out, as the
 * panel's `moveStep` takes it (spec 04 section 6.8). The row dropped among its own held steps
 * goes back where it was.
 */
export function repeatMove(length: number, from: number, holds: number, to: number): number {
  const group = (i: number) => i >= from && i <= from + holds;
  const single = [...Array(length).keys()].filter((i) => i !== from);
  single.splice(to, 0, from);
  const before = single.slice(0, single.indexOf(from)).filter((i) => !group(i));
  const rest = [...Array(length).keys()].filter((i) => !group(i));
  return before.length === 0 ? 0 : rest.indexOf(before.at(-1)!) + 1;
}

function Entry({ entry, step }: { entry: PanelEntry; step: number | undefined }) {
  switch (entry.kind) {
    case 'asked':
      return (
        <li className="pm-asked">
          <span className="pm-asked-who">{words.t('prompter.youAsked')}</span>
          {entry.text === BUILD_REQUEST ? words.t('prompter.askedBuild') : entry.text}
        </li>
      );
    case 'reply':
      return (
        <li className="pm-reply" aria-busy={!entry.done || undefined}>
          {entry.text}
        </li>
      );
    case 'explain':
      return (
        <li className="pm-explain">
          <Icon name="lightbulb" size={20} />
          <span>{entry.text}</span>
        </li>
      );
    case 'change':
      return (
        <li className="pm-change">
          <Icon name="check_circle" size={20} filled />
          <span>
            {step === undefined
              ? entry.text
              : words.t('prompter.step', { n: step, text: entry.text })}
          </span>
        </li>
      );
    case 'fresh':
      return <li className="pm-fresh">{FRESH_CONVERSATION}</li>;
  }
}

export function PrompterAside({
  panel,
  frame,
  onAnnounce,
  canChange = true,
  seal = () => {},
  world,
  onSetUp,
  open: heldOpen,
  onOpenChange,
}: PrompterAsideProps) {
  const state = usePanelState(panel);
  useAnnouncements(state, onAnnounce);
  const [ownOpen, setOwnOpen] = useState(true);
  const open = heldOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  // The plan step being changed, by its place in the plan.
  const [editing, setEditing] = useState<number | null>(null);
  // Whether the step being changed was just added: Cancel then takes it out again.
  const [adding, setAdding] = useState(false);
  const [request, setRequest] = useState('');
  const speech = useFieldSpeech('prompter.request');
  const titleId = useId();
  const body = useRef<HTMLDivElement>(null);
  // The newest entry, or the plan, in view as the conversation grows.
  useEffect(() => {
    const scroller = body.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [state.entries, state.plan]);

  const { phase, plan, mode } = state;
  // Plan only: said once, as the last step is ticked, not as a conversation entry (spec 04, 6.6).
  const allBuilt = plan !== null && plan.done.length > 0 && plan.done.every(Boolean);
  const wasAllBuilt = useRef(allBuilt);
  useEffect(() => {
    if (allBuilt && !wasAllBuilt.current) onAnnounce(words.t('prompter.allBuilt'));
    wasAllBuilt.current = allBuilt;
  }, [allBuilt, onAnnounce]);
  const busy = phase === 'working' || phase === 'building';
  const modes = canChange ? state.modes : state.modes.filter((m) => !BUILDS.includes(m));
  const ask = (e?: FormEvent) => {
    e?.preventDefault();
    const text = request.trim();
    if (!text || busy) return;
    setRequest('');
    seal();
    void panel.ask(text);
  };
  // Try again repeats the last request exactly as it was sent: the panel keeps it (S7's #489).
  const tryAgain = () => {
    seal();
    void panel.retry();
  };
  const undo = () => {
    seal();
    panel.undoRequest();
    onAnnounce(words.t(phase === 'planned' ? 'prompter.planDropped' : 'prompter.undone'));
  };

  const band = (
    <div className="pm-band">
      <span className="pm-disc" aria-hidden="true">
        <Icon name="headset_mic" size={22} />
      </span>
      {open && (
        <div className="pm-titles">
          <h2 className="pm-title" id={titleId}>
            {messages.t('prompter.name')}
          </h2>
          <span className="pm-tagline">
            <AiBadge />
            {messages.t('prompter.tagline')}
          </span>
        </div>
      )}
      {open && !busy && state.entries.length > 0 && (
        <Button
          variant="quiet"
          icon="add_comment"
          aria-label={words.t('prompter.restart')}
          onPress={() => panel.restart()}
        />
      )}
      <Button
        variant="quiet"
        icon={open ? 'right_panel_close' : 'right_panel_open'}
        aria-label={words.t(open ? 'prompter.hide' : 'prompter.show')}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
      />
    </div>
  );

  if (phase === 'absent') return null;
  if (!open)
    return (
      <aside className="pm" data-closed aria-label={messages.t('prompter.name')}>
        {band}
      </aside>
    );

  if (phase === 'off' || phase === 'notSetUp' || modes.length === 0)
    return (
      <aside className="pm" aria-labelledby={titleId}>
        {band}
        <div className="pm-body">
          <NeutralNote>
            {phase === 'notSetUp'
              ? words.t('prompter.notSetUp')
              : messages.t('note.prompterOffBySchool')}
          </NeutralNote>
          {/* For anyone: the wizard's first page sends a learner back (the owner's choice). */}
          {phase === 'notSetUp' && onSetUp && (
            <Button icon="key" onPress={onSetUp}>
              {words.t('prompter.setUp')}
            </Button>
          )}
        </div>
      </aside>
    );

  const builds = BUILDS.includes(mode);
  const steps =
    plan?.steps.map((s, i) => {
      const problem = plan.problems.find((p) => p.step === i + 1)?.message;
      return {
        id: String(i),
        text: s.words,
        ...(problem ? { problem } : {}),
        ...(s.why ? { why: s.why } : {}),
        ...(plan.done[i] === true ? { done: true } : {}),
        // A repeat and the steps it holds (spec 04 section 6.8).
        ...(plan.heldBy[i] != null ? { inside: true } : {}),
        ...(s.kind === 'repeat'
          ? { holding: plan.heldBy.flatMap((h, j) => (h === i ? [j + 1] : [])) }
          : {}),
      };
    }) ?? [];
  /** Says what an edit did: `said` if it was made, and the panel's own words either way. */
  const announce = (edit: { ok: boolean; words?: string }, said: string) => {
    const all = [edit.ok ? said : null, edit.words ?? null].filter(Boolean).join(' ');
    if (all) onAnnounce(all);
  };
  const built = plan?.done.filter(Boolean).length ?? 0;
  const showPlan = plan !== null && (phase === 'planned' || phase === 'working');

  return (
    <aside className="pm" aria-labelledby={titleId}>
      {band}
      <div className="pm-modes" role="radiogroup" aria-label={words.t('prompter.modes')}>
        {modes.map((m) => (
          <label key={m} className="pm-mode" data-chosen={m === mode || undefined}>
            <input
              type="radio"
              name={`${titleId}-mode`}
              value={m}
              checked={m === mode}
              disabled={busy}
              onChange={() => panel.setMode(m)}
            />
            {words.t(`prompter.mode.${m}`)}
          </label>
        ))}
      </div>
      <div className="pm-body" ref={body}>
        <ol className="pm-talk" aria-label={words.t('prompter.conversation')}>
          {state.entries.length === 0 && (
            <li className="pm-greeting">{words.t('prompter.greeting')}</li>
          )}
          {state.entries.map((entry, i) => (
            <Entry key={i} entry={entry} step={entry.kind === 'change' ? entry.step : undefined} />
          ))}
        </ol>
        {busy && (
          <p className="pm-status" role="status">
            <span className="pm-dots" aria-hidden="true" />
            {words.t(
              phase === 'building'
                ? 'prompter.building'
                : builds
                  ? 'prompter.planning'
                  : 'prompter.thinking',
            )}
          </p>
        )}
        {showPlan && plan && (
          <section className="pm-plan" aria-labelledby={`${titleId}-plan`}>
            <div className="pm-plan-head">
              <h3 className="pm-plan-title" id={`${titleId}-plan`}>
                {messages.t('plan.label')}
              </h3>
              {built === 0 ? (
                <span className="pm-pill">
                  <Icon name="hourglass_empty" size={16} />
                  {messages.t('prompter.nothingBuilt')}
                </span>
              ) : (
                // Plan only: the steps the learner has built (spec 04 section 6.6).
                <span className="pm-pill" data-done>
                  <Icon name="check_circle" size={16} filled />
                  {words.t('prompter.stepsBuilt', { n: built, total: steps.length })}
                </span>
              )}
            </div>
            <PlanSteps
              steps={steps}
              isDisabled={busy}
              onReorder={(next, moved) => {
                // The step dragged, where the order alone could be read either way.
                const dragged = moved.length === 1 ? Number(moved[0]) : NaN;
                const move = Number.isInteger(dragged)
                  ? { from: dragged, to: next.findIndex((s) => s.id === moved[0]) }
                  : oneMove(steps, next);
                if (!move) return;
                // A repeat carries the steps it holds (spec 04 section 6.8).
                const moving = plan.steps[move.from];
                const to =
                  moving?.kind === 'repeat'
                    ? repeatMove(steps.length, move.from, moving.holds, move.to)
                    : move.to;
                announce(
                  panel.moveStep(move.from, to),
                  words.t('prompter.stepMoved', { from: move.from + 1, to: to + 1 }),
                );
              }}
              onDelete={(id) => {
                announce(
                  panel.deleteStep(Number(id)),
                  words.t('prompter.stepDeleted', { n: Number(id) + 1 }),
                );
              }}
              {...(world
                ? {
                    onEdit: (id: string) => {
                      setAdding(false);
                      setEditing(Number(id));
                    },
                  }
                : {})}
            />
            {world && phase === 'planned' && (
              <Button
                variant="secondary"
                icon="add"
                // The format keeps a plan of up to 50 steps with its frame (spec 04 section 6.7).
                isDisabled={plan.steps.length >= PLAN_LIMITS.steps}
                onPress={() => {
                  // A new step at the end, to change from there (spec 04 section 6.1, step 5).
                  panel.addStep(newStep(world));
                  setEditing(plan.steps.length);
                  setAdding(true);
                  onAnnounce(words.t('prompter.stepAdded', { n: plan.steps.length + 1 }));
                }}
              >
                {words.t('prompter.addStep')}
              </Button>
            )}
            {/* Repeat…: a repeat around the last step, then Change step on it (spec 04 6.8). */}
            {world && phase === 'planned' && plan.canRepeat && (
              <Button
                variant="secondary"
                icon="replay"
                aria-label={words.t('prompter.addRepeatName')}
                onPress={() => {
                  const made = panel.addRepeat();
                  if (!made.ok || made.index === undefined) return announce(made, '');
                  setEditing(made.index);
                  setAdding(true);
                  onAnnounce(words.t('prompter.stepAdded', { n: made.index + 1 }));
                }}
              >
                {words.t('prompter.addRepeat')}
              </Button>
            )}
            {world && editing !== null && plan.steps[editing] && (
              <StepEditor
                key={editing}
                step={plan.steps[editing]}
                number={editing + 1}
                world={world}
                insideMax={plan.stepsInsideMax[editing] ?? null}
                held={
                  plan.heldBy[editing] == null
                    ? null
                    : plan.heldBy[editing] === editing - 1
                      ? 'first'
                      : 'later'
                }
                following={editing + 2}
                onClose={() => {
                  // Cancel straight after Add a step leaves the plan as it was (S7, #519).
                  if (adding)
                    announce(
                      panel.deleteStep(editing),
                      words.t('prompter.stepDeleted', { n: editing + 1 }),
                    );
                  setAdding(false);
                  setEditing(null);
                }}
                onSave={(change) => {
                  announce(
                    panel.changeStep(editing, change),
                    words.t('prompter.stepChanged', { n: editing + 1 }),
                  );
                  setAdding(false);
                  setEditing(null);
                }}
              />
            )}
            {plan.problems.length > 0 && <p className="pm-note">{words.t('prompter.fixSteps')}</p>}
            {phase === 'planned' &&
              builds &&
              !state.canBuild &&
              plan.steps.length > 0 &&
              plan.problems.length === 0 && (
                <p className="pm-note">{words.t('prompter.buildYourself')}</p>
              )}
          </section>
        )}
        {state.message && (
          <div className="pm-message">
            <p>{state.message.text}</p>
            {state.canRetry && !busy && (
              <Button variant="secondary" icon="replay" onPress={tryAgain}>
                {words.t('prompter.tryAgain')}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="pm-foot">
        {phase === 'planned' && state.canBuild && (
          <Button
            variant="primary"
            size="key"
            icon="construction"
            onPress={() => {
              seal();
              void panel.build();
            }}
          >
            {messages.t('prompter.build')}
          </Button>
        )}
        {!busy && (
          <form className="pm-ask" onSubmit={ask}>
            <TextField
              label={messages.t('prompter.ask')}
              hideLabel
              placeholder={words.t('prompter.placeholder')}
              value={request}
              onChange={setRequest}
              maxLength={2000}
              {...(speech ? { speech } : {})}
            />
            <Button
              variant="prompter"
              icon="send"
              aria-label={words.t('prompter.send')}
              type="submit"
              isDisabled={request.trim() === ''}
            />
          </form>
        )}
        <div className="pm-actions">
          {busy && (
            <Button variant="stop" icon="stop_circle" onPress={() => panel.stop()}>
              {messages.t('prompter.stop')}
            </Button>
          )}
          {!busy && frame && builds && canChange && phase !== 'planned' && (
            <Button
              variant="secondary"
              icon="movie"
              onPress={() => {
                seal();
                void panel.codeFrame(frame.id);
              }}
            >
              {words.t('prompter.codeFrame', { n: frame.number })}
            </Button>
          )}
          {state.canUndo && !busy && (
            <Button variant="secondary" icon="undo" onPress={undo}>
              {messages.t('prompter.undo')}
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
