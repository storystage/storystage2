import { expect, test, type Page } from '@playwright/test';
import {
  nodeId,
  validateProgram,
  type Callee,
  type Expression,
  type MethodDecl,
  type Program,
  type Statement,
} from '@storystage/ast';
import { sampleProgram } from '@storystage/ast/testing';
import { demoProduction } from '@storystage/production';
import { palette } from '@storystage/story-api/editing';
import { checkProgram } from '@storystage/story-api/program-check';
import {
  asText,
  canonical,
  history,
  lastLabel,
  oneSceneFilm,
  openFilm,
  savedProgram,
  switchTo,
  undoButton,
} from './parity/film.ts';
import {
  answerByKeyboard,
  answerByPointer,
  block,
  blocklyChooseByKeyboard,
  blocklyKey,
  blocklyOption,
  blocksAddDetail,
  blocksAlongTo,
  blocksChip,
  blocksDrag,
  blocksDragBelow,
  blocksMarkerInside,
  blocksReplacing,
  blocksMenu,
  madeIds,
  blocksMoveByKeyboard,
  blocksFlyoutByKeyboard,
  blocksFocusBlock,
  blocksPutAfter,
  chooseObjectByKeyboard,
  chooseObjectByPointer,
  editorOf,
  flyoutBlock,
  inView,
  blocksValue,
  dragOnto,
  flyoutScrolledTo,
  paletteTab,
  pressUntil,
  settled,
  itemByKeyboard,
  itemByPointer,
  tilesAddDetail,
  tilesAlongTo,
  tilesControl,
  tilesDragRow,
  tilesMenu,
  tilesMoveByKeyboard,
  tilesVariable,
  dropLineIn,
  tilesDragBelow,
  tilesPaletteTile,
  tilesPill,
  tilesRow,
  WAYS,
  type Way,
} from './parity/ways.ts';

// Parity through the interfaces (`14-editors.md` section 5; WP7.12): each task done four ways,
// Blocks and Tiles each by pointer and by keyboard, through what each editor offers a learner.
// The program kept (Save a copy) must be the same all four ways, and the one the task asks for,
// with the same last undo label and the same number of steps in the studio's one history.

const demo = demoProduction().program;
const MAIN = demoProduction().scenes[0]!.method;
const SAY = 'scene1b';
const PENGUIN = 'scene1p';
const FOX = 'scene1f';

/** The program with scene 1's method's statements as `body`. */
function withMain(program: Program, body: readonly Statement[]): Program {
  return {
    ...program,
    types: program.types.map((t) => ({
      ...t,
      methods: t.methods.map((m): MethodDecl => (m.id === MAIN ? { ...m, body } : m)),
    })),
  };
}
const mainOf = (program: Program) =>
  program.types.flatMap((t) => t.methods).find((m) => m.id === MAIN)!;

// What the tasks make, written out (ids are renamed when compared, so any will do).
let n = 0;
// A node id is 6 to 12 letters and digits (`NODE_ID_PATTERN`).
const id = (prefix: string) => nodeId(`${prefix}${String(++n).padStart(6, '0')}`);
const penguin = (): Expression => ({
  id: id('f'),
  kind: 'fieldRef',
  target: { id: id('t'), kind: 'this' },
  field: nodeId(PENGUIN),
});
const move = (direction: string, amount: Expression): Statement => ({
  id: id('m'),
  kind: 'call',
  target: penguin(),
  callee: { kind: 'story', name: 'move' },
  args: {
    direction: { id: id('d'), kind: 'enum', type: 'MoveDirection', value: direction },
    amount,
  },
  details: {},
});
const number = (value: number): Expression => ({ id: id('n'), kind: 'number', value });

/**
 * Found by this test (17 Nov): a value chosen from Blockly's drop-down keeps the old value's node
 * id, where the shared model (and so Tiles) makes a new value node. One must change: S5.
 */
const KEEPS_VALUE_ID = 'S5: Blocks keeps the old value node’s id';
/**
 * Found by this test (17 Nov): a drag in Blocks takes the block and every block under it, as
 * Blockly's stacks do, so the say can't go into the do together below it and goes back. In Tiles,
 * as in Alice, a drag moves one statement. S5.
 */
