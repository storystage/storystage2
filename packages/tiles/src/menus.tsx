/**
 * The cascade on a value pill, "Other number…", and "add detail ▾" (spec 14, 2.3 and 3e), with
 * React Aria's menus, so arrows, Enter, Escape and submenus behave as screen readers expect.
 * They open in a portal, outside the editor's root, so each carries the tile colours itself.
 */
import { idMinter } from '@storystage/ast';
import type { Expression, NodeId, Program } from '@storystage/ast';
import {
  answer,
  cascadeFor,
  detailsToAdd,
  rangeAt,
  type Ask,
  type CascadeOptions,
  type Choice,
  type ValuePlace,
} from '@storystage/story-api/editing';
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  Input,
  Label,
  Menu,
  MenuItem,
  Popover,
  SubmenuTrigger,
  TextField,
} from 'react-aria-components';
import { tileVariables } from './tokens.ts';
import { t } from './words.ts';

interface Anchored {
  /** The pill or button the menu opens from. */
  readonly anchor: Element;
  /**
   * Closed without a choice: Escape, or a click outside. Not called after a choice, an ask or
   * a removal, so a caller never has to tell React Aria's own close from the learner's.
   */
  readonly onClose: () => void;
}

/**
 * A menu's `onClose`, and a way to mark that an item has acted: React Aria closes a menu after
 * its action, and that close isn't the learner's.
 */
function useCloseUnlessActed(onClose: () => void) {
  const acted = useRef(false);
  return {
    acted: () => void (acted.current = true),
    closed: () => {
      if (!acted.current) onClose();
    },
  };
}

/** Everything a menu's popover takes but its anchor, which is passed straight in as `triggerRef`. */
const popoverProps = (onClose: () => void) =>
  ({
    isOpen: true,
    onOpenChange: (open: boolean) => {
      if (!open) onClose();
    },
    placement: 'bottom start',
    shouldFlip: true,
    className: 'tl-popover',
    style: tileVariables(),
  }) as const;

const REMOVE = 'remove';

export interface ValueMenuProps extends Anchored {
  readonly program: Program;
  readonly place: ValuePlace;
  /** What the value is for, in words ("amount"): the menu's name. */
  readonly label: string;
  readonly options?: CascadeOptions;
  /** For a detail's pill: offers taking the detail out. */
  readonly detail?: string;
  /** The words of the value there now, which the menu marks as chosen and opens on. */
  readonly current?: string;
  readonly onChoose: (value: Expression) => void;
  readonly onAsk: (ask: Ask) => void;
  readonly onRemoveDetail?: () => void;
}

/** The menu of values that fit a slot. */
export function ValueMenu(props: ValueMenuProps) {
  const { program, place, options, anchor } = props;
  const anchorRef = useRef(anchor);
  const choices = useMemo(
    () => cascadeFor(program, place, idMinter(program), options),
    [program, place, options],
  );

  // The value there now; for an empty slot, the one the cascade suggests (Alice's default).
  const now = choices.findIndex((c) => c.value && c.words === props.current);
  const chosen =
    now >= 0 || props.current !== undefined ? now : choices.findIndex((c) => c.suggested);

  const close = useCloseUnlessActed(props.onClose);
  const pick = (key: string) => {
    close.acted();
    if (key === REMOVE) return props.onRemoveDetail?.();
    let list: readonly Choice[] = choices;
    let choice: Choice | undefined;
    for (const i of key.split('.').map(Number)) {
      choice = list[i];
      list = choice?.choices ?? [];
    }
    if (choice?.value) props.onChoose(choice.value);
    else if (choice?.ask) props.onAsk(choice.ask);
  };

  const items = (list: readonly Choice[], path: string): ReactNode[] =>
    list.flatMap((c, i) => {
      const key = `${path}${i}`;
      const item = (
        <MenuItem key={key} id={key} textValue={c.words} className="tl-menu-item">
          {c.words}
        </MenuItem>
      );
      if (!c.choices) return [item];
      const sub = (
        <SubmenuTrigger key={`${key}-sub`}>
          <MenuItem
            id={`${key}-sub`}
            textValue={t('partsOf', { name: c.words })}
            className="tl-menu-item"
          >
            {t('partsOf', { name: c.words })}
          </MenuItem>
          <Popover className="tl-popover" style={tileVariables()}>
            <Menu aria-label={t('partsOf', { name: c.words })} onAction={(k) => pick(String(k))}>
              {items(c.choices, `${key}.`)}
            </Menu>
          </Popover>
        </SubmenuTrigger>
      );
      return c.value ? [item, sub] : [sub];
    });

  return (
    <Popover triggerRef={anchorRef} {...popoverProps(close.closed)}>
      <Menu
        aria-label={props.label}
        autoFocus={chosen >= 0 ? true : 'first'}
        selectionMode={chosen >= 0 ? 'single' : 'none'}
        selectedKeys={chosen >= 0 ? [String(chosen)] : []}
        onAction={(k) => pick(String(k))}
      >
        {items(choices, '')}
        {props.detail ? (
          <MenuItem id={REMOVE} className="tl-menu-item tl-menu-remove">
            {t('removeDetail', { detail: props.label })}
          </MenuItem>
        ) : null}
      </Menu>
    </Popover>
  );
}

export interface AskProps extends Anchored {
  readonly program: Program;
  readonly place: ValuePlace;
  readonly ask: Ask;
  readonly label: string;
  readonly onAnswer: (value: Expression) => void;
}

/** A value the learner types: "Other number…", "Other words…". */
export function AskValue(props: AskProps) {
  const { program, place, ask, label, anchor } = props;
  const anchorRef = useRef(anchor);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = answer(ask, text, idMinter(program), rangeAt(program, place));
    if (result.ok) props.onAnswer(result.value);
    else setProblem(result.reason);
  };
  return (
    <Popover triggerRef={anchorRef} {...popoverProps(props.onClose)}>
      <Dialog aria-label={label} className="tl-ask">
        <form onSubmit={submit}>
          <TextField
            className="tl-ask-field"
            value={text}
            onChange={(v) => {
              setText(v);
              setProblem(null);
            }}
            isInvalid={problem !== null}
            autoFocus
          >
            <Label className="tl-ask-label">{label}</Label>
            <Input className="tl-ask-input" inputMode={ask === 'text' ? 'text' : 'decimal'} />
          </TextField>
          {problem ? (
            <p role="alert" className="tl-ask-problem">
              {problem}
            </p>
          ) : null}
          <Button type="submit" className="tl-ask-ok">
            {t('use')}
          </Button>
        </form>
      </Dialog>
    </Popover>
  );
}

export interface DetailMenuProps extends Anchored {
  readonly program: Program;
  readonly node: NodeId;
  readonly onChoose: (detail: string) => void;
}

/** "add detail ▾": the details a block can still take. */
export function DetailMenu(props: DetailMenuProps) {
  const anchorRef = useRef(props.anchor);
  const details = useMemo(
    () => detailsToAdd(props.program, props.node),
    [props.program, props.node],
  );
  const close = useCloseUnlessActed(props.onClose);
  return (
    <Popover triggerRef={anchorRef} {...popoverProps(close.closed)}>
      <Menu
        aria-label={t('addDetail')}
        autoFocus="first"
        onAction={(k) => {
          close.acted();
          props.onChoose(String(k));
        }}
      >
        {details.map((d) => (
          <MenuItem key={d.name} id={d.name} className="tl-menu-item">
            {d.words}
          </MenuItem>
        ))}
      </Menu>
    </Popover>
  );
}
