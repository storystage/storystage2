/**
 * WP0.8 contract: what both code editors implement (option B, `packages/blocks`; option C,
 * `packages/tiles`) and what the studio gives them. The program belongs to the studio; an
 * editor only shows it and proposes edits, so switching editors (WP7.11) keeps the program,
 * the undo history and, through `ViewState`, where the learner was.
 *
 * Owner: S1 until both editors exist, then S5 (blocks) and S6 (tiles) jointly. A change here is
 * a `contract` pull request both of them review. Spike 1.5 showed the rules that refuse a drop
 * and the cascade that asks for arguments can be shared; they belong with the Story API's
 * metadata (WP4.2), not with either editor.
 */
import type { EditOperation, NodeId, Program } from '@storystage/ast';

export const EDITOR_IDS = ['blocks', 'tiles'] as const;
export type EditorId = (typeof EDITOR_IDS)[number];

/** Where a change came from, so an editor can tell its own edits from everyone else's. */
export type ChangeSource = EditorId | 'prompter' | 'undo' | 'redo' | 'stage' | 'load';

export interface ProgramChange {
  readonly program: Program;
  readonly edits: readonly EditOperation[];
  /** The undo step's plain-words label ("Add cat"). */
  readonly label: string;
  readonly source: ChangeSource;
}

export type EditResult =
  | { readonly ok: true }
  /** Refused (invalid, or the editor is locked). `reason` is in plain words for the learner. */
  | { readonly ok: false; readonly reason: string };

/** Provided by the studio to whichever editor is showing. */
export interface EditorHost {
  program(): Program;
  /**
   * Applies edits as **one** undo step with a plain-words label ("Make cat say Hello"). The host
   * validates them (WP2.2) and refuses the whole step if any is invalid.
   */
  apply(edits: readonly EditOperation[], label: string, source: EditorId): EditResult;
  /** Called after every change, whatever made it. Returns a function that stops listening. */
  subscribe(listener: (change: ProgramChange) => void): () => void;
  undo(): void;
  redo(): void;
  /** The label of the step `undo` would undo, if any ("Undo: Add cat"). */
  undoLabel(): string | null;
  redoLabel(): string | null;
  /** Says something to screen-reader users through the studio's live region (WP7.8). */
  announce(text: string): void;
  /** From policy (WP15.3): `editor.locked` stops the learner switching editors. */
  readonly policy: { readonly editorLocked: boolean };
}

/** Where the learner was, handed from one editor to the other when they switch (WP7.11). */
export interface ViewState {
  /** The method open in the editor (one method per tab). */
  readonly method: NodeId | null;
  readonly selection: readonly NodeId[];
  /** The block with keyboard focus. */
  readonly focus: NodeId | null;
}

export const EMPTY_VIEW: ViewState = { method: null, selection: [], focus: null };

/** Highlights from Rehearse (running blocks), errors, and the Prompter pointing at blocks (WP7.9). */
export type HighlightKind = 'rehearse' | 'error' | 'prompter';

/** Commands the studio's keyboard shortcuts and menus send to the editor showing. */
export const EDITOR_COMMANDS = [
  'delete',
  'copy',
  'paste',
  'duplicate',
  'moveUp',
  'moveDown',
  'toggleEnabled',
  'addDetail',
  'openMenu',
] as const;
export type EditorCommand = (typeof EDITOR_COMMANDS)[number];

export interface CodeEditor {
  readonly id: EditorId;
  /** The name learners see on the switch ("Blocks", "Tiles"). */
  readonly displayName: string;
  /** Shows the program in `element`, opening where `view` says (or at the start). */
  mount(element: HTMLElement, host: EditorHost, view?: ViewState): void;
  /** Removes the editor and returns where the learner was, for the other editor. */
  unmount(): ViewState;
  openMethod(method: NodeId): void;
  /** Replaces the highlights of this kind. An empty list clears them. */
  highlight(nodes: readonly NodeId[], kind: HighlightKind): void;
  /** Moves keyboard focus to a block, or into the editor. */
  focus(node?: NodeId): void;
  selection(): readonly NodeId[];
  /** Runs a command on the selection. Returns false if it doesn't apply here. */
  command(command: EditorCommand): boolean;
}
