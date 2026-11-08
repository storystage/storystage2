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
import type { ListenerDecl, MethodDecl, NodeId, Program } from '@storystage/ast';
import {
  EMPTY_VIEW,
  type CodeEditor,
  type EditorCommand,
  type EditorHost,
  type HighlightKind,
  type ViewState,
} from '@storystage/editor-contract';
import { defineBlocks } from './definitions.ts';
import { editsFor } from './gestures.ts';
import {
  BlocksMismatch,
  SWITCHED_OFF,
  fromBlocks,
  toBlocks,
  type WorkspaceState,
} from './mapping.ts';
import blockWords from './strings/en-GB.json' with { type: 'json' };

const WORDS = blockWords as Readonly<Record<string, string>>;

/** Every method and listener in a program, by id. */
function ownerIn(program: Program, id: NodeId | null): MethodDecl | ListenerDecl | null {
  for (const t of program.types)
    for (const m of [...t.methods, ...t.listeners]) if (id === null || m.id === id) return m;
  return null;
}

export function createBlocksEditor(): CodeEditor {
  let ws: Blockly.WorkspaceSvg | null = null;
  let host: EditorHost | null = null;
  let owner: NodeId | null = null;
  let loading = false;
  let settling: ReturnType<typeof setTimeout> | null = null;
  let stopListening: (() => void) | null = null;
  const highlights = new Map<HighlightKind, readonly NodeId[]>();

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
  }

  /** After a gesture: the edits it made, one step, or the blocks back as they were. */
  function settle() {
    settling = null;
    if (!ws || !host || owner === null) return;
    if (ws.isDragging()) {
      settling = setTimeout(settle, 50);
      return;
    }
    if (ws.getTopBlocks(false).some((b) => b.id !== owner)) {
      host.announce(WORDS['editor.looseBlock']!);
      rebuild();
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
    const result = editsFor(host.program(), read);
    if (result.kind === 'none') return;
    if (result.kind === 'putBack') return rebuild();
    const applied = host.apply(result.edits, result.label, 'blocks');
    if (!applied.ok) {
      host.announce(applied.reason);
      rebuild();
    }
  }

  function onChange(e: Blockly.Events.Abstract) {
    if (loading || e.isUiEvent) return;
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
      ws = Blockly.inject(element, {
        trashcan: false,
        sounds: false,
        move: { scrollbars: true, drag: true, wheel: true },
        zoom: { controls: false, wheel: false, startScale: 1 },
      });
      ws.addChangeListener(onChange);
      stopListening = host.subscribe((change) => {
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
      ws?.dispose();
      ws = null;
      host = null;
      return view;
    },

    openMethod(method: NodeId) {
      owner = method;
      rebuild();
    },

    highlight(nodes: readonly NodeId[], kind: HighlightKind) {
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
          // Copy, paste, duplicate, add detail and the menu come with the palette and cascade.
          return false;
      }
    },
  };
}