/**
 * Found by this test (17 Nov): Tiles' drags carry statements only, and a number's menu has no
 * questions, so by pointer a question can't go into a value. S6.
 */
const NO_QUESTION_DROP = 'S6: Tiles can’t drop a question on a value';
/** Blocks' palette has no variable or set block yet (S5, 17 Nov): S5 is adding them. */
const NO_VARIABLE_BLOCK = 'S5: Blocks has no variable block yet';
/**
 * Found by this test (17 Nov): Tiles draws a value made of others (a sum, a comparison, a "not",
 * a list, a question's own values) as one pill, so its parts can't be chosen or changed. S6.
 */
const DRAGS_THE_REST = 'S5: a Blocks drag takes the blocks under it too';

type Run = (page: Page) => Promise<void>;

interface Task {
  readonly name: string;
  /** Where it starts: what the tasks before it make. */
  readonly before: Program;
  /** What it asks for. */
  readonly after: Program;
  /** The last step's undo label, and how many steps the task takes. */
  readonly label: string;
  readonly steps: number;
  /**
   * Each way. One that can't be done yet is `fixme`, saying whose it is; one that can, but
   * makes a different program, `fails` with what's different and whose it is to fix, so it
   * still runs and says when it's fixed.
   */
  readonly ways: Record<
    Way,
    | Run
    | { readonly fixme: string; readonly run?: Run }
    | { readonly fails: string; readonly run: Run }
  >;
}

type Call = Extract<Statement, { kind: 'call' }>;
const say = mainOf(demo).body[0] as Call;
const added = move('forward', number(2)) as Call;
const afterAdd = withMain(demo, [say, added]);
/** Task 2: a value changed is a new value node in the same place. */
const turned: Call = {
  ...added,
  args: {
    ...added.args,
    direction: { id: id('d'), kind: 'enum', type: 'MoveDirection', value: 'backward' },
  },
};
const afterChange = withMain(demo, [say, turned]);
const timed: Call = { ...say, details: { duration: number(2) } };
const afterDetail = withMain(demo, [timed, turned]);
const together: Statement = { id: id('g'), kind: 'doTogether', body: [timed] };
const afterTogether = withMain(demo, [turned, together]);
/** A copy, as S2 makes one: new ids, each node noting the one it was copied from. */
function copyOf<T>(node: T): T {
  if (Array.isArray(node)) return node.map(copyOf) as T;
  if (!node || typeof node !== 'object') return node;
  const out = Object.fromEntries(
    Object.entries(node).map(([k, v]) => [k, k === 'id' ? v : copyOf(v)]),
  ) as Record<string, unknown>;
  if (typeof out['id'] === 'string' && 'kind' in out) {
    out['copiedFrom'] = out['id'];
    out['id'] = id('c');
  }
  return out as T;
}
const copied: Call = { ...copyOf(turned), enabled: false };
const afterCommands = withMain(demo, [copied, together]);
/** Task 6: the say's "how long" is a question now. */
const distance: Expression = {
  id: id('q'),
  kind: 'functionCall',
  target: penguin(),
  callee: { kind: 'story', name: 'getDistanceTo' },
  args: {
    other: {
      id: id('f'),
      kind: 'fieldRef',
      target: { id: id('t'), kind: 'this' },
      field: nodeId(FOX),
    },
  },
  details: {},
};
const asking: Call = { ...timed, details: { duration: distance } };
const afterQuestion = withMain(demo, [copied, { ...together, body: [asking] } as Statement]);
const DURATION = timed.details['duration']!.id;
/** Task 7: a variable, and a count of it, after the first statement. */
const steps: Statement = {
  id: id('v'),
  kind: 'local',
  name: 'steps',
  type: { kind: 'story', name: 'WholeNumber' },
  value: { id: id('w'), kind: 'wholeNumber', value: 3 },
};
const counting: Statement = {
  id: id('k'),
  kind: 'count',
  times: { id: id('r'), kind: 'variableRef', variable: steps.id },
  body: [],
};
const afterVariables = withMain(demo, [
  copied,
  steps,
  counting,
  { ...together, body: [asking] } as Statement,
]);
const MOVE = added.id;
const COPY = copied.id;
const DIRECTION = added.args['direction']!.id;

