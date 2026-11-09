/**
 * The Blocks editor (`14-editors.md` section 3i): Blockly over one method at a time, on the
 * editor contract. The program belongs to the studio: the workspace is built from it
 * (`toBlocks`), each finished gesture becomes edits (`editsFor`) applied through `host.apply` as
 * one undo step, and any change made elsewhere (undo, the Prompter, Tiles) rebuilds the method.
 * A block dropped outside the method goes back (decision 0064), as do blocks the program would
 * refuse.
 */
import * as Blockly from 'blockly/core';
import * as BlocklyEnglish from 'blockly/msg/en';
import type { Expression, ListenerDecl, MethodDecl, NodeId, Program } from '@storystage/ast';
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
import { defineBlocks } from './definitions.ts';
import { dropFromPalette, freshIn, type AskRequest, type Fresh } from './drops.ts';
import { editsFor } from './gestures.ts';
import {
  BlocksMismatch,
  SWITCHED_OFF,
  fromBlocks,
  toBlocks,
  type WorkspaceState,
} from './mapping.ts';
import blockWords from './strings/en-GB.json' with { type: 'json' };
import { toolboxFor } from './toolbox.ts';

const WORDS = blockWords as Readonly<Record<string, string>>;

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

/** The scene itself, the palette's object until the learner picks one. */
const THE_SCENE: Expression = { id: 'palscene' as NodeId, kind: 'this' };

export function createBlocksEditor(options: BlocksEditorOptions = {}): BlocksEditor {
  let ws: Blockly.WorkspaceSvg | null = null;
  let host: EditorHost | null = null;
  let owner: NodeId | null = null;
  let loading = false;
  let settling: ReturnType<typeof setTimeout> | null = null;
  let stopListening: (() => void) | null = null;
  const highlights = new Map<HighlightKind, readonly NodeId[]>();
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
      }
    } finally {
      Blockly.Events.enable();
      loading = false;
    }
    for (const [kind, nodes] of highlights) paint(kind, nodes);
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

  function onChange(e: Blockly.Events.Abstract) {
    if (loading || asking || e.isUiEvent) return;
    if (settling === null) settling = setTimeout(settle, 0);
  }

  function paint(kind: HighlightKind, nodes: readonly NodeId[]) {
    if (!ws) return;
    for (const block of ws.getAllBlocks(false)) block.removeClass(`ss-highlight-${kind}`);
    for (const id of nodes) ws.getBlockById(id)?.addClass(`ss-highlight-${kind}`);
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
      defineBlocks();
      host = editorHost;
      owner = ownerIn(host.program(), view.method)?.id ?? ownerIn(host.program(), null)?.id ?? null;
      const self = typeOf(host.program(), owner);
      ws = Blockly.inject(element, {
        toolbox: self ? (toolboxFor(host.program(), target, self, tab) as never) : undefined,
        trashcan: false,
        sounds: false,
        move: { scrollbars: true, drag: true, wheel: true },
        zoom: { controls: false, wheel: false, startScale: 1 },
      });
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
      const nodes = marks.map((m) => m.node);
      highlights.set(kind, nodes);
      paint(kind, nodes);
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
      if (!(block instanceof Blockly.BlockSvg) || block.id === owner) return false;
      switch (command) {
        case 'delete':
          if (!block.previousConnection) return false; // a value stays in its slot
          block.dispose(true);
          return true;
        case 'toggleEnabled':
          if (!block.previousConnection) return false;
          block.setDisabledReason(block.isEnabled(), SWITCHED_OFF);
          return true;
        default:
          // Copy, paste, duplicate, add detail and the menu come next.
          return false;
      }
    },
  };
}
