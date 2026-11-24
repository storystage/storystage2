/**
 * The Blocks editor (`14-editors.md` section 3i): Blockly over one method at a time, on the
 * editor contract. The program belongs to the studio: the workspace is built from it
 * (`toBlocks`), each finished gesture becomes edits (`editsFor`) applied through `host.apply` as
 * one undo step, and any change made elsewhere (undo, the Prompter, Tiles) rebuilds the method.
 * A block dropped outside the method goes back (decision 0064), as do blocks the program would
 * refuse. A block's menu is ours (`blockMenu.ts`), in place of Blockly's.
 */
import * as Blockly from 'blockly/core';
import * as BlocklyEnglish from 'blockly/msg/en';
import {
  copyNode,
  idMinter,
  indexProgram,
  isStatement,
  type Expression,
  type ListenerDecl,
  type MethodDecl,
  type NodeId,
  type Program,
  type Statement,
} from '@storystage/ast';
import { STORY_WORDS } from '@storystage/story-api';
import {
  canDrop,
  describer,
  fill,
  namesAt,
  newAssign,
  newLocal,
  type NameInScope,
  type PaletteTab,
  type VARIABLE_TYPES,
} from '@storystage/story-api/editing';
import {
  EMPTY_VIEW,
  type CodeEditor,
  type EditorCommand,
  type EditorHost,
  type HighlightKind,
  type HighlightMark,
  type ViewState,
} from '@storystage/editor-contract';
import { changeFor, detailPlace, menuFor, type MenuAction } from './blockMenu.ts';
import { defineBlocks } from './definitions.ts';
import { dropFromPalette, freshIn, holdsKnown, type AskRequest, type Fresh } from './drops.ts';
import { ADD_DETAIL_INPUT, AddDetailField } from './addDetail.ts';
import { dragsAlone } from './drag.ts';
import { editsFor } from './gestures.ts';
import { soundsFor, type FilmSoundWords } from './sounds.ts';
import { RENDERER, registerRenderer, storyTheme } from './renderer.ts';
import { BlocksMismatch, fromBlocks, toBlocks, type WorkspaceState } from './mapping.ts';
import blockWords from './strings/en-GB.json' with { type: 'json' };
import { toolboxFor, withNewIds } from './toolbox.ts';

const WORDS = blockWords as Readonly<Record<string, string>>;
const STORY = STORY_WORDS as Readonly<Record<string, string>>;

/**
 * Blockly's own menu items that don't fit here: its undo (the studio keeps the one history),
 * comments (the program has its own comment block), collapsing, inline inputs, help, and its
 * duplicate, delete and disable, which ours replace (`blockMenu.ts`).
 */
const BLOCKLY_MENU = [
  'undoWorkspace',
  'redoWorkspace',
  'cleanWorkspace',
  'collapseWorkspace',
  'expandWorkspace',
  'workspaceDelete',
  'blockDuplicate',
  'blockComment',
  'blockInline',
  'blockCollapseExpand',
  'blockDisable',
  'blockDelete',
  'blockHelp',
];

/** What our keys do: the block menu's actions, and copy and paste (spec 14, 3d). */
type KeyAction = MenuAction | { readonly kind: 'copy' } | { readonly kind: 'paste' };

/** Each workspace's key actions: Blockly's menus and keys are shared by every workspace. */
const menuActions = new WeakMap<
  Blockly.Workspace,
  (block: NodeId | null, action: KeyAction) => void
>();

/** The block a key acts on: the one with focus, or the one a value stands in. */
function blockFor(scope: { focusedNode?: unknown }): Blockly.BlockSvg | null {
  let node = scope.focusedNode;
  while (node instanceof Blockly.BlockSvg && node.isShadow()) node = node.getParent();
  return node instanceof Blockly.BlockSvg ? node : null;
}

/**
 * Our keys, as in Tiles (`14-editors.md` section 3d): Ctrl+/ switches a statement off or on,
 * Ctrl+D duplicates it (Cmd on a Mac or iPad), Ctrl+C and Ctrl+V copy and paste it, and Alt+↑ and
 * Alt+↓ move it one place in its list. Blockly's own D, C, V and X make or take loose blocks
 * outside the program and its one history, so they go.
 */
