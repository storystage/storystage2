import type { EditorHost, ViewState } from '@storystage/editor-contract';
import { BROWSER_POLICY, browserHost, type HostInterface } from '@storystage/host';
import { exampleProduction, withSound, type Production } from '@storystage/production';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { newProduction } from '../storyboard/edits.ts';
import { NEW_EVENTS, eventWords } from './newMethodEdits.ts';
import { playedInScene2, RAIN } from '../sound/testing.ts';

// Blockly can't draw in a test DOM: a stand-in Blocks editor records what it is given. The real
// one is checked in a browser (e2e/production.e2e.ts).
const mounted: { method: string | null; host: EditorHost }[] = [];
const palettes: { target: unknown; tab: string }[] = [];
let ask: ((request: unknown) => Promise<unknown>) | undefined;
/** The film's sound words the stand-in was given (7.17). */
let soundWords: {
  references?: (type: string) => readonly { value: string; words: string }[];
  referenceWord?: (type: string, value: string) => string | undefined;
} = {};
vi.mock('@storystage/blocks', () => ({
  createBlocksEditor: (
    options: { ask?: (request: unknown) => Promise<unknown> } & typeof soundWords = {},
  ) => ({
    ...((ask = options.ask), (soundWords = options), {}),
    id: 'blocks',
    displayName: 'Blocks',
    mount: (element: HTMLElement, host: EditorHost, view?: ViewState) => {
      element.textContent = 'blocks';
      mounted.push({ method: view?.method ?? null, host });
    },
    unmount: () => ({ method: null, selection: [], focus: null }),
    openMethod: () => {},
    setPalette: (target: unknown, tab: string) => palettes.push({ target, tab }),
    highlight: () => {},
    focus: () => {},
    selection: () => [],
    command: () => false,
  }),
}));

beforeEach(() => {
  mounted.length = 0;
  palettes.length = 0;
  ask = undefined;
  soundWords = {};
});

/** The Blocks editor loads on demand: under a full run's load that can take a few seconds. */
const LOADED = { timeout: 5000 };

const openStage = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('tab', { name: /Production stage/ }));

/** The example with scene 1's heading taken away and its frames gone. */
function unplanned(): Production {
  const p = exampleProduction();
  const s1 = p.scenes[0]!.id;
  return {
    ...p,
    storyboard: {
      ...p.storyboard,
      cards: p.storyboard.cards.map((c) => (c.id === s1 ? { ...c, heading: '' } : c)),
    },
    frames: p.frames.filter((f) => f.scene !== s1),
    script: p.script.map((l) => (l.scene === s1 ? { ...l, pinnedFrame: null } : l)),
  };
}