const TASKS: readonly Task[] = [
  {
    name: '1. add from the palette: the penguin moves forward 2, at the end',
    before: demo,
    after: afterAdd,
    label: 'Make penguin move forward 2',
    steps: 1,
    ways: {
      'Blocks by pointer': async (page) => {
        await chooseObjectByPointer(page, 'penguin');
        await blocksDragBelow(page, flyoutBlock(page, 'move'), block(page, SAY));
        await answerByPointer(page, 'direction', 'forward');
        await answerByPointer(page, 'amount', '2');
      },
      'Blocks by keyboard': async (page) => {
        await chooseObjectByKeyboard(page, 'penguin');
        await blocksFlyoutByKeyboard(page, 'move');
        await blocksPutAfter(page, SAY);
        await answerByKeyboard(page, 'direction', 'forward');
        await answerByKeyboard(page, 'amount', '2');
      },
      'Tiles by pointer': async (page) => {
        await chooseObjectByPointer(page, 'penguin');
        await tilesDragBelow(
          page,
          tilesPaletteTile(page, 'penguin move ??? ???'),
          tilesRow(page, SAY),
        );
        await answerByPointer(page, 'direction', 'forward');
        await answerByPointer(page, 'amount', '2');
      },
      'Tiles by keyboard': async (page) => {
        // Palette blocks go in after the statement in focus (section 3d).
        await tilesRow(page, SAY).focus();
        await chooseObjectByKeyboard(page, 'penguin');
        await tilesPaletteTile(page, 'penguin move ??? ???').focus();
        await page.keyboard.press('Enter');
        await answerByKeyboard(page, 'direction', 'forward');
        await answerByKeyboard(page, 'amount', '2');
      },
    },
  },
  {
    name: '2. change a value: the move’s forward becomes backward',
    before: afterAdd,
    after: afterChange,
    label: 'Change forward to backward in penguin move',
    steps: 1,
    ways: {
      'Blocks by pointer': {
        fails: KEEPS_VALUE_ID,
        run: async (page) => {
          await inView(page);
          await blocksChip(page, DIRECTION).click();
          await blocklyOption(page, 'backward').click();
        },
      },
      'Blocks by keyboard': {
        fails: KEEPS_VALUE_ID,
        run: async (page) => {
          await blocksFocusBlock(page, MOVE);
          await blocksAlongTo(page, blocksChip(page, DIRECTION));
          await blocklyKey(page, 'Enter');
          await blocklyChooseByKeyboard(page, 'backward');
        },
      },
      'Tiles by pointer': async (page) => {
        await tilesPill(page, DIRECTION).click();
        await answerByPointer(page, 'direction', 'backward');
      },
      'Tiles by keyboard': async (page) => {
        await tilesRow(page, MOVE).focus();
        await tilesAlongTo(page, tilesPill(page, DIRECTION));
        await page.keyboard.press('Enter');
        await answerByKeyboard(page, 'direction', 'backward');
      },
    },
  },
  {
    name: '3. add a detail: the say takes “how long” 2',
    before: afterChange,
    after: afterDetail,
    label: 'Add how long to penguin say',
    steps: 1,
    ways: {
      'Blocks by pointer': async (page) => {
        await inView(page);
        await (await blocksAddDetail(page, SAY)).click();
        await itemByPointer(page, 'add detail', 'how long');
        await answerByPointer(page, 'how long', '2');
      },
      'Blocks by keyboard': async (page) => {
        await blocksFocusBlock(page, SAY);
        await blocksAlongTo(page, await blocksAddDetail(page, SAY));
        await blocklyKey(page, 'Enter');
        await itemByKeyboard(page, 'add detail', 'how long');
        await answerByKeyboard(page, 'how long', '2');
      },
      'Tiles by pointer': async (page) => {
        await tilesAddDetail(page, SAY).click();
        await itemByPointer(page, 'add detail', 'how long');
        await answerByPointer(page, 'how long', '2');
      },
      'Tiles by keyboard': async (page) => {
        await tilesRow(page, SAY).focus();
        await tilesAlongTo(page, tilesAddDetail(page, SAY));
        await page.keyboard.press('Enter');
        await itemByKeyboard(page, 'add detail', 'how long');
        await answerByKeyboard(page, 'how long', '2');
      },
    },
  },
  {
    name: '4. a container: a do together at the end, with the say moved into it',
    before: afterDetail,
    after: afterTogether,
    label: 'Move penguin say Oh no, the ice is moving! into do together',
    steps: 2,
    ways: {
      'Blocks by pointer': {
        fails: DRAGS_THE_REST,
        run: async (page) => {
          await blocksDragBelow(page, flyoutBlock(page, 'control:doTogether'), block(page, MOVE));
          // The say by its top left, into the do together's body, under its header, found once
          // the say is lifted and the stack has closed up.
          await blocksDrag(page, block(page, SAY), async () => {
            const box = await settled(page, '.pr-workspace .ss_doTogether:not(.blocklyFlyout *)');
            return { x: box.x + 30, y: box.y + 52 };
          });
        },
      },
      'Blocks by keyboard': async (page) => {
        await blocksFlyoutByKeyboard(page, 'control:doTogether');
        await blocksPutAfter(page, MOVE);
        const made = await page
          .locator('.pr-workspace .ss_doTogether:not(.blocklyFlyout *)')
          .first()
          .getAttribute('data-id');
        await blocksMoveByKeyboard(page, SAY, () => blocksMarkerInside(page, made!));
      },
      'Tiles by pointer': async (page) => {
        await tilesDragBelow(page, tilesControl(page, 'do together'), tilesRow(page, MOVE));
        const empty = page.getByRole('treeitem', { name: 'drop statement here, in do together' });
        const box = (await empty.boundingBox())!;
        await tilesDragRow(page, SAY, { x: box.x + 40, y: box.y + box.height / 2 });
      },
      'Tiles by keyboard': async (page) => {
        await tilesRow(page, MOVE).focus();
        await tilesControl(page, 'do together').focus();
        await page.keyboard.press('Enter');
        const empty = page.getByRole('treeitem', { name: 'drop statement here, in do together' });
        await expect(empty).toBeVisible();
        await tilesMoveByKeyboard(page, SAY, () => dropLineIn(page, empty));
      },
    },
  },
  {
    name: '5. the commands: the move duplicated, the copy moved up and switched off, the move deleted',
    before: afterTogether,
    after: afterCommands,
    label: 'Delete penguin move backward 2',
    steps: 4,
    ways: {
      'Blocks by pointer': async (page) => {
        const known = await madeIds(page, 'Blocks', []);
        await blocksMenu(page, MOVE, 'Duplicate');
        await expect
          .poll(async () => (await madeIds(page, 'Blocks', known)).length)
          .toBeGreaterThan(0);
        const [copy] = await madeIds(page, 'Blocks', known);
        await blocksMenu(page, copy!, 'Move up');
        await blocksMenu(page, copy!, 'Switch off');
        await blocksMenu(page, MOVE, 'Delete');
      },
      'Blocks by keyboard': async (page) => {
        const known = await madeIds(page, 'Blocks', []);
        await blocksFocusBlock(page, MOVE);
        await blocklyKey(page, 'Control+d');
        await expect
          .poll(async () => (await madeIds(page, 'Blocks', known)).length)
          .toBeGreaterThan(0);
        const [copy] = await madeIds(page, 'Blocks', known);
        await blocksFocusBlock(page, copy!);
        await blocklyKey(page, 'Alt+ArrowUp');
        await blocklyKey(page, 'Control+/');
        await blocksFocusBlock(page, MOVE);
        await blocklyKey(page, 'Delete');
      },
      'Tiles by pointer': async (page) => {
        const known = await madeIds(page, 'Tiles', []);
        await tilesMenu(page, MOVE, 'Duplicate');
        await expect.poll(async () => (await madeIds(page, 'Tiles', known)).length).toBe(1);
        const [copy] = await madeIds(page, 'Tiles', known);
        await tilesMenu(page, copy!, 'Move up');
        await tilesMenu(page, copy!, 'Switch off');
        await tilesMenu(page, MOVE, 'Delete');
      },
      'Tiles by keyboard': async (page) => {
        const known = await madeIds(page, 'Tiles', []);
        await tilesRow(page, MOVE).focus();
        await page.keyboard.press('Control+d');
        await expect.poll(async () => (await madeIds(page, 'Tiles', known)).length).toBe(1);
        const [copy] = await madeIds(page, 'Tiles', known);
        await tilesRow(page, copy!).focus();
        await page.keyboard.press('Alt+ArrowUp');
        await tilesRow(page, copy!).focus();
        await page.keyboard.press('Control+/');
        await tilesRow(page, MOVE).focus();
        await page.keyboard.press('Delete');
      },
    },
  },
  {
    name: '6. a question in a slot: the say’s “how long” becomes penguin distance to fox',
    before: afterCommands,
    after: afterQuestion,
    label: 'Change 2 to penguin distance to fox in penguin say',
    steps: 1,
    ways: {
      'Blocks by pointer': async (page) => {
        await chooseObjectByPointer(page, 'penguin');
        await paletteTab(page, 'Questions', 'pointer');
        await inView(page);
        await flyoutScrolledTo(page, flyoutBlock(page, 'getDistanceTo'));
        await dragOnto(page, flyoutBlock(page, 'getDistanceTo'), blocksValue(page, DURATION));
        await itemByPointer(page, 'the other one', 'fox');
      },
      'Blocks by keyboard': async (page) => {
        await chooseObjectByKeyboard(page, 'penguin');
        await paletteTab(page, 'Questions', 'keyboard');
        await blocksFlyoutByKeyboard(page, 'getDistanceTo');
        await blocklyKey(page, 'Enter');
        await pressUntil(page, 'ArrowDown', () => blocksReplacing(page, DURATION), 12);
        await blocklyKey(page, 'Enter');
        await itemByKeyboard(page, 'the other one', 'fox');
      },
      'Tiles by pointer': {
        fixme: NO_QUESTION_DROP,
        run: async (page) => {
          await chooseObjectByPointer(page, 'penguin');
          await paletteTab(page, 'Questions', 'pointer');
          await dragOnto(
            page,
            tilesPaletteTile(page, 'penguin distance to ???'),
            tilesPill(page, DURATION),
          );
          await itemByPointer(page, 'the other one', 'fox');
        },
      },
      'Tiles by keyboard': async (page) => {
        // A question from the palette goes into the pill in focus (section 3d).
        await tilesRow(page, SAY).focus();
        await tilesAlongTo(page, tilesPill(page, DURATION));
        await chooseObjectByKeyboard(page, 'penguin');
        await paletteTab(page, 'Questions', 'keyboard');
        await tilesPaletteTile(page, 'penguin distance to ???').focus();
        await page.keyboard.press('Enter');
        await itemByKeyboard(page, 'the other one', 'fox');
      },
    },
  },
  {
    name: '7. variables: a whole number “steps” starting at 3, and a count of steps',
    before: afterQuestion,
    after: afterVariables,
    label: 'Add count up to steps',
    steps: 2,
    ways: {
      'Blocks by pointer': { fixme: NO_VARIABLE_BLOCK },
      'Blocks by keyboard': { fixme: NO_VARIABLE_BLOCK },
      'Tiles by pointer': async (page) => {
        const known = await madeIds(page, 'Tiles', []);
        await tilesDragBelow(page, tilesControl(page, 'variable'), tilesRow(page, COPY));
        await tilesVariable(page, 'steps', 'a whole number', 'pointer');
        await answerByPointer(page, 'steps', '3');
        const [made] = await madeIds(page, 'Tiles', known);
        await tilesDragBelow(page, tilesControl(page, 'count'), tilesRow(page, made!));
        await answerByPointer(page, 'how many times', 'steps');
      },
      'Tiles by keyboard': async (page) => {
        const known = await madeIds(page, 'Tiles', []);
        await tilesRow(page, COPY).focus();
        await tilesControl(page, 'variable').focus();
        await page.keyboard.press('Enter');
        await tilesVariable(page, 'steps', 'a whole number', 'keyboard');
        await answerByKeyboard(page, 'steps', '3');
        const [made] = await madeIds(page, 'Tiles', known);
        await tilesRow(page, made!).focus();
        await tilesControl(page, 'count').focus();
        await page.keyboard.press('Enter');
        await answerByKeyboard(page, 'how many times', 'steps');
      },
    },
  },
];

