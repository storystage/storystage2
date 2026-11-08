/**
 * Option C as a `CodeEditor` (WP0.8 contract; spec 14, section 1). The program belongs to the
 * host: the editor draws it, redraws on every change the host reports whatever made it, and
 * hands back where the learner was when it's unmounted, so switching editors keeps their place.
 *
 * Every edit (spec 14, 3c–3e) comes from the shared model through `actions.ts`, goes to the host
 * as one labelled step, and is announced in the same words as its undo label.
 */
import {
  indexProgram,
  isStatement,
  type NodeId,
  type Program,
  type Statement,
} from '@storystage/ast';
import {
  EMPTY_VIEW,
  type CodeEditor,
  type EditorCommand,
  type EditorHost,
  type HighlightKind,
  type ViewState,
} from '@storystage/editor-contract';
import {
  canDrop,
  describer,
  type Ask,
  type CascadeOptions,
  type StatementPlace,
  type ValuePlace,
  word,
} from '@storystage/story-api/editing';
import type { Expression } from '@storystage/ast';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
  copyOf,
  duplicate,
  moveBy,
  putAt,
  removeDetail,
  removeStatement,
  setValue,
  toggleEnabled,
  type Change,
} from './actions.ts';
import { AskValue, DetailMenu, ValueMenu } from './menus.tsx';
import { isWhereItIs, place, placeKey, placesIn, whereIs } from './places.ts';
import { tileVariables } from './tokens.ts';
import {
  TilesView,
  type FocusKey,
  type Highlights,
  type KeyAction,
  type Moving,
  type ValuePill,
} from './view.tsx';
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

type Menu =
  | {
      readonly kind: 'value';
      readonly place: ValuePlace;
      readonly label: string;
      readonly anchor: Element;
      readonly detail?: string;
      /** The words of the value there now, for the menu to mark. */
      readonly current?: string;
    }
  | {
      readonly kind: 'ask';
      readonly place: ValuePlace;
      readonly label: string;
      readonly anchor: Element;
      readonly ask: Ask;
    }
  | { readonly kind: 'details'; readonly node: NodeId; readonly anchor: Element };

interface MovingState extends Moving {
  /** The places a keyboard move steps through, each one it may go. */
  readonly stops: readonly StatementPlace[];
}