describe('the Production stage’s Code editor (7.2, 07-ux 7.3)', () => {
  it('opens the current scene’s methods, one tab each, in the Blocks editor', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await openStage(user);
    const tabs = within(screen.getByRole('tablist', { name: 'Methods in scene 1' })).getAllByRole(
      'tab',
    );
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('blocks', {}, LOADED)).toBeTruthy();
    const p = exampleProduction();
    expect(mounted.at(-1)!.method).toBe(p.scenes[0]!.method);
  });

  it('follows the scene chosen in the Storyboard', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    const scenes = within(screen.getByRole('grid', { name: 'Scenes' })).getAllByRole('row');
    await user.click(scenes[1]!);
    await openStage(user);
    expect(screen.getByRole('tablist', { name: 'Methods in scene 2' })).toBeTruthy();
    await screen.findByText('blocks', {}, LOADED);
    expect(mounted.at(-1)!.method).toBe(exampleProduction().scenes[1]!.method);
  });

  it('stays closed until the scene is storyboarded, and says what is left', async () => {
    const user = userEvent.setup();
    render(<App start={unplanned()} />);
    await openStage(user);
    expect(screen.getByRole('heading', { name: 'Storyboard scene 1 first' })).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'Logline and synopsisDone',
      'A heading for scene 1To do',
      'At least one frameTo do',
    ]);
    expect(screen.queryByRole('tablist', { name: /^Methods/ })).toBeNull();
    expect(mounted).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Go to the Storyboard' }));
    expect(screen.getByRole('tab', { name: /Storyboard/, selected: true })).toBeTruthy();
  });

  describe('an imported Alice world (10.8; policy storyboard.allowImportedWithoutStoryboard)', () => {
    const alice = (): Production => {
      const p = unplanned();
      return { ...p, manifest: { ...p.manifest, origin: 'alice' } };
    };
    const allowing = (allow: boolean): HostInterface => ({
      ...browserHost,
      policy: { ...BROWSER_POLICY, storyboard: { allowImportedWithoutStoryboard: allow } },
    });

    it('opens its Code editor before it is storyboarded, when the school allows it', async () => {
      const user = userEvent.setup();
      render(<App start={alice()} host={allowing(true)} />);
      await openStage(user);
      expect(screen.queryByRole('heading', { name: 'Storyboard scene 1 first' })).toBeNull();
      expect(await screen.findByRole('tablist', { name: /^Methods/ }, LOADED)).toBeTruthy();
    });

    it('keeps the rule otherwise, and for a world made in StoryStage', async () => {
      const user = userEvent.setup();
      const { unmount } = render(<App start={alice()} host={allowing(false)} />);
      await openStage(user);
      expect(screen.getByRole('heading', { name: 'Storyboard scene 1 first' })).toBeTruthy();
      unmount();
      render(<App start={unplanned()} host={allowing(true)} />);
      await openStage(user);
      expect(screen.getByRole('heading', { name: 'Storyboard scene 1 first' })).toBeTruthy();
    });
  });

  it('asks for a scene when there is none', async () => {
    const user = userEvent.setup();
    render(<App start={newProduction()} />);
    await openStage(user);
    expect(screen.getByText('Add a scene in the Storyboard to start coding it.')).toBeTruthy();
  });

  it('gives the editor a host on the same history as the Storyboard', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await openStage(user);
    await screen.findByText('blocks', {}, LOADED);
    const { host } = mounted.at(-1)!;
    const node = host.program().types[0]!.methods[0]!.body[0]!.id;
    host.apply(
      [{ kind: 'setEnabled', node, enabled: false, label: 'Switch it off' }],
      'Switch it off',
      'blocks',
    );
    await user.click(screen.getByRole('tab', { name: /Storyboard/ }));
    expect(screen.getByRole('button', { name: /^Undo/ }).textContent).toBe('Undo: Switch it off');
  });

  it('offers blocks for the scene or one of its objects, as actions or questions', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await openStage(user);
    await screen.findByText('blocks', {}, LOADED);
    expect(palettes.at(-1)).toMatchObject({ tab: 'actions', target: { kind: 'this' } });
    await user.click(screen.getByRole('button', { name: /Blocks for/ }));
    // The object picker's choices, not the frame strip's cards or the scene's objects list.
    const picker = () =>
      screen
        .getAllByRole('option')
        .filter((o) => !o.closest('.ss-frame-strip') && !o.closest('.pr-objects'));
    const options = picker().map((o) => o.textContent);
    expect(options[0]).toBe('the scene');
    expect(options.length).toBeGreaterThan(1);
    await user.click(picker()[1]!);
    expect(palettes.at(-1)).toMatchObject({ tab: 'actions', target: { kind: 'fieldRef' } });
    await user.click(screen.getByRole('radio', { name: 'Questions' }));
    expect(palettes.at(-1)).toMatchObject({ tab: 'questions' });
  });

  it('asks for a dropped block’s values with Tiles’ menus, and gives back the answer', async () => {
    const user = userEvent.setup();
    const p = exampleProduction();
    render(<App start={p} />);
    await openStage(user);
    await screen.findByText('blocks', {}, LOADED);
    const method = p.program.types
      .flatMap((t) => t.methods)
      .find((m) => m.id === p.scenes[0]!.method)!;
    const say = method.body[0]!;
    let answer: unknown = 'none yet';
    act(() => {
      void ask!({
        program: p.program,
        place: { kind: 'value', node: say.id, slot: 'args', param: 'text' },
        label: 'words',
        anchor: screen.getByText('blocks'),
      }).then((value) => (answer = value));
    });
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: /Other words/ }));
    const field = await screen.findByRole('textbox');
    await user.type(field, 'Hello there{Enter}');
    await waitFor(() => expect(answer).toMatchObject({ kind: 'text', value: 'Hello there' }));
  });

  it('offers the film’s sounds by name for a block’s sound, and gives Blocks their names (7.17)', async () => {
    const user = userEvent.setup();
    const p = playedInScene2(withSound(exampleProduction(), RAIN), 'sn1');
    render(<App start={p} />);
    await openStage(user);
    await screen.findByText('blocks', {}, LOADED);
    expect(soundWords.references?.('Audio')).toEqual([{ value: 'sn1', words: 'Rain' }]);
    expect(soundWords.referenceWord?.('Audio', 'sn1')).toBe('Rain');
    expect(soundWords.referenceWord?.('SceneId', 'sn1')).toBeUndefined();
    let answer: unknown = 'none yet';
    act(() => {
      void ask!({
        program: p.program,
        place: { kind: 'value', node: 'playsd', slot: 'args', param: 'audioSource' },
        label: 'sound',
        anchor: screen.getByText('blocks'),
      }).then((value) => (answer = value));
    });
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: 'Rain' }));
    await waitFor(() => expect(answer).toMatchObject({ kind: 'text', value: 'sn1' }));
  });

  it('cancels the drop when the learner presses Escape at a question', async () => {
    const user = userEvent.setup();
    const p = exampleProduction();
    render(<App start={p} />);
    await openStage(user);
    await screen.findByText('blocks', {}, LOADED);
    const say = p.program.types.flatMap((t) => t.methods).find((m) => m.id === p.scenes[0]!.method)!
      .body[0]!;
    let answer: unknown = 'none yet';
    act(() => {
      void ask!({
        program: p.program,
        place: { kind: 'value', node: say.id, slot: 'args', param: 'text' },
        label: 'words',
        anchor: screen.getByText('blocks'),
      }).then((value) => (answer = value));
    });
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(answer).toBeNull());
  });

  it('shows the method as text beside the code, in the wording chosen, kept on this device', async () => {
    window.localStorage.removeItem('storystage.textView');
    const user = userEvent.setup();
    const p = exampleProduction();
    // The scene's script method is named for when it runs (the owner, 21 Nov).
    const named = 'Text of When the scene starts';
    const { unmount } = render(<App start={p} />);
    await openStage(user);
    expect(screen.getByRole('tab', { name: 'When the scene starts', selected: true })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'myFirstMethod' })).toBeNull();
    expect(screen.queryByRole('region', { name: named })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Text wording' })).toBeNull();
    await user.click(screen.getByRole('switch', { name: 'Show as text' }));
    const text = screen.getByRole('region', { name: named });
    // Python-like first. The code keeps Alice's name for the method.
    expect(text.textContent).toContain('myFirstMethod');
    expect(text.textContent).toContain('penguin.say(');
    expect(text.textContent).not.toContain('this.penguin');
    await user.click(screen.getByRole('radio', { name: 'Java-like' }));
    await waitFor(() => expect(text.textContent).toContain('this.penguin.say('));
    unmount();
    // The choice is kept on this device.
    render(<App start={p} />);
    await openStage(user);
    expect(screen.getByRole('switch', { name: 'Show as text' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: 'Java-like' })).toHaveProperty('checked', true);
    expect(screen.getByRole('region', { name: named }).textContent).toContain('this.penguin.say(');
    window.localStorage.removeItem('storystage.textView');
  });

  it('adds a procedure, a function and a listener by New, each opening its tab, each one undo step', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await openStage(user);
    const newIn = () => screen.getByRole('button', { name: 'New in scene 1' });
    const undo = () =>
      within(screen.getByRole('toolbar', { name: 'Undo and redo' })).getByRole('button', {
        name: /^Undo/,
      });

    // A procedure, named in the dialog; a name that won't do says why.
    await user.click(newIn());
    await user.click(screen.getByRole('menuitem', { name: 'Procedure…' }));
    const dialog = screen.getByRole('dialog', { name: 'New procedure' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveProperty('value', 'newProcedure');
    await user.clear(name);
    await user.type(name, 'walk to door');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(name.getAttribute('aria-describedby')!.split(' ')[0]!)?.textContent,
    ).toMatch(/no spaces/);
    // Nor will one of a scene's own blocks: a plan would take it to mean that block (S6).
    await user.clear(name);
    await user.type(name, 'delay{Enter}');
    expect(
      within(dialog).getByText('Scenes already have a block called delay. Choose another name.'),
    ).toBeTruthy();
    await user.clear(name);
    await user.type(name, 'walkToTheDoor{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('tab', { name: 'walkToTheDoor' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    await waitFor(() => expect(undo().textContent).toBe('Undo: Add procedure walkToTheDoor'));

    // A function, giving back text.
    await user.click(newIn());
    await user.click(screen.getByRole('menuitem', { name: 'Function…' }));
    const fn = screen.getByRole('dialog', { name: 'New function' });
    await user.click(within(fn).getByRole('radio', { name: 'Text' }));
    await user.click(within(fn).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('tab', { name: 'newFunction' }).getAttribute('aria-selected')).toBe(
      'true',
    );

    // A listener, straight from the menu.
    const event = NEW_EVENTS[0]!;
    await user.click(newIn());
    expect(screen.queryByRole('menuitem', { name: eventWords('sceneStart') })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: eventWords(event) }));
    await waitFor(() =>
      expect(
        screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')
          ?.textContent,
      ).not.toBe('newFunction'),
    );
    await waitFor(() => expect(undo().textContent).toBe(`Undo: Add “${eventWords(event)}”`));

    // Each was one step: three undos take all three away.
    for (let i = 0; i < 3; i++) await user.click(undo());
    expect(screen.queryByRole('tab', { name: 'walkToTheDoor' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'newFunction' })).toBeNull();
  });

  it('gives a procedure inputs, in New and from its Inputs menu, each one undo step (7.14)', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await openStage(user);
    const undo = () =>
      within(screen.getByRole('toolbar', { name: 'Undo and redo' })).getByRole('button', {
        name: /^Undo/,
      });
    // The scene's script takes no inputs, so it has no Inputs menu.
    expect(screen.queryByRole('button', { name: /^Inputs of/ })).toBeNull();

    // New: a procedure with an input, "parameter" in brackets where inputs are first offered.
    await user.click(screen.getByRole('button', { name: 'New in scene 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Procedure…' }));
    const dialog = screen.getByRole('dialog', { name: 'New procedure' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'waddle');
    await user.click(within(dialog).getByRole('button', { name: 'Add an input (parameter)…' }));
    const input = within(dialog).getByRole('textbox', { name: 'Name of input 1' });
    expect(input).toHaveProperty('value', 'input1');
    await user.clear(input);
    await user.type(input, 'steps');
    const holds = within(dialog).getByRole('radiogroup', { name: 'What input 1 holds' });
    await user.click(within(holds).getByRole('radio', { name: 'A whole number' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('tab', { name: 'waddle' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(undo().textContent).toBe('Undo: Add procedure waddle with steps'));

    // Its Inputs menu: add a second, then rename and remove it, each one step.
    const menu = () => screen.getByRole('button', { name: 'Inputs of waddle' });
    await user.click(menu());
    expect(screen.getByRole('group', { name: 'steps: whole number' })).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: 'Add an input (parameter)…' }));
    const adding = screen.getByRole('dialog', { name: 'New input for waddle' });
    const named = within(adding).getByRole('textbox', { name: 'Name' });
    await user.clear(named);
    await user.type(named, 'steps');
    await user.click(within(adding).getByRole('button', { name: 'Add' }));
    // A name the method has already says why.
    expect(named.getAttribute('aria-invalid')).toBe('true');
    await user.clear(named);
    await user.type(named, 'height{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(undo().textContent).toBe('Undo: Add input height to waddle'));

    await user.click(menu());
    const height = screen.getByRole('group', { name: 'height: number' });
    await user.click(within(height).getByRole('menuitem', { name: 'Rename input…' }));
    const renaming = screen.getByRole('dialog', { name: 'Rename input height' });
    const renamed = within(renaming).getByRole('textbox', { name: 'Name' });
    await user.clear(renamed);
    await user.type(renamed, 'hop{Enter}');
    await waitFor(() => expect(undo().textContent).toBe('Undo: Rename input height to hop'));

    await user.click(menu());
    const hop = screen.getByRole('group', { name: 'hop: number' });
    await user.click(within(hop).getByRole('menuitem', { name: 'Remove input…' }));
    await waitFor(() => expect(undo().textContent).toBe('Undo: Remove input hop from waddle'));

    // Undo, step by step: hop back, its old name, then height gone, then waddle gone.
    await user.click(undo());
    await user.click(undo());
    await user.click(undo());
    await user.click(menu());
    expect(screen.queryByRole('group', { name: /^height|^hop/ })).toBeNull();
    expect(screen.getByRole('group', { name: 'steps: whole number' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await user.click(undo());
    expect(screen.queryByRole('tab', { name: 'waddle' })).toBeNull();
  });

  it('teaches a character its own move from New, a tab of its own, one undo step (7.14)', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await openStage(user);
    await screen.findByText('blocks', {}, LOADED);
    const undo = () =>
      within(screen.getByRole('toolbar', { name: 'Undo and redo' })).getByRole('button', {
        name: /^Undo/,
      });
    const picker = () =>
      screen
        .getAllByRole('option')
        .filter((o) => !o.closest('.ss-frame-strip') && !o.closest('.pr-objects'));
    const newMenu = async () => {
      await user.click(screen.getByRole('button', { name: 'New in scene 1' }));
      return screen.getAllByRole('menuitem').map((i) => i.textContent);
    };
    // With the scene chosen, New has no character's moves; with the fox, its own.
    expect((await newMenu()).filter((i) => i?.includes(' for '))).toEqual([]);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /Blocks for/ }));
    await user.click(picker().find((o) => o.textContent === 'fox')!);
    expect(await newMenu()).toEqual(expect.arrayContaining(['Move for fox…']));
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /Blocks for/ }));
    await user.click(picker().find((o) => o.textContent === 'penguin')!);
    expect(await newMenu()).toEqual(
      expect.arrayContaining(['Move for penguin…', 'Question for penguin…']),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Move for penguin…' }));
    const dialog = screen.getByRole('dialog', { name: 'New move for penguin' });
    expect(within(dialog).getByText('Every penguin in every scene can use it.')).toBeTruthy();
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveProperty('value', 'newMove');
    // A name the penguin's built-in blocks have says why.
    await user.clear(name);
    await user.type(name, 'say');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(
      within(dialog).getByText('penguin already has a block called say. Choose another name.'),
    ).toBeTruthy();
    await user.clear(name);
    await user.type(name, 'waddle');
    await user.click(within(dialog).getByRole('button', { name: 'Add an input (parameter)…' }));
    const input = within(dialog).getByRole('textbox', { name: 'Name of input 1' });
    await user.clear(input);
    await user.type(input, 'steps');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Its tab says whose it is, and opens; its blocks are for this penguin only.
    const tab = screen.getByRole('tab', { name: 'penguin: waddle' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    await waitFor(() =>
      expect(undo().textContent).toBe('Undo: Add move waddle for penguin with steps'),
    );
    await waitFor(() =>
      expect(mounted.at(-1)!.method).not.toBe(exampleProduction().scenes[0]!.method),
    );
    const program = mounted.at(-1)!.host.program();
    const cls = program.types.find((t) => t.name === 'Penguin')!;
    expect(cls.methods.map((m) => m.name)).toEqual(['waddle']);
    expect(mounted.at(-1)!.method).toBe(cls.methods[0]!.id);
    await user.click(screen.getByRole('button', { name: /Blocks for/ }));
    expect(picker().map((o) => o.textContent)).toEqual(['this penguin']);
    await user.keyboard('{Escape}');
    // Inside it, New still offers the penguin's next move.
    expect(await newMenu()).toContain('Question for penguin…');
    await user.keyboard('{Escape}');

    // One undo takes the move, the class and the penguins' new type away together.
    await user.click(undo());
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'penguin: waddle' })).toBeNull());
    expect(
      mounted
        .at(-1)!
        .host.program()
        .types.some((t) => t.name === 'Penguin'),
    ).toBe(false);
  });
});