const otherEditor = (way: Way) => (editorOf(way) === 'Blocks' ? 'Tiles' : 'Blocks');

/** Every id in a program or node. */
function idsIn(value: unknown, into = new Set<string>()) {
  if (Array.isArray(value)) for (const v of value) idsIn(v, into);
  else if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string') into.add(id);
    for (const v of Object.values(value)) idsIn(v, into);
  }
  return into;
}

/**
 * The nodes in a list of statements that an editor draws, other than those in `old`: the
 * statements, nested ones too, and their values, a question's own values too. A call's target is
 * drawn as words ("penguin"), not a value of its own, so it isn't one.
 */
function nodesOf(body: readonly Statement[], old: ReadonlySet<string>) {
  const statements: string[] = [];
  const values: string[] = [];
  const parts = (node: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(node)) {
      // Not values: what it's called on, its type, a loop's item (a name it declares).
      if (['target', 'type', 'callee', 'of', 'item'].includes(k)) continue;
      if (Array.isArray(v) && (k === 'body' || k === 'then' || k === 'else'))
        (v as Statement[]).forEach(statement);
      else if ((k === 'args' || k === 'details') && v && typeof v === 'object')
        Object.values(v).forEach(value);
      else if (Array.isArray(v)) v.forEach(value);
      else if (v && typeof v === 'object' && 'kind' in v && 'id' in v) value(v);
    }
  };
  const value = (e: unknown) => {
    const x = e as Record<string, unknown> & { id: string };
    if (!x || typeof x !== 'object' || typeof x.id !== 'string') return;
    if (!old.has(x.id)) values.push(x.id);
    parts(x);
  };
  const statement = (st: Statement) => {
    if (!old.has(st.id)) statements.push(st.id);
    parts(st as unknown as Record<string, unknown>);
  };
  body.forEach(statement);
  return { statements, values };
}

