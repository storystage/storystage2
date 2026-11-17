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
  idMinter,
  type Expression,
  type ListenerDecl,
  type MethodDecl,
  type NodeId,
  type Program,
} from '@storystage/ast';
import { STORY_WORDS } from '@storystage/story-api';
import type { PaletteTab } from '@storystage/story-api/editing';
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
import { dropFromPalette, freshIn, type AskRequest, type Fresh } from './drops.ts';
import { editsFor } from './gestures.ts';
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

/** Each workspace's menu actions: Blockly's menus and keys are shared by every workspace. */
const menuActions = new WeakMap<Blockly.Workspace, (block: NodeId, action: MenuAction) => void>();

/** The block a key acts on: the one with focus, or the one a value stands in. */
function blockFor(scope: { focusedNode?: unknown }): Blockly.BlockSvg | null {
  let node = scope.focusedNode;
  while (node instanceof Blockly.BlockSvg && node.isShadow()) node = node.getParent();
  return node instanceof Blockly.BlockSvg ? node : null;
}

/**
 * Our keys, as in Tiles (`14-editors.md` section 3d): Ctrl+/ switches a statement off or on and
 * Ctrl+D duplicates it (Cmd on a Mac or iPad). Blockly's D makes a loose copy, so it goes.
 */
function registerKeys() {
  const keys = Blockly.ShortcutRegistry.registry;
  const { KeyCodes } = Blockly.utils;
  const both = (code: number) => [
    keys.createSerializedKey(code, [KeyCodes.CTRL]),
    keys.createSerializedKey(code, [KeyCodes.META]),
  ];
  if (keys.getRegistry()['duplicate']) keys.unregister('duplicate');
  const ours = [
    ['ss_switch', KeyCodes.SLASH, { kind: 'switch' }],
    ['ss_duplicate', KeyCodes.D, { kind: 'duplicate' }],
  ] as const;
  for (const [name, code, action] of ours) {
    if (keys.getRegistry()[name]) continue;
    keys.register({
      name,
      preconditionFn: (ws) => !ws.isDragging() && menuActions.has(ws),
      callback: (ws, e, _shortcut, scope) => {
        const block = blockFor(scope);
        const run = menuActions.get(ws);
        if (!block || !run || block.workspace !== ws) return false;
        e.preventDefault();
        run(block.id as NodeId, action);
        return true;
      },
      keyCodes: both(code),
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

export interface BlocksEditorOptions {
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
}

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
  const flyout = ws.getFlyout()?.getWorkspace().getParentSvg();
  for (const path of flyout?.querySelectorAll('.blocklyHighlightedConnectionPath') ?? [])
    path.setAttribute('aria-hidden', 'true');
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
  let loading = false;
  let settling: ReturnType<typeof setTimeout> | null = null;
  let stopListening: (() => void) | null = null;
  const highlights = new Map<HighlightKind, readonly HighlightMark[]>();
  let target: Expression = THE_SCENE;
  let tab: PaletteTab = 'actions';
  /** While the cascade asks about a dropped block, the workspace waits. */
  let asking = false;
  /** A palette drop just applied: redraw when it comes back, to show the program's own ids. */
  let redraw = false;

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
        for (const block of ws.getAllBlocks(false)) block.customContextMenu = menuOn(block);
      }
    } finally {
      Blockly.Events.enable();
      loading = false;
    }
    for (const [kind, marks] of highlights) paint(kind, marks);
    updatePalette();
  }

  /** After a gesture: the edits it made, one step, or the blocks back as they were. */
  function settle() {
    settling = null;
    if (!ws || !host || owner === null) return;
    if (ws.isDragging()) {
      settling = setTimeout(settle, 50);
      return;
    }
    let read;
    try {
      read = fromBlocks(Blockly.serialization.workspaces.save(ws) as WorkspaceState);
    } catch (e) {
      if (!(e instanceof BlocksMismatch)) throw e;
      rebuild();
      return;
    }
    // A block from the palette, landed in the method. (A value it took the place of is left
    // loose on the workspace by Blockly; the drop's edits take it out.)
    const fresh = freshIn(host.program(), read);
    if (fresh.length === 1) return void dropped(fresh[0]!);
    if (fresh.length > 1) return rebuild();
    if (ws.getTopBlocks(false).some((b) => b.id !== owner)) {
      host.announce(WORDS['editor.looseBlock']!);
      rebuild();
      return;
    }
    const result = editsFor(host.program(), read);
    if (result.kind === 'none') return;
    if (result.kind === 'putBack') return rebuild();
    const applied = host.apply(result.edits, result.label, 'blocks');
    if (!applied.ok) {
      host.announce(applied.reason);
      rebuild();
    }
  }

  /** A block from the palette: placed, its values asked for, then one step (or nothing). */
  async function dropped(fresh: Fresh) {
    if (!host) return;
    const anchor = ws?.getBlockById(fresh.node.id)?.getSvgRoot() ?? null;
    asking = true;
    try {
      const ask = options.ask;
      const outcome = await dropFromPalette(
        host.program(),
        fresh,
        ask ? (request) => ask({ ...request, anchor }) : null,
      );
      if (!host) return;
      if (outcome.kind === 'refused') host.announce(outcome.reason);
      if (outcome.kind === 'edits') {
        const applied = host.apply(outcome.edits, outcome.label, 'blocks');
        if (applied.ok) redraw = true;
        else host.announce(applied.reason);
      }
    } finally {
      asking = false;
      // The new blocks take the program's ids, and a cancelled drop goes.
      rebuild();
    }
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
    if (loading || asking || e.isUiEvent) return;
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
      // Blockly's menus and text fields go on the page, not in the workspace, which clips them:
      // a block near the workspace's edge would have its menu cut off.
      Blockly.common.setParentContainer(element.ownerDocument.body);
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
      for (const id of BLOCKLY_MENU)
        if (Blockly.ContextMenuRegistry.registry.getItem(id))
          Blockly.ContextMenuRegistry.registry.unregister(id);
      registerKeys();
      menuActions.set(ws, (node, action) => void act(node, action));
      ws.addChangeListener(onChange);
      stopListening = host.subscribe((change) => {
        if (change.source !== 'blocks' || redraw) {
          redraw = false;
          rebuild();
        }
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
        case 'toggleEnabled': {
          // A value stays in its slot, and the method's own block stays too.
          const item = offered(command === 'toggleEnabled' ? 'switch' : command);
          if (!item) return false;
          void act(id, item.action);
          return true;
        }
        case 'addDetail':
        case 'openMenu': {
          // Through Blockly's own menu key: `showContextMenu` is internal to Blockly.
          const menu = Blockly.ShortcutRegistry.registry.getRegistry()['menu'];
          if (items.length === 0 || !menu?.callback || !ws) return false;
          Blockly.getFocusManager().focusNode(block);
          return menu.callback(ws, new KeyboardEvent('keydown'), menu, { focusedNode: block });
        }
        default:
          // Copy, paste, and moving a statement up or down come next.
          return false;
      }
    },
  };
}
