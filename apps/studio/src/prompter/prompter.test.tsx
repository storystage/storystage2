import { browserHost } from '@storystage/host';
import { ProductionSession, exampleProduction, frameId, sceneId } from '@storystage/production';
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
import type { StudioSource } from '../studio.ts';
import { PrompterAside, oneMove } from './PrompterAside.tsx';
import type { StepWorld } from './StepEditor.tsx';
import type { ApiClass } from '@storystage/story-api';
import { levelNow, prompterInBuild } from './usePrompter.ts';

// The Prompter panel as the studio draws it (07-ux section 2.4; spec 04 section 4.5, WP13c), on
// S7's panel with scripted replies: what each state shows, and what each control does.

const step = (s: Partial<PlanStep> = {}): PlanStep => ({
  words: 'The penguin waddles forward.',
  kind: 'do',
  actor: 'penguin',
  action: 'move',
  target: '',
  details: [],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
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
const proposes = (steps: PlanStep[]) => testReply([toolUse('t1', 'propose_plan', { steps })]);
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

/** The example's scene 2, as the Production stage gives it for changing steps. */
const WORLD: StepWorld = {
  objects: new Map<string, ApiClass>([
    ['this', 'Scene'],
    ['penguin', 'Flyer'],
    ['fox', 'Quadruped'],
  ]),
  lines: [],
};

interface Options {
  readonly level?: PrompterLevel;
  readonly status?: TransportStatus;
  readonly readOnly?: boolean;
  readonly world?: StepWorld;
}

function setUp(replies: PrompterEvent[][], options: Options = {}) {
  let next = 0;
  const scripted = scriptedTransport(() => replies[next++] ?? say('No more.'));
  const production = new ProductionSession<StudioSource>(exampleProduction(), {
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
      proposes([step(), step({ words: 'The penguin waves.', action: 'turn' })]),
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
    expect(said(onAnnounce)).toContain('Step 2 added.');
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
});