/** A statement switched off, then on again (or on, then off), by keyboard: two steps. */
async function switchOffAndOn(page: Page, editor: 'Blocks' | 'Tiles', node: string) {
  for (let twice = 0; twice < 2; twice++) {
    const was = await undoButton(page).textContent();
    if (editor === 'Tiles') {
      await tilesRow(page, node).focus();
      await page.keyboard.press('Control+/');
    } else {
      await blocksFocusBlock(page, node);
      await blocklyKey(page, 'Control+/');
    }
    await expect(undoButton(page), `${node} switched in ${editor}`).not.toHaveText(was ?? '');
    await expect(undoButton(page)).toHaveText(/^Undo: Switch (off|on) /);
  }
}

/** Where a node is drawn: Tiles' `data-key` and Blocks' `data-id` are the program's node ids. */
const drawnNode = (page: Page, editor: 'Blocks' | 'Tiles', node: string) =>
  page
    .locator(
      editor === 'Tiles' ? `.pr-tiles [data-key="${node}"]` : `.pr-workspace [data-id="${node}"]`,
    )
    .first();

/**
 * Section 5.5.1 and 5.5.2: the program a task made, shown in the other editor through the switch.
 * Every statement and value it made is drawn there, and each statement it made is switched off
 * and on again there by keyboard, leaving the program as it was. Gives how many it switched.
 */
