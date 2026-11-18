/**
 * One tab per procedure, function and event (spec 14, 3a), and "add event ▾" to start a new event
 * handler. The open method's code is the selected tab's panel.
 *
 * The panel is the editor's own, not React Aria's `TabPanel`: that one walks every element inside
 * it, after each render and each change to the page, to see whether the panel itself needs a tab
 * stop. Over a method of 500 statements that walk was most of an edit's time with the CPU slowed
 * fourfold (spec 14, 3h.3). The code always has a tab stop of its own, so the panel never needs one.
 */
import type { NodeId, Program } from '@storystage/ast';
import { EVENTS } from '@storystage/story-api';
import { describer, fill, word } from '@storystage/story-api/editing';
import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Tab,
  TabList,
  Tabs,
} from 'react-aria-components';
import { tileVariables } from './tokens.ts';
import { t } from './words.ts';

export interface MethodTabsProps {
  readonly program: Program;
  readonly method: NodeId | null;
  readonly onOpen: (method: NodeId) => void;
  readonly onAddEvent: (event: string) => void;
  /** The open method's code. */
  readonly children: ReactNode;
  /** False in the studio, whose own tab row and New serve both editors (spec 14, 4.1). */
  readonly tabs?: boolean;
}

/** Every method and event handler in the program, with the words on its tab. */
export function methodsOf(program: Program): readonly { id: NodeId; words: string }[] {
  const describe = describer(program);
  return program.types.flatMap((type) => [
    ...type.methods.map((m) => ({
      id: m.id,
      words: t('method', { type: type.name, method: m.name }),
    })),
    ...type.listeners.map((l) => ({ id: l.id, words: describe(l) })),
  ]);
}

/**
 * Names the panel by its tab, with the id the tab's `aria-controls` gives, as React Aria's own
 * panel would be named.
 */
function link(tab: Element | null, panel: HTMLElement | null) {
  const controls = tab?.getAttribute('aria-controls');
  if (!tab || !panel || !controls) return;
  if (panel.id !== controls) panel.id = controls;
  if (panel.getAttribute('aria-labelledby') !== tab.id)
    panel.setAttribute('aria-labelledby', tab.id);
}

/** An event's words with `???` where it needs a value: "every ??? seconds". */
const eventWords = (name: string) => fill(word(`event.${name}`), {});

export function MethodTabs({
  program,
  method,
  onOpen,
  onAddEvent,
  children,
  tabs = true,
}: MethodTabsProps) {
  const methods = methodsOf(program);
  const panel = useRef<HTMLDivElement>(null);
  const selected = useRef<HTMLElement | null>(null);
  // The selected tab, linked as it's put on the page: React Aria finds its tabs in a later pass
  // than this one, so an effect here alone would run before they're there.
  const selectedTab = useCallback((tab: HTMLElement | null) => {
    selected.current = tab;
    link(tab, panel.current);
  }, []);
  // And the panel, when it's put on the page after the tab.
  useLayoutEffect(() => link(selected.current, panel.current));
  if (!tabs) return <div className="tl-method-panel">{method === null ? null : children}</div>;
  // The panel is beside `Tabs`, not in it: React Aria draws what's in `Tabs` twice, once
  // hidden to find the tabs, and its own panel draws nothing in that pass, as this one couldn't.
  return (
    <>
      <Tabs
        selectedKey={method ?? undefined}
        onSelectionChange={(key) => onOpen(String(key) as NodeId)}
        className="tl-method-tabs"
      >
        <div className="tl-method-bar">
          <TabList aria-label={t('procedures')} className="tl-tab-list">
            {methods.map((m) => (
              <Tab
                key={m.id}
                id={m.id}
                className="tl-tab tl-method-tab"
                {...(m.id === method ? { ref: selectedTab } : {})}
              >
                {m.words}
              </Tab>
            ))}
          </TabList>
          <MenuTrigger>
            <Button className="tl-add-event">
              {t('addEvent')}
              <span aria-hidden="true"> ▾</span>
            </Button>
            <Popover className="tl-popover" style={tileVariables()} placement="bottom end">
              <Menu aria-label={t('addEvent')} onAction={(key) => onAddEvent(String(key))}>
                {EVENTS.map((e) => (
                  <MenuItem key={e.name} id={e.name} className="tl-menu-item">
                    {eventWords(e.name)}
                  </MenuItem>
                ))}
              </Menu>
            </Popover>
          </MenuTrigger>
        </div>
      </Tabs>
      {method !== null && methods.some((m) => m.id === method) ? (
        <div ref={panel} role="tabpanel" className="tl-method-panel">
          {children}
        </div>
      ) : null}
    </>
  );
}
