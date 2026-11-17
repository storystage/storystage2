import { expect, test, type Page } from '@playwright/test';
import {
  nodeId,
  type Expression,
  type MethodDecl,
  type Program,
  type Statement,
} from '@storystage/ast';
import { demoProduction } from '@storystage/production';
import { asText, canonical, history, openFilm, savedProgram } from './parity/film.ts';
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
  blocksMarkerIn,
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
  settled,
  itemByKeyboard,
  itemByPointer,
  tilesAddDetail,
  tilesAlongTo,
  tilesControl,
  tilesDragRow,
  tilesMoveByKeyboard,
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
 * Found by this test (17 Nov): Tiles has the commands only as keys (section 3d), with no menu on a
 * row for the pointer, so on a touch screen a statement can't be duplicated, moved by a step,
 * switched off or deleted. S6.
 */
const NO_ROW_MENU = 'S6: Tiles has no menu on a row for the commands';
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
    Run | { readonly fixme: string } | { readonly fails: string; readonly run: Run }
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
const MOVE = added.id;
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
          const box = await settled(page, '.pr-workspace .ss_doTogether:not(.blocklyFlyout *)');
          // The say by its top left, into the do together's body, under its header.
          await blocksDrag(page, block(page, SAY), { x: box.x + 30, y: box.y + 52 });
        },
      },
      'Blocks by keyboard': async (page) => {
        await blocksFlyoutByKeyboard(page, 'control:doTogether');
        await blocksPutAfter(page, MOVE);
        const made = await page
          .locator('.pr-workspace .ss_doTogether:not(.blocklyFlyout *)')
          .first()
          .getAttribute('data-id');
        await blocksMoveByKeyboard(page, SAY, blocksMarkerIn(page, made!));
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
      'Tiles by pointer': { fixme: NO_ROW_MENU },
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
];

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
        expect(await history(page)).toEqual({ label: task.label, steps: task.steps });
      });
    }
  });