async function roundTrip(page: Page, made: Program, before: Program, other: 'Blocks' | 'Tiles') {
  await switchTo(page, other);
  const { statements, values } = nodesOf(mainOf(made).body, idsIn(before));
  for (const node of [...statements, ...values])
    await expect(
      drawnNode(page, other, node),
      `${node}, made in the other editor, is drawn in ${other}`,
    ).toBeAttached();
  for (const node of statements) await switchOffAndOn(page, other, node);
  const after = await savedProgram(page);
  expect(canonical(after, before), 'switched off and on again, it is as it was').toEqual(
    canonical(made, before),
  );
  return statements.length;
}

for (const task of TASKS)
  test.describe(task.name, () => {
    for (const way of WAYS) {
      const given = task.ways[way];
      if ('fixme' in given) {
        test.fixme(`${way} (${given.fixme})`, () => undefined);
        continue;
      }
      const run = 'fails' in given ? given.run : given;
      test(`${way}${'fails' in given ? ` (known to differ: ${given.fails})` : ''}`, async ({
        page,
      }) => {
        test.fail('fails' in given, 'fails' in given ? given.fails : '');
        await openFilm(page, task.before, editorOf(way));
        await run(page);
        const made = await savedProgram(page);
        expect(
          canonical(made, task.before),
          `The program made, then the one asked for:\n${asText(made)}\n${asText(task.after)}`,
        ).toEqual(canonical(task.after, task.before));
        const label = await lastLabel(page);
        // The round trip (5.5.1, 5.5.2): what the task made, drawn and edited in the other editor.
        const switched = await roundTrip(page, made, task.before, otherEditor(way));
        expect(label).toBe(task.label);
        expect((await history(page)).steps).toBe(task.steps + 2 * switched);
      });
    }
  });

