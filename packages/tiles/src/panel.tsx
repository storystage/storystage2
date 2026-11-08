/**
 * The methods panel (spec 14, 3a and 2.1): an object picker, the Actions and Questions tabs, and
 * the palette in Alice's categories. Enter or a click puts a block in; so does dragging it onto
 * the program. React Aria gives the list one tab stop, arrow keys and type-ahead.
 */
import type { NodeId, Program } from '@storystage/ast';
import { palette, type PaletteItem, type PaletteTab } from '@storystage/story-api/editing';
import { useMemo, type PointerEvent } from 'react';
import {
  Button,
  Header,
  Label,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
  Select,
  SelectValue,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from 'react-aria-components';
import { Ghost, useDragSource, type DragTarget } from './drag.tsx';
import type { Target } from './insert.ts';
import { tileVariables } from './tokens.ts';
import { t } from './words.ts';

export interface PanelProps {
  readonly program: Program;
  /** The type whose method is open: what `this` is. */
  readonly type: NodeId;
  readonly targets: readonly Target[];
  readonly target: string;
  readonly tab: PaletteTab;
  readonly onTarget: (key: string) => void;
  readonly onTab: (tab: PaletteTab) => void;
  readonly onInsert: (item: PaletteItem) => void;
  /** A drag from the palette; `item` says which block it carries. */
  readonly drag: DragTarget & { readonly item: (item: PaletteItem) => void };
}

const NO_IDS = () => 'zzzzzz' as NodeId;

export function MethodsPanel(props: PanelProps) {
  const { program, type, targets, target, tab } = props;
  const chosen = targets.find((x) => x.key === target) ?? targets[0];
  const groups = useMemo(
    () => (chosen ? palette(program, chosen.make(NO_IDS), type, tab) : []),
    [program, chosen, type, tab],
  );
  const items = new Map<string, PaletteItem>(
    groups.flatMap((g) => g.items.map((item, i): [string, PaletteItem] => [`${g.key}:${i}`, item])),
  );
  const { begin, ghost, wasDrag } = useDragSource({
    onStart: (key) => {
      const item = items.get(key);
      if (item) props.drag.item(item);
    },
    onOver: props.drag.onOver,
    onEnd: props.drag.onEnd,
  });
  // React Aria marks each option with its key, which a drag reads to know what it carries.
  const onPointerDown = (e: PointerEvent) => {
    const option = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    const key = option?.dataset['key'];
    const item = key ? items.get(key) : undefined;
    if (e.button === 0 && key && item && tab === 'actions')
      begin(key, item.words, e.clientX, e.clientY);
  };
  const objectWords = chosen?.words ?? '';

  const list = (
    <ListBox
      aria-label={t('palette', { object: objectWords })}
      className="tl-palette"
      selectionMode="none"
      onAction={(key) => {
        const item = items.get(String(key));
        if (item && !wasDrag()) props.onInsert(item);
      }}
      onPointerDownCapture={onPointerDown}
    >
      {groups.map((g) => (
        <ListBoxSection key={g.key} id={g.key} className="tl-palette-group">
          <Header className="tl-palette-heading">{g.words}</Header>
          {g.items.map((item, i) => (
            <ListBoxItem
              key={`${g.key}:${i}`}
              id={`${g.key}:${i}`}
              textValue={item.words}
              className={
                tab === 'actions' ? 'tl-palette-item tl-tile' : 'tl-palette-item tl-question'
              }
            >
              {item.words}
            </ListBoxItem>
          ))}
        </ListBoxSection>
      ))}
    </ListBox>
  );

  return (
    <div className="tl-panel">
      <Select
        className="tl-picker"
        selectedKey={chosen?.key ?? null}
        onSelectionChange={(key) => props.onTarget(String(key))}
      >
        <Label className="tl-picker-label">{t('methods')}</Label>
        <Button className="tl-object tl-picker-button">
          <SelectValue />
          <span aria-hidden="true"> ▾</span>
        </Button>
        <Popover className="tl-popover" style={tileVariables()}>
          <ListBox>
            {targets.map((x) => (
              <ListBoxItem key={x.key} id={x.key} textValue={x.words} className="tl-menu-item">
                {x.words}
              </ListBoxItem>
            ))}
          </ListBox>
        </Popover>
      </Select>
      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) => props.onTab(key as PaletteTab)}
        className="tl-palette-tabs"
      >
        <TabList aria-label={t('palette', { object: objectWords })} className="tl-tab-list">
          <Tab id="actions" className="tl-tab tl-tab-actions">
            {t('actions')}
          </Tab>
          <Tab id="questions" className="tl-tab tl-tab-questions">
            {t('questions')}
          </Tab>
        </TabList>
        <TabPanel id="actions">{tab === 'actions' ? list : null}</TabPanel>
        <TabPanel id="questions">{tab === 'questions' ? list : null}</TabPanel>
      </Tabs>
      <Ghost ghost={ghost} />
    </div>
  );
}