export type TileEditorOptions = CascadeOptions;

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
  private menu: Menu | null = null;
  private moving: MovingState | null = null;
  private clipboard: Statement | null = null;
  private refocus = false;

  private readonly options: TileEditorOptions;

  /** `jointsOf` and `references` feed the cascade from the scene and Backstage (spec 14, 2.3). */
  constructor(options: TileEditorOptions = {}) {
    this.options = options;
  }

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
    this.menu = this.moving = null;
    return view;
  }

  openMethod(method: NodeId): void {
    this.method = method;
    this.focusKey = null;
    this.menu = this.moving = null;
    this.render();
  }

  highlight(nodes: readonly NodeId[], kind: HighlightKind): void {
    this.highlights = { ...this.highlights, [kind]: new Set(nodes) };
    this.render();
  }

  focus(node?: NodeId): void {
    if (node) this.focusKey = node;
    this.refocus = true;
    this.render();
  }

  selection(): readonly NodeId[] {
    return this.host && isNode(this.host.program(), this.focusKey) ? [this.focusKey] : [];
  }

  command(command: EditorCommand): boolean {
    const key = this.focusKey;
    if (!key || !this.host) return false;
    switch (command) {
      case 'delete':
        return this.act('delete', key);
      case 'copy':
        return this.act('copy', key);
      case 'paste':
        return this.act('paste', key);
      case 'duplicate':
        return this.act('duplicate', key);
      case 'moveUp':
        return this.act('moveUp', key);
      case 'moveDown':
        return this.act('moveDown', key);
      case 'toggleEnabled':
        return this.act('toggle', key);
      case 'openMenu':
      case 'addDetail': {
        const el = this.element?.querySelector<HTMLElement>(
          command === 'addDetail'
            ? `[data-detail="${CSS.escape(key)}"]`
            : `[data-key="${CSS.escape(key)}"][data-pill]`,
        );
        el?.click();
        return !!el;
      }
    }
  }

  // ---- Edits --------------------------------------------------------------------------------

  /** Sends a change to the host as one step, and says what happened. */
  private apply(change: Change): boolean {
    const host = this.host;
    if (!host) return false;
    if (!change.ok) {
      if (change.reason) host.announce(change.reason);
      return false;
    }
    if (change.focus) this.focusKey = change.focus;
    this.refocus = true;
    const result = host.apply(change.edits, change.label, this.id);
    host.announce(result.ok ? change.label : result.reason);
    this.render();
    return result.ok;
  }

  private statementAt(key: FocusKey): Statement | null {
    const node = this.host && indexProgram(this.host.program()).get(key as NodeId)?.node;
    return node && isStatement(node) ? node : null;
  }

  private act(action: KeyAction, key: FocusKey): boolean {
    const host = this.host;
    if (!host) return false;
    const program = host.program();
    const statement = this.statementAt(key);
    switch (action) {
      case 'delete':
        return !!statement && this.apply(removeStatement(program, statement.id));
      case 'toggle':
        return !!statement && this.apply(toggleEnabled(program, statement.id));
      case 'duplicate':
        return !!statement && this.apply(duplicate(program, statement.id));
      case 'moveUp':
      case 'moveDown':
        return (
          !!statement && this.apply(moveBy(program, statement.id, action === 'moveUp' ? -1 : 1))
        );
      case 'copy':
        if (!statement) return false;
        this.clipboard = statement;
        host.announce(t('copied', { what: describer(program)(statement) }));
        return true;
      case 'paste': {
        if (!this.clipboard) {
          host.announce(t('nothingCopied'));
          return false;
        }
        const where = statement ? whereIs(program, statement.id) : null;
        const [parent, slot] = key.split('/') as [NodeId, StatementPlace['slot']];
        const at = where
          ? place(where.parent, where.slot, where.index + 1)
          : place(parent, slot ?? 'body', 0);
        return this.apply(putAt(program, at, copyOf(program, this.clipboard)));
      }
      case 'pickUp':
        return !!statement && this.pickUp(statement.id);
      case 'next':
      case 'previous':
        return this.step(action === 'next' ? 1 : -1);
      case 'putDown':
        return this.putDown();
      case 'cancel':
        return this.cancelMove();
    }
  }

  // ---- Moving -------------------------------------------------------------------------------

  /** The places a statement may go, with where it is now as a stop too. */
  private stopsFor(program: Program, node: NodeId): StatementPlace[] {
    const where = whereIs(program, node);
    if (this.method === null || !where) return [];
    const here = placeKey(place(where.parent, where.slot, where.index));
    // Just below itself is the same position, so it isn't a stop of its own.
    const below = placeKey(place(where.parent, where.slot, where.index + 1));
    return placesIn(program, this.method).filter((p) => {
      const key = placeKey(p);
      return key === here || (key !== below && canDrop(program, p, { existing: node }).ok);
    });
  }

  private pickUp(node: NodeId): boolean {
    const program = this.host!.program();
    const where = whereIs(program, node);
    if (!where) return false;
    const stops = this.stopsFor(program, node);
    const at =
      stops.find((p) => placeKey(p) === placeKey(place(where.parent, where.slot, where.index))) ??
      null;
    this.moving = { node, at, stops };
    this.host!.announce(
      t('moving', { what: describer(program)(indexProgram(program).get(node)!.node) }),
    );
    this.render();
    return true;
  }

  private step(delta: 1 | -1): boolean {
    const moving = this.moving;
    if (!moving?.at) return false;
    const i = moving.stops.findIndex((p) => placeKey(p) === placeKey(moving.at!));
    const at = moving.stops[i + delta];
    if (!at) return false;
    this.moving = { ...moving, at };
    this.host!.announce(this.placeWords(at));
    this.render();
    return true;
  }

  private placeWords(at: StatementPlace): string {
    const program = this.host!.program();
    const parent = indexProgram(program).get(at.parent)?.node;
    const describe = describer(program);
    const holder = parent as unknown as Record<string, readonly Statement[]> | undefined;
    const total = (holder?.[at.slot]?.length ?? 0) + 1;
    const owner = describe.ownerOf(at.parent);
    const type = owner ? indexProgram(program).get(owner)?.node : undefined;
    const where = !parent
      ? ''
      : parent.kind === 'method' && type && 'name' in type
        ? t('method', { type: type.name, method: parent.name })
        : parent.kind === 'method' || parent.kind === 'listener'
          ? describe(parent)
          : describe.short(parent);
    return t('dropsAt', { n: String(at.index + 1), total: String(total), where });
  }

  private putDown(): boolean {
    const moving = this.moving;
    const program = this.host!.program();
    this.moving = null;
    if (!moving?.at || isWhereItIs(program, moving.node, moving.at)) {
      this.host!.announce(t('cancelled'));
      this.focusKey = moving?.node ?? this.focusKey;
      this.refocus = true;
      this.render();
      return false;
    }
    return this.apply(putAt(program, moving.at, { existing: moving.node }));
  }

  private cancelMove(): boolean {
    const node = this.moving?.node;
    this.moving = null;
    this.host?.announce(t('cancelled'));
    if (node) this.focusKey = node;
    this.refocus = true;
    this.render();
    return true;
  }

  // ---- Menus --------------------------------------------------------------------------------

  private openValue(pill: ValuePill, anchor: Element): void {
    const detail = pill.place.slot === 'details' ? pill.place.param : undefined;
    this.menu = {
      kind: 'value',
      place: pill.place,
      label: pill.label,
      anchor,
      ...(detail ? { detail } : {}),
      ...(pill.empty ? {} : { current: pill.text }),
    };
    this.render();
  }

  private closeMenu(): void {
    this.menu = null;
    this.refocus = true;
    this.render();
  }

  private chose(value: Expression, at: ValuePlace): void {
    this.menu = null;
    this.apply(setValue(this.host!.program(), at, value));
  }

  private renderMenu(program: Program) {
    const menu = this.menu;
    if (!menu) return null;
    const close = () => this.closeMenu();
    if (menu.kind === 'details')
      return (
        <DetailMenu
          program={program}
          node={menu.node}
          anchor={menu.anchor}
          onClose={close}
          onChoose={(detail) => {
            this.menu = {
              kind: 'value',
              place: { kind: 'value', node: menu.node, slot: 'details', param: detail },
              label: word(`detail.${detail}`),
              anchor: menu.anchor,
            };
            this.render();
          }}
        />
      );
    if (menu.kind === 'ask')
      return (
        <AskValue
          program={program}
          place={menu.place}
          ask={menu.ask}
          label={menu.label}
          anchor={menu.anchor}
          onClose={close}
          onAnswer={(value) => this.chose(value, menu.place)}
        />
      );
    return (
      <ValueMenu
        program={program}
        place={menu.place}
        label={menu.label}
        anchor={menu.anchor}
        options={this.options}
        {...(menu.current === undefined ? {} : { current: menu.current })}
        onClose={close}
        onChoose={(value) => this.chose(value, menu.place)}
        onAsk={(ask) => {
          this.menu = {
            kind: 'ask',
            place: menu.place,
            label: menu.label,
            anchor: menu.anchor,
            ask,
          };
          this.render();
        }}
        {...(menu.detail
          ? {
              detail: menu.detail,
              onRemoveDetail: () => {
                this.menu = null;
                this.apply(removeDetail(program, menu.place.node, menu.detail!));
              },
            }
          : {})}
      />
    );
  }

  // ---- Drawing ------------------------------------------------------------------------------

  private render(): void {
    const host = this.host;
    if (!host || !this.root) return;
    const program = host.program();
    flushSync(() =>
      this.root!.render(
        <div className="tl-root" style={tileVariables()}>
          <TilesView
            program={program}
            method={this.method}
            focus={this.focusKey}
            highlights={this.highlights}
            moving={this.moving}
            onFocus={(key) => {
              this.focusKey = key;
              this.render();
            }}
            onAction={(action, key) => void this.act(action, key)}
            onOpenValue={(pill, anchor) => this.openValue(pill, anchor)}
            onOpenDetails={(node, anchor) => {
              this.menu = { kind: 'details', node, anchor };
              this.render();
            }}
            onDragStart={(node) => {
              this.moving = { node, at: null, stops: [] };
              this.render();
            }}
            onDragOver={(at) => {
              if (!this.moving) return;
              const ok =
                at &&
                (isWhereItIs(program, this.moving.node, at) ||
                  canDrop(program, at, { existing: this.moving.node }).ok);
              const next = ok ? at : null;
              if ((next && placeKey(next)) === (this.moving.at && placeKey(this.moving.at))) return;
              this.moving = { ...this.moving, at: next };
              this.render();
            }}
            onDragEnd={(drop) => void (drop ? this.putDown() : this.cancelMove())}
          />
          {this.renderMenu(program)}
        </div>,
      ),
    );
    if (this.refocus && !this.menu) {
      this.refocus = false;
      const key = this.focusKey;
      const target = key
        ? this.element?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
        : null;
      (target ?? this.element?.querySelector<HTMLElement>('[tabindex="0"]'))?.focus();
    }
  }
}
