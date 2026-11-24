import { browserHost } from '@storystage/host';
import {
  ProductionSession,
  exampleProduction,
  frameId,
  sceneId,
  type Production,
} from '@storystage/production';
import {
  createPrompterPanel,
  offTransport,
  scriptedTransport,
  type PlanStep,
  type PrompterEvent,
  type PrompterLevel,
  type PrompterPanel,
  type TransportStatus,
} from '@storystage/prompter';
import { testReply, type TestBlock } from '@storystage/prompter/testing';
import { checkProgram } from '@storystage/story-api/program-check';
import { ThemeRoot } from '@storystage/ui';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { nodeId, type MethodDecl, type Statement, type TypeRef } from '@storystage/ast';
import type { StudioSource } from '../studio.ts';
import { PrompterAside, oneMove, repeatMove } from './PrompterAside.tsx';
import type { StepWorld } from './StepEditor.tsx';
import { keepFramePlan, levelNow, prompterInBuild } from './usePrompter.ts';

// The Prompter panel as the studio draws it (07-ux section 2.4; spec 04 section 4.5, WP13c), on
// S7's panel with scripted replies: what each state shows, and what each control does.

const step = (s: Partial<PlanStep> = {}): PlanStep => ({
  words: 'The penguin waddles forward.',
  kind: 'do',
  actor: 'penguin',
  action: 'move',
  target: '',
  // A move's settings, for the default block; another block's step gives its own (S7's 6.3 check).
  details:
    s.action === undefined || s.action === 'move'
      ? [
          { name: 'direction', value: 'forward' },
          { name: 'amount', value: '1' },
        ]
      : [],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  holds: 0,
  why: 'So she can reach the fox.',
  ...s,
});
const toolUse = (id: string, name: string, input: unknown): TestBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const say = (text: string) => testReply([{ type: 'text', text }]);
const proposes = (steps: PlanStep[], frame?: string) =>
  testReply([toolUse('t1', 'propose_plan', { steps, ...(frame ? { frame } : {}) })]);
const moves = testReply([
  toolUse('t2', 'insert_statement', {
    method: 'myFirstMethod',
    position: 'end',
    target: 'penguin',
    procedure: 'move',
    arguments: [
      { name: 'direction', value: 'forward' },
      { name: 'amount', value: '1' },
    ],
    narration: 'The penguin waddles forward.',
    plan_step: 1,
  }),
]);

/** The example's scene 2's lines, as the Production stage gives them for changing steps. */
const WORLD: StepWorld = { lines: [] };

/**
 * The example with the learner's own moves (spec 04 section 6.9): scene 2's penguin is a Penguin,
 * a Flyer that can waddle some steps and hug another penguin.
 */
function ownMoves(): Production {
  const p = exampleProduction();
  const penguinClass = nodeId('pengclass');
  const penguin: TypeRef = { kind: 'user', type: penguinClass };
  const input = (id: string, name: string, type: TypeRef) => ({
    id: nodeId(id),
    kind: 'parameter' as const,
    name,
    type,
    default: null,
  });
  const move = (id: string, name: string, params: MethodDecl['params']): MethodDecl => ({
    id: nodeId(id),
    kind: 'method',
    name,
    returns: null,
    params,
    body: [],
  });
  const types = p.program.types.map((t) =>
    t.name !== 'Scene2'
      ? t
      : { ...t, fields: t.fields.map((f) => (f.name === 'penguin' ? { ...f, type: penguin } : f)) },
  );
  const own = {
    id: penguinClass,
    kind: 'type' as const,
    name: 'Penguin',
    extends: { kind: 'story' as const, name: 'Flyer' },
    fields: [],
    methods: [
      move('waddlemov', 'waddle', [input('waddlestp', 'steps', { kind: 'story', name: 'Number' })]),
      move('hugmoves', 'hug', [input('hugwhooo', 'who', penguin)]),
    ],
    listeners: [],
  };
  return { ...p, program: { ...p.program, types: [...types, own] } };
}

interface Options {
  readonly level?: PrompterLevel;
  readonly status?: TransportStatus;
  readonly readOnly?: boolean;
  readonly world?: StepWorld;
  readonly onSetUp?: () => void;
  readonly production?: Production;
}

function setUp(replies: PrompterEvent[][], options: Options = {}) {
  let next = 0;
  const scripted = scriptedTransport(() => replies[next++] ?? say('No more.'));
  const film = options.production ?? exampleProduction();
  const production = new ProductionSession<StudioSource>(film, {
    check: (p) => checkProgram(p),
  });
  const panel: PrompterPanel<StudioSource> = createPrompterPanel({
    production,
    transport: {
      status: async () => options.status ?? { available: true },
      send: (r, s) => scripted.send(r, s),
    },
    source: 'prompter',
    level: () => options.level ?? 'full',
    scene: () => sceneId('s2'),
    backstageClass: () => null,
    keepPlan: keepFramePlan,
  });
  const onAnnounce = vi.fn<(text: string) => void>();
  render(
    <ThemeRoot>
      <PrompterAside
        panel={panel}
        frame={{ id: frameId('f2-1'), number: '2.1' }}
        onAnnounce={onAnnounce}
        canChange={!options.readOnly}
        {...(options.world ? { world: options.world } : {})}
        {...(options.onSetUp ? { onSetUp: options.onSetUp } : {})}
      />
    </ThemeRoot>,
  );
  return { panel, production, onAnnounce, sent: scripted.sent };
}

