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
import { parameterProblemWords, word as storyWord } from '@storystage/story-api/editing';
import {
  GIVES,
  NEW_EVENTS,
  eventWords,
  inputProblems,
  nameProblem,
  newListener,
  newMethodWithInputs,
  suggestedName,
  type Declared,
  type Gives,
  type NewInput,
} from './newMethodEdits.ts';
import { listWords } from './inputWords.ts';

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
  const [inputs, setInputs] = useState<NewInput[]>([]);
  const [tried, setTried] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const start = (kind: Making) => {
    setMaking(kind);
    setName(
      suggestedName(host.program(), type, kind === 'procedure' ? 'newProcedure' : 'newFunction'),
    );
    setGives('Number');
    setInputs([]);
    setTried(false);
    setRefusal(null);
  };

  /** A new input, named input1, input2… after the ones already there. */
  const addInput = () => {
    const taken = new Set(inputs.map((i) => i.name.trim()));
    let k = inputs.length + 1;
    while (taken.has(`input${k}`)) k++;
    setInputs([...inputs, { name: `input${k}`, type: 'Number' }]);
  };
  const changeInput = (at: number, change: Partial<NewInput>) =>
    setInputs(inputs.map((i, k) => (k === at ? { ...i, ...change } : i)));

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
  const problems = inputProblems(inputs);
  const add = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!making || problem || problems.some((p) => p !== null)) return;
    const named = inputs.map((i) => i.name.trim());
    const label =
      named.length === 0
        ? words.t(making === 'procedure' ? 'production.addProcedure' : 'production.addFunction', {
            name: chosen,
          })
        : words.t(
            making === 'procedure' ? 'production.addProcedureWith' : 'production.addFunctionWith',
            { name: chosen, inputs: listWords(named) },
          );
    const made = newMethodWithInputs(
      host.program(),
      type,
      chosen,
      making === 'function' ? gives : null,
      inputs,
      label,
    );
    if (!made) return;
    const result = host.apply(made.edits, label, 'blocks');
    if (!result.ok) {
      setRefusal(result.reason);
      host.announce(result.reason);
      return;
    }
    host.announce(words.t('production.added', { what: label }));
    onAdded(made.id);
    setMaking(null);
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
          {/* Its inputs (decision 0074): "parameter" in brackets where they're first offered. */}
          <fieldset className="pr-new-inputs">
            <legend className="ss-field-label">{words.t('production.inputs')}</legend>
            {inputs.map((input, at) => (
              <div key={at} className="pr-new-input">
                <SpokenField
                  field="production.inputName"
                  label={words.t('production.inputName', { n: at + 1 })}
                  description={
                    tried && problems[at] ? parameterProblemWords(problems[at]!) : undefined
                  }
                  isInvalid={tried && problems[at] !== null}
                  validationBehavior="aria"
                  value={input.name}
                  onChange={(v) => changeInput(at, { name: v })}
                />
                <Segmented
                  label={words.t('production.inputHolds', { n: at + 1 })}
                  options={GIVES.map((g) => ({
                    id: g,
                    label: words.t(`production.gives.${g}` as WordKey),
                  }))}
                  value={input.type}
                  onChange={(t) => changeInput(at, { type: t })}
                />
                <Button
                  variant="quiet"
                  icon="close"
                  onPress={() => setInputs(inputs.filter((_, k) => k !== at))}
                >
                  {words.t('production.inputRemove', { n: at + 1 })}
                </Button>
              </div>
            ))}
            <Button variant="secondary" icon="add" onPress={addInput}>
              {storyWord('parameter.firstOffer')}
            </Button>
          </fieldset>
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
