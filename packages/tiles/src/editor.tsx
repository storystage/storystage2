/**
 * Option C as a `CodeEditor` (WP0.8 contract; spec 14, section 1). The program belongs to the
 * host: the editor draws it, redraws on every change the host reports whatever made it, and
 * hands back where the learner was when it's unmounted, so switching editors keeps their place.
 *
 * Every edit (spec 14, 3c–3e) comes from the shared model through `actions.ts`, goes to the host
 * as one labelled step, and is announced in the same words as its undo label. A new block from
 * the palette or the control bar (3a) is filled in a preview first (`insert.ts`), so it reaches
 * the host as one step, or not at all.
 */
import { idMinter, isStatement, type NodeId, type Program, type Statement } from '@storystage/ast';
import {
  EMPTY_VIEW,
  type CodeEditor,
  type EditorCommand,
  type EditorHost,
  type HighlightKind,
  type HighlightMark,
  type ViewState,
} from '@storystage/editor-contract';
import {
  canDrop,
  describer,
  namesAt,
  newAssign,
  newCall,
  newControl,
  newLocal,
  type Ask,
  type CascadeOptions,
  type ControlKind,
  type NameInScope,
  type PaletteItem,
  type PaletteTab,
  type Place,
  type StatementPlace,
  type ValuePlace,
  readyFor,
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
import { asksFirst, ControlBar, type BarKind } from './controls.tsx';
import {
  addListener,
  answerSlot,
  beginInsert,
  insertionPlace,
  isPending,
  targets,
  type Pending,
} from './insert.ts';
import {
  AskValue,
  ChooseVariable,
  DetailMenu,
  NewVariable,
  ValueMenu,
  type VariableType,
} from './menus.tsx';
import { MethodsPanel } from './panel.tsx';
import { MethodTabs } from './tabs.tsx';
import { indexOf, isWhereItIs, place, placeKey, placesIn, whereIs } from './places.ts';
import { tileVariables } from './tokens.ts';
import {
  placeAt,
  TilesView,
  type FocusKey,
  type Highlights,
  type KeyAction,
  type Moving,
  type ValuePill,
} from './view.tsx';
import { t } from './words.ts';
import './tiles.css';

const NO_HIGHLIGHTS: Highlights = { rehearse: new Map(), error: new Map(), prompter: new Map() };

/** The first method or listener of the first type that has one. */
function firstMethod(program: Program): NodeId | null {
  for (const type of program.types) {
    const first = type.methods[0] ?? type.listeners[0];
    if (first) return first.id;
  }
  return null;
}

/** How long the pointer stays on a place during a drag before the place is checked. */
const SETTLE_MS = 60;

/** Whether a focus key is a node (not an empty list) still in the program. */
const isNode = (program: Program, key: FocusKey | null): key is NodeId =>
  key !== null && indexOf(program).has(key as NodeId);

type Menu =
  | {
      readonly kind: 'value';
      readonly place: ValuePlace;
      readonly label: string;
      readonly anchor: Element;
      readonly detail?: string;
      /** The words of the value there now, for the menu to mark. */
      readonly current?: string;
      /** It asks for a value of a block being put in (`pending`). */
      readonly pending?: true;
    }
  | {
      readonly kind: 'ask';
      readonly place: ValuePlace;
      readonly label: string;
      readonly anchor: Element;
      readonly ask: Ask;
      readonly pending?: true;
    }
  | { readonly kind: 'details'; readonly node: NodeId; readonly anchor: Element }
  /** The variable tile's question, for a variable at `at`: its name and what it holds. */
  | {
      readonly kind: 'variable';
      readonly at: StatementPlace;
      readonly anchor: Element;
      readonly taken: readonly string[];
    }
  /** The set tile's question, for an assignment at `at`: which variable. */
  | {
      readonly kind: 'assign';
      readonly at: StatementPlace;
      readonly anchor: Element;
      readonly names: readonly NameInScope[];
    };

interface MovingState extends Moving {
  /**
   * Every place in the method, in reading order, that a keyboard move steps through, skipping
   * those it may not go. Each is checked only when a step reaches it, so picking a statement up
   * in a long method costs one walk, not a check of every place (spec 14, 3h).
   */
  readonly stops: readonly StatementPlace[];
}

export interface TileEditorOptions extends CascadeOptions {
  /** Told each time a row is drawn, not when one is skipped: for measuring spec 14, 3h. */
  readonly onRowDrawn?: (node: NodeId) => void;
}

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
  /** The palette's object (a field's id, or `this`) and tab. */
  private target = 'this';
  private tab: PaletteTab = 'actions';
  /** A new block being filled before it goes in. */
  private pending: Pending | null = null;
  /** The value pill last in focus, where a question from the palette goes. */
  private pill: ValuePill | null = null;
  /** A new block being dragged from the palette or the control bar. */
  private fresh: Statement | null = null;
  /** Being dragged from the bar: a variable or set tile, which asks its question once dropped. */
  private freshAsk: 'variable' | 'assign' | null = null;
  /** During a drag: the place the pointer is over, and what each place checked so far said. */
  private over: string | null = null;
  private verdicts = new Map<string, boolean>();
  /** A check waiting for the frame to be drawn. */
  private checking: (() => void) | null = null;

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
    this.menu = this.moving = this.pending = this.fresh = null;
    return view;
  }

  openMethod(method: NodeId): void {
    this.method = method;
    this.focusKey = null;
    this.pill = null;
    this.menu = this.moving = this.pending = null;
    this.render();
  }

  highlight(marks: readonly HighlightMark[], kind: HighlightKind): void {
    const byNode = new Map(marks.map((m) => [m.node, m.message] as const));
    this.highlights = { ...this.highlights, [kind]: byNode };
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
    const before = host.program();
    const result = host.apply(change.edits, change.label, this.id);
    host.announce(result.ok ? change.label : result.reason);
    // A change reaches the editor as the host's notice, which draws it; drawing again here would
    // draw a long method twice for one edit (spec 14, 3h). Only a refusal is drawn here.
    if (host.program() === before) this.render();
    return result.ok;
  }

  private statementAt(key: FocusKey): Statement | null {
    const node = this.host && indexOf(this.host.program()).get(key as NodeId)?.node;
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

  /** Whether a statement may stop at `p`: where it is now, or anywhere it may go. */
  private canStop(program: Program, node: NodeId, p: StatementPlace): boolean {
    const where = whereIs(program, node);
    if (!where) return false;
    const key = placeKey(p);
    if (key === placeKey(place(where.parent, where.slot, where.index))) return true;
    // Just below itself is the same position, so it isn't a stop of its own.
    if (key === placeKey(place(where.parent, where.slot, where.index + 1))) return false;
    return canDrop(program, p, { existing: node }).ok;
  }

  private pickUp(node: NodeId): boolean {
    const program = this.host!.program();
    const where = whereIs(program, node);
    if (!where || this.method === null) return false;
    const stops = placesIn(program, this.method);
    const here = placeKey(place(where.parent, where.slot, where.index));
    const at = stops.find((p) => placeKey(p) === here) ?? null;
    this.moving = { node, at, stops };
    this.host!.announce(
      t('moving', { what: describer(program)(indexOf(program).get(node)!.node) }),
    );
    this.render();
    return true;
  }

  private step(delta: 1 | -1): boolean {
    const moving = this.moving;
    if (!moving?.at) return false;
    const program = this.host!.program();
    const now = placeKey(moving.at);
    let i = moving.stops.findIndex((p) => placeKey(p) === now) + delta;
    while (moving.stops[i] && !this.canStop(program, moving.node, moving.stops[i]!)) i += delta;
    const at = moving.stops[i];
    if (!at) return false;
    this.moving = { ...moving, at };
    this.host!.announce(this.placeWords(at));
    this.render();
    return true;
  }

  private placeWords(at: StatementPlace): string {
    const program = this.host!.program();
    const parent = indexOf(program).get(at.parent)?.node;
    const describe = describer(program);
    const holder = parent as unknown as Record<string, readonly Statement[]> | undefined;
    const total = (holder?.[at.slot]?.length ?? 0) + 1;
    const owner = describe.ownerOf(at.parent);
    const type = owner ? indexOf(program).get(owner)?.node : undefined;
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

  // ---- New blocks ---------------------------------------------------------------------------

  /** The type the open method belongs to: what `this` is, and where new events go. */
  private ownerType(program: Program): NodeId | null {
    const index = indexOf(program);
    for (
      let at = this.method ? index.get(this.method) : undefined;
      at;
      at = at.parent ? index.get(at.parent) : undefined
    )
      if (at.node.kind === 'type') return at.node.id;
    return null;
  }

  private targetExpression(program: Program, mint: () => NodeId) {
    const type = this.ownerType(program);
    if (!type) return null;
    const all = targets(program, type);
    return (all.find((x) => x.key === this.target) ?? all[0])?.make(mint) ?? null;
  }

  /** Starts putting in a block: straight in if it needs nothing, else the cascade asks first. */
  private begin(node: Statement | Expression, at: Place): void {
    const program = this.host!.program();
    const started = beginInsert(program, at, node);
    if (!isPending(started)) {
      this.apply(started);
      return;
    }
    this.pending = started;
    this.render();
  }

  private insertFromPalette(item: PaletteItem): void {
    const program = this.host!.program();
    const mint = idMinter(program);
    const target = this.targetExpression(program, mint);
    if (!target || this.method === null) return;
    const question = item.tab === 'questions';
    const node = newCall(program, target, item.callee, question, mint);
    if (question) {
      if (!this.pill) {
        this.host!.announce(t('needsValue'));
        return;
      }
      this.begin(node, this.pill.place);
      return;
    }
    this.begin(node, insertionPlace(program, this.method, this.focusKey));
  }

  private insertControl(kind: BarKind): void {
    const program = this.host!.program();
    if (this.method === null) return;
    const at = insertionPlace(program, this.method, this.focusKey);
    if (asksFirst(kind)) return this.askFirst(kind, at);
    this.begin(newControl(kind, idMinter(program)), at);
  }

  /**
   * The variable or set tile, for a place: ask its question by the tile, then put it in through
   * the cascade like any other block (spec 14, 2.3). Set needs a variable there that may change.
   */
  private askFirst(kind: 'variable' | 'assign', at: StatementPlace): void {
    if (!this.element) return;
    const names = namesAt(this.host!.program(), at);
    const anchor =
      this.element.querySelector(`[data-kind="${kind}"]`) ?? this.element.querySelector('.tl-tree');
    if (!anchor) return;
    if (kind === 'variable') {
      this.menu = { kind, at, anchor, taken: names.map((v) => v.name) };
    } else {
      const settable = names.filter((v) => v.assignable);
      if (settable.length === 0) {
        this.host!.announce(t('assign.none'));
        this.render();
        return;
      }
      this.menu = { kind, at, anchor, names: settable };
    }
    this.render();
  }

  /** The variable or set tile's question was answered: the block, then the cascade. */
  private answered(node: Statement, at: StatementPlace): void {
    this.menu = null;
    this.begin(node, at);
  }

  /** The value being asked for is chosen: ask the next, or put the finished block in. */
  private answerPending(value: Expression): void {
    const pending = this.pending;
    this.menu = null;
    if (!pending) return;
    const next = answerSlot(pending, value);
    if (isPending(next)) {
      this.pending = next;
      this.render();
      return;
    }
    this.pending = null;
    this.apply(next);
  }

  private cancelPending(): void {
    this.pending = null;
    this.menu = null;
    this.host?.announce(t('nothingAdded'));
    this.refocus = true;
    this.render();
  }

  /** Opens the cascade for the value a pending block is waiting for, on its pill. */
  private askPending(): void {
    const pending = this.pending;
    if (!pending || this.menu || !this.element) return;
    const slot = pending.slots[pending.step]!;
    const holder = pending.node as unknown as Record<string, unknown>;
    const values = holder[slot.slot] as Record<string, { id: string }> | { id: string } | undefined;
    const value = (
      slot.param === undefined ? values : (values as Record<string, { id: string }>)?.[slot.param]
    ) as { id: string } | undefined;
    const find = (id?: string) =>
      id ? this.element!.querySelector<HTMLElement>(`[data-key="${CSS.escape(id)}"]`) : null;
    const anchor =
      find(value?.id) ?? find(pending.node.id) ?? this.element.querySelector('.tl-tree');
    if (!anchor) return;
    anchor.scrollIntoView({ block: 'nearest' });
    const label =
      slot.param !== undefined
        ? word(`param.${slot.param}`)
        : pending.node.kind === 'local'
          ? pending.node.name
          : t(`slot.${slot.slot}`);
    this.menu = { kind: 'value', place: slot, label, anchor, pending: true };
    this.render();
  }

  private addEvent(event: string): void {
    const program = this.host!.program();
    const type = this.ownerType(program);
    if (!type) return;
    const change = addListener(program, type, event);
    if (this.apply(change) && change.ok && change.focus) this.openMethod(change.focus);
  }

  /** A drag from the palette or the control bar: where it would go, and putting it there. */
  private freshDrag() {
    return {
      onOver: (x: number, y: number) => {
        const tree = this.element?.querySelector<HTMLElement>('.tl-tree');
        const node = this.fresh;
        if (!tree || !node) return;
        this.dragOver(placeAt(tree, x, y, null), (at) => {
          const program = this.host!.program();
          return canDrop(program, at, readyFor(program, at, node)).ok;
        });
      },
      onEnd: (drop: boolean) => {
        this.settle();
        const node = this.fresh;
        const ask = this.freshAsk;
        const at = this.moving?.at;
        this.fresh = null;
        this.freshAsk = null;
        this.moving = null;
        if (drop && node && at) {
          if (ask) this.askFirst(ask, at);
          else this.begin(node, at);
        } else this.render();
      },
    };
  }

  private startFresh(node: Statement): void {
    this.fresh = node;
    this.startDrag(node.id);
  }

  private startDrag(node: NodeId): void {
    this.moving = { node, at: null, stops: [] };
    this.over = null;
    this.verdicts = new Map();
    this.checking = null;
    this.render();
  }

  /**
   * The pointer is over `at` during a drag. Each place is checked once, when the pointer has
   * stayed on it for a moment (`SETTLE_MS`), so sweeping across rows checks nothing and the ghost
   * keeps up with the pointer: in a long method a check takes most of a frame (spec 14, 3h).
   * Until a place has passed, it doesn't light up (3c.4).
   */
  private dragOver(at: StatementPlace | null, fits: (at: StatementPlace) => boolean): void {
    if (!this.moving) return;
    const key = at && placeKey(at);
    if (key === this.over) return;
    this.over = key;
    this.checking = null;
    const known = key === null ? false : this.verdicts.get(key);
    if (known !== undefined || !at || key === null) return this.showDrop(known ? at : null);
    this.showDrop(null);
    const check = () => {
      if (this.checking !== check) return;
      this.checking = null;
      const ok = fits(at);
      this.verdicts.set(key, ok);
      if (this.over === key) this.showDrop(ok ? at : null);
    };
    this.checking = check;
    setTimeout(check, SETTLE_MS);
  }

  /** A drop can't wait: a check still waiting is done now. */
  private settle(): void {
    this.checking?.();
  }

  private showDrop(at: StatementPlace | null): void {
    const moving = this.moving;
    if (!moving) return;
    if ((at && placeKey(at)) === (moving.at && placeKey(moving.at))) return;
    this.moving = { ...moving, at };
    this.render();
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
    const nothing = () => {
      this.menu = null;
      this.host?.announce(t('nothingAdded'));
      this.refocus = true;
      this.render();
    };
    if (menu.kind === 'variable')
      return (
        <NewVariable
          anchor={menu.anchor}
          taken={menu.taken}
          onClose={nothing}
          onMake={(name: string, type: VariableType) =>
            this.answered(newLocal(name, { kind: 'story', name: type }, idMinter(program)), menu.at)
          }
        />
      );
    if (menu.kind === 'assign')
      return (
        <ChooseVariable
          anchor={menu.anchor}
          names={menu.names}
          onClose={nothing}
          onChoose={(variable) => this.answered(newAssign(variable, idMinter(program)), menu.at)}
        />
      );
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
    const pending = menu.pending ? this.pending : null;
    const shown = pending ? pending.preview : program;
    const chosen = (value: Expression) =>
      pending
        ? this.answerPending(value)
        : this.chose(value, (menu as { place: ValuePlace }).place);
    // React Aria closes a menu after its action, by which time the next one may be open: a close
    // counts only while this menu is still the one showing.
    const closed = () => {
      if (this.menu !== menu) return;
      if (pending) this.cancelPending();
      else close();
    };
    if (menu.kind === 'ask')
      return (
        <AskValue
          program={shown}
          place={menu.place}
          ask={menu.ask}
          label={menu.label}
          anchor={menu.anchor}
          onClose={closed}
          onAnswer={chosen}
        />
      );
    // Keyed by the place, so the next question is a fresh menu that opens on its own suggestion.
    const key = [menu.place.node, menu.place.slot, menu.place.param ?? ''].join('/');
    return (
      <ValueMenu
        key={key}
        program={shown}
        place={menu.place}
        label={menu.label}
        anchor={menu.anchor}
        options={this.options}
        {...(menu.current === undefined ? {} : { current: menu.current })}
        onClose={closed}
        onChoose={chosen}
        onAsk={(ask) => {
          this.menu = {
            kind: 'ask',
            place: menu.place,
            label: menu.label,
            anchor: menu.anchor,
            ask,
            ...(pending ? { pending: true as const } : {}),
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

  /**
   * The methods panel's and the control bar's handlers, made once. They read the editor's state
   * when called, so they never go stale, and the panel and the bar, being memoised, aren't drawn
   * again when only the code changes (spec 14, 3h).
   */
  private readonly handlers = (() => {
    const drag = this.freshDrag();
    const program = () => this.host!.program();
    return {
      panel: {
        onTarget: (key: string) => {
          this.target = key;
          this.render();
        },
        onTab: (tab: PaletteTab) => {
          this.tab = tab;
          this.render();
        },
        onInsert: (item: PaletteItem) => this.insertFromPalette(item),
        drag: {
          ...drag,
          onStart: () => undefined,
          item: (item: PaletteItem) => {
            const now = program();
            const mint = idMinter(now);
            const target = this.targetExpression(now, mint);
            if (target)
              this.startFresh(newCall(now, target, item.callee, false, mint) as Statement);
          },
        },
      },
      bar: {
        onInsert: (kind: BarKind) => this.insertControl(kind),
        drag: {
          ...drag,
          onStart: (kind: string) => {
            const mint = idMinter(program());
            if (asksFirst(kind as BarKind)) {
              // Dragged as a note, which goes wherever a statement can; the question comes after.
              this.freshAsk = kind as 'variable' | 'assign';
              this.startFresh({ id: mint(), kind: 'comment', text: '' });
            } else this.startFresh(newControl(kind as ControlKind, mint));
          },
        },
      },
    };
  })();

  private render(): void {
    const host = this.host;
    if (!host || !this.root) return;
    const program = host.program();
    const type = this.ownerType(program);
    const shown = this.pending?.preview ?? program;
    const { panel, bar } = this.handlers;
    flushSync(() =>
      this.root!.render(
        <div className="tl-root tl-layout" style={tileVariables()}>
          {type ? (
            <MethodsPanel
              program={program}
              type={type}
              targets={targets(program, type)}
              target={this.target}
              tab={this.tab}
              {...panel}
            />
          ) : null}
          <div className="tl-main">
            <MethodTabs
              program={program}
              method={this.method}
              onOpen={(method) => this.openMethod(method)}
              onAddEvent={(event) => this.addEvent(event)}
            >
              <ControlBar {...bar} />
              <TilesView
                program={shown}
                method={this.method}
                focus={this.focusKey}
                highlights={this.highlights}
                {...(this.options.onRowDrawn ? { onRowDrawn: this.options.onRowDrawn } : {})}
                moving={this.moving}
                onFocus={(key, pill) => {
                  this.focusKey = key;
                  this.pill = pill ?? null;
                  this.render();
                }}
                onAction={(action, key) => void this.act(action, key)}
                onOpenValue={(pill, anchor) => this.openValue(pill, anchor)}
                onOpenDetails={(node, anchor) => {
                  this.menu = { kind: 'details', node, anchor };
                  this.render();
                }}
                onDragStart={(node) => this.startDrag(node)}
                onDragOver={(at) => {
                  const node = this.moving?.node;
                  if (!node) return;
                  this.dragOver(
                    at,
                    (p) =>
                      isWhereItIs(program, node, p) || canDrop(program, p, { existing: node }).ok,
                  );
                }}
                onDragEnd={(drop) => {
                  this.settle();
                  void (drop ? this.putDown() : this.cancelMove());
                }}
              />
            </MethodTabs>
          </div>
          {this.renderMenu(program)}
        </div>,
      ),
    );
    // A block being put in shows first, so its menu can open on the pill it asks about. It opens a
    // frame later, once the last menu has handed focus back: opened at once, the new menu would
    // keep focus on itself rather than on its suggestion.
    if (this.pending && !this.menu) {
      requestAnimationFrame(() => this.askPending());
      return;
    }
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