describe('Code | Sound (07-ux 7.7)', () => {
  const choose = async (user: ReturnType<typeof userEvent.setup>, view: 'Code' | 'Sound') =>
    user.click(
      within(screen.getByRole('radiogroup', { name: 'Code or Sound' })).getByRole('radio', {
        name: view,
      }),
    );

  it('lays Sound over the code, which keeps its place, and holds the choice', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await openStage(user);
    await screen.findByText('blocks', {}, LOADED);
    await choose(user, 'Sound');
    expect(await screen.findByRole('region', { name: 'Sound' }, LOADED)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sounds in this film' })).toBeTruthy();
    expect(screen.getByText('blocks').closest('[inert]')).not.toBeNull();
    await user.click(screen.getByRole('tab', { name: /Storyboard/ }));
    await openStage(user);
    expect(await screen.findByRole('region', { name: 'Sound' }, LOADED)).toBeTruthy();
    await screen.findByText('blocks', {}, LOADED);
    const mounts = mounted.length;
    await choose(user, 'Code');
    expect(screen.queryByRole('region', { name: 'Sound' })).toBeNull();
    expect(screen.getByText('blocks').closest('[inert]')).toBeNull();
    expect(mounted.length).toBe(mounts);
  });

  it('waits, as the code does, until the scene is storyboarded', async () => {
    const user = userEvent.setup();
    render(<App start={unplanned()} />);
    await openStage(user);
    expect(screen.getByRole('heading', { name: 'Storyboard scene 1 first' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Code or Sound' })).toBeNull();
  });

  it("goes to the block that plays a sound, in that block's scene", async () => {
    const user = userEvent.setup();
    render(<App start={playedInScene2(withSound(exampleProduction(), RAIN), 'sn1')} />);
    await openStage(user);
    await choose(user, 'Sound');
    await user.click(await screen.findByRole('button', { name: 'Remove Rain…' }, LOADED));
    expect(
      within(screen.getByRole('region', { name: 'Sound' })).getByText(
        'Rain is played in scene 2’s code. Change that block first.',
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Go to the block' }));
    expect(screen.getByRole('radio', { name: 'Code' }).closest('[data-selected]')).not.toBeNull();
    expect(await screen.findByRole('tablist', { name: 'Methods in scene 2' }, LOADED)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Sound' })).toBeNull();
  });
});