const aside = () => screen.getByRole('complementary', { name: 'The Prompter' });
const said = (onAnnounce: { mock: { calls: string[][] } }) =>
  onAnnounce.mock.calls.map((c) => c[0]).join(' | ');

async function ask(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Ask the Prompter' }), text);
  await user.click(screen.getByRole('button', { name: 'Send' }));
  return user;
}

describe('the Prompter panel: what each state shows (07-ux 2.4)', () => {
  it('says the school has switched it off, and that an adult sets it up', async () => {
    const off = setUp([], { status: { available: false, reason: 'prompter_off' } });
    await act(() => off.panel.refresh());
    expect(within(aside()).getByText(/switched off by your school/)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('asks an adult when there is no key', async () => {
    const noKey = setUp([], { status: { available: false, reason: 'no_key' } });
    await act(() => noKey.panel.refresh());
    expect(within(aside()).getByText('Ask an adult to set up the Prompter.')).toBeTruthy();
    // Without the wizard (the browser version has none), no Set up….
    expect(within(aside()).queryByRole('button', { name: 'Set up…' })).toBeNull();
  });

  it('offers Set up… to anyone when there is no key, which opens the wizard (WP13.6)', async () => {
    const onSetUp = vi.fn();
    const noKey = setUp([], { status: { available: false, reason: 'no_key' }, onSetUp });
    await act(() => noKey.panel.refresh());
    await userEvent.setup().click(within(aside()).getByRole('button', { name: 'Set up…' }));
    expect(onSetUp).toHaveBeenCalledOnce();
  });

  it('has no Set up… while the school has switched it off', async () => {
    const off = setUp([], {
      status: { available: false, reason: 'prompter_off' },
      onSetUp: vi.fn(),
    });
    await act(() => off.panel.refresh());
    expect(within(aside()).queryByRole('button', { name: 'Set up…' })).toBeNull();
  });

  it('offers only the modes the level allows', async () => {
    setUp([], { level: 'explainOnly' });
    const modes = screen.getByRole('radiogroup', { name: 'What the Prompter does' });
    expect(
      within(modes)
        .getAllByRole('radio')
        .map((r) => r.closest('label')!.textContent),
    ).toEqual(['Explain', 'Story coach', 'Script check']);
  });

  it('offers only explaining in a film that cannot be changed', () => {
    setUp([], { readOnly: true });
    const modes = screen.getByRole('radiogroup', { name: 'What the Prompter does' });
    expect(within(modes).queryByRole('radio', { name: 'Build it' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Code frame 2.1' })).toBeNull();
  });

  it('shows what was asked and the reply, and reads the reply once it is whole', async () => {
    const { onAnnounce } = setUp([say('A count repeats the blocks inside it.')]);
    expect(within(aside()).getByText(/Ask about your film/)).toBeTruthy();
    await ask('What does count do?');
    await waitFor(() =>
      expect(within(aside()).getByText('A count repeats the blocks inside it.')).toBeTruthy(),
    );
    expect(within(aside()).getByText('You asked')).toBeTruthy();
    expect(said(onAnnounce)).toBe('A count repeats the blocks inside it.');
  });
});

describe('the Prompter panel: plan before change (spec 04 section 6)', () => {
  it('shows the plan with nothing built, builds it as one step, and undoes it', async () => {
    const { production, onAnnounce } = setUp([
      proposes([
        step(),
        step({
          words: 'The penguin waves.',
          action: 'turn',
          details: [
            { name: 'direction', value: 'left' },
            { name: 'amount', value: '0.25' },
          ],
        }),
      ]),
      say("Here's the plan."),
      moves,
      say('Done.'),
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin walk.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    expect(within(aside()).getByText('Nothing built yet')).toBeTruthy();
    expect(within(plan).getAllByRole('row')).toHaveLength(2);
    expect(said(onAnnounce)).toContain('The plan is ready. Nothing is built yet.');

    await user.click(screen.getByRole('button', { name: 'Delete step 2' }));
    expect(within(plan).getAllByRole('row')).toHaveLength(1);
    expect(said(onAnnounce)).toContain('Step 2 deleted.');

    const before = production.history().filter((h) => h.done).length;
    await user.click(screen.getByRole('button', { name: 'Build these steps' }));
    await waitFor(() =>
      expect(within(aside()).getByText('Step 1: The penguin waddles forward.')).toBeTruthy(),
    );
    expect(production.history().filter((h) => h.done)).toHaveLength(before + 1);
    expect(screen.queryByRole('grid', { name: 'Plan before change' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Undo this request' }));
    expect(production.history().filter((h) => h.done)).toHaveLength(before);
    expect(said(onAnnounce)).toContain('Undone: the Prompter’s request.');
  });

  it('says why a step is there, at Why this step?', async () => {
    setUp([proposes([step()]), say("Here's the plan.")]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin walk.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    expect(within(plan).queryByText('So she can reach the fox.')).toBeNull();
    const why = within(plan).getByRole('button', { name: 'Why this step? Step 1' });
    await user.click(why);
    expect(within(plan).getByText('So she can reach the fox.')).toBeTruthy();
    expect(why.getAttribute('aria-expanded')).toBe('true');
    await user.click(why);
    expect(within(plan).queryByText('So she can reach the fox.')).toBeNull();
  });

  it('changes a step’s settings with the blocks’ own choices, checked again', async () => {
    const { panel } = setUp(
      [
        proposes([
          step({
            details: [
              { name: 'direction', value: 'forward' },
              { name: 'amount', value: '1' },
            ],
          }),
        ]),
        say("Here's the plan."),
      ],
      { world: WORLD },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin walk.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    await user.click(within(plan).getByRole('button', { name: 'Change step 1' }));
    const editor = await screen.findByRole('dialog', { name: 'Change step 1' });
    expect((within(editor).getByLabelText('Who') as HTMLSelectElement).value).toBe('penguin');
    await user.selectOptions(within(editor).getByLabelText('direction'), 'backward');
    const amount = within(editor).getByLabelText('amount');
    await user.clear(amount);
    await user.type(amount, '3');
    await user.click(within(editor).getByRole('checkbox', { name: /At the same time/ }));
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog', { name: 'Change step 1' })).toBeNull();
    expect(panel.state.plan!.steps[0]).toMatchObject({
      actor: 'penguin',
      action: 'move',
      details: [
        { name: 'direction', value: 'backward' },
        { name: 'amount', value: '3' },
      ],
    });
    // The first step has nothing before it to run with.
    expect(panel.state.plan!.steps[0]!.together).toBe(false);
    expect(panel.state.plan!.problems).toEqual([]);
    // Its words are written again from what it now does (S7's stepWords).
    expect(panel.state.plan!.steps[0]!.words).not.toBe('The penguin waddles forward.');
    expect(within(plan).queryByText('The penguin waddles forward.')).toBeNull();
  });

  it('keeps the plan as shown and as agreed with its frame, in the build’s one step', async () => {
    const { production } = setUp(
      [proposes([step()], 'f2'), say("Here's the plan."), moves, say('Done.')],
      { world: WORLD },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin walk.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    await user.click(within(plan).getByRole('button', { name: 'Change step 1' }));
    const editor = await screen.findByRole('dialog', { name: 'Change step 1' });
    const times = within(editor).getByLabelText('How many times');
    await user.clear(times);
    await user.type(times, '2');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    const before = production.history().filter((h) => h.done).length;
    await user.click(screen.getByRole('button', { name: 'Build these steps' }));
    await waitFor(() =>
      expect(production.production().frames.find((f) => f.id === 'f2')?.plan).toBeTruthy(),
    );
    const kept = production.production().frames.find((f) => f.id === 'f2')!.plan!;
    expect(kept.shown).toMatchObject([{ actor: 'penguin', repeat: 1 }]);
    expect(kept.agreed).toMatchObject([{ actor: 'penguin', repeat: 2 }]);
    expect(Number.isNaN(Date.parse(kept.agreedAt))).toBe(false);
    expect(production.history().filter((h) => h.done)).toHaveLength(before + 1);
    // Undo takes the plan back with what it built.
    await user.click(screen.getByRole('button', { name: 'Undo this request' }));
    expect(production.production().frames.find((f) => f.id === 'f2')?.plan).toBeUndefined();
  });

  it('keeps no plan over the format’s limits, and builds all the same', () => {
    const p = exampleProduction();
    const long = Array.from({ length: 51 }, () => step());
    expect(keepFramePlan(p, { frame: frameId('f2'), shown: long, agreed: [step()] })).toBe(p);
    const kept = keepFramePlan(p, { frame: frameId('f2'), shown: [step()], agreed: [step()] });
    expect(kept.frames.find((f) => f.id === 'f2')?.plan?.agreed).toHaveLength(1);
  });

  it('adds no more than the 50 steps a frame keeps', async () => {
    // The Prompter proposes up to 12; the learner adds the rest.
    const { panel } = setUp(
      [proposes(Array.from({ length: 12 }, () => step())), say("Here's the plan.")],
      { world: WORLD },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin walk.');
    await screen.findByRole('grid', { name: 'Plan before change' });
    const add = screen.getByRole('button', { name: 'Add a step' });
    act(() => {
      for (let i = 12; i < 49; i++) panel.addStep(step());
    });
    expect(add.hasAttribute('disabled')).toBe(false);
    act(() => panel.addStep(step()));
    expect(panel.state.plan!.steps).toHaveLength(50);
    expect(add.hasAttribute('disabled')).toBe(true);
  });

  it('keeps a number’s value when its field is left empty', async () => {
    const { panel } = setUp(
      [
        proposes([
          step({
            details: [
              { name: 'direction', value: 'forward' },
              { name: 'amount', value: '2' },
            ],
          }),
        ]),
        say("Here's the plan."),
      ],
      { world: WORLD },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin walk.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    await user.click(within(plan).getByRole('button', { name: 'Change step 1' }));
    const editor = await screen.findByRole('dialog', { name: 'Change step 1' });
    await user.selectOptions(within(editor).getByLabelText('direction'), 'backward');
    await user.clear(within(editor).getByLabelText('amount'));
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps[0]!.details).toEqual([
      { name: 'direction', value: 'backward' },
      { name: 'amount', value: '2' },
    ]);
  });

  it('takes a step just added out again at Cancel', async () => {
    const { panel, onAnnounce } = setUp([proposes([step()]), say("Here's the plan.")], {
      world: WORLD,
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin walk.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    await user.click(screen.getByRole('button', { name: 'Add a step' }));
    const editor = await screen.findByRole('dialog', { name: 'Change step 2' });
    await user.click(within(editor).getByRole('button', { name: 'Cancel' }));
    expect(within(plan).getAllByRole('row')).toHaveLength(1);
    expect(panel.state.plan!.steps).toHaveLength(1);
    expect(said(onAnnounce)).toContain('Step 2 deleted.');
    // Cancel on a step that was there already leaves it.
    await user.click(within(plan).getByRole('button', { name: 'Change step 1' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Change step 1' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(panel.state.plan!.steps).toHaveLength(1);
  });

  it('leaves a say’s words to its script line when who says it changes', async () => {
    const { panel } = setUp(
      [
        proposes([
          step({
            words: 'The fox says its line.',
            actor: 'fox',
            action: 'say',
            line: 'l3',
            details: [],
          }),
        ]),
        say("Here's the plan."),
      ],
      { world: WORLD },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the fox speak.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    await user.click(within(plan).getByRole('button', { name: 'Change step 1' }));
    const editor = await screen.findByRole('dialog', { name: 'Change step 1' });
    await user.selectOptions(within(editor).getByLabelText('Who'), 'penguin');
    // The line gives the words: no empty words setting to fill (spec 04 section 6.3).
    expect(within(editor).queryByLabelText('words')).toBeNull();
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps[0]).toMatchObject({
      actor: 'penguin',
      action: 'say',
      line: 'l3',
    });
    expect(panel.state.plan!.steps[0]!.details.map((d) => d.name)).not.toContain('text');
    expect(panel.state.plan!.problems).toEqual([]);
  });

  /** Shows a plan of these steps, in a film with this program. */
  async function planned(steps: PlanStep[], production?: Production) {
    const set = setUp([proposes(steps), say("Here's the plan.")], {
      world: WORLD,
      ...(production ? { production } : {}),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin move.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    /** Opens Change step 1. */
    const open = async () => {
      await user.click(within(plan).getByRole('button', { name: 'Change step 1' }));
      return screen.findByRole('dialog', { name: 'Change step 1' });
    };
    return { ...set, user, plan, open };
  }
  const optionsOf = (select: HTMLElement) =>
    [...(select as HTMLSelectElement).options].map((o) => o.textContent);

  it('offers the learner’s own moves first, and changes a step to one (6.9)', async () => {
    const { user, plan, panel, open } = await planned([step()], ownMoves());
    const editor = await open();
    const what = within(editor).getByLabelText('Does what');
    const groups = [...what.querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(['Your own', 'Built in']);
    expect(optionsOf(what).slice(0, 2)).toEqual(['waddle', 'hug']);
    await user.selectOptions(what, 'waddle');
    // The input by its own name, never a built-in's word, and move's settings gone.
    const steps = within(editor).getByLabelText('steps');
    expect(within(editor).queryByLabelText('amount')).toBeNull();
    await user.clear(steps);
    await user.type(steps, '3');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps[0]).toMatchObject({
      actor: 'penguin',
      action: 'waddle',
      target: '',
      details: [{ name: 'steps', value: '3' }],
    });
    expect(panel.state.plan!.problems).toEqual([]);
    // Its words are the editors' own for the call, as Blocks and Tiles both word it (6.9).
    expect(panel.state.plan!.steps[0]!.words).toBe('Penguin waddle steps 3.');
    expect(within(plan).getByText('Penguin waddle steps 3.')).toBeTruthy();
  });

  it('chooses a move’s object as the step’s target, and drops it for a block with none', async () => {
    const { user, panel, open } = await planned([step()], ownMoves());
    // A hug of the fox, which isn't a Penguin.
    act(() => panel.changeStep(0, { action: 'hug', target: 'fox', details: [] }));
    expect(panel.state.plan!.problems).toHaveLength(1);
    let editor = await open();
    const who = within(editor).getByLabelText('who');
    // Only what fits the input, with the step's own kept in sight until it's changed.
    expect(optionsOf(who)).toEqual(['fox', 'penguin']);
    await user.selectOptions(who, 'penguin');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps[0]).toMatchObject({ action: 'hug', target: 'penguin' });
    // A block that acts on nothing: the target goes with the old block.
    editor = await open();
    await user.selectOptions(within(editor).getByLabelText('Does what'), 'waddle');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps[0]).toMatchObject({ action: 'waddle', target: '' });
    expect(panel.state.plan!.problems).toEqual([]);
  });

  it('shows a block that no longer resolves as not found, until it is changed', async () => {
    const { user, panel, open } = await planned([step()]);
    act(() => panel.changeStep(0, { action: 'waddle', details: [] }));
    expect(panel.state.plan!.problems).toHaveLength(1);
    const editor = await open();
    const what = within(editor).getByLabelText('Does what') as HTMLSelectElement;
    expect(what.value).toBe('waddle');
    expect(what.selectedOptions[0]!.textContent).toBe('waddle, not found');
    await user.selectOptions(what, 'move');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.problems).toEqual([]);
  });

  it('gives a change step its new value, to put right one with none', async () => {
    const { user, panel, open } = await planned([step()]);
    act(() => panel.changeStep(0, { kind: 'change', action: 'opacity', details: [] }));
    expect(panel.state.plan!.problems[0]!.message).toMatch(/needs the value/);
    const editor = await open();
    expect(within(editor).queryByLabelText('Does what')).toBeNull();
    await user.type(within(editor).getByLabelText('New opacity'), '0.5');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps[0]!.details).toEqual([{ name: 'opacity', value: '0.5' }]);
    expect(panel.state.plan!.problems).toEqual([]);
  });

  it('offers the scene as a change step’s vehicle by the name the build takes', async () => {
    // The build's set_property takes "scene" for riding on nothing, and refuses "this" (S7's
    // review of #651).
    const { user, panel, open } = await planned([step()]);
    act(() => panel.changeStep(0, { kind: 'change', action: 'vehicle', details: [] }));
    const editor = await open();
    const vehicle = within(editor).getByLabelText('New vehicle') as HTMLSelectElement;
    const values = [...vehicle.options].map((o) => o.value);
    expect(values).toContain('scene');
    expect(values).not.toContain('this');
    await user.selectOptions(vehicle, 'scene');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps[0]!.details).toEqual([{ name: 'vehicle', value: 'scene' }]);
    expect(panel.state.plan!.problems).toEqual([]);
  });

  it('gives a when step what it meets and its number, to put either right', async () => {
    const { user, panel, open } = await planned([step()]);
    act(() =>
      panel.changeStep(0, { kind: 'when', action: 'proximityEnter', target: '', details: [] }),
    );
    expect(panel.state.plan!.problems[0]!.message).toMatch(/two objects/);
    let editor = await open();
    expect((within(editor).getByLabelText('Who') as HTMLSelectElement).value).toBe('penguin');
    await user.selectOptions(within(editor).getByLabelText('And what it meets'), 'fox');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.problems[0]!.message).toMatch(/needs a value for distance/);
    editor = await open();
    await user.type(within(editor).getByLabelText('distance'), '2');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps[0]).toMatchObject({
      target: 'fox',
      details: [{ name: 'distance', value: '2' }],
    });
    expect(panel.state.plan!.problems).toEqual([]);
  });

  it('adds a step at the end, to change from there', async () => {
    const { panel, onAnnounce } = setUp([proposes([step()]), say("Here's the plan.")], {
      world: WORLD,
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin walk.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    await user.click(screen.getByRole('button', { name: 'Add a step' }));
    expect(within(plan).getAllByRole('row')).toHaveLength(2);
    const editor = await screen.findByRole('dialog', { name: 'Change step 2' });
    await user.selectOptions(within(editor).getByLabelText('Who'), 'fox');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps[1]).toMatchObject({ kind: 'do', actor: 'fox', why: '' });
    // Saved, it stays.
    expect(within(plan).getAllByRole('row')).toHaveLength(2);
    expect(said(onAnnounce)).toContain('Step 2 added.');
  });

  it('shows a repeat’s steps inside it, and changes how many times and which (6.8)', async () => {
    const repeat = step({
      kind: 'repeat',
      words: 'Repeat 3 times:',
      actor: '',
      action: '',
      repeat: 3,
      holds: 2,
      why: 'So she hops three times.',
    });
    const up = step({ words: 'The penguin moves up.' });
    const down = step({ words: 'The penguin moves down.' });
    const { panel, onAnnounce } = setUp(
      [proposes([repeat, up, down, step({ actor: 'fox' })]), say("Here's the plan.")],
      { world: WORLD },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin hop three times.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    expect(panel.state.plan!.problems).toEqual([]);
    // Named for screen readers as spec 04 section 6.8 has it; held steps indented.
    const rows = within(plan).getAllByRole('row');
    expect(rows.map((r) => r.getAttribute('data-inside'))).toEqual([null, 'true', 'true', null]);
    expect(
      within(plan).getByRole('row', { name: 'Step 1: Repeat 3 times, holding steps 2 and 3' }),
    ).toBeTruthy();
    expect(within(plan).getByRole('row', { name: /^Step 2, inside the repeat: / })).toBeTruthy();
    expect(within(plan).getByRole('row', { name: /^Step 4: / })).toBeTruthy();

    // Change step on the repeat: How many times and Steps inside, with which steps listed.
    await user.click(within(plan).getByRole('button', { name: 'Change step 1' }));
    const editor = await screen.findByRole('dialog', { name: 'Change step 1' });
    const times = within(editor).getByRole('spinbutton', { name: 'How many times' });
    const inside = within(editor).getByRole('spinbutton', { name: /^Steps inside/ });
    expect(times).toHaveProperty('value', '3');
    expect(inside).toHaveProperty('value', '2');
    expect(inside.getAttribute('max')).toBe('3');
    expect(within(editor).getByText('Repeats steps 2 and 3.')).toBeTruthy();
    expect(within(editor).queryByRole('checkbox')).toBeNull();
    await user.clear(inside);
    await user.type(inside, '3');
    expect(within(editor).getByText('Repeats steps 2 to 4.')).toBeTruthy();
    await user.clear(times);
    await user.type(times, '5');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps[0]).toMatchObject({ kind: 'repeat', repeat: 5, holds: 3 });
    expect(panel.state.plan!.heldBy).toEqual([null, 0, 0, 0]);
    expect(said(onAnnounce)).toContain('Step 1 changed');

    // A step inside repeats with it: no How many times of its own; the first isn't together.
    await user.click(within(plan).getByRole('button', { name: 'Change step 2' }));
    const held = await screen.findByRole('dialog', { name: 'Change step 2' });
    expect(within(held).queryByRole('spinbutton', { name: 'How many times' })).toBeNull();
    expect(
      within(held).getByRole('checkbox', { name: 'At the same time as the step before' }),
    ).toHaveProperty('disabled', true);
    await user.click(within(held).getByRole('button', { name: 'Cancel' }));

    // Deleting the steps inside one by one: the last takes the repeat with it, and says so.
    for (let k = 0; k < 3; k++)
      await user.click(within(plan).getByRole('button', { name: 'Delete step 2' }));
    // It held all three since Save, so nothing is left.
    expect(panel.state.plan!.steps).toEqual([]);
    expect(said(onAnnounce)).toContain('The repeat had no steps left');
  });

  it('puts a repeat around the last step at Repeat…, and Cancel takes it out (6.8)', async () => {
    const { panel, onAnnounce } = setUp(
      [proposes([step(), step({ actor: 'fox' })]), say("Here's the plan.")],
      { world: WORLD },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make them walk.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    const repeat = () => screen.getByRole('button', { name: 'Add a repeat around the last step' });
    await user.click(repeat());
    const editor = await screen.findByRole('dialog', { name: 'Change step 2' });
    expect(within(editor).getByText('Repeats step 3.')).toBeTruthy();
    await user.click(within(editor).getByRole('button', { name: 'Cancel' }));
    expect(panel.state.plan!.steps.map((x) => x.kind)).toEqual(['do', 'do']);

    await user.click(repeat());
    const again = await screen.findByRole('dialog', { name: 'Change step 2' });
    await user.click(within(again).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps.map((x) => x.kind)).toEqual(['do', 'repeat', 'do']);
    expect(
      within(plan).getByRole('row', { name: 'Step 2: Repeat 2 times, holding step 3' }),
    ).toBeTruthy();
    expect(said(onAnnounce)).toContain('Step 2 added.');
    // The last step is held now, so Repeat… isn't offered again.
    expect(screen.queryByRole('button', { name: 'Add a repeat around the last step' })).toBeNull();
  });

  it('says so when Repeat… unticks At the same time, and Cancel puts it back (S7, #632)', async () => {
    const { panel, onAnnounce } = setUp(
      [proposes([step(), step({ actor: 'fox', together: true })]), say("Here's the plan.")],
      { world: WORLD },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make them walk together.');
    await screen.findByRole('grid', { name: 'Plan before change' });
    await user.click(screen.getByRole('button', { name: 'Add a repeat around the last step' }));
    expect(panel.state.plan!.steps[2]).toMatchObject({ together: false });
    expect(said(onAnnounce)).toContain(
      "Step 2 added. Change it to say what it does. The first step inside a repeat can't happen at the same time as the step before it, so now it doesn't.",
    );
    const editor = await screen.findByRole('dialog', { name: 'Change step 2' });
    await user.click(within(editor).getByRole('button', { name: 'Cancel' }));
    expect(panel.state.plan!.steps[1]).toMatchObject({ together: true });
  });

  it('lets At the same time be unticked on the first step inside a repeat (S7, #629)', async () => {
    const { panel } = setUp(
      [proposes([step(), step({ actor: 'fox', together: true })]), say("Here's the plan.")],
      { world: WORLD },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make them walk together.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    // As a plan can have it, whichever edit left it so: a together step first inside a repeat.
    act(() => {
      panel.addRepeat();
      panel.changeStep(2, { together: true });
    });
    expect(panel.state.plan!.problems).toHaveLength(1);
    await user.click(within(plan).getByRole('button', { name: 'Change step 3' }));
    const editor = await screen.findByRole('dialog', { name: 'Change step 3' });
    const box = within(editor).getByRole('checkbox', {
      name: 'At the same time as the step before',
    });
    expect(box).toHaveProperty('disabled', false);
    await user.click(box);
    expect(box).toHaveProperty('checked', false);
    // It keeps keyboard focus, so Tab goes on to Save from there.
    expect(box).toHaveProperty('disabled', false);
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(panel.state.plan!.steps[2]).toMatchObject({ together: false });
    expect(panel.state.plan!.problems).toEqual([]);
  });

  it('says where a step landed when its repeat went with the move (S7, #629)', async () => {
    const repeat = step({
      kind: 'repeat',
      words: 'Repeat 2 times:',
      actor: '',
      action: '',
      repeat: 2,
      holds: 1,
    });
    const { panel, onAnnounce } = setUp(
      [
        proposes([repeat, step(), step({ actor: 'fox' }), step({ actor: 'fox' })]),
        say("Here's the plan."),
      ],
      { world: WORLD },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make them walk.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    // From the keyboard: down to step 2, right to its handle, and on to the plan's end.
    act(() => within(plan).getAllByRole('row')[0]!.focus());
    await user.keyboard('{ArrowDown}{ArrowRight}{Enter}');
    const at = () => document.activeElement?.getAttribute('aria-label') ?? '';
    await waitFor(() => expect(at()).toMatch(/^Insert/));
    for (let i = 0; i < 6 && !at().startsWith('Insert after Step 4'); i++)
      await user.keyboard('{ArrowDown}');
    expect(at()).toMatch(/^Insert after Step 4/);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(panel.state.plan!.steps).toHaveLength(3));
    expect(said(onAnnounce)).toContain('Step 2 moved to 3. The repeat had no steps left');
  });

  it('drops a plan not yet built, at Undo this request', async () => {
    const { onAnnounce } = setUp([proposes([step()]), say("Here's the plan.")]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Build it' }));
    await ask('Make the penguin walk.');
    await screen.findByRole('grid', { name: 'Plan before change' });
    await user.click(screen.getByRole('button', { name: 'Undo this request' }));
    expect(screen.queryByRole('grid', { name: 'Plan before change' })).toBeNull();
    expect(said(onAnnounce)).toContain('The plan is gone. Nothing was built.');
  });

  it('never offers Build these steps at Plan only', async () => {
    setUp([proposes([step()]), say("Here's the plan.")], { level: 'planOnly' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin walk.');
    await screen.findByRole('grid', { name: 'Plan before change' });
    expect(screen.queryByRole('button', { name: 'Build these steps' })).toBeNull();
    expect(
      within(aside()).getByText('Build these steps yourself in the Code editor.'),
    ).toBeTruthy();
  });

  it('ticks off at Plan only the steps the learner builds, and says so once all are (6.6)', async () => {
    // Frame f2 links the fox's line, so the fox's step is done as the plan is shown.
    const fox = step({
      words: 'The fox says line 3.',
      actor: 'fox',
      action: 'say',
      details: [],
      line: 'l3',
    });
    const { production, onAnnounce } = setUp(
      [proposes([fox, step()], 'f2'), say("Here's the plan.")],
      { level: 'planOnly' },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin walk.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    expect(
      await within(plan).findByRole('row', { name: 'Step 1, done: The fox says line 3.' }),
    ).toBeTruthy();
    expect(within(plan).getByRole('row', { name: /^Step 2: The penguin/ })).toBeTruthy();
    expect(within(aside()).getByText('1 of 2 built')).toBeTruthy();
    expect(production.production().frames.find((f) => f.id === 'f2')?.plan?.done).toEqual([1]);
    expect(said(onAnnounce)).not.toContain('All the steps are built.');

    // The learner adds the penguin's move to scene 2's method.
    const move = {
      id: nodeId('lmove1'),
      kind: 'call',
      target: {
        id: nodeId('ltarg1'),
        kind: 'fieldRef',
        target: { id: nodeId('lthis1'), kind: 'this' },
        field: nodeId('scene2p'),
      },
      callee: { kind: 'story', name: 'move' },
      args: {
        direction: {
          id: nodeId('ldir01'),
          kind: 'enum',
          type: 'MoveDirection',
          value: 'forward',
        },
        amount: { id: nodeId('lamt01'), kind: 'number', value: 1 },
      },
      details: {},
    } as unknown as Statement;
    act(() => {
      production.apply(
        [
          {
            kind: 'insert',
            label: 'Add move',
            parent: nodeId('scene2m'),
            slot: 'body',
            index: 1,
            node: move,
          },
        ],
        'Add move',
        'blocks',
      );
    });
    expect(
      await within(plan).findByRole('row', { name: /^Step 2, done: The penguin/ }),
    ).toBeTruthy();
    expect(within(aside()).getByText('2 of 2 built')).toBeTruthy();
    expect(production.production().frames.find((f) => f.id === 'f2')?.plan?.done).toEqual([1, 2]);
    expect(said(onAnnounce).split('All the steps are built.')).toHaveLength(2);
    // Undo takes the block back, not the keep, and the tick goes with it.
    act(() => {
      production.undo();
    });
    expect(await within(plan).findByRole('row', { name: /^Step 2: The penguin/ })).toBeTruthy();
    expect(production.production().frames.find((f) => f.id === 'f2')?.plan?.done).toEqual([1]);
  });

  it('marks a step that cannot be built, and waits for it to be changed or deleted', async () => {
    const { panel } = setUp([proposes([step()]), say("Here's the plan.")]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await ask('Make the penguin walk.');
    const plan = await screen.findByRole('grid', { name: 'Plan before change' });
    expect(screen.getByRole('button', { name: 'Build these steps' })).toBeTruthy();
    // The step changed to an owl the scene hasn't got.
    act(() => panel.changeStep(0, { actor: 'owl' }));
    expect(within(plan).getByRole('row').textContent).toMatch(/owl/i);
    expect(screen.queryByRole('button', { name: 'Build these steps' })).toBeNull();
    expect(
      within(aside()).getByText('Change or delete the steps marked before building.'),
    ).toBeTruthy();
  });

  it('asks for the current frame at Code this frame', async () => {
    const { sent } = setUp([proposes([step()]), say("Here's the plan.")]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await user.click(screen.getByRole('button', { name: 'Code frame 2.1' }));
    await screen.findByRole('grid', { name: 'Plan before change' });
    expect(JSON.stringify(sent[0])).toContain('Code frame f2-1.');
  });
});

describe('the Prompter panel: Stop and problems (spec 04 section 7)', () => {
  it('shows what went wrong, and Try again asks again', async () => {
    const { sent } = setUp([
      [{ type: 'error', code: 'overloaded' }],
      say('A count repeats the blocks inside it.'),
    ]);
    await ask('What does count do?');
    await screen.findByText('Claude is having trouble right now. Try again in a minute.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('A count repeats the blocks inside it.');
    expect(sent).toHaveLength(2);
  });

  it('Try again repeats Code this frame for the same frame, as the panel sent it', async () => {
    const { sent } = setUp([
      [{ type: 'error', code: 'overloaded' }],
      proposes([step()]),
      say("Here's the plan."),
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Show me how' }));
    await user.click(screen.getByRole('button', { name: 'Code frame 2.1' }));
    await screen.findByText('Claude is having trouble right now. Try again in a minute.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('grid', { name: 'Plan before change' });
    expect(sent).toHaveLength(3);
    expect(JSON.stringify(sent[1])).toContain('Code frame f2-1.');
  });

  it('starts a new conversation', async () => {
    setUp([say('A count repeats the blocks inside it.')]);
    await ask('What does count do?');
    await screen.findByText('A count repeats the blocks inside it.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByText('A count repeats the blocks inside it.')).toBeNull();
    expect(within(aside()).getByText(/Ask about your film/)).toBeTruthy();
  });

  it('folds to its rail and back', async () => {
    setUp([]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Hide the Prompter' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show the Prompter' }));
    expect(screen.getByRole('textbox', { name: 'Ask the Prompter' })).toBeTruthy();
  });
});

describe('the Prompter in the studio', () => {
  it('is in every build but the browser version (decision 0022)', () => {
    expect(prompterInBuild(browserHost)).toBe(false);
    expect(prompterInBuild({ version: '1.0.0', prompter: offTransport })).toBe(true);
    expect(prompterInBuild({ version: null, prompter: scriptedTransport(() => []) })).toBe(true);
  });

  it('takes the pupil’s level from the day’s count, the policy’s until the cap lowers it', async () => {
    const policy = {
      ...browserHost.policy,
      prompter: { ...browserHost.policy.prompter, level: 'full' as const },
    };
    const usage = {
      today: async () => ({
        date: '2026-11-17',
        level: 'full' as const,
        dailyCap: 20,
        capAction: 'explainOnly' as const,
        entries: [{ pupil: 'pupil-ava', used: 20, level: 'explainOnly' as const }],
      }),
    };
    expect(await levelNow({ policy, prompterUsage: usage }, 'pupil-ava' as never)).toBe(
      'explainOnly',
    );
    expect(await levelNow({ policy, prompterUsage: usage }, 'pupil-ben' as never)).toBe('full');
    expect(await levelNow({ policy, prompterUsage: null }, null)).toBe('full');
    const broken = { today: () => Promise.reject(new Error('no native layer')) };
    expect(await levelNow({ policy, prompterUsage: broken }, null)).toBe('full');
  });

  it('reads one step moved, by drag or keyboard, as from and to', () => {
    const ids = (s: string) => s.split('').map((id) => ({ id }));
    expect(oneMove(ids('abcd'), ids('bcad'))).toEqual({ from: 0, to: 2 });
    expect(oneMove(ids('abcd'), ids('adbc'))).toEqual({ from: 3, to: 1 });
    expect(oneMove(ids('abcd'), ids('abcd'))).toBeNull();
  });

  it('moves a repeat with the steps it holds, to its place among the others (6.8)', () => {
    // Steps R a b c d, with R holding a and b: dragged to the end, it goes after c and d.
    expect(repeatMove(5, 0, 2, 4)).toBe(2);
    // Dropped among its own steps, it stays where it was.
    expect(repeatMove(5, 0, 2, 1)).toBe(0);
    // Steps a R b c, with R holding b: to the top, then to the end.
    expect(repeatMove(4, 1, 1, 0)).toBe(0);
    expect(repeatMove(4, 1, 1, 3)).toBe(2);
  });
});