// Every block in both (section 5.6): for the scene and each object in scene 1, on both tabs, the
// two palettes list the same blocks in the same order, read from what each editor draws, and
// both are the shared palette's.

const scene1 = demo.types.find((t) => t.methods.some((m) => m.id === MAIN))!;
const OBJECTS = ['the scene', 'camera', 'penguin', 'fox'] as const;
const TABS = ['Actions', 'Questions'] as const;

function targetOf(name: (typeof OBJECTS)[number]): Expression {
  const self: Expression = { id: nodeId('palself'), kind: 'this' };
  if (name === 'the scene') return self;
  const field = scene1.fields.find((f) => f.name === name)!;
  return { id: nodeId('palobj'), kind: 'fieldRef', target: self, field: field.id };
}

const shared = (name: (typeof OBJECTS)[number], tab: (typeof TABS)[number]) =>
  palette(demo, targetOf(name), scene1.id, tab === 'Actions' ? 'actions' : 'questions').flatMap(
    (g) => g.items.map((i) => calleeKey(i.callee)),
  );
const calleeKey = (callee: Callee) =>
  callee.kind === 'story' ? `story:${callee.name}` : `user:${callee.method}`;

/** Each editor's palette as drawn: its blocks' entries, and on Actions its control blocks. */
async function drawnPalette(page: Page, editor: 'Blocks' | 'Tiles') {
  const blocks =
    editor === 'Blocks'
      ? page.locator('.pr-workspace .blocklyFlyout [data-callee]')
      : page.locator('.pr-tiles .tl-palette [data-callee]');
  const controls =
    editor === 'Blocks'
      ? page.locator('.pr-workspace .blocklyFlyout [data-callee^="control:"]')
      : page.locator('.pr-tiles .tl-controls [data-kind]');
  const entries = await blocks.evaluateAll((els) => els.map((e) => e.getAttribute('data-callee')!));
  const control = await controls.evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-callee') ?? `control:${e.getAttribute('data-kind')}`),
  );
  return { entries: entries.filter((e) => !e.startsWith('control:')), control };
}

async function palettes(page: Page, editor: 'Blocks' | 'Tiles') {
  const seen: Record<string, Awaited<ReturnType<typeof drawnPalette>>> = {};
  for (const name of OBJECTS)
    for (const tab of TABS) {
      await chooseObjectByPointer(page, name);
      await paletteTab(page, tab, 'pointer');
      const want = shared(name, tab);
      await expect
        .poll(async () => (await drawnPalette(page, editor)).entries, {
          message: `${editor}'s palette for ${name}, ${tab}`,
        })
        .toEqual(want);
      seen[`${name}, ${tab}`] = await drawnPalette(page, editor);
    }
  return seen;
}

test.describe('every block in both (5.6)', () => {
  test('both palettes list the shared palette’s blocks, for each object and tab', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFilm(page, demo, 'Blocks');
    await palettes(page, 'Blocks');
    await switchTo(page, 'Tiles');
    await palettes(page, 'Tiles');
  });

  test(`Blocks’ control group is Tiles’ control bar, in the same order (known to differ: ${NO_VARIABLE_BLOCK})`, async ({
    page,
  }) => {
    test.fail(true, NO_VARIABLE_BLOCK);
    await openFilm(page, demo, 'Blocks');
    const blocks = (await drawnPalette(page, 'Blocks')).control;
    await switchTo(page, 'Tiles');
    const tiles = (await drawnPalette(page, 'Tiles')).control;
    expect(blocks).toEqual(tiles);
  });
});

