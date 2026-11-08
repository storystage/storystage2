/**
 * Option C as a `CodeEditor` (WP0.8 contract; spec 14, section 1). The program belongs to the
 * host: the editor draws it, redraws on every change the host reports whatever made it, and
 * hands back where the learner was when it's unmounted, so switching editors keeps their place.
 *
 * Read-only for now: `command` refuses everything until editing arrives (spec 14, 3c–3e).
 */
import { indexProgram, type NodeId, type Program } from '@storystage/ast';
import {
  EMPTY_VIEW,
  type CodeEditor,
  type EditorCommand,
  type EditorHost,
  type HighlightKind,
  type ViewState,
} from '@storystage/editor-contract';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { tileVariables } from './tokens.ts';
import { TilesView, type FocusKey, type Highlights } from './view.tsx';
import { t } from './words.ts';
import './tiles.css';

const NO_HIGHLIGHTS: Highlights = { rehearse: new Set(), error: new Set(), prompter: new Set() };

/** The first method or listener of the first type that has one. */
function firstMethod(program: Program): NodeId | null {
  for (const type of program.types) {
    const first = type.methods[0] ?? type.listeners[0];
    if (first) return first.id;
  }
  return null;
}

/** Whether a focus key is a node (not an empty list) still in the program. */
const isNode = (program: Program, key: FocusKey | null): key is NodeId =>
  key !== null && indexProgram(program).has(key as NodeId);

export class TileEditor implements CodeEditor {
  readonly id = 'tiles' as const;
  readonly displayName = t('name');

  private host: EditorHost | null = null;
  private root: Root | null = null;
  private element: HTMLElement | null = null;
  private stop: (() => void) | null = null;
  private method: NodeId | null = null;
  private focusKey: FocusKey | null = null;
  private highlights: Highlights = NO_HIGHLIGHTS;

  mount(element: HTMLElement, host: EditorHost, view: ViewState = EMPTY_VIEW): void {
    this.host = host;
    this.element = element;
    this.method = view.method ?? firstMethod(host.program());
    this.focusKey = view.focus ?? view.selection[0] ?? null;
    this.root = createRoot(element);
    this.stop = host.subscribe(() => this.render());
    this.render();
  }

  unmount(): ViewState {
    const view: ViewState = {
      method: this.method,
      selection: this.selection(),
      focus: this.host && isNode(this.host.program(), this.focusKey) ? this.focusKey : null,
    };
    this.stop?.();
    this.root?.unmount();
    this.host = this.root = this.element = this.stop = null;
    return view;
  }

  openMethod(method: NodeId): void {
    this.method = method;
    this.focusKey = null;
    this.render();
  }

  highlight(nodes: readonly NodeId[], kind: HighlightKind): void {
    this.highlights = { ...this.highlights, [kind]: new Set(nodes) };
    this.render();
  }

  focus(node?: NodeId): void {
    if (node) this.focusKey = node;
    this.render();
    const key = this.focusKey;
    const target = key
      ? this.element?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
      : null;
    (target ?? this.element?.querySelector<HTMLElement>('[tabindex="0"]'))?.focus();
  }

  selection(): readonly NodeId[] {
    return this.host && isNode(this.host.program(), this.focusKey) ? [this.focusKey] : [];
  }

  command(_command: EditorCommand): boolean {
    return false;
  }

  private render(): void {
    const host = this.host;
    if (!host || !this.root) return;
    flushSync(() =>
      this.root!.render(
        <div className="tl-root" style={tileVariables()}>
          <TilesView
            program={host.program()}
            method={this.method}
            focus={this.focusKey}
            highlights={this.highlights}
            onFocus={(key) => {
              this.focusKey = key;
              this.render();
            }}
          />
        </div>,
      ),
    );
  }
}