function registerKeys() {
  const keys = Blockly.ShortcutRegistry.registry;
  const { KeyCodes } = Blockly.utils;
  const both = (code: number) => [
    keys.createSerializedKey(code, [KeyCodes.CTRL]),
    keys.createSerializedKey(code, [KeyCodes.META]),
  ];
  for (const blockly of ['duplicate', 'copy', 'paste', 'cut'])
    if (keys.getRegistry()[blockly]) keys.unregister(blockly);
  const alt = (code: number) => [keys.createSerializedKey(code, [KeyCodes.ALT])];
  const ours = [
    ['ss_switch', both(KeyCodes.SLASH), { kind: 'switch' }],
    ['ss_duplicate', both(KeyCodes.D), { kind: 'duplicate' }],
    ['ss_copy', both(KeyCodes.C), { kind: 'copy' }],
    ['ss_paste', both(KeyCodes.V), { kind: 'paste' }],
    ['ss_move_up', alt(KeyCodes.UP), { kind: 'moveUp' }],
    ['ss_move_down', alt(KeyCodes.DOWN), { kind: 'moveDown' }],
  ] as const;
  for (const [name, keyCodes, action] of ours) {
    if (keys.getRegistry()[name]) continue;
    keys.register({
      name,
      preconditionFn: (ws) => !ws.isDragging() && menuActions.has(ws),
      callback: (ws, e, _shortcut, scope) => {
        const block = blockFor(scope);
        const run = menuActions.get(ws);
        if (!run || (block && block.workspace !== ws)) return false;
        // Paste needs no block: with none, it goes at the end of the method.
        if (!block && action.kind !== 'paste') return false;
        e.preventDefault();
        run((block?.id as NodeId | undefined) ?? null, action);
        return true;
      },
      keyCodes: [...keyCodes],
    });
  }
}

/** Every method and listener in a program, by id. */
function ownerIn(program: Program, id: NodeId | null): MethodDecl | ListenerDecl | null {
  for (const t of program.types)
    for (const m of [...t.methods, ...t.listeners]) if (id === null || m.id === id) return m;
  return null;
}

/** The type a method or listener belongs to, for the palette's "your own" blocks. */
function typeOf(program: Program, id: NodeId | null): NodeId | null {
  for (const t of program.types)
    if ([...t.methods, ...t.listeners].some((m) => m.id === id)) return t.id;
  return null;
}

/**
 * `references` and `referenceWord` are the film's sounds and their labels (7.17): a sound block's
 * ▾ offers them, and the block, its undo labels and what's said show a sound by its label.
 */
export interface BlocksEditorOptions extends FilmSoundWords {
  /**
   * How big the blocks are drawn: Settings › Accessibility's text size (1, 1.25 or 1.5; decision
   * 0035). Blockly lays blocks out from its own text, so the whole workspace scales. Default 1.
   */
  readonly scale?: number;
  /**
   * Asks the learner for one value of a block just dropped (the shared cascade, section 2.3),
   * shown at `anchor`, the block's own element. Resolves to `null` for Escape, which cancels
   * the drop. Without it, a dropped block keeps its empty values.
   */
  readonly ask?: (
    request: AskRequest & { readonly anchor: Element | null },
  ) => Promise<Expression | null>;
  /**
   * Asks which detail to add to a block, for its "add detail ▾" (the shared `DetailMenu`), shown
   * at `anchor`. Resolves to the detail's name, or `null` for Escape. Without it, a row has no
   * "add detail ▾" and details are added from the block's menu.
   */
  readonly chooseDetail?: (request: {
    readonly program: Program;
    readonly node: NodeId;
    readonly anchor: Element;
  }) => Promise<string | null>;
  /**
   * The variable block's question, as it's dropped (the shared `NewVariable`, spec 14 2.3): a
   * name not in `taken`, and what kind of value it holds. `null` for Escape, which cancels the
   * drop. Without it, a dropped variable block puts nothing in.
   */
  readonly newVariable?: (request: {
    readonly taken: readonly string[];
    readonly anchor: Element | null;
  }) => Promise<{ readonly name: string; readonly type: VariableType } | null>;
  /**
   * The set block's question, as it's dropped (the shared `ChooseVariable`): which of the
   * variables there that may change. `null` for Escape, which cancels the drop.
   */
  readonly chooseVariable?: (request: {
    readonly names: readonly NameInScope[];
    readonly anchor: Element | null;
  }) => Promise<NodeId | null>;
}