// The round trip with every kind of node (section 5.5.3): S2's sample program, which Blocks'
// mapping test uses too (3i.8), in a film of its own, shown in each editor. Every node in each
// method and event is drawn, and every statement is switched off and on again by keyboard.

/**
 * S2's sample, with its two deliberate misfits put right, since the studio takes no step that
 * leaves the Story API's check failing: "double" gives words ("a" joined to a length), and
 * "each in together" goes through a list of the cat, not the cat. Every kind of node is still in it.
 */
function studioSample(): Program {
  const s = sampleProgram();
  const cat = (n: string): Expression => ({
    id: nodeId(`each${n}`),
    kind: 'fieldRef',
    target: { id: nodeId(`eachth${n}`), kind: 'this' },
    field: nodeId('catcat'),
  });
  const fix = (st: Statement): Statement =>
    st.kind === 'eachTogether'
      ? {
          ...st,
          items: {
            id: nodeId('eachlist'),
            kind: 'arrayOf',
            of: { kind: 'story', name: 'Quadruped' },
            items: [cat('cat')],
          },
        }
      : st;
  return {
    ...s,
    types: s.types.map((t) => ({
      ...t,
      methods: t.methods.map((m) =>
        m.name === 'double'
          ? { ...m, returns: { kind: 'story', name: 'Text' } }
          : { ...m, body: m.body.map(fix) },
      ),
    })),
  };
}
const sample = studioSample();
/** Each node's kind, for a failure's words. */
const kinds = new Map<string, string>();
(function kindsOf(v: unknown) {
  if (Array.isArray(v)) v.forEach(kindsOf);
  else if (v && typeof v === 'object') {
    const n = v as { id?: unknown; kind?: unknown };
    if (typeof n.id === 'string' && typeof n.kind === 'string') kinds.set(n.id, n.kind);
    Object.values(v).forEach(kindsOf);
  }
})(sample);
const sampleScene = sample.types[0]!;
const SAMPLE_FILM = oneSceneFilm(sample, sampleScene.methods[0]!.id, [
  { name: 'cat', class: 'Quadruped' },
]);

for (const editor of ['Blocks', 'Tiles'] as const)
  test(`every kind of node is drawn and edited in ${editor} (5.5.3)`, async ({ page }) => {
    test.setTimeout(300_000);
    expect(validateProgram(sample)).toEqual([]);
    expect(checkProgram(sample)).toEqual([]);
    await openFilm(page, SAMPLE_FILM, editor);
    const owners = [...sampleScene.methods, ...sampleScene.listeners];
    let switched = 0;
    for (const owner of owners) {
      // A method's tab has its name; the event's is the one tab that isn't a method's.
      const tabs = page.getByRole('tablist', { name: /^Methods in scene/ }).getByRole('tab');
      const names = sampleScene.methods.map((m) => m.name);
      const tab =
        owner.kind === 'method'
          ? tabs.filter({ hasText: new RegExp(`^${owner.name}$`) })
          : tabs.filter({ hasNotText: new RegExp(`^(${names.join('|')})$`) });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      if (editor === 'Blocks')
        await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
      const { statements, values } = nodesOf(owner.body, new Set());
      // All that aren't drawn, by kind, so one run shows every gap.
      await expect(async () => {
        const missing: string[] = [];
        for (const node of [...statements, ...values])
          if ((await drawnNode(page, editor, node).count()) === 0)
            missing.push(`${kinds.get(node)} ${node}`);
        expect(
          missing,
          `not drawn in ${editor}, in ${'name' in owner ? owner.name : owner.event}`,
        ).toEqual([]);
      }).toPass({ timeout: 5_000 });
      for (const node of statements) {
        await switchOffAndOn(page, editor, node);
        switched++;
      }
    }
    const after = await savedProgram(page);
    expect(canonical(after, sample), 'switched off and on again, it is as it was').toEqual(
      canonical(sample, sample),
    );
    expect((await history(page)).steps).toBe(2 * switched);
  });
