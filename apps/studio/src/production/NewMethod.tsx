/**
 * **New** beside the method tabs (`07-ux.md` section 7.3; WP7.2): a procedure or a function,
 * named in a dialog, or a listener for one of the Story API's events. Each is one undo step, and
 * its tab opens.
 */
import type { NodeId } from '@storystage/ast';
import type { EditorHost } from '@storystage/editor-contract';
import { Button, Dialog, Icon, NeutralNote, Segmented, useThemeStyle } from '@storystage/ui';
import { useState, type FormEvent } from 'react';
import {
  Button as AriaButton,
  Header,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
} from 'react-aria-components';
import { SpokenField } from '../speech/SpokenField.tsx';
import { words, type WordKey } from '../strings.ts';
import {
  GIVES,
  NEW_EVENTS,
  eventWords,
  nameProblem,
  newListener,
  newMethod,
  suggestedName,
  type Declared,
  type Gives,
} from './newMethodEdits.ts';

export interface NewMethodProps {
  host: EditorHost;
  /** The scene's class, which the new method or listener joins. */
  type: NodeId;
  /** The scene's number, for the words. */
  n: number;
  /** Opens the new method's tab. */
  onAdded: (id: NodeId) => void;
}

type Making = 'procedure' | 'function';

export function NewMethod({ host, type, n, onAdded }: NewMethodProps) {
  const themeStyle = useThemeStyle();
  const [making, setMaking] = useState<Making | null>(null);
  const [name, setName] = useState('');
  const [gives, setGives] = useState<Gives>('Number');
  const [tried, setTried] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const start = (kind: Making) => {
    setMaking(kind);
    setName(
      suggestedName(host.program(), type, kind === 'procedure' ? 'newProcedure' : 'newFunction'),
    );
    setGives('Number');
    setTried(false);
    setRefusal(null);
  };

  const apply = (made: Declared | null, label: string) => {
    if (!made) return false;
    const result = host.apply([made.edit], label, 'blocks');
    if (!result.ok) {
      setRefusal(result.reason);
      host.announce(result.reason);
      return false;
    }
    host.announce(words.t('production.added', { what: label }));
    onAdded(made.id);
    return true;
  };

  const listen = (event: string) => {
    const label = words.t('production.addListener', { event: eventWords(event) });
    apply(newListener(host.program(), type, event, label), label);
  };

  const chosen = name.trim();
  const problem = making ? nameProblem(host.program(), type, chosen) : null;
  const add = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!making || problem) return;
    const label = words.t(
      making === 'procedure' ? 'production.addProcedure' : 'production.addFunction',
      { name: chosen },
    );
    const made = newMethod(
      host.program(),
      type,
      chosen,
      making === 'function' ? gives : null,
      label,
    );
    if (apply(made, label)) setMaking(null);
  };

  return (
    <>
      <MenuTrigger>
        <AriaButton className="pr-new" aria-label={words.t('production.newIn', { n })}>
          <Icon name="add" size={20} />
          {words.t('production.new')}
          <Icon name="arrow_drop_down" size={20} />
        </AriaButton>
        <Popover
          className="ss-root sb-popover pr-new-popover"
          style={themeStyle}
          placement="bottom end"
        >
          <Menu
            className="sb-menu"
            aria-label={words.t('production.newIn', { n })}
            onAction={(key) => {
              const k = String(key);
              if (k === 'procedure' || k === 'function') start(k);
              else listen(k.slice('event:'.length));
            }}
          >
            <MenuSection>
              <MenuItem id="procedure" className="sb-menu-item">
                {words.t('production.newProcedure')}
              </MenuItem>
              <MenuItem id="function" className="sb-menu-item">
                {words.t('production.newFunction')}
              </MenuItem>
            </MenuSection>
            <MenuSection>
              <Header className="pr-new-heading">{words.t('production.newListener')}</Header>
              {NEW_EVENTS.map((event) => (
                <MenuItem key={event} id={`event:${event}`} className="sb-menu-item">
                  {eventWords(event)}
                </MenuItem>
              ))}
            </MenuSection>
          </Menu>
        </Popover>
      </MenuTrigger>
      <Dialog
        isOpen={making !== null}
        onOpenChange={(open) => !open && setMaking(null)}
        title={words.t(
          making === 'function' ? 'production.newFunctionTitle' : 'production.newProcedureTitle',
        )}
        width={520}
      >
        <form className="pr-new-form" onSubmit={add}>
          <SpokenField
            field="production.newName"
            label={words.t('production.newName')}
            description={
              tried && problem
                ? words.t(`production.name.${problem}` as WordKey, { n, name: chosen })
                : words.t('production.newNameHint')
            }
            isInvalid={tried && problem !== null}
            validationBehavior="aria"
            value={name}
            onChange={(v) => {
              setName(v);
              setRefusal(null);
            }}
            autoFocus
          />
          {making === 'function' && (
            <div className="pr-new-gives">
              {/* Seen; the choices themselves are named by Segmented's own label. */}
              <span className="ss-field-label" aria-hidden="true">
                {words.t('production.gives')}
              </span>
              <Segmented
                label={words.t('production.gives')}
                options={GIVES.map((g) => ({
                  id: g,
                  label: words.t(`production.gives.${g}` as WordKey),
                }))}
                value={gives}
                onChange={setGives}
              />
            </div>
          )}
          {refusal && <NeutralNote>{refusal}</NeutralNote>}
          <div className="sb-dialog-actions">
            <Button variant="primary" icon="add" type="submit">
              {words.t('production.add')}
            </Button>
            <Button variant="secondary" onPress={() => setMaking(null)}>
              {words.t('production.cancel')}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