/** What a variable may hold, as the variable block's question offers it. */
export type VariableType = (typeof VARIABLE_TYPES)[number];

/** The Blocks editor, with the palette's object and tab, which the studio's picker sets. */
export interface BlocksEditor extends CodeEditor {
  setPalette(target: Expression, tab: PaletteTab): void;
}

/**
 * Blockly 13 gives each connection's highlight a `figure` role, including inside the palette's
 * list, where only options may be (axe: aria-required-children). The highlight is only drawing,
 * so it is hidden from screen readers. To report to Blockly; remove when it is fixed there.
 */
function quietPalette(ws: Blockly.WorkspaceSvg) {
  const flyout = ws.getFlyout()?.getWorkspace();
  for (const path of flyout?.getParentSvg().querySelectorAll('.blocklyHighlightedConnectionPath') ??
    [])
    path.setAttribute('aria-hidden', 'true');
  // Which entry each palette block is (`toolbox.ts`), on the block as drawn.
  for (const block of flyout?.getTopBlocks(false) ?? [])
    if (block.data) block.getSvgRoot().setAttribute('data-callee', block.data);
}

/**
 * Blockly 13 marks its menu's items `aria-selected` as the highlight moves, which a `menuitem` may
 * not have (axe: aria-allowed-attr); focus already says which item is current. So it's taken off
 * while the menu is open. To report to Blockly; remove when it is fixed there.
 */
function quietMenu(doc: Document) {
  setTimeout(() => {
    const menu = doc.querySelector('.blocklyContextMenu');
    if (!menu) return;
    const strip = () => {
      for (const item of menu.querySelectorAll('[aria-selected]'))
        item.removeAttribute('aria-selected');
    };
    strip();
    new MutationObserver(strip).observe(menu, {
      subtree: true,
      attributeFilter: ['aria-selected'],
    });
  }, 0);
}

/** The scene itself, the palette's object until the learner picks one. */
const THE_SCENE: Expression = { id: 'palscene' as NodeId, kind: 'this' };

/**
 * Words broken into lines of about `width` characters, at spaces: Blockly's warning bubble draws
 * one line per line of text, so a long error would otherwise run across the whole workspace.
 */
export function wrapped(text: string, width = 50): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/** The id of an error's warning on its block, so clearing it leaves any other warning alone. */
const ERROR_WARNING = 'ss-error';

