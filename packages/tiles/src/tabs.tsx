/**
 * One tab per procedure, function and event (spec 14, 3a), and "add event ▾" to start a new event
 * handler. The open method's code is the selected tab's panel.
 */
import type { NodeId, Program } from '@storystage/ast';
import { EVENTS } from '@storystage/story-api';
import { describer, fill, word } from '@storystage/story-api/editing';
import type { ReactNode } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Tab,
  TabList,
  TabPanel,
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

/** An event's words with `???` where it needs a value: "every ??? seconds". */
const eventWords = (name: string) => fill(word(`event.${name}`), {});

export function MethodTabs({ program, method, onOpen, onAddEvent, children }: MethodTabsProps) {
  const methods = methodsOf(program);
  return (
    <Tabs
      selectedKey={method ?? undefined}
      onSelectionChange={(key) => onOpen(String(key) as NodeId)}
      className="tl-method-tabs"
    >
      <div className="tl-method-bar">
        <TabList aria-label={t('procedures')} className="tl-tab-list">
          {methods.map((m) => (
            <Tab key={m.id} id={m.id} className="tl-tab tl-method-tab">
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
      {methods.map((m) => (
        <TabPanel key={m.id} id={m.id} className="tl-method-panel">
          {m.id === method ? children : null}
        </TabPanel>
      ))}
    </Tabs>
  );
}