export function createBlocksEditor(options: BlocksEditorOptions = {}): BlocksEditor {
  let ws: Blockly.WorkspaceSvg | null = null;
  let host: EditorHost | null = null;
  let owner: NodeId | null = null;
  /** The statement last copied, kept by this editor as Tiles keeps its own. */
  let clipboard: Statement | null = null;
  let loading = false;
  let settling: ReturnType<typeof setTimeout> | null = null;
  let stopListening: (() => void) | null = null;
  const highlights = new Map<HighlightKind, readonly HighlightMark[]>();
  let target: Expression = THE_SCENE;
  let tab: PaletteTab = 'actions';
  /** While the cascade asks about a dropped block, the workspace waits. */
  let asking = false;
  /** The block last picked up, by pointer or Blockly's move (M), until its drag is settled. */
  let moving: NodeId | null = null;

  /** The palette for the chosen object, as the program has it now. */
  function updatePalette() {
    if (!ws || !host) return;
    const self = typeOf(host.program(), owner);
    if (self) ws.updateToolbox(toolboxFor(host.program(), target, self, tab) as never);
    quietPalette(ws);
  }

  /** Shows the open method as the program has it now. */
  function rebuild() {
    if (!ws || !host) return;
    const method = ownerIn(host.program(), owner);
    loading = true;
    Blockly.Events.disable();
    try {
      ws.clear();
      if (method) {
        owner = method.id;
        Blockly.serialization.workspaces.load(toBlocks(host.program(), method), ws);
        ws.getBlockById(method.id)?.setMovable(false);
        for (const block of ws.getAllBlocks(false)) {
          block.customContextMenu = menuOn(block);
          addDetailOn(block);
          dragsAlone(block);
        }
      }
    } finally {
      Blockly.Events.enable();
      loading = false;
    }
    for (const [kind, marks] of highlights) paint(kind, marks);
    updatePalette();
  }

  /**
   * The blocks back as the program has them, with focus on the block the learner was on: a move
   * by keyboard that's refused (or left outside the method) keeps their place. If Blockly hasn't
   * given the moved block focus back yet (later under load), focus goes to that block.
   */
  function putBack() {
    const was = Blockly.getFocusManager().getFocusedNode();
    const block =
      was instanceof Blockly.BlockSvg
        ? was
        : was instanceof Blockly.Field
          ? was.getSourceBlock()
          : null;
    const id = block && block.workspace === ws ? (block.id as NodeId) : moving;
    rebuild();
    if (id) focusOn(id);
  }

  /** After a gesture: the edits it made, one step, or the blocks back as they were. */
  function settle() {
    settling = null;
    if (!ws || !host || owner === null) return;
    // A drag, or words being typed in a block (Blockly's text editor, which sets the value at
    // each key): the step is made when it's done, so a value chosen anew can be drawn again.
    if (ws.isDragging() || Blockly.WidgetDiv.isVisible()) {
      settling = setTimeout(settle, 50);
      return;
    }
    try {
      settleNow();
    } finally {
      moving = null;
    }
  }

  function settleNow() {
    if (!ws || !host || owner === null) return;
    let read;
    try {
      read = fromBlocks(Blockly.serialization.workspaces.save(ws) as WorkspaceState);
    } catch (e) {
      if (!(e instanceof BlocksMismatch)) throw e;
      putBack();
      return;
    }
    // A block from the palette, landed in the method. (A value it took the place of is left
    // loose on the workspace by Blockly; the drop's edits take it out.)
    const program = host.program();
    const fresh = freshIn(program, read);
    // A palette block holding blocks the program has (a drag begun before the drop was a step,
    // landed in it; S6's find): never made a step, which would copy them. They go back.
    if (fresh.some((f) => holdsKnown(program, f))) return putBack();
    if (fresh.length === 1) return void dropped(fresh[0]!);
    if (fresh.length > 1) return putBack();
    if (ws.getTopBlocks(false).some((b) => b.id !== owner)) {
      host.announce(WORDS['editor.looseBlock']!);
      putBack();
      return;
    }
    const result = editsFor(host.program(), read, options);
    if (result.kind === 'none') return;
    if (result.kind === 'putBack') return putBack();
    const applied = host.apply(result.edits, result.label, 'blocks');
    // Said aloud, as Tiles says it (14-editors 3f.5, 3i.9): "Move penguin say …".
    host.announce(applied.ok ? result.label : applied.reason);
    if (!applied.ok) return putBack();
    // A value chosen in place is a new node: drawn again with its new id, focus on it if it had it.
    if (result.renewed.size > 0) {
      const was = Blockly.getFocusManager().getFocusedNode();
      const on = was instanceof Blockly.BlockSvg ? (was.id as NodeId) : null;
      rebuild();
      const next = on ? (result.renewed.get(on) ?? on) : null;
      if (next) focusOn(next);
    }
  }

  /** A block from the palette: placed, its values asked for, then one step (or nothing). */
  /**
   * The variable or set block's question, before its values are asked (spec 14, 2.3), as Tiles'
   * bar asks it: the block that's asked about, or `null` if nothing goes in.
   */
  async function askedFirst(fresh: Fresh, anchor: Element | null): Promise<Fresh | null> {
    const entry = ws?.getBlockById(fresh.node.id)?.data;
    if (!host || fresh.place.kind !== 'statement') return fresh;
    if (entry !== 'control:variable' && entry !== 'control:assign') return fresh;
    const program = host.program();
    const names = namesAt(program, fresh.place);
    const mint = idMinter(program);
    if (entry === 'control:variable') {
      const made = await options.newVariable?.({ taken: names.map((v) => v.name), anchor });
      if (!made) return null;
      return { ...fresh, node: newLocal(made.name, { kind: 'story', name: made.type }, mint) };
    }
    const settable = names.filter((v) => v.assignable);
    if (settable.length === 0) {
      host.announce(WORDS['editor.nothingToSet']!);
      return null;
    }
    const variable = await options.chooseVariable?.({ names: settable, anchor });
    if (!variable) return null;
    return { ...fresh, node: newAssign(variable, mint) };
  }

  async function dropped(dropping: Fresh) {
    if (!host) return;
    const anchor = ws?.getBlockById(dropping.node.id)?.getSvgRoot() ?? null;
    let fresh = dropping;
    // Where focus goes afterwards: the new block, or else where it would have gone, so a learner
    // on the keyboard (Blockly's move, then the cascade) keeps their place, even after Escape.
    let then: NodeId = fresh.place.kind === 'statement' ? fresh.place.parent : fresh.place.node;
    asking = true;
    try {
      const asked = await askedFirst(dropping, anchor);
      if (!asked || !host) return;
      fresh = asked;
      const ask = options.ask;
      const outcome = await dropFromPalette(
        host.program(),
        fresh,
        ask ? (request) => ask({ ...request, anchor }) : null,
        options,
      );
      if (!host) return;
      if (outcome.kind === 'refused') host.announce(outcome.reason);
      if (outcome.kind === 'edits') {
        const applied = host.apply(outcome.edits, outcome.label, 'blocks');
        if (applied.ok) {
          host.announce(outcome.label);
          const first = outcome.edits[0];
          if (first?.kind === 'insert') then = first.node.id;
        } else host.announce(applied.reason);
      }
    } finally {
      asking = false;
      // The new blocks take the program's ids, and a cancelled drop goes.
      rebuild();
      focusOn(then);
    }
  }

  /** "add detail ▾" at the end of a statement's row, while it can take another detail. */
  function addDetailOn(block: Blockly.BlockSvg) {
    if (!host || !options.chooseDetail || !block.previousConnection) return;
    const items = menuFor(host.program(), block.id as NodeId);
    if (!items.some((i) => i.action.kind === 'addDetail')) return;
    block
      .appendDummyInput(ADD_DETAIL_INPUT)
      .appendField(new AddDetailField((b) => void chooseDetail(b.id as NodeId)));
  }

  /** Which detail, from the shared menu, then its value, as one step. */
  async function chooseDetail(node: NodeId) {
    const anchor = ws?.getBlockById(node)?.getSvgRoot();
    if (!host || !options.chooseDetail || !anchor || asking) return;
    asking = true;
    let detail: string | null;
    try {
      detail = await options.chooseDetail({ program: host.program(), node, anchor });
    } finally {
      asking = false;
    }
    if (detail) await act(node, { kind: 'addDetail', detail });
  }

  /** A block's menu: ours, in place of whatever Blockly offers. */
  function menuOn(block: Blockly.BlockSvg) {
    return (offered: unknown[]) => {
      offered.length = 0;
      if (!host) return;
      for (const item of menuFor(host.program(), block.id as NodeId))
        offered.push({
          text: item.words,
          enabled: true,
          callback: () => void act(block.id as NodeId, item.action),
        });
      if (offered.length > 0) quietMenu(block.getSvgRoot().ownerDocument);
    };
  }

  /**
   * A menu action or key, as one step, said aloud. Adding a detail asks for its value first,
   * through the cascade, as a drop does; Escape adds nothing.
   */
  async function act(node: NodeId, action: MenuAction) {
    if (!host || asking) return;
    let value: Expression | undefined;
    if (action.kind === 'addDetail') {
      if (!options.ask) return;
      const anchor = ws?.getBlockById(node)?.getSvgRoot() ?? null;
      asking = true;
      let answer: Expression | null;
      try {
        answer = await options.ask({
          program: host.program(),
          place: detailPlace(node, action.detail),
          label: STORY[`detail.${action.detail}`] ?? action.detail,
          anchor,
        });
      } finally {
        asking = false;
      }
      if (!answer || !host) return;
      value = withNewIds(answer, idMinter(host.program()));
    }
    const change = changeFor(host.program(), node, action, value);
    if (!change.ok) return void host.announce(change.reason);
    const applied = host.apply(change.edits, change.label, 'blocks');
    host.announce(applied.ok ? change.label : applied.reason);
    // Blockly didn't make this change, so the method is drawn again from the program.
    rebuild();
    const first = change.edits[0];
    if (action.kind !== 'delete') focusOn(first?.kind === 'insert' ? first.node.id : node);
  }

  /**
   * Copy and paste, as Tiles has them (spec 14, 3d): copy keeps the statement a block is in;
   * paste puts a copy of it, with new ids and `copiedFrom`, after the statement the chosen block
   * is in, at the top of the method from its own block, or at its end with nothing chosen. Each
   * paste is one step in the studio's history. A value or the method's own block copies nothing.
   */
  function clip(kind: 'copy' | 'paste', node: NodeId | null): boolean {
    if (!host || owner === null) return false;
    const program = host.program();
    const index = indexProgram(program);
    // The statement the block is in: a value's own statement, or none for the method's block.
    let at = node === null ? undefined : index.get(node);
    while (at && !isStatement(at.node) && at.parent !== null) at = index.get(at.parent);
    const statement = at && isStatement(at.node) ? at : null;
    if (kind === 'copy') {
      if (!statement) return false;
      clipboard = statement.node as Statement;
      host.announce(
        fill(WORDS['editor.copied']!, { what: describer(program, options)(clipboard) }),
      );
      return true;
    }
    if (!clipboard) {
      host.announce(WORDS['editor.nothingCopied']!);
      return false;
    }
    const method = ownerIn(program, owner);
    if (!method) return false;
    const place =
      statement && statement.parent !== null && typeof statement.key === 'number'
        ? { parent: statement.parent, slot: statement.slot, index: statement.key + 1 }
        : node === owner
          ? { parent: owner, slot: 'body', index: 0 }
          : { parent: owner, slot: 'body', index: method.body.length };
    const copy = copyNode(clipboard, idMinter(program));
    const drop = canDrop(program, { kind: 'statement', ...place } as never, copy, options);
    if (!drop.ok) {
      host.announce(drop.reason);
      return false;
    }
    const applied = host.apply(drop.edits, drop.label, 'blocks');
    host.announce(applied.ok ? drop.label : applied.reason);
    rebuild();
    if (applied.ok) focusOn(copy.id);
    return applied.ok;
  }

  /**
   * Focus on a block once Blockly's menu has closed: closing, it puts focus back where the menu
   * opened, on a block the redraw has replaced.
   */
  function focusOn(node: NodeId) {
    setTimeout(() => {
      const block = ws?.getBlockById(node);
      if (block) Blockly.getFocusManager().focusNode(block);
    }, 0);
  }

  function onChange(e: Blockly.Events.Abstract) {
    if (loading || asking) return;
    if (e instanceof Blockly.Events.BlockDrag && e.isStart && e.blockId) {
      moving = e.blockId as NodeId;
    }
    // A drag's end is settled as soon as Blockly is done with it, not at the next look 50 ms on,
    // so a quick learner's next drag is less likely to begin before the drop is a step.
    if (e instanceof Blockly.Events.BlockDrag && !e.isStart) {
      if (settling !== null) clearTimeout(settling);
      settling = setTimeout(settle, 0);
      return;
    }
    if (e.isUiEvent) return;
    if (settling === null) settling = setTimeout(settle, 0);
  }

  function paint(kind: HighlightKind, marks: readonly HighlightMark[]) {
    if (!ws) return;
    for (const block of ws.getAllBlocks(false)) {
      block.removeClass(`ss-highlight-${kind}`);
      if (kind === 'error') block.setWarningText(null, ERROR_WARNING);
    }
    for (const mark of marks) {
      const block = ws.getBlockById(mark.node);
      if (!block) continue;
      block.addClass(`ss-highlight-${kind}`);
      // An error explains itself beside its block, in plain words (07-ux section 7.4): Blockly's
      // warning, open, so it's seen without a click, and read with the block.
      if (kind === 'error' && mark.message) {
        block.setWarningText(wrapped(mark.message), ERROR_WARNING);
        const icon = block.getIcon(Blockly.icons.IconType.WARNING);
        if (icon && 'setBubbleVisible' in icon) void icon.setBubbleVisible(true);
      }
    }
  }

  const selected = (): NodeId[] => {
    const s = Blockly.common.getSelected();
    return s instanceof Blockly.BlockSvg && s.workspace === ws ? [s.id as NodeId] : [];
  };

  return {
    id: 'blocks',
    displayName: WORDS['editor.name']!,

    mount(element: HTMLElement, editorHost: EditorHost, view: ViewState = EMPTY_VIEW) {
      // `blockly/core` brings no words of its own: Blockly's English ones name its workspace and
      // menus for screen readers (English only, decision 0036; our own wording follows with 7.6).
      Blockly.setLocale(BlocklyEnglish as unknown as Record<string, string>);
      // A switched-off block is named so for screen readers (3i.7).
      Blockly.Msg['BLOCK_LABEL_DISABLED'] = WORDS['editor.switchedOff']!;
      defineBlocks();
      host = editorHost;
      owner = ownerIn(host.program(), view.method)?.id ?? ownerIn(host.program(), null)?.id ?? null;
      const self = typeOf(host.program(), owner);
      // Blockly's menus stay in the workspace, where its focus rules expect them: on the page, its
      // drop-down closed as it opened. The studio's stylesheet lets them show past its edge.
      registerRenderer();
      ws = Blockly.inject(element, {
        renderer: RENDERER,
        theme: storyTheme(),
        // Screen 02's dotted workspace; the stylesheet gives the dots their colour.
        grid: { spacing: 20, length: 1, colour: '#3D342C', snap: false },
        toolbox: self ? (toolboxFor(host.program(), target, self, tab) as never) : undefined,
        trashcan: false,
        sounds: false,
        move: { scrollbars: true, drag: true, wheel: true },
        zoom: { controls: false, wheel: false, startScale: options.scale ?? 1 },
      });
      // The studio keeps the one history (07-ux section 7.5): Blockly keeps none of its own, so
      // its Ctrl+Z does nothing here and the studio's undoes the step, and its menu has no Undo.
      ws.MAX_UNDO = 0;
      // Before any block is drawn: a sound block's ▾ and label read the film's sounds.
      soundsFor(ws, options);
      for (const id of BLOCKLY_MENU)
        if (Blockly.ContextMenuRegistry.registry.getItem(id))
          Blockly.ContextMenuRegistry.registry.unregister(id);
      registerKeys();
      menuActions.set(ws, (node, action) => {
        if (action.kind === 'copy' || action.kind === 'paste') clip(action.kind, node);
        else if (node !== null) void act(node, action);
      });
      ws.addChangeListener(onChange);
      stopListening = host.subscribe((change) => {
        // The editor's own steps are drawn already (a palette drop redraws itself when done).
        if (change.source !== 'blocks') rebuild();
      });
      rebuild();
      if (view.focus) this.focus(view.focus);
    },

    unmount(): ViewState {
      const view: ViewState = {
        method: owner,
        selection: selected(),
        focus: selected()[0] ?? null,
      };
      if (settling !== null) clearTimeout(settling);
      stopListening?.();
      if (ws) menuActions.delete(ws);
      ws?.dispose();
      ws = null;
      host = null;
      return view;
    },

    setPalette(next: Expression, nextTab: PaletteTab) {
      target = next;
      tab = nextTab;
      updatePalette();
    },

    openMethod(method: NodeId) {
      owner = method;
      rebuild();
    },

    highlight(marks: readonly HighlightMark[], kind: HighlightKind) {
      highlights.set(kind, marks);
      paint(kind, marks);
    },

    focus(node?: NodeId) {
      if (!ws) return;
      const block = node ? ws.getBlockById(node) : null;
      if (block) Blockly.getFocusManager().focusNode(block);
      else Blockly.getFocusManager().focusTree(ws);
    },

    selection: () => selected(),

    command(command: EditorCommand): boolean {
      const block = Blockly.common.getSelected();
      if (!(block instanceof Blockly.BlockSvg) || !host) return false;
      const id = block.id as NodeId;
      const items = menuFor(host.program(), id);
      const offered = (kind: MenuAction['kind']) => items.find((i) => i.action.kind === kind);
      switch (command) {
        case 'delete':
        case 'duplicate':
        case 'moveUp':
        case 'moveDown':
        case 'toggleEnabled': {
          // A value stays in its slot, and the method's own block stays too.
          const item = offered(command === 'toggleEnabled' ? 'switch' : command);
          if (!item) return false;
          void act(id, item.action);
          return true;
        }
        case 'addDetail':
        case 'openMenu': {
          // "add detail ▾"'s own menu, where the studio gives one; else the block's menu.
          if (command === 'addDetail' && options.chooseDetail && offered('addDetail')) {
            void chooseDetail(id);
            return true;
          }
          // Through Blockly's own menu key: `showContextMenu` is internal to Blockly.
          const menu = Blockly.ShortcutRegistry.registry.getRegistry()['menu'];
          if (items.length === 0 || !menu?.callback || !ws) return false;
          Blockly.getFocusManager().focusNode(block);
          return menu.callback(ws, new KeyboardEvent('keydown'), menu, { focusedNode: block });
        }
        case 'copy':
        case 'paste':
          return clip(command, id);
        default:
          return false;
      }
    },
  };
}
